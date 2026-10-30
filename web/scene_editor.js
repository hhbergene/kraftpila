// Editor-only placement and anchor previews; previews never touch the task.
(function(){
  let active = null;
  let initialized = false;
  let pointMode = null;
  let swallowRelease = false;
  let hover = null;
  let creation = null;
  let controlId = 0;
  let deferRefresh = false;
  let constructionDrag=null;
  let constructionHandle=null;
  let idEdit=null;
  const controls = new WeakMap();
  const angleControls = new WeakMap();
  const finitePos = pos => Array.isArray(pos) && pos.length >= 2 && pos.every(Number.isFinite);
  const model = () => window.sceneModel;
  const key = spec => spec ? `${spec.type}:${spec.ref}:${spec.point || spec.segment}` : '';
  function candidates(task, pointsOnly, includeNonSnapping=false){
    return (model()?.candidates(task,includeNonSnapping) || []).map(c => {
      const anchor = c.anchor || {type: c.type || c.kind, ref:c.ref, point:c.point, segment:c.segment};
      const resolved = model().resolveAnchor(task, anchor);
      return {...c, type:anchor.type, anchor, pos:resolved.pos || c.pos, segment:resolved.segment};
    }).filter(c => finitePos(c.pos) && (c.type === 'point' ||
      (!pointsOnly && c.type === 'segment' && c.segment &&
       Math.hypot(c.segment.b[0]-c.segment.a[0], c.segment.b[1]-c.segment.a[1]) > 1e-8)));
  }
  function element(tag, text, attributes = {}){
    const el = document.createElement(tag);
    if(text !== null) el.textContent = text;
    Object.assign(el, attributes);
    return el;
  }
  function row(parent, label){
    const el = element('div', null, {className:'scene-editor-row'});
    el.style.flexWrap='wrap';
    el.style.minWidth='0';
    if(label) el.appendChild(element('label', label));
    parent.appendChild(el);
    return el;
  }
  function refresh(){
    if(deferRefresh) return;
    window.updateScenePanel?.();
    window.updateAppState?.();
  }
  function edited(...parts){ window.markEdited?.(...parts); refresh(); }
  function cancel(restore = true){
    if(['free','attached','wagon'].includes(active?.mode)) window.snapIndicator=null;
    if(active?.mode==='intersection'){
      window.scenePanelHoverTarget=null;
      window.hoveredSceneElement=null;
    }
    if(active?.select?.isConnected){
      active.select.querySelector('[data-preview]')?.remove();
      if(restore) active.select.value = active.original;
      syncControl(active.select);
    }
    if(active?.control){
      active.control.list.hidden=true;
      active.control.button.setAttribute('aria-expanded','false');
    }
    active?.panel?.remove();
    active?.control?.button.removeAttribute?.('aria-activedescendant');
    active = null;
    hover = null;
    document.getElementById('btn-add-point')?.setAttribute('aria-pressed','false');
    document.getElementById('app-canvas')?.style.removeProperty('cursor');
  }
  function checkTask(){
    if(idEdit && (idEdit.task!==window.currentTask ||
      model().validateSceneId(idEdit.task,idEdit.object,idEdit.oldId))){
      closeIdEditor(false);
    }
    if(constructionDrag && (constructionDrag.task!==window.currentTask ||
      !window.currentTask?.scene?.wagons?.[constructionDrag.index]?.construction?.enabled)){
      finishConstructionDrag(true);
      window.draggingHandle=null;
    }
    if(active && (active.task !== window.currentTask || (active.alive && !active.alive()))) cancel();
    if(creation && (creation.task!==window.currentTask || !creation.task.scene.angles.includes(creation.angle))) creation=null;
  }
  function closeIdEditor(restoreFocus=true){
    const state=idEdit;
    idEdit=null;
    document.getElementById('scene-id-modal')?.classList.add('hidden');
    if(!restoreFocus || !state) return;
    const trigger=state.trigger?.isConnected ? state.trigger :
      Array.from(document.querySelectorAll('.scene-id-edit')).find(button=>button.textContent===state.object.id);
    trigger?.focus();
  }
  function validateIdDraft(){
    if(!idEdit) return false;
    const input=document.getElementById('scene-id-input');
    const error=model().validateSceneId(idEdit.task,idEdit.object,input.value);
    input.setCustomValidity(error);
    input.setAttribute('aria-invalid',String(!!error));
    document.getElementById('scene-id-error').textContent=error;
    document.getElementById('scene-id-confirm').disabled=!!error;
    document.getElementById('scene-id-save-icon').disabled=!!error;
    return !error;
  }
  function openIdEditor(object,trigger){
    const task=window.currentTask;
    const panel=document.getElementById('scene-id-modal');
    if(!panel || !task || model().validateSceneId(task,object,object.id)) return;
    cancel();
    creation=null;
    idEdit={task,object,oldId:object.id,trigger};
    document.getElementById('scene-id-old').textContent=object.id;
    document.getElementById('scene-id-cancel').textContent=`Avbryt bruk ${object.id}`;
    const input=document.getElementById('scene-id-input');
    input.value=object.id;
    panel.classList.remove('hidden');
    validateIdDraft();
    input.focus();
    input.select();
  }
  function confirmIdEditor(){
    checkTask();
    if(!idEdit || !validateIdDraft()) return;
    const state=idEdit;
    try {
      window.commitSceneId(state.task,state.object,document.getElementById('scene-id-input').value);
    }catch(error){
      if(!(error instanceof TypeError)) throw error;
      document.getElementById('scene-id-error').textContent=error.message;
      return;
    }
    closeIdEditor();
  }
  function initIdEditor(){
    const panel=document.getElementById('scene-id-modal');
    if(!panel) return;
    document.getElementById('scene-id-input').addEventListener('input',validateIdDraft);
    document.getElementById('scene-id-form').addEventListener('submit',event=>{
      event.preventDefault();
      confirmIdEditor();
    });
    document.getElementById('scene-id-save-icon').addEventListener('click',confirmIdEditor);
    document.getElementById('scene-id-cancel').addEventListener('click',()=>closeIdEditor());
    document.addEventListener('keydown',event=>{
      if(!idEdit) return;
      if(event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();
        closeIdEditor();
      }else if(panel.contains(event.target)){
        event.stopImmediatePropagation();
        if(event.key==='Enter' && !event.isComposing && event.target.tagName==='INPUT'){
          event.preventDefault();
          confirmIdEditor();
        }
      }
    },true);
  }
  function activate(config){
    cancel();
    if(!window.editorMode || !window.currentTask || !model()) return;
    active = {...config, task:window.currentTask, original:config.select?.value || '', pos:null, candidate:null};
    if(active.mode==='attached'||active.mode==='wagon'){
      window.scenePanelHoverTarget=null;
      window.hoveredSceneElement=null;
    }
    document.getElementById('app-canvas')?.style.setProperty('cursor','var(--canvas-cursor)');
  }
  function bindPicker(select, parent, config){
    select.hidden=true;
    select.tabIndex=-1;
    const button=element('button','',{type:'button',className:'scene-anchor-field'});
    const list=element('div',null,{className:'scene-anchor-list',hidden:true});
    list.id=`scene-anchor-list-${++controlId}`;
    list.setAttribute('role','listbox');
    button.setAttribute('role','combobox');
    button.setAttribute('aria-haspopup','listbox');
    button.setAttribute('aria-controls',list.id);
    button.setAttribute('aria-expanded','false');
    const control={select,button,list,config,begin:null};
    control.activeRow=null;
    control.label=parent.querySelector('label')?.textContent || 'Anker';
    list.setAttribute('aria-label',control.label);
    controls.set(select,control);
    const begin=()=>{
      if(active?.select===select){button.focus({preventScroll:true});return;}
      const options=typeof config==='function' ? config() : config;
      activate({...options,select,control});
      if(!active) return;
      showList(control);
      if(options.suggestion) setSuggestion(active,options.suggestion);
      button.focus({preventScroll:true});
      reveal(button);
    };
    control.begin=begin;
    button.addEventListener('click',begin);
    button.addEventListener('keydown',event=>{
      if(['Enter',' ','ArrowDown','ArrowUp'].includes(event.key)){
        event.preventDefault();event.stopPropagation();
        if(active?.select!==select) begin();
        else if(event.key==='Enter' || event.key===' ') confirmShown();
        else moveOption(event.key==='ArrowDown' ? 1 : -1);
      }
    });
    list.addEventListener('keydown',event=>{
      if(active?.select!==select) return;
      if(['Enter',' ','ArrowDown','ArrowUp'].includes(event.key)){
        event.preventDefault();event.stopPropagation();
        if(event.key==='Enter' || event.key===' ') confirmShown();
        else moveOption(event.key==='ArrowDown' ? 1 : -1);
      }
    });
    parent.append(button,list);
    syncControl(select);
    if(active?.angle && typeof config==='function'){
      const options=config();
      if(options.angle===active.angle && options.slot===active.slot){
        const state=active;
        state.select=select;
        state.control=control;
        showList(control);
        if(state.suggestion) setSuggestion(state,state.suggestion);
      }
    }
    select.addEventListener('change', ()=>cancel(false));
    return control;
  }
  function syncControl(select){
    const control=controls.get(select);
    if(!control) return;
    const option=Array.from(select.options).find(o=>o.value===select.value);
    control.button.textContent=option?.textContent || 'Frikoblet / fri posisjon';
    control.button.setAttribute('aria-label',`${control.label} ${control.button.textContent}`);
    const rows=Array.from(control.list.children).filter(item=>item.dataset.value!==undefined);
    const selected=control.activeRow || rows.find(item=>item.dataset.value===select.value);
    rows.forEach(item=>{
      if(item.dataset.value!==undefined) item.setAttribute('aria-selected',
        String(item===selected));
    });
  }
  function showList(control){
    control.list.replaceChildren();
    let group=null,rowIndex=0;
    control.activeRow=null;
    Array.from(control.select.options).forEach(option=>{
      if(option.dataset.preview) return;
      const nextGroup=option.parentElement?.tagName==='OPTGROUP' ? option.parentElement.label : null;
      if(nextGroup && nextGroup!==group){
        const heading=element('div',nextGroup,{className:'scene-anchor-group'});
        heading.setAttribute('role','presentation');
        control.list.appendChild(heading);
      }
      group=nextGroup;
      const item=element('button',option.value==='' ? 'Frikoble' : option.textContent,
        {type:'button',className:'scene-anchor-option'});
      item.dataset.value=option.value;
      item.id=`${control.list.id}-option-${++rowIndex}`;
      item.setAttribute('role','option');
      item.setAttribute('aria-selected',String(option.value===control.select.value));
      item.addEventListener('click',()=>chooseValue(option.value));
      item.addEventListener('mouseenter',()=>previewOption(control,item));
      item.addEventListener('focus',()=>previewOption(control,item));
      control.list.appendChild(item);
    });
    control.list.hidden=false;
    control.button.setAttribute('aria-expanded','true');
    syncControl(control.select);
  }
  function reveal(field){
    const panel=field.closest?.('#force-inputs, #scene-panel');
    if(!panel) return;
    revealIn(field,panel);
  }
  function revealIn(field,panel){
    const viewport=panel.getBoundingClientRect(),rect=field.getBoundingClientRect();
    if(rect.top<viewport.top) panel.scrollTop-=viewport.top-rect.top+4;
    else if(rect.bottom>viewport.bottom) panel.scrollTop+=rect.bottom-viewport.bottom+4;
  }
  function moveOption(delta){
    if(!active?.control) return;
    const items=Array.from(active.control.list.children).filter(item=>item.dataset.value!==undefined && !item.hidden);
    const current=active.control.activeRow ? items.indexOf(active.control.activeRow) :
      items.findIndex(item=>item.dataset.value===active.select.value);
    const item=items[Math.max(0,Math.min(items.length-1,current+delta))];
    if(!item) return;
    previewOption(active.control,item);
    if(item.getBoundingClientRect && active.control.list.getBoundingClientRect){
      revealIn(item,active.control.list);
    }
  }
  function previewOption(control,item){
      checkTask();
      if(active?.control!==control) return;
      if(control.preview){ control.preview(item); return; }
      const value=item.dataset.value;
      control.activeRow=item;
      active.candidate=candidates(active.task,active.pointsOnly).find(c=>key(c.anchor)===value) || null;
      active.pos=active.candidate?.pos || null;
      if(!active.candidate && value.startsWith('custom:')){
        const pos=value.slice(7).split(',').map(Number);
        if(finitePos(pos)) active.pos=pos;
      } else if(value==='__suggestion__') active.pos=active.suggestion?.pos || null;
      control.select.value=value;
      syncControl(control.select);
      control.button.setAttribute('aria-activedescendant',item.id);
  }
  function chooseValue(value){
    if(!active) return;
    const state=active;
    if(state.mode==='intersection'){
      state.chooseSource(value);
      return;
    }
    if(value===''){
      finishAnchor(state,null,null,false,()=>state.detach());
      return;
    }
    const candidate=candidates(state.task,state.pointsOnly).find(c=>key(c.anchor)===value);
    if(candidate) finishAnchor(state,candidate.anchor,candidate.pos,false);
    else if(value.startsWith('custom:')){
      const pos=value.slice(7).split(',').map(Number);
      if(finitePos(pos)) finishAnchor(state,{type:'custom',pos},pos,false);
    } else if(state.suggestion && value==='__suggestion__'){
      finishAnchor(state,state.suggestion.anchor,state.suggestion.pos,false);
    } else {
      // A retained binding can still be confirmed without replacing it.
      if(value===state.original) finishAnchor(state,null,null,false,()=>{});
    }
  }
  function confirmShown(){
    if(active?.mode==='intersection' && active.control){
      chooseValue(active.control.activeRow?.dataset.value ?? active.select.value);
      return;
    }
    if(active?.mode!=='anchor') return;
    if(active.suggestion && !active.candidate && active.select.value===active.suggestion.value){
      finishAnchor(active,active.suggestion.anchor,active.suggestion.pos,false);
    } else if(active.select.value==='__free_preview__' && active.pos) commit(active.pos);
    else chooseValue(active.select.value);
  }
  function setSuggestion(state,suggestion){
    const value=suggestion.anchor ? key(suggestion.anchor) : '__suggestion__';
    if(!Array.from(state.select.options).some(o=>o.value===value)){
      const option=element('option',suggestion.anchor ? suggestion.label : 'Forslag: fri posisjon',
        {value});
      option.dataset.preview='true';
      state.select.appendChild(option);
    }
    state.suggestion={...suggestion,value};
    state.select.value=value;
    if(!Array.from(state.control.list.children).some(item=>item.dataset.value===value)){
      const item=element('button',suggestion.label || 'Forslag: fri posisjon',
        {type:'button',className:'scene-anchor-option'});
      item.dataset.value=value;
      item.id=`${state.control.list.id}-suggestion`;
      item.setAttribute('role','option');
      item.addEventListener('click',()=>chooseValue(value));
      item.addEventListener('mouseenter',()=>previewOption(state.control,item));
      item.addEventListener('focus',()=>previewOption(state.control,item));
      state.control.list.appendChild(item);
    }
    syncControl(state.select);
    const selected=Array.from(state.control.list.children).find(item=>item.dataset.value===value);
    if(selected){
      state.control.button.setAttribute('aria-activedescendant',selected.id);
      if(selected.getBoundingClientRect && state.control.list.getBoundingClientRect){
        revealIn(selected,state.control.list);
      }
    }
  }
  function finishAnchor(state,spec,pos,newPoint,action,next=true){
    window.autoSave?.();
    cancel();
    if(action) action();
    else state.apply(spec,pos,newPoint);
    window.autoSave?.();
    if(next && state.angle){
      const order=['vertex','start','end'],name=order[order.indexOf(state.slot)+1];
      const control=angleControls.get(state.angle)?.[name];
      if(control) control.begin();
      else if(creation?.angle===state.angle) creation=null;
    }
  }
  function suggestLegs(angle){
    const vertex=model().resolveAnchor(window.currentTask,angle.vertex.anchor ||
      {type:'custom',pos:angle.vertex.pos}).pos;
    const directions=[];
    candidates(window.currentTask,false).filter(c=>c.type==='segment').forEach((c,index)=>{
      if(distance(vertex,c)>1e-6) return;
      const dx=c.segment.b[0]-c.segment.a[0],dy=c.segment.b[1]-c.segment.a[1],length=Math.hypot(dx,dy);
      for(const reversed of [false,true]){
        const sign=reversed ? -1 : 1;
        directions.push({...c,reversed,index,theta:Math.atan2(-sign*dy,sign*dx),
          pos:[vertex[0]+30*sign*dx/length,vertex[1]+30*sign*dy/length]});
      }
    });
    directions.sort((a,b)=>Math.abs(a.theta)-Math.abs(b.theta) || a.index-b.index);
    const start=directions[0];
    const turn=c=>((c.theta-start.theta)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
    const end=start && directions.filter(c=>key(c.anchor)!==key(start.anchor) &&
      turn(c)>1e-6 && turn(c)<Math.PI-1e-6).sort((a,b)=>turn(a)-turn(b) || a.index-b.index)[0];
    const theta=start?.theta || 0;
    const freeStart={pos:[vertex[0]+30*Math.cos(theta),vertex[1]-30*Math.sin(theta)]};
    const freeEnd={pos:[vertex[0]+30*Math.cos(theta+Math.PI/6),vertex[1]-30*Math.sin(theta+Math.PI/6)]};
    creation.suggestions={start:start || freeStart,end:end || freeEnd};
    for(const [name,suggestion] of Object.entries(creation.suggestions)){
      if(!angle[name].anchor) angle[name].pos=suggestion.pos.slice();
    }
  }
  function startAngle(angle){
    creation={task:window.currentTask,angle,suggestions:null};
    angleControls.get(angle)?.vertex.begin();
  }
  function revealSelection(item){
    const field=item.querySelector('.scene-anchor-field, input, select, textarea') ||
      item.querySelector('.scene-item-header');
    if(field) reveal(field);
  }
  function revealPoint(point){
    const index=window.currentTask.scene.points.indexOf(point);
    const item=document.querySelector?.(`.scene-item[data-type="point"][data-index="${index}"]`);
    if(item) revealSelection(item);
  }
  function distance(pos, c){
    if(c.type === 'point') return Math.hypot(pos[0]-c.pos[0],pos[1]-c.pos[1]);
    const {a,b} = c.segment;
    const dx=b[0]-a[0], dy=b[1]-a[1], len=dx*dx+dy*dy;
    const u=Math.max(0,Math.min(1,((pos[0]-a[0])*dx+(pos[1]-a[1])*dy)/len));
    return Math.hypot(pos[0]-a[0]-u*dx,pos[1]-a[1]-u*dy);
  }
  function nearest(pos, list){
    return list.map(c => ({c,d:distance(pos,c)})).filter(x => x.d <= (x.c.type === 'point' ? 14 : 9))
      .sort((a,b) => (a.c.type === 'point' ? 0 : 1)-(b.c.type === 'point' ? 0 : 1) || a.d-b.d)[0]?.c || null;
  }
  function preview(pos){
    checkTask();
    if(!active) return;
    active.pos = pos;
    if(active.mode==='free'){
      active.pos=snapFreePoint(pos);
      return;
    }
    if(active.mode==='intersection'){
      active.previewSource(active.slot===null ? null : nearestSource(active,pos));
      active.hoveredHit=nearestIntersectionHit(active,pos);
      return;
    }
    if(active.mode==='attached'||active.mode==='wagon'){
      active.candidate=nearestTrackHit(pos,active.trackSources);
      window.snapIndicator=active.candidate?.snapped ? {pos:active.candidate.pos} : null;
      return;
    }
    if(active.mode !== 'anchor') return;
    active.candidate = nearest(pos,candidates(active.task,active.pointsOnly));
    const select = active.select;
    if(select?.isConnected){
      select.querySelector('[data-preview]')?.remove();
      const value = active.candidate ? key(active.candidate.anchor) : '__free_preview__';
      if(!Array.from(select.options).some(o => o.value === value)){
        const option = element('option', active.candidate?.label || `Fritt punkt (${pos.map(n=>n.toFixed(1)).join(', ')})`, {value});
        option.dataset.preview = 'true';
        select.appendChild(option);
      }
      select.value = value;
      syncControl(select);
    }
  }
  function commit(pos){
    checkTask();
    if(!active) return;
    const state=active;
    if(state.mode==='attached'||state.mode==='wagon'){
      const hit=nearestTrackHit(pos,state.trackSources);
      if(!hit)return;
      window.setLastCanvasCoordinates?.(hit.pos);
      window.autoSave?.();
      cancel();
      if(state.mode==='attached'){
        const point=state.editPoint||model().createAttachedPoint(state.task,hit.source,hit.pos);
        if(state.editPoint){
          model().setPointAttachment(state.task,point,hit.source,hit.pos);
        }
        model().update(state.task);
        window.selectedSceneElement={type:'point',index:state.task.scene.points.indexOf(point),obj:point};
      }else{
        const point=model().createAttachedPoint(state.task,hit.source,hit.pos);
        const wagon=model().createWagon(state.task,point);
        window.selectedSceneElement={type:'wagon',index:state.task.scene.wagons.indexOf(wagon),obj:wagon};
      }
      edited('task');
      window.updateAppState?.();
      window.autoSave?.();
      return;
    }
    if(state.mode === 'intersection'){
      const hit=nearestIntersectionHit(state,pos);
      if(hit){
        window.setLastCanvasCoordinates?.(hit.pos);
        confirmIntersection(state,hit);
        return;
      }
      if(state.slot!==null){
        const source=nearestSource(state,pos);
        if(source) state.chooseSource(String(state.geometries.indexOf(source)));
      }
      return;
    }
    if(state.mode === 'anchor'){
      const candidate=nearest(pos,candidates(state.task,state.pointsOnly));
      window.setLastCanvasCoordinates?.(candidate?.pos || pos);
      finishAnchor(state,null,null,false,()=>{
        const spec=candidate ? candidate.anchor : {type:'custom',pos:pos.slice()};
        state.apply(spec,candidate?.pos || pos,false);
      });
      return;
    }
    pos=snapFreePoint(pos);
    window.setLastCanvasCoordinates?.(pos);
    window.autoSave?.();
    cancel();
    const point=model().createPoint(state.task,pos.slice());
    window.selectedSceneElement={type:'point',index:state.task.scene.points.indexOf(point),obj:point};
    edited('task');
    revealPoint(point);
    window.autoSave?.();
  }
  function snapFreePoint(pos){
    const result=window.snapping.snap(pos,{
      points:window.snapPoints,forces:window.fm?.forces || [],
      gridStep:window.GRID_STEP,origin:window.DRAW_CENTER
    });
    window.snapIndicator=result.source ? {pos:result.pos} : null;
    return result.pos;
  }
  function fillSelect(select, list, selected,reference){
    select.replaceChildren(element('option','Frikoble / fri posisjon',{value:''}));
    const ordered=model().orderAnchors(window.currentTask,list,reference);
    if(ordered.nearest.length){
      const group=element('optgroup',null,{label:'5 nærmeste'});
      ordered.nearest.forEach(({candidate,distance})=>group.appendChild(element('option',
        `${model().anchorLabel(candidate)} (${Math.round(distance)}px)`,{value:key(candidate.anchor)})));
      select.appendChild(group);
    }
    const group=element('optgroup',null,{label:'Alle ankrene'});
    ordered.all.forEach(c=>group.appendChild(element('option',model().anchorLabel(c),{value:key(c.anchor)})));
    select.appendChild(group);
    if(selected && !Array.from(select.options).some(o=>o.value===selected)){
      select.appendChild(element('option','Behold kobling',{value:selected}));
    }
    select.value=selected || '';
  }
  function numberField(parent, label, value, apply, options = {}){
    const {row:targetRow,...inputOptions}=options;
    const r=targetRow || row(parent,label);
    if(targetRow && label) r.appendChild(element('label',label));
    const input=element('input',null,{type:'number',value:String(value ?? ''),step:'any',...inputOptions});
    input.className=inputOptions.className || 'scene-editor-input scene-coordinate-input';
    r.appendChild(input);
    function applyWithoutPanelRebuild(value){
      const wasDeferred=deferRefresh;
      deferRefresh=true;
      try{
        apply(value);
      } finally {
        deferRefresh=wasDeferred;
      }
      if(!wasDeferred) window.updateAppState?.({preserveScenePanel:true});
    }
    input.addEventListener('change',()=>{
      if(options.allowBlank && input.value.trim()===''){
        input.setCustomValidity('');
        applyWithoutPanelRebuild(undefined);
        return;
      }
      const v=Number(input.value);
      const valid=input.value.trim() !== '' && Number.isFinite(v) &&
        (options.min === undefined || v >= Number(options.min)) &&
        (options.max === undefined || v <= Number(options.max));
      if(!valid){
        input.setCustomValidity('Oppgi en gyldig, endelig verdi innenfor intervallet.');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      applyWithoutPanelRebuild(v);
    });
    return input;
  }
  function checkbox(parent,label,value,apply){
    const r=row(parent,label), input=element('input',null,{type:'checkbox',checked:!!value});
    r.appendChild(input);
    input.addEventListener('change',()=>apply(input.checked));
    return r;
  }
  function anchorFields(parent, angle, name, label){
    const slot=angle[name];
    if(slot.detachedReason){
      const notice=row(parent,'Frikoblet:');
      notice.appendChild(element('span',slot.detachedReason));
    }
    const list=candidates(window.currentTask,name === 'vertex',true);
    const r=row(parent,label), select=element('select',null,{className:'scene-angle-anchor-select'});
    select.style.minWidth='0';
    select.style.width='100%';
    select.style.flex='1 1 100%';
    r.appendChild(select);
    let reference=null;
    const others=name==='vertex' ? ['start','end'] : ['vertex'];
    const positions=others.filter(field=>angle[field].anchor)
      .map(field=>model().resolveAnchor(window.currentTask,angle[field].anchor).pos).filter(finitePos);
    if(positions.length===others.length || (name==='vertex' && positions.length)){
      reference=positions.reduce((sum,pos)=>[sum[0]+pos[0]/positions.length,sum[1]+pos[1]/positions.length],[0,0]);
    }
    fillSelect(select,list,key(slot.anchor),reference);
    function apply(spec,pos){
      slot.pos=pos.slice();
      if(spec) slot.anchor={...spec};
      else delete slot.anchor;
      delete slot.detachedReason;
      if(name==='vertex' && creation?.angle===angle) suggestLegs(angle);
      edited('task');
    }
    function detach(){
      cancel();
      const resolved=slot.anchor && model().resolveAnchor(window.currentTask,slot.anchor);
      let pos=finitePos(resolved?.pos) ? resolved.pos : slot.pos;
      if(resolved?.segment && name !== 'vertex'){
        const vertex=model().resolveAnchor(window.currentTask,angle.vertex.anchor || {type:'custom',pos:angle.vertex.pos}).pos || angle.vertex.pos;
        const {a,b}=resolved.segment;
        const sign=angle[name+'Reversed'] ? -1 : 1;
        pos=[vertex[0]+sign*(b[0]-a[0]),vertex[1]+sign*(b[1]-a[1])];
        angle[name+'Reversed']=false;
      }
      apply(null,pos);
    }
    const config=()=>({mode:'anchor',pointsOnly:name==='vertex',angle,slot:name,detach,
      suggestion:creation?.angle===angle ? creation.suggestions?.[name] : null,
      alive:()=>window.currentTask?.scene?.angles?.includes(angle),
      apply:(spec,pos)=>{
        if(creation?.angle===angle && name!=='vertex'){
          const suggestion=creation.suggestions?.[name];
          angle[name+'Reversed']=!!(suggestion?.anchor && key(suggestion.anchor)===key(spec) && suggestion.reversed);
        }
        apply(spec,pos);
      }});
    const control=bindPicker(select,r,config);
    if(!angleControls.has(angle)) angleControls.set(angle,{});
    angleControls.get(angle)[name]=control;
    select.addEventListener('change',()=>{
      const c=list.find(c=>key(c.anchor)===select.value);
      if(c) apply(c.anchor,c.pos);
      else if(!select.value) detach();
    });
    const coords=row(parent,'x / y:');
    for(let axis=0;axis<2;axis++){
      const input=numberField(coords,'',slot.pos?.[axis] ?? 0,v=>{
        slot.pos[axis]=v; edited('task');
      });
      input.disabled=!!slot.anchor;
      input.title=slot.anchor ? 'Frikoble før fri flytting.' : 'Fri posisjon uten snapping.';
    }
    if(name !== 'vertex' && slot.anchor?.type === 'segment'){
      checkbox(parent,'Snu retning',angle[name+'Reversed'],v=>{angle[name+'Reversed']=v; edited('task');});
    }
  }
  function buildProperties(parent,type,obj,index){
    parent.style.minWidth='0';
    parent.style.overflowWrap='anywhere';
    let inlineDeleteRow=null;
    if(type==='wagon'){
      checkbox(parent,'Sirkelkonstruksjon',obj.construction?.enabled===true,value=>{
        window.autoSave?.();
        if(value){
          try { model().enableWagonConstruction(window.currentTask,obj); }
          catch(error){
            if(!(error instanceof TypeError)) throw error;
            window.alert(error.message);
            refresh();
            return;
          }
        }else obj.construction={...obj.construction,enabled:false};
        edited('task');
        window.autoSave?.();
      });
      if(obj.construction?.enabled){
        const cardinal=element('select',null);
        for(const [value,label] of [['top','Topp'],['bottom','Bunn'],['left','Venstre'],['right','Høyre']]){
          cardinal.appendChild(element('option',label,{value}));
        }
        cardinal.value=obj.construction.cardinal;
        row(parent,'Ytterpunkt Q:').appendChild(cardinal);
        cardinal.addEventListener('change',()=>{
          obj.construction.cardinal=cardinal.value;edited('task');
        });
        const handles=row(parent,'Håndtak:');
        for(const name of ['C','P','Q','O']){
          const button=element('button',name,{type:'button',title:{
            C:'Vognsenter',P:'Festepunkt',Q:'Ytterpunkt – flytt samlet',O:'Sirkelsenter – flytt samlet'
          }[name]});
          button.setAttribute('aria-pressed',String(constructionHandle===name));
          button.addEventListener('click',()=>{constructionHandle=constructionHandle===name?null:name;refresh();});
          handles.appendChild(button);
        }
      }
      const points=(window.currentTask?.scene?.points||[]).filter(point=>point?.type==='attached');
      const select=element('select',null,{className:'scene-editor-input'});
      select.appendChild(element('option','Velg festet punkt',{value:''}));
      points.forEach(point=>select.appendChild(element('option',
        `${point.id} (${finitePos(point.pos)?point.pos.map(n=>n.toFixed(1)).join(', '):'ugyldig posisjon'})`,
        {value:point.id})));
      select.value=obj.pointId||'';
      row(parent,'Festet punkt:').appendChild(select);
      select.addEventListener('change',()=>{
        obj.pointId=select.value||null;
        model().update(window.currentTask);
        edited('task');
      });
      numberField(parent,'Halv-bredde:',obj.halfWidth ?? 20,v=>{obj.halfWidth=v;edited('task');},{min:'0.1'});
      numberField(parent,'Høyde:',obj.height ?? 16,v=>{obj.height=v;edited('task');},{min:'0.1'});
      const side=element('select',null,{className:'scene-editor-input'});
      side.append(element('option','Utside / normal side',{value:'outside'}),
        element('option','Innside / motsatt side',{value:'inside'}));
      side.value=obj.side==='inside'?'inside':'outside';
      row(parent,'Side:').appendChild(side);
      side.addEventListener('change',()=>{obj.side=side.value;edited('task');});
      const color=element('input',null,{type:'color',value:obj.color||'#333333',className:'scene-color-input'});
      row(parent,'Farge:').appendChild(color);
      color.addEventListener('change',()=>{obj.color=color.value;edited('task');});
      numberField(parent,'Linje px:',obj.lineWidth??2,v=>{obj.lineWidth=v;edited('task');},{min:'0.5',max:'10'});
      checkbox(parent,'Synlig for eleven',obj.visible!==false,v=>{obj.visible=v;edited('task');});
      inlineDeleteRow=checkbox(parent,'Snap',obj.snapping!==false,v=>{obj.snapping=v;edited('task');});
      model().update(window.currentTask);
      if(obj.valid===false) row(parent,'Ugyldig vogn:').appendChild(element('span',obj.reason||'Sjekk spor og mål.'));
    }else if(type === 'angle'){
      anchorFields(parent,obj,'vertex','Toppunkt:');
      anchorFields(parent,obj,'start','Start:');
      anchorFields(parent,obj,'end','Slutt:');
      const symbol=element('input',null,{type:'text',value:obj.symbol ?? 'α'});
      symbol.style.minWidth='0';
      symbol.style.width='100%';
      symbol.style.flex='1 1 100%';
      row(parent,'Symbol/tekst:').appendChild(symbol);
      symbol.addEventListener('change',()=>{obj.symbol=symbol.value; edited('task');});
      checkbox(parent,'Vis grader',obj.showDegrees,v=>{obj.showDegrees=v; edited('task');});
      symbol.title='F.eks. \\alpha=30\\deg eller α=30°. Slå av Vis grader for bare egen tekst.';
      numberField(parent,'Radius:',obj.radius ?? 40,v=>{obj.radius=v; edited('task');},{min:'1'});
      numberField(parent,'Tekststørrelse:',obj.size ?? 16,v=>{obj.size=v; edited('task');},{min:'1'});
      numberField(parent,'Linjetykkelse:',obj.lineWidth ?? 2,v=>{obj.lineWidth=v; edited('task');},{min:'0.1'});
      const color=element('input',null,{type:'color',value:obj.color || '#222222'});
      row(parent,'Farge:').appendChild(color);
      color.addEventListener('change',()=>{obj.color=color.value; edited('task');});
      const style=element('select',null);
      style.style.minWidth='0';
      style.style.flex='1 1 80px';
      style.append(element('option','Heltrukken',{value:'solid'}),element('option','Stiplet',{value:'dashed'}));
      style.value=obj.body || 'solid';
      row(parent,'Stil:').appendChild(style);
      style.addEventListener('change',()=>{obj.body=style.value; edited('task');});
    } else {
      if(obj.type === 'free'){
        const coordinates=row(parent,'O:');
        coordinates.className+=' scene-point-coordinate-row';
        numberField(parent,'x:',obj.pos[0],v=>{obj.pos[0]=v; edited('task');},
          {row:coordinates,className:'scene-editor-input scene-point-coordinate-input'});
        numberField(parent,'y:',obj.pos[1],v=>{obj.pos[1]=v; edited('task');},
          {row:coordinates,className:'scene-editor-input scene-point-coordinate-input'});
      } else if(obj.type === 'intersection'){
        row(parent,'Type:').appendChild(element('span','Skjæringspunkt'));
        (obj.sources || []).forEach(source=>row(parent,'Geometri:').appendChild(element('span',`${source.ref} ${source.segment || ''}`)));
      } else {
        row(parent,'Type:').appendChild(element('span','Festet punkt'));
        row(parent,'Geometri:').appendChild(element('span',
          `${obj.attachment?.ref||'Ukjent kilde'} ${obj.attachment?.segment||''}`));
        if(obj.valid===false) row(parent,'Status:').appendChild(element('span',obj.reason||'Kilden er ugyldig.'));
      }
      const convert=element('button',obj.type==='intersection'
        ? 'Gjør om til fritt punkt' : obj.type==='attached'
          ? 'Løsne fra sporet' : 'Gjør om til skjæringspunkt',{type:'button'});
      convert.addEventListener('click',()=>{
        if(obj.type==='free'){
          startIntersection(obj);
          return;
        }
        const pos=finitePos(obj.pos) ? obj.pos : obj.lastValidPos;
        if(!finitePos(pos)){
          window.alert?.('Punktet har ingen gyldig posisjon som kan beholdes.');
          return;
        }
        obj.pos=pos.slice();
        obj.type='free';
        delete obj.attachment;
        delete obj.sources;
        delete obj.branch;
        delete obj.lastValidPos;
        delete obj._deletedSource;
        model().update(window.currentTask);
        edited('task');
      });
      parent.appendChild(convert);
      if(obj.type==='free'||obj.type==='attached'){
        const attach=element('button',obj.type==='attached'?'Velg nytt sporsted':'Fest til spor',{type:'button'});
        attach.addEventListener('click',()=>startAttachedPoint(obj));
        parent.appendChild(attach);
      }
      if(obj.type==='intersection'){
        const change=element('button','Velg skjæring på nytt',{type:'button'});
        change.addEventListener('click',()=>startIntersection(obj));
        parent.appendChild(change);
      }
      {
        const sizeStyle=row(parent,'Størrelse:');
        numberField(parent,'',obj.size ?? 4,v=>{obj.size=v; edited('task');},
          {row:sizeStyle,min:'1',max:'30',className:'scene-editor-input scene-point-size-input'});
        sizeStyle.appendChild(element('label','Stil:',{className:'scene-inline-label'}));
        const markerStyle=element('select',null,{value:obj.markerStyle || 'circle',
          'aria-label':'Punktstil',title:'Sirkel, fylt sirkel, firkant eller kryss'});
        markerStyle.className='scene-editor-input scene-point-style-input';
        markerStyle.append(
          element('option','○',{value:'circle',title:'Sirkel'}),
          element('option','●',{value:'filled',title:'Fylt sirkel'}),
          element('option','□',{value:'square',title:'Firkant'}),
          element('option','×',{value:'cross',title:'Kryss'})
        );
        markerStyle.value=obj.markerStyle || 'filled';
        sizeStyle.appendChild(markerStyle);
        markerStyle.addEventListener('change',()=>{obj.markerStyle=markerStyle.value; edited('task');});
      }
      {
        const color=element('input',null,{type:'color',value:obj.color || '#222222',className:'scene-color-input'});
        row(parent,'Farge:').appendChild(color);
        color.addEventListener('change',()=>{obj.color=color.value; edited('task');});
        const fillColor=element('input',null,{type:'color',value:obj.fill_color || '#ffeb3b',className:'scene-color-input'});
        row(parent,'Fyllfarge:').appendChild(fillColor);
        fillColor.addEventListener('change',()=>{obj.fill_color=fillColor.value; edited('task');});
        numberField(parent,'Linje px:',obj.lineWidth ?? 1.5,v=>{obj.lineWidth=v; edited('task');},{min:'0.5',max:'10',className:'scene-editor-input scene-line-width'});
      }
      checkbox(parent,'Synlig for eleven',obj.visible,v=>{obj.visible=v; edited('task');});
      inlineDeleteRow=checkbox(parent,'Snap',obj.snapping!==false,v=>{obj.snapping=v; edited('task');});
    }
    const remove=element('button','🗑️',{type:'button',className:'scene-delete-element-btn',
      title:`Slett ${type}`, 'aria-label':`Slett ${type}`});
    remove.addEventListener('click',()=>{
      cancel();
      if(type==='wagon'){
        const idx=window.currentTask.scene.wagons?.indexOf(obj)??-1;
        if(idx<0)return;
        model().deleteWagon(window.currentTask,obj,idx);
        window.selectedSceneElement=null;
        edited('task','forces');
        return;
      }
      const array=window.currentTask.scene[type+'s'], idx=array.indexOf(obj);
      if(idx < 0) return;
      model().remapReferences(window.currentTask,type,idx,'delete');
      array.splice(idx,1);
      window.selectedSceneElement=null;
      edited('task','forces');
    });
    if(inlineDeleteRow) inlineDeleteRow.appendChild(remove);
    else parent.appendChild(remove);
  }
  function confirmIntersection(state,hit){
    window.autoSave?.();
    const point=state.editPoint || model().createPoint(state.task,hit.pos);
    point.type='intersection';
    point.sources=hit.sources.map(s=>({...s}));
    point.branch=JSON.parse(JSON.stringify(hit.branch || {params:hit.params}));
    point.pos=hit.pos.slice();
    point.lastValidPos=hit.pos.slice();
    window.setLastCanvasCoordinates?.(hit.pos);
    cancel();
    model().update(state.task);
    window.selectedSceneElement={type:'point',index:state.task.scene.points.indexOf(point),obj:point};
    edited('task');
    revealPoint(point);
    window.autoSave?.();
  }
  function startIntersection(editPoint){
    activate({mode:'intersection',editPoint,alive:editPoint ? ()=>window.currentTask?.scene?.points?.includes(editPoint) : null});
    if(!active) return;
    setPointMode('intersection');
    document.getElementById('btn-add-point')?.setAttribute('aria-pressed','true');
    const state=active, panel=element('div',null,{className:'scene-item selected scene-intersection-picker'});
    panel.style.minWidth='0';
    panel.style.overflowWrap='anywhere';
    state.panel=panel;
    const scene=state.task.scene;
    const sources=model().geometries(state.task);
    const owners=new Map();
    for(const type of ['plane','rect','segment','ellipse']){
      for(const [index,obj] of (scene[type==='ellipse' ? 'ellipses' : type+'s'] || []).entries()){
        owners.set(obj.id,{type,index});
      }
    }
    state.geometries=sources.filter(source=>owners.has(source.ref)).map(source=>({
      ...source,owner:owners.get(source.ref),
      segments:source.curve ? window.geometry.sampleEllipse(source.value) : [[source.value.a,source.value.b]]
    }));
    state.slot=null;
    state.previewGeometries=[];
    state.hits=[];
    state.matches=[];
    panel.appendChild(element('strong',editPoint
      ? 'Punkt – velg skjæring på nytt' : 'Nytt skjæringspunkt – velg to geometrier'));
    const sourceControls=[];
    const selects=[0,1].map(i=>{
      const select=element('select',null);
      select.hidden=true;
      select.tabIndex=-1;
      select.appendChild(element('option','Velg geometri',{value:''}));
      state.geometries.forEach((s,j)=>select.appendChild(element('option',s.label || s.key,{value:String(j)})));
      if(editPoint?.sources?.[i]){
        const idx=state.geometries.findIndex(s=>JSON.stringify(s.source)===JSON.stringify(editPoint.sources[i]));
        if(idx>=0) select.value=String(idx);
      }
      const parent=row(panel,`Kilde ${i+1}:`);
      parent.appendChild(select);
      const button=element('button','Velg geometri',{type:'button',className:'scene-anchor-field'});
      const list=element('div',null,{className:'scene-anchor-list',hidden:true});
      list.id=`scene-source-list-${++controlId}`;
      list.setAttribute('role','listbox');
      list.setAttribute('aria-label',`Kilde ${i+1}`);
      button.setAttribute('role','combobox');
      button.setAttribute('aria-haspopup','listbox');
      button.setAttribute('aria-controls',list.id);
      button.setAttribute('aria-expanded','false');
      const control={select,button,list,label:`Kilde ${i+1}`,activeRow:null,
        preview:item=>state.previewSource(item.dataset.value==='' ? null : state.geometries[Number(item.dataset.value)] || null)};
      controls.set(select,control);
      sourceControls.push(control);
      parent.append(button,list);
      button.addEventListener('click',()=>openSource(i));
      const onKey=event=>{
        if(!['Enter',' ','ArrowDown','ArrowUp'].includes(event.key)) return;
        event.preventDefault();event.stopPropagation();
        if(state.slot!==i) openSource(i);
        else if(event.key==='Enter' || event.key===' ') confirmShown();
        else moveOption(event.key==='ArrowDown' ? 1 : -1);
      };
      button.addEventListener('keydown',onKey);
      list.addEventListener('keydown',onKey);
      list.addEventListener('mouseleave',()=>state.previewSource(null));
      syncControl(select);
      return select;
    });
    const message=element('div','Velg første geometri.');
    message.setAttribute('role','status');
    panel.append(message,element('span','Ett treff velges automatisk. Ved flere treff: klikk ønsket handle i scenen. Esc avbryter.'));
    function calculate(first){
      state.matches=[];
      state.hits=[];
      state.hoveredHit=null;
      selects[1].value='';
      syncControl(selects[1]);
      for(const second of state.geometries){
        if(second.key===first.key) continue;
        const result=model().intersections(state.task,first.source,second.source);
        if(result.reason) continue;
        const hits=(result.hits || []).filter(hit=>finitePos(hit.pos)).map(hit=>({
          ...hit,sources:[first.source,second.source],source:second
        }));
        if(hits.length) state.matches.push({source:second,hits});
      }
      state.hits=state.matches.flatMap(match=>match.hits);
      const select=selects[1];
      select.replaceChildren(element('option','Velg geometri',{value:''}));
      for(const {source} of state.matches){
        select.appendChild(element('option',source.label || source.key,
          {value:String(state.geometries.indexOf(source))}));
      }
      select.value='';
      syncControl(select);
      message.textContent=state.hits.length
        ? `${state.hits.length} skjæringstreff – velg geometri eller klikk et handle.`
        : 'Ingen andre geometrier har en isolert skjæring med denne. Velg en annen første geometri.';
    }
    function closeSources(){
      sourceControls.forEach(control=>{
        control.list.hidden=true;
        control.button.setAttribute('aria-expanded','false');
        control.button.removeAttribute?.('aria-activedescendant');
      });
      state.control=null;
      state.select=null;
      state.slot=null;
      state.previewGeometries=[];
      state.hoveredHit=null;
    }
    function openSource(i,subset){
      if(active!==state) return;
      if(i===1 && selects[0].value==='') i=0;
      if(i===0) state.hits=[];
      else if(selects[1].value!==''){
        state.hits=state.matches.flatMap(match=>match.hits);
        selects[1].value='';
        syncControl(selects[1]);
      }
      closeSources();
      state.slot=i;
      const control=sourceControls[i];
      state.control=control;
      state.select=control.select;
      state.original=control.select.value;
      showList(control);
      for(const item of control.list.children){
        if(item.dataset.value==='') item.hidden=true;
        else if(subset) item.hidden=!subset.includes(state.geometries[Number(item.dataset.value)]);
      }
      control.button.focus({preventScroll:true});
      reveal(control.button);
    }
    state.previewSource=source=>{
      state.previewGeometries=source ? [source] : [];
      const control=state.control;
      if(!control) return;
      control.activeRow=source ? Array.from(control.list.children)
        .find(item=>item.dataset.value===String(state.geometries.indexOf(source))) : null;
      syncControl(control.select);
      if(control.activeRow) control.button.setAttribute('aria-activedescendant',control.activeRow.id);
      else control.button.removeAttribute?.('aria-activedescendant');
    };
    state.chooseSource=value=>{
      if(active!==state || state.slot===null || value==='') return;
      const source=state.geometries[Number(value)];
      if(!source || !selectableSources(state).includes(source)) return;
      const slot=state.slot;
      selects[slot].value=value;
      syncControl(selects[slot]);
      if(slot===0){
        calculate(source);
        if(state.hits.length===1){confirmIntersection(state,state.hits[0]);return;}
        openSource(1);
      }
      else {
        state.hits=state.matches.find(match=>match.source===source).hits;
        if(state.hits.length===1){confirmIntersection(state,state.hits[0]);return;}
        closeSources();
        message.textContent=`${state.hits.length} skjæringstreff – klikk ønsket handle i scenen.`;
        reveal(message);
        sourceControls[1].button.focus({preventScroll:true});
      }
    };
    state.openSource=openSource;
    selects.forEach((select,i)=>select.addEventListener('change',()=>{
      if(active!==state) return;
      const value=select.value;
      openSource(i);
      state.chooseSource(value);
    }));
    (document.getElementById('scene-panel') || document.body).appendChild(panel);
    window.setActivePanel?.('scene');
    window.scenePanelHoverTarget=null;
    window.hoveredSceneElement=null;
    window.fm?.setHoverCandidate?.(null);
    openSource(0);
  }
  function selectableSources(state){
    return state.slot===0 ? state.geometries : state.matches.map(match=>match.source);
  }
  function nearestIntersectionHit(state,pos){
    if(state.slot===0) return null;
    return state.hits.map(hit=>({hit,distance:Math.hypot(pos[0]-hit.pos[0],pos[1]-hit.pos[1])}))
      .filter(item=>item.distance<=14).sort((a,b)=>a.distance-b.distance)[0]?.hit || null;
  }
  function nearestSource(state,pos){
    return selectableSources(state).map(source=>({source,distance:source.segments.reduce((nearest,[a,b])=>
      Math.min(nearest,window.geometry.distPointToSegment(pos,a,b)),Infinity)}))
      .filter(hit=>hit.distance<=9).sort((a,b)=>a.distance-b.distance)[0]?.source || null;
  }
  function sceneSources(type,index){
    return selectableSources(active).filter(source=>source.owner.type===type && source.owner.index===index);
  }
  function previewSceneSource(type,index,inside){
    checkTask();
    if(active?.mode!=='intersection' || active.slot===null) return false;
    active.previewSource(null);
    active.previewGeometries=inside ? sceneSources(type,index) : [];
    if(active.previewGeometries.length===1) active.previewSource(active.previewGeometries[0]);
    return true;
  }
  function chooseSceneSource(type,index){
    checkTask();
    if(active?.mode!=='intersection' || active.slot===null) return false;
    const sources=sceneSources(type,index);
    if(sources.length===1) active.chooseSource(String(active.geometries.indexOf(sources[0])));
    else if(sources.length>1) active.openSource(active.slot,sources);
    return true;
  }
  function setPointMode(mode){
    pointMode=mode;
    const button=document.getElementById('btn-add-point');
    if(!button) return;
    button.title=mode==='free' ? 'Fritt punkt – følger snapping' :
      mode==='attached' ? 'Festet punkt – velg ellipse, segment eller rektangelside' :
        'Skjæringspunkt – velg geometrier';
    button.dataset.mode=mode;
    button.innerHTML=mode==='free' ? '●' : mode==='attached' ? '⊙' :
      '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h20M4 22Q4 10 20 6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="12" r="2.5" fill="currentColor"/></svg>';
    button.setAttribute('aria-label',button.title);
  }
  function trackSources(task){
    const geometries=model().geometries(task);
    const scene=task.scene;
    const owners=new Map();
    for(const [type,collection] of [['ellipse','ellipses'],['rect','rects'],['segment','segments']]){
      (scene[collection]||[]).forEach(obj=>owners.set(obj.id,type));
    }
    return geometries.filter(source=>owners.has(source.ref)).map(source=>({...source,
      segments:source.curve ? window.geometry.sampleEllipse(source.value) : [[source.value.a,source.value.b]]
    }));
  }
  function projectTrackHit(pos,sources){
    let best=null;
    for(const source of sources||[]){
      for(const [a,b] of source.segments||[]){
        const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
        const u=den>0?Math.max(0,Math.min(1,((pos[0]-a[0])*dx+(pos[1]-a[1])*dy)/den)):0;
        const projected=[a[0]+u*dx,a[1]+u*dy],distance=Math.hypot(pos[0]-projected[0],pos[1]-projected[1]);
        if(!best||distance<best.distance){
          let exact=projected;
          if(source.curve){
            const angle=window.geometry.ellipseParameter(source.value,projected);
            exact=window.geometry.ellipsePoint(source.value,angle*180/Math.PI);
          }
          best={source,pos:exact,distance};
        }
      }
    }
    return best;
  }
  function snapTrackHit(hit,excludePoint){
    if(!hit || !window.enableSnap) return hit;
    const {source,pos}=hit,g=window.geometry;
    const points=[...(window.snapPoints||[]),
      ...window.snapping.buildSnapPoints(null,window.fm?.forces||[])];
    const onTrack=points.filter(point=>{
      if(excludePoint && g.distance(point,excludePoint.pos)<1e-8) return false;
      if(source.curve){
        const degrees=g.ellipseParameter(source.value,point)*180/Math.PI;
        return g.ellipseAngleInSweep(source.value,degrees) &&
          g.distance(point,g.ellipsePoint(source.value,degrees))<1e-6;
      }
      return projectTrackHit(point,[source])?.distance<1e-6;
    });
    const anchor=window.snapping.snapPoint(pos,{snapOn:true,points:onTrack});
    if(anchor!==pos) return {...hit,pos:anchor,snapped:true};
    const step=window.GRID_STEP;
    if(!(Number.isFinite(step)&&step>0)) return hit;
    const gridPoints=[];
    for(const origin of [[0,0],window.DRAW_CENTER||[0,0]]){
      for(let axis=0;axis<2;axis++){
        const index=Math.floor((pos[axis]-origin[axis])/step);
        for(const offset of [0,1]){
          const coordinate=origin[axis]+(index+offset)*step;
          if(source.curve){
            const frame=g.ellipseFrame(source.value);
            const a=frame.rx*frame.t[axis],b=frame.ry*frame.n[axis],radius=Math.hypot(a,b);
            const ratio=(coordinate-frame.center[axis])/radius;
            if(Math.abs(ratio)>1) continue;
            const base=Math.atan2(b,a),delta=Math.acos(ratio);
            for(const angle of [base-delta,base+delta]){
              const degrees=g.wrapRadians(angle)*180/Math.PI;
              if(g.ellipseAngleInSweep(source.value,degrees)) gridPoints.push(g.ellipsePoint(source.value,degrees));
            }
          }else{
            const {a,b}=source.value,delta=b[axis]-a[axis];
            if(Math.abs(delta)<1e-12) continue;
            const u=(coordinate-a[axis])/delta;
            if(u>=0&&u<=1) gridPoints.push([a[0]+u*(b[0]-a[0]),a[1]+u*(b[1]-a[1])]);
          }
        }
      }
    }
    gridPoints.sort((a,b)=>g.distance(a,pos)-g.distance(b,pos));
    return gridPoints.length ? {...hit,pos:gridPoints[0],snapped:true} : hit;
  }
  function nearestTrackHit(pos,sources){
    const hit=projectTrackHit(pos,sources);
    return hit&&hit.distance<=14 ? snapTrackHit(hit,active?.editPoint) : null;
  }
  function moveAttachedPoint(point,pos){
    const task=window.currentTask;
    if(point?.type!=='attached'||!model().pointStatus(task,point).valid) return null;
    const source=trackSources(task).find(source=>source.ref===point.attachment.ref &&
      (source.curve ? point.attachment.curve : source.source.segment===point.attachment.segment));
    if(!source) return null;
    const hit=snapTrackHit(projectTrackHit(pos,[source]),point);
    if(!hit) return null;
    model().setPointAttachment(task,point,source,hit.pos);
    window.snapIndicator=hit.snapped ? {pos:point.pos} : null;
    return point.pos;
  }
  function resizeWagon(wagon,handleType,pos){
    const task=window.currentTask,g=model().wagonGeometry(task,wagon);
    if(!g?.corners) return null;
    let handle;
    if(handleType==='width'){
      const point=task.scene.points.find(point=>point.id===wagon.pointId);
      if(!point || !model().pointStatus(task,point).valid) return null;
      const source=trackSources(task).find(source=>source.ref===point.attachment.ref &&
        (source.curve ? point.attachment.curve : source.source.segment===point.attachment.segment));
      if(!source) return null;
      // Straight tracks retain the wagon's permitted overhang beyond segment ends.
      const hit=source.curve ? snapTrackHit(projectTrackHit(pos,[source]),point) : null;
      const target=hit?.pos || (window.enableSnap ? window.snapping.snap(pos,{
        points:[],gridStep:window.GRID_STEP,origin:window.DRAW_CENTER
      }).pos : pos);
      const halfWidth=model().wagonHalfWidthAt(task,wagon,target);
      if(!Number.isFinite(halfWidth)||halfWidth<=0.1) return null;
      wagon.halfWidth=halfWidth;
      model().update(task);
      handle=model().wagonGeometry(task,wagon).bottomRight;
      window.snapIndicator=hit?.snapped ? {pos:handle} : null;
    }else if(handleType==='height'){
      const target=window.enableSnap ? window.snapping.snap(pos,{
        points:[],gridStep:window.GRID_STEP,origin:window.DRAW_CENTER
      }).pos : pos;
      const height=window.geometry.dot([target[0]-g.bottomCenter[0],target[1]-g.bottomCenter[1]],g.normal);
      if(!Number.isFinite(height)||height<=0.1) return null;
      wagon.height=height;
      model().update(task);
      handle=[g.bottomCenter[0]+g.normal[0]*height,g.bottomCenter[1]+g.normal[1]*height];
      window.snapIndicator=null;
    }else return null;
    return handle;
  }
  function startAttachedPoint(editPoint){
    activate({mode:'attached',editPoint,
      alive:editPoint?()=>window.currentTask?.scene?.points?.includes(editPoint):null});
    if(!active)return;
    setPointMode('attached');
    active.trackSources=trackSources(active.task);
    active.panel=element('div',active.trackSources.length
      ? 'Festet punkt – klikk på en ellipse, et segment eller en rektangelside. Esc avbryter.'
      : 'Legg til en ellipse, et segment eller et rektangel før du fester punktet.',
    {className:'scene-intersection-picker'});
    document.getElementById('scene-panel')?.appendChild(active.panel);
  }
  function startWagonCreation(){
    activate({mode:'wagon'});
    if(!active)return;
    active.trackSources=trackSources(active.task);
    active.panel=element('div',active.trackSources.length
      ? 'Ny vogn – klikk på en ellipse, et segment eller en rektangelside. Esc avbryter.'
      : 'Legg til en ellipse, et segment eller et rektangel før du lager en vogn.',
    {className:'scene-intersection-picker'});
    document.getElementById('scene-panel')?.appendChild(active.panel);
  }
  function bindForcePicker(select,parent){
    if(!select || select.dataset.scenePickerBound) return;
    select.dataset.scenePickerBound='true';
    bindPicker(select,parent,()=>{
      const force=window.fm?.forces?.[Number(select.dataset.index)];
      return {mode:'anchor',pointsOnly:false,
        alive:()=>!!force && window.fm?.forces?.includes(force),
        detach:()=>{
          const pos=(force.anchor || force.arrowBase || window.DRAW_CENTER || [500,340]).slice();
          applyForceAnchor(window.fm.forces.indexOf(force),{type:'custom',pos},pos,false);
        },
        apply:(spec,pos,newPoint)=>applyForceAnchor(window.fm.forces.indexOf(force),spec,pos,newPoint)};
    });
  }
  function applyForceAnchor(index,spec,pos,newPoint){
    const force=window.fm?.forces?.[index];
    let savedSpec={...spec};
    if(force && spec?.type === 'segment'){
      const resolved=model().resolveAnchor(window.currentTask,{anchor:spec,pos:force.anchor || force.arrowBase || pos});
      if(!resolved.valid || !finitePos(resolved.pos)) return;
      pos=resolved.pos;
      if(resolved.segment){
        const dx=resolved.segment.b[0]-resolved.segment.a[0];
        const dy=resolved.segment.b[1]-resolved.segment.a[1];
        const lengthSquared=dx*dx+dy*dy;
        if(lengthSquared>1e-16){
          savedSpec.u=Math.max(0,Math.min(1,
            ((pos[0]-resolved.segment.a[0])*dx+(pos[1]-resolved.segment.a[1])*dy)/lengthSquared));
        }
      }
    }
    if(!force || !finitePos(pos)) return;
    const old=force.anchor || pos, delta=[pos[0]-old[0],pos[1]-old[1]];
    force.anchor=pos.slice();
    for(const field of ['arrowBase','arrowTip']) if(force[field]) force[field]=force[field].map((n,i)=>n+delta[i]);
    window.syncForceSpec?.(force);
    const ref=window.getForceSpec?.(force);
    if(ref) ref.spec[ref.prop]=savedSpec;
    force.updateDirectionAndLength?.();
    window.markEdited?.(...(newPoint ? ['task','forces'] : ['forces']));
    const container=document.getElementById('force-inputs');
    if(container) window.fm.syncInputs(container,true);
    refresh();
  }
  function showForceAnchorPicker(index){
    if(window.fm?.activeIndex!==index) window.fm?.setActive?.(index,true);
    const select=document.querySelector(`#force-inputs .force-anchor-select[data-index="${index}"]`);
    const control=select && controls.get(select);
    if(!control) return false;
    control.begin();
    if(active?.control===control){
      const selected=Array.from(control.list.children).find(item=>item.dataset.value===select.value);
      if(selected) previewOption(control,selected);
      syncControl(select);
      return true;
    }
    return false;
  }
  function drawOverlay(ctx){
    checkTask();
    if(!window.editorMode) return;
    ctx.save();
    if(constructionDrag){
      const drag=constructionDrag;
      const state=drag.preview?.valid?drag.preview:drag.last;
      const clone=JSON.parse(JSON.stringify(drag.task));
      const wagon=clone.scene.wagons[drag.index];
      model().applyWagonConstruction(clone,wagon,state);
      const shape=model().wagonGeometry(clone,wagon);
      ctx.save();
      ctx.strokeStyle=drag.preview?.valid?'#087d9a':'#d22';
      ctx.lineWidth=2;
      ctx.font='12px Arial';
      ctx.beginPath();ctx.arc(...state.O,state.radius,0,2*Math.PI);ctx.stroke();
      ctx.beginPath();
      shape.corners.forEach((point,i)=>i?ctx.lineTo(...point):ctx.moveTo(...point));
      ctx.closePath();ctx.stroke();
      for(const name of ['C','P','Q','O']){
        window.drawAnchorMarker(ctx,state[name],'pickerPreview');
        ctx.fillText(name,state[name][0]+10,state[name][1]-10);
      }
      if(drag.preview?.valid===false){
        ctx.beginPath();
        ctx.moveTo(drag.pointer[0]-6,drag.pointer[1]-6);
        ctx.lineTo(drag.pointer[0]+6,drag.pointer[1]+6);
        ctx.moveTo(drag.pointer[0]-6,drag.pointer[1]+6);
        ctx.lineTo(drag.pointer[0]+6,drag.pointer[1]-6);
        ctx.stroke();
        ctx.fillText(drag.preview.reason,drag.pointer[0]+12,drag.pointer[1]+20);
      }
      ctx.restore();
    }
    if(active){
      const trackMode=active.mode==='attached'||active.mode==='wagon';
      if(active.mode==='intersection'||trackMode){
        const style=window.ANCHOR_MARKER_STYLES.pickerHovered;
        ctx.save();
        ctx.strokeStyle=style.color;
        ctx.lineWidth=style.lineWidth;
        ctx.lineCap='round';
        ctx.lineJoin='round';
        ctx.shadowColor=style.glowColor || style.color;
        ctx.shadowBlur=style.glowBlur || 0;
        for(const source of trackMode ? (active.candidate ? [active.candidate.source] : []) : active.previewGeometries){
          for(const [a,b] of source.segments){
            ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
          }
        }
        ctx.restore();
      }
      const list=active.mode==='anchor' ? candidates(active.task,active.pointsOnly) : [];
      list.forEach(c=>{
        const state=c===active.candidate || key(c.anchor)===key(active.candidate?.anchor) ? 'pickerHovered' : 'pickerCandidate';
        if(c.type==='segment'){
          const style=window.ANCHOR_MARKER_STYLES[state];
          ctx.save();
          ctx.strokeStyle=style.color;
          ctx.lineWidth=style.lineWidth;
          ctx.lineCap='round';
          ctx.lineJoin='round';
          ctx.shadowColor=style.glowColor || style.color;
          ctx.shadowBlur=style.glowBlur || 0;
          ctx.beginPath();ctx.moveTo(...c.segment.a);ctx.lineTo(...c.segment.b);ctx.stroke();
          ctx.restore();
        }else window.drawAnchorMarker(ctx,c.pos,state);
      });
      if(active.mode==='intersection'){
        for(const hit of active.hits){
          const highlighted=hit===active.hoveredHit || active.previewGeometries.includes(hit.source);
          window.drawAnchorMarker(ctx,hit.pos,highlighted ? 'pickerHovered' : 'pickerPreview');
        }
      }
      if(trackMode && active.candidate) window.drawAnchorMarker(ctx,active.candidate.pos,'pickerPreview');
      const positions=active.mode==='intersection'||trackMode ? [] :
        active.pos && !active.candidate ? [active.pos] : [];
      positions.forEach(pos=>window.drawAnchorMarker(ctx,pos,'pickerPreview'));
    }
    hover=null;
    const task=window.currentTask;
    (task?.scene?.points || []).forEach(point=>{
      const status=model()?.pointStatus(task,point);
      if(status && (!status.valid || status.intersectionValid===false) && finitePos(point.pos)){
        if(api.mouse && Math.hypot(api.mouse[0]-point.pos[0],api.mouse[1]-point.pos[1])<18) hover={pos:point.pos,reason:status.reason};
      }
    });
    if(hover){
      const text=hover.reason || 'Ugyldig skjæring';
      ctx.font='12px Arial';
      const canvas=document.getElementById('app-canvas');
      const container=document.getElementById('canvas-container');
      let bounds={left:0,top:0,right:canvas?.width || 1100,bottom:canvas?.height || 700};
      if(canvas?.getBoundingClientRect && container?.getBoundingClientRect){
        const c=canvas.getBoundingClientRect(),v=container.getBoundingClientRect();
        if(c.width>0 && c.height>0){
          const sx=canvas.width/c.width,sy=canvas.height/c.height;
          const viewportLeft=v.left+(container.clientLeft || 0);
          const viewportTop=v.top+(container.clientTop || 0);
          bounds={left:Math.max(0,(viewportLeft-c.left)*sx),top:Math.max(0,(viewportTop-c.top)*sy),
            right:Math.min(canvas.width,(viewportLeft+(container.clientWidth ?? v.width)-c.left)*sx),
            bottom:Math.min(canvas.height,(viewportTop+(container.clientHeight ?? v.height)-c.top)*sy)};
        }
      }
      // The editor draws in scene coordinates after translating the canvas margin.
      // Invert the active drawing transform, not just the CSS-to-canvas scale.
      const transform=ctx.getTransform?.();
      if(transform && Number.isFinite(transform.a)){
        const {a,b,c,d,e,f}=transform,det=a*d-b*c;
        if(Math.abs(det)>1e-12){
          const corners=[[bounds.left,bounds.top],[bounds.right,bounds.top],
            [bounds.right,bounds.bottom],[bounds.left,bounds.bottom]]
            .map(([x,y])=>[(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det]);
          bounds={left:Math.min(...corners.map(p=>p[0])),right:Math.max(...corners.map(p=>p[0])),
            top:Math.min(...corners.map(p=>p[1])),bottom:Math.max(...corners.map(p=>p[1]))};
        }
      }
      const maxWidth=Math.max(1,bounds.right-bounds.left-24);
      const lines=[];
      let line='';
      for(const word of text.split(/\s+/)){
        if(line && ctx.measureText(line+' '+word).width>maxWidth){lines.push(line);line='';}
        if(ctx.measureText(word).width>maxWidth){
          if(line){lines.push(line);line='';}
          for(const char of word){
            if(line && ctx.measureText(line+char).width>maxWidth){lines.push(line);line='';}
            line+=char;
          }
        } else line+=(line ? ' ' : '')+word;
      }
      if(line) lines.push(line);
      const width=Math.min(maxWidth,Math.max(...lines.map(t=>ctx.measureText(t).width)))+12;
      const height=lines.length*16+8;
      let x=hover.pos[0]+15;
      if(x+width>bounds.right-4) x=hover.pos[0]-15-width;
      x=Math.max(bounds.left+4,Math.min(bounds.right-width-4,x));
      const y=Math.max(bounds.top+4,Math.min(bounds.bottom-height-4,hover.pos[1]-height-10));
      ctx.fillStyle='#fff3f3';ctx.fillRect(x,y,width,height);
      ctx.fillStyle='#b00020';
      lines.forEach((line,i)=>ctx.fillText(line,x+6,y+16+i*16));
    }
    ctx.restore();
  }
  function init(){
    if(initialized) return;
    const canvas=document.getElementById('app-canvas');
    if(!canvas) return;
    initialized=true;
    initIdEditor();
    canvas.addEventListener('mousemove',event=>{
      const pos=window.getMousePos(event);
      api.mouse=pos;
      checkTask();
      if(active){event.stopImmediatePropagation();preview(pos);}
    },true);
    canvas.addEventListener('mouseleave',()=>{
      if(active?.mode==='intersection'){
        active.previewSource(null);
        active.hoveredHit=null;
      }
      if(active?.mode==='attached'||active?.mode==='wagon'){
        active.candidate=null;
        active.pos=null;
        window.snapIndicator=null;
      }
    });
    canvas.addEventListener('mousedown',event=>{
      checkTask();
      if(!active) return;
      event.preventDefault();event.stopImmediatePropagation();swallowRelease=true;
      if(event.button===0) commit(window.getMousePos(event));
    },true);
    canvas.addEventListener('mouseup',event=>{
      if(active || swallowRelease){event.preventDefault();event.stopImmediatePropagation();swallowRelease=false;}
    },true);
    document.addEventListener('mouseup',event=>{
      if(constructionDrag && event.target!==canvas){
        finishConstructionDrag();
        window.draggingHandle=null;
        if(window.selectedSceneElement) delete window.selectedSceneElement._handleStartPos;
      }
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape' && constructionDrag){
        event.preventDefault();event.stopImmediatePropagation();
        finishConstructionDrag(true);
        window.draggingHandle=null;
        if(window.selectedSceneElement) delete window.selectedSceneElement._handleStartPos;
        return;
      }
      if(event.key==='Escape' && active){event.preventDefault();event.stopImmediatePropagation();cancel();creation=null;}
    },true);
    document.addEventListener('click',event=>{
      if(event.target.classList?.contains('scene-id-edit')) return;
      if(active?.mode!=='anchor' || event.target===canvas ||
        active.control?.button.contains(event.target) || active.control?.list.contains(event.target)) return;
      if(!event.target.closest?.('button, .scene-item-header, .scene-anchor-field')) return;
      const state=active;
      if(state.suggestion){
        deferRefresh=true;
        try { finishAnchor(state,state.suggestion.anchor,state.suggestion.pos,false,null,false); }
        finally { deferRefresh=false; }
        // Rebuild only after the target's click handler has selected its element.
        setTimeout(refresh,0);
      } else cancel();
      creation=null;
    },true);
    document.getElementById('btn-add-point')?.addEventListener('click',()=>{
      const next={free:'intersection',intersection:'attached',attached:'free'};
      setPointMode(next[pointMode]||'free');
      const button=document.getElementById('btn-add-point');
      if(pointMode==='intersection') startIntersection();
      else if(pointMode==='attached') startAttachedPoint();
      else {
        activate({mode:'free'});
        if(active){
          const panel=element('div','Fritt punkt – klikk i scenen. Følger snapping. Esc avbryter.',{className:'scene-intersection-picker'});
          active.panel=panel;
          document.getElementById('scene-panel')?.appendChild(panel);
        }
      }
      button.setAttribute('aria-pressed','true');
    });
  }
  function beginConstructionDrag(index,handle){
    const task=window.currentTask,wagon=task.scene.wagons[index];
    const state=model().wagonConstruction(task,wagon);
    if(!state) return false;
    window.autoSave?.();
    constructionDrag={task,index,handle,start:state,last:{...state,valid:true},preview:null,pointer:state[handle]};
    return true;
  }
  function previewConstructionDrag(pos){
    if(!constructionDrag) return;
    const drag=constructionDrag;
    const snapped=window.snapping.snap(pos,{points:[],gridStep:window.GRID_STEP,
      origin:window.DRAW_CENTER,relativeGridOnly:true});
    drag.pointer=snapped.pos;
    drag.preview=model().solveWagonConstruction(drag.start,drag.handle,snapped.pos);
    if(drag.preview.valid) drag.last=drag.preview;
    window.snapIndicator=snapped.source&&drag.preview.valid?{pos:snapped.pos}:null;
  }
  function finishConstructionDrag(cancelled=false){
    if(!constructionDrag) return false;
    const drag=constructionDrag;
    constructionDrag=null;
    if(!cancelled && drag.task===window.currentTask){
      model().applyWagonConstruction(drag.task,drag.task.scene.wagons[drag.index],drag.last);
      edited('task');
      window.autoSave?.();
    }
    window.snapIndicator=null;
    return true;
  }
  const api={init,install:init,cancel,checkTask,drawOverlay,buildProperties,bindForcePicker,applyForceAnchor,candidates,
    openIdEditor,
    beginConstructionDrag,previewConstructionDrag,finishConstructionDrag,
    preferredConstructionHandle:()=>constructionHandle,
    startAngle,startAttachedPoint,startWagonCreation,moveAttachedPoint,resizeWagon,syncControl,reveal,revealSelection,showForceAnchorPicker,
    previewSceneSource,chooseSceneSource,
    isSelectingGeometry:()=>active?.mode==='intersection' && active.slot!==null,
    isPicking:select=>active?.mode==='anchor' && active.select===select};
  window.sceneEditor=api;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
