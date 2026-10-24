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
  const controls = new WeakMap();
  const angleControls = new WeakMap();
  const finitePos = pos => Array.isArray(pos) && pos.length >= 2 && pos.every(Number.isFinite);
  const model = () => window.sceneModel;
  const key = spec => spec ? `${spec.type}:${spec.ref}:${spec.point || spec.segment}` : '';
  function candidates(task, pointsOnly){
    return (model()?.candidates(task) || []).map(c => {
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
    if(active && (active.task !== window.currentTask || (active.alive && !active.alive()))) cancel();
    if(creation && (creation.task!==window.currentTask || !creation.task.scene.angles.includes(creation.angle))) creation=null;
  }
  function activate(config){
    cancel();
    if(!window.editorMode || !window.currentTask || !model()) return;
    active = {...config, task:window.currentTask, original:config.select?.value || '', pos:null, candidate:null};
    document.getElementById('app-canvas')?.style.setProperty('cursor','crosshair');
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
    const items=Array.from(active.control.list.children).filter(item=>item.dataset.value!==undefined);
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
    if(state.mode === 'intersection'){
      const hit=state.hits?.map(h=>({h,d:Math.hypot(pos[0]-h.pos[0],pos[1]-h.pos[1])}))
        .filter(x=>x.d <= 14).sort((a,b)=>a.d-b.d)[0]?.h;
      if(hit) confirmIntersection(state,hit);
      return;
    }
    if(state.mode === 'anchor'){
      const candidate=nearest(pos,candidates(state.task,state.pointsOnly));
      finishAnchor(state,null,null,false,()=>{
        const point=candidate ? null : model().createPoint(state.task,pos.slice());
        const spec=candidate ? candidate.anchor : {type:'point',ref:point.id,point:'center'};
        state.apply(spec,candidate?.pos || point.pos,!!point);
      });
      return;
    }
    window.autoSave?.();
    cancel();
    const point=model().createPoint(state.task,pos.slice());
    window.selectedSceneElement={type:'point',index:state.task.scene.points.indexOf(point),obj:point};
    edited('task');
    revealPoint(point);
    window.autoSave?.();
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
    const r=row(parent,label);
    const input=element('input',null,{type:'number',value:String(value ?? ''),step:'any',...options});
    input.className='scene-editor-input';
    input.style.width='65px';
    input.style.minWidth='0';
    input.style.flex='1 1 65px';
    r.appendChild(input);
    input.addEventListener('change',()=>{
      if(options.allowBlank && input.value.trim()===''){
        input.setCustomValidity('');
        apply(undefined);
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
      apply(v);
    });
    return input;
  }
  function checkbox(parent,label,value,apply){
    const r=row(parent,label), input=element('input',null,{type:'checkbox',checked:!!value});
    r.appendChild(input);
    input.addEventListener('change',()=>apply(input.checked));
  }
  function anchorFields(parent, angle, name, label){
    const slot=angle[name];
    if(slot.detachedReason){
      const notice=row(parent,'Frikoblet:');
      notice.appendChild(element('span',slot.detachedReason));
    }
    const list=candidates(window.currentTask,name === 'vertex');
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
    if(type === 'angle'){
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
      row(parent,'Type:').appendChild(element('span',obj.type==='intersection' ? 'Skjæringspunkt' : 'Fritt punkt'));
      row(parent,'ID:').appendChild(element('span',obj.id));
      if(obj.type !== 'intersection'){
        numberField(parent,'x:',obj.pos[0],v=>{obj.pos[0]=v; edited('task');});
        numberField(parent,'y:',obj.pos[1],v=>{obj.pos[1]=v; edited('task');});
      } else {
        (obj.sources || []).forEach(source=>row(parent,'Geometri:').appendChild(element('span',`${source.ref} ${source.segment || ''}`)));
        const change=element('button','Velg skjæring på nytt',{type:'button'});
        change.addEventListener('click',()=>startIntersection(obj));
        parent.appendChild(change);
      }
      checkbox(parent,'Synlig for eleven',obj.visible,v=>{obj.visible=v; edited('task');});
    }
    const remove=element('button','🗑 Slett',{type:'button',className:'scene-delete-element-btn'});
    remove.addEventListener('click',()=>{
      cancel();
      const array=window.currentTask.scene[type+'s'], idx=array.indexOf(obj);
      if(idx < 0) return;
      model().remapReferences(window.currentTask,type,idx,'delete');
      array.splice(idx,1);
      window.selectedSceneElement=null;
      edited('task','forces');
    });
    parent.appendChild(remove);
  }
  function confirmIntersection(state,hit){
    window.autoSave?.();
    const point=state.editPoint || model().createPoint(state.task,hit.pos);
    point.type='intersection';
    point.sources=state.sources.map(s=>({...s}));
    point.branch=JSON.parse(JSON.stringify(hit.branch || {params:hit.params}));
    point.pos=hit.pos.slice();
    point.lastValidPos=hit.pos.slice();
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
    const state=active, panel=element('div',null,{className:'scene-intersection-picker'});
    panel.style.minWidth='0';
    panel.style.overflowWrap='anywhere';
    state.panel=panel;
    const sources=model().geometries(state.task);
    panel.appendChild(element('strong','Skjæringspunkt – velg to geometrier'));
    const selects=[0,1].map(i=>{
      const select=element('select',null);
      select.style.minWidth='0';
      select.style.width='100%';
      select.style.flex='1 1 100%';
      select.appendChild(element('option','Velg geometri',{value:''}));
      sources.forEach((s,j)=>select.appendChild(element('option',s.label || s.key,{value:String(j)})));
      if(editPoint?.sources?.[i]){
        const idx=sources.findIndex(s=>JSON.stringify(s.source)===JSON.stringify(editPoint.sources[i]));
        if(idx>=0) select.value=String(idx);
      }
      row(panel,`Kilde ${i+1}:`).appendChild(select);
      return select;
    });
    const hits=element('div',null), message=element('div','');
    panel.append(hits,message,element('span','Klikk et treff i scenen eller bekreft nedenfor. Esc avbryter.'));
    function calculate(){
      if(active!==state) return;
      hits.replaceChildren();
      state.hits=[];
      if(selects.some(s=>s.value==='')){message.textContent='Velg begge kilder.';return;}
      state.sources=selects.map(s=>sources[Number(s.value)].source);
      const result=model().intersections(state.task,...state.sources);
      state.hits=result.hits || [];
      message.textContent=state.hits.length ? `${state.hits.length} treff – velg eksplisitt.` : result.reason || 'Ingen isolert skjæring.';
      state.hits.forEach((hit,i)=>{
        const btn=element('button',`Bekreft treff ${i+1} (${hit.pos.map(n=>n.toFixed(1)).join(', ')})`,{type:'button'});
        btn.style.maxWidth='100%';
        btn.style.whiteSpace='normal';
        btn.addEventListener('click',()=>{if(active===state) confirmIntersection(state,hit);});
        hits.appendChild(btn);
      });
    }
    selects.forEach(s=>s.addEventListener('change',calculate));
    (document.getElementById('scene-panel') || document.body).appendChild(panel);
    calculate();
  }
  function bindForcePicker(select,parent){
    if(!select || select.dataset.scenePickerBound) return;
    select.dataset.scenePickerBound='true';
    bindPicker(select,parent,()=>{
      const force=window.fm?.forces?.[Number(select.dataset.index)];
      return {mode:'anchor',pointsOnly:false,
        alive:()=>!!force && window.fm?.forces?.includes(force),
        detach:()=>{
          const pos=(force.anchor || force.arrowBase || window.currentTask.origin).slice();
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
    if(active){
      const list=active.mode==='anchor' ? candidates(active.task,active.pointsOnly) : [];
      list.forEach(c=>{
        const state=c===active.candidate || key(c.anchor)===key(active.candidate?.anchor) ? 'pickerHovered' : 'pickerCandidate';
        if(c.type==='segment'){
          const style=window.ANCHOR_MARKER_STYLES[state];
          ctx.strokeStyle=style.color;
          ctx.lineWidth=style.lineWidth;
          ctx.beginPath();ctx.moveTo(...c.segment.a);ctx.lineTo(...c.segment.b);ctx.stroke();
        }else window.drawAnchorMarker(ctx,c.pos,state);
      });
      const positions=active.mode==='intersection' ? (active.hits || []).map(h=>h.pos) :
        active.pos && !active.candidate ? [active.pos] : [];
      positions.forEach(pos=>window.drawAnchorMarker(ctx,pos,'pickerPreview'));
    }
    hover=null;
    const task=window.currentTask;
    (task?.scene?.points || []).forEach(point=>{
      const status=model()?.pointStatus(task,point);
      if(status && !status.valid && finitePos(point.pos)){
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
    canvas.addEventListener('mousemove',event=>{
      const pos=window.getMousePos(event);
      api.mouse=pos;
      checkTask();
      if(active){event.stopImmediatePropagation();preview(pos);}
    },true);
    canvas.addEventListener('mousedown',event=>{
      checkTask();
      if(!active) return;
      event.preventDefault();event.stopImmediatePropagation();swallowRelease=true;
      if(event.button===0) commit(window.getMousePos(event));
    },true);
    canvas.addEventListener('mouseup',event=>{
      if(active || swallowRelease){event.preventDefault();event.stopImmediatePropagation();swallowRelease=false;}
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape' && active){event.preventDefault();event.stopImmediatePropagation();cancel();creation=null;}
    },true);
    document.addEventListener('click',event=>{
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
      pointMode=pointMode==='free' ? 'intersection' : 'free';
      const button=document.getElementById('btn-add-point');
      button.title=pointMode==='free' ? 'Fritt punkt – klikk i scenen uten snapping' : 'Skjæringspunkt – velg geometrier';
      button.dataset.mode=pointMode;
      button.setAttribute('aria-label',button.title);
      if(pointMode==='intersection') startIntersection();
      else {
        activate({mode:'free'});
        if(active){
          const panel=element('div','Fritt punkt – klikk i scenen uten snapping. Esc avbryter.',{className:'scene-intersection-picker'});
          active.panel=panel;
          document.getElementById('scene-panel')?.appendChild(panel);
        }
      }
      button.setAttribute('aria-pressed','true');
    });
  }
  const api={init,install:init,cancel,checkTask,drawOverlay,buildProperties,bindForcePicker,applyForceAnchor,candidates,
    startAngle,syncControl,reveal,revealSelection,showForceAnchorPicker,
    isPicking:select=>active?.mode==='anchor' && active.select===select};
  window.sceneEditor=api;
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
