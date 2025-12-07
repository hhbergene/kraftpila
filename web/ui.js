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
          // Swap with previous
          [array[index - 1], array[index]] = [array[index], array[index - 1]];
          updateScenePanel();
          saveTask();
          window.updateAppState();
        } else if(direction === 'down' && index < array.length - 1) {
          // Swap with next
          [array[index], array[index + 1]] = [array[index + 1], array[index]];
          updateScenePanel();
          saveTask();
          window.updateAppState();
        }
      });
    });
    
    // Wire up editor inputs
    setupEditorInputs(editor, type, index, obj);
    
    scenePanel.appendChild(item);
  }
  
  // Helper to get icon for each type
  function getItemIcon(type) {
    const icons = {
      'origin': '●', 'plane': '─', 'rect': '▭', 'ellipse': '⬭',
      'circle': '●', 'segment': '─', 'arrow': '→', 'text': 'T'
    };
    return icons[type] || '◆';
  }
  
  // Helper to get editor HTML for each type
  function getEditorHTML(type, obj, index) {
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
          saveTask();
        }
      });
      
      // Change event for color and selects
      input.addEventListener('change', (e) => {
        const field = input.dataset.field;
        const fieldType = input.dataset.type;
        const idx = parseInt(input.dataset.idx);
        // Use window.currentTask.scene directly instead of closure to avoid stale references
        const currentScene = window.currentTask?.scene;
        
        if(fieldType === 'text' && currentScene?.texts?.[idx]) {
          if(input.type === 'checkbox') {
            // Simply toggle the linked flag - no position calculation
            currentScene.texts[idx][field] = input.checked;
          } else if(input.type === 'color') {
            currentScene.texts[idx][field] = input.value;
          } else if(input.type === 'number') {
            currentScene.texts[idx][field] = parseInt(input.value) || 14;
          } else {
            currentScene.texts[idx][field] = input.value;
          }
          saveTask();
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
          saveTask();
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
          saveTask();
        } else if(fieldType === 'circle' && currentScene?.circles?.[idx]) {
          if(input.type === 'checkbox') {
            currentScene.circles[idx][field] = input.checked;
          }
          saveTask();
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
          saveTask();
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
          saveTask();
        } else if(fieldType === 'plane' && currentScene?.plane) {
          if(input.type === 'checkbox') {
            currentScene.plane[field] = input.checked;
          } else if(input.type === 'color') {
            currentScene.plane[field] = input.value;
          } else if(input.type === 'number') {
            currentScene.plane[field] = parseFloat(input.value) || 4;
          }
          saveTask();
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
        
        if(btnType === 'text' && currentScene?.texts?.[btnIdx]) {
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
        
        saveTask();
        updateScenePanel();
        window.updateAppState();
      });
    });
  }
  
  // Task metadata fields (Id, Title, Category)
  if(window.currentTask) {
    const metaEditor = document.createElement('div');
    metaEditor.className = 'scene-item';
    metaEditor.style.marginBottom = '8px';
    metaEditor.innerHTML = `
      <div class="scene-editor-row">
        <label>Id:</label>
        <input type="text" id="task-id-input" class="scene-editor-input" value="${window.currentTask.id || ''}" style="flex:1; padding:2px 4px; font-size:11px;" />
      </div>
      <div class="scene-editor-row">
        <label>Tittel:</label>
        <input type="text" id="task-title-input" class="scene-editor-input" value="${window.currentTask.title || ''}" style="flex:1; padding:2px 4px; font-size:11px;" />
      </div>
      <div class="scene-editor-row">
        <label>Kategori:</label>
        <input type="text" id="task-category-input" class="scene-editor-input" value="${window.currentTask.category || ''}" style="flex:1; padding:2px 4px; font-size:11px;" />
      </div>
    `;
    scenePanel.appendChild(metaEditor);
    
    // Wire up metadata input handlers
    const idInput = metaEditor.querySelector('#task-id-input');
    const titleInput = metaEditor.querySelector('#task-title-input');
    const categoryInput = metaEditor.querySelector('#task-category-input');
    
    if(idInput) {
      idInput.addEventListener('change', () => {
        const oldId = window.currentTask.id;
        const newId = idInput.value.trim();
        if(newId && newId !== oldId) {
          // Migrate localStorage entries from old ID to new ID
          const keys = ['tk_task_', 'tk_forces_', 'tk_solutionForces_', 'tk_relations_', 'tk_sumF_'];
          keys.forEach(prefix => {
            const oldKey = `${prefix}${oldId}`;
            const newKey = `${prefix}${newId}`;
            const value = localStorage.getItem(oldKey);
            if(value) {
              localStorage.setItem(newKey, value);
              localStorage.removeItem(oldKey);
            }
          });
          // Update task ID
          window.currentTask.id = newId;
          // Update savedTasks list
          try {
            let savedTasks = JSON.parse(localStorage.getItem('tk_savedTasks') || '[]');
            const idx = savedTasks.indexOf(oldId);
            if(idx >= 0) {
              savedTasks[idx] = newId;
              localStorage.setItem('tk_savedTasks', JSON.stringify(savedTasks));
            }
          } catch {}
          saveTask();
        }
      });
    }
    
    if(titleInput) {
      titleInput.addEventListener('change', () => {
        window.currentTask.title = titleInput.value;
        saveTask();
        updateHelpButton();
      });
    }
    
    if(categoryInput) {
      categoryInput.addEventListener('change', () => {
        window.currentTask.category = categoryInput.value;
        saveTask();
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
  
  const id = window.currentTask.id || '?';
  const title = window.currentTask.title || '?';
  helpBtn.textContent = `❓ ${id}: ${title}`;
}

// ===== Help Lines Editor and Canvas Rendering =====

// Save help lines from textarea to current task
function saveHelpLines(){
  const textarea = document.getElementById('help-lines-text');
  if(textarea && window.currentTask){
    // Split by newline and filter empty lines
    const lines = textarea.value.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    window.currentTask.help_lines = lines;
  }
}

// Setup help lines editor with auto-save
function setupHelpLinesEditor(){
  const textarea = document.getElementById('help-lines-text');
  if(textarea){
    // Auto-save on input
    textarea.addEventListener('input', ()=>{
      saveHelpLines();
    });
    // Focus on textarea
    textarea.focus();
  }
}

// Draw help lines on canvas using formatted text
function drawHelpLinesCanvas(){
  const canvas = document.getElementById('help-canvas');
  if(!canvas || !window.currentTask || !window.currentTask.help_lines) return;
  
  // Set canvas size
  const helpPanel = document.getElementById('help-panel');
  canvas.width = helpPanel.offsetWidth;
  canvas.height = helpPanel.offsetHeight - 50; // Account for header
  
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  
  // Clear canvas
  ctx.fillStyle = '#f9f9f9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw each help line
  let y = 30;
  const lineHeight = 40;
  const startX = 20;
  
  for(const line of window.currentTask.help_lines){
    if(window.drawFormattedText){
      window.drawFormattedText(ctx, line, startX, y, {
        size: 16,
        color: '#333',
        align: 'left'
      });
    } else {
      // Fallback if drawFormattedText not available
      ctx.font = '16px Arial';
      ctx.fillStyle = '#333';
      ctx.fillText(line, startX, y);
    }
    y += lineHeight;
  }
}
