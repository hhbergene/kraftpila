// Tegne Krefter JS Port 
// Fallback uten ES-moduler slik at fil kan åpnes direkte via file://.
// Senere kan vi gå tilbake til type="module" når vi bruker lokal server.

// Initialize empty TASKS array (will be populated from localStorage)
window.TASKS = [];

(function(){
    // Canvas init =====
  const canvas = document.getElementById('app-canvas');
  // Set canvas dimensions from shared constants (CANVAS_WIDTH, CANVAS_HEIGHT, defined in shared.js)
  canvas.width = window.CANVAS_WIDTH;
  canvas.height = window.CANVAS_HEIGHT;
  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext('2d');
  
  // Initialize scroll position to show grid area at top-left
  window.initializeScroll();

  function clear() {
    window.clearCanvas(ctx);
  }

  function frame() {
    renderOnce();
    requestAnimationFrame(frame);
  }
  // Synchronous redraw, also used by the report generator (rAF is throttled in hidden tabs)
  window.renderNow = () => renderOnce();
  window.renderTo = (g) => renderOnce(g);

  function renderOnce(g = ctx) {
    if(window.currentTask){
      window.sceneModel.update(window.currentTask);
      window.syncSceneForceAnchors(window.currentTask, window.fm, false);
    }
    window.clearCanvas(g);
    
    // Save context and translate so grid area (0,0 to 1000,640) starts at top-left
    // Canvas extends from -200,-200 to 1000,640 (1200x800 total)
    g.save();
    g.translate(window.offsetX, window.offsetY);
    
    if (gridOn) {
      drawGrid(g);
    }
    // Draw current task scene (before user forces)
    if(window.currentTask){
      drawScene(g, window.currentTask, false);
    }

    // Debug: Draw snap points if debug mode is on
    if(window.drawSnapPoints){
      drawSnapPoints(g);
    }

    // Guidelines (before forces for visibility)
    if(window.fm){
      window.drawForceGridTrace(g,window.fm.forces[window.fm.activeIndex]);
    }
    if(window.drawGuidelines){
      drawGuidelines(g);
    }
    
    // Step 5: Draw scene element hover/selection highlights (editor mode only - skip in player mode)
    
    // Draw anchor candidates when dragging force anchor in editor mode (editor only - skip in player mode)
    
    // Draw test forces
    if(window.fm){
      window.fm.drawAll(g);
    }
    
    // Draw expected direction guides in editor mode (editor only - skip in player mode)
    
    // Draw selection handles for selected scene element (editor only - skip in player mode)
    
    g.restore();
  }
  
  // Step 5: Draw scene element hover/selection highlights
  /**
   * Draw thin yellow guide lines showing expected direction for expectedForces in editor mode
   * Helps visualize what direction each force should have
   */
  function drawExpectedDirectionGuides(ctx, task, forces){
    if(!task.expectedForces || !Array.isArray(task.expectedForces)) return;
    
    // Helper to get expected direction
    function getExpDir(spec){
      const d = spec.dir;
      if(Array.isArray(d)) {
        const len = geometry.length(d);
        return len > 0 ? [d[0]/len, d[1]/len] : [1, 0];
      }
      const plane = task.scene?.plane;
      if(d === 'planeNormal' && plane?.n_vec) {
        const len = geometry.length(plane.n_vec);
        return len > 0 ? [plane.n_vec[0]/len, plane.n_vec[1]/len] : [1, 0];
      }
      if(d === 'planeTangent' && plane?.t_vec) {
        const len = geometry.length(plane.t_vec);
        return len > 0 ? [plane.t_vec[0]/len, plane.t_vec[1]/len] : [1, 0];
      }
      return [1, 0];
    }
    
    ctx.strokeStyle = '#ffff00'; // Bright yellow
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    
    task.expectedForces.forEach(spec => {
      // Find drawn force with matching name
      const drawnForce = forces.find(f => f && f.name && f.name.toLowerCase() === spec.name.toLowerCase());
      if(!drawnForce || !drawnForce.arrowBase) return;
      
      const base = drawnForce.arrowBase;
      const dir = getExpDir(spec);
      const len = 80; // Length of guide line
      
      ctx.beginPath();
      ctx.moveTo(base[0], base[1]);
      ctx.lineTo(base[0] + dir[0] * len, base[1] + dir[1] * len);
      ctx.stroke();
    });
    
    ctx.globalAlpha = 1.0;
  }

  function drawSceneElementHighlights(ctx){
    if(!window.sceneLookup) return;
    
    // Helper to build lookup key - the plane is the only singleton scene element
    function getLookupKey(type, index){
      if(type === 'plane') return type;
      return `${type}${index}`;
    }
    
    // Draw selected element's points/segments (dim) always, but don't overdraw if hovered
    if(window.selectedSceneElement){
      const key = getLookupKey(window.selectedSceneElement.type, window.selectedSceneElement.index);
      const entry = window.sceneLookup[key];
      const hoveredKey = window.hoveredSceneElement ? 
        getLookupKey(window.hoveredSceneElement.type, window.hoveredSceneElement.index) : null;
      const isSelectedHovered = hoveredKey === key;
      
      if(entry && entry.points){
        Object.values(entry.points).forEach(point => {
          if(point){
            window.drawAnchorMarker(ctx,point,'sceneSelected');
          }
        });
      }
      // Draw segment lines for selected element (dim, thicker line)
      if(entry && entry.segments){
        Object.values(entry.segments).forEach(seg => {
          if(Array.isArray(seg) && seg.length >= 2){
            ctx.strokeStyle = window.HIGHLIGHT_SCENE_LINE_DIM_COLOR;
            ctx.lineWidth = window.HIGHLIGHT_SCENE_LINE_DIM_WIDTH;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(seg[0][0], seg[0][1]);
            ctx.lineTo(seg[1][0], seg[1][1]);
            ctx.stroke();
          }
        });
      }
    }
    
    // Draw hovered element's points (bright)
    if(window.hoveredSceneElement){
      const key = getLookupKey(window.hoveredSceneElement.type, window.hoveredSceneElement.index);
      const entry = window.sceneLookup[key];
      if(entry && entry.points){
        Object.values(entry.points).forEach(point => {
          if(point){
            window.drawAnchorMarker(ctx,point,'sceneHovered');
          }
        });
      }
      // Draw segment lines for hovered element (bright, thicker line)
      if(entry && entry.segments){
        Object.values(entry.segments).forEach(seg => {
          if(Array.isArray(seg) && seg.length >= 2){
            ctx.strokeStyle = window.HIGHLIGHT_SCENE_LINE_BRIGHT_COLOR;
            ctx.lineWidth = window.HIGHLIGHT_SCENE_LINE_BRIGHT_WIDTH;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(seg[0][0], seg[0][1]);
            ctx.lineTo(seg[1][0], seg[1][1]);
            ctx.stroke();
          }
        });
      }
    }
  }
  
  // Draw handles for selected scene element
  function drawSceneElementHandles(ctx, selection){
    if(!selection || !window.currentTask) return;
    
    const { type, index, obj } = selection;
    const scene = window.currentTask.scene;
    
    function drawHandle(x, y) {
      ctx.fillStyle = window.SCENE_HANDLE_COLOR;
      ctx.beginPath();
      ctx.arc(x, y, window.SCENE_HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = window.SCENE_HANDLE_STROKE_COLOR;
      ctx.lineWidth = window.SCENE_HANDLE_STROKE_WIDTH;
      ctx.stroke();
    }
    
    // Helper to draw a simple arrow between two points
    function drawSimpleArrow(fromX, fromY, toX, toY, color, lineWidth) {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const ang = Math.atan2(dy, dx);
      const len = Math.hypot(dx, dy);
      const headSize = 8;
      const tEnd = 1 - headSize / len;
      const bodyEnd = [fromX + dx * tEnd, fromY + dy * tEnd];
      
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(fromX + 0.5, fromY + 0.5);
      ctx.lineTo(bodyEnd[0] + 0.5, bodyEnd[1] + 0.5);
      ctx.stroke();
      
      // Arrow head
      const left = [toX - headSize * Math.cos(ang - Math.PI/6), toY - headSize * Math.sin(ang - Math.PI/6)];
      const right = [toX - headSize * Math.cos(ang + Math.PI/6), toY - headSize * Math.sin(ang + Math.PI/6)];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(toX + 0.5, toY + 0.5);
      ctx.lineTo(left[0] + 0.5, left[1] + 0.5);
      ctx.lineTo(right[0] + 0.5, right[1] + 0.5);
      ctx.closePath();
      ctx.fill();
    }
    
    if(type === 'plane' && scene.plane){
      // Draw handle at through point
      const [x, y] = scene.plane.through;
      drawHandle(x, y);
      
      // Draw handle for direction point
      // If dirPoint not defined, use through + n_vec * 3 * GRID_STEP
      let dirX, dirY;
      if(scene.plane.dirPoint) {
        [dirX, dirY] = scene.plane.dirPoint;
      } else {
        // Fallback: compute from n_vec
        const [nx, ny] = scene.plane.n_vec || [0, -1];
        dirX = x + nx * 3 * window.GRID_STEP;
        dirY = y + ny * 3 * window.GRID_STEP;
      }
      drawHandle(dirX, dirY);
      
      // Draw pil fra through til direction handle (mørk orange, litt smalere enn kraftpil)
      drawSimpleArrow(x, y, dirX, dirY, '#cc6600', 1.5);
      
      // Rettvinklmarkering - liten L-form ved through-punkt
      const cornerSize = 6;
      const t = scene.plane.t_vec || [1, 0];  // Tangent retning (langs planen)
      // Get current n_vec for the corner marker
      let nx, ny;
      if(scene.plane.dirPoint) {
        const dx = scene.plane.dirPoint[0] - x;
        const dy = scene.plane.dirPoint[1] - y;
        const len = Math.hypot(dx, dy);
        nx = len > 0 ? dx / len : 0;
        ny = len > 0 ? dy / len : -1;
      } else {
        [nx, ny] = scene.plane.n_vec || [0, -1];
      }
      ctx.strokeStyle = '#cc6600';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + t[0] * cornerSize + 0.5, y + t[1] * cornerSize + 0.5);
      ctx.lineTo(x + t[0] * cornerSize + nx * cornerSize + 0.5, y + t[1] * cornerSize + ny * cornerSize + 0.5);
      ctx.lineTo(x + nx * cornerSize + 0.5, y + ny * cornerSize + 0.5);
      ctx.stroke();
    } 
    else if(type === 'rect' && scene.rects && scene.rects[index]){
      const rect = scene.rects[index];
      // Show only 3 handles: bottomCenter, topCenter (n-direction), bottomRight (t-direction)
      const bc = rect.bottomCenter;
      const t = rect.t_vec || [1, 0];
      const n = rect.n_vec || [0, -1];
      const w = rect.width;
      const h = rect.height;
      
      // Bottom center handle
      drawHandle(bc[0], bc[1]);
      
      // Top center handle (for n-direction)
      const topCenter = [bc[0] + n[0]*h, bc[1] + n[1]*h];
      drawHandle(topCenter[0], topCenter[1]);
      
      // Bottom right handle (for t-direction)
      const bottomRight = [bc[0] + t[0]*w/2, bc[1] + t[1]*w/2];
      drawHandle(bottomRight[0], bottomRight[1]);
    } 
    else if(type === 'ellipse' && scene.ellipses && scene.ellipses[index]){
      const ellipse = scene.ellipses[index];
      const [cx, cy] = ellipse.center;
      const t = ellipse.t_vec || [1, 0];
      const n = ellipse.n_vec || [0, -1];
      const w = ellipse.width;
      const h = ellipse.height;
      
      // Center handle
      drawHandle(cx, cy);
      
      // Width direction handle (along t_vec direction)
      const widthHandle = [cx + t[0]*w/2, cy + t[1]*w/2];
      drawHandle(widthHandle[0], widthHandle[1]);
      
      // Height direction handle (along n_vec direction)
      const heightHandle = [cx + n[0]*h/2, cy + n[1]*h/2];
      drawHandle(heightHandle[0], heightHandle[1]);
    } 
    else if(type === 'segment' && scene.segments && scene.segments[index]){
      const seg = scene.segments[index];
      drawHandle(seg.a[0], seg.a[1]);
      drawHandle(seg.b[0], seg.b[1]);
    } 
    else if(type === 'arrow' && scene.arrows && scene.arrows[index]){
      const arrow = scene.arrows[index];
      drawHandle(arrow.a[0], arrow.a[1]);
      drawHandle(arrow.b[0], arrow.b[1]);
    }
    else if(type === 'text' && scene.texts && scene.texts[index]){
      const text = scene.texts[index];
      // Don't show handle for dragging text position if linked
      if(!text.linked){
        const [x, y] = text.pos;
        drawHandle(x, y);
      }
    }
  }
  
  requestAnimationFrame(frame);


  // ===== Ikon-generering (PNG via offscreen canvas) =====
  function makeIconPNG(symbol, fg='#222', bg=null, w=36, h=36) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    // Transparent canvas by default; only fill if bg is provided
    if(bg){
      g.fillStyle = bg;
      g.fillRect(0,0,w,h);
    }
    g.fillStyle = fg;
    const isGridSym = symbol === '⊞' || symbol === '▦';
    const fontSize = isGridSym ? 26 : 24;
    g.font = fontSize + 'px Segoe UI, Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const yOffset = isGridSym ? 0 : 1; // finjuster vertikal
    g.fillText(symbol, w/2, h/2 + yOffset);
    return c.toDataURL('image/png');
  }

  let gridOn = true; // starter som på

  // Ikon: viser fylte ruter ◻ når grid er PÅ, tomt ⊞ når grid er AV
  function updateGridIcon() {
    const el = document.getElementById('btn-grid');
    if (!el) return;
    const oldImg = el.querySelector('img');
    if (oldImg) oldImg.remove();
    const sym = gridOn ? window.ICONS.grid_off : window.ICONS.grid_on;
    const url = makeIconPNG(sym);
    const img = document.createElement('img');
    img.src = url;
    el.insertBefore(img, el.firstChild);
    // Ikke highlight grid-knappen
    el.classList.remove('btn-active');
  }

  function applyIcons() {
    const mapping = [
      ['btn-snap','snap'], ['btn-guidelines','guidelines'], ['btn-prev','prev'], ['btn-next','next'],
      ['btn-help','help'], ['btn-check','check'], ['btn-reset','reset'], ['btn-settings','settings']
    ];
    // Ikoner uten grid først
    for (const [id,key] of mapping) {
      const el = document.getElementById(id);
      if (!el) continue;
      // Skip icon for btn-help, only add text
      if(id !== 'btn-help'){
        const url = makeIconPNG(window.ICONS[key]);
        const img = document.createElement('img');
        img.src = url;
        el.appendChild(img);
      }
      if (el.classList.contains('btn-wide')) {
        const span = document.createElement('span');
        if (id === 'btn-help') span.textContent = 'Oppgave';
        else if (id === 'btn-check') span.textContent = 'Sjekk';
        else if (id === 'btn-reset') span.textContent = 'Reset';
        if (span.textContent) el.appendChild(span);
      }
    }
    // Grid ikon separat (toggle state)
    updateGridIcon();
  }
  applyIcons();
  // snap/guidelines state
  window.enableSnap = true; // default on to make snapping obvious
  window.enableGuidelines = true;
  window.currentGuidelines = null;
  // Settings state
  window.settings = {
    debug: false,
    username: 'Isaac Newton',
    show_force_coordinates: false,
  };
  // Load persisted settings
  try {
    const raw = localStorage.getItem('tk_settings');
    if(raw){ const s = JSON.parse(raw); if(typeof s.debug==='boolean') window.settings.debug=s.debug; if(typeof s.username==='string') window.settings.username=s.username; }
  } catch {}
  // Player mode only - editor mode functionality is in editor.js
  window.editorMode = false;
  // Initialize empty tasks array (will be populated from localStorage)
  window.tasks = [];
  window.taskScores = {};
  try {
    const raw = localStorage.getItem('tk_taskScores');
    if(raw){ window.taskScores = JSON.parse(raw); }
  } catch {}
  // Task comments: stored in task.comment field (no separate storage)
  window.taskComments = {};
  function updateUserDisplay(){
    const userEl = document.getElementById('user-display');
    if(!userEl) return;
    const level = computeLevel();
    const usr = window.settings.username || 'User';
    userEl.textContent = `${usr} | Level ${level}`;
  }
  function computeLevel(){
    let count = 0;
    for(const id in window.taskScores){ const score = window.taskScores[id].score; if(typeof score==='number' && score >= 0.9) count++; }
    return count;
  }
  // Reflect snap button visual state
  const snapBtn = document.getElementById('btn-snap');
  if(snapBtn){ snapBtn.classList.toggle('btn-active', window.enableSnap); }
  // Update user display on init
  updateUserDisplay();

  // Ensure inputs have id/name for accessibility and proper activation
  function ensureInputMeta() {
    if(!inputsContainer) return;
    const rows = Array.from(inputsContainer.querySelectorAll('.force-row'));
    rows.forEach((row, idx) => {
      const inputEl = row.querySelector('input');
      if(!inputEl) return;
      const base = `force-${idx}`;
      if(!inputEl.id)   inputEl.id = base;
      if(!inputEl.name) inputEl.name = base;
      // Optionally associate a label if present
      const labelEl = row.querySelector('label');
      if(labelEl && !labelEl.htmlFor) labelEl.htmlFor = inputEl.id;
    });
  }

  // ===== Test: add a sample force via ForcesManager =====
  window.fm = new ForcesManager();
  const inputsContainer = document.getElementById('force-inputs');
  window.fm.syncInputs(inputsContainer);
  ensureInputMeta();

  // Gi fokus til tekstfeltet for aktiv kraft
  function focusInputFor(index, opts={select:false}){
    if(!inputsContainer) return;
    const rows = Array.from(inputsContainer.querySelectorAll('.force-row'));
    const inputEl = rows[index] && rows[index].querySelector('input');
    if(inputEl){
      inputEl.focus();
      if(opts.select) inputEl.select();
    }
  }
  function wireFocusToSetActive(){
    if(!window.fm) return;
    const origSetActive = window.fm.setActive.bind(window.fm);
    window.fm.setActive = function(i, forceDropdownRebuild = false){
      const oldActive = this.activeIndex;
      console.log('🟣 WRAPPER setActive called:', {i, forceDropdownRebuild, oldActive, newActive: i, willSync: true});
      origSetActive(i);
      // Mark that activeIndex changed (for dropdown rebuild) only if explicitly requested
      // or if this wasn't just a text box focus (oldActive already equals new i)
      if(forceDropdownRebuild || oldActive !== i){
        this.activeIndexChanged = true;
      }
      // Sync for å sikre at raden finnes i DOM før fokus
      // Pass forceDropdownRebuild flag to syncInputs for dropdown rebuild logic
      console.log('🔄 Calling syncInputs from wrapper with:', {forceDropdownRebuild, flag: (forceDropdownRebuild || (oldActive !== i))});
      window.fm.syncInputs(inputsContainer, forceDropdownRebuild || (oldActive !== i));
      ensureInputMeta();
      updateDeleteForceButtonVisibility();
      // Focus AFTER all UI updates are done
      focusInputFor(i);
      // Force a frame update to ensure visual changes are reflected
      requestAnimationFrame(() => {
        console.log('🎬 Frame requested after setActive');
      });
    };
  }
  wireFocusToSetActive();

  // ===== Scene Element Selection and Hovering (Step 5) =====
  window.selectedSceneElement = null;  // {type, index} or null
  window.hoveredSceneElement = null;   // {type, index, feature} or null
  
  // ===== Anchor Candidate Highlighting (when dragging force anchor) =====
  window.anchorCandidates = null;      // array of candidate anchor points
  window.anchorHoverIndex = -1;        // index of closest candidate to mouse
  
  // Helper: test proximity to all scene element points (including non-snap elements), prefer selected element within GRID_STEP
  function updateSceneElementHover(pos){
    // Build comprehensive point lookup including all elements (not just snap points)
    let pointLookup = null;
    if(window.currentTask && window.buildAllScenePoints){
      pointLookup = window.buildAllScenePoints(window.currentTask);
    }
    
    if(!pointLookup || Object.keys(pointLookup).length === 0){
      window.hoveredSceneElement = null;
      return;
    }
    
    let bestCandidate = null;
    let bestDistance = window.HOVER_THRESHOLD;
    let bestIsSelected = false;
    
    // Iterate through all scene elements
    Object.keys(pointLookup).forEach(key => {
      const entry = pointLookup[key];
      if(!entry) return;
      
      // Parse key to get type and index (e.g., 'rect0' -> {type:'rect', index:0}, 'plane' -> {type:'plane', index:0})
      const match = key.match(/^([a-z]+)(\d*)$/);
      if(!match) return;
      const type = match[1];
      const index = match[2] ? parseInt(match[2]) : 0;  // Default to 0 for elements without index (plane, origin)
      
      // Check if this element is selected
      const isSelected = window.selectedSceneElement && 
                        window.selectedSceneElement.type === type && 
                        window.selectedSceneElement.index === index;
      
      // Test all points in this element
      if(entry.points){
        Object.keys(entry.points).forEach(pointName => {
          const point = entry.points[pointName];
          if(!point) return;
          const dist = geometry.distance(pos, point);
          if(dist > window.HOVER_THRESHOLD) return;
          
          // Priority: selected element within PREFER_SELECTED_DIST wins over everything else
          // Then: closest element overall
          let shouldUpdate = false;
          if(isSelected && dist <= window.PREFER_SELECTED_DIST){
            // Selected element within preferred distance: only update if closer than current best
            shouldUpdate = !bestIsSelected || dist < bestDistance;
          } else if(!bestIsSelected && dist < bestDistance){
            // No selected element yet: update if closer than current best
            shouldUpdate = true;
          } else if(bestIsSelected && !isSelected){
            // Current best is selected: don't replace with non-selected unless it's MUCH closer (not applicable here)
            shouldUpdate = false;
          } else if(bestIsSelected && isSelected && dist < bestDistance){
            // Both selected: take closer one
            shouldUpdate = true;
          }
          
          if(shouldUpdate){
            bestDistance = dist;
            bestCandidate = {type, index, feature: pointName};
            bestIsSelected = isSelected;
          }
        });
      }
      
      // Test all segments in this element (by distance to segment, not just endpoints)
      if(entry.segments){
        Object.keys(entry.segments).forEach(segName => {
          const seg = entry.segments[segName];
          if(!Array.isArray(seg) || seg.length < 2) return;
          
          const dist = window.geometry.distPointToSegment(pos, seg[0], seg[1]);
          if(dist > window.HOVER_THRESHOLD) return;
          
          // Same priority logic as points
          let shouldUpdate = false;
          if(isSelected && dist <= window.PREFER_SELECTED_DIST){
            shouldUpdate = !bestIsSelected || dist < bestDistance;
          } else if(!bestIsSelected && dist < bestDistance){
            shouldUpdate = true;
          } else if(bestIsSelected && !isSelected){
            shouldUpdate = false;
          } else if(bestIsSelected && isSelected && dist < bestDistance){
            shouldUpdate = true;
          }
          
          if(shouldUpdate){
            bestDistance = dist;
            bestCandidate = {type, index, feature: segName};
            bestIsSelected = isSelected;
          }
        });
      }
    });
    
    window.hoveredSceneElement = bestCandidate ? 
      {type: bestCandidate.type, index: bestCandidate.index, feature: bestCandidate.feature} : null;
  }

  // Update delete force button visibility
  // ===== Feedback panel helpers =====
  function updateFeedbackUI(){
    const panel = document.getElementById('feedback-panel');
    const scoreEl = document.getElementById('feedback-score');
    const textEl = document.getElementById('feedback-text');
    const countEl = document.getElementById('fb-count');
    const navEl = document.getElementById('feedback-nav');
    if(!panel || !window.feedbackState) return;
    const { lines: feedback_lines, index, score } = window.feedbackState;
    
    // Always show panel if we have a score
    if(score){
      panel.classList.remove('hidden');
      if(scoreEl) scoreEl.textContent = score;
    }
    
    // If no lines, just show score
    if(!feedback_lines || !feedback_lines.length){
      if(textEl) textEl.textContent = '';
      if(navEl) navEl.style.display = 'none';
      // Reset to default size when no lines
      panel.style.width = '240px';
      panel.style.height = 'auto';
      return;
    }
    
    // Show navigation if we have lines
    if(navEl) navEl.style.display = 'flex';
    const line = feedback_lines[index];
    if(textEl) textEl.textContent = line.text;
    if(countEl) countEl.textContent = `${index+1} / ${feedback_lines.length}`;
    window.applyHighlightsFor(line.indices || []);
    
    // Calculate and apply dynamic size
    const size = window.calculateFeedbackPanelSize(feedback_lines);
    panel.style.width = size.width + 'px';
    panel.style.height = size.height + 'px';
  }
  window.showFeedback = function(lines, score){
    const arr = Array.isArray(lines) ? lines : [];
    window.feedbackState = { lines: arr, index: 0, score: score || '' };
    updateFeedbackUI();
    // Fallback: if panel still hidden but we have lines, force display
    if(arr.length){
      const panel = document.getElementById('feedback-panel');
      if(panel && panel.classList.contains('hidden')){
        panel.classList.remove('hidden');
      }
    }
  };
  function clearFeedback(){
    const panel = document.getElementById('feedback-panel');
    if(panel) panel.classList.add('hidden');
    window.feedbackState = null; window.lastEvaluation = null;
    window.clearHighlights();
  }
  // Nav buttons
  document.addEventListener('click', (e)=>{
    const tgt = e.target;
    if(!(tgt instanceof HTMLElement)) return;
    if(tgt.id==='fb-prev' || tgt.id==='fb-next'){
      if(!window.feedbackState) return;
      const { lines } = window.feedbackState;
      if(!lines || !lines.length) return;
      if(tgt.id==='fb-prev') window.feedbackState.index = (window.feedbackState.index - 1 + lines.length)%lines.length;
      else window.feedbackState.index = (window.feedbackState.index + 1) % lines.length;
      updateFeedbackUI();
      e.stopPropagation();
      return;
    }
    // Any other click outside feedback panel hides it and clears highlights
    const panel = document.getElementById('feedback-panel');
    // Do not clear when clicking inside feedback panel or on the Sjekk button (including its children)
    const inCheckButton = !!tgt.closest && tgt.closest('#btn-check');
    if(panel && !panel.contains(tgt) && !inCheckButton){
      clearFeedback();
    }
  });

  // ===== Load initial task (Task 1) =====
  function seedInitialForces(task){
    if(!task || !task.initialForces) return;
    const hadInitialBlank = (window.fm.forces.length===1 && !window.fm.forces[0].anchor && !window.fm.forces[0].arrowBase && !window.fm.forces[0].arrowTip);
    task.initialForces.forEach(spec => {
      // Build geometry from anchorFrom rect point + direction & length
      if(spec.anchorFrom){
        const lookup = window.sceneLookup?.[spec.anchorFrom];
        const sourcePos = lookup?.points?.[spec.point];
        const savedPos = Array.isArray(spec.anchor) && spec.anchor.length >= 2 &&
          spec.anchor.every(Number.isFinite) ? spec.anchor :
          Array.isArray(spec.anchorSpec?.pos) && spec.anchorSpec.pos.length >= 2 &&
            spec.anchorSpec.pos.every(Number.isFinite) ? spec.anchorSpec.pos : null;
        const P = sourcePos || savedPos;
        if(!P) return;
        if(!sourcePos){
          spec.anchorSpec = {type:'custom',pos:P.slice()};
          delete spec.anchorFrom;
          if(Array.isArray(spec.anchor) && spec.anchor.length >= 2 && spec.anchor.every(Number.isFinite)){
            spec.anchor = P.slice();
          }
        }
        const dir = spec.dir || [1,0];
        const L = spec.len || (GRID_STEP*3);
        const arrowBase = !sourcePos && Array.isArray(spec.arrowBase) && spec.arrowBase.length >= 2 &&
          spec.arrowBase.every(Number.isFinite) ? spec.arrowBase : P;
        const arrowTip = !sourcePos && Array.isArray(spec.arrowTip) && spec.arrowTip.length >= 2 &&
          spec.arrowTip.every(Number.isFinite)
          ? spec.arrowTip : [arrowBase[0]+dir[0]*L, arrowBase[1]+dir[1]*L];
        const f = new Force();
        f.anchor = P.slice();
        f.arrowBase = arrowBase.slice();
        f.arrowTip = arrowTip.slice();
        f.name = spec.name || '';
        window.forceNotation?.restore(f,spec,true);
        f.moveable = false;
        f.isExpected = false;
        f.updateDirectionAndLength();
        window.fm.forces.push(f);
      } else if(spec.anchor && spec.arrowBase && spec.arrowTip){
        const f = new Force();
        f.anchor = spec.anchor.slice();
        f.arrowBase = spec.arrowBase.slice();
        f.arrowTip = spec.arrowTip.slice();
        f.name = spec.name || '';
        window.forceNotation?.restore(f,spec,true);
        f.moveable = false;
        f.isExpected = false;
        f.updateDirectionAndLength();
        window.fm.forces.push(f);
      }
    });
    // If this task has initial forces, show them first, then add one blank at the end.
    if(task.initialForces.length > 0){
      // Remove any existing blank(s) from the list (e.g., the constructor's initial blank)
      window.fm.forces = window.fm.forces.filter(f => !(f.anchor === null && f.arrowBase === null && f.arrowTip === null && !f.name));
      // Append a single blank editable force at the end for the user
      const blankForce = new Force();
      blankForce.isExpected = true; // new forces default to expected
      window.fm.forces.push(blankForce);
      window.fm.setActive(window.fm.forces.length-1);
    } else {
      // No initial forces: keep the initial blank at index 0
      // Ensure exactly one blank exists
      const blanks = window.fm.forces.filter(f => f.anchor === null && f.arrowBase === null && f.arrowTip === null && !f.name);
      if(blanks.length===0){ 
        const blankForce = new Force();
        blankForce.isExpected = true;
        window.fm.forces.unshift(blankForce);
      }
      // Remove any extra blanks beyond the first
      for(let i=window.fm.forces.length-1;i>=1;i--){
        const f = window.fm.forces[i];
        if(f.anchor === null && f.arrowBase === null && f.arrowTip === null && !f.name){
          window.fm.forces.splice(i,1);
        }
      }
      window.fm.setActive(0);
    }
    window.fm.syncInputs(inputsContainer);
    ensureInputMeta();
  }

  // Solution forces system removed - use editor.js for editor mode handling

  // Generate a default Force from expectedForce specification
  function generateDefaultForce(expectedForce){
    if(!expectedForce || !expectedForce.anchor) return null;
    
    const f = new Force();
    f.name = expectedForce.name || '';
    
    // Use anchor from expectedForce
    if(typeof expectedForce.anchor === 'object' && expectedForce.anchor.type){
      f.anchor = expectedForce.anchor; // Copy anchor spec
    } else if(Array.isArray(expectedForce.anchor)){
      f.anchor = expectedForce.anchor.slice();
    }
    
    // Use direction from expectedForce or default [0, 1]
    const dir = expectedForce.dir || [0, 1];
    const len = 3 * window.GRID_STEP; // Default force length
    
    // Set anchor position if it's a point
    if(expectedForce.anchor && Array.isArray(expectedForce.anchor)){
      f.arrowBase = expectedForce.anchor.slice();
    } else {
      // Try to resolve anchor point from scene
      f.arrowBase = expectedForce.anchor ? expectedForce.anchor.slice() : null;
    }
    
    if(f.arrowBase){
      f.arrowTip = [f.arrowBase[0] + dir[0] * len, f.arrowBase[1] + dir[1] * len];
      f.updateDirectionAndLength();
    }
    
    f.isExpected = true;
    f.moveable = true;
    return f;
  }

  // Validation removed - use editor mode only

  // Save removed - use editor mode only

  function updateHelpButton(){
    window.updateTaskHeader();
  }

  // Editor mode functions removed - editor.js handles editor mode functionality

  /**
   * Updates application state after task loads or when forces/scene elements change.
   * Rebuilds snap points, guidelines, scene panel, and synchronizes UI.
   * Called whenever:
   * - Loading a new task
   * - Editing forces or scene elements
   * - Changing settings
   * - Clicking toolbar buttons
   */
  
  /**
   * Build list of all possible anchor candidates from scene.
   * Returns array of {ref, type, point, pos} or {ref, type, segment, pos} objects.
   * type is always 'point' or 'segment'
   * ref is like 'point-1', 'rect0', 'ellipse1', etc.
   * point is like 'center', 'top_center', etc.
   * segment is like 'top', 'bottom', etc.
   * pos is the [x, y] coordinate for distance matching.
   */
  window.buildAnchorCandidates = function(task){
    if(window.sceneModel) return window.sceneModel.candidates(task);
    const candidates = [];
    if(!task || !task.scene) return candidates;
    
    const scene = task.scene;
    
    // Rects - points and segments
    if(Array.isArray(scene.rects)){
      scene.rects.forEach((r, i) => {
        if(!r) return;
        const pts = window.rectPoints ? window.rectPoints(r) : null;
        if(!pts) return;
        
        const ref = `rect${i}`;
        
        // Points
        [
          { name: 'center', pos: pts.center },
          { name: 'top_center', pos: pts.top_center },
          { name: 'bottom_center', pos: pts.bottom_center },
          { name: 'left_middle', pos: pts.left_middle },
          { name: 'right_middle', pos: pts.right_middle }
        ].forEach(p => {
          candidates.push({
            ref, type: 'point', point: p.name, pos: p.pos
          });
        });
        
        // Segments
        [
          { name: 'top', seg: [pts.topLeft, pts.topRight] },
          { name: 'bottom', seg: [pts.bottomLeft, pts.bottomRight] },
          { name: 'left', seg: [pts.bottomLeft, pts.topLeft] },
          { name: 'right', seg: [pts.bottomRight, pts.topRight] }
        ].forEach(s => {
          const midpoint = [
            (s.seg[0][0] + s.seg[1][0]) / 2,
            (s.seg[0][1] + s.seg[1][1]) / 2
          ];
          candidates.push({
            ref, type: 'segment', segment: s.name, pos: midpoint
          });
        });
      });
    }
    
    // Ellipses - points and segments (contact points at cardinal directions)
    if(Array.isArray(scene.ellipses)){
      scene.ellipses.forEach((e, i) => {
        if(!e || !e.center) return;
        
        const t = e.t_vec || [1, 0];
        const n = e.n_vec || [0, -1];
        const cx = e.center[0];
        const cy = e.center[1];
        const rx = (e.width || 0) / 2;
        const ry = (e.height || 0) / 2;
        
        const ref = `ellipse${i}`;
        
        // Points (cardinal directions on ellipse)
        const points = [
          { name: 'center', pos: [cx, cy] },
          { name: 'top_center', pos: [cx + n[0]*ry, cy + n[1]*ry] },
          { name: 'bottom_center', pos: [cx - n[0]*ry, cy - n[1]*ry] },
          { name: 'left_middle', pos: [cx - t[0]*rx, cy - t[1]*rx] },
          { name: 'right_middle', pos: [cx + t[0]*rx, cy + t[1]*rx] }
        ];
        
        points.forEach(p => {
          candidates.push({
            ref, type: 'point', point: p.name, pos: p.pos
          });
        });
        
        // Segments (contact edges at cardinal directions)
        const segments = [
          { name: 'top', pos: [cx + n[0]*ry, cy + n[1]*ry] },
          { name: 'bottom', pos: [cx - n[0]*ry, cy - n[1]*ry] },
          { name: 'left', pos: [cx - t[0]*rx, cy - t[1]*rx] },
          { name: 'right', pos: [cx + t[0]*rx, cy + t[1]*rx] }
        ];
        
        segments.forEach(s => {
          candidates.push({
            ref, type: 'segment', segment: s.name, pos: s.pos
          });
        });
      });
    }
    
    console.log('📋 buildAnchorCandidates generated', candidates.length, 'candidates:', candidates);
    return candidates;
  };
  
  /**
   * Find best anchor match for a force position.
   * Searches through all candidates and returns closest one within threshold.
   * Returns {ref, type, point/segment} or null if no match found.
   * threshold defaults to 40 pixels (2 * GRID_STEP)
   */
  window.findBestAnchor = function(forcePos, task, threshold = 40){
    if(!forcePos || !task) return null;
    
    const candidates = window.buildAnchorCandidates(task);
    if(!candidates.length) return null;
    
    let bestMatch = null;
    let bestDistance = threshold;
    
    candidates.forEach(candidate => {
      if(!candidate.pos) return;
      
      const dx = forcePos[0] - candidate.pos[0];
      const dy = forcePos[1] - candidate.pos[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if(dist < bestDistance){
        bestDistance = dist;
        bestMatch = candidate;
      }
    });
    
    return bestMatch;
  };
  
  // Kept as a no-op for compatibility with code that calls the editor API.
  window.cleanupTaskForEvaluation = function(){
    return { valid: true, message: '' };
  };

  window.updateAppState = function(){
    //console.log('updateAppState() kjørt - oppdaterer snap points, guidelines, scene panel, etc.');
    if(!window.currentTask) return;
    
    // Cleanup: ensure exactly one blank force at the end, remove extra blanks
    if(window.fm && window.fm.forces){
      // Find all blank forces (in reverse order to avoid index issues)
      const blankIndices = [];
      for(let i = window.fm.forces.length - 1; i >= 0; i--){
        const f = window.fm.forces[i];
        if(!f.anchor && !f.arrowBase && !f.arrowTip && (!f.name || f.name.trim() === '') && !f.studentSpecName && (!f.role || f.role==='force')){
          blankIndices.push(i);
        }
      }
      // If multiple blanks, remove all but the last one (which is the first in our reverse list)
      if(blankIndices.length > 1){
        // Remove blanks from highest index to lowest to avoid index shifting issues
        for(let i = 1; i < blankIndices.length; i++){
          window.fm.forces.splice(blankIndices[i], 1);
        }
        // Re-sync the UI to reflect removed blanks
        window.fm.syncInputs(document.getElementById('force-inputs'));
      }
      // If no blanks at all, add one
      else if(blankIndices.length === 0){
        window.fm.ensureTrailingBlank();
        window.fm.syncInputs(document.getElementById('force-inputs'));
      }
    }
    
    // 0. Rebuild scene lookup from current scene - use ALL points for highlighting/hovering (includes segments, arrows, etc.)
    window.sceneLookup = window.buildAllScenePoints(window.currentTask);
    
    // 1. Rebuild snap points from current scene (use snap-enabled lookup for snapping)
    const snapLookup = buildSceneLookup(window.currentTask);
    if(snapLookup){
      window.snapPoints = snapping.buildSnapPoints(snapLookup);
    }
    
    // 2. Update guidelines based on what is selected (only if enabled)
    if(window.enableGuidelines){
      const plane = window.currentTask.scene?.plane;
      
      // Scene element is selected - use its guidelines
      if(window.selectedSceneElement && window.selectedSceneElement.type){
        const { type, index } = window.selectedSceneElement;
        const scene = window.currentTask.scene;
        let elementOrigin = null;
        
        if(type === 'plane' && scene?.plane){
          elementOrigin = scene.plane.through;
        } else if(type === 'rect' && scene?.rects?.[index]){
          elementOrigin = scene.rects[index].bottomCenter;
        } else if(type === 'ellipse' && scene?.ellipses?.[index]){
          elementOrigin = scene.ellipses[index].center;
        } else if(type === 'segment' && scene?.segments?.[index]){
          elementOrigin = scene.segments[index].a;
        } else if(type === 'text' && scene?.texts?.[index]){
          elementOrigin = scene.texts[index].pos;
        }
        
        // Build guidelines from scene element's origin using plane axes
        if(elementOrigin){
          window.currentGuidelines = snapping.buildGuidelines(elementOrigin, elementOrigin, plane);
        }
      }
      // Force is active - use arrowBase and plane
      else if(window.fm){
        const active = window.fm.forces[window.fm.activeIndex];
        if(active && active.arrowBase){
          window.currentGuidelines = snapping.buildGuidelines(active.arrowBase, active.arrowBase, plane);
        } else {
          window.currentGuidelines = null;
        }
      }
      // Nothing selected - no guidelines
      else {
        window.currentGuidelines = null;
      }
    } else {
      // Guidelines disabled
      window.currentGuidelines = null;
    }
    
    // 4. Update help button text (shows task id and score)
    updateHelpButton();
    
    // 5. Sync force inputs with DOM
    const inputsContainer = document.getElementById('force-inputs');
    if(window.fm && inputsContainer){
      window.fm.syncInputs(inputsContainer);
      ensureInputMeta();
    }
    
    // 7. Update panel heights based on content
    updatePanelHeights();
  };

  function snapChecklistOverrideKey(taskId){
    return `tk_snapChecklistOverride_${taskId}`;
  }

  function syncGuidelinesButton(){
    const button=document.getElementById('btn-guidelines');
    if(button) button.classList.toggle('btn-active',window.enableGuidelines);
  }

  function applySnapChecklist(task){
    let checklist=window.getTaskSnapChecklist(task);
    let override=null;
    try{
      const saved=localStorage.getItem(snapChecklistOverrideKey(task.id));
      if(saved) override=JSON.parse(saved);
    }catch(error){
      console.warn(`Could not load snap checklist override for task ${task.id}:`,error);
    }
    if(override&&typeof override==='object'&&!Array.isArray(override)){
      checklist=window.normalizeSnapChecklist(task,override,checklist);
    }
    window.currentSnapChecklist=checklist;
    window.enableSnap=checklist.snapEnabled;
    window.enableGuidelines=checklist.guidelinesEnabled;
    syncGuidelinesButton();
    window.settings.show_force_coordinates=checklist.showForceCoordinates;
    const snap=document.getElementById('settings-snap');
    const guidelines=document.getElementById('settings-guidelines');
    const coordinates=document.getElementById('settings-show-force-coordinates');
    if(snap) snap.checked=checklist.snapEnabled;
    if(guidelines) guidelines.checked=checklist.guidelinesEnabled;
    if(coordinates) coordinates.checked=checklist.showForceCoordinates;
    return checklist;
  }

  function saveSnapChecklistOverride(checklist){
    if(!window.currentTask) return;
    const normalized=window.normalizeSnapChecklist(window.currentTask,checklist,
      window.getTaskSnapChecklist(window.currentTask));
    window.currentSnapChecklist=normalized;
    window.enableSnap=normalized.snapEnabled;
    window.enableGuidelines=normalized.guidelinesEnabled;
    syncGuidelinesButton();
    window.settings.show_force_coordinates=normalized.showForceCoordinates;
    try{
      localStorage.setItem(snapChecklistOverrideKey(window.currentTask.id),JSON.stringify(normalized));
    }catch(error){
      console.warn(`Could not save snap checklist override for task ${window.currentTask.id}:`,error);
    }
    const snap=document.getElementById('settings-snap');
    const guidelines=document.getElementById('settings-guidelines');
    const coordinates=document.getElementById('settings-show-force-coordinates');
    if(snap) snap.checked=normalized.snapEnabled;
    if(guidelines) guidelines.checked=normalized.guidelinesEnabled;
    if(coordinates) coordinates.checked=normalized.showForceCoordinates;
    window.updateAppState();
  }

  function loadTask(index){
    if(!window.tasks || !window.tasks.length) return;
    window.currentTaskIndex = (index + window.tasks.length) % window.tasks.length;
    // NEW: persist current task index
    try { localStorage.setItem('tk_currentTaskIndex', String(window.currentTaskIndex)); } catch {}
    
    // Check if task already exists in localStorage - if so, load ONLY from localStorage
    const taskId = window.tasks[window.currentTaskIndex].id;
    const taskStorageKey = `tk_task_${taskId}`;
    const savedTaskData = localStorage.getItem(taskStorageKey);
    
    let isLoadedFromStorage = false;
    if(savedTaskData){
      // Task has been edited before - load completely from localStorage
      try {
        window.currentTask = JSON.parse(savedTaskData);
      } catch {
        // Fallback to default task if parse fails
        window.currentTask = window.tasks[window.currentTaskIndex];
      }
    } else {
      // First time loading this task - use default from tasks
      window.currentTask = window.tasks[window.currentTaskIndex];
    }

    window.sceneModel?.migrateCirclesToEllipses(window.currentTask);
    applySnapChecklist(window.currentTask);
    window.sceneLookup = window.buildAllScenePoints(window.currentTask);
    
    // Use snap-enabled lookup for snapping
    const snapLookup = buildSceneLookup(window.currentTask);
    window.snapPoints = snapping.buildSnapPoints(snapLookup);
      

    
    // Create new ForcesManager (will be populated below)
    window.fm = new ForcesManager();
    // Rebuild inputs for new manager to avoid stale listeners
    inputsContainer.innerHTML = '';
    // CHANGE: Load ONLY initialForces, not savedForces (player mode should reset forces each session)
    // Always seed initialForces from task definition (they never come from localStorage)
    seedInitialForces(window.currentTask);
    
    // Load any saved forces for this task from localStorage
    const taskKey = `tk_forces_${window.currentTask.id}`;
    const savedForcesData = localStorage.getItem(taskKey);
    if(savedForcesData){
      try {
        const savedForces = JSON.parse(savedForcesData);
        
        // Remove trailing blank force added by seedInitialForces before adding saved forces
        if(window.fm.forces.length > 0){
          const lastForce = window.fm.forces[window.fm.forces.length - 1];
          if(!lastForce.anchor && !lastForce.arrowBase && !lastForce.arrowTip && !lastForce.name){
            window.fm.forces.pop();
          }
        }
        
        // Load saved forces into the forces array
        savedForces.forEach(spec => {
          const f = new Force();
          f.anchor = spec.anchor ? [spec.anchor[0], spec.anchor[1]] : null;
          f.arrowBase = spec.arrowBase ? [spec.arrowBase[0], spec.arrowBase[1]] : null;
          f.arrowTip = spec.arrowTip ? [spec.arrowTip[0], spec.arrowTip[1]] : null;
          f.name = spec.name || '';
          window.forceNotation?.restore(f,spec);
          f.moveable = spec.moveable !== false;
          f.isExpected = spec.isExpected !== false;
          if(f.arrowBase && f.arrowTip) f.updateDirectionAndLength();
          window.fm.forces.push(f);
        });
        
        // Ensure there's a trailing blank force for adding new ones
        const hasBlank = window.fm.forces.some(f => !f.anchor && !f.arrowBase && !f.arrowTip && !f.name);
        if(!hasBlank){
          const blankForce = new Force();
          blankForce.isExpected = true;
          window.fm.forces.push(blankForce);
        }
      } catch (err) {
        console.warn(`Could not load saved forces for task ${window.currentTask.id}:`, err);
      }
    }
    
    window.forceNotation?.seedStudentForces(window.currentTask,window.fm);
    window.fm.forces.forEach(f=>window.forceNotation?.resolve(f,window.currentTask));
    window.forceNotation?.sort(window.fm,window.currentTask);
    window.fm.syncInputs(inputsContainer);
    ensureInputMeta();
    // Update all derived state after task load
    window.updateAppState();
  }
  
  // Ctrl/Cmd+R previews the matching editor task, keeping drawn forces.
  // Hidden from student UI; both pages must share the same localStorage origin.
  function reloadTaskFromEditor(e){
    if(e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey ||
      e.key.toLowerCase() !== 'r' || !window.currentTask) return;
    if(e.repeat){
      e.preventDefault();
      return;
    }
    const taskId = window.currentTask.id;
    try{
      const saved = localStorage.getItem(`editor_task_${taskId}`);
      if(saved === null){
        console.warn(`Ingen editoroppgave med ID ${taskId}; bruker vanlig sideoppdatering.`);
        return;
      }
      e.preventDefault();
      const task = JSON.parse(saved);
      if(!task || task.id !== taskId || !task.scene || typeof task.scene !== 'object' ||
        Array.isArray(task.scene)){
        throw new Error('Editoroppgaven har ugyldig ID eller scene.');
      }
      if(!Array.isArray(task.help_lines)) task.help_lines = [];
      delete task.comment;
      window.saveTaskForces();
      localStorage.setItem(`tk_task_${taskId}`, JSON.stringify(task));
      localStorage.removeItem(snapChecklistOverrideKey(taskId));
      const scores = {...window.taskScores};
      delete scores[taskId];
      localStorage.setItem('tk_taskScores', JSON.stringify(scores));
      window.taskScores = scores;
      window.tasks[window.currentTaskIndex] = task;
      const defaultIndex = window.TASKS.findIndex(item => item.id === taskId);
      if(defaultIndex >= 0) window.TASKS[defaultIndex] = task;
      delete window.taskComments[taskId];
      window.snapIndicator = null;
      window.currentGuidelines = null;
      clearFeedback();
      loadTask(window.currentTaskIndex);
      updateUserDisplay();
      const helpPanel = document.getElementById('help-panel');
      if(helpPanel && !helpPanel.classList.contains('hidden')){
        const helpTitle = document.getElementById('help-title');
        if(helpTitle) helpTitle.textContent = `${window.getTaskPositionLabel(task)}: ${task.title || ''}`;
        window.updateHelpPanelLayout();
        drawHelpLinesCanvas();
      }
    }catch(error){
      e.preventDefault();
      console.error(`Kunne ikke laste oppgave ${taskId} fra editor:`,error);
      alert('Kunne ikke laste oppgaven fra editor: ' + error.message);
    }
  }
  document.addEventListener('keydown', reloadTaskFromEditor);

  // Save current task to localStorage
  function saveTask(){
    if(!window.currentTask) return;
    const taskId = window.currentTask.id;
    
    // Save the entire task (scene, forces stored separately)
    const taskToSave = JSON.parse(JSON.stringify(window.currentTask));
    try {
      localStorage.setItem(`tk_task_${taskId}`, JSON.stringify(taskToSave));
    } catch {}
  }
  
  // Load all saved tasks from localStorage and merge with default TASKS
  function loadSavedTasks(){
    const taskOrderKey = 'tk_taskOrder';
    try {
      const stored = localStorage.getItem(taskOrderKey);
      if(!stored) return;
      
      const taskIds = JSON.parse(stored);
      for(const taskId of taskIds){
        const taskKey = `tk_task_${taskId}`;
        const taskData = localStorage.getItem(taskKey);
        if(!taskData) continue;
        
        try {
          const savedTask = JSON.parse(taskData);
          // Ensure help_lines exists
          if(!savedTask.help_lines || !Array.isArray(savedTask.help_lines)){
            savedTask.help_lines = [];
          }
          // Find and replace existing task with same ID, or add new one
          const existingIdx = window.tasks.findIndex(t => t.id === taskId);
          if(existingIdx >= 0){
            window.tasks[existingIdx] = savedTask;
          } else {
            window.tasks.push(savedTask);
          }
        } catch {}
      }
    } catch {}
  }

  // Save task order to localStorage
  function saveTaskOrder(){
    try {
      const taskOrder = window.tasks.map(t => t.id);
      localStorage.setItem('tk_taskOrder', JSON.stringify(taskOrder));
    } catch {}
  }

  // Load and apply task order from localStorage
  function loadTaskOrder(){
    try {
      const saved = localStorage.getItem('tk_taskOrder');
      if(!saved) return;

      const savedOrder = JSON.parse(saved);
      
      // Check if there are any tk_task_* entries in localStorage (tasks loaded from player mode)
      let hasPlayerTasks = false;
      for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        if(key && key.startsWith('tk_task_')){
          hasPlayerTasks = true;
          break;
        }
      }
      
      // Create map of all current tasks
      const taskMap = new Map(window.tasks.map(t => [t.id, t]));
      
      // Rebuild tasks array: apply saved order, then append new tasks only if NO player tasks exist
      const orderedTasks = [];
      for(const id of savedOrder){
        if(taskMap.has(id)){
          orderedTasks.push(taskMap.get(id));
          taskMap.delete(id); // Mark as used
        }
      }
      
      // Append remaining tasks (new ones, if any)
      if(!hasPlayerTasks){
        for(const task of taskMap.values()){
          orderedTasks.push(task);
        }
      }
      
      window.tasks = orderedTasks;
    } catch {}
  }
  
  // Scene element creation buttons removed - editor only

  // Toggle force between initial and expected
  window.toggleForceType = function(forceIndex){
    if(!window.currentTask || !window.fm || forceIndex < 0 || forceIndex >= window.fm.forces.length) return;
    
    const force = window.fm.forces[forceIndex];
    const isExpected = force.isExpected !== false; // default to expected
    
    // Move force between arrays
    if(isExpected){
      // Move from expected to initial
      window.currentTask.expectedForces = window.currentTask.expectedForces.filter(f => f.name!==force.name);
      if(!window.currentTask.initialForces) window.currentTask.initialForces = [];
      window.currentTask.initialForces.push({ ...window.forceNotation?.metadata(force), name: force.name });
      force.isExpected = false;
    } else {
      // Move from initial to expected
      window.currentTask.initialForces = window.currentTask.initialForces.filter(f => f.name!==force.name);
      if(!window.currentTask.expectedForces) window.currentTask.expectedForces = [];
      
      // Try to auto-detect best anchor based on force's drawn position
      let anchorSpec = {type:'custom',pos:(force.anchor || force.arrowBase || window.DRAW_CENTER || [500,340]).slice()};
      
      if(force.arrowBase && window.currentTask.scene){
        const bestMatch = window.findBestAnchor(force.arrowBase, window.currentTask, 60);
        
        if(bestMatch){
          if(bestMatch.type === 'point'){
            anchorSpec = {
              type: 'point',
              ref: bestMatch.ref,
              point: bestMatch.point
            };
          } else if(bestMatch.type === 'segment'){
            anchorSpec = {
              type: 'segment',
              ref: bestMatch.ref,
              segment: bestMatch.segment
            };
          }
        }
      }
      
      // Set anchor, dir, and aliases for newly expected force
      window.currentTask.expectedForces.push({ 
        ...window.forceNotation?.metadata(force),
        name: force.name,
        aliases: [force.name.toLowerCase()],
        dir: [0, 1], // default downward (gravity-like)
        anchor: anchorSpec
      });
      force.isExpected = true;
    }
    
    // Save and refresh
    saveTaskForces();
    window.fm.syncInputs(document.getElementById('force-inputs'));
  };

  window.saveTaskForces = function saveTaskForces(){
    if(!window.currentTask || !window.fm) return;
    const taskKey = `tk_forces_${window.currentTask.id}`;
    
    // Filter out blank forces AND initialForces (only save editable expected forces)
    const nonBlankForces = window.fm.forces.filter(f => {
      // Skip initialForces (they have moveable=false)
      if(f.moveable === false) return false;
      
      const hasAnchor = f.anchor !== null && f.anchor !== undefined;
      const hasArrowBase = f.arrowBase !== null && f.arrowBase !== undefined;
      const hasArrowTip = f.arrowTip !== null && f.arrowTip !== undefined;
      const hasName = f.name && f.name.trim() !== '';
      return hasAnchor || hasArrowBase || hasArrowTip || hasName || f.studentSpecName || (f.role && f.role!=='force');
    });
    
    const specs = nonBlankForces.map(f=>(
      {
        anchor: f.anchor ? [f.anchor[0], f.anchor[1]] : null,
        arrowBase: f.arrowBase ? [f.arrowBase[0], f.arrowBase[1]] : null,
        arrowTip: f.arrowTip ? [f.arrowTip[0], f.arrowTip[1]] : null,
        name: f.name || '',
        ...window.forceNotation?.metadata(f),
        moveable: f.moveable,
        isExpected: f.isExpected !== false,
      }
    ));
    try{ 
      localStorage.setItem(taskKey, JSON.stringify(specs));
    } catch {}
  }

  // Solution forces removed - use editor.js for editor mode

  // API used by the toolbar check button and by report.js
  window.reportApi = {
    loadTask: (i) => loadTask(i),
    clearFeedback: () => clearFeedback(),
    // Runs the normal "Sjekk" for the current task and stores score + feedback
    checkCurrent: function(){
      window.fm.normalizeNames?.();
      saveTaskForces();
      runEvaluation();
      if(window.lastEvaluation && window.lastEvaluation.summary){
        const taskId = window.currentTask.id;
        const score = window.lastEvaluation.summary.finalScore;
        window.taskScores[taskId] = { score, feedback: window.lastEvaluation.lines.map(l=>l.text).join(' | ') };
        try{ localStorage.setItem('tk_taskScores', JSON.stringify(window.taskScores)); } catch {}
        updateUserDisplay();
        updateHelpButton();
      }
    }
  };

  // Load a current task schema before merging persisted tasks, so version checks
  // can distinguish supported fields from fields belonging to older builds.
  (async function initializeTasks(){
    const currentTasks = await window.loadSupportedTaskSchema();
    window.currentTaskSchema = currentTasks;
    window.TASKS = currentTasks;
    window.tasks = window.TASKS;
    await window.AppVersioning.checkStorage('player',currentTasks);
    loadSavedTasks();
    loadTaskOrder();

    let startIdx = 0;
    try {
      const s = localStorage.getItem('tk_currentTaskIndex');
      if(s !== null){
        const n = parseInt(s, 10);
        if(!Number.isNaN(n)) startIdx = n;
      }
    } catch {}
    if(!window.tasks.length){
      window.tasks = currentTasks;
      window.TASKS = window.tasks;
      window.tasks.forEach(task => {
        if(!Array.isArray(task.help_lines)) task.help_lines = [];
        delete task.comment;
        try{localStorage.setItem(`tk_task_${task.id}`,JSON.stringify(task));}catch(error){console.warn(`Kunne ikke lagre oppgave ${task.id}:`,error);}
      });
      try{
        localStorage.setItem('tk_taskOrder',JSON.stringify(window.tasks.map(task => task.id)));
        localStorage.setItem('tk_currentTaskIndex','0');
      }catch(error){console.warn('Kunne ikke lagre standardoppgavene:',error);}
      startIdx = 0;
    }
    loadTask(startIdx);
  })().catch(error => console.error('Kunne ikke starte elevmodus:',error));

  // ===== Task Set Selection from localStorage =====
  function populateTasksetSelect() {
    const tasksetSelect = document.getElementById('taskset-select');
    if (!tasksetSelect) {
      console.warn('⚠️ No tasksets in browsers localStorage ');
      return;
    }

    // Clear existing options except the default one
    tasksetSelect.innerHTML = '<option value="">-- Ingen oppgavesett valgt --</option>';

    // Find all taskset_* entries in localStorage
    const tasksets = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('taskset_')) {
        const name = key.replace('taskset_', '');
        try {
          const data = JSON.parse(localStorage.getItem(key));
          tasksets.push({
            key: key,
            name: name,
            taskIds: data.taskIds || [],
            timestamp: data.timestamp || ''
          });
        } catch (e) {
          console.error('❌ Error parsing taskset:', key, e);
        }
      }
    }

    console.log(`📦 Found ${tasksets.length} tasksets in localStorage`);

    // Get the localStorage section container
    const localStorageSection = document.getElementById('taskset-localStorage-section');
    
    // If no tasksets found, hide the localStorage section
    if (tasksets.length === 0) {
      if (localStorageSection) {
        localStorageSection.style.display = 'none';
      }
      return;
    }
    
    // Show the section if tasksets exist
    if (localStorageSection) {
      localStorageSection.style.display = 'block';
    }

    // Sort by timestamp (newest first)
    tasksets.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateB - dateA;
    });

    // Add tasksets to select
    tasksets.forEach(ts => {
      const option = document.createElement('option');
      option.value = ts.key;
      const taskCount = ts.taskIds.length;
      const date = new Date(ts.timestamp);
      const dateStr = isNaN(date.getTime()) ? '' : ` (${date.toLocaleDateString('no-NO')})`;
      option.textContent = `${ts.name} - ${taskCount} oppgaver${dateStr}`;
      tasksetSelect.appendChild(option);
    });
  }



  // ===== Mouse interaction for forces =====
  function withinForceArea(x,y){
    // Allow drawing anywhere within canvas bounds
    return x >= 0 && y >= 0 && x <= WIDTH && y <= HEIGHT;
  }

  function getMousePos(evt){
    // Use shared getMousePos from shared.js
    return window.getMousePos(evt);
  }

  // Editor state - track dragging scene element handles
  window.draggingHandle = null; // {type, index, handleType}
  
  /**
   * Detects if a mouse position is near any handle of the currently selected scene element.
   * Checks all possible handles for the element type (plane, rect, ellipse, segment, arrow, text, point).
   * 
   * @param {Array<number>} pos - The mouse position [x, y] in canvas coordinates
   * @returns {Object|null} Handle info object if a handle is near the position:
   *   {type: string, index: number, handleType: string} 
   *   or null if no handle is near or not in editor mode
   */
  function getSceneHandleAtPos(pos){
    // Player mode: no scene handle detection
    return null;
    
    const { type, index } = window.selectedSceneElement;
    const scene = window.currentTask?.scene;
    const tolerance = 8;
    
    // Helper to check if pos is near a handle
    function isNear(hx, hy){
      const dx = pos[0] - hx;
      const dy = pos[1] - hy;
      return Math.sqrt(dx*dx + dy*dy) <= tolerance;
    }
    
    if(type === 'plane' && scene?.plane){
      const [x, y] = scene.plane.through;
      if(isNear(x, y)) return {type: 'plane', index, handleType: 'through'};
      
      // Compute dirPoint position
      let dirX, dirY;
      if(scene.plane.dirPoint) {
        [dirX, dirY] = scene.plane.dirPoint;
      } else {
        const [nx, ny] = scene.plane.n_vec || [0, -1];
        dirX = x + nx * 3 * window.GRID_STEP;
        dirY = y + ny * 3 * window.GRID_STEP;
      }
      if(isNear(dirX, dirY)) return {type: 'plane', index, handleType: 'direction'};
    }
    else if(type === 'rect' && scene?.rects?.[index]){
      const rect = scene.rects[index];
      const bc = rect.bottomCenter;
      const t = rect.t_vec || [1, 0];
      const n = rect.n_vec || [0, -1];
      const w = rect.width;
      const h = rect.height;
      
      // Bottom center
      if(isNear(bc[0], bc[1])) return {type: 'rect', index, handleType: 'center'};
      
      // Top center (n-direction)
      const topCenter = [bc[0] + n[0]*h, bc[1] + n[1]*h];
      if(isNear(topCenter[0], topCenter[1])) return {type: 'rect', index, handleType: 'topCenter'};
      
      // Bottom right (t-direction)
      const bottomRight = [bc[0] + t[0]*w/2, bc[1] + t[1]*w/2];
      if(isNear(bottomRight[0], bottomRight[1])) return {type: 'rect', index, handleType: 'bottomRight'};
    }
    else if(type === 'ellipse' && scene?.ellipses?.[index]){
      const ellipse = scene.ellipses[index];
      const [cx, cy] = ellipse.center;
      const t = ellipse.t_vec || [1, 0];
      const n = ellipse.n_vec || [0, -1];
      const w = ellipse.width;
      const h = ellipse.height;
      
      // Center
      if(isNear(cx, cy)) return {type: 'ellipse', index, handleType: 'center'};
      
      // Width direction handle (along t_vec)
      const widthHandle = [cx + t[0]*w/2, cy + t[1]*w/2];
      if(isNear(widthHandle[0], widthHandle[1])) return {type: 'ellipse', index, handleType: 'width'};
      
      // Height direction handle (along n_vec)
      const heightHandle = [cx + n[0]*h/2, cy + n[1]*h/2];
      if(isNear(heightHandle[0], heightHandle[1])) return {type: 'ellipse', index, handleType: 'height'};
    }
    else if(type === 'segment' && scene?.segments?.[index]){
      const seg = scene.segments[index];
      if(isNear(seg.a[0], seg.a[1])) return {type: 'segment', index, handleType: 'a'};
      if(isNear(seg.b[0], seg.b[1])) return {type: 'segment', index, handleType: 'b'};
    }
    else if(type === 'arrow' && scene?.arrows?.[index]){
      const arrow = scene.arrows[index];
      if(isNear(arrow.a[0], arrow.a[1])) return {type: 'arrow', index, handleType: 'a'};
      if(isNear(arrow.b[0], arrow.b[1])) return {type: 'arrow', index, handleType: 'b'};
    }
    else if(type === 'text' && scene?.texts?.[index]){
      const text = scene.texts[index];
      // Don't detect handle for dragging text position if linked
      if(!text.linked){
        const [x, y] = text.pos;
        if(isNear(x, y)) return {type: 'text', index, handleType: 'center'};
      }
    }
    
    return null;
  }
  
  /**
   * Synkronisere krefter når scene-elementer flyttes.
   * Hvis en kraft sitt anker er knyttet til det flytte scene-element,
   * parallelforskyves kraft-ankeret, base og tip med samme delta.
   */
  function syncForcesWithSceneElement(elementType, elementIndex, displacement) {
    if (!window.fm || !window.currentTask) return;
    
    const [dx, dy] = displacement;
    
    // For hver kraft, sjekk om ankeret er knyttet til det flytta scene-elementet
    window.fm.forces.forEach(force => {
      // Finn tilhørende expectedForce for å sjekke anker-binding
      const expectedForce = window.currentTask.expectedForces?.find(ef =>
        ef.name && ef.name.toLowerCase().trim() === force.name.toLowerCase().trim()
      );
      
      if (!expectedForce || !expectedForce.anchor) return;
      
      const anchor = expectedForce.anchor;
      
      // Sjekk om ankeret er knyttet til det flytta scene-elementet
      const isLinkedToElement = (
        anchor.type === 'point' && anchor.ref === `${elementType}${elementIndex}` ||
        anchor.type === 'segment' && anchor.ref === `${elementType}${elementIndex}`
      );
      
      if (isLinkedToElement) {
        // Parallelforskyve ankeret, base og tip
        if (force.anchor) {
          force.anchor[0] += dx;
          force.anchor[1] += dy;
        }
        if (force.arrowBase) {
          force.arrowBase[0] += dx;
          force.arrowBase[1] += dy;
        }
        if (force.arrowTip) {
          force.arrowTip[0] += dx;
          force.arrowTip[1] += dy;
        }
        
        console.log(`🔄 Force "${force.name}" synkronisert med scene-element ${elementType}${elementIndex}: [${dx}, ${dy}]`);
      }
    });
  }

  function moveSceneElement(handleInfo, newPos){
    if(!handleInfo || !window.currentTask) return;
    
    const { type, index, handleType } = handleInfo;
    const scene = window.currentTask.scene;
    
    // Store element's position before move for displacement calculation
    let oldPos = null;
    if(type === 'rect' && scene.rects?.[index]){
      oldPos = [scene.rects[index].bottomCenter[0], scene.rects[index].bottomCenter[1]];
    } else if(type === 'ellipse' && scene.ellipses?.[index]){
      oldPos = [scene.ellipses[index].center[0], scene.ellipses[index].center[1]];
    } else if(type === 'segment' && scene.segments?.[index]){
      // For segments, only track 'a' position (the main reference point)
      oldPos = [scene.segments[index].a[0], scene.segments[index].a[1]];
    }
    
    // Snap the initial position on first call (when _handleStartPos not yet set)
    let startPos = window.selectedSceneElement._handleStartPos;
    if(!startPos){
      // First time: snap the initial position to grid
      let gridOrigin = DRAW_CENTER ? [DRAW_CENTER[0], DRAW_CENTER[1]] : [0, 0];
      const res = snapping.snap(newPos, {
        points: [],
        gridStep: window.GRID_STEP,
        origin: gridOrigin,
        axesDir: null
      });
      startPos = res.pos;
      window.selectedSceneElement._handleStartPos = startPos;
    }
    
    const dx = newPos[0] - startPos[0];
    const dy = newPos[1] - startPos[1];
    
    // Determine origin for snapping and guidelines
    // For snapping: always use DRAW_CENTER (global grid)
    // For guidelines: use element center if available
    let snapOrigin = DRAW_CENTER ? [DRAW_CENTER[0], DRAW_CENTER[1]] : [0, 0];
    let guidelineOrigin = null;
    
    if(type === 'rect'){
      guidelineOrigin = scene.rects?.[index]?.bottomCenter;
    } else if(type === 'ellipse'){
      guidelineOrigin = scene.ellipses?.[index]?.center;
    } else if(type === 'text'){
      guidelineOrigin = scene.texts?.[index]?.pos;
    }
    
    let useNewPos = newPos;
    
    // Build plane with axes for the element being edited
    let snapGuidelines = null;
    if(type === 'rect' && scene.rects?.[index]){
      const rect = scene.rects[index];
      snapGuidelines = {
        through: rect.bottomCenter,
        n_vec: rect.n_vec || [0, -1],
        t_vec: rect.t_vec || [1, 0]
      };
    } else if(type === 'ellipse' && scene.ellipses?.[index]){
      const ellipse = scene.ellipses[index];
      snapGuidelines = {
        through: ellipse.center,
        n_vec: ellipse.n_vec || [0, -1],
        t_vec: ellipse.t_vec || [1, 0]
      };
    } else if(type === 'plane' && scene.plane){
      snapGuidelines = scene.plane;
    } else if(type === 'segment' && scene.segments?.[index]){
      // For segments, calculate axes from segment direction
      const segment = scene.segments[index];
      const dx = segment.b[0] - segment.a[0];
      const dy = segment.b[1] - segment.a[1];
      const len = Math.hypot(dx, dy);
      if(len > 0.01){
        const t_vec = [dx / len, dy / len];
        const n_vec = geometry.normalFromTangent(t_vec);
        snapGuidelines = {
          through: segment.a,
          n_vec: n_vec,
          t_vec: t_vec
        };
      }
    }
    
    // Apply snapping (scene elements snap to grid and plane axes)
    // Always use DRAW_CENTER as origin for grid snapping (global grid)
    let gridOrigin = DRAW_CENTER ? [DRAW_CENTER[0], DRAW_CENTER[1]] : [0, 0];
    
    const res = snapping.snap(newPos, {
      points: [], // Empty points array - snap to grid only, not to other scene elements
      gridStep: window.GRID_STEP,
      origin: gridOrigin,
      axesDir: snapGuidelines
    });
    useNewPos = res.pos;
    window.snapIndicator = res.source ? {pos: res.pos} : null;
    
    // Build guidelines if enabled
    if(window.enableGuidelines){
      const plane = scene.plane;
      window.currentGuidelines = snapping.buildGuidelines(guidelineOrigin, useNewPos, plane);
    }
    
    const snappedDx = useNewPos[0] - startPos[0];
    const snappedDy = useNewPos[1] - startPos[1];
    
    if(type === 'plane' && scene.plane){
      if(handleType === 'through'){
        // Move plane through point - set absolute position for grid alignment
        scene.plane.through[0] = useNewPos[0];
        scene.plane.through[1] = useNewPos[1];
        // If dirPoint exists, move it too
        if(scene.plane.dirPoint) {
          scene.plane.dirPoint[0] += snappedDx;
          scene.plane.dirPoint[1] += snappedDy;
        }
        // Save updated task to localStorage
        saveTask();
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
      else if(handleType === 'direction'){
        // Update dirPoint and recalculate n_vec from through to dirPoint
        scene.plane.dirPoint = [useNewPos[0], useNewPos[1]];
        
        const through = scene.plane.through;
        const dirVec = [useNewPos[0] - through[0], useNewPos[1] - through[1]];
        const len = geometry.length(dirVec);
        if(len > 0.01){
          // Normalize to get n_vec
          scene.plane.n_vec = [dirVec[0] / len, dirVec[1] / len];
          // t_vec is perpendicular (90° counter-clockwise in left-hand coords: [-n_y, n_x])
          scene.plane.t_vec = geometry.tangentFromNormal(scene.plane.n_vec);
          
          // Save updated task to localStorage (plane change invalidates old expectedForces)
          saveTask();
        }
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    }
    else if(type === 'ellipse' && handleType === 'center' && scene.ellipses?.[index]){
      const ellipse = scene.ellipses[index];
      // For center moves, set absolute position for grid alignment
      ellipse.center[0] = useNewPos[0];
      ellipse.center[1] = useNewPos[1];
      window.selectedSceneElement._handleStartPos = useNewPos;
      
      // Synkroniser krefter
      if(oldPos){
        const displacement = [useNewPos[0] - oldPos[0], useNewPos[1] - oldPos[1]];
        syncForcesWithSceneElement('ellipse', index, displacement);
        oldPos = [useNewPos[0], useNewPos[1]];
      }
    }
    else if(type === 'ellipse' && scene.ellipses?.[index]){
      const ellipse = scene.ellipses[index];
      const [cx, cy] = ellipse.center;


      if(handleType === 'width'){
        // Dragging width handle updates width and t_vec (like rect bottomRight)
        const widthRightPos = [useNewPos[0], useNewPos[1]];
        const widthVec = [widthRightPos[0] - cx, widthRightPos[1] - cy];
        const newHalfWidth = geometry.length(widthVec);
        if(newHalfWidth <= 0.01) return;
        const newWidth = newHalfWidth * 2;
        const newT = [widthVec[0] / newHalfWidth, widthVec[1] / newHalfWidth];
        
        window.sceneModel.setEllipseAxisLength(ellipse,'width',newWidth);
        ellipse.t_vec = newT;
        // n_vec is perpendicular to t_vec (90° counter-clockwise)
        ellipse.n_vec = geometry.normalFromTangent(newT);
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    else if(handleType === 'height'){
        // Dragging height handle updates height and n_vec (like rect topCenter)
        const heightTopPos = [useNewPos[0], useNewPos[1]];
        const heightVec = [heightTopPos[0] - cx, heightTopPos[1] - cy];
        const newHalfHeight = geometry.length(heightVec);
        if(newHalfHeight <= 0.01) return;
        const newHeight = newHalfHeight * 2;
        const newN = [heightVec[0] / newHalfHeight, heightVec[1] / newHalfHeight];
        
        window.sceneModel.setEllipseAxisLength(ellipse,'height',newHeight);
        ellipse.n_vec = newN;
        // Update t_vec to be perpendicular to n_vec (90° counter-clockwise: [-n[1], n[0]])
        ellipse.t_vec = geometry.tangentFromNormal(newN);
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    }
    else if(type === 'text' && handleType === 'center' && scene.texts?.[index]){
      const text = scene.texts[index];
      // For text position, set absolute position for grid alignment
      text.pos[0] = useNewPos[0];
      text.pos[1] = useNewPos[1];
      window.selectedSceneElement._handleStartPos = useNewPos;
    }
    else if(type === 'segment' && scene.segments?.[index]){
      const segment = scene.segments[index];
      if(handleType === 'a'){
        // Set absolute position for grid alignment
        segment.a[0] = useNewPos[0];
        segment.a[1] = useNewPos[1];
        window.selectedSceneElement._handleStartPos = useNewPos;
        
        // Synkroniser krefter
        if(oldPos){
          const displacement = [useNewPos[0] - oldPos[0], useNewPos[1] - oldPos[1]];
          syncForcesWithSceneElement('segment', index, displacement);
          oldPos = [useNewPos[0], useNewPos[1]];
        }
      }
      else if(handleType === 'b'){
        // Set absolute position for grid alignment
        segment.b[0] = useNewPos[0];
        segment.b[1] = useNewPos[1];
        window.selectedSceneElement._handleStartPos = useNewPos;
        // Note: only 'a' is linked to expectedForce anchors, so 'b' doesn't trigger sync
      }
    }
    else if(type === 'arrow' && scene.arrows?.[index]){
      const arrow = scene.arrows[index];
      if(handleType === 'a'){
        // Set absolute position for grid alignment
        arrow.a[0] = useNewPos[0];
        arrow.a[1] = useNewPos[1];
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
      else if(handleType === 'b'){
        // Set absolute position for grid alignment
        arrow.b[0] = useNewPos[0];
        arrow.b[1] = useNewPos[1];
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    }
    else if(type === 'rect' && scene.rects?.[index]){
      const rect = scene.rects[index];
      const bc = rect.bottomCenter;
      const t = rect.t_vec || [1, 0];
      const n = rect.n_vec || [0, -1];
      
      if(handleType === 'center'){
        // Move bottom center - set absolute position for grid alignment
        rect.bottomCenter[0] = useNewPos[0];
        rect.bottomCenter[1] = useNewPos[1];
        window.selectedSceneElement._handleStartPos = useNewPos;
        
        // Synkroniser krefter
        if(oldPos){
          const displacement = [useNewPos[0] - oldPos[0], useNewPos[1] - oldPos[1]];
          syncForcesWithSceneElement('rect', index, displacement);
          oldPos = [useNewPos[0], useNewPos[1]];
        }
      }
      else if(handleType === 'topCenter'){
        // Dragging top center updates height and n_vec
        const topCenterPos = [useNewPos[0], useNewPos[1]];
        const heightVec = [topCenterPos[0] - bc[0], topCenterPos[1] - bc[1]];
        const newHeight = geometry.length(heightVec);
        const newN = [heightVec[0] / newHeight, heightVec[1] / newHeight];
        
        rect.height = newHeight;
        rect.n_vec = newN;
        // Update t_vec to be perpendicular to n_vec (rotate 90° counter-clockwise: [-n[1], n[0]])
        rect.t_vec = geometry.tangentFromNormal(newN);
        window.selectedSceneElement._handleStartPos = useNewPos;
        // Note: when resizing, don't shift anchors - they stay at bottomCenter
      }
      else if(handleType === 'bottomRight'){
        // Dragging bottom right updates width and t_vec (allows rotation)
        const bottomRightPos = [useNewPos[0], useNewPos[1]];
        const widthVec = [bottomRightPos[0] - bc[0], bottomRightPos[1] - bc[1]];
        const halfWidth = geometry.length(widthVec);
        const newWidth = halfWidth * 2;
        const newT = [widthVec[0] / halfWidth, widthVec[1] / halfWidth];
        
        rect.width = newWidth;
        rect.t_vec = newT;
        // Update n_vec to be perpendicular to t_vec (rotate 90° counter-clockwise: [-t[1], t[0]])
        rect.n_vec = geometry.normalFromTangent(newT);
        window.selectedSceneElement._handleStartPos = useNewPos;
        // Note: when resizing, don't shift anchors - they stay at bottomCenter
      }
    }
    
    // Save and sync after any scene element change
    saveTask();
    if(window.fm){
      window.fm.syncInputs(document.getElementById('force-inputs'));
    }
  }

  canvas.addEventListener('mousemove', (e)=>{
    const pos = getMousePos(e);
    
    // Player mode: no scene element dragging
    
    const active = window.fm.forces[window.fm.activeIndex];

    // Only update hover when not interacting (no drawing/dragging)
    const isInteracting = active && (active.drawing || !!active.dragging);
    canvas.dataset.draggable = String(!!active?.dragging);
    if(!isInteracting){
      const hit = window.fm.updateHover(pos);
      canvas.dataset.draggable = String(!!hit);
      // Clear anchor candidates (editor mode only)
      window.anchorCandidates = null;
      window.anchorHoverIndex = -1;
    }

    // If active force is drawing/dragging, forward motion
    if(active){
      let usePos = pos;
      // snapping for arrowTip while drawing or dragging arrowTip
      if(window.enableSnap && (active.drawing || active.dragging==='arrowTip')){
        const plane = window.currentTask && window.currentTask.scene && window.currentTask.scene.plane;
        // Use arrowBase as snap origin for tip (fallback to anchor -> plane.through -> DRAW_CENTER)
        const baseOrigin =
          (active.arrowBase && [active.arrowBase[0], active.arrowBase[1]]) ||
          (active.anchor && [active.anchor[0], active.anchor[1]]) ||
          (plane && plane.through) || window.DRAW_CENTER;

        const res = snapping.snapForce(pos, {
          force:active,task:window.currentTask,forces:window.fm.forces,
          gridStep:GRID_STEP,
          origin:baseOrigin,
          tip:true
        });
        usePos = res.pos;
        if(geometry.length([usePos[0]-pos[0], usePos[1]-pos[1]]) > 1){
          window.snapIndicator = {pos:usePos};
        } else {
          window.snapIndicator = null;
        }
      } else {
        window.snapIndicator = null;
      }
      // Anchor drag: snap to both scene points and grid (composite)
      if(active.dragging==='anchor'){
        const plane = window.currentTask && window.currentTask.scene && window.currentTask.scene.plane;
        // Anchor origin: DRAW_CENTER
        const res = snapping.snap(usePos, {points:window.snapPoints, forces:window.fm.forces, excludeForce:active, gridStep:GRID_STEP, origin:window.DRAW_CENTER, axesDir:plane});
        usePos = res.pos;
        window.snapIndicator = res.source ? {pos:res.pos} : null;
      }
      active.handleMouseMove(usePos, [e.movementX, e.movementY]);
      // After body drag, snap arrowBase to grid and shift arrowTip accordingly
      if(active.dragging==='body' && active.arrowBase){
        const plane = window.currentTask && window.currentTask.scene && window.currentTask.scene.plane;
        const anchorOrigin = active.anchor ? active.anchor : (plane && plane.through ? plane.through : window.DRAW_CENTER);
        const base = active.arrowBase;
        const resBase = snapping.snapForce(base, {force:active,task:window.currentTask,forces:window.fm.forces,gridStep:GRID_STEP,origin:anchorOrigin});
        const snappedBase = resBase.pos;
        const dx = snappedBase[0]-base[0];
        const dy = snappedBase[1]-base[1];
        if(Math.abs(dx)>0.01 || Math.abs(dy)>0.01){
          active.arrowBase = snappedBase;
          if(active.arrowTip){ active.arrowTip = [active.arrowTip[0]+dx, active.arrowTip[1]+dy]; }
          // Anchor remains fixed during body drag
          active.updateDirectionAndLength();
          window.snapIndicator = {pos:snappedBase};
        }
      }
      // build guidelines: follow mousepos; origin = arrowBase if present, else fallback DRAW_CENTER
      if(window.enableGuidelines){
        const originForGuidelines = active.dragging==='body' && active.anchor
          ? active.anchor : (active.arrowBase || window.DRAW_CENTER);
        window.currentGuidelines = snapping.buildForceGuidelines(originForGuidelines, usePos, window.currentTask, active.anchor);
        if(active.drawing || active.dragging==='arrowTip'){
          window.currentGuidelines.push(...snapping.buildMatchedComponentGuidelines(active,window.fm.forces,GRID_STEP,window.currentTask));
        }
      } else {
        window.currentGuidelines = null;
      }
      window.fm.syncInputs(inputsContainer);
      ensureInputMeta();
    }
  });

  canvas.addEventListener('mousedown', (e)=>{
    // Any interaction on canvas clears feedback panel
    clearFeedback();
    const pos = getMousePos(e);
    
    // Player mode: no scene element handle detection
    
    // NEW: ensure hover state reflects this exact click position (user may click without prior mousemove)
    if(window.fm){ window.fm.updateHover(pos); }
    
    // Determine if there's a hovered force
    let hoveredForceIndex = -1;
    if(window.fm && window.fm.forces){
      for(let i=0;i<window.fm.forces.length;i++){
        if(window.fm.forces[i].hovering){ hoveredForceIndex = i; break; }
      }
    }
    
    // A hit on an initial force body in player mode must beat starting a new force.
    const hoveredForce = window.fm && window.fm.forces[hoveredForceIndex];
    const hoveredForceIsInitial = hoveredForce &&
      (hoveredForce.isExpected !== undefined
        ? !hoveredForce.isExpected
        : hoveredForce.moveable === false);
    const clickedForceAnchor = window.editorMode === false && hoveredForce &&
      hoveredForce.hovering === 'anchor' &&
      (hoveredForceIsInitial || hoveredForceIndex !== window.fm.activeIndex);
    const draggingInitialForceBody = window.editorMode === false &&
      hoveredForceIsInitial && hoveredForce.hovering === 'body';

    // Valgt tom krafttekstboks: klikk starter alltid ny tegning, selv over en eksisterende kraft
    const activeF = window.fm && window.fm.forces[window.fm.activeIndex];
    if(clickedForceAnchor ||
       (activeF && !activeF.anchor && !activeF.arrowBase && !activeF.arrowTip && !draggingInitialForceBody)){
      hoveredForceIndex = -1;
    }
    
    // Player mode: no scene element interaction
    
    // If click is outside draw area, ignore force creation logic
    const inArea = withinForceArea(pos[0], pos[1]);
    if(clickedForceAnchor && !inArea) return;
    // Determine hovered force (if any) - already computed above
    if(inArea && hoveredForceIndex === -1){
      // Prefer the active force if it has no points; otherwise use the last blank force
      let targetIndex = window.fm.activeIndex;
      const activeForce = window.fm.forces[targetIndex];
      const activeHasPoints = !!(activeForce && (activeForce.anchor || activeForce.arrowBase || activeForce.arrowTip));
      
      // If active force has points, find a blank force instead
      if(activeHasPoints){
        targetIndex = -1;
        function isBlank(f){ return f && !f.anchor && !f.arrowBase && !f.arrowTip; }
        for(let i=window.fm.forces.length-1;i>=0;i--){ if(isBlank(window.fm.forces[i])) { targetIndex=i; break; } }
        if(targetIndex === -1){
          window.fm.addEmptyForceIfNeeded();
          for(let i=window.fm.forces.length-1;i>=0;i--){ if(isBlank(window.fm.forces[i])) { targetIndex=i; break; } }
        }
      }
      
      // Safety check: ensure targetIndex is valid
      if(targetIndex < 0 || targetIndex >= window.fm.forces.length){
        console.error('Invalid targetIndex:', targetIndex, 'forces.length:', window.fm.forces.length);
        return;
      }
      
      // Force dropdown rebuild when clicking on force arrow (canvas)
      window.fm.setActive(targetIndex, true);
      // Make sure the force name is synced from the textbox before drawing
      const rows = Array.from(inputsContainer.querySelectorAll('.force-row'));
      if(rows[targetIndex]){
        const inputEl = rows[targetIndex].querySelector('input');
        // Do not copy the textbox value into the force name before drawing
        // Keep focus in the textbox while drawing so user can type name after
        if(inputEl) { inputEl.focus(); }
      }
      let snapPos = pos;
      const plane = window.currentTask && window.currentTask.scene && window.currentTask.scene.plane;
      // Use DRAW_CENTER as origin for grid snapping (not plane.through which can be at arbitrary positions)
      snapPos = snapping.snap(pos, {points:window.snapPoints, forces:window.fm.forces, gridStep:GRID_STEP, origin:window.DRAW_CENTER}).pos;
      window.fm.forces[targetIndex].handleMouseDown(snapPos);
      if(window.enableGuidelines){ window.currentGuidelines = snapping.buildGuidelines(snapPos, snapPos, window.currentTask.scene.plane); }
      // CHANGED: sync first, then focus/select the freshly rendered input
      window.fm.syncInputs(inputsContainer);
      ensureInputMeta();
      requestAnimationFrame(()=>{
        const rows = Array.from(inputsContainer.querySelectorAll('.force-row'));
        const inputEl = rows[targetIndex] && rows[targetIndex].querySelector('input');
        if(inputEl) { inputEl.focus(); inputEl.select(); }
      });
      return;
    }
    // Otherwise interact with hovered or active force as before
    const picked = (hoveredForceIndex !== -1) ? hoveredForceIndex : window.fm.activeIndex;
    window.fm.setActive(picked);
    const f = window.fm.forces[window.fm.activeIndex];
    if(!f){
      console.error('No force at activeIndex:', window.fm.activeIndex);
      return;
    }
    let clickPos = pos;
    const plane = window.currentTask && window.currentTask.scene && window.currentTask.scene.plane;
    // Use DRAW_CENTER as origin for grid snapping (not plane.through which can be at arbitrary positions)
    clickPos = snapping.snap(pos, {points:window.snapPoints, forces:window.fm.forces, gridStep:GRID_STEP, origin:window.DRAW_CENTER}).pos;
    const consumed = f.handleMouseDown(clickPos);
    // CHANGED: focus/select after syncInputs to avoid losing focus due to re-render
    window.fm.syncInputs(inputsContainer);
    ensureInputMeta();
    requestAnimationFrame(()=>{
      const rows = Array.from(inputsContainer.querySelectorAll('.force-row'));
      const inputEl = rows[window.fm.activeIndex] && rows[window.fm.activeIndex].querySelector('input');
      if(inputEl) { inputEl.focus(); inputEl.select(); }
    });
    if(!consumed && inArea){
      // fallback: if last used, create new empty
      const last = window.fm.forces[window.fm.forces.length-1];
      const hasGeom = !!(last.anchor||last.arrowBase||last.arrowTip);
      if(hasGeom){
        window.fm.addEmptyForceIfNeeded();
        window.fm.setActive(window.fm.forces.length-1);
        let np = pos;
        const plane = window.currentTask && window.currentTask.scene && window.currentTask.scene.plane;
        // Use DRAW_CENTER as origin for grid snapping (not plane.through which can be at arbitrary positions)
        np = snapping.snap(pos, {points:window.snapPoints, forces:window.fm.forces, gridStep:GRID_STEP, origin:window.DRAW_CENTER}).pos;
        window.fm.forces[window.fm.activeIndex].handleMouseDown(np);
        // CHANGED: sync then focus new blank's input
        window.fm.syncInputs(inputsContainer);
        ensureInputMeta();
        requestAnimationFrame(()=>{
          const rows2 = Array.from(inputsContainer.querySelectorAll('.force-row'));
          const inputEl2 = rows2[window.fm.activeIndex] && rows2[window.fm.activeIndex].querySelector('input');
          if(inputEl2) { inputEl2.focus(); inputEl2.select(); }
        });
      } else {
        // Already synced above
      }
    }
    window.fm.syncInputs(inputsContainer);
    ensureInputMeta();
  });

  canvas.addEventListener('mouseup', (e)=>{
    // Stop dragging scene element handle
    if(window.draggingHandle){
      // Clean up the stored snap origin before clearing the handle
      if(window.draggingHandle._snapOriginAtDragStart){
        delete window.draggingHandle._snapOriginAtDragStart;
      }
      window.draggingHandle = null;
      if(window.selectedSceneElement){
        delete window.selectedSceneElement._handleStartPos;
      }
      // Clear snap indicator and guidelines
      window.snapIndicator = null;
      window.currentGuidelines = null;
      // Update snap points and guidelines after scene element change
      if(window.updateAppState && typeof window.updateAppState === 'function'){
        window.updateAppState();
      }
      return;
    }
    
    const pos = getMousePos(e);
    const f = window.fm.forces[window.fm.activeIndex];
    if(f){
      const wasDrawing = f.drawing;
      f.handleMouseUp(pos);
      if(wasDrawing && !f.drawing){
        // Add a new blank force after finishing a draw
        window.fm.ensureTrailingBlank();
        // Keep focus on the just-drawn force's textbox for naming
        const rows = Array.from(inputsContainer.querySelectorAll('.force-row'));
        if(rows[window.fm.activeIndex]){
          // FIX: use array indexing instead of rows.window.fm.activeIndex
          const inputEl = rows[window.fm.activeIndex].querySelector('input');
          if(inputEl){ inputEl.focus(); inputEl.select(); }
        }
      }
      // If a force was edited to be too short, delete it (and its textbox)
      const TOO_SHORT = 15; // MIN_LEN from forces.js
      if(!f.drawing && f.arrowBase && f.arrowTip && f.force_len < TOO_SHORT){
        const delIndex = window.fm.activeIndex;
        window.fm.deleteAt(delIndex);
        window.fm.syncInputs(inputsContainer);
        // Focus the new active input
        const rows2 = Array.from(inputsContainer.querySelectorAll('.force-row'));
        if(rows2[window.fm.activeIndex]){
          const inputEl2 = rows2[window.fm.activeIndex].querySelector('input');
          if(inputEl2){ inputEl2.focus(); inputEl2.select(); }
        }
      }
      window.currentGuidelines = null; // stop guidelines after mouseup
      window.snapIndicator = null;
    }
    window.fm.syncInputs(inputsContainer);
    ensureInputMeta();
    // Save forces on mouseup (always, not just editor mode)
    saveTaskForces();
    // Update derived state after force interaction
    window.updateAppState();
  });

  // Update panel heights when window resizes
  window.addEventListener('resize', () => {
    updatePanelHeights();
  });

  // ===== Knappe-klikk =====
  const buttons = document.querySelectorAll('#panel button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      console.log('Klikk:', action);
      if (action === 'grid') {
        gridOn = !gridOn;
        updateGridIcon();
        return; // ingen highlight for grid
      }
      if(action === 'snap'){
        window.enableSnap = !window.enableSnap;
        btn.classList.toggle('btn-active', window.enableSnap);
        return;
      }
      if(action === 'guidelines'){
        window.enableGuidelines = !window.enableGuidelines;
        btn.classList.toggle('btn-active', window.enableGuidelines);
        if(!window.enableGuidelines) window.currentGuidelines = null;
        return;
      }
      if(action === 'next'){
        // Player mode: no help_lines save needed
        loadTask(window.currentTaskIndex+1);
        // Update settings window if it's open
        const settingsPanel = document.getElementById('settings-panel');
        if(settingsPanel && !settingsPanel.classList.contains('hidden')){
          const taskComment = document.getElementById('settings-task-comment');
          const commentLabel = document.getElementById('settings-comment-label');
          if(window.currentTask && taskComment){
            const taskId = window.currentTask.id;
            const commentText = window.currentTask.comment || (window.taskComments[taskId] && window.taskComments[taskId].comment) || '';
            taskComment.value = commentText;
            if(commentLabel) commentLabel.textContent = `Kommentar til ${window.currentTask.title || taskId} (${taskId})`;
          }
        }
        // Update help panel if it's open
        const helpPanel = document.getElementById('help-panel');
        if(helpPanel && !helpPanel.classList.contains('hidden')){
          const helpContent = document.getElementById('help-content');
          const helpCanvas = document.getElementById('help-canvas');
          const helpTitle = document.getElementById('help-title');
          if(helpTitle) helpTitle.textContent = `${window.getTaskPositionLabel(window.currentTask)}: ${window.currentTask.title || ''}`;
          if(helpContent && helpCanvas){
            // Player mode: always show canvas rendering
            helpContent.style.display = 'none';
            helpCanvas.style.display = 'block';
            window.updateHelpPanelLayout();
            drawHelpLinesCanvas();
          }
        }
        return;
      }
      if(action === 'prev'){
        // Player mode: no help_lines save needed
        loadTask(window.currentTaskIndex-1);
        // Update settings window if it's open
        const settingsPanel = document.getElementById('settings-panel');
        if(settingsPanel && !settingsPanel.classList.contains('hidden')){
          const taskComment = document.getElementById('settings-task-comment');
          const commentLabel = document.getElementById('settings-comment-label');
          if(window.currentTask && taskComment){
            const taskId = window.currentTask.id;
            const commentText = window.currentTask.comment || (window.taskComments[taskId] && window.taskComments[taskId].comment) || '';
            taskComment.value = commentText;
            if(commentLabel) commentLabel.textContent = `Kommentar til ${window.currentTask.title || taskId} (${taskId})`;
          }
        }
        // Update help panel if it's open
        const helpPanel = document.getElementById('help-panel');
        if(helpPanel && !helpPanel.classList.contains('hidden')){
          const helpContent = document.getElementById('help-content');
          const helpCanvas = document.getElementById('help-canvas');
          const helpTitle = document.getElementById('help-title');
          if(helpTitle) helpTitle.textContent = `${window.getTaskPositionLabel(window.currentTask)}: ${window.currentTask.title || ''}`;
          if(helpContent && helpCanvas){
            // Player mode: always show canvas rendering
            helpContent.style.display = 'none';
            helpCanvas.style.display = 'block';
            window.updateHelpPanelLayout();
            drawHelpLinesCanvas();
          }
        }
        return;
      }
      if(action === 'check'){
        window.reportApi.checkCurrent();
        return;
      }
      // Clear feedback for any other toolbar action
      if(action !== 'check'){
        clearFeedback();
      }
      if(action === 'reset'){
        // Reload current task to restore initial state (keep initial forces, clear expected forces)
        window.snapIndicator = null;
        window.currentGuidelines = null;
        clearFeedback();
        if(window.currentTask){
          try{ localStorage.removeItem(snapChecklistOverrideKey(window.currentTask.id)); }
          catch(error){ console.warn(`Could not reset snap checklist override for task ${window.currentTask.id}:`,error); }
        }
        // Delete saved forces for this task (initialForces are restored from task definition)
        const taskKey = `tk_forces_${window.currentTask.id}`;
        try{
          localStorage.removeItem(taskKey);
        } catch {}
        // Clear score for this task
        if(window.currentTask && window.taskScores){
          delete window.taskScores[window.currentTask.id];
          try{ localStorage.setItem('tk_taskScores', JSON.stringify(window.taskScores)); } catch {}
        }
        // Now reload, which will use defaults for expected forces and keep initial forces
        loadTask(window.currentTaskIndex || 0);
        return;
      }
      if(action === 'help'){
        const helpPanel = document.getElementById('help-panel');
        if(!helpPanel) return;
        if(!window.currentTask) return;
        if(!helpPanel.classList.contains('hidden')){
          helpPanel.classList.add('hidden');
          return;
        }
        // Show help lines
        const helpCanvas = document.getElementById('help-canvas');
        const helpTitle = document.getElementById('help-title');
        if(helpTitle) helpTitle.textContent = `${window.getTaskPositionLabel(window.currentTask)}: ${window.currentTask.title || ''}`;
        if(helpCanvas) helpCanvas.style.display = 'block';
        helpPanel.classList.remove('hidden');
        window.updateHelpPanelLayout();
        requestAnimationFrame(()=>{
          drawHelpLinesCanvas();
          window.updateHelpPanelLayout();
        });
        return;
      }
      if(action === 'settings'){
        const pnl = document.getElementById('settings-panel');
        if(!pnl) return;
        // Settings button toggles the panel
        if(!pnl.classList.contains('hidden')){
          pnl.classList.add('hidden');
          return;
        }
        const dbg = document.getElementById('settings-debug');
        const usr = document.getElementById('settings-username');
        const sSnap = document.getElementById('settings-snap');
        const sGuides = document.getElementById('settings-guidelines');
        const sShowForceCoords = document.getElementById('settings-show-force-coordinates');
        const sShowSceneCoords = document.getElementById('settings-show-scene-coordinates');
        const taskComment = document.getElementById('settings-task-comment');
        const commentLabel = document.getElementById('settings-comment-label');
        if(dbg) dbg.checked = !!window.settings.debug;
        if(usr) usr.value = window.settings.username || '';
        if(sSnap) sSnap.checked = !!window.enableSnap;
        if(sGuides) sGuides.checked = !!window.enableGuidelines;
        if(sShowForceCoords) sShowForceCoords.checked = !!window.settings.show_force_coordinates;
        // Load current task comment
        if(window.currentTask && taskComment){
          const taskId = window.currentTask.id;
          const commentText = window.currentTask.comment || (window.taskComments[taskId] && window.taskComments[taskId].comment) || '';
          taskComment.value = commentText;
          if(commentLabel) commentLabel.textContent = `Kommentar til ${window.currentTask.title || taskId} (${taskId})`;
        }
        // Inject Full reset button if not present
        let resetAllBtn = document.getElementById('settings-reset-all');
        if(!resetAllBtn){
          resetAllBtn = document.createElement('button');
          resetAllBtn.id = 'settings-reset-all';
          resetAllBtn.type = 'button';
          resetAllBtn.textContent = 'Full reset';
          resetAllBtn.style.marginTop = '8px';
          pnl.appendChild(resetAllBtn);
        }
        pnl.classList.remove('hidden');
        return;
      }
      // midlertidig highlight for andre
      if (action !== 'grid') {
        buttons.forEach(b=>{ if(b.id !== 'btn-grid') b.classList.remove('btn-active'); });
        btn.classList.add('btn-active');
      }
    });
  });

  // Settings interactions
  const pnl = document.getElementById('settings-panel');
  const closeBtn = document.getElementById('settings-close');
  if(closeBtn){ closeBtn.addEventListener('click', ()=>{ pnl && pnl.classList.add('hidden'); }); }
  
  // Help panel interactions
  const helpPanel = document.getElementById('help-panel');
  const helpCloseBtn = document.getElementById('help-close');
  if(helpCloseBtn){ helpCloseBtn.addEventListener('click', ()=>{ helpPanel && helpPanel.classList.add('hidden'); }); }
  
  // Save help lines from textarea to task object
  // Help lines functions have been moved to ui.js
  // They are now defined there: saveHelpLines(), setupHelpLinesEditor(), drawHelpLinesCanvas()
  // Do not redefine them here
  
  const dbg = document.getElementById('settings-debug');
  const usr = document.getElementById('settings-username');
  const sSnap = document.getElementById('settings-snap');
  const sGuides = document.getElementById('settings-guidelines');
  const sShowForceCoords = document.getElementById('settings-show-force-coordinates');
  function persist(){
    const {show_force_coordinates,...globalSettings}=window.settings;
    try{ localStorage.setItem('tk_settings', JSON.stringify(globalSettings)); }
    catch(error){ console.warn('Could not save settings:',error); }
  }
  
  if(dbg){ dbg.addEventListener('change', ()=>{ window.settings.debug = !!dbg.checked; persist(); }); }
  if(usr){ usr.addEventListener('input', ()=>{ window.settings.username = usr.value; persist(); updateUserDisplay(); }); }
  if(sSnap){ sSnap.addEventListener('change', ()=>saveSnapChecklistOverride({...window.currentSnapChecklist,snapEnabled:!!sSnap.checked})); }
  if(sGuides){ sGuides.addEventListener('change', ()=>saveSnapChecklistOverride({...window.currentSnapChecklist,guidelinesEnabled:!!sGuides.checked})); }
  if(sShowForceCoords){ sShowForceCoords.addEventListener('change', ()=>saveSnapChecklistOverride({...window.currentSnapChecklist,showForceCoordinates:!!sShowForceCoords.checked})); }

  const snapChecklistModal=document.getElementById('snap-checklist-modal');
  const snapChecklistButton=document.getElementById('settings-snap-checklist');
  const snapChecklistSave=document.getElementById('snap-checklist-save');
  const snapChecklistCancel=document.getElementById('snap-checklist-cancel');
  if(snapChecklistButton&&snapChecklistModal){
    snapChecklistButton.addEventListener('click',()=>{
      window.populateSnapMatchOptions(snapChecklistModal);
      const checklist=window.currentSnapChecklist||window.getTaskSnapChecklist(window.currentTask);
      snapChecklistModal.querySelectorAll('[data-snap-checklist]').forEach(input=>{
        input.checked=checklist[input.dataset.snapChecklist]===true;
      });
      snapChecklistModal.classList.remove('hidden');
    });
  }
  if(snapChecklistSave&&snapChecklistModal){
    snapChecklistSave.addEventListener('click',()=>{
      const checklist={};
      snapChecklistModal.querySelectorAll('[data-snap-checklist]').forEach(input=>{
        checklist[input.dataset.snapChecklist]=!!input.checked;
      });
      saveSnapChecklistOverride(checklist);
      snapChecklistModal.classList.add('hidden');
    });
  }
  if(snapChecklistCancel&&snapChecklistModal){
    snapChecklistCancel.addEventListener('click',()=>snapChecklistModal.classList.add('hidden'));
  }
  
  // Task comment handler - save only in task.comment
  const taskCommentInput = document.getElementById('settings-task-comment');
  if(taskCommentInput){
    taskCommentInput.addEventListener('input', ()=>{
      if(!window.currentTask) return;
      const commentText = taskCommentInput.value;
      
      // Save to task object only (no separate taskComments storage)
      window.currentTask.comment = commentText;
      
      // Persist task to localStorage
      try{
        localStorage.setItem(`tk_task_${window.currentTask.id}`, JSON.stringify(window.currentTask));
      } catch(err){
        console.warn('Could not save comment:', err);
      }
    });
  }
  
  const btnSaveTask = document.getElementById('btn-save-task');
  const btnNewTask = document.getElementById('btn-new-task');
  const btnDeleteForce = document.getElementById('btn-delete-force');
  const btnExportTask = document.getElementById('btn-export-task');
  const btnEditRelations = document.getElementById('btn-edit-relations');
  const relationsModal = document.getElementById('relations-modal');
  const relationsList = document.getElementById('relations-list');
  const relationsSave = document.getElementById('relations-save');
  const relationsCancel = document.getElementById('relations-cancel');
  
  if(btnSaveTask){
    btnSaveTask.addEventListener('click', ()=>{
      if(!window.currentTask) return;
      
      // Create a copy of current task with modified ID
      const newTask = JSON.parse(JSON.stringify(window.currentTask));
      newTask.id = window.currentTask.id + '.';
      newTask.title = (window.currentTask.title || '') + ' (kopi)';
      
      // Insert the new task right after current task
      const currentIdx = window.currentTaskIndex !== undefined ? window.currentTaskIndex : 0;
      window.TASKS.splice(currentIdx + 1, 0, newTask);
      
      // Save the new task to localStorage
      const taskKey = `tk_task_${newTask.id}`;
      try{
        localStorage.setItem(taskKey, JSON.stringify(newTask));
      } catch {}
      
      // Update savedTasks list in localStorage
      const savedTasksKey = 'tk_savedTasks';
      let savedTasks = [];
      try{
        const stored = localStorage.getItem(savedTasksKey);
        if(stored) savedTasks = JSON.parse(stored);
      } catch {}
      if(!savedTasks.includes(newTask.id)){
        savedTasks.push(newTask.id);
        try{ localStorage.setItem(savedTasksKey, JSON.stringify(savedTasks)); } catch {}
      }
      
      // Update task order
      saveTaskOrder();
      
      // Load the new task
      loadTask(currentIdx + 1);
      
      alert(`Oppgave duplikert: "${newTask.title}"`);
    });
  }
  
  if(btnNewTask){
    btnNewTask.addEventListener('click', ()=>{
      // Create a new task from scratch
      const taskId = prompt('Oppgave-ID (f.eks. "Custom 1"):');
      if(!taskId) return;
      
      const title = prompt('Oppgave-tittel:');
      if(!title) return;
      
      const newTask = {
        id: taskId,
        title: title,
        category: 'Egendefinert',
        help_lines: [],
        scene: {
          plane: { angleDeg: 0, through: DRAW_CENTER.slice(), draw: true, snapping: false },
          rects: [],
          ellipses: [],
          segments: [],
          arrows: [],
          texts: []
        },
        expectedForces: [],
        initialForces: [],
        sumF: {},
        relations: []
      };
      
      // Add to TASKS array
      if(!window.TASKS) window.TASKS = [];
      window.TASKS.push(newTask);
      
      // Load the new task
      const newIndex = window.TASKS.length - 1;
      loadTask(newIndex);
      
      // Save the new task to localStorage
      saveTask();
      
      alert(`Ny oppgave "${title}" opprettet. Du kan nå redigere scenen og definere krefter.`);
    });
  }
  
  const btnDeleteTask = document.getElementById('btn-delete-task');
  if(btnDeleteTask){
    btnDeleteTask.addEventListener('click', ()=>{
      if(!window.currentTask) return;
      
      const taskId = window.currentTask.id;
      const taskIndex = window.currentTaskIndex;
      
      if(!confirm(`Slett oppgave "${window.currentTask.title}"?`)) return;
      
      // Remove from TASKS array
      window.TASKS.splice(taskIndex, 1);
      
      // Remove from localStorage
      try {
        localStorage.removeItem(`tk_task_${taskId}`);
        localStorage.removeItem(`tk_forces_${taskId}`);
        localStorage.removeItem(`tk_sumF_${taskId}`);
        
        // Update task order - remove deleted task ID
        try {
          const taskOrderKey = 'tk_taskOrder';
          let taskOrder = [];
          const stored = localStorage.getItem(taskOrderKey);
          if(stored) taskOrder = JSON.parse(stored);
          taskOrder = taskOrder.filter(id => id !== taskId);
          localStorage.setItem(taskOrderKey, JSON.stringify(taskOrder));
        } catch {}
      } catch {}
      
      // Load next task or last task
      let nextIdx = taskIndex;
      if(nextIdx >= window.TASKS.length) nextIdx = window.TASKS.length - 1;
      
      if(nextIdx >= 0){
        loadTask(nextIdx);
      } else {
        // No tasks left
        window.currentTask = null;
        window.editorMode = false;
        document.getElementById('editor-buttons').classList.add('hidden');
      }
    });
  }
  
  
  if(btnExportTask){
    btnExportTask.addEventListener('click', ()=>{
      if(!window.currentTask) return;
      
      // Build export task with aliases and relations
      const task = JSON.parse(JSON.stringify(window.currentTask));
      
      // Sync both initialForces and expectedForces from window.fm based on isExpected flag
      if(window.fm && window.fm.forces){
        const initialForcesFromUI = [];
        const expectedForcesFromUI = [];
        
        window.fm.forces.forEach(f => {
          // Only include forces with actual geometry and a name (skip blank forces)
          if(f.anchor && (f.arrowBase || f.arrowTip) && f.name){
            const forceSpec = {
              role:f.role || 'force',
              ...(f.componentOf ? {componentOf:f.componentOf} : {}),
              anchor: [f.anchor[0], f.anchor[1]],
              arrowBase: f.arrowBase ? [f.arrowBase[0], f.arrowBase[1]] : null,
              arrowTip: f.arrowTip ? [f.arrowTip[0], f.arrowTip[1]] : null,
              name: f.name || '',
              moveable: f.moveable !== false
            };
            
            // Sort by isExpected flag
            if(f.isExpected){
              expectedForcesFromUI.push(forceSpec);
            } else {
              initialForcesFromUI.push(forceSpec);
            }
          }
        });
        
        // Replace both arrays with what was actually drawn/edited in UI
        task.initialForces = initialForcesFromUI;
        task.expectedForces = expectedForcesFromUI;
        
        // IMPORTANT: Ensure expectedForces do NOT contain any initialForces
        // This prevents the "1 kraft for mye" evaluation error
        const initialForceNames = new Set();
        task.initialForces.forEach(f => {
          if(f.name) initialForceNames.add(f.name.toLowerCase().trim());
        });
        task.expectedForces = task.expectedForces.filter(f => {
          const isInitial = f.name && initialForceNames.has(f.name.toLowerCase().trim());
          return !isInitial; // Exclude initialForces from expectedForces
        });
      }
      
      // Remove rendering artifacts and linked flags from texts
      if(task.scene && Array.isArray(task.scene.texts)){
        task.scene.texts = task.scene.texts.map(text => {
          const clean = {
            txt: text.txt,
            pos: text.pos,
            size: text.size || 14,
            align: text.align || 'center',
            color: text.color || '#222',
            snapping: text.snapping !== false
          };
          if(Number.isFinite(text.angle_deg)) clean.angle_deg=text.angle_deg;
          else if(Array.isArray(text.n_vec) && text.n_vec.length===2 &&
                  text.n_vec.every(Number.isFinite) && Math.hypot(...text.n_vec)>1e-8){
            clean.n_vec=text.n_vec.slice();
          }
          // Only include pos if text is not linked
          if(text.linked) delete clean.pos;
          return clean;
        });
      }
      
      // Add aliases for each expectedForce
      if(task.expectedForces){
        task.expectedForces.forEach(f => {
          if(!f.aliases && FORCE_ALIASES[f.name]) f.aliases = FORCE_ALIASES[f.name].slice();
        });
      }
      
      // Add sumF from localStorage if present
      const sumFKey = `tk_sumF_${task.id}`;
      const savedSumF = localStorage.getItem(sumFKey);
      if(savedSumF){
        try{ task.sumF = JSON.parse(savedSumF); }catch{}
      }
      
      // Generate JavaScript export code with custom formatting
      // Each scene element array item and force on its own line for readability
      const formatForExport = (obj, indent = 0) => {
        const spaces = ' '.repeat(indent);
        const nextSpaces = ' '.repeat(indent + 2);
        
        if (Array.isArray(obj)) {
          if (obj.length === 0) return '[]';
          // Check if array contains objects (scene elements, forces, relations)
          const isComplexArray = obj.some(item => typeof item === 'object' && item !== null);
          if (isComplexArray) {
            const items = obj.map(item => `${nextSpaces}${formatForExport(item, indent + 2)}`);
            return `[\n${items.join(',\n')}\n${spaces}]`;
          }
          return JSON.stringify(obj);
        }
        
        if (typeof obj === 'object' && obj !== null) {
          const keys = Object.keys(obj);
          if (keys.length === 0) return '{}';
          const items = keys.map(key => {
            const value = formatForExport(obj[key], indent + 2);
            return `${nextSpaces}"${key}": ${value}`;
          });
          return `{\n${items.join(',\n')}\n${spaces}}`;
        }
        
        return JSON.stringify(obj);
      };
      
      const code = `TASKS.push(${formatForExport(task)});\n`;
      const dataStr = code;
      const blob = new Blob([dataStr], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `task_${window.currentTask.id}_export.js`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Relations editor modal logic
  if(btnEditRelations && relationsModal && relationsList && relationsSave && relationsCancel){
    btnEditRelations.addEventListener('click', ()=>{
      relationsList._relations = undefined;
      showRelationsEditor();
    });
    relationsCancel.addEventListener('click', ()=>{
      relationsModal.classList.add('hidden');
      relationsList._relations = undefined;
    });
    relationsSave.addEventListener('click', ()=>{
      if(saveRelationsEditor()) relationsModal.classList.add('hidden');
    });
  }

  function showRelationsEditor(){
    if(!window.currentTask || !window.fm) return;
    relationsModal.classList.remove('hidden');
    // Load relations from task object
    let relations = relationsList._relations || [];
    if(relationsList._relations === undefined){
      if(window.currentTask.relations){
        relations = JSON.parse(JSON.stringify(window.currentTask.relations));
      }
    }
    // List all forces
    const forces = window.fm.forces.filter(f=>f.name);
    // Build UI
    let html = '';
    html += '<div style="margin-bottom:8px;">Legg til eller rediger relasjoner mellom krefter:</div>';
    html += '<div style="margin-bottom:8px;">Tomt forhold bruker den grå verdien beregnet fra fasitens komponenter. Skriv inn et tall for å overstyre.</div>';
    relations.forEach((rel, idx) => {
      html += `<div class="relation-row" data-idx="${idx}" style="margin-bottom:12px; padding:8px; border:1px solid #ddd; border-radius:4px;">`;
      
      // LHS forces with component selectors
      html += `<div style="margin-bottom:4px;"><label style="font-weight:bold;">LHS:</label>`;
      rel.lhs.forEach((term, termIdx) => {
        const comp = term.component || 'magnitude';
        html += `<div style="margin-left:16px; margin-bottom:4px;">`;
        html += `<select class="lhs-force" data-term-idx="${termIdx}" style="width:80px;">`;
        forces.forEach(f => {
          html += `<option value="${f.name}" ${term.name===f.name ? 'selected' : ''}>${f.name}</option>`;
        });
        html += `</select>`;
        html += ` <select class="lhs-component" data-term-idx="${termIdx}" style="width:100px;">`;
        html += `<option value="magnitude" ${comp==='magnitude'?'selected':''}>Lengde</option>`;
        html += `<option value="normal" ${comp==='normal'?'selected':''}>Normal (n)</option>`;
        html += `<option value="tangent" ${comp==='tangent'?'selected':''}>Tangent (t)</option>`;
        html += `<option value="vertical" ${comp==='vertical'?'selected':''}>Vertikal</option>`;
        html += `<option value="horizontal" ${comp==='horizontal'?'selected':''}>Horisontal</option>`;
        html += `</select>`;
        html += ` <button class="remove-lhs-term" data-term-idx="${termIdx}" style="padding:2px 6px;">Fjern</button>`;
        html += `</div>`;
      });
      html += `<button class="add-lhs-term" style="margin-left:16px; padding:2px 6px;">+ Legg til kraft</button>`;
      html += `</div>`;
      
      // RHS forces with component selectors
      html += `<div style="margin-bottom:4px;"><label style="font-weight:bold;">RHS:</label>`;
      rel.rhs.forEach((term, termIdx) => {
        const comp = term.component || 'magnitude';
        html += `<div style="margin-left:16px; margin-bottom:4px;">`;
        html += `<select class="rhs-force" data-term-idx="${termIdx}" style="width:80px;">`;
        forces.forEach(f => {
          html += `<option value="${f.name}" ${term.name===f.name ? 'selected' : ''}>${f.name}</option>`;
        });
        html += `</select>`;
        html += ` <select class="rhs-component" data-term-idx="${termIdx}" style="width:100px;">`;
        html += `<option value="magnitude" ${comp==='magnitude'?'selected':''}>Lengde</option>`;
        html += `<option value="normal" ${comp==='normal'?'selected':''}>Normal (n)</option>`;
        html += `<option value="tangent" ${comp==='tangent'?'selected':''}>Tangent (t)</option>`;
        html += `<option value="vertical" ${comp==='vertical'?'selected':''}>Vertikal</option>`;
        html += `<option value="horizontal" ${comp==='horizontal'?'selected':''}>Horisontal</option>`;
        html += `</select>`;
        html += ` <button class="remove-rhs-term" data-term-idx="${termIdx}" style="padding:2px 6px;">Fjern</button>`;
        html += `</div>`;
      });
      html += `<button class="add-rhs-term" style="margin-left:16px; padding:2px 6px;">+ Legg til kraft</button>`;
      html += `</div>`;
      
      html += ` Forhold: <input type="number" step="any" class="ratio-input" value="${rel.ratio ?? ''}" style="width:90px;" />`;
      html += ` Toleranse: <input type="number" step="any" class="tolerance-input" value="${rel.tol_rel||0.15}" style="width:50px;" />`;
      html += ` <button class="remove-relation" data-idx="${idx}">Fjern relasjon</button>`;
      html += '</div>';
    });
    html += '<button id="add-relation" style="margin-top:8px;">+ Ny relasjon</button>';
    relationsList.innerHTML = html;
    
    // Wire up remove/add buttons for relations
    relationsList.querySelectorAll('.remove-relation').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const idx = parseInt(btn.dataset.idx);
        relations.splice(idx,1);
        showRelationsEditor();
      });
    });
    
    // Wire up add/remove for LHS/RHS terms
    relationsList.querySelectorAll('.add-lhs-term').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.relation-row');
        const idx = parseInt(row.dataset.idx);
        if(!relations[idx].lhs) relations[idx].lhs = [];
        relations[idx].lhs.push({name: forces[0]?.name || '', component: 'magnitude'});
        showRelationsEditor();
      });
    });
    relationsList.querySelectorAll('.add-rhs-term').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.relation-row');
        const idx = parseInt(row.dataset.idx);
        if(!relations[idx].rhs) relations[idx].rhs = [];
        relations[idx].rhs.push({name: forces[0]?.name || '', component: 'magnitude'});
        showRelationsEditor();
      });
    });
    relationsList.querySelectorAll('.remove-lhs-term').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.relation-row');
        const idx = parseInt(row.dataset.idx);
        const termIdx = parseInt(btn.dataset.termIdx);
        relations[idx].lhs.splice(termIdx, 1);
        showRelationsEditor();
      });
    });
    relationsList.querySelectorAll('.remove-rhs-term').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.relation-row');
        const idx = parseInt(row.dataset.idx);
        const termIdx = parseInt(btn.dataset.termIdx);
        relations[idx].rhs.splice(termIdx, 1);
        showRelationsEditor();
      });
    });
    
    // Wire up force/component change listeners
    relationsList.querySelectorAll('.lhs-force, .lhs-component').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = sel.closest('.relation-row');
        const relIdx = parseInt(row.dataset.idx);
        const termIdx = parseInt(sel.dataset.termIdx);
        const forceVal = row.querySelector(`.lhs-force[data-term-idx="${termIdx}"]`).value;
        const compVal = row.querySelector(`.lhs-component[data-term-idx="${termIdx}"]`).value;
        relations[relIdx].lhs[termIdx].name = forceVal;
        relations[relIdx].lhs[termIdx].component = compVal;
        refreshRelationsRatioInputs();
      });
    });
    relationsList.querySelectorAll('.rhs-force, .rhs-component').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = sel.closest('.relation-row');
        const relIdx = parseInt(row.dataset.idx);
        const termIdx = parseInt(sel.dataset.termIdx);
        const forceVal = row.querySelector(`.rhs-force[data-term-idx="${termIdx}"]`).value;
        const compVal = row.querySelector(`.rhs-component[data-term-idx="${termIdx}"]`).value;
        relations[relIdx].rhs[termIdx].name = forceVal;
        relations[relIdx].rhs[termIdx].component = compVal;
        refreshRelationsRatioInputs();
      });
    });
    
    // Wire up ratio and tolerance inputs
    relationsList.querySelectorAll('.ratio-input, .tolerance-input').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('.relation-row');
        const idx = parseInt(row.dataset.idx);
        const ratioInput = row.querySelector('.ratio-input');
        const tolInput = row.querySelector('.tolerance-input');
        window.readRelationRatioInput(ratioInput,window.currentTask,relations[idx],undefined,false);
        relations[idx].tol_rel = parseFloat(tolInput.value) || 0.15;
      });
    });
    
    const addBtn = relationsList.querySelector('#add-relation');
    if(addBtn){
      addBtn.addEventListener('click', ()=>{
        relations.push({lhs:[],rhs:[],tol_rel:0.15});
        showRelationsEditor();
      });
    }
    // Save current relations to modal for later
    relationsList._relations = relations;
    refreshRelationsRatioInputs();
  }

  function refreshRelationsRatioInputs(){
    relationsList.querySelectorAll('.ratio-input').forEach(input=>{
      const relation=relationsList._relations[parseInt(input.closest('.relation-row').dataset.idx)];
      window.refreshRelationRatioInput(input,window.currentTask,relation);
    });
  }

  function saveRelationsEditor(){
    if(!window.currentTask || !relationsList._relations) return false;
    for(const input of relationsList.querySelectorAll('.ratio-input')){
      const relation=relationsList._relations[parseInt(input.closest('.relation-row').dataset.idx)];
      if(!window.readRelationRatioInput(input,window.currentTask,relation)) return false;
    }
    // Use the cached relations array that's been updated by event listeners
    const relations = relationsList._relations;
    // Save to task object
    window.currentTask.relations = relations;
    return true;
  }

  // Conflict modal handlers
  const conflictModal = document.getElementById('conflict-modal');
  const conflictReload = document.getElementById('conflict-reload');
  const conflictClose = document.getElementById('conflict-close');
  
  if(conflictReload){
    conflictReload.addEventListener('click', ()=>{
      if(conflictModal) conflictModal.classList.add('hidden');
      // Clear lock and reload task
      const taskId = window.currentTask && window.currentTask.id;
      if(taskId){
        try{ localStorage.removeItem(`tk_task_lock_${taskId}`); } catch {}
      }
      loadTask(window.currentTaskIndex);
    });
  }
  
  if(conflictClose){
    conflictClose.addEventListener('click', ()=>{
      if(conflictModal) conflictModal.classList.add('hidden');
    });
  }

  // Settings backup/restore
  const downloadBtn = document.getElementById('settings-download');
  const restoreBtn = document.getElementById('settings-restore');
  const fileInput = document.getElementById('settings-file-input');
  if(downloadBtn){
    downloadBtn.addEventListener('click', ()=>{
      const backup = {
        settings: window.settings,
        taskScores: window.taskScores,
        taskComments: window.taskComments,
        timestamp: new Date().toISOString(),
        appVersion:window.AppVersioning.time('player'),
        currentTaskIndex: (typeof window.currentTaskIndex === 'number') ? window.currentTaskIndex : 0,
        localStorage: {}
      };
      
      // Save ALL localStorage keys with tk_ prefix
      for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        if(key && key.startsWith('tk_')){
          try{
            const value = localStorage.getItem(key);
            if(value){
              backup.localStorage[key] = value;
            }
          } catch(e){
            console.warn(`Could not save localStorage key: ${key}`, e);
          }
        }
      }
      
      const dataStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tk_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  if(restoreBtn){
    restoreBtn.addEventListener('click', ()=>{
      if(fileInput) fileInput.click();
    });
  }
  if(fileInput){
    fileInput.addEventListener('change', (e)=>{
      const file = e.target.files?.[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = async (evt)=>{
        try{
          let backup = JSON.parse(evt.target?.result || '{}');
          const reviewed = await window.AppVersioning.checkImport(
            backup,
            'player',
            file.name,
            [...(window.currentTaskSchema || []), ...(window.tasks || [])]
          );
          backup = reviewed.data;
          if(backup.settings){ window.settings = { ...window.settings, ...backup.settings }; }
          if(backup.taskScores){ window.taskScores = backup.taskScores; }
          if(backup.taskComments){ window.taskComments = backup.taskComments; }
          
          // Restore all localStorage keys
          const restored = backup.localStorage || {};
          const editorTaskKeys = Object.keys(restored).filter(k => k.startsWith('editor_task_'));
          const isEditorBackup = editorTaskKeys.length > 0;

          if(isEditorBackup){
            // Backup from the editor: convert editor_task_* into the player's tk_task_* format
            const tasksById = new Map();
            editorTaskKeys.forEach(k => {
              try{
                const task = JSON.parse(restored[k]);
                if(!task || !task.id) return;
                if(!Array.isArray(task.help_lines)) task.help_lines = [];
                delete task.comment;
                tasksById.set(task.id, task);
              } catch(e){
                console.warn(`Could not parse ${k}`, e);
              }
            });

            const parseList = (key) => {
              try{
                const list = JSON.parse(restored[key] || '[]');
                return Array.isArray(list) ? list : [];
              } catch { return []; }
            };
            const orderedIds = Array.from(new Set([
              ...parseList('editor_taskOrder'),
              ...parseList('editor_savedTasks'),
              ...tasksById.keys()
            ])).filter(id => tasksById.has(id));

            // Replace existing player tasks and forces (as taskset upload does)
            const oldKeys = [];
            for(let i = 0; i < localStorage.length; i++){
              const key = localStorage.key(i);
              if(key && (key.startsWith('tk_task_') || key.startsWith('tk_forces_'))) oldKeys.push(key);
            }
            oldKeys.forEach(key => { try{ localStorage.removeItem(key); } catch {} });

            orderedIds.forEach(id => {
              try{ localStorage.setItem(`tk_task_${id}`, JSON.stringify(tasksById.get(id))); } catch(e){
                console.warn(`Could not save task ${id}`, e);
              }
            });
            try{ localStorage.setItem('tk_taskOrder', JSON.stringify(orderedIds)); } catch {}
            window.tasks = [];
            window.TASKS = window.tasks;
          } else {
            for(const key in restored){
              try{
                localStorage.setItem(key, restored[key]);
              } catch(e){
                console.warn(`Could not restore localStorage key: ${key}`, e);
              }
            }
          }
          
          // Handle old backup format (backward compatibility)
          if(backup.forces){
            for(const key in backup.forces){
              localStorage.setItem(key, JSON.stringify(backup.forces[key]));
            }
          }
          
          // Restore current task index
          if(typeof backup.currentTaskIndex === 'number'){
            window.currentTaskIndex = backup.currentTaskIndex;
            try { localStorage.setItem('tk_currentTaskIndex', String(window.currentTaskIndex)); } catch {}
          }
          
          // Persist settings
          try{ localStorage.setItem('tk_settings', JSON.stringify(window.settings)); } catch {}
          try{ localStorage.setItem('tk_taskScores', JSON.stringify(window.taskScores)); } catch {}
          try{ localStorage.setItem('tk_taskComments', JSON.stringify(window.taskComments)); } catch {}
          // Reload tasks from storage so restored tasks show up without a page reload
          loadSavedTasks();
          loadTaskOrder();
          // Update UI
          updateUserDisplay();
          if(usr) usr.value = window.settings.username || '';
          if(dbg) dbg.checked = !!window.settings.debug;
          alert(isEditorBackup ? `Gjenopprettet ${window.tasks.length} oppgaver fra editor-backup!` : 'Innstillinger gjenopprettet!');
          // Reload current task to reflect restored forces
          if(typeof window.currentTaskIndex === 'number'){
            loadTask(window.currentTaskIndex);
          }
        } catch (err) {
          alert('Feil ved lesing av backup: ' + err.message);
        }
      };
      reader.readAsText(file);
      // Reset file input
      e.target.value = '';
    });
  }

  // Taskset upload for player mode
  const tasksetUploadBtn = document.getElementById('settings-upload-taskset');
  const tasksetUploadModal = document.getElementById('taskset-upload-modal');
  const tasksetSelect = document.getElementById('taskset-select');
  const tasksetUploadInput = document.getElementById('taskset-upload-file-input');
  const tasksetUploadConfirm = document.getElementById('taskset-upload-confirm');
  const tasksetUploadCancel = document.getElementById('taskset-upload-cancel');
  const tasksetUploadClose = document.getElementById('taskset-upload-close');
  const tasksetUploadError = document.getElementById('taskset-upload-error');
  const tasksetFileSelected = document.getElementById('taskset-file-selected');

  // Store pending taskset data (selected but not yet uploaded)
  let pendingTasksetData = null;
  let pendingTasksetName = '';
  let pendingTasksetVersion = null;

  if(tasksetUploadBtn){
    tasksetUploadBtn.addEventListener('click', ()=>{
      // Populate taskset list when opening modal
      populateTasksetSelect();
      
      tasksetUploadError.style.display = 'none';
      tasksetUploadError.textContent = '';
      tasksetFileSelected.style.display = 'none';
      tasksetFileSelected.textContent = '';
      tasksetSelect.value = '';
      tasksetUploadInput.value = '';
      pendingTasksetData = null;
      pendingTasksetName = '';
      pendingTasksetVersion = null;
      tasksetUploadConfirm.disabled = true;
      if(tasksetUploadModal) tasksetUploadModal.classList.remove('hidden');
    });
  }

  // Handle selection from localStorage
  if(tasksetSelect){
    tasksetSelect.addEventListener('change', (e)=>{
      const key = e.target.value;
      tasksetUploadError.style.display = 'none';
      tasksetUploadError.textContent = '';
      tasksetFileSelected.style.display = 'none';
      tasksetFileSelected.textContent = '';
      tasksetUploadInput.value = '';
      pendingTasksetData = null;
      pendingTasksetName = '';
      tasksetUploadConfirm.disabled = true;

      if(!key) return; // No selection

      try {
        const data = JSON.parse(localStorage.getItem(key));
        const selectedIds = data.taskIds || [];

        if (selectedIds.length === 0) {
          tasksetUploadError.textContent = 'Advarsel: oppgavesett er tomt (ingen oppgaver)';
          tasksetUploadError.style.display = 'block';
          return;
        }

        // Store data for when user clicks "Last opp"
        pendingTasksetData = data;
        pendingTasksetName = key.replace('taskset_', '');
        pendingTasksetVersion = data?.metadata?.appVersion || data?.appVersion || window.AppVersioning.read('player');
        tasksetUploadConfirm.disabled = false;
      } catch (err) {
        tasksetUploadError.textContent = 'Feil ved lesing av oppgavesett: ' + err.message;
        tasksetUploadError.style.display = 'block';
        console.error('Error loading taskset:', err);
      }
    });
  }

  if(tasksetUploadCancel){
    tasksetUploadCancel.addEventListener('click', ()=>{
      if(tasksetUploadModal) tasksetUploadModal.classList.add('hidden');
    });
  }

  if(tasksetUploadClose){
    tasksetUploadClose.addEventListener('click', ()=>{
      if(tasksetUploadModal) tasksetUploadModal.classList.add('hidden');
    });
  }

  // Close on Esc key
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && tasksetUploadModal && !tasksetUploadModal.classList.contains('hidden')){
      tasksetUploadModal.classList.add('hidden');
    }
  });

  // Close on click outside modal
  if(tasksetUploadModal){
    tasksetUploadModal.addEventListener('click', (e)=>{
      if(e.target === tasksetUploadModal){
        tasksetUploadModal.classList.add('hidden');
      }
    });
  }

  // Oppgavesett fra nettsiden (oppgavesett.json)
  const tasksetWebSelect = document.getElementById('taskset-web-select');
  let webTasksetsLoaded = false;
  async function populateWebTasksets(){
    if(!tasksetWebSelect) return;
    tasksetWebSelect.innerHTML = '<option value="">-- Laster liste... --</option>';
    try{
      const res = await fetch('oppgavesett.json', {cache: 'no-store'});
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const list = await res.json();
      tasksetWebSelect.innerHTML = '<option value="">-- Velg oppgavesett --</option>';
      (Array.isArray(list) ? list : []).forEach(item => {
        if(!item || !item.file) return;
        const opt = document.createElement('option');
        opt.value = item.file;
        opt.textContent = item.name || item.file;
        tasksetWebSelect.appendChild(opt);
      });
      webTasksetsLoaded = true;
    }catch(err){
      tasksetWebSelect.innerHTML = '<option value="">-- Ikke tilgjengelig (bruk fil) --</option>';
      console.warn('Kunne ikke laste oppgavesett.json:', err);
    }
  }
  if(tasksetUploadBtn) tasksetUploadBtn.addEventListener('click', () => { if(tasksetWebSelect){ tasksetWebSelect.value = ''; } populateWebTasksets(); });
  if(tasksetWebSelect){
    tasksetWebSelect.addEventListener('change', async (e) => {
      const file = e.target.value;
      tasksetUploadError.style.display = 'none';
      tasksetUploadError.textContent = '';
      tasksetFileSelected.style.display = 'none';
      tasksetUploadInput.value = '';
      if(tasksetSelect) tasksetSelect.value = '';
      pendingTasksetData = null;
      pendingTasksetName = '';
      pendingTasksetVersion = null;
      tasksetUploadConfirm.disabled = true;
      if(!file) return;
      try{
        const res = await fetch(encodeURI(file), {cache: 'no-store'});
        if(!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const tasks = data.tasks || [];
        if(!Array.isArray(tasks) || tasks.length === 0 || !tasks[0].id) throw new Error('Ugyldig oppgavesett: ingen oppgaver funnet');
        const label = tasksetWebSelect.options[tasksetWebSelect.selectedIndex].textContent;
        tasksetFileSelected.textContent = `${label} - ${tasks.length} oppgaver`;
        tasksetFileSelected.style.display = 'block';
        pendingTasksetData = tasks;
        pendingTasksetName = label;
        pendingTasksetVersion = data?.metadata?.appVersion || data?.appVersion || null;
        tasksetUploadConfirm.disabled = false;
      }catch(err){
        tasksetUploadError.textContent = 'Feil ved henting av oppgavesett: ' + err.message;
        tasksetUploadError.style.display = 'block';
      }
    });
  }
  // Handle file upload - shows filename with task count
  if(tasksetUploadInput){
    tasksetUploadInput.addEventListener('change', (e)=>{
      const file = e.target.files?.[0];
      if(!file) return;

      const reader = new FileReader();
      reader.onload = async (evt)=>{
        try{
          const importData = JSON.parse(evt.target?.result || '{}');
          const tasksToImport = importData.tasks || [];

          // Validate that it looks like a proper taskset export
          if(!Array.isArray(tasksToImport) || tasksToImport.length === 0){
            throw new Error('Ugyldig fil: ingen oppgaver funnet');
          }

          // Check that tasks have required structure
          const firstTask = tasksToImport[0];
          if(!firstTask.id || typeof firstTask.id !== 'string'){
            throw new Error('Ugyldig fil: oppgaver mangler id');
          }

          // Clear selection from localStorage
          if(tasksetSelect) tasksetSelect.value = '';

          // Clear any error messages
          tasksetUploadError.style.display = 'none';
          tasksetUploadError.textContent = '';

          // Show filename and task count in same style as localStorage selector
          const fileName = file.name.replace('.json', '');
          tasksetFileSelected.textContent = `${fileName} - ${tasksToImport.length} oppgaver`;
          tasksetFileSelected.style.display = 'block';

          // Store data for when user clicks "Last opp"
          pendingTasksetData = tasksToImport;
          pendingTasksetName = fileName;
          pendingTasksetVersion = importData?.metadata?.appVersion || importData?.appVersion || null;
          tasksetUploadConfirm.disabled = false;
        } catch(err){
          tasksetUploadError.textContent = 'Feil: ' + err.message;
          tasksetUploadError.style.display = 'block';
          tasksetFileSelected.style.display = 'none';
          tasksetFileSelected.textContent = '';
          pendingTasksetData = null;
          pendingTasksetName = '';
          tasksetUploadConfirm.disabled = true;
          console.error('Taskset import error:', err);
        }
      };
      reader.readAsText(file);
    });
  }

  // Handle "Last opp" button - actually loads the taskset
  if(tasksetUploadConfirm){
    tasksetUploadConfirm.addEventListener('click', async ()=>{
      if(!pendingTasksetData){
        tasksetUploadError.textContent = 'Feil: Ingen oppgavesett valgt';
        tasksetUploadError.style.display = 'block';
        return;
      }

      try {
        let tasksToImport = [];

        // Check if it's from localStorage (has taskIds) or from file (is array of tasks)
        if(Array.isArray(pendingTasksetData)){
          // File upload - direct array of tasks
          tasksToImport = pendingTasksetData;
        } else if(pendingTasksetData.taskIds){
          // localStorage selection - need to load tasks by ID
          const selectedIds = pendingTasksetData.taskIds || [];
          tasksToImport = selectedIds
            .map(id => {
              const taskKey = `tk_task_${id}`;
              const taskData = localStorage.getItem(taskKey);
              if(taskData){
                try {
                  return JSON.parse(taskData);
                } catch {
                  return null;
                }
              }
              return null;
            })
            .filter(t => t !== null);
        }

        if(tasksToImport.length === 0){
          throw new Error('Ingen gyldige oppgaver funnet');
        }

        const reviewed = await window.AppVersioning.checkImport(
          {tasks:tasksToImport,metadata:{appVersion:pendingTasksetVersion}},
          'player',
          pendingTasksetName || 'oppgavesett',
          [...(window.currentTaskSchema || []), ...(window.tasks || [])]
        );
        tasksToImport = reviewed.data.tasks;
        if(!tasksToImport.length) throw new Error('Ingen støttede oppgaver igjen etter filtrering');

        // Clear current tasks and scores
        window.TASKS = [];
        window.tasks = window.TASKS;
        window.taskScores = {};
        window.taskComments = {};
        window.currentTaskIndex = 0;

        // Clean up all old tk_forces_* and tk_task_* keys from localStorage
        // This prevents leftover forces from previous tasksets from appearing
        const keysToRemove = [];
        for(let i = 0; i < localStorage.length; i++){
          const key = localStorage.key(i);
          if(key && (key.startsWith('tk_forces_') || key.startsWith('tk_task_'))){
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => {
          try {
            localStorage.removeItem(key);
          } catch(err) {
            console.warn(`Could not remove ${key}:`, err);
          }
        });

        // Add imported tasks
        tasksToImport.forEach(task => {
          // Ensure help_lines exists (for player mode help panel)
          if(!task.help_lines || !Array.isArray(task.help_lines)){
            task.help_lines = [];
          }
          // Remove comments (they are developer notes, not part of task spec)
          delete task.comment;
          window.TASKS.push(task);
          // Save to localStorage (scene/task data only, no forces)
          try{
            localStorage.setItem(`tk_task_${task.id}`, JSON.stringify(task));
          } catch(err){
            console.warn(`Could not save task ${task.id}:`, err);
          }
        });

        // Save state
        try{
          localStorage.setItem('tk_taskOrder', JSON.stringify(window.TASKS.map(t => t.id)));
          localStorage.setItem('tk_taskScores', JSON.stringify(window.taskScores));
          localStorage.setItem('tk_taskComments', JSON.stringify(window.taskComments));
          localStorage.setItem('tk_currentTaskIndex', '0');
        } catch(err){
          console.warn('Could not save to localStorage:', err);
        }

        // Update UI
        updateUserDisplay();

        // Close modal and load first task
        tasksetUploadModal.classList.add('hidden');
        loadTask(0);
        
        // Reset state
        pendingTasksetData = null;
        pendingTasksetName = '';
      } catch(err){
        tasksetUploadError.textContent = 'Feil: ' + err.message;
        tasksetUploadError.style.display = 'block';
        console.error('Taskset load error:', err);
      }
    });
  }

  // ESC key closes settings/help/feedback panels
  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    const settingsPanel = document.getElementById('settings-panel');
    const helpPanelEl = document.getElementById('help-panel');
    // Close settings panel if open
    if(settingsPanel && !settingsPanel.classList.contains('hidden')){
      settingsPanel.classList.add('hidden');
    }
    // Close help panel if open
    if(helpPanelEl && !helpPanelEl.classList.contains('hidden')){
      helpPanelEl.classList.add('hidden');
    }
    // Close feedback panel and clear highlights
    clearFeedback();
    e.stopPropagation();
  });

  // Placeholder for videre porteringsfaser
  window.notImplemented = function(feature){
    console.warn("Feature '" + feature + "' ikke implementert ennå.");
  };

  // Full reset helper
  function performFullReset(){
    if(!window.TASKS) return;
    if(!confirm('Slette alle lokale data og starte på nytt?')) return;
    // Remove ALL tk_* localStorage keys (comprehensive cleanup)
    const keysToRemove = [];
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && key.startsWith('tk_')){
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k=>{
      try{ localStorage.removeItem(k); }catch{}
    });
    // Reinit runtime state
    window.settings = { debug:false, username:'Isaac Newton' };
    window.taskScores = {};
    window.taskComments = {};
    // Clear selection state
    window.selectedSceneElement = null;
    window.currentGuidelines = null;
    // Reload first task
    loadTask(0);
    updateUserDisplay();
    // Hide settings panel
    const pnl = document.getElementById('settings-panel');
    if(pnl) pnl.classList.add('hidden');
    // Clear help panel and force re-render
    const helpPanel = document.getElementById('help-panel');
    if(helpPanel){
      helpPanel.classList.add('hidden');
      const helpContent = document.getElementById('help-content');
      if(helpContent) helpContent.innerHTML = '';
    }
    alert('Full reset utført.');
  }

  // Wire reset button (delegated in case it was injected)
  document.addEventListener('click', (e)=>{
    const el = e.target;
    if(el && el.id === 'settings-reset-all'){
      performFullReset();
    }
  });
  
  // Call updateAppState after all functions are defined to properly initialize state
  if(window.updateAppState && typeof window.updateAppState === 'function'){
    window.updateAppState();
  }
})();
