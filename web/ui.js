/**
 * UI Module: Panel and Button Management
 * Handles scene panel rendering, editor mode UI, panel height resizing, and help button updates
 */

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
window.setActivePanel = function(kind){
  if(window.activePanel === kind) return;
  window.activePanel = kind;
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
    sceneElementCount = (scene.rects?.length || 0) + 
                        (scene.ellipses?.length || 0) +
                        (scene.circles?.length || 0) +
                        (scene.segments?.length || 0) +
                        (scene.arrows?.length || 0) +
                        (scene.points?.length || 0) +
                        (scene.angles?.length || 0) +
                        (scene.texts?.length || 0);
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
function updateScenePanel(){
  const scenePanel = document.getElementById('scene-items');
  if(!scenePanel || !window.currentTask || !window.currentTask.scene) return;
  scenePanel.innerHTML = '';
  
  const scene = window.currentTask.scene;
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
  
  // Helper to add scene element item with expandable editor
  function addItem(label, type, index, obj) {
    const item = document.createElement('div');
    item.className = 'scene-item';
    item.dataset.type = type;
    item.dataset.index = index !== undefined ? index : 0;
    
    // Count items of this type to determine if up/down arrows should be enabled
    let typeCount = 0;
    if(type === 'rect') typeCount = (scene.rects || []).length;
    else if(type === 'ellipse') typeCount = (scene.ellipses || []).length;
    else if(type === 'circle') typeCount = (scene.circles || []).length;
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
    
    // Editor section (hidden by default, shown when selected)
    const editor = document.createElement('div');
    editor.className = 'scene-item-editor';
    editor.innerHTML = getEditorHTML(type, obj, index);
    
    item.appendChild(header);
    item.appendChild(editor);
    
    // Click handler for selection and expanding editor
    header.addEventListener('click', (e) => {
      if(e.target.classList.contains('scene-item-arrange-btn')) return;
      if(e.target.classList.contains('scene-item-control-btn')) return;
      
      scenePanel.querySelectorAll('.scene-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      window.selectedSceneElement = { type, index: index !== undefined ? index : 0, obj };
      window.setActivePanel('scene');
      
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
    
    scenePanel.appendChild(item);
  }
  
  // Helper to get icon for each type
  function getItemIcon(type) {
    const icons = {
      'origin': '●', 'plane': '─', 'rect': '▭', 'ellipse': '⬭',
      'circle': '●', 'segment': '─', 'arrow': '→', 'text': 'T', 'angle': '∠', 'point': '•'
    };
    return icons[type] || '◆';
  }
  
  // Helper to get editor HTML for each type
  function getEditorHTML(type, obj, index) {
    if(type === 'angle' || type === 'point') return '';
    function fillHTML(){
      return `<div class="scene-editor-row"><label>Fyll:</label>
        <input type="checkbox" class="scene-editor-input" data-field="fillEnabled" data-type="${type}" data-idx="${index}" ${obj.fill_color ? 'checked' : ''} />
        <input type="color" class="scene-editor-input" data-field="fill_color" data-type="${type}" data-idx="${index}" value="${expandHexColor(obj.fill_color || '#4090ff')}" ${obj.fill_color ? '' : 'disabled'} /></div>`;
    }
    // Helper to get delete button HTML for scene elements
    function getDeleteButtonHTML(){
      if(index === undefined) return ''; // No delete for singleton items (origin, plane)
      return `
        <div class="scene-editor-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; justify-content: flex-end;">
          <button class="scene-delete-element-btn" data-type="${type}" data-idx="${index}" title="Slett ${type}" style="width:24px; height:24px; padding:0; border:1px solid #d32f2f; border-radius:3px; background:#fff; color:#d32f2f; cursor:pointer; font-size:12px; display:flex; align-items:center; justify-content:center;">🗑️</button>
        </div>
      `;
    }
    
    if(type === 'text') {
      const textObj = obj;
      return `
        <div class="scene-editor-row">
          <label>Txt:</label>
          <input type="text" class="scene-editor-input" data-field="txt" data-type="text" data-idx="${index}" value="${textObj.txt || ''}" />
        </div>
        <div class="scene-editor-row">
          <label>Size:</label>
          <input type="number" class="scene-editor-input" data-field="size" data-type="text" data-idx="${index}" value="${textObj.size || 14}" style="width:40px;" />
          <label style="min-width:auto; margin-left:4px;">Farge:</label>
          <input type="color" class="scene-editor-input" data-field="color" data-type="text" data-idx="${index}" value="${expandHexColor(textObj.color || '#222222')}" style="width:40px; padding:2px;" />
        </div>
        <div class="scene-editor-row">
          <label>Align:</label>
          <select class="scene-editor-input" data-field="align" data-type="text" data-idx="${index}" style="flex:1; padding:2px 4px; font-size:11px;">
            <option value="left" ${(textObj.align === 'left' ? 'selected' : '')}>left</option>
            <option value="center" ${(textObj.align === 'center' ? 'selected' : '')}>center</option>
            <option value="right" ${(textObj.align === 'right' ? 'selected' : '')}>right</option>
          </select>
        </div>
        <div class="scene-editor-row">
          <label>Snap:</label>
          <input type="checkbox" class="scene-editor-input" data-field="snapping" data-type="text" data-idx="${index}" ${(textObj.snapping ? 'checked' : '')} />
        </div>
        <div class="scene-editor-row">
          <label>Koblet:</label>
          <input type="checkbox" class="scene-editor-input scene-linked-checkbox" data-field="linked" data-type="text" data-idx="${index}" ${(textObj.linked ? 'checked' : '')} ${(index === 0 ? 'disabled' : '')} title="${index === 0 ? 'Første tekst kan ikke være koblet' : ''}" />
        </div>
        ${getDeleteButtonHTML()}
      `;
    } else if(type === 'rect') {
      const rectObj = obj;
      return `
        <div class="scene-editor-row">
          <label>Farge:</label>
          <input type="color" class="scene-editor-input" data-field="color" data-type="rect" data-idx="${index}" value="${expandHexColor(rectObj.color || '#4090ff')}" style="width:40px; padding:2px;" />
          <label style="min-width:auto; margin-left:4px;">Linje:</label>
          <input type="number" class="scene-editor-input" data-field="lineWidth" data-type="rect" data-idx="${index}" value="${rectObj.lineWidth || 2}" style="width:40px;" min="0.5" max="10" step="0.5" />
        </div>
        <div class="scene-editor-row">
          <label>Stil:</label>
          <select class="scene-editor-input" data-field="body" data-type="rect" data-idx="${index}" style="flex:1; padding:2px 4px; font-size:11px;">
            <option value="solid" ${(rectObj.body !== 'dashed' ? 'selected' : '')}>Heltrukken</option>
            <option value="dashed" ${(rectObj.body === 'dashed' ? 'selected' : '')}>Stiplet</option>
          </select>
        </div>
        <div class="scene-editor-row">
          <label>Snap:</label>
          <input type="checkbox" class="scene-editor-input" data-field="snapping" data-type="rect" data-idx="${index}" ${(rectObj.snapping ? 'checked' : '')} />
        </div>
        ${getDeleteButtonHTML()}
      `;
    } else if(type === 'ellipse') {
      const ellObj = obj;
      return `
        <div class="scene-editor-row" title="Parametervinkler: 0° langs lokal bredderetning; positivt mot klokka. 0–360° er hel ellipse. Like verdier er tom bue.">
          <label style="min-width:0;">Start °:</label><input type="number" class="scene-editor-input" data-field="startAngleDeg" data-type="ellipse" data-idx="${index}" value="${ellObj.startAngleDeg ?? 0}" step="any" style="width:52px;min-width:0;flex:1 1 52px;" />
          <label style="min-width:0;">Slutt °:</label><input type="number" class="scene-editor-input" data-field="endAngleDeg" data-type="ellipse" data-idx="${index}" value="${ellObj.endAngleDeg ?? 360}" step="any" style="width:52px;min-width:0;flex:1 1 52px;" />
        </div>
        ${fillHTML()}
        <div class="scene-editor-row">
          <label>Farge:</label>
          <input type="color" class="scene-editor-input" data-field="color" data-type="ellipse" data-idx="${index}" value="${expandHexColor(ellObj.color || '#4090ff')}" style="width:40px; padding:2px;" />
          <label style="min-width:auto; margin-left:4px;">Linje:</label>
          <input type="number" class="scene-editor-input" data-field="lineWidth" data-type="ellipse" data-idx="${index}" value="${ellObj.lineWidth || 2}" style="width:40px;" min="0.5" max="10" step="0.5" />
        </div>
        <div class="scene-editor-row">
          <label>Stil:</label>
          <select class="scene-editor-input" data-field="body" data-type="ellipse" data-idx="${index}" style="flex:1; padding:2px 4px; font-size:11px;">
            <option value="solid" ${(ellObj.body !== 'dashed' ? 'selected' : '')}>Heltrukken</option>
            <option value="dashed" ${(ellObj.body === 'dashed' ? 'selected' : '')}>Stiplet</option>
          </select>
        </div>
        <div class="scene-editor-row">
          <label>Snap:</label>
          <input type="checkbox" class="scene-editor-input" data-field="snapping" data-type="ellipse" data-idx="${index}" ${(ellObj.snapping ? 'checked' : '')} />
        </div>
        ${getDeleteButtonHTML()}
      `;
    } else if(type === 'circle') {
      const circObj = obj;
      return `
        ${fillHTML()}
        <div class="scene-editor-row">
          <label>Snap:</label>
          <input type="checkbox" class="scene-editor-input" data-field="snapping" data-type="circle" data-idx="${index}" ${(circObj.snapping ? 'checked' : '')} />
        </div>
        ${getDeleteButtonHTML()}
      `;
    } else if(type === 'segment') {
      const segObj = obj;
      return `
        <div class="scene-editor-row">
          <label>Farge:</label>
          <input type="color" class="scene-editor-input" data-field="color" data-type="segment" data-idx="${index}" value="${expandHexColor(segObj.color || '#222222')}" style="width:40px; padding:2px;" />
          <label style="min-width:auto; margin-left:4px;">Linje:</label>
          <input type="number" class="scene-editor-input" data-field="lineWidth" data-type="segment" data-idx="${index}" value="${segObj.lineWidth || 2}" style="width:40px;" min="0.5" max="10" step="0.5" />
        </div>
        <div class="scene-editor-row">
          <label>Stil:</label>
          <select class="scene-editor-input" data-field="body" data-type="segment" data-idx="${index}" style="flex:1; padding:2px 4px; font-size:11px;">
            <option value="solid" ${(segObj.body !== 'dashed' ? 'selected' : '')}>Heltrukken</option>
            <option value="dashed" ${(segObj.body === 'dashed' ? 'selected' : '')}>Stiplet</option>
          </select>
        </div>
        <div class="scene-editor-row">
          <label>Snap:</label>
          <input type="checkbox" class="scene-editor-input" data-field="snapping" data-type="segment" data-idx="${index}" ${(segObj.snapping ? 'checked' : '')} />
        </div>
        ${getDeleteButtonHTML()}
      `;
    } else if(type === 'arrow') {
      const arrObj = obj;
      return `
        <div class="scene-editor-row">
          <label>Farge:</label>
          <input type="color" class="scene-editor-input" data-field="color" data-type="arrow" data-idx="${index}" value="${expandHexColor(arrObj.color || '#00f')}" style="width:40px; padding:2px;" />
          <label style="min-width:auto; margin-left:4px;">Linje:</label>
          <input type="number" class="scene-editor-input" data-field="lineWidth" data-type="arrow" data-idx="${index}" value="${arrObj.lineWidth || 2}" style="width:40px;" min="0.5" max="10" step="0.5" />
        </div>
        <div class="scene-editor-row">
          <label>Stil:</label>
          <select class="scene-editor-input" data-field="body" data-type="arrow" data-idx="${index}" style="flex:1; padding:2px 4px; font-size:11px;">
            <option value="solid" ${(arrObj.body !== 'dashed' ? 'selected' : '')}>Heltrukken</option>
            <option value="dashed" ${(arrObj.body === 'dashed' ? 'selected' : '')}>Stiplet</option>
          </select>
        </div>
        <div class="scene-editor-row">
          <label>Snap:</label>
          <input type="checkbox" class="scene-editor-input" data-field="snapping" data-type="arrow" data-idx="${index}" ${(arrObj.snapping ? 'checked' : '')} />
        </div>
        ${getDeleteButtonHTML()}
      `;
    } else if(type === 'plane') {
      const planeObj = obj;
      return `
        <div class="scene-editor-row">
          <label>Synlig:</label>
          <input type="checkbox" class="scene-editor-input" data-field="draw" data-type="plane" data-idx="${index}" ${planeObj.draw ? 'checked' : ''} />
          <label style="min-width:auto; margin-left:8px;">Farge:</label>
          <input type="color" class="scene-editor-input" data-field="color" data-type="plane" data-idx="${index}" value="${expandHexColor(planeObj.color || '#777777')}" style="width:40px; padding:2px;" />
          <label style="min-width:auto; margin-left:4px;">Linje:</label>
          <input type="number" class="scene-editor-input" data-field="lineWidth" data-type="plane" data-idx="${index}" value="${planeObj.lineWidth || 4}" style="width:40px;" min="0.5" max="10" step="0.5" />
        </div>
      `;
    }
    return '';
  }
  
  // Helper to wire up editor inputs
  function setupEditorInputs(editor, type, index, obj) {
    const inputs = editor.querySelectorAll('.scene-editor-input');
    inputs.forEach(input => {
      // Real-time input for text fields (txt, size, color, align)
      input.addEventListener('input', (e) => {
        const field = input.dataset.field;
        const fieldType = input.dataset.type;
        const idx = parseInt(input.dataset.idx);
        // Use window.currentTask.scene directly instead of closure to avoid stale references
        const currentScene = window.currentTask?.scene;
        
        if(fieldType === 'text' && currentScene?.texts?.[idx]) {
          if(input.type === 'number') {
            currentScene.texts[idx][field] = parseInt(input.value) || 14;
          } else if(input.type !== 'checkbox') {
            currentScene.texts[idx][field] = input.value;
          }
          window.markEdited && window.markEdited('task');
        }
      });
      
      // Change event for color and selects
      input.addEventListener('change', (e) => {
        const field = input.dataset.field;
        const fieldType = input.dataset.type;
        const idx = parseInt(input.dataset.idx);
        // Use window.currentTask.scene directly instead of closure to avoid stale references
        const currentScene = window.currentTask?.scene;
        if((fieldType === 'ellipse' || fieldType === 'circle') &&
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
            // Simply toggle the linked flag - do not modify pos (avoid accidental changes)
            currentScene.texts[idx][field] = input.checked;
          } else if(input.type === 'color') {
            currentScene.texts[idx][field] = input.value;
          } else if(input.type === 'number') {
            currentScene.texts[idx][field] = parseInt(input.value) || 14;
          } else {
            currentScene.texts[idx][field] = input.value;
          }
          window.markEdited && window.markEdited('task');
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
        } else if(fieldType === 'circle' && currentScene?.circles?.[idx]) {
          if(input.type === 'checkbox') {
            currentScene.circles[idx][field] = input.checked;
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
          // Tekster uten pos henger etter forrige tekst. Når første tekst slettes, 
          // fryses neste teksts nåværende posisjon så den ikke mister plasseringen.
          const next = currentScene.texts[btnIdx + 1];
          if(btnIdx === 0 && next && !next.pos){
            const rp = next._renderedPos;
            next.pos = Array.isArray(rp) && rp.length >= 2 ? [rp[0], rp[1]] : [...(currentScene.texts[0].pos || [20, 20])];
            next.linked = false;
          }
          currentScene.texts.splice(btnIdx, 1);
        } else if(btnType === 'rect' && currentScene?.rects?.[btnIdx]) {
          currentScene.rects.splice(btnIdx, 1);
        } else if(btnType === 'ellipse' && currentScene?.ellipses?.[btnIdx]) {
          currentScene.ellipses.splice(btnIdx, 1);
        } else if(btnType === 'circle' && currentScene?.circles?.[btnIdx]) {
          currentScene.circles.splice(btnIdx, 1);
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
  
  // Origin (one per task)
  if(scene.origin) {
    addItem('Origin', 'origin', undefined, scene.origin);
  }
  
  // Plane (one per task)
  if(scene.plane) {
    addItem('Plan', 'plane', undefined, scene.plane);
  }
  
  // Rects
  if(Array.isArray(scene.rects)) {
    scene.rects.forEach((rect, idx) => {
      addItem('rect', 'rect', idx, rect);
    });
  }
  
  // Ellipses
  if(Array.isArray(scene.ellipses)) {
    scene.ellipses.forEach((ellipse, idx) => {
      addItem('ellipse', 'ellipse', idx, ellipse);
    });
  }
  
  // Circles
  if(Array.isArray(scene.circles)) {
    scene.circles.forEach((circle, idx) => {
      addItem('circle', 'circle', idx, circle);
    });
  }
  
  // Segments
  if(Array.isArray(scene.segments)) {
    scene.segments.forEach((segment, idx) => {
      addItem('segment', 'segment', idx, segment);
    });
  }
  
  // Arrows
  if(Array.isArray(scene.arrows)) {
    scene.arrows.forEach((arrow, idx) => {
      addItem('arrow', 'arrow', idx, arrow);
    });
  }
  
  // Texts
  if(Array.isArray(scene.texts)) {
    scene.texts.forEach((text, idx) => {
      if(!text._isShortLines) {
        addItem('txt', 'text', idx, text);
      }
    });
  }
  
  // Step 5: Restore selected element after DOM rebuild
  (scene.points || []).forEach((point, idx) => addItem('Punkt', 'point', idx, point));
  (scene.angles || []).forEach((angle, idx) => addItem('Vinkel', 'angle', idx, angle));
  if(window.selectedSceneElement && scenePanel){
    const items = scenePanel.querySelectorAll('.scene-item');
    for(const item of items){
      const itemType = item.dataset.type;
      const itemIndex = parseInt(item.dataset.index);
      if(itemType === window.selectedSceneElement.type && itemIndex === window.selectedSceneElement.index){
        item.classList.add('selected');
        // Show arrange buttons when selected
        const header = item.querySelector('.scene-item-header');
        if(header){
          header.querySelectorAll('.scene-item-arrange-btn').forEach(btn => {
            btn.style.display = 'inline-block';
          });
        }
        break;
      }
    }
  }
}

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
    if(event.button !== 0 || event.target.closest('button') || panel.classList.contains('hidden')) return;
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

// Make the relations window movable and resizable within the canvas, like the task window
function setupRelationsPanelPositioning(){
  const panel = document.getElementById('relations-modal');
  const header = panel?.querySelector('.relations-header');
  const resizeHandle = panel?.querySelector('.help-resize-handle');
  const canvasContainer = document.getElementById('canvas-container');
  if(!panel || !header || !canvasContainer) return;

  const position = { x: null, y: 0 };
  const size = { width: 520, height: null };
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

  document.getElementById('relations-close')?.addEventListener('click', ()=>{
    document.getElementById('relations-cancel')?.click();
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
setupRelationsPanelPositioning();
