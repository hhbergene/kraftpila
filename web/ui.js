/**
 * UI Module: Panel and Button Management
 * Handles scene panel rendering, editor mode UI, panel height resizing, and help button updates
 */

let expandedSceneType = null;
let lastSceneSelectionKey = '';
let lastSceneGroupTask = null;

function bindScenePanelHoverTarget(element,type,index){
  let pointerInside=false;
  let focusInside=false;
  const isTarget=target=>target?.type===type && target.index===(index ?? 0);
  const update=()=>{
    if(pointerInside || focusInside){
      window.scenePanelHoverTarget={type,index:index ?? 0};
      window.fm?.setHoverCandidate?.(null);
      window.hoveredInteraction=null;
      window.hoveredSceneElement=null;
    }else if(isTarget(window.scenePanelHoverTarget)){
      window.scenePanelHoverTarget=null;
    }
  };
  element.addEventListener('pointerenter',()=>{pointerInside=true;update();});
  element.addEventListener('pointerleave',()=>{pointerInside=false;update();});
  element.addEventListener('focusin',()=>{focusInside=true;update();});
  element.addEventListener('focusout',event=>{
    focusInside=!!event.relatedTarget && !!element.contains?.(event.relatedTarget);
    update();
  });
}

// Editor mode state management
function updateEditorMode(){
  const isEditor = !!window.editorMode;
  const scenePanel = document.getElementById('scene-panel');
  const editorButtons = document.getElementById('editor-buttons');
  
  if(isEditor){
    // Show editor UI elements
    if(scenePanel) scenePanel.style.display = 'block';
    if(editorButtons) editorButtons.classList.remove('hidden');
  } else {
    // Hide editor UI elements
    if(scenePanel) scenePanel.style.display = 'none';
    if(editorButtons) editorButtons.classList.add('hidden');
  }
  
  // Update panel heights after showing/hiding editor panel
  updatePanelHeights();
}

/**
 * Mark which side panel ('force' or 'scene') was last used and resize panels (editor only).
 */
window.activePanel = 'force';
window.scenePanelHoverTarget=null;
window.setActivePanel = function(kind){
  if(window.activePanel === kind) return;
  window.activePanel = kind;
  if(kind!=='scene') window.scenePanelHoverTarget=null;
  if(window.updateEditorPanelHeights) window.updateEditorPanelHeights();
};

/**
 * Dynamically resize force and scene panels based on content.
 * Calculates size needed for each panel and distributes space proportionally,
 * with a minimum of 1/3 of total height for each panel when both are visible.
 */
function updatePanelHeights(){
  const forcePanel = document.getElementById('force-panel');
  const scenePanel = document.getElementById('scene-panel');
  
  if(!forcePanel) return;
  
  const totalHeight = window.innerHeight - 100; // Subtract top bar and padding
  const minHeight = totalHeight / 3; // Minimum 1/3 of total height
  
  // Count forces and scene elements
  let forceCount = 0;
  let sceneElementCount = 0;
  
  if(window.fm && window.fm.forces){
    forceCount = window.fm.forces.length;
  }
  
  if(window.currentTask && window.currentTask.scene){
    const scene = window.currentTask.scene;
    const counts={
      plane:scene.planes?.length || 0,
      rect:scene.rects?.length || 0,
      ellipse:scene.ellipses?.length || 0,
      segment:scene.segments?.length || 0,
      arrow:scene.arrows?.length || 0,
      point:scene.points?.length || 0,
      angle:scene.angles?.length || 0,
      text:(scene.texts || []).filter(text=>!text._isShortLines).length
    };
    sceneElementCount=Object.values(counts).filter(count=>count>0).length+
      (scene.groups?.length || 0);
    if(expandedSceneType && counts[expandedSceneType]){
      sceneElementCount+=counts[expandedSceneType]-1;
    }
    const expandedGroup=scene.groups?.[window.activeSceneGroupIndex];
    if(expandedGroup){
      sceneElementCount+=1+(Array.isArray(expandedGroup.members) ? expandedGroup.members.length : 0);
    }
  }
  
  // Estimate height needed: base height + height per item (estimate ~25px per item)
  const itemHeightEstimate = 25;
  const forceHeightNeeded = Math.max(80, forceCount * itemHeightEstimate);
  const sceneHeightNeeded = Math.max(80, sceneElementCount * itemHeightEstimate);
  
  // Determine if scene panel is visible
  const sceneVisible = window.editorMode && !scenePanel?.classList.contains('hidden');
  
  let forceHeight, sceneHeight;
  
  if(sceneVisible && window.fm){
    // Both panels visible - distribute space proportionally with constraints
    const totalNeeded = forceHeightNeeded + sceneHeightNeeded;
    const forceProportion = forceHeightNeeded / totalNeeded;
    const sceneProportion = sceneHeightNeeded / totalNeeded;
    
    forceHeight = Math.max(minHeight, Math.min(totalHeight - minHeight, totalHeight * forceProportion));
    sceneHeight = totalHeight - forceHeight;
  } else if(sceneVisible){
    // Only scene panel visible
    forceHeight = 0;
    sceneHeight = totalHeight;
  } else {
    // Only force panel visible
    forceHeight = totalHeight;
    sceneHeight = 0;
  }
  
  // Apply heights
  if(forceHeight > 0){
    forcePanel.style.height = forceHeight + 'px';
    forcePanel.style.display = 'block';
  } else {
    forcePanel.style.display = 'none';
  }
  
  if(scenePanel){
    if(sceneHeight > 0){
      scenePanel.style.height = sceneHeight + 'px';
      scenePanel.style.display = 'block';
    } else {
      scenePanel.style.display = 'none';
    }
  }
}

/**
 * Populate the scene panel with all scene elements
 */
window.refreshSceneTextCoordinates = function(){
  window.updateTextPositions(window.currentTask);
  document.querySelectorAll('#scene-items .scene-coordinate-input[data-type="text"]').forEach(input=>{
    const text = window.currentTask?.scene?.texts?.[Number(input.dataset.idx)];
    if(!text) return;
    input.value = text.pos?.[Number(input.dataset.axis)] ?? '';
    input.readOnly = !!text.linked;
  });
};

function updateScenePanel(){
  const scenePanel = document.getElementById('scene-items');
  if(!scenePanel || !window.currentTask || !window.currentTask.scene) return;
  const panelHighlightColor=window.EDITOR_HIGHLIGHT_STYLES?.scene?.panel?.color;
  if(panelHighlightColor){
    document.getElementById('scene-panel')?.style?.setProperty?.('--editor-highlight-panel',panelHighlightColor);
  }
  scenePanel.innerHTML = '';
  
  window.sceneModel?.update(window.currentTask);
  const scene = window.currentTask.scene;
  if(lastSceneGroupTask !== window.currentTask){
    window.scenePanelHoverTarget=null;
    lastSceneGroupTask = window.currentTask;
    window.activeSceneGroupIndex = null;
  }
  window.updateTextPositions(window.currentTask);
  const selected = window.selectedSceneElement;
  const selectionKey = selected ? `${selected.type}:${selected.index}` : '';
  if(selectionKey !== lastSceneSelectionKey){
    expandedSceneType = selected?.type || null;
    lastSceneSelectionKey = selectionKey;
    window.activeSceneGroupIndex = null;
  }
  if(window.sceneEditor) window.sceneEditor.checkTask();
  
  // Helper to expand short hex colors to full format
  function expandHexColor(color) {
    if (!color || color.length === 7) return color; // Already full format
    if (color.startsWith('#') && color.length === 4) {
      // #RGB -> #RRGGBB
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }
    return color || '#222222';
  }
  
  function coordinatePreview(point){
    if(!Array.isArray(point) || point.length < 2 || !point.slice(0,2).every(Number.isFinite)) return '';
    return `(${point[0]}-${point[1]})`;
  }

  function getPreview(type,obj){
    if(type === 'text') return String(obj.txt || '');
    if(type === 'plane'){
      const dirPoint=obj.dirPoint || [
        obj.through[0]+(obj.n_vec?.[0] || 0)*3*(window.GRID_STEP || 20),
        obj.through[1]+(obj.n_vec?.[1] ?? -1)*3*(window.GRID_STEP || 20)
      ];
      return `${coordinatePreview(obj.through)}-${coordinatePreview(dirPoint)}`;
    }
    if(type === 'ellipse') return coordinatePreview(obj.center);
    if(type === 'rect') return coordinatePreview(obj.bottomCenter);
    if(type === 'segment' || type === 'arrow'){
      return `${coordinatePreview(obj.a)}-${coordinatePreview(obj.b)}`;
    }
    if(type === 'point') return coordinatePreview(obj.pos);
    if(type === 'angle') return coordinatePreview(obj.vertex?.pos);
    return '';
  }

  const sceneCollections = {
    plane:'planes',
    rect:'rects', ellipse:'ellipses', segment:'segments', arrow:'arrows',
    text:'texts', point:'points', angle:'angles'
  };
  const sceneElementLabels = {
    plane:'plane', rect:'rect', ellipse:'ellipse', segment:'segment',
    arrow:'arrow', text:'txt', point:'point', angle:'angle'
  };
  function getSceneElement(type,index){
    if(!Object.hasOwn(sceneCollections,type)) return null;
    const collection=sceneCollections[type];
    if(!collection || !Number.isInteger(index) || index<0) return null;
    return scene[collection]?.[index] || null;
  }
  function getSceneElementById(type,id){
    const collection=sceneCollections[type];
    return collection ? scene[collection]?.find(object=>object?.id===id)||null : null;
  }
  function memberReference(member){
    const type=member?.type;
    if(!Object.hasOwn(sceneElementLabels,type)) return 'Ukjent element';
    const label=sceneElementLabels[type];
    const collection=sceneCollections[type];
    const index=scene[collection]?.findIndex(object=>object?.id===member.id) ?? -1;
    return label && index>=0 ? `${label} ${index+1}` : 'Ukjent element';
  }
  function selectedSceneMember(){
    const selected=window.selectedSceneElement;
    if(window.activePanel!=='scene') return null;
    if(!selected || !(Object.hasOwn(sceneCollections,selected.type) || selected.type==='plane')) return null;
    if(selected.type==='text' && scene.texts?.[selected.index]?._isShortLines) return null;
    const object=getSceneElement(selected.type,selected.index);
    if(!object?.id) return null;
    return {type:selected.type,id:object.id};
  }
  function groupPreview(group){
    const description=String(group.description || '').trim();
    if(description) return description;
    const references=(Array.isArray(group.members) ? group.members : []).map(memberReference);
    return references.length ? references.join(', ') : 'Tom gruppe';
  }
  function refreshGroupPreview(preview,group){
    preview.textContent=groupPreview(group);
    preview.title=preview.textContent;
  }

  function addSceneGroups(){
    if(!Array.isArray(scene.groups)) return;
    scene.groups.forEach((groupData,groupIndex)=>{
      if(!groupData || typeof groupData!=='object') return;
      if(!Array.isArray(groupData.members)) groupData.members=[];
      const section=document.createElement('section');
      section.className='scene-group';
      section.dataset.index=groupIndex;

      const header=document.createElement('div');
      header.className='scene-group-header';
      const toggle=document.createElement('button');
      toggle.type='button';
      toggle.className='scene-group-toggle';
      const title=document.createElement('span');
      title.className='scene-group-title';
      title.textContent=`Gruppe ${groupIndex+1}`;
      const preview=document.createElement('span');
      preview.className='scene-group-preview';
      refreshGroupPreview(preview,groupData);
      toggle.append(title,preview);
      const controls=document.createElement('div');
      controls.className='scene-group-controls';

      const addButton=document.createElement('button');
      addButton.type='button';
      addButton.className='scene-group-control';
      addButton.textContent='+';
      const currentSelection=selectedSceneMember();
      const alreadyMember=!!currentSelection && groupData.members.some(existing=>
        existing?.type===currentSelection.type && existing.id===currentSelection.id);
      addButton.title=alreadyMember ? 'Elementet er allerede i gruppen'
        : 'Legg valgt sceneelement til gruppen';
      addButton.setAttribute('aria-label',addButton.title);
      addButton.disabled=!currentSelection || alreadyMember;
      addButton.addEventListener('click',event=>{
        event.stopPropagation();
        const member=selectedSceneMember();
        if(!member) return;
        if(groupData.members.some(existing=>existing?.type===member.type &&
          existing.id===member.id)){
          window.activeSceneGroupIndex=groupIndex;
          updateScenePanel();
          return;
        }
        groupData.members.push(member);
        window.activeSceneGroupIndex=groupIndex;
        window.markEdited?.('task');
        updateScenePanel();
        window.updateAppState?.();
      });

      const deleteButton=document.createElement('button');
      deleteButton.type='button';
      deleteButton.className='scene-group-control';
      deleteButton.textContent='🗑️';
      deleteButton.title='Slett gruppen';
      deleteButton.setAttribute('aria-label',deleteButton.title);
      deleteButton.addEventListener('click',event=>{
        event.stopPropagation();
        scene.groups.splice(groupIndex,1);
        if(window.activeSceneGroupIndex===groupIndex) window.activeSceneGroupIndex=null;
        else if(Number.isInteger(window.activeSceneGroupIndex) &&
          window.activeSceneGroupIndex>groupIndex) window.activeSceneGroupIndex--;
        window.markEdited?.('task');
        updateScenePanel();
        window.updateAppState?.();
      });
      controls.append(addButton,deleteButton);
      header.append(toggle,controls);

      const items=document.createElement('div');
      items.className='scene-group-items';
      const expanded=window.activeSceneGroupIndex===groupIndex;
      items.hidden=!expanded;
      toggle.setAttribute('aria-expanded',String(expanded));
      toggle.addEventListener('click',()=>{
        window.activeSceneGroupIndex=expanded ? null : groupIndex;
        updateScenePanel();
      });

      if(expanded){
        const description=document.createElement('input');
        description.type='text';
        description.className='scene-group-description';
        description.placeholder='Skriv beskrivelse for gruppen';
        description.setAttribute('aria-label',`Beskrivelse for gruppe ${groupIndex+1}`);
        description.value=String(groupData.description || '');
        description.addEventListener('input',()=>{
          groupData.description=description.value;
          refreshGroupPreview(preview,groupData);
          window.markEdited?.('task');
        });
        items.appendChild(description);
        groupData.members.forEach((member,memberIndex)=>{
          const type=member?.type;
          const object=getSceneElementById(type,member?.id);
          const index=object ? scene[sceneCollections[type]].indexOf(object) : -1;
          const row=document.createElement('div');
          row.className='scene-group-member';
          row.dataset.type=type || '';
          if(index>=0) row.dataset.index=index;
          if(window.selectedSceneElement?.type===type &&
            (window.selectedSceneElement?.index ?? 0)===(index ?? 0)) row.classList.add('selected');
          const reference=document.createElement('button');
          reference.type='button';
          reference.className='scene-group-member-reference';
          bindScenePanelHoverTarget(reference,type,index);
          reference.textContent=memberReference(member);
          reference.disabled=!object;
          reference.setAttribute('aria-label',`Velg ${reference.textContent}`);
          reference.addEventListener('click',()=>{
            if(!object) return;
            window.selectedSceneElement={type,index:index ?? 0,obj:object};
            window.activeSceneGroupIndex=groupIndex;
            expandedSceneType=null;
            window.setActivePanel('scene');
            lastSceneSelectionKey=`${type}:${index ?? 0}`;
            updateScenePanel();
            window.updateAppState?.();
          });
          reference.addEventListener('dblclick',()=>{
            if(!object) return;
            window.selectedSceneElement={type,index:index ?? 0,obj:object};
            window.activeSceneGroupIndex=null;
            expandedSceneType=type;
            lastSceneSelectionKey=`${type}:${index ?? 0}`;
            updateScenePanel();
            const item=document.querySelector(
              `.scene-item[data-type="${type}"][data-index="${index ?? 0}"]`
            );
            if(item) window.sceneEditor?.revealSelection?.(item);
            window.updateAppState?.();
          });
          const remove=document.createElement('button');
          remove.type='button';
          remove.className='scene-group-remove-member';
          remove.textContent='×';
          remove.title=`Fjern ${reference.textContent} fra gruppen`;
          remove.setAttribute('aria-label',remove.title);
          remove.addEventListener('click',event=>{
            event.stopPropagation();
            groupData.members.splice(memberIndex,1);
            window.activeSceneGroupIndex=groupIndex;
            window.markEdited?.('task');
            updateScenePanel();
            window.updateAppState?.();
          });
          row.append(reference,remove);
          items.appendChild(row);
        });
      }
      section.append(header,items);
      scenePanel.appendChild(section);
    });
  }

  // Helper to add a scene element with an expandable editor and a compact preview.
  function addItem(items,label,type,index,obj) {
    const item = document.createElement('div');
    item.className = 'scene-item';
    item.dataset.type = type;
    item.dataset.index = index !== undefined ? index : 0;
    bindScenePanelHoverTarget(item,type,index);
    
    // Count items of this type to determine if up/down arrows should be enabled
    let typeCount = 0;
    if(type === 'rect') typeCount = (scene.rects || []).length;
    else if(type === 'ellipse') typeCount = (scene.ellipses || []).length;
    else if(type === 'segment') typeCount = (scene.segments || []).length;
    else if(type === 'arrow') typeCount = (scene.arrows || []).length;
    else if(type === 'angle') typeCount = (scene.angles || []).length;
    else if(type === 'point') typeCount = (scene.points || []).length;
    else if(type === 'text') typeCount = (scene.texts || []).filter(t => !t._isShortLines).length;
    
    const isFirst = index === 0;
    const isLast = index === typeCount - 1;
    
    // Header with label and controls
    const header = document.createElement('div');
    header.className = 'scene-item-header';
    header.innerHTML = `
      <span class="scene-item-icon">${getItemIcon(type)}</span>
      <span class="scene-item-label">${label}${index !== undefined ? ` [${index}]` : ''}</span>
      <div class="scene-item-controls">
        <button class="scene-item-control-btn scene-item-arrange-btn" title="Spill opp" data-arrange="up" style="display:none; opacity:${isFirst ? '0.4' : '1'}; cursor:${isFirst ? 'default' : 'pointer'};">▲</button>
        <button class="scene-item-control-btn scene-item-arrange-btn" title="Spill ned" data-arrange="down" style="display:none; opacity:${isLast ? '0.4' : '1'}; cursor:${isLast ? 'default' : 'pointer'};">▼</button>
        <button class="scene-item-control-btn" title="Synlig" data-control="visible" style="display:none;">👁</button>
        <button class="scene-item-control-btn" title="Snap" data-control="snap" style="display:none;">🧲</button>
      </div>
    `;
    function normalizeNormal(vector){
      const length=Math.hypot(...vector);
      return vector.map(value=>value/length);
    }
    
    const preview=document.createElement('span');
    preview.className='scene-item-preview';
    preview.textContent=getPreview(type,obj);
    if(type === 'text') preview.classList.add('scene-item-text-preview');
    else preview.title=preview.textContent;

    // Editor section (hidden by default, shown when selected)
    const editor = document.createElement('div');
    editor.className = 'scene-item-editor';
    editor.innerHTML = getEditorHTML(type, obj, index);
    
    item.appendChild(header);
    header.appendChild(preview);
    item.appendChild(editor);
    
    // Click handler for selection and expanding editor
    header.addEventListener('click', (e) => {
      if(e.target.classList.contains('scene-item-arrange-btn')) return;
      if(e.target.classList.contains('scene-item-control-btn')) return;
      
      window.activeSceneGroupIndex=null;
      scenePanel.querySelectorAll('.scene-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      window.selectedSceneElement = { type, index: index !== undefined ? index : 0, obj };
      window.setActivePanel('scene');
      lastSceneSelectionKey=`${type}:${index !== undefined ? index : 0}`;
      if(expandedSceneType !== type){
        expandedSceneType=type;
        updateScenePanel();
        return;
      }
      // Show arrange buttons when selected
      header.querySelectorAll('.scene-item-arrange-btn').forEach(btn => {
        btn.style.display = 'inline-block';
      });
    });
    
    // Arrange button handlers (up/down arrows)
    header.querySelectorAll('.scene-item-arrange-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const direction = btn.dataset.arrange;
        const arrayKey = type === 'text' ? 'texts' : (type + 's');
        // Use window.currentTask.scene directly instead of closure to avoid stale references
        const currentScene = window.currentTask?.scene;
        const array = currentScene?.[arrayKey];
        
        if(!array) return;
        if(direction === 'up' && index > 0) {
          window.sceneEditor?.cancel();
          window.sceneModel?.remapReferences(window.currentTask, type, index, direction);
          // Swap with previous
          [array[index - 1], array[index]] = [array[index], array[index - 1]];
          window.selectedSceneElement = {type, index: index - 1, obj};
          updateScenePanel();
          window.markEdited && window.markEdited('task');
          window.updateAppState();
        } else if(direction === 'down' && index < array.length - 1) {
          window.sceneEditor?.cancel();
          window.sceneModel?.remapReferences(window.currentTask, type, index, direction);
          // Swap with next
          [array[index], array[index + 1]] = [array[index + 1], array[index]];
          window.selectedSceneElement = {type, index: index + 1, obj};
          updateScenePanel();
          window.markEdited && window.markEdited('task');
          window.updateAppState();
        }
      });
    });
    
    // Wire up editor inputs
    setupEditorInputs(editor, type, index, obj);
    if(type === 'angle' || type === 'point'){
      window.sceneEditor?.buildProperties(editor, type, obj, index);
    }
    
    items.appendChild(item);
    return item;
  }

  function addGroup(label,type,entries){
    if(!entries.length) return;
    const group=document.createElement('section');
    group.className='scene-type-group';
    group.dataset.type=type;
    const header=document.createElement('div');
    header.className='scene-type-header';
    header.setAttribute('role','button');
    header.setAttribute('tabindex','0');
    header.setAttribute('aria-expanded',String(expandedSceneType===type));
    const disclosure=document.createElement('span');
    disclosure.className='scene-type-disclosure';
    disclosure.textContent=expandedSceneType===type ? '▾' : '▸';
    const title=document.createElement('span');
    title.className='scene-type-label';
    title.textContent=`${label} (${entries.length})`;
    header.append(disclosure,title);
    const items=document.createElement('div');
    items.className='scene-type-items';
    items.hidden=expandedSceneType!==type;
    const toggle=()=>{
      window.activeSceneGroupIndex=null;
      if(entries.length===1){
        const entry=entries[0];
        window.selectedSceneElement={type,index:entry.index ?? 0,obj:entry.obj};
        window.setActivePanel('scene');
        expandedSceneType=type;
        lastSceneSelectionKey=`${type}:${entry.index ?? 0}`;
        updateScenePanel();
        return;
      }
      const opening=expandedSceneType!==type;
      if(opening){
        const entry=entries[0];
        window.selectedSceneElement={type,index:entry.index ?? 0,obj:entry.obj};
        window.setActivePanel('scene');
        lastSceneSelectionKey=`${type}:${entry.index ?? 0}`;
      }else{
        window.selectedSceneElement=null;
        lastSceneSelectionKey='';
      }
      expandedSceneType=opening ? type : null;
      updateScenePanel();
    };
    header.addEventListener('click',toggle);
    header.addEventListener('keydown',event=>{
      if(event.key==='Enter' || event.key===' '){
        event.preventDefault();
        toggle();
      }
    });
    group.append(header,items);
    scenePanel.appendChild(group);
    entries.forEach(entry=>addItem(items,label,type,entry.index,entry.obj));
  }
  
  // Helper to get icon for each type
  function getItemIcon(type) {
    const icons = {
      'plane': '─', 'rect': '▭', 'ellipse': '⬭',
      'segment': '─', 'arrow': '→', 'text': 'T', 'angle': '∠', 'point': '•'
    };
    return icons[type] || '◆';
  }

  function sceneElementNormal(scene,type,index){
    const element=type==='plane' ? scene?.planes?.[index]
      : type==='rect' ? scene?.rects?.[index]
        : type==='ellipse' ? scene?.ellipses?.[index] : null;
    if(!element) return null;
    let normal=element.n_vec;
    if((!Array.isArray(normal) || normal.length!==2 ||
        !normal.every(Number.isFinite) || Math.hypot(...normal)<=1e-8) &&
       Array.isArray(element.t_vec) && element.t_vec.length===2 &&
       element.t_vec.every(Number.isFinite) && Math.hypot(...element.t_vec)>1e-8){
      normal=[element.t_vec[1],-element.t_vec[0]];
    }
    if(type==='plane' && (!normal || Math.hypot(...normal)<=1e-8) &&
       Number.isFinite(element.angleDeg)){
      const angle=element.angleDeg*Math.PI/180;
      normal=[-Math.sin(angle),-Math.cos(angle)];
    }
    if((!Array.isArray(normal) || normal.length!==2 ||
        !normal.every(Number.isFinite) || Math.hypot(...normal)<=1e-8) &&
       (type==='rect' || type==='ellipse')){
      normal=[0,-1];
    }
    if(!Array.isArray(normal) || normal.length!==2 ||
       !normal.every(Number.isFinite) || Math.hypot(...normal)<=1e-8) return null;
    const length=Math.hypot(...normal);
    return normal.map(value=>value/length);
  }
  window.sceneElementNormal=sceneElementNormal;
  
  // Helper to get editor HTML for each type
  function getEditorHTML(type, obj, index) {
    if(type === 'angle' || type === 'point') return '';
    function coordinatesHTML(vector, position, label, pointLabel = label, readOnly = false) {
      return `
        <div class="scene-editor-row">
          <label class="scene-coordinate-point">${pointLabel}</label>
          <label class="scene-coordinate-axis">x:</label>
          <input type="number" class="scene-editor-input scene-coordinate-input" data-field="coordinates" data-vector="${vector}" data-axis="0" data-type="${type}" data-idx="${index ?? ''}" value="${position?.[0] ?? 0}" step="any" aria-label="${label} x" ${readOnly ? 'readonly' : ''} />
          <label class="scene-coordinate-axis">y:</label>
          <input type="number" class="scene-editor-input scene-coordinate-input" data-field="coordinates" data-vector="${vector}" data-axis="1" data-type="${type}" data-idx="${index ?? ''}" value="${position?.[1] ?? 0}" step="any" aria-label="${label} y" ${readOnly ? 'readonly' : ''} />
        </div>
      `;
    }
    function colorHTML(field, value, label) {
      return `<div class="scene-editor-row"><label>${label}</label>
        <input type="color" class="scene-editor-input scene-color-input" data-field="${field}" data-type="${type}" data-idx="${index}" value="${expandHexColor(value)}" aria-label="${label}" /></div>`;
    }
    function lineWidthHTML(value) {
      return `<div class="scene-editor-row"><label>Linje px:</label>
        <input type="number" class="scene-editor-input scene-line-width" data-field="lineWidth" data-type="${type}" data-idx="${index}" value="${value ?? 2}" min="0.5" max="10" step="0.5" aria-label="Linjetykkelse i piksler" /></div>`;
    }
    function lineWidthAndStyleHTML(value, body) {
      return `<div class="scene-editor-row"><label>Linje px:</label>
        <input type="number" class="scene-editor-input scene-line-width" data-field="lineWidth" data-type="${type}" data-idx="${index}" value="${value ?? 2}" min="0.5" max="10" step="0.5" aria-label="Linjetykkelse i piksler" />
        <label class="scene-inline-label">Stil:</label>
        <select class="scene-editor-input scene-line-style" data-field="body" data-type="${type}" data-idx="${index}" aria-label="Linjestil" title="Heltrukken / stiplet">
          <option value="solid" ${(body !== 'dashed' ? 'selected' : '')}>━━━━</option>
          <option value="dashed" ${(body === 'dashed' ? 'selected' : '')}>- - -</option>
        </select></div>`;
    }
    function arrowHeadSizeHTML(value) {
      return `<div class="scene-editor-row"><label>Pilhode px:</label>
        <input type="number" class="scene-editor-input scene-line-width" data-field="arrowHeadLength" data-type="arrow" data-idx="${index}" value="${value ?? 12}" min="4" max="40" step="1" aria-label="Pilhodelengde i piksler" /></div>`;
    }
    function lineStyleHTML(value) {
      return `<div class="scene-editor-row"><label>Linjestil:</label>
        <select class="scene-editor-input scene-line-style" data-field="body" data-type="${type}" data-idx="${index}" aria-label="Linjestil" title="Heltrukken / stiplet">
          <option value="solid" ${(value !== 'dashed' ? 'selected' : '')}>━━━━</option>
          <option value="dashed" ${(value === 'dashed' ? 'selected' : '')}>- - -</option>
        </select></div>`;
    }
    function snapRowHTML(snapping) {
      return `<div class="scene-editor-row"><label>Snap:</label>
        <input type="checkbox" class="scene-editor-input" data-field="snapping" data-type="${type}" data-idx="${index}" ${snapping ? 'checked' : ''} />
        ${getDeleteButtonHTML()}</div>`;
    }
    // Helper to get delete button HTML for scene elements
    function getDeleteButtonHTML(){
      if(index === undefined) return ''; // No delete for singleton items such as the plane
      return `
        <button class="scene-delete-element-btn" data-type="${type}" data-idx="${index}" title="Slett ${type}" aria-label="Slett ${type}" style="width:24px; height:24px; padding:0; border:1px solid #d32f2f; border-radius:3px; background:#fff; color:#d32f2f; cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center;">🗑️</button>
      `;
    }
    
    if(type === 'text') {
      const textObj = obj;
      const rotationMode = Number.isFinite(textObj.angle_deg) ? 'angle'
        : Array.isArray(textObj.n_vec) && textObj.n_vec.length===2 &&
          textObj.n_vec.every(Number.isFinite) && Math.hypot(...textObj.n_vec)>1e-8
          ? 'normal' : 'none';
      const angle = rotationMode==='angle' ? textObj.angle_deg
        : rotationMode==='normal'
          ? Math.atan2(textObj.n_vec[0],-textObj.n_vec[1])*180/Math.PI : 0;
      const normal = rotationMode==='normal' ? normalizeNormal(textObj.n_vec)
        : rotationMode==='angle'
          ? [Math.sin(textObj.angle_deg*Math.PI/180),-Math.cos(textObj.angle_deg*Math.PI/180)]
          : [0,-1];
      const angleDerived = rotationMode!=='angle';
      const normalDerived = rotationMode!=='normal';
      const textScene=window.currentTask?.scene || {};
      const normalOptions = [
        '<option value="">Velg sceneelement …</option>',
        ...(textScene.planes||[]).flatMap((plane,index)=>sceneElementNormal(textScene,'plane',index)
          ? [`<option value="plane:${plane.id}">Plan ${index+1}</option>`] : []),
        ...(textScene.rects||[]).flatMap((rect,i)=>sceneElementNormal(textScene,'rect',i)
          ? [`<option value="rect:${i}">Rektangel ${i+1}</option>`] : []),
        ...(textScene.ellipses||[]).flatMap((ellipse,i)=>sceneElementNormal(textScene,'ellipse',i)
          ? [`<option value="ellipse:${i}">Ellipse ${i+1}</option>`] : [])
      ].join('');
      return `
        ${coordinatesHTML('pos', textObj.pos, 'Tekst', '', !!textObj.linked)}
        <div class="scene-editor-row">
          <label>Txt:</label>
          <input type="text" class="scene-editor-input" data-field="txt" data-type="text" data-idx="${index}" value="${textObj.txt || ''}" />
        </div>
        <div class="scene-editor-row">
          <label>Size:</label>
          <input type="number" class="scene-editor-input scene-number-input" data-field="size" data-type="text" data-idx="${index}" value="${textObj.size || 14}" />
          <label style="min-width:auto; margin-left:4px;">Farge:</label>
          <input type="color" class="scene-editor-input scene-color-input" data-field="color" data-type="text" data-idx="${index}" value="${expandHexColor(textObj.color || '#222222')}" />
        </div>
        <div class="scene-editor-row">
          <label>Koblet:</label>
          <input type="checkbox" class="scene-editor-input scene-linked-checkbox" data-field="linked" data-type="text" data-idx="${index}" ${(textObj.linked ? 'checked' : '')} ${(index === 0 ? 'disabled' : '')} title="${index === 0 ? 'Første tekst kan ikke være koblet' : ''}" />
          <label class="scene-inline-label">Align:</label>
          <select class="scene-editor-input" data-field="align" data-type="text" data-idx="${index}" style="flex:1; padding:2px 4px; font-size:11px;">
            <option value="left" ${(textObj.align === 'left' ? 'selected' : '')}>left</option>
            <option value="center" ${(textObj.align === 'center' ? 'selected' : '')}>center</option>
            <option value="right" ${(textObj.align === 'right' ? 'selected' : '')}>right</option>
          </select>
        </div>
        <div class="scene-editor-row scene-text-rotation-row">
          <label>Rotasjon °:</label>
          <input type="number" class="scene-editor-input scene-text-angle${angleDerived ? ' scene-rotation-derived' : ''}" data-field="rotationAngle" data-type="text" data-idx="${index}" value="${angle}" step="any" aria-label="Tekstrotasjon i grader" />
          <label class="scene-inline-label">n x/y:</label>
          <input type="number" class="scene-editor-input scene-text-normal${normalDerived ? ' scene-rotation-derived' : ''}" data-field="rotationNormal" data-axis="0" data-type="text" data-idx="${index}" value="${normal[0]}" step="any" aria-label="Tekstnormal x" />
          <input type="number" class="scene-editor-input scene-text-normal${normalDerived ? ' scene-rotation-derived' : ''}" data-field="rotationNormal" data-axis="1" data-type="text" data-idx="${index}" value="${normal[1]}" step="any" aria-label="Tekstnormal y" />
        </div>
        <div class="scene-editor-row">
          <label for="text-normal-source-${index}">Kopier normal fra:</label>
          <select id="text-normal-source-${index}" class="scene-editor-input scene-text-normal-source" data-field="copyNormal" data-type="text" data-idx="${index}" title="Kopierer normalen én gang; teksten kobles ikke til sceneelementet">${normalOptions}</select>
        </div>
        ${snapRowHTML(textObj.snapping)}
      `;
    } else if(type === 'rect') {
      const rectObj = obj;
      return `
        ${coordinatesHTML('bottomCenter', rectObj.bottomCenter, 'Rektangel', 'O')}
        ${colorHTML('color', rectObj.color || '#4090ff', 'Farge:')}
        ${lineWidthHTML(rectObj.lineWidth)}
        ${lineStyleHTML(rectObj.body)}
        ${snapRowHTML(rectObj.snapping)}
      `;
    } else if(type === 'ellipse') {
      const ellObj = obj;
      const center = ellObj.center || [0, 0];
      const tangent = ellObj.t_vec || [1, 0];
      const normal = ellObj.n_vec || [0, -1];
      const axisA = [center[0] + tangent[0] * ellObj.width / 2, center[1] + tangent[1] * ellObj.width / 2];
      const axisB = [center[0] + normal[0] * ellObj.height / 2, center[1] + normal[1] * ellObj.height / 2];
      return `
        ${coordinatesHTML('center', center, 'Ellipse', 'O')}
        <div class="scene-editor-row">
          <label>Lås akser:</label>
          <input type="checkbox" class="scene-editor-input" data-field="lockAxes" data-type="ellipse" data-idx="${index}" ${ellObj.lockAxes ? 'checked' : ''} aria-label="Lås ellipseaksene like lange" />
        </div>
        ${coordinatesHTML('axisA', axisA, 'A')}
        ${coordinatesHTML('axisB', axisB, 'B')}
        <div class="scene-editor-row" title="Parametervinkler: 0° langs lokal bredderetning; positivt mot klokka. 0–360° er hel ellipse. Like verdier er tom bue.">
          <label class="scene-angle-label">Start °:</label><input type="number" class="scene-editor-input scene-coordinate-input" data-field="startAngleDeg" data-type="ellipse" data-idx="${index}" value="${ellObj.startAngleDeg ?? ''}" step="any" aria-label="Startvinkel, blank betyr 0°" />
          <label class="scene-angle-label">Slutt °:</label><input type="number" class="scene-editor-input scene-coordinate-input" data-field="endAngleDeg" data-type="ellipse" data-idx="${index}" value="${ellObj.endAngleDeg ?? ''}" step="any" aria-label="Sluttvinkel, blank betyr 360°" />
        </div>
        <div class="scene-editor-row scene-ellipse-colors">
          <label>Farge:</label><input type="color" class="scene-editor-input scene-color-input" data-field="color" data-type="ellipse" data-idx="${index}" value="${expandHexColor(ellObj.color || '#4090ff')}" aria-label="Strekfarge" />
          <label class="scene-inline-label">Fyll:</label>
          <input type="checkbox" class="scene-editor-input" data-field="fillEnabled" data-type="ellipse" data-idx="${index}" ${ellObj.fill_color ? 'checked' : ''} aria-label="Fyll på" />
          <input type="color" class="scene-editor-input scene-color-input" data-field="fill_color" data-type="ellipse" data-idx="${index}" value="${expandHexColor(ellObj.fill_color || '#4090ff')}" ${ellObj.fill_color ? '' : 'disabled'} aria-label="Fyllfarge" />
        </div>
        ${lineWidthAndStyleHTML(ellObj.lineWidth,ellObj.body)}
        ${snapRowHTML(ellObj.snapping)}
      `;
    } else if(type === 'segment') {
      const segObj = obj;
      return `
        ${coordinatesHTML('a', segObj.a, 'Segment', 'A')}
        ${coordinatesHTML('b', segObj.b, 'Segment', 'B')}
        ${colorHTML('color', segObj.color || '#222222', 'Farge:')}
        ${lineWidthAndStyleHTML(segObj.lineWidth,segObj.body)}
        ${snapRowHTML(segObj.snapping)}
      `;
    } else if(type === 'arrow') {
      const arrObj = obj;
      return `
        ${coordinatesHTML('a', arrObj.a, 'Pil', 'A')}
        ${coordinatesHTML('b', arrObj.b, 'Pil', 'B')}
        ${colorHTML('color', arrObj.color || '#00f', 'Farge:')}
        ${lineWidthAndStyleHTML(arrObj.lineWidth,arrObj.body)}
        ${arrowHeadSizeHTML(arrObj.arrowHeadLength)}
        ${snapRowHTML(arrObj.snapping)}
      `;
    } else if(type === 'plane') {
      const planeObj = obj;
      const directionPoint = planeObj.dirPoint || [
        planeObj.through[0] + (planeObj.n_vec?.[0] || 0) * 3 * (window.GRID_STEP || 20),
        planeObj.through[1] + (planeObj.n_vec?.[1] ?? -1) * 3 * (window.GRID_STEP || 20)
      ];
      return `
        ${coordinatesHTML('through', planeObj.through, 'Plan', 'O')}
        ${coordinatesHTML('dirPoint', directionPoint, 'Plan', 'P')}
        <div class="scene-editor-row">
          <label>Synlig:</label>
          <input type="checkbox" class="scene-editor-input" data-field="draw" data-type="plane" data-idx="${index}" ${planeObj.draw ? 'checked' : ''} />
          <label class="scene-inline-label">Farge:</label>
          <input type="color" class="scene-editor-input" data-field="color" data-type="plane" data-idx="${index}" value="${expandHexColor(planeObj.color || '#777777')}" style="width:40px; padding:2px;" />
        </div>
        ${lineWidthAndStyleHTML(planeObj.lineWidth ?? 4,planeObj.body)}
      `;
    }
    return '';
  }
  
  // Helper to wire up editor inputs
  function setupEditorInputs(editor, type, index, obj) {
    const inputs = editor.querySelectorAll('.scene-editor-input');
    function refreshTextRotationInputs(text,skipInput=null){
      const angleInput=editor.querySelector('.scene-text-angle');
      const normalInputs=editor.querySelectorAll('.scene-text-normal');
      if(!angleInput || normalInputs.length<2) return;
      const mode=Number.isFinite(text.angle_deg) ? 'angle'
        : Array.isArray(text.n_vec) && text.n_vec.length===2 &&
          text.n_vec.every(Number.isFinite) && Math.hypot(...text.n_vec)>1e-8
          ? 'normal' : 'none';
      const normal=mode==='normal' ? normalizeNormal(text.n_vec)
        : mode==='angle'
          ? [Math.sin(text.angle_deg*Math.PI/180),-Math.cos(text.angle_deg*Math.PI/180)]
          : [0,-1];
      const angle=mode==='angle' ? text.angle_deg
        : mode==='normal' ? Math.atan2(normal[0],-normal[1])*180/Math.PI : 0;
      if(angleInput!==skipInput) angleInput.value=String(angle);
      normalInputs.forEach(input=>{
        const axis=Number(input.dataset.axis);
        if(input!==skipInput) input.value=String(normal[axis]);
        input.classList?.toggle('scene-rotation-derived',mode!=='normal');
      });
      angleInput.classList?.toggle('scene-rotation-derived',mode!=='angle');
    }
    function normalizeNormal(vector){
      const length=Math.hypot(...vector);
      return vector.map(value=>value/length);
    }
    function refreshCoordinateInputs(){
      const scene = window.currentTask?.scene;
      const target = scene?.[sceneCollections[type]]?.[index];
      if(!target) return;
      const positions = {};
      if(type === 'plane'){
        positions.through = target.through;
        positions.dirPoint = target.dirPoint || [
          target.through[0] + (target.n_vec?.[0] || 0) * 3 * (window.GRID_STEP || 20),
          target.through[1] + (target.n_vec?.[1] ?? -1) * 3 * (window.GRID_STEP || 20)
        ];
      } else if(type === 'ellipse'){
        const center = target.center || [0, 0];
        const tangent = target.t_vec || [1, 0], normal = target.n_vec || [0, -1];
        positions.center = center;
        positions.axisA = [center[0] + tangent[0] * target.width / 2, center[1] + tangent[1] * target.width / 2];
        positions.axisB = [center[0] + normal[0] * target.height / 2, center[1] + normal[1] * target.height / 2];
      } else {
        positions.bottomCenter = target.bottomCenter;
        positions.a = target.a;
        positions.b = target.b;
        positions.pos = target.pos;
      }
      editor.querySelectorAll('.scene-coordinate-input').forEach(field => {
        const position = positions[field.dataset.vector];
        const axis = Number(field.dataset.axis);
        if(position && Number.isFinite(position[axis])) field.value = position[axis];
      });
    }
    function refreshSceneState(){
      refreshCoordinateInputs();
      const target=window.currentTask?.scene?.[sceneCollections[type]]?.[index];
      const preview=editor.closest?.('.scene-item')?.querySelector('.scene-item-preview');
      if(target && preview){
        preview.textContent=getPreview(type,target);
        if(type !== 'text') preview.title=preview.textContent;
      }
      window.updateAppState?.({preserveScenePanel:true});
    }
    inputs.forEach(input => {
      // Real-time input for text fields (txt, size, color, align)
      input.addEventListener('input', (e) => {
        const field = input.dataset.field;
        const fieldType = input.dataset.type;
        const idx = parseInt(input.dataset.idx);
        // Use window.currentTask.scene directly instead of closure to avoid stale references
        const currentScene = window.currentTask?.scene;
        
        if(fieldType === 'text' && currentScene?.texts?.[idx]) {
          if(field==='rotationAngle'){
            if(input.value.trim()==='') return;
            const angle=Number(input.value);
            if(!Number.isFinite(angle)) return;
            currentScene.texts[idx].angle_deg=angle;
            delete currentScene.texts[idx].n_vec;
            window.markEdited?.('task');
            refreshTextRotationInputs(currentScene.texts[idx],input);
            return;
          }
          if(field==='rotationNormal'){
            const components=Array.from(editor.querySelectorAll('.scene-text-normal'))
              .map(control=>control===input ? input.value : control.value);
            if(components.some(value=>String(value).trim()==='')) return;
            const vector=components.map(Number);
            const length=window.geometry.length(vector);
            if(!vector.every(Number.isFinite) || length<=1e-8) return;
            currentScene.texts[idx].n_vec=vector.map(value=>value/length);
            delete currentScene.texts[idx].angle_deg;
            window.markEdited?.('task');
            refreshTextRotationInputs(currentScene.texts[idx],input);
            return;
          }
          if(field==='copyNormal') return;
          if(field === 'coordinates') return;
          if(input.type === 'number') {
            currentScene.texts[idx][field] = parseInt(input.value) || 14;
          } else if(input.type !== 'checkbox') {
            currentScene.texts[idx][field] = input.value;
          }
          if(field === 'txt'){
            const preview=editor.closest?.('.scene-item')?.querySelector('.scene-item-preview');
            if(preview){
              preview.textContent=input.value;
            }
          }
          window.markEdited && window.markEdited('task');
          window.refreshSceneTextCoordinates();
        }
      });
      
      // Change event for color and selects
      input.addEventListener('change', (e) => {
        const field = input.dataset.field;
        const fieldType = input.dataset.type;
        const idx = parseInt(input.dataset.idx);
        // Use window.currentTask.scene directly instead of closure to avoid stale references
        const currentScene = window.currentTask?.scene;
        if(fieldType==='text' && currentScene?.texts?.[idx] &&
           (field==='rotationAngle' || field==='rotationNormal')){
          const text=currentScene.texts[idx];
          if(field==='rotationAngle' && input.value.trim()===''){
            delete text.angle_deg;
            delete text.n_vec;
            input.setCustomValidity('');
            refreshTextRotationInputs(text);
            window.markEdited?.('task');
            refreshSceneState();
            return;
          }
          if(field==='rotationNormal' && input.value.trim()===''){
            delete text.angle_deg;
            delete text.n_vec;
            input.setCustomValidity('');
            refreshTextRotationInputs(text);
            window.markEdited?.('task');
            refreshSceneState();
            return;
          }
          if(field==='rotationAngle'){
            const angle=Number(input.value);
            if(!Number.isFinite(angle)){
              input.setCustomValidity('Oppgi en endelig vinkel i grader.');
              input.reportValidity();
              return;
            }
            input.setCustomValidity('');
            text.angle_deg=angle;
            delete text.n_vec;
          } else {
            const components=Array.from(editor.querySelectorAll('.scene-text-normal'))
              .map(control=>control.value.trim()==='' ? NaN : Number(control.value));
            if(!components.every(Number.isFinite) || window.geometry.length(components)<=1e-8){
              input.setCustomValidity('Oppgi to endelige normalverdier som ikke begge er null.');
              input.reportValidity();
              return;
            }
            input.setCustomValidity('');
            const length=window.geometry.length(components);
            text.n_vec=components.map(value=>value/length);
            delete text.angle_deg;
          }
          window.markEdited?.('task');
          refreshTextRotationInputs(text,input);
          refreshSceneState();
          return;
        }
        if(fieldType==='text' && currentScene?.texts?.[idx] && field==='copyNormal'){
          const scene=currentScene;
          const [kind,reference]=input.value.split(':');
          const planeIndex=kind==='plane'
            ? (scene.planes||[]).findIndex(plane=>plane.id===reference) : -1;
          const index=kind==='plane' ? planeIndex : Number(reference);
          const vector=index>=0 ? window.sceneElementNormal(scene,kind,index) : null;
          if(!Array.isArray(vector) || vector.length!==2 ||
             !vector.every(Number.isFinite) || window.geometry.length(vector)<=1e-8){
            input.setCustomValidity('Elementet har ingen gyldig normal å kopiere.');
            input.reportValidity();
            input.value='';
            return;
          }
          input.setCustomValidity('');
          const length=window.geometry.length(vector);
          currentScene.texts[idx].n_vec=vector.map(value=>value/length);
          delete currentScene.texts[idx].angle_deg;
          input.value='';
          window.markEdited?.('task');
          refreshTextRotationInputs(currentScene.texts[idx]);
          refreshSceneState();
          return;
        }
        if(field === 'coordinates'){
          if(input.readOnly) return;
          const vector = input.dataset.vector;
          const axis = Number(input.dataset.axis);
          const value = Number(input.value);
          if(input.value.trim() === '' || !Number.isFinite(value) || ![0, 1].includes(axis)){
            input.setCustomValidity('Oppgi en gyldig koordinat.');
            input.reportValidity();
            return;
          }
          const target = fieldType === 'plane'
            ? currentScene?.planes?.find(plane => plane.id === currentScene.activePlaneId)
            : currentScene?.[fieldType + 's']?.[idx];
          if(!target) return;
          input.setCustomValidity('');
          if(fieldType === 'plane' && vector === 'through'){
            const position = target.through;
            const delta = value - position[axis];
            position[axis] = value;
            if(Array.isArray(target.dirPoint)) target.dirPoint[axis] += delta;
          } else {
            if(fieldType === 'plane' && vector === 'dirPoint' && !Array.isArray(target.dirPoint)){
              const normal = target.n_vec || [0, -1];
              const step = 3 * (window.GRID_STEP || 20);
              target.dirPoint = [
                target.through[0] + normal[0] * step,
                target.through[1] + normal[1] * step
              ];
            }
            if(fieldType === 'ellipse' && (vector === 'axisA' || vector === 'axisB')){
              const center = target.center;
              const basis = vector === 'axisA' ? target.t_vec || [1, 0] : target.n_vec || [0, -1];
              const radius = (vector === 'axisA' ? target.width : target.height) / 2;
              const endpoint = [center[0] + basis[0] * radius, center[1] + basis[1] * radius];
              endpoint[axis] = value;
              const direction = [endpoint[0] - center[0], endpoint[1] - center[1]];
              const length = window.geometry.length(direction);
              if(length <= 0.01){
                input.setCustomValidity('A- og B-punktet må ligge et stykke fra sentrum.');
                input.reportValidity();
                return;
              }
              input.setCustomValidity('');
              window.sceneModel.setEllipseAxisLength(
                target,vector === 'axisA' ? 'width' : 'height',length*2);
              if(vector === 'axisA'){
                target.t_vec = [direction[0] / length, direction[1] / length];
                target.n_vec = window.geometry.normalFromTangent(target.t_vec);
              } else {
                target.n_vec = [direction[0] / length, direction[1] / length];
                target.t_vec = window.geometry.tangentFromNormal(target.n_vec);
              }
              window.markEdited?.('task');
              refreshSceneState();
              return;
            }
            const position = target[vector];
            if(!Array.isArray(position) || position.length < 2) return;
            if(fieldType === 'plane' && vector === 'dirPoint'){
              const nextPosition = position.slice();
              nextPosition[axis] = value;
              const direction = [nextPosition[0] - target.through[0], nextPosition[1] - target.through[1]];
              const length = window.geometry.length(direction);
              if(length <= 0.01){
                input.setCustomValidity('Retningspunktet må ligge et stykke fra gjennom-punktet.');
                input.reportValidity();
                return;
              }
              position[axis] = value;
              target.n_vec = [direction[0] / length, direction[1] / length];
              target.t_vec = window.geometry.tangentFromNormal(target.n_vec);
            } else {
              position[axis] = value;
            }
          }
          window.markEdited?.('task');
          refreshSceneState();
          return;
        }
        if(fieldType === 'ellipse' &&
           (field === 'fillEnabled' || field === 'fill_color' || field === 'startAngleDeg' || field === 'endAngleDeg')){
          const target = currentScene?.[fieldType + 's']?.[idx];
          if(!target) return;
          if(field === 'fillEnabled'){
            const color = editor.querySelector('[data-field="fill_color"]');
            if(input.checked) target.fill_color = color.value;
            else delete target.fill_color;
            color.disabled = !input.checked;
          } else if(field === 'fill_color'){
            target.fill_color = input.value;
          } else {
            if(fieldType === 'ellipse' && input.value.trim()===''){
              delete target[field];
              input.setCustomValidity('');
              window.markEdited?.('task');
              window.updateAppState?.({preserveScenePanel:true});
              return;
            }
            const value = Number(input.value);
            if(input.value.trim() === '' || !Number.isFinite(value)){
              input.setCustomValidity('Oppgi en endelig vinkel i grader.');
              input.reportValidity();
              return;
            }
            input.setCustomValidity('');
            target[field] = value;
          }
          window.markEdited?.('task');
          window.updateAppState?.();
          return;
        }
        
        if(fieldType === 'text' && currentScene?.texts?.[idx]) {
          if(input.type === 'checkbox') {
            window.updateTextPositions(window.currentTask);
            currentScene.texts[idx][field] = input.checked;
          } else if(input.type === 'color') {
            currentScene.texts[idx][field] = input.value;
          } else if(input.type === 'number') {
            currentScene.texts[idx][field] = parseInt(input.value) || 14;
          } else {
            currentScene.texts[idx][field] = input.value;
          }
          window.markEdited && window.markEdited('task');
          window.refreshSceneTextCoordinates();
        } else if(fieldType === 'rect' && currentScene?.rects?.[idx]) {
          if(input.type === 'checkbox') {
            currentScene.rects[idx][field] = input.checked;
          } else if(input.type === 'color') {
            currentScene.rects[idx][field] = input.value;
          } else if(input.type === 'number') {
            currentScene.rects[idx][field] = parseFloat(input.value) || 2;
          } else if(input.tagName === 'SELECT') {
            currentScene.rects[idx][field] = input.value;
          }
          window.markEdited && window.markEdited('task');
        } else if(fieldType === 'ellipse' && currentScene?.ellipses?.[idx]) {
          if(field === 'lockAxes'){
            const ellipse = currentScene.ellipses[idx];
            ellipse.lockAxes = input.checked;
            if(input.checked) window.sceneModel.setEllipseAxisLength(ellipse,'width',ellipse.width);
            window.markEdited?.('task');
            refreshSceneState();
            return;
          }
          if(input.type === 'checkbox') {
            currentScene.ellipses[idx][field] = input.checked;
          } else if(input.type === 'color') {
            currentScene.ellipses[idx][field] = input.value;
          } else if(input.type === 'number') {
            currentScene.ellipses[idx][field] = parseFloat(input.value) || 2;
          } else if(input.tagName === 'SELECT') {
            currentScene.ellipses[idx][field] = input.value;
          }
          window.markEdited && window.markEdited('task');
        } else if(fieldType === 'segment' && currentScene?.segments?.[idx]) {
          if(input.type === 'checkbox') {
            currentScene.segments[idx][field] = input.checked;
          } else if(input.type === 'color') {
            currentScene.segments[idx][field] = input.value;
          } else if(input.type === 'number') {
            currentScene.segments[idx][field] = parseFloat(input.value) || 2;
          } else if(input.tagName === 'SELECT') {
            currentScene.segments[idx][field] = input.value;
          }
          window.markEdited && window.markEdited('task');
        } else if(fieldType === 'arrow' && currentScene?.arrows?.[idx]) {
          if(input.type === 'checkbox') {
            currentScene.arrows[idx][field] = input.checked;
          } else if(input.type === 'color') {
            currentScene.arrows[idx][field] = input.value;
          } else if(input.type === 'number') {
            currentScene.arrows[idx][field] = parseFloat(input.value) || 2;
          } else if(input.tagName === 'SELECT') {
            currentScene.arrows[idx][field] = input.value;
          }
          window.markEdited && window.markEdited('task');
        } else if(fieldType === 'plane' && currentScene?.plane) {
          if(input.type === 'checkbox') {
            currentScene.plane[field] = input.checked;
          } else if(input.type === 'color') {
            currentScene.plane[field] = input.value;
          } else if(input.type === 'number') {
            currentScene.plane[field] = parseFloat(input.value) || 4;
          } else if(input.tagName === 'SELECT') {
            currentScene.plane[field] = input.value;
          }
          window.markEdited && window.markEdited('task');
        }
      });
    });

    // Delete button handler for scene elements
    const deleteButtons = editor.querySelectorAll('.scene-delete-element-btn');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const btnType = btn.dataset.type;
        const btnIdx = parseInt(btn.dataset.idx);
        // Use window.currentTask.scene directly instead of closure to avoid stale references
        const currentScene = window.currentTask?.scene;
        window.sceneEditor?.cancel();
        window.sceneModel?.remapReferences(window.currentTask, btnType, btnIdx, 'delete');
        
        if(btnType === 'text' && currentScene?.texts?.[btnIdx]) {
          // Behold neste teksts beregnede posisjon når kjedens første tekst slettes.
          window.updateTextPositions(window.currentTask);
          const next = currentScene.texts[btnIdx + 1];
          if(btnIdx === 0 && next?.linked){
            next.linked = false;
          }
          currentScene.texts.splice(btnIdx, 1);
        } else if(btnType === 'rect' && currentScene?.rects?.[btnIdx]) {
          currentScene.rects.splice(btnIdx, 1);
        } else if(btnType === 'ellipse' && currentScene?.ellipses?.[btnIdx]) {
          currentScene.ellipses.splice(btnIdx, 1);
        } else if(btnType === 'segment' && currentScene?.segments?.[btnIdx]) {
          currentScene.segments.splice(btnIdx, 1);
        } else if(btnType === 'arrow' && currentScene?.arrows?.[btnIdx]) {
          currentScene.arrows.splice(btnIdx, 1);
        }
        
        // Clear selection since element is deleted
        window.selectedSceneElement = null;
        
        window.markEdited && window.markEdited('task');
        updateScenePanel();
        window.updateAppState();
        
        // Force immediate canvas redraw
        window.requestAnimationFrame(() => {});
      });
    });
  }
  
  // Task metadata fields (Id, Title, Category)
  if(window.currentTask) {
    const metaEditor = document.createElement('div');
    metaEditor.className = 'scene-item';
    metaEditor.style.marginBottom = '8px';
    const titleVal = window.currentTask.title || '';
    const subTitleVal = window.currentTask.taskSubTitle || window.currentTask.subTitle || '';
    const categoryVal = window.currentTask.category || '';
    metaEditor.innerHTML = `
      <div class="scene-editor-row">
        <label>Oppgave-Tittel:</label>
        <input type="text" id="task-title-input" class="scene-editor-input" style="flex:1; padding:2px 4px; font-size:11px;" />
      </div>
      <div class="scene-editor-row">
        <label>Undertittel:</label>
        <input type="text" id="task-subtitle-input" class="scene-editor-input" value="${subTitleVal}" style="flex:1; padding:2px 4px; font-size:11px;" />
      </div>
      <div class="scene-editor-row">
        <label>Kategori:</label>
        <input type="text" id="task-category-input" class="scene-editor-input" value="${categoryVal}" style="flex:1; padding:2px 4px; font-size:11px;" />
      </div>
    `;
    scenePanel.appendChild(metaEditor);
    metaEditor.querySelector('#task-title-input').value = titleVal;
    
    // Wire up metadata input handlers
    const titleInput = metaEditor.querySelector('#task-title-input');
    const subtitleInput = metaEditor.querySelector('#task-subtitle-input');
    const categoryInput = metaEditor.querySelector('#task-category-input');
    
    if(titleInput) {
      titleInput.addEventListener('change', () => {
        window.currentTask.title = titleInput.value;
        if(window.tasks && window.currentTaskIndex !== undefined){
          const task = window.tasks.find(t => t.id === window.currentTask.id);
          if(task) task.title = titleInput.value;
        }
        window.markEdited && window.markEdited('task');
        updateHelpButton();
        if(window.updateTaskOrderList){
          window.updateTaskOrderList();
        }
      });
    }
    
    if(subtitleInput) {
      subtitleInput.addEventListener('change', () => {
        window.currentTask.taskSubTitle = subtitleInput.value;
        window.currentTask.subTitle = subtitleInput.value;
        // Also update in window.tasks array
        if(window.tasks && window.currentTaskIndex !== undefined){
          const task = window.tasks.find(t => t.id === window.currentTask.id);
          if(task){
            task.taskSubTitle = subtitleInput.value;
            task.subTitle = subtitleInput.value;
          }
        }
        window.markEdited && window.markEdited('task');
        // Update task order list if it exists
        if(window.updateTaskOrderList){
          window.updateTaskOrderList();
        }
      });
    }
    
    if(categoryInput) {
      categoryInput.addEventListener('change', () => {
        window.currentTask.category = categoryInput.value;
        // Also update in window.tasks array so oppgavelisten reflects the change
        if(window.tasks && window.currentTaskIndex !== undefined){
          const task = window.tasks.find(t => t.id === window.currentTask.id);
          if(task) task.category = categoryInput.value;
        }
        window.markEdited && window.markEdited('task');
        // Update task order list if it exists
        if(window.updateTaskOrderList){
          window.updateTaskOrderList();
        }
      });
    }
  }
  
  addGroup('Plan','plane',(scene.planes || []).map((obj,index)=>({index,obj})));
  addGroup('Rektangel','rect',(scene.rects || []).map((obj,index)=>({index,obj})));
  addGroup('Ellipse','ellipse',(scene.ellipses || []).map((obj,index)=>({index,obj})));
  addGroup('Segment','segment',(scene.segments || []).map((obj,index)=>({index,obj})));
  addGroup('Pil','arrow',(scene.arrows || []).map((obj,index)=>({index,obj})));
  addGroup('txt','text',(scene.texts || []).map((obj,index)=>({index,obj})).filter(entry=>!entry.obj._isShortLines));
  addGroup('Punkt','point',(scene.points || []).map((obj,index)=>({index,obj})));
  addGroup('Vinkel','angle',(scene.angles || []).map((obj,index)=>({index,obj})));
  addSceneGroups();
  if(window.selectedSceneElement && scenePanel){
    const items = scenePanel.querySelectorAll('.scene-item');
    for(const item of items){
      const itemType = item.dataset.type;
      const itemIndex = parseInt(item.dataset.index);
      if(itemType === window.selectedSceneElement.type && itemIndex === window.selectedSceneElement.index){
        item.classList.add('selected');
        // Show arrange buttons when selected
        const header = item.querySelector('.scene-item-header');
        if(header && item.dataset.fixedOrigin !== 'true'){
          header.querySelectorAll('.scene-item-arrange-btn').forEach(btn => {
            btn.style.display = 'inline-block';
          });
        }
        break;
      }
    }
  }
  window.updateEditorPanelHeights?.();
}

window.createSceneGroup=function(){
  const task=window.currentTask;
  if(!window.editorMode || !task?.scene) return;
  const groups=task.scene.groups ||= [];
  groups.push({description:'',members:[]});
  window.selectedSceneElement=null;
  expandedSceneType=null;
  lastSceneSelectionKey='';
  window.activeSceneGroupIndex=groups.length-1;
  window.setActivePanel('scene');
  window.markEdited?.('task');
  updateScenePanel();
  window.updateAppState?.();
};

document.getElementById('btn-add-group')?.addEventListener('click',window.createSceneGroup);

  /**
   * Update help button with current task info
   */
function updateHelpButton(){
  const helpBtn = document.getElementById('btn-help');
  if(!helpBtn || !window.currentTask) return;
  const label = window.getTaskPositionLabel ? window.getTaskPositionLabel(window.currentTask) : `Oppgave ${(window.currentTaskIndex || 0) + 1}`;
  const taskScore = window.taskScores && window.taskScores[window.currentTask.id];
  const buttonLabel = `${label}${taskScore && typeof taskScore.score === 'number' ? ` ${Math.round(taskScore.score * 100)}%` : ''}`;
  const span = helpBtn.querySelector('span');
  if(span) span.textContent = buttonLabel;
  else helpBtn.textContent = `❓ ${buttonLabel}`;
  const helpTitle = document.getElementById('help-title');
  const titleInput = document.getElementById('help-title-input');
  if(helpTitle) helpTitle.textContent = titleInput ? label : `${label}: ${window.currentTask.title || ''}`;
  if(titleInput && titleInput.value !== (window.currentTask.title || '')) titleInput.value = window.currentTask.title || '';
}
window.updateTaskHeader = updateHelpButton;

// ===== Help Lines Canvas Rendering =====

// Setup help lines editor with auto-save
function setupHelpLinesEditor(){
  const textarea = document.getElementById('help-lines-text');
  if(textarea){
    // Auto-save on input
    textarea.addEventListener('input', ()=>{
      textarea.rows = Math.max(2, textarea.value.split('\n').length);
      window.markEdited && window.markEdited('help');
      window.updateHelpPanelLayout();
    });
    textarea.rows = Math.max(2, textarea.value.split('\n').length);
    // Focus on textarea
    textarea.focus();
    window.updateHelpPanelLayout();
  }
}

function getHelpPanelLines(){
  const textarea = document.getElementById('help-lines-text');
  if(textarea) return textarea.value.split('\n');
  return Array.isArray(window.currentTask?.help_lines) ? window.currentTask.help_lines : [];
}

function splitHelpLineWords(line){
  const words = [];
  let word = '';
  let braceDepth = 0;
  for(const character of String(line)){
    if(/\s/.test(character) && braceDepth === 0){
      if(word) words.push(word);
      word = '';
      continue;
    }
    word += character;
    if(character === '{') braceDepth++;
    else if(character === '}' && braceDepth > 0) braceDepth--;
  }
  if(word) words.push(word);
  return words;
}

function measureHelpPanelWidth(){
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if(!ctx) return 220;
  ctx.font = '14px Arial';
  const textWidth = getHelpPanelLines().reduce((width, line)=>{
    const plainText = String(line).replace(/\\[A-Za-z]+/g, 'x').replace(/[{}_^]/g, '');
    return Math.max(width, ctx.measureText(plainText).width);
  }, 0);
  return Math.max(180, Math.ceil(textWidth + 54));
}

function setupHelpPanelPositioning(){
  const panel = document.getElementById('help-panel');
  const header = panel?.querySelector('.help-header');
  const canvasContainer = document.getElementById('canvas-container');
  if(!panel || !header || !canvasContainer) return;

  const position = { x: 0, y: 0 };
  const size = { width: null, height: null };
  let drag = null;
  let resize = null;

  window.updateHelpPanelLayout = function(){
    const canvasBounds = canvasContainer.getBoundingClientRect();
    const maxWidth = Math.max(0, canvasBounds.width / 2);
    panel.style.maxWidth = `${maxWidth}px`;
    panel.style.maxHeight = `${Math.max(0, canvasBounds.height)}px`;
    panel.style.setProperty('--help-content-max-height', `${Math.max(0, canvasBounds.height - header.offsetHeight)}px`);
    panel.style.width = `${Math.min(maxWidth, size.width ?? measureHelpPanelWidth())}px`;
    panel.style.height = size.height === null ? '' : `${Math.min(canvasBounds.height, size.height)}px`;

    let panelBounds = panel.getBoundingClientRect();
    if(size.height === null && window.editorMode && canvasBounds.height > 0){
      const defaultEditorHeight = Math.max(panelBounds.height, canvasBounds.height * 0.65);
      panel.style.height = `${Math.min(canvasBounds.height, defaultEditorHeight)}px`;
      panelBounds = panel.getBoundingClientRect();
    }
    // Store offsets from the visible canvas viewport so hiding and task changes retain position.
    position.x = Math.max(0, Math.min(position.x, canvasBounds.width - panelBounds.width));
    position.y = Math.max(0, Math.min(position.y, canvasBounds.height - panelBounds.height));
    panel.style.left = `${canvasBounds.left + position.x}px`;
    panel.style.top = `${canvasBounds.top + position.y}px`;
  };

  header.addEventListener('pointerdown', event=>{
    if(event.button !== 0 || event.target.closest('button, input, textarea, select, [contenteditable]') || panel.classList.contains('hidden')) return;
    const bounds = panel.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: position.x,
      startTop: position.y,
      width: bounds.width,
      height: bounds.height
    };
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  header.addEventListener('pointermove', event=>{
    if(!drag || event.pointerId !== drag.pointerId) return;
    const canvasBounds = canvasContainer.getBoundingClientRect();
    position.x = Math.max(0, Math.min(
      drag.startLeft + event.clientX - drag.startX,
      canvasBounds.width - drag.width
    ));
    position.y = Math.max(0, Math.min(
      drag.startTop + event.clientY - drag.startY,
      canvasBounds.height - drag.height
    ));
    panel.style.left = `${canvasBounds.left + position.x}px`;
    panel.style.top = `${canvasBounds.top + position.y}px`;
  });

  const finishDrag = event=>{
    if(drag && event.pointerId === drag.pointerId){
      drag = null;
      if(header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
    }
  };
  header.addEventListener('pointerup', finishDrag);
  header.addEventListener('pointercancel', finishDrag);

  const resizeHandle = panel.querySelector('.help-resize-handle');
  if(resizeHandle){
    resizeHandle.addEventListener('pointerdown', event=>{
      if(event.button !== 0 || panel.classList.contains('hidden')) return;
      const bounds = panel.getBoundingClientRect();
      resize = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: bounds.width,
        startHeight: bounds.height
      };
      resizeHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });

    resizeHandle.addEventListener('pointermove', event=>{
      if(!resize || event.pointerId !== resize.pointerId) return;
      const canvasBounds = canvasContainer.getBoundingClientRect();
      const minWidth = Math.min(140, canvasBounds.width / 2);
      const minHeight = Math.min(header.offsetHeight + 50, canvasBounds.height);
      size.width = Math.max(minWidth, Math.min(
        resize.startWidth + event.clientX - resize.startX,
        canvasBounds.width / 2
      ));
      size.height = Math.max(minHeight, Math.min(
        resize.startHeight + event.clientY - resize.startY,
        canvasBounds.height
      ));
      window.updateHelpPanelLayout();
    });

    const finishResize = event=>{
      if(resize && event.pointerId === resize.pointerId){
        resize = null;
        if(resizeHandle.hasPointerCapture(event.pointerId)) resizeHandle.releasePointerCapture(event.pointerId);
      }
    };
    resizeHandle.addEventListener('pointerup', finishResize);
    resizeHandle.addEventListener('pointercancel', finishResize);
  }

  window.addEventListener('resize', window.updateHelpPanelLayout);
  window.updateHelpPanelLayout();
}

// Make floating editor windows movable and resizable within the canvas.
function setupFloatingPanelPositioning(panelId,width,closeButtonId,cancelButtonId){
  const panel = document.getElementById(panelId);
  const header = panel?.querySelector('.relations-header');
  const resizeHandle = panel?.querySelector('.help-resize-handle');
  const canvasContainer = document.getElementById('canvas-container');
  if(!panel || !header || !canvasContainer) return;

  const position = { x: null, y: 0 };
  const size = { width, height: null };
  let action = null;

  function layout(){
    const canvasBounds = canvasContainer.getBoundingClientRect();
    panel.style.maxWidth = `${canvasBounds.width}px`;
    panel.style.maxHeight = `${canvasBounds.height}px`;
    panel.style.width = `${Math.min(canvasBounds.width, size.width)}px`;
    panel.style.height = size.height === null ? '' : `${Math.min(canvasBounds.height, size.height)}px`;
    const panelBounds = panel.getBoundingClientRect();
    if(position.x === null) position.x = (canvasBounds.width - panelBounds.width) / 2;
    position.x = Math.max(0, Math.min(position.x, canvasBounds.width - panelBounds.width));
    position.y = Math.max(0, Math.min(position.y, canvasBounds.height - panelBounds.height));
    panel.style.left = `${canvasBounds.left + position.x}px`;
    panel.style.top = `${canvasBounds.top + position.y}px`;
  }

  function start(event, mode){
    if(event.button !== 0 || panel.classList.contains('hidden')) return;
    const bounds = panel.getBoundingClientRect();
    action = {
      mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      startLeft: position.x, startTop: position.y, width: bounds.width, height: bounds.height
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function move(event){
    if(!action || event.pointerId !== action.pointerId) return;
    const canvasBounds = canvasContainer.getBoundingClientRect();
    const dx = event.clientX - action.startX;
    const dy = event.clientY - action.startY;
    if(action.mode === 'drag'){
      position.x = action.startLeft + dx;
      position.y = action.startTop + dy;
    } else {
      size.width = Math.max(Math.min(240, canvasBounds.width), Math.min(action.width + dx, canvasBounds.width - position.x));
      size.height = Math.max(Math.min(header.offsetHeight + 80, canvasBounds.height), Math.min(action.height + dy, canvasBounds.height - position.y));
    }
    layout();
  }

  function finish(event){
    if(action && event.pointerId === action.pointerId){
      action = null;
      if(event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  header.addEventListener('pointerdown', event=>{
    if(event.target.closest('button')) return;
    start(event, 'drag');
  });
  header.addEventListener('pointermove', move);
  header.addEventListener('pointerup', finish);
  header.addEventListener('pointercancel', finish);
  if(resizeHandle){
    resizeHandle.addEventListener('pointerdown', event=>start(event, 'resize'));
    resizeHandle.addEventListener('pointermove', move);
    resizeHandle.addEventListener('pointerup', finish);
    resizeHandle.addEventListener('pointercancel', finish);
  }

  document.getElementById(closeButtonId)?.addEventListener('click', ()=>{
    document.getElementById(cancelButtonId)?.click();
  });

  // Re-apply layout whenever the window is shown, and when the viewport changes
  new MutationObserver(()=>{ if(!panel.classList.contains('hidden')) layout(); })
    .observe(panel, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', ()=>{ if(!panel.classList.contains('hidden')) layout(); });
}

// Draw help lines on canvas using formatted text
function drawHelpLinesCanvas(){
  const canvas = document.getElementById('help-canvas');
  const container = document.getElementById('help-content-container');
  if(!canvas || !container || !window.currentTask) return;
  const helpLines = Array.isArray(window.currentTask.help_lines) ? window.currentTask.help_lines : [];
  
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.max(1, container.clientWidth);
  const textWidth = Math.max(1, displayWidth - 30);
  const lineHeight = 24;
  const startX = 15;
  const padding = 20;
  ctx.font = '14px Arial';
  const rows = [];
  let canvasTextWidth = displayWidth;
  for(const line of helpLines){
    const words = splitHelpLineWords(line);
    if(words.length === 0){
      rows.push('');
      continue;
    }
    let row = '';
    for(const word of words){
      const candidate = row ? `${row} ${word}` : word;
      const measured = ctx.measureText(candidate.replace(/[{}_^]/g, '')).width;
      if(row && measured > textWidth){
        rows.push(row);
        canvasTextWidth = Math.max(canvasTextWidth, ctx.measureText(row.replace(/[{}_^]/g, '')).width + 30);
        canvasTextWidth = Math.max(canvasTextWidth, ctx.measureText(word.replace(/[{}_^]/g, '')).width + 30);
        row = word;
      } else {
        row = candidate;
      }
    }
    if(row) rows.push(row);
    canvasTextWidth = Math.max(canvasTextWidth, ctx.measureText(row.replace(/[{}_^]/g, '')).width + 30);
  }

  const canvasHeight = rows.length * lineHeight + padding;
  canvas.width = Math.ceil(canvasTextWidth * dpr);
  canvas.height = Math.ceil(canvasHeight * dpr);
  canvas.style.width = `${canvasTextWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  ctx.scale(dpr, dpr);

  let y = 20;
  for(const line of rows){
    if(window.drawFormattedText){
      window.drawFormattedText(ctx, line, startX, y, {
        size: 14,
        color: '#000000',
        align: 'left'
      });
    } else {
      ctx.font = '14px Arial';
      ctx.fillStyle = '#000000';
      ctx.fillText(line, startX, y);
    }
    y += lineHeight;
  }
}

setupHelpPanelPositioning();
setupFloatingPanelPositioning('relations-modal',520,'relations-close','relations-save');
setupFloatingPanelPositioning('snap-checklist-modal',440,'snap-checklist-close','snap-checklist-cancel');
