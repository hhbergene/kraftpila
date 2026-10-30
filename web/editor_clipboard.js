// Internal editor clipboard; never reads or writes the system clipboard.
(function(){
  if(!window.editorMode) return;
  const collections = {plane:'planes',rect:'rects', ellipse:'ellipses', point:'points',
    wagon:'wagons',
    segment:'segments', arrow:'arrows', text:'texts', angle:'angles'};
  const labels = {rect:'Rektangel', ellipse:'Ellipse', point:'Punkt',
    segment:'Segment', arrow:'Pil', text:'Tekst', angle:'Vinkel', plane:'Plan',wagon:'Vogn',
    expectedForce:'Fasitkraft', initialForce:'Låst kraft'};
  const entries = [];
  const sourceIds = new WeakMap(), taskIds = new WeakMap();
  let sourceSequence = 0, taskSequence = 0;
  class ClipboardError extends Error {}
  const position = p=>Array.isArray(p) && p.length===2 && p.every(Number.isFinite);
  const clone = value=>JSON.parse(JSON.stringify(value, (key,item)=>key.startsWith('_') ? undefined : item));
  const forceEntry = type=>type==='expectedForce' || type==='initialForce';
  const nameKey = name=>String(name || '').toLowerCase().replace(/[ _^{}]/g,'');
  const angleRadius = angle=>Number.isFinite(angle.radius) && angle.radius>0 ? angle.radius : 40;
  const panel = document.getElementById('clipboard-panel');
  const copyButton = document.getElementById('clipboard-copy');
  const pasteButton = document.getElementById('clipboard-paste');
  const status = document.getElementById('clipboard-status');

  function textPosition(task,index){
    window.updateTextPositions(task);
    const texts = task.scene.texts;
    const text = texts[index];
    if(position(text.pos)) return text.pos.slice();
    if(position(text._renderedPos)) return text._renderedPos.slice();
    if(index>0){
      const previous = textPosition(task,index-1);
      return [previous[0], previous[1]+(texts[index-1].size || 14)+5];
    }
    throw new ClipboardError('Teksten har ingen gyldig posisjon.');
  }

  function snapshotElement(task,type,index){
    const source = task.scene[collections[type]]?.[index];
    if(!source) throw new ClipboardError('Velg et sceneelement som kan kopieres.');
    const data = clone(source);
    if(type==='point'){
      const state = window.sceneModel.pointStatus(task,source);
      if(!state.valid) throw new ClipboardError(state.reason || 'Punktet er ugyldig.');
      for(const field of ['id','sources','branch','lastValidPos','valid','reason']) delete data[field];
      data.type = 'free';
    } else if(type==='wagon'){
      const point=task.scene.points?.find(item=>item?.id===source.pointId&&item.type==='attached');
      if(!point) throw new ClipboardError('Vognen mangler et gyldig festet punkt.');
      data.anchorPos=point.pos.slice();
      delete data.planeId;
      const geometry=window.sceneModel.wagonGeometry(task,source);
      if(!geometry.valid) throw new ClipboardError(geometry.reason||'Vognen har ugyldig geometri.');
    } else if(type==='angle'){
      const geometry = window.sceneModel.angleGeometry(source,task);
      if(!geometry.valid) throw new ClipboardError(geometry.reason || 'Vinkelen er ugyldig.');
      data.vertex = {pos:geometry.vertex.slice()};
      const radius = angleRadius(source);
      for(const side of ['start','end']){
        const angle = geometry[side+'Angle'];
        data[side] = {pos:[geometry.vertex[0]+radius*Math.cos(angle),
          geometry.vertex[1]+radius*Math.sin(angle)]};
      }
      data.startReversed = data.endReversed = false;
    } else if(type==='text'){
      data.pos = textPosition(task,index);
      data.linked = false;
      if(Number.isFinite(data.angle_deg)) delete data.n_vec;
      else if(Array.isArray(data.n_vec)) delete data.angle_deg;
    }
    const entry = {type,data};
    validate(entry);
    return entry;
  }

  function identity(map,object,next){
    if(!map.has(object)) map.set(object,next());
    return map.get(object);
  }

  function sourceId(task,type,source){
    const taskId=identity(taskIds,task,()=>++taskSequence);
    const elementId=identity(sourceIds,source,()=>++sourceSequence);
    return `${taskId}:${type}:${elementId}`;
  }

  function snapshotForce(force){
    if(!force?.name?.trim() || force.drawing || force.dragging ||
       ![force.anchor,force.arrowBase,force.arrowTip].every(position) ||
       Math.hypot(force.arrowTip[0]-force.arrowBase[0],force.arrowTip[1]-force.arrowBase[1])<1e-8){
      throw new ClipboardError('Velg en ferdig tegnet kraft med navn.');
    }
    const expected = force.isExpected===undefined ? force.moveable!==false : force.isExpected;
    const data = clone(window.getForceSpec(force)?.spec || {name:force.name});
    const drawn = {anchor:force.anchor.slice(), arrowBase:force.arrowBase.slice(), arrowTip:force.arrowTip.slice()};
    data.name = force.name;
    data.role = force.role || 'force';
    const parent = force.componentOf || window.forceNotation?.parentName(force,window.currentTask);
    if(parent) data.componentOf = parent;
    delete data.anchorFrom;
    delete data.point;
    if(expected){
      data.anchor = {type:'custom',pos:drawn.anchor.slice()};
      data.drawn = drawn;
      if(!data.dir) data.dir = force.force_dir.slice();
    } else {
      Object.assign(data,drawn);
      data.anchorSpec = {type:'custom',pos:drawn.anchor.slice()};
      data.moveable = false;
    }
    return {type:expected ? 'expectedForce' : 'initialForce',data};
  }

  function selectedEntry(){
    const task = window.currentTask;
    if(!task?.scene) throw new ClipboardError('Åpne en oppgave først.');
    if(window.activePanel==='scene'){
      const selected = window.selectedSceneElement;
      if(!selected || !(selected.type in collections || selected.type==='plane')){
        throw new ClipboardError('Velg et sceneelement som kan kopieres.');
      }
      return snapshotElement(task,selected.type,selected.index);
    }
    return snapshotForce(window.fm?.forces[window.fm.activeIndex]);
  }

  function coordinates(entry){
    const {type,data} = entry;
    if(forceEntry(type)){
      const drawn = type==='expectedForce' ? data.drawn : data;
      return [drawn.anchor,drawn.arrowBase,drawn.arrowTip];
    }
    if(type==='angle') return [data.start.pos,data.vertex.pos,data.end.pos];
    if(type==='segment' || type==='arrow') return [data.a,data.b];
    return [data[type==='wagon' ? 'anchorPos' : type==='rect' ? 'bottomCenter' : type==='plane' ? 'through' :
      type==='ellipse' ? 'center' : 'pos']];
  }

  function validate(entry){
    if(!coordinates(entry).every(position)) throw new ClipboardError('Elementet har ugyldige koordinater.');
    const {type,data} = entry;
    if(type==='text' && data.angle_deg!==undefined && !Number.isFinite(data.angle_deg)){
      throw new ClipboardError('Elementet har en ugyldig tekstvinkel.');
    }
    if(['rect','ellipse'].includes(type) &&
       ![data.width,data.height].every(n=>Number.isFinite(n) && n>0)){
      throw new ClipboardError('Elementet har ugyldig bredde eller høyde.');
    }
    for(const axis of ['t_vec','n_vec']){
      if(data[axis]!==undefined && (!position(data[axis]) || Math.hypot(...data[axis])<1e-8)){
        throw new ClipboardError('Elementet har en ugyldig retningsvektor.');
      }
    }
    if(type==='ellipse' && !window.geometry.ellipseFrame(data)){
      throw new ClipboardError('Ellipsen har ugyldig geometri.');
    }
    if(type==='wagon' && (!data.pointId ||
       ![data.halfWidth,data.height].every(n=>Number.isFinite(n)&&n>0))){
      throw new ClipboardError('Vognen mangler et festet punkt eller gyldige mål.');
    }
  }

  function geometryKey(entry){
    const {type,data} = entry;
    const key = coordinates(entry).flat();
    if(type==='rect') key.push(data.width,data.height,...(data.t_vec || [1,0]),...(data.n_vec || [0,-1]));
    if(type==='ellipse'){
      const frame = window.geometry.ellipseFrame(data);
      const sweep = window.geometry.ellipseSweep(data);
      if(!frame) throw new ClipboardError('Ellipsen har ugyldig geometri.');
      key.push(frame.rx,frame.ry,...frame.t,...frame.n,sweep.start,sweep.sweep);
    }
    if(type==='angle') key.push(angleRadius(data));
    return key;
  }

  function coincides(a,b){
    const x = geometryKey(a), y = geometryKey(b);
    const equal = (left,right)=>left.length===right.length && left.every((n,i)=>Math.abs(n-right[i])<1e-6);
    if(equal(x,y)) return true;
    return a.type==='segment' && equal(x,[...y.slice(2),...y.slice(0,2)]);
  }

  function translate(entry,step){
    const points = coordinates(entry);
    if(points.every(p=>p[0]+step===p[0] && p[1]-step===p[1])){
      throw new ClipboardError('Koordinatene er for store til å forskyves med et halvt rutenettsteg.');
    }
    points.forEach(p=>{p[0]+=step; p[1]-=step;});
    validate(entry);
    if(forceEntry(entry.type)){
      const data = entry.data, prop = entry.type==='expectedForce' ? 'anchor' : 'anchorSpec';
      data[prop].pos = (entry.type==='expectedForce' ? data.drawn.anchor : data.anchor).slice();
    }
  }

  function uniqueName(original,names){
    if(!names.has(nameKey(original))) return original;
    const match = original.match(/^(.*?)_(?:\{([^{}]*)\}|([^{}]+))$/);
    const base = match ? match[1] : original;
    const sub = match ? (match[2] ?? match[3]) : '';
    const suffix = sub.match(/^(.*?)(\d+)$/);
    const prefix = suffix ? suffix[1] : sub;
    let number = suffix ? Number(suffix[2])+1 : 1;
    let candidate;
    do {
      if(!Number.isSafeInteger(number)) throw new ClipboardError('Kraftens indeks er for stor til å nummereres.');
      const index = prefix+number++;
      candidate = `${base}_${index.length===1 ? index : '{'+index+'}'}`;
    } while(names.has(nameKey(candidate)));
    return candidate;
  }

  function preparePaste(){
    const task = window.currentTask;
    if(!task?.scene || !window.fm) throw new ClipboardError('Åpne en oppgave først.');
    if(!entries.length) throw new ClipboardError('Utklippstavla er tom.');
    const step = window.GRID_STEP/2;
    if(!Number.isFinite(step) || step<=0) throw new ClipboardError('Rutenettsteget er ugyldig.');
    const names = new Set([...window.fm.forces,...(task.expectedForces || []),
      ...(task.initialForces || [])].map(f=>nameKey(f.name)));
    const ids = new Set(Object.values(collections).flatMap(collection=>
      (task.scene[collection]||[]).map(element=>element?.id).filter(Boolean)));
    const existing = new Map();
    for(const type of new Set(entries.map(e=>e.type))){
      if(forceEntry(type)){
        // Initial and expected forces share the same drawn geometry.
        existing.set(type,window.fm.forces.filter(f=>[f.anchor,f.arrowBase,f.arrowTip].every(position))
          .map(f=>({type,data:type==='expectedForce' ? {drawn:f} : f})));
      } else {
        existing.set(type,(task.scene[collections[type]] || []).map((obj,index)=>{
          try { return snapshotElement(task,type,index); }
          catch(error){ if(error instanceof ClipboardError) return null; throw error; }
        }).filter(Boolean));
      }
    }
    const result = entries.map(source=>{
      const entry = clone(source);
      validate(entry);
      const {type,data} = entry;
      if(type!=='plane'&&type!=='wagon'){
        const occupied = existing.get(type);
        while(occupied.some(other=>coincides(entry,other))) translate(entry,step);
        occupied.push(entry);
        if(forceEntry(type)){
          const otherType = type==='expectedForce' ? 'initialForce' : 'expectedForce';
          if(existing.has(otherType)){
            const drawn = type==='expectedForce' ? data.drawn : data;
            existing.get(otherType).push({type:otherType,data:otherType==='expectedForce' ? {drawn} : drawn});
          }
        }
      }
      if(!forceEntry(type)){
        const id=window.sceneModel.nextSceneId(task,type,ids);
        data.id=id;
        ids.add(id);
      }
      if(forceEntry(type)){
        data.name = uniqueName(data.name,names);
        names.add(nameKey(data.name));
      }
      return entry;
    });
    const renamed = new Map();
    entries.forEach((entry,index)=>{
      if(!forceEntry(entry.type)) return;
      const key = nameKey(entry.data.name);
      renamed.set(key,renamed.has(key) ? null : result[index].data.name);
    });
    result.forEach(entry=>{
      if(!forceEntry(entry.type) || !entry.data.componentOf) return;
      const parent = renamed.get(nameKey(entry.data.componentOf));
      if(parent) entry.data.componentOf = parent;
    });
    const forces = result.filter(e=>forceEntry(e.type)).map(entry=>{
      const drawn = entry.type==='expectedForce' ? entry.data.drawn : entry.data;
      const force = new window.Force();
      Object.assign(force,{name:entry.data.name, anchor:drawn.anchor.slice(),
        arrowBase:drawn.arrowBase.slice(), arrowTip:drawn.arrowTip.slice(),
        isExpected:entry.type==='expectedForce', moveable:entry.type==='expectedForce'});
      window.forceNotation?.restore(force,entry.data,true);
      force.updateDirectionAndLength();
      return force;
    });
    return {result,forces};
  }

  function show(){ panel.classList.remove('hidden'); refresh(); }
  function notify(message){ show(); status.textContent = message; }

  function run(action){
    try { action(); }
    catch(error){
      if(!(error instanceof ClipboardError)) throw error;
      notify(error.message);
    }
  }

  function copy(){
    run(()=>{
      const entry = selectedEntry();
      if(window.activePanel==='scene'){
        const selected=window.selectedSceneElement;
        const task=window.currentTask;
        const source=task?.scene?.[collections[selected?.type]]?.[selected?.index];
        if(source && typeof source==='object'){
          entry._sourceId=sourceId(task,selected.type,source);
        }
      }
      entries.push(entry);
      render();
      notify(`${labels[entry.type]} lagt til.`);
    });
  }

  function copyGroup(members){
    run(()=>{
      const task=window.currentTask;
      if(!task?.scene) throw new ClipboardError('Åpne en oppgave først.');
      if(!Array.isArray(members) || !members.length){
        throw new ClipboardError('Gruppen har ingen sceneelementer å kopiere.');
      }
      const seen=new Set(entries.map(entry=>entry._sourceId).filter(Boolean));
      const additions=[];
      members.forEach(member=>{
        const type=member?.type;
        if(!(Object.hasOwn(collections,type) || type==='plane')){
          throw new ClipboardError('Gruppen inneholder en ugyldig sceneelementreferanse.');
        }
        const source=task.scene[collections[type]]?.find(element=>element?.id===member?.id);
        if(!source || typeof source!=='object'){
          throw new ClipboardError('Gruppen inneholder en sceneelementreferanse som ikke finnes.');
        }
        const key=sourceId(task,type,source);
        if(seen.has(key)) return;
        const index=task.scene[collections[type]].indexOf(source);
        const entry=snapshotElement(task,type,index);
        entry._sourceId=key;
        additions.push(entry);
        seen.add(key);
      });
      if(!additions.length){
        notify('Sceneelementene i gruppen ligger allerede i utklippstavla.');
        return;
      }
      entries.push(...additions);
      render();
      notify(`${additions.length} sceneelement(er) fra gruppen lagt til.`);
    });
  }

  function paste(){
    run(()=>{
      const {result,forces} = preparePaste();
      window.sceneEditor.cancel();
      window.autoSave();
      window.rememberUndoSelection();
      const task = window.currentTask;
      for(const {type,data} of result){
        if(forceEntry(type)){
          const key = type==='expectedForce' ? 'expectedForces' : 'initialForces';
          (task[key] ||= []).push(data);
        } else {
          if(type==='wagon'){
            const point=task.scene.points?.find(item=>item?.id===data.pointId);
            if(!point) throw new ClipboardError('Vognens festede punkt finnes ikke lenger.');
            const {anchorPos,planeId,...options}=data;
            window.sceneModel.createWagon(task,point,options);
          }else (task.scene[collections[type]] ||= []).push(data);
          if(type==='plane') task.scene.activePlaneId=data.id;
        }
      }
      if(forces.length){
        window.fm.ensureTrailingBlank();
        window.fm.forces.splice(window.fm.forces.length-1,0,...forces);
        window.forceNotation?.sort(window.fm,task);
      }
      window.markEdited('task',...(forces.length ? ['forces'] : []));
      window.updateAppState();
      window.autoSave();
      notify(`${result.length} oppføring(er) limt inn. Ctrl+Z angrer innlimingen.`);
    });
  }

  function close(){
    entries.length = 0;
    status.textContent = '';
    render();
    panel.classList.add('hidden');
  }

  function render(){
    const list = document.getElementById('clipboard-list');
    list.replaceChildren();
    for(const entry of entries){
      const item = document.createElement('li');
      const name = entry.data.name || (entry.type==='text' ? entry.data.txt : '');
      const points = coordinates(entry).map(p=>`(${p.map(n=>Number(n.toFixed(2))).join(', ')})`).join(' → ');
      item.textContent = `${labels[entry.type]}${name ? ': '+name : ''} — ${points}`;
      list.appendChild(item);
    }
    document.getElementById('clipboard-empty').hidden = entries.length>0;
    document.getElementById('clipboard-count').textContent = `${entries.length} oppføring(er)`;
    refresh();
  }

  function refresh(){
    if(!panel) return;
    let reason = '';
    try { selectedEntry(); }
    catch(error){ if(error instanceof ClipboardError) reason=error.message; else throw error; }
    copyButton.disabled = !!reason;
    copyButton.title = reason || 'Legg det aktive elementet til utklippstavla';
    pasteButton.disabled = !entries.length || !window.currentTask;
  }

  window.editorClipboard = {copy,copyGroup,paste,show,close,refresh,
    get entries(){ return clone(entries); }};
  document.getElementById('btn-clipboard').addEventListener('click',show);
  document.getElementById('clipboard-close').addEventListener('click',close);
  copyButton.addEventListener('click',copy);
  pasteButton.addEventListener('click',paste);
  document.addEventListener('click',refresh);
  document.addEventListener('focusin',refresh);
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if(key!=='c' && key!=='v') return;
    if(event.target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if(document.querySelector('.modal:not(.hidden), #settings-panel:not(.hidden), #force-details-modal:not(.hidden), #relations-modal:not(.hidden), #snap-checklist-modal:not(.hidden)')) return;
    event.preventDefault();
    if(key==='c'){
      const group=window.currentTask?.scene?.groups?.[window.activeSceneGroupIndex];
      if(group) copyGroup(group.members); else copy();
    }else paste();
  });
  setupFloatingPanelPositioning('clipboard-panel',440);
  render();
})();
