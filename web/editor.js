/**
 * editor.js - Editor mode entry point (full copy of main.js with editor features)
 * 
 * Separates localStorage namespace from player mode using 'editor_' prefix
 */

// ===== Editor application code=====
// Editor for Kraftpila 
// Fallback uten ES-moduler slik at fil kan åpnes direkte via file://.
// Senere kan vi gå tilbake til type="module" når vi bruker lokal server.

// Enable editor mode for this file
window.editorMode = true;

// Initialize empty tasks array (will be populated from localStorage)
window.tasks = [];

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

  // Helper: draw a text rotated by angle (angle_deg) or oriented by a normal (n_vec => tangent)
  function drawRotatedText(g, t) {
    if(!t || !t.txt || !t.pos) return;
    const size = t.size || 14;
    const color = t.color || '#222';
    const align = t.align || 'center';
    let angle = 0;
    if(typeof t.angle_deg === 'number') {
      angle = t.angle_deg * Math.PI / 180;
    } else if (t.n_vec && Array.isArray(t.n_vec) && t.n_vec.length === 2) {
      // Use tangent of the provided normal (y-down screen coords)
      const nn = t.n_vec;
      const len = geometry.length(nn) || 1;
      const n_unit = [ nn[0]/len, nn[1]/len ];
      const tv = geometry.tangentFromNormal(n_unit);
      angle = Math.atan2(tv[1], tv[0]);
    }
    g.save();
    g.translate(t.pos[0], t.pos[1]);
    g.rotate(angle);
    g.fillStyle = color;
    g.font = `${size}px Segoe UI, Arial`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(t.txt, 0, 0);
    g.restore();
  }

  function frame() {
    clear();
    
    // Save context and translate so grid area (0,0 to 1000,640) starts at top-left
    // Canvas extends from -200,-200 to 1000,640 (1200x800 total)
    ctx.save();
    ctx.translate(window.offsetX, window.offsetY);
    
    if (gridOn) {
      drawGrid(ctx);
    }
    // Collect texts that should be rotated and temporarily hide them before drawScene
    let rotatedTexts = [];
    if(window.currentTask && window.currentTask.scene && Array.isArray(window.currentTask.scene.texts)){
      rotatedTexts = window.currentTask.scene.texts.filter(t => 'angle_deg' in t || 'n_vec' in t);
      // Hide originals by making them transparent for drawScene
      rotatedTexts.forEach(t=>{
        if(!('_origColor' in t)) t._origColor = t.color;
        t.color = 'rgba(0,0,0,0)';
      });
    }

    // Draw current task scene (before user forces)
    if(window.currentTask){
      drawScene(ctx, window.currentTask, true);
    }

    // Debug: Draw snap points if debug mode is on
    if(window.drawSnapPoints){
      drawSnapPoints(ctx);
    }

    // Restore colors and draw rotated overlays on top
    if(rotatedTexts.length){
      rotatedTexts.forEach(t=>{ t.color = t._origColor; delete t._origColor; });
      rotatedTexts.forEach(t=> drawRotatedText(ctx, t));
    }

    // Guidelines (before forces for visibility)
    if(window.drawGuidelines){
      drawGuidelines(ctx);
    }
    
    // Step 5: Draw scene element hover/selection highlights
    if(!window.currentTask?.scene?.snapping_off){
      // Don't show highlights while actively drawing a force
      const activeForce = window.fm?.forces[window.fm?.activeIndex];
      const isDrawingForce = activeForce?.drawing;
      
      if(!isDrawingForce && window.sceneLookup){
        drawSceneElementHighlights(ctx);
      }
    }
    
    // Draw anchor candidates when dragging force anchor in editor mode
    if(window.anchorCandidates && window.anchorCandidates.length > 0){
      window.anchorCandidates.forEach((candidate, idx) => {
        if(!candidate.pos) return;
        
        // Highlight the closest one (hovered) in bright color, others dim
        const isHovered = (idx === window.anchorHoverIndex);
        const radius = isHovered ? 8 : 5;
        const color = isHovered ? '#ffff00' : '#aaaaaa'; // bright yellow vs dim gray
        const alpha = isHovered ? 1.0 : 0.5;
        
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(candidate.pos[0], candidate.pos[1], radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      });
    }
    
    // Draw test forces
    if(window.fm){
      window.fm.drawAll(ctx);
    }
    
    // Draw expected direction guides in editor mode
    if(window.currentTask && window.fm){
      drawExpectedDirectionGuides(ctx, window.currentTask, window.fm.forces);
    }
    
    // Draw selection handles for selected scene element
    if(window.selectedSceneElement){
      drawSceneElementHandles(ctx, window.selectedSceneElement);
    }
    
    ctx.restore();
    requestAnimationFrame(frame);
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
    
    // Helper to build lookup key - singleton elements (plane, origin) use type only
    function getLookupKey(type, index){
      if(type === 'plane' || type === 'origin') return type;
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
            ctx.fillStyle = window.HIGHLIGHT_SCENE_POINT_DIM_COLOR;
            ctx.beginPath();
            ctx.arc(point[0], point[1], window.HIGHLIGHT_SCENE_POINT_DIM_RADIUS, 0, Math.PI * 2);
            ctx.fill();
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
            ctx.fillStyle = window.HIGHLIGHT_SCENE_POINT_BRIGHT_COLOR;
            ctx.beginPath();
            ctx.arc(point[0], point[1], window.HIGHLIGHT_SCENE_POINT_BRIGHT_RADIUS, 0, Math.PI * 2);
            ctx.fill();
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
      
      // Draw coordinates if show_scene_coordinates is on
      if(window.settings?.show_scene_coordinates){
        // Cartesian coordinates (negated y)
        const cartX = Math.round(x);
        const cartY = -Math.round(y);
        const coordStr = `(${cartX},${cartY})`;
        
        ctx.fillStyle = window.SCENE_HANDLE_TEXT_COLOR;
        ctx.font = `${window.SCENE_HANDLE_TEXT_SIZE}px Segoe UI, Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(coordStr, x + window.SCENE_HANDLE_RADIUS + 6, y - 8);
      }
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
    
    if(type === 'origin' && scene.origin){
      const [x, y] = scene.origin;
      drawHandle(x, y);
    } 
    else if(type === 'plane' && scene.plane){
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
      
      // Top center handle (for n-direction) - clamp for display
      const topCenter = [bc[0] + n[0]*h, bc[1] + n[1]*h];
      const clampedTopCenter = window.clampToCanvas(topCenter);
      drawHandle(clampedTopCenter[0], clampedTopCenter[1]);
      
      // Bottom right handle (for t-direction) - clamp for display
      const bottomRight = [bc[0] + t[0]*w/2, bc[1] + t[1]*w/2];
      const clampedBottomRight = window.clampToCanvas(bottomRight);
      drawHandle(clampedBottomRight[0], clampedBottomRight[1]);
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
      
      // Width direction handle (along t_vec direction) - clamp for display
      const widthHandle = [cx + t[0]*w/2, cy + t[1]*w/2];
      const clampedWidthHandle = window.clampToCanvas(widthHandle);
      drawHandle(clampedWidthHandle[0], clampedWidthHandle[1]);
      
      // Height direction handle (along n_vec direction) - clamp for display
      const heightHandle = [cx + n[0]*h/2, cy + n[1]*h/2];
      const clampedHeightHandle = window.clampToCanvas(heightHandle);
      drawHandle(clampedHeightHandle[0], clampedHeightHandle[1]);
    } 
    else if(type === 'circle' && scene.circles && scene.circles[index]){
      const circle = scene.circles[index];
      const [cx, cy] = circle.center;
      const r = circle.radius;
      
      // Center and 4 cardinal points - clamp for display
      drawHandle(cx, cy);
      const clampedRight = window.clampToCanvas([cx + r, cy]);
      const clampedLeft = window.clampToCanvas([cx - r, cy]);
      const clampedDown = window.clampToCanvas([cx, cy + r]);
      const clampedUp = window.clampToCanvas([cx, cy - r]);
      drawHandle(clampedRight[0], clampedRight[1]);
      drawHandle(clampedLeft[0], clampedLeft[1]);
      drawHandle(clampedDown[0], clampedDown[1]);
      drawHandle(clampedUp[0], clampedUp[1]);
    } 
    else if(type === 'segment' && scene.segments && scene.segments[index]){
      const seg = scene.segments[index];
      // Clamp handle positions for display while keeping actual coordinates unclamped
      const clampedA = window.clampToCanvas(seg.a);
      const clampedB = window.clampToCanvas(seg.b);
      drawHandle(clampedA[0], clampedA[1]);
      drawHandle(clampedB[0], clampedB[1]);
    } 
    else if(type === 'arrow' && scene.arrows && scene.arrows[index]){
      const arrow = scene.arrows[index];
      // Clamp handle positions for display while keeping actual coordinates unclamped
      const clampedA = window.clampToCanvas(arrow.a);
      const clampedB = window.clampToCanvas(arrow.b);
      drawHandle(clampedA[0], clampedA[1]);
      drawHandle(clampedB[0], clampedB[1]);
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

  let gridOn = true; // starter som på  // Ikon: viser fylte ruter ◻ når grid er PÅ, tomt ⊞ når grid er AV
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
      ['btn-snap','snap'], ['btn-guidelines','guidelines'], ['btn-undo','undo'], ['btn-redo','redo'], ['btn-prev','prev'], ['btn-next','next'],
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
    show_scene_coordinates: false,
  };
  // Load persisted settings from editor_ namespace
  try {
    const raw = localStorage.getItem('editor_settings');
    if(raw){ const s = JSON.parse(raw); if(typeof s.debug==='boolean') window.settings.debug=s.debug; if(typeof s.username==='string') window.settings.username=s.username; if(typeof s.show_force_coordinates==='boolean') window.settings.show_force_coordinates=s.show_force_coordinates; if(typeof s.show_scene_coordinates==='boolean') window.settings.show_scene_coordinates=s.show_scene_coordinates; }
  } catch {}
  // Show editor panels
  updateEditorMode();
  window.taskScores = {};
  try {
    const raw = localStorage.getItem('editor_taskScores');
    if(raw){ window.taskScores = JSON.parse(raw); }
  } catch {}
  // Task comments: taskId -> { comment: string }
  window.taskComments = {};
  try {
    const raw = localStorage.getItem('editor_taskComments');
    if(raw){ window.taskComments = JSON.parse(raw); }
  } catch {}
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
  
  // Editor: drawing a new force is "armed" while an undrawn force's textbox (empty or named) has focus.
  // Then canvas clicks start the force instead of selecting/editing scene objects.
  function isDrawArmed(){
    const ae = document.activeElement;
    if(!ae || ae.tagName !== 'INPUT' || !inputsContainer || !inputsContainer.contains(ae)) return false;
    const idx = parseInt(ae.dataset.index, 10);
    const force = window.fm && window.fm.forces[idx];
    if(!force || idx !== window.fm.activeIndex) return false;
    return !force.anchor && !force.arrowBase && !force.arrowTip;
  }

  // Helper: test proximity to all scene element points (including non-snap elements), prefer selected element within GRID_STEP
  function updateSceneElementHover(pos){
    if(isDrawArmed()){
      window.hoveredSceneElement = null;
      return;
    }
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
    // Show feedback panel if we have a score (even if no error lines)
    const panel = document.getElementById('feedback-panel');
    if(panel && score){
      panel.classList.remove('hidden');
      console.log('📊 Feedback panel shown with score:', score);
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
    if(!task || !task.initialForces) {
      return;
    }
    
    // Remove any existing initialForces (non-moveable forces) to avoid duplicates
    if(window.fm && window.fm.forces){
      window.fm.forces = window.fm.forces.filter(f => {
        // Keep moveable forces (expected) and blank forces
        return f.moveable !== false && (f.anchor !== null || f.arrowBase !== null || f.arrowTip !== null || !f.name);
      });
    }
    
    const hadInitialBlank = (window.fm.forces.length===1 && !window.fm.forces[0].anchor && !window.fm.forces[0].arrowBase && !window.fm.forces[0].arrowTip);
    task.initialForces.forEach(spec => {
      // Build geometry from anchorFrom rect point + direction & length
      if(spec.anchorFrom){
        const lookup = window.sceneLookup[spec.anchorFrom];
        if(!lookup) return;
        const P = lookup.points[spec.point];
        if(!P) return;
        const dir = spec.dir || [1,0];
        const L = spec.len || (GRID_STEP*3);
        const arrowTip = [P[0]+dir[0]*L, P[1]+dir[1]*L];
        const f = new Force();
        f.anchor = P.slice();
        f.arrowBase = P.slice();
        f.arrowTip = arrowTip;
        f.name = spec.name || '';
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
    const helpBtn = document.getElementById('btn-help');
    if(helpBtn && window.currentTask){
      const span = helpBtn.querySelector('span');
      if(span){
        let btnText = 'Oppgave ' + (window.currentTask.taskTitle || window.currentTask.id);
        // Add score if available
        const taskScore = window.taskScores && window.taskScores[window.currentTask.id];
        if(taskScore && typeof taskScore.score === 'number'){
          const scorePercent = Math.round(taskScore.score * 100);
          btnText += ' ' + scorePercent + '%';
        }
        span.textContent = btnText;
      }
    }
  }

  // Editor mode state management
  function updateEditorMode(){
    const scenePanel = document.getElementById('scene-panel');
    const editorButtons = document.getElementById('editor-buttons');
    
    // Always show editor UI elements (we're always in editor mode)
    if(scenePanel) scenePanel.style.display = 'block';
    if(editorButtons) editorButtons.classList.remove('hidden');
    
    // Update panel heights after showing/hiding editor panel
    updatePanelHeights();
  }

  /**
   * Dynamically resize force and scene panels based on content.
   * Force panel is positioned after top bar (80px) and sized based on content.
   * Scene panel starts directly after force panel and extends to bottom of window.
   * Editor buttons panel is positioned on canvas area only (left side, above the buttons area).
   */
  function updatePanelHeights(){
    const forcePanel = document.getElementById('force-panel');
    const scenePanel = document.getElementById('scene-panel');
    
    if(!forcePanel) return;
    
    // Layout: top bar (80px) + force panel + scene panel (extends to window bottom)
    const topBarHeight = window.TOP_BAR_HEIGHT;
    const availableHeight = window.innerHeight - topBarHeight;
    
    // Count forces and scene elements to estimate needed space
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
    
    // Calculate space needed for each panel
    // Force panel: header (60px with padding + title) + per-force height (32px each)
    const forceHeaderHeight = window.FORCE_HEADER_HEIGHT;
    const forceItemHeight = 32; // input + gap + margin
    const forceMinHeight = 120; // Minimum space for at least 1-2 items
    const forceHeightNeeded = forceHeaderHeight + (forceCount * forceItemHeight);
    const forcePanelHeight = Math.max(forceMinHeight, Math.min(availableHeight * 0.4, forceHeightNeeded + 10));
    
    // Scene panel: takes remaining space, extends to bottom
    const sceneMinHeight = 120;
    const scenePanelHeight = Math.max(sceneMinHeight, availableHeight - forcePanelHeight);
    
    // Set force panel height and top position
    if(forcePanel){
      forcePanel.style.top = topBarHeight + 'px';
      forcePanel.style.height = forcePanelHeight + 'px';
      forcePanel.style.display = 'block';
    }
    
    // Set scene panel position (directly after force panel) and extend to bottom
    if(scenePanel){
      scenePanel.style.top = (topBarHeight + forcePanelHeight) + 'px';
      scenePanel.style.bottom = '0px'; // Extend to bottom of window
      scenePanel.style.display = 'block';
    }
  }

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
   * ref is like 'origin', 'rect0', 'ellipse1', etc.
   * point is like 'center', 'top_center', etc.
   * segment is like 'top', 'bottom', etc.
   * pos is the [x, y] coordinate for distance matching.
   */
  window.buildAnchorCandidates = function(task){
    const candidates = [];
    if(!task || !task.scene) return candidates;
    
    const scene = task.scene;
    
    // Origin - always has 'center' point
    const origin = task.origin || scene.origin;
    if(origin && Array.isArray(origin) && origin.length >= 2){
      candidates.push({
        ref: 'origin',
        type: 'point',
        point: 'center',
        pos: [origin[0], origin[1]]
      });
    }
    
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
    
    // Circles - center plus cardinal points on the circumference
    if(Array.isArray(scene.circles)){
      scene.circles.forEach((c, i) => {
        if(!c || !c.center) return;
        const [cx, cy] = c.center;
        const r = c.radius || 0;
        [
          { name: 'center', pos: [cx, cy] },
          { name: 'top_center', pos: [cx, cy - r] },
          { name: 'bottom_center', pos: [cx, cy + r] },
          { name: 'left_middle', pos: [cx - r, cy] },
          { name: 'right_middle', pos: [cx + r, cy] }
        ].forEach(p => {
          candidates.push({ ref: `circle${i}`, type: 'point', point: p.name, pos: p.pos });
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
    
    // Plane, segments and arrows: take points/segments from the shared scene lookup
    if(window.buildAllScenePoints){
      const lookup = window.buildAllScenePoints(task);
      Object.keys(lookup).forEach(ref => {
        if(!/^(plane|segment|arrow)/.test(ref)) return;
        const entry = lookup[ref];
        Object.keys(entry.points || {}).forEach(name => {
          candidates.push({ ref, type: 'point', point: name, pos: entry.points[name] });
        });
        Object.keys(entry.segments || {}).forEach(name => {
          const [p, q] = entry.segments[name];
          candidates.push({ ref, type: 'segment', segment: name, pos: [(p[0]+q[0])/2, (p[1]+q[1])/2] });
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
  
  /**
   * Cleanup task for evaluation in editor mode.
   * Validates that all expectedForces have anchor specs defined.
   * Ensures initialForces are NOT in the expectedForces array.
   * Attempts to match expectedForces to scene elements based on their drawn positions.
   * If no match found, assigns a default anchor (origin).
   * Returns {valid: boolean, message: string}
   */
  window.cleanupTaskForEvaluation = function(){
    if(!window.currentTask){
      return { valid: true, message: '' };
    }
    
    const task = window.currentTask;
    const messages = [];
    
    // Ensure expectedForces array exists
    if(!task.expectedForces){
      task.expectedForces = [];
    }
    
    // Build map of drawn forces by name for anchor matching
    const drawnForcesByName = new Map();
    if(window.fm && window.fm.forces){
      window.fm.forces.forEach(f => {
        if(f.name && f.arrowBase){
          const key = f.name.toLowerCase().trim();
          drawnForcesByName.set(key, f);
        }
      });
    }
    
    // Validate and set default/smart anchors for all expectedForces
    for(let i = 0; i < task.expectedForces.length; i++){
      const expectedForce = task.expectedForces[i];
      const messages_for_this_force = [];
      
      // Try to find matching drawn force and auto-detect best anchor
      if(!expectedForce.anchor && expectedForce.name){
        const key = expectedForce.name.toLowerCase().trim();
        const drawnForce = drawnForcesByName.get(key);
        
        if(drawnForce && drawnForce.arrowBase){
          // Try to find closest scene element/point to this force's arrowBase
          const bestMatch = window.findBestAnchor(drawnForce.arrowBase, task, 60);
          
          if(bestMatch){
            // Build anchor spec from best match
            if(bestMatch.type === 'point'){
              expectedForce.anchor = {
                type: 'point',
                ref: bestMatch.ref,
                point: bestMatch.point
              };
              messages_for_this_force.push(`matched ${bestMatch.ref}.${bestMatch.point}`);
            } else if(bestMatch.type === 'segment'){
              expectedForce.anchor = {
                type: 'segment',
                ref: bestMatch.ref,
                segment: bestMatch.segment
              };
              messages_for_this_force.push(`matched ${bestMatch.ref}.${bestMatch.segment}`);
            }
          } else {
            // No close match found - use origin default
            expectedForce.anchor = { type: 'point', ref: 'origin', point: 'center' };
            messages_for_this_force.push('no close match, used origin default');
          }
        } else {
          // No drawn force found - use origin default
          expectedForce.anchor = { type: 'point', ref: 'origin', point: 'center' };
          messages_for_this_force.push('no drawn force found, used origin default');
        }
        
        if(messages_for_this_force.length){
          messages.push(`expectedForces[${i}] "${expectedForce.name}": ${messages_for_this_force.join(', ')}`);
        }
      }
      
      // Also ensure dir is set (default to [0,1] for gravity-like forces)
      if(!expectedForce.dir){
        expectedForce.dir = [0, 1];
        messages.push(`expectedForces[${i}] "${expectedForce.name}": satte standard retning [0,1]`);
      }
    }
    
    // Ensure initialForces array exists
    if(!task.initialForces){
      task.initialForces = [];
    }
    
    // Remove any initialForces from expectedForces (they should not be mixed)
    const initialForceNames = new Set();
    task.initialForces.forEach(f => {
      if(f.name) initialForceNames.add(f.name.toLowerCase().trim());
    });
    
    const expectedBeforeFilter = task.expectedForces.length;
    task.expectedForces = task.expectedForces.filter(f => {
      const isInitial = f.name && initialForceNames.has(f.name.toLowerCase().trim());
      if(isInitial){
        messages.push(`Fjernet "${f.name}" fra expectedForces (dette er en initialForce)`);
      }
      return !isInitial;
    });
    
    if(task.expectedForces.length < expectedBeforeFilter){
      messages.push(`${expectedBeforeFilter - task.expectedForces.length} initialForce(r) fjernet fra expectedForces`);
    }
    
    // If there are validation messages, warning but allow evaluation
    const valid = messages.length === 0;
    const message = messages.join(' | ');
    
    return { valid, message };
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
        if(!f.anchor && !f.arrowBase && !f.arrowTip && (!f.name || f.name.trim() === '')){
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
        
        if(type === 'origin' && scene?.origin){
          elementOrigin = scene.origin;
        } else if(type === 'plane' && scene?.plane){
          elementOrigin = scene.plane.through;
        } else if(type === 'rect' && scene?.rects?.[index]){
          elementOrigin = scene.rects[index].bottomCenter;
        } else if(type === 'ellipse' && scene?.ellipses?.[index]){
          elementOrigin = scene.ellipses[index].center;
        } else if(type === 'circle' && scene?.circles?.[index]){
          elementOrigin = scene.circles[index].center;
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
    
    // 3. Update scene panel (always in editor mode)
    updateScenePanel();
    
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

  // Generate unique task ID
  function generateUniqueTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  const NEW_ID_PATTERN = /^task_\d{13}_[a-z0-9]{9}$/;
  function isNewStyleId(id){
    return typeof id === 'string' && NEW_ID_PATTERN.test(id);
  }

  function normalizeTaskMeta(task){
    if(!task) return task;
    // Normalize title fields
    const title = task.taskTitle || task.title;
    if(title && !task.taskTitle) task.taskTitle = title;
    if(title && !task.title) task.title = title;
    // Normalize subtitle fields
    const sub = task.taskSubTitle || task.subTitle;
    if(sub && !task.taskSubTitle) task.taskSubTitle = sub;
    if(sub && !task.subTitle) task.subTitle = sub;
    return task;
  }

  // One-time migration: convert legacy tasks (old IDs) into new IDs and migrate related storage
  function migrateLegacyTasks(){
    const taskKeys = [];
    const forcesKeys = [];
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(!key) continue;
      if(key.startsWith('editor_task_')) taskKeys.push(key);
      if(key.startsWith('editor_forces_')) forcesKeys.push(key);
    }

    let taskOrder = [];
    let savedTasks = [];
    try { taskOrder = JSON.parse(localStorage.getItem('editor_taskOrder') || '[]'); } catch {}
    try { savedTasks = JSON.parse(localStorage.getItem('editor_savedTasks') || '[]'); } catch {}

    const migrated = [];
    taskKeys.forEach(taskKey => {
      try {
        const taskData = JSON.parse(localStorage.getItem(taskKey));
        if(!taskData || !taskData.id || isNewStyleId(taskData.id)) return;

        const oldId = taskData.id;
        const newId = generateUniqueTaskId();
        const oldTitle = taskData.taskTitle || '';

        // Promote old ID to title and old title to subtitle
        const migratedTask = { ...taskData, id: newId, taskTitle: oldId, taskSubTitle: oldTitle };

        localStorage.setItem(`editor_task_${newId}`, JSON.stringify(migratedTask));
        localStorage.removeItem(taskKey);

        // Migrate forces one-to-one and remove legacy entry
        const oldForcesKey = `editor_forces_${oldId}`;
        const newForcesKey = `editor_forces_${newId}`;
        const oldForcesData = localStorage.getItem(oldForcesKey);
        if(oldForcesData && !localStorage.getItem(newForcesKey)){
          localStorage.setItem(newForcesKey, oldForcesData);
        }
        if(oldForcesData) localStorage.removeItem(oldForcesKey);

        // Update stored lists to point at the new ID
        const replaceId = (list, from, to) => {
          if(!Array.isArray(list)) return false;
          let changed = false;
          for(let i = 0; i < list.length; i++){
            if(list[i] === from){
              list[i] = to;
              changed = true;
            }
          }
          return changed;
        };

        replaceId(taskOrder, oldId, newId);
        replaceId(savedTasks, oldId, newId);

        migrated.push({ oldId, newId });
      } catch(e) {
        console.warn(`Legacy migration skipped for ${taskKey}:`, e.message);
      }
    });

    if(!migrated.length) return;

    // Deduplicate lists after replacement
    const dedupe = (list) => Array.from(new Set(Array.isArray(list) ? list.filter(Boolean) : []));
    taskOrder = dedupe(taskOrder);
    savedTasks = dedupe(savedTasks);

    try { localStorage.setItem('editor_taskOrder', JSON.stringify(taskOrder)); } catch {}
    try { localStorage.setItem('editor_savedTasks', JSON.stringify(savedTasks)); } catch {}

    console.group('🔄 Migrated legacy editor tasks');
    migrated.forEach(({oldId, newId}) => {
      console.log(`${oldId} → ${newId}`);
    });
    console.groupEnd();
  }

  // Tegner fasitkreftene (expectedForces) som ekte piler når oppgaven ikke har lagrede tegnede krefter (f.eks. etter import).
  function seedExpectedForces(task){
    if(!task || !Array.isArray(task.expectedForces) || !task.expectedForces.length || !window.fm) return;
    const lookup = window.sceneLookup || {};
    const len = 3 * GRID_STEP;
    const isBlank = f => f.anchor === null && f.arrowBase === null && f.arrowTip === null && !f.name;
    const added = [];
    const locked = new Set((task.initialForces || []).map(f => f && f.name).filter(Boolean));
    task.expectedForces.forEach(spec => {
      const isLocked = locked.has(spec.name);
      if(isLocked && window.fm.forces.some(f => f.name === spec.name && f.anchor)) return;
      const a = spec.anchor;
      const dr = spec.drawn;
      if(dr && dr.anchor && dr.arrowBase && dr.arrowTip){
        const f = new Force();
        f.anchor = dr.anchor.slice();
        f.arrowBase = dr.arrowBase.slice();
        f.arrowTip = dr.arrowTip.slice();
        f.name = spec.name || '';
        f.moveable = !isLocked;
        f.isExpected = !isLocked;
        f.updateDirectionAndLength();
        added.push(f);
        return;
      }
      let P = null;
      if(Array.isArray(a)) P = a;
      else if(a && a.type === 'point'){
        const o = lookup[a.ref];
        P = o && o.points && o.points[a.point];
      } else if(a && a.type === 'segment'){
        const o = lookup[a.ref];
        const seg = o && o.segments && o.segments[a.segment];
        if(seg) P = [(seg[0][0]+seg[1][0])/2, (seg[0][1]+seg[1][1])/2];
      } else if(a && a.type === 'custom' && a.pos) P = a.pos;
      if(!P) return;
      const dir = spec.dir || [0, 1];
      const f = new Force();
      f.anchor = [P[0], P[1]];
      f.arrowBase = [P[0], P[1]];
      f.arrowTip = [P[0] + dir[0]*len, P[1] + dir[1]*len];
      f.name = spec.name || '';
      f.moveable = !isLocked;
      f.isExpected = !isLocked;
      f.updateDirectionAndLength();
      added.push(f);
    });
    if(!added.length) return;
    window.fm.forces = window.fm.forces.filter(f => !isBlank(f)).concat(added);
    const blank = new Force();
    blank.isExpected = true;
    window.fm.forces.push(blank);
    window.fm.setActive(window.fm.forces.length - 1);
  }

  function loadTask(index){
    // Flush pending edits to the task we are leaving
    autoSave();
    if(!window.tasks || !window.tasks.length) {
      return;
    }
    window.currentTaskIndex = (index + window.tasks.length) % window.tasks.length;
    const task = normalizeTaskMeta(window.tasks[window.currentTaskIndex]);
    // NEW: persist current task index
    markEdited('index');
    
    // Check if task already exists in localStorage - if so, load ONLY from localStorage
    const taskId = window.tasks[window.currentTaskIndex].id;
    const taskStorageKey = `editor_task_${taskId}`;
    const savedTaskData = localStorage.getItem(taskStorageKey);
    
    if(savedTaskData){
      // Task has been edited before - load completely from localStorage
      try {
        window.currentTask = normalizeTaskMeta(JSON.parse(savedTaskData));
      } catch {
        // Fallback to default task if parse fails
        window.currentTask = task;
      }
    } else {
      // First time loading this task - use default from tasks
      window.currentTask = task;
    }

    // Keep array entry in sync after normalization
    if(window.tasks && window.currentTaskIndex !== undefined){
      window.tasks[window.currentTaskIndex] = window.currentTask;
    }
    
    // Use ALL points for highlighting/hovering (includes segments, arrows, etc.)
    window.sceneLookup = window.buildAllScenePoints(window.currentTask);
    // Use snap-enabled lookup for snapping
    const snapLookup = buildSceneLookup(window.currentTask);
    window.snapPoints = snapping.buildSnapPoints(snapLookup);
      

    
    // Create new ForcesManager (will be populated below)
    window.fm = new ForcesManager();
    // Rebuild inputs for new manager to avoid stale listeners
    inputsContainer.innerHTML = '';
    // Load persisted forces for this task (if any)
    // Try both editor_forces_* and editor_forces_* (legacy from player mode)
    const editorTaskKey = `editor_forces_${window.currentTask.id}`;
    const legacyTaskKey = `editor_forces_${window.currentTask.id}`;
    
    let savedForces = localStorage.getItem(editorTaskKey);
    
    // Fallback to legacy key if not found in editor namespace
    if (!savedForces) {
      savedForces = localStorage.getItem(legacyTaskKey);
    }
    
    if(savedForces){
      try{
        const parsed = JSON.parse(savedForces);
        if(Array.isArray(parsed) && parsed.length){
          // Restore forces from saved state
          window.fm.forces = parsed.map(spec=>{
            const f = new Force();
            f.anchor = spec.anchor ? [spec.anchor[0], spec.anchor[1]] : null;
            f.arrowBase = spec.arrowBase ? [spec.arrowBase[0], spec.arrowBase[1]] : null;
            f.arrowTip = spec.arrowTip ? [spec.arrowTip[0], spec.arrowTip[1]] : null;
            f.name = spec.name || '';
            f.moveable = (spec.moveable !== false);
            // If isExpected not set, infer from moveable (false moveable = initial = not expected)
            if(spec.isExpected !== undefined){
              f.isExpected = spec.isExpected;
            } else {
              f.isExpected = (spec.moveable !== false);
            }
            if(f.arrowBase && f.arrowTip) f.updateDirectionAndLength();
            return f;
          });
          // Ensure at least one blank editable force
          const blanks = window.fm.forces.filter(f => f.anchor === null);
          if(!blanks.length) {
            const blankForce = new Force();
            blankForce.isExpected = true;
            window.fm.forces.push(blankForce);
          }
        } else {
          seedInitialForces(window.currentTask);
          seedExpectedForces(window.currentTask);
        }
      } catch(err) {
        seedInitialForces(window.currentTask);
        seedExpectedForces(window.currentTask);
      }
    } else {
      // No saved forces, use defaults
      seedInitialForces(window.currentTask);
      seedExpectedForces(window.currentTask);
    }
    window.fm.syncInputs(inputsContainer);
    ensureInputMeta();
    // Update all derived state after task load
    window.updateAppState();
  }
  
  // ===== Autolagring =====
  // Redigeringer kaller markEdited(...) med hva som er endret. Selve lagringen
  // gjøres samlet i autoSave() etter en kort pause (eller med en gang når den kalles direkte).
  //   'task'   – gjeldende oppgave (scene, tittel, kommentar, ...)
  //   'help'   – hjelpelinjer fra tekstfeltet (lagres sammen med oppgaven)
  //   'forces' – tegnede krefter (og fasit/låst-spec i oppgaven)
  //   'order'  – oppgaverekkefølgen i hele oppgavesettet
  //   'index'  – hvilken oppgave som er åpen
  //   'settings' / 'scores' – innstillinger og poengsummer
  // Andre nøkler (slettede oppgaver, importerte oppgaver, relasjoner) legges i kø med
  // queueStorage(key, verdi) (verdi null = fjern) og skrives også av autoSave().
  const AUTOSAVE_DELAY_MS = 150;
  const editedFlags = { task: false, help: false, forces: false, order: false, index: false, settings: false, scores: false, storage: false };
  const pendingStorage = new Map();
  let autoSaveTimer = null;

  window.markEdited = function markEdited(...what){
    (what.length ? what : ['task']).forEach(w => { if(w in editedFlags) editedFlags[w] = true; });
    if(autoSaveTimer === null){
      autoSaveTimer = setTimeout(autoSave, AUTOSAVE_DELAY_MS);
    }
  };

  function queueStorage(key, value){
    pendingStorage.set(key, value);
    markEdited('storage');
  }

  // Forkast ventende lagring (brukes før en oppgave slettes)
  function cancelAutoSave(){
    if(autoSaveTimer !== null){ clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    Object.keys(editedFlags).forEach(k => { editedFlags[k] = false; });
    pendingStorage.clear();
  }

  function autoSave(){
    if(autoSaveTimer !== null){ clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    const f = Object.assign({}, editedFlags);
    Object.keys(editedFlags).forEach(k => { editedFlags[k] = false; });

    if(f.storage){
      pendingStorage.forEach((value, key) => {
        try{
          if(value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        } catch {}
      });
      pendingStorage.clear();
    }
    if(f.help) collectHelpLines();
    if(f.forces) writeForces();
    // Krefter kan endre spec i oppgaven, og hjelpelinjer ligger i oppgaven
    if(f.task || f.help || f.forces) writeTask();
    if(f.order) writeTaskOrder();
    if(f.index) try { localStorage.setItem('editor_currentTaskIndex', String(window.currentTaskIndex)); } catch {}
    if(f.settings) try { localStorage.setItem('editor_settings', JSON.stringify(window.settings)); } catch {}
    if(f.scores) try { localStorage.setItem('editor_taskScores', JSON.stringify(window.taskScores)); } catch {}
    if(f.task || f.help || f.forces || f.order || f.storage) recordUndo();
  }
  window.autoSave = autoSave;

  // ===== Angre / gjør om =====
  // Et steg er et øyeblikksbilde av hele oppgavesettet slik det ligger i localStorage
  // (oppgaver, krefter, relasjoner, sumF og rekkefølge), tatt etter hver autoSave.
  // Uendrede strenger deles mellom stegene, så minnebruken er lav.
  const UNDO_LIMIT = 50;
  const UNDO_PREFIXES = ['editor_task_', 'editor_forces_', 'editor_relations_', 'editor_sumF_'];
  const undoStack = [];
  let undoPos = -1;
  let restoringUndo = false;

  function captureState(){
    const prev = undoStack[undoPos];
    const items = {};
    (window.tasks || []).forEach(t => {
      UNDO_PREFIXES.forEach(prefix => {
        const key = prefix + t.id;
        let val = localStorage.getItem(key);
        if(val === null && prefix === 'editor_task_') val = JSON.stringify(t);
        if(val === null) return;
        items[key] = (prev && prev.items[key] === val) ? prev.items[key] : val;
      });
    });
    return {
      order: (window.tasks || []).map(t => t.id),
      items,
      currentId: window.currentTask ? window.currentTask.id : null
    };
  }

  function sameState(a, b){
    if(!a || !b || a.order.join('\n') !== b.order.join('\n')) return false;
    const ka = Object.keys(a.items), kb = Object.keys(b.items);
    return ka.length === kb.length && ka.every(k => a.items[k] === b.items[k]);
  }

  function updateUndoButtons(){
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if(u) u.disabled = undoPos <= 0;
    if(r) r.disabled = undoPos >= undoStack.length - 1;
  }

  function recordUndo(force){
    if(restoringUndo) return;
    let state;
    try { state = captureState(); } catch { return; }
    if(!force && undoPos >= 0 && sameState(undoStack[undoPos], state)) return;
    undoStack.length = undoPos + 1;
    undoStack.push(state);
    if(undoStack.length > UNDO_LIMIT) undoStack.shift();
    undoPos = undoStack.length - 1;
    updateUndoButtons();
  }

  function resetUndo(){
    undoStack.length = 0;
    undoPos = -1;
    recordUndo();
  }

  function restoreState(state){
    restoringUndo = true;
    try {
      cancelAutoSave();
      const ids = new Set(state.order);
      (window.tasks || []).forEach(t => ids.add(t.id));
      ids.forEach(id => UNDO_PREFIXES.forEach(prefix => { try { localStorage.removeItem(prefix + id); } catch {} }));
      Object.keys(state.items).forEach(k => { try { localStorage.setItem(k, state.items[k]); } catch {} });
      try {
        localStorage.setItem('editor_taskOrder', JSON.stringify(state.order));
        localStorage.setItem('editor_savedTasks', JSON.stringify(state.order));
      } catch {}
      window.tasks = state.order.map(id => normalizeTaskMeta(JSON.parse(state.items['editor_task_' + id])));
      let idx = state.order.indexOf(state.currentId);
      if(idx < 0) idx = Math.min(window.currentTaskIndex || 0, window.tasks.length - 1);
      if(window.tasks.length) loadTask(idx);
      // loadTask legger 'index' i kø; skriv det med en gang mens vi fortsatt gjenoppretter
      autoSave();
    } finally {
      restoringUndo = false;
    }
    updateUndoButtons();
  }

  // Husk hvilken oppgave som er valgt i gjeldende steg, så angre/gjør om havner på riktig oppgave
  function rememberSelection(){
    if(undoPos >= 0 && window.currentTask) undoStack[undoPos].currentId = window.currentTask.id;
  }
  window.rememberUndoSelection = rememberSelection;
  window.recordUndo = recordUndo;
  window.undo = function(){
    autoSave(); // ventende endring blir eget steg
    rememberSelection();
    if(undoPos <= 0) return;
    undoPos--;
    restoreState(undoStack[undoPos]);
  };

  window.redo = function(){
    autoSave();
    rememberSelection();
    if(undoPos >= undoStack.length - 1) return;
    undoPos++;
    restoreState(undoStack[undoPos]);
  };

  (function setupUndoUI(){
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if(u) u.addEventListener('click', () => window.undo());
    if(r) r.addEventListener('click', () => window.redo());
    document.addEventListener('keydown', (e) => {
      if(!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
      if(!isUndo && !isRedo) return;
      // Tekstfelt har sin egen angre-funksjon
      const el = e.target;
      if(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      e.preventDefault();
      if(isUndo) window.undo(); else window.redo();
    });
  })();

  window.addEventListener('beforeunload', autoSave);
  window.addEventListener('pagehide', autoSave);
  document.addEventListener('visibilitychange', () => { if(document.hidden) autoSave(); });

  // Write current task to localStorage
  function writeTask(){
    if(!window.currentTask) return;
    const taskId = window.currentTask.id;
    try {
      localStorage.setItem(`editor_task_${taskId}`, JSON.stringify(window.currentTask));
      
      // Also save to tasks list so we know it exists
      const savedTasksKey = 'editor_savedTasks';
      let savedTasks = [];
      try {
        const stored = localStorage.getItem(savedTasksKey);
        if(stored) savedTasks = JSON.parse(stored);
      } catch {}
      
      if(!savedTasks.includes(taskId)) {
        savedTasks.push(taskId);
        localStorage.setItem(savedTasksKey, JSON.stringify(savedTasks));
      }
    } catch {}
  }

  // Copy help_lines from the editor textarea into the current task
  function collectHelpLines(){
    if(!window.currentTask) return;
    const textarea = document.getElementById('help-lines-text');
    if(!textarea) return;
    // Tekstfeltet kan vise en annen oppgave enn den gjeldende (f.eks. rett etter bytte); da skal det ikke kopieres inn.
    if(textarea.dataset.taskId !== String(window.currentTask.id)) return;
    window.currentTask.help_lines = textarea.value.split('\n').filter(line => line.trim() !== '');
  }

  // Remove task specs that no longer match any drawn force (e.g. leftovers from typing a name letter by letter)
  window.pruneForceSpecs = function(){
    const task = window.currentTask;
    if(!task || !window.fm) return;
    const keyOf = n => (n || '').toLowerCase().trim();
    const names = { true: new Set(), false: new Set() };
    window.fm.forces.forEach(f => { if(f.name && f.name.trim()) names[f.isExpected !== false].add(keyOf(f.name)); });
    if(Array.isArray(task.expectedForces)) task.expectedForces = task.expectedForces.filter(s => names[true].has(keyOf(s.name)));
    if(Array.isArray(task.initialForces)) task.initialForces = task.initialForces.filter(s => names[false].has(keyOf(s.name)));
  };

  // Write drawn forces of the current task to localStorage
  function writeForces(){
    if(!window.currentTask || !window.fm) return;
    window.fm.forces.forEach(ff => window.syncForceSpec(ff));
    window.pruneForceSpecs();
    const taskKey = `editor_forces_${window.currentTask.id}`;
    
    // Filter out blank forces (only save forces with actual data)
    const nonBlankForces = window.fm.forces.filter(f => {
      const hasAnchor = f.anchor !== null && f.anchor !== undefined;
      const hasArrowBase = f.arrowBase !== null && f.arrowBase !== undefined;
      const hasArrowTip = f.arrowTip !== null && f.arrowTip !== undefined;
      const hasName = f.name && f.name.trim() !== '';
      return hasAnchor || hasArrowBase || hasArrowTip || hasName;
    });
    
    const specs = nonBlankForces.map(f=>(
      {
        anchor: f.anchor ? [f.anchor[0], f.anchor[1]] : null,
        arrowBase: f.arrowBase ? [f.arrowBase[0], f.arrowBase[1]] : null,
        arrowTip: f.arrowTip ? [f.arrowTip[0], f.arrowTip[1]] : null,
        name: f.name || '',
        moveable: f.moveable,
        isExpected: f.isExpected !== false,
      }
    ));
    try{ 
      localStorage.setItem(taskKey, JSON.stringify(specs));
    } catch {}
  }
  
  // Load all saved tasks from localStorage and merge with default TASKS
  function loadSavedTasks(){
    const savedTasksKey = 'editor_savedTasks';
    try {
      const stored = localStorage.getItem(savedTasksKey);
      if(!stored) return;
      
      const savedTaskIds = JSON.parse(stored);
      for(const taskId of savedTaskIds){
        const taskKey = `editor_task_${taskId}`;
        const taskData = localStorage.getItem(taskKey);
        if(!taskData) continue;
        
        try {
          const savedTask = normalizeTaskMeta(JSON.parse(taskData));
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

  // Write task order to localStorage
  function writeTaskOrder(){
    try {
      const taskOrder = window.tasks.map(t => t.id);
      localStorage.setItem('editor_taskOrder', JSON.stringify(taskOrder));
      // Lagrede oppgaver = oppgaver i settet som har egen lagret kopi (slettede faller bort, importerte kommer til)
      const savedTasks = taskOrder.filter(id => localStorage.getItem(`editor_task_${id}`) !== null);
      localStorage.setItem('editor_savedTasks', JSON.stringify(savedTasks));
    } catch {}
  }

  // Load and apply task order from localStorage
  function loadTaskOrder(){
    try {
      const saved = localStorage.getItem('editor_taskOrder');
      if(!saved) return;

      const savedOrder = JSON.parse(saved);
      
      // Create map of all current tasks
      const taskMap = new Map(window.tasks.map(t => [t.id, t]));
      
      // Rebuild tasks array: apply saved order, then append new tasks
      const orderedTasks = [];
      const validIds = []; // Track which IDs from savedOrder are valid
      for(const id of savedOrder){
        if(taskMap.has(id)){
          orderedTasks.push(taskMap.get(id));
          validIds.push(id);
          taskMap.delete(id); // Mark as used
        }
        // Skip IDs that don't exist in current tasks (these are old/renamed IDs)
      }
      
      // Append remaining tasks (new ones, if any)
      for(const task of taskMap.values()){
        orderedTasks.push(task);
      }
      
      // Only update window.tasks if there were changes
      window.tasks = orderedTasks;
      
      // Clean up taskOrder - remove IDs that no longer exist
      // This prevents old IDs from accumulating
      if(validIds.length !== savedOrder.length){
        localStorage.setItem('editor_taskOrder', JSON.stringify(validIds));
      }
    } catch {}
  }
  
  // Populate the scene panel with all scene elements
  // Scene panel functions have been moved to ui.js to avoid duplication.
  // ui.js is loaded before main.js, so those functions take precedence.
  // Do not redefine updateScenePanel here.

  // Scene element creation buttons
  const wA = GRID_STEP * 8;
  const hA = GRID_STEP * 6;
  
  const btnAddRect = document.getElementById('btn-add-rect');
  const btnAddEllipse = document.getElementById('btn-add-ellipse');
  const btnAddSegment = document.getElementById('btn-add-segment');
  const btnAddArrow = document.getElementById('btn-add-arrow');
  const btnAddText = document.getElementById('btn-add-text');
  
  if(btnAddRect){
    btnAddRect.addEventListener('click', ()=>{
      if(!window.currentTask) return;
      const scene = window.currentTask.scene;
      if(!Array.isArray(scene.rects)) scene.rects = [];
      scene.rects.push({
        width: wA,
        height: hA,
        bottomCenter: [DRAW_CENTER[0], DRAW_CENTER[1]],
        angleDeg: 0,
        n_vec: [0, -1],
        t_vec: [1, 0],
        snapping: true
      });
      updateScenePanel();
      markEdited('task');
      window.updateAppState();
    });
  }
  
  if(btnAddEllipse){
    btnAddEllipse.addEventListener('click', ()=>{
      if(!window.currentTask) return;
      const scene = window.currentTask.scene;
      if(!Array.isArray(scene.ellipses)) scene.ellipses = [];
      scene.ellipses.push({
        width: wA,
        height: hA,
        center: [DRAW_CENTER[0], DRAW_CENTER[1]],
        n_vec: [0, -1],
        t_vec: [1, 0],
        snapping: true
      });
      updateScenePanel();
      markEdited('task');
      window.updateAppState();
    });
  }
  
  if(btnAddSegment){
    btnAddSegment.addEventListener('click', ()=>{
      if(!window.currentTask) return;
      const scene = window.currentTask.scene;
      if(!Array.isArray(scene.segments)) scene.segments = [];
      scene.segments.push({
        a: [DRAW_CENTER[0] - wA/2, DRAW_CENTER[1]],
        b: [DRAW_CENTER[0] + wA/2, DRAW_CENTER[1]],
        snapping: false
      });
      updateScenePanel();
      markEdited('task');
      window.updateAppState();
    });
  }
  
  if(btnAddArrow){
    btnAddArrow.addEventListener('click', ()=>{
      if(!window.currentTask) return;
      const scene = window.currentTask.scene;
      if(!Array.isArray(scene.arrows)) scene.arrows = [];
      scene.arrows.push({
        a: [DRAW_CENTER[0] - wA/2, DRAW_CENTER[1]],
        b: [DRAW_CENTER[0] + wA/2, DRAW_CENTER[1]],
        snapping: false
      });
      updateScenePanel();
      markEdited('task');
      window.updateAppState();
    });
  }
  
  if(btnAddText){
    btnAddText.addEventListener('click', ()=>{
      if(!window.currentTask) return;
      const scene = window.currentTask.scene;
      if(!Array.isArray(scene.texts)) scene.texts = [];
      
      // Beregn default posisjon: under forrige tekst-element eller DRAW_CENTER
      let defaultPos = [DRAW_CENTER[0], DRAW_CENTER[1]];
      const textSize = 14;
      const padding = 5;
      
      if(scene.texts.length > 0) {
        // Finn siste tekst-element som ikke er _isShortLines
        for(let i = scene.texts.length - 1; i >= 0; i--) {
          if(!scene.texts[i]._isShortLines) {
            const lastText = scene.texts[i];
            const lastSize = lastText.size || 14;
            defaultPos = [
              lastText.pos[0],
              lastText.pos[1] + lastSize + padding
            ];
            break;
          }
        }
      }
      
      scene.texts.push({
        txt: 'Tekst',
        pos: defaultPos,
        size: textSize,
        align: 'center',
        color: '#222',
        snapping: false
      });
      updateScenePanel();
      markEdited('task');
      window.updateAppState();
    });
  }
  
  // Toggle force between initial and expected
  window.toggleForceType = function(forceIndex){
    if(!window.currentTask || !window.fm || forceIndex < 0 || forceIndex >= window.fm.forces.length) return;
    
    const force = window.fm.forces[forceIndex];
    const isExpected = force.isExpected !== false; // default to expected
    
    // Move force between arrays
    if(isExpected){
      // Move from expected to initial
      window.currentTask.expectedForces = window.currentTask.expectedForces.filter((f, i) => i !== forceIndex);
      if(!window.currentTask.initialForces) window.currentTask.initialForces = [];
      window.currentTask.initialForces.push({ name: force.name });
      force.isExpected = false;
    } else {
      // Move from initial to expected
      window.currentTask.initialForces = window.currentTask.initialForces.filter((f, i) => i !== forceIndex);
      if(!window.currentTask.expectedForces) window.currentTask.expectedForces = [];
      
      // Try to auto-detect best anchor based on force's drawn position
      let anchorSpec = { type: 'point', ref: 'origin', point: 'center' };
      
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
        name: force.name,
        aliases: [force.name.toLowerCase()],
        dir: [0, 1], // default downward (gravity-like)
        anchor: anchorSpec
      });
      force.isExpected = true;
    }
    
    // Save and refresh
    markEdited('forces');
    window.fm.syncInputs(document.getElementById('force-inputs'));
  };

  // Find the task spec (expectedForces / initialForces) that belongs to a drawn force.
  // Expected forces keep their anchor in `anchor`; locked (initial) forces in `anchorSpec`.
  window.getForceSpec = function(force){
    const task = window.currentTask;
    if(!task || !force || !force.name) return null;
    const key = force.name.toLowerCase().trim();
    const isExpected = force.isExpected !== false;
    const list = task[isExpected ? 'expectedForces' : 'initialForces'];
    if(!Array.isArray(list)) return null;
    const spec = list.find(s => s.name && s.name.toLowerCase().trim() === key);
    return spec ? { spec, prop: isExpected ? 'anchor' : 'anchorSpec' } : null;
  };

  // Create/update the task spec for a drawn, named force.
  // opts.reanchor: recompute anchor from the drawn position; opts.redir: recompute direction.
  window.syncForceSpec = function(force, opts = {}){
    const task = window.currentTask;
    if(!task || !force || !force.name || !force.name.trim()) return;
    if(!force.anchor || !force.arrowBase || !force.arrowTip) return;
    const isExpected = force.isExpected !== false;
    const listName = isExpected ? 'expectedForces' : 'initialForces';
    if(!Array.isArray(task[listName])) task[listName] = [];
    let ref = window.getForceSpec(force);
    if(!ref){
      const created = { name: force.name };
      task[listName].push(created);
      ref = { spec: created, prop: isExpected ? 'anchor' : 'anchorSpec' };
    }
    const { spec, prop } = ref;
    if(opts.reanchor || !spec[prop] || !spec[prop].type){
      const best = window.findBestAnchor ? window.findBestAnchor(force.anchor, task, 40) : null;
      if(best && best.type === 'point'){
        spec[prop] = { type: 'point', ref: best.ref, point: best.point };
      } else if(best && best.type === 'segment'){
        spec[prop] = { type: 'segment', ref: best.ref, segment: best.segment };
      } else {
        spec[prop] = { type: 'custom', pos: [force.anchor[0], force.anchor[1]] };
      }
    }
    if(isExpected && (opts.redir || !spec.dir)){
      spec.dir = force.force_dir.map(v => Math.round(v * 1000) / 1000);
    }
  };

  // Setup editor for help_lines text
  window.setupHelpLinesEditor = function setupHelpLinesEditor(){
    const textarea = document.getElementById('help-lines-text');
    if(!textarea) return;
    textarea.dataset.taskId = String(window.currentTask.id);
    
    // Auto-save on input
    textarea.addEventListener('input', () => {
      markEdited('help');
    });
    
    // Auto-save on blur
    textarea.addEventListener('blur', () => {
      markEdited('help');
    });
    
    // Focus on textarea
    textarea.focus();
  };

  // Solution forces removed - use editor.js for editor mode

  // Debug/Cleanup: Analyze localStorage structure for editor mode
  window.analyzeEditorStorage = function() {
    console.group('📋 Editor Mode Storage Analysis');
    
    // Collect all editor_* keys
    const editorKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('editor_')) {
        editorKeys.push(key);
      }
    }
    
    console.log(`Found ${editorKeys.length} editor_* entries in localStorage:`);
    editorKeys.sort().forEach(key => console.log(`  - ${key}`));
    
    // Separate by type
    const taskKeys = editorKeys.filter(k => k.startsWith('editor_task_'));
    const forcesKeys = editorKeys.filter(k => k.startsWith('editor_forces_'));
    const other = editorKeys.filter(k => !k.startsWith('editor_task_') && !k.startsWith('editor_forces_'));
    
    console.log(`\n📦 Breakdown:`);
    console.log(`  Tasks (editor_task_*): ${taskKeys.length}`);
    console.log(`  Forces (editor_forces_*): ${forcesKeys.length}`);
    console.log(`  Other: ${other.length}`, other);
    
    // Check for orphaned forces (forces without matching task)
    console.log(`\n🔍 Orphaned Forces Detection:`);
    const taskIds = new Set(taskKeys.map(k => k.replace('editor_task_', '')));
    const orphanedForces = forcesKeys.filter(k => {
      const forceId = k.replace('editor_forces_', '');
      return !taskIds.has(forceId);
    });
    
    if (orphanedForces.length > 0) {
      console.warn(`  Found ${orphanedForces.length} orphaned forces:`);
      orphanedForces.forEach(key => {
        const forceId = key.replace('editor_forces_', '');
        console.warn(`    - ${key} (orphaned - no matching editor_task_${forceId})`);
      });
    } else {
      console.log(`  ✓ No orphaned forces found`);
    }
    
    // Check for missing forces (tasks without matching forces)
    console.log(`\n🔍 Tasks Without Forces:`);
    const forcesIds = new Set(forcesKeys.map(k => k.replace('editor_forces_', '')));
    const tasksWithoutForces = taskKeys.filter(k => {
      const taskId = k.replace('editor_task_', '');
      return !forcesIds.has(taskId);
    });
    
    if (tasksWithoutForces.length > 0) {
      console.log(`  Found ${tasksWithoutForces.length} tasks without forces:`);
      tasksWithoutForces.forEach(key => {
        const taskId = key.replace('editor_task_', '');
        console.log(`    - ${key} (no editor_forces_${taskId})`);
      });
    }
    
    // Check current task structure
    console.log(`\n📝 Current Tasks Structure:`);
    taskKeys.forEach(key => {
      const taskId = key.replace('editor_task_', '');
      try {
        const taskData = JSON.parse(localStorage.getItem(key));
        console.log(`  ${key}:`);
        console.log(`    - id: "${taskData.id}"`);
        console.log(`    - taskTitle: "${taskData.taskTitle || '(empty)'}"`);
        console.log(`    - taskSubTitle: "${taskData.taskSubTitle || '(empty)'}"`);
        console.log(`    - Has forces key: ${'editor_forces_' + taskData.id in localStorage ? 'YES' : 'NO'}`);
        
        // Check if forces exist at both old and new location
        const oldForcesKey = `editor_forces_${taskId}`;
        const newForcesKey = `editor_forces_${taskData.id}`;
        const oldExists = localStorage.getItem(oldForcesKey) !== null;
        const newExists = localStorage.getItem(newForcesKey) !== null;
        
        if (oldExists || newExists) {
          console.log(`    - Forces locations:`);
          if (oldExists) console.log(`      * Old: ${oldForcesKey} ✓`);
          if (newExists) console.log(`      * New: ${newForcesKey} ✓`);
          if (oldExists && newExists && oldForcesKey !== newForcesKey) {
            console.warn(`      ⚠️  MISMATCH: Forces exist at both locations!`);
          }
        }
      } catch (e) {
        console.error(`    Error parsing ${key}:`, e.message);
      }
    });
    
    // Show forces content
    console.log(`\n⚡ Forces Data:`);
    forcesKeys.forEach(key => {
      try {
        const forcesData = JSON.parse(localStorage.getItem(key));
        console.log(`  ${key}: ${Array.isArray(forcesData) ? forcesData.length + ' forces' : 'invalid'}`);
      } catch (e) {
        console.error(`    Error parsing ${key}:`, e.message);
      }
    });
    
    console.groupEnd();
  };

  // Cleanup: Merge/migrate orphaned old forces to new task IDs
  window.cleanupEditorStorage = function() {
    console.group('🧹 Editor Storage Cleanup');
    
    // Collect all editor_* keys
    const editorKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('editor_')) {
        editorKeys.push(key);
      }
    }
    
    const taskKeys = editorKeys.filter(k => k.startsWith('editor_task_'));
    const forcesKeys = editorKeys.filter(k => k.startsWith('editor_forces_'));
    
    // Load all current tasks with their actual IDs
    const currentTasks = {};
    taskKeys.forEach(key => {
      try {
        const taskData = JSON.parse(localStorage.getItem(key));
        if (taskData && taskData.id) {
          currentTasks[taskData.id] = {
            storageKey: key,
            oldKeyId: key.replace('editor_task_', ''),
            taskData: taskData
          };
        }
      } catch (e) {
        console.error(`Error reading ${key}:`, e.message);
      }
    });
    
    console.log(`Found ${Object.keys(currentTasks).length} valid tasks with current IDs`);
    
    // Helper: Create a signature of scene elements (ignoring text and metadata)
    function getSceneSignature(scene) {
      if (!scene) return null;
      
      const sig = {
        origin: scene.origin ? JSON.stringify(scene.origin) : null,
        plane: scene.plane ? JSON.stringify(scene.plane) : null,
        rects: scene.rects ? JSON.stringify(scene.rects) : null,
        circles: scene.circles ? JSON.stringify(scene.circles) : null,
        ellipses: scene.ellipses ? JSON.stringify(scene.ellipses) : null,
        segments: scene.segments ? JSON.stringify(scene.segments) : null,
        arrows: scene.arrows ? JSON.stringify(scene.arrows) : null,
        // NOTE: Deliberately excluding texts, help_lines, and other metadata
      };
      return JSON.stringify(sig);
    }
    
    // Find duplicate tasks (same scene, different metadata/text)
    const sceneSignatures = {};
    const duplicates = [];
    
    Object.entries(currentTasks).forEach(([id, taskInfo]) => {
      const sig = getSceneSignature(taskInfo.taskData.scene);
      
      if (sig) {
        if (!sceneSignatures[sig]) {
          sceneSignatures[sig] = [];
        }
        sceneSignatures[sig].push({
          id: id,
          storageKey: taskInfo.storageKey,
          taskTitle: taskInfo.taskData.taskTitle || '(empty)',
          taskSubTitle: taskInfo.taskData.taskSubTitle || '(empty)',
          helpLinesCount: (taskInfo.taskData.help_lines || []).length,
          fullData: taskInfo.taskData
        });
      }
    });
    
    // Report duplicates
    Object.entries(sceneSignatures).forEach(([sig, tasks]) => {
      if (tasks.length > 1) {
        duplicates.push(tasks);
      }
    });
    
    console.log(`\n🔀 Duplicate Detection (same scene, different metadata):`);
    if (duplicates.length > 0) {
      console.warn(`Found ${duplicates.length} groups of duplicates:`);
      duplicates.forEach((group, groupIdx) => {
        console.group(`  Group ${groupIdx + 1}: ${group.length} tasks with identical scene`);
        group.forEach((task, idx) => {
          const isFirst = idx === 0;
          console.log(`    ${isFirst ? '✓ KEEP' : '✗ DELETE'}: ${task.storageKey}`);
          console.log(`      ID: ${task.id}`);
          console.log(`      Title: "${task.taskTitle}"`);
          console.log(`      SubTitle: "${task.taskSubTitle}"`);
          console.log(`      Help lines: ${task.helpLinesCount}`);
        });
        console.groupEnd();
      });
    } else {
      console.log(`✓ No duplicates found`);
    }
    
    // Check for orphaned forces
    const forcesToMigrate = [];
    const forcesToDelete = [];
    
    forcesKeys.forEach(forcesKey => {
      const forcesKeyId = forcesKey.replace('editor_forces_', '');
      const hasMatchingTask = Object.values(currentTasks).some(t => t.taskData.id === forcesKeyId);
      
      if (!hasMatchingTask) {
        // This forces entry is orphaned, check if any task has an old ID matching this forces ID
        let foundMatch = false;
        
        Object.entries(currentTasks).forEach(([currentId, taskInfo]) => {
          if (taskInfo.oldKeyId === forcesKeyId && currentId !== forcesKeyId) {
            // Found a task that was migrated to new ID
            foundMatch = true;
            const newForcesKey = `editor_forces_${currentId}`;
            const existingNewForces = localStorage.getItem(newForcesKey);
            
            if (!existingNewForces) {
              // New location doesn't exist, migrate it
              forcesToMigrate.push({
                oldKey: forcesKey,
                newKey: newForcesKey,
                oldId: forcesKeyId,
                newId: currentId,
                taskTitle: taskInfo.taskData.taskTitle
              });
            } else {
              // New location exists, delete old
              forcesToDelete.push(forcesKey);
            }
          }
        });
        
        if (!foundMatch) {
          // Completely orphaned, no matching task at all
          forcesToDelete.push(forcesKey);
        }
      }
    });
    
    // Report migrations needed
    if (forcesToMigrate.length > 0) {
      console.log(`\n🔄 Forces to Migrate:`);
      forcesToMigrate.forEach(item => {
        console.log(`  ${item.oldKey}`);
        console.log(`    → ${item.newKey}`);
        console.log(`    Task: "${item.taskTitle}" (${item.newId})`);
      });
    }
    
    // Report deletions needed
    if (forcesToDelete.length > 0) {
      console.log(`\n🗑️  Forces to Delete (orphaned):`);
      forcesToDelete.forEach(key => {
        const forceId = key.replace('editor_forces_', '');
        console.log(`  ${key} (no matching task found)`);
      });
    }
    
    if (forcesToMigrate.length === 0 && forcesToDelete.length === 0) {
      console.log(`✓ No cleanup needed - storage is clean`);
    }
    
    console.groupEnd();
    
    return {
      taskCount: Object.keys(currentTasks).length,
      duplicateGroups: duplicates.map((group, idx) => ({
        groupIndex: idx + 1,
        sceneTaskCount: group.length,
        tasks: group.map(t => ({
          id: t.id,
          storageKey: t.storageKey,
          taskTitle: t.taskTitle,
          taskSubTitle: t.taskSubTitle,
          helpLinesCount: t.helpLinesCount
        })),
        recommendKeep: group[0],
        recommendDelete: group.slice(1)
      })),
      duplicateCount: duplicates.reduce((sum, g) => sum + g.length - 1, 0),
      toMigrate: forcesToMigrate,
      toDelete: forcesToDelete,
      orphanedForcesCount: forcesToDelete.length + forcesToMigrate.length
    };
  };

  // Execute cleanup: Actually migrate/delete orphaned forces
  window.executeCleanup = function(cleanupReport) {
    if (!cleanupReport) {
      console.log('Run window.cleanupEditorStorage() first to get a report');
      return;
    }
    
    console.group('⚙️  Executing Cleanup');
    
    // Migrate forces to new locations
    cleanupReport.toMigrate.forEach(item => {
      try {
        const forcesData = localStorage.getItem(item.oldKey);
        if (forcesData) {
          localStorage.setItem(item.newKey, forcesData);
          localStorage.removeItem(item.oldKey);
          console.log(`✓ Migrated: ${item.oldKey} → ${item.newKey}`);
        }
      } catch (e) {
        console.error(`✗ Failed to migrate ${item.oldKey}:`, e.message);
      }
    });
    
    // Delete orphaned forces
    cleanupReport.toDelete.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`✓ Deleted: ${key}`);
      } catch (e) {
        console.error(`✗ Failed to delete ${key}:`, e.message);
      }
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`  Migrated: ${cleanupReport.toMigrate.length} forces`);
    console.log(`  Deleted: ${cleanupReport.toDelete.length} orphaned forces`);
    console.log(`  Remaining tasks: ${cleanupReport.taskCount}`);
    
    console.groupEnd();
  };

  // Load saved tasks from localStorage before loading initial task
  migrateLegacyTasks();
  loadSavedTasks();
  
  // Apply saved task order from localStorage
  loadTaskOrder();

  // Load initial task based on persisted index
  (function(){
    let startIdx = 0;
    try {
      const s = localStorage.getItem('editor_currentTaskIndex');
      if(s !== null){
        const n = parseInt(s, 10);
        if(!Number.isNaN(n)) startIdx = n;
      }
    } catch {}
    loadTask(startIdx);
    resetUndo();
  })();

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
   * Checks all possible handles for the element type (origin, plane, rect, ellipse, circle, segment, arrow, text).
   * 
   * @param {Array<number>} pos - The mouse position [x, y] in canvas coordinates
   * @returns {Object|null} Handle info object if a handle is near the position:
   *   {type: string, index: number, handleType: string} 
   *   or null if no handle is near or not in editor mode
   */
  function getSceneHandleAtPos(pos){
    if(!window.selectedSceneElement) return null;
    
    const { type, index } = window.selectedSceneElement;
    const scene = window.currentTask?.scene;
    const tolerance = 8;
    
    // Helper to check if pos is near a handle
    function isNear(hx, hy){
      const dx = pos[0] - hx;
      const dy = pos[1] - hy;
      return Math.sqrt(dx*dx + dy*dy) <= tolerance;
    }
    
    if(type === 'origin' && scene?.origin){
      const [x, y] = scene.origin;
      if(isNear(x, y)) return {type: 'origin', index, handleType: 'center'};
    }
    else if(type === 'plane' && scene?.plane){
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
      
      // Top center (n-direction) - use clamped position for click detection
      const topCenter = [bc[0] + n[0]*h, bc[1] + n[1]*h];
      const clampedTopCenter = window.clampToCanvas(topCenter);
      if(isNear(clampedTopCenter[0], clampedTopCenter[1])) return {type: 'rect', index, handleType: 'topCenter'};
      
      // Bottom right (t-direction) - use clamped position for click detection
      const bottomRight = [bc[0] + t[0]*w/2, bc[1] + t[1]*w/2];
      const clampedBottomRight = window.clampToCanvas(bottomRight);
      if(isNear(clampedBottomRight[0], clampedBottomRight[1])) return {type: 'rect', index, handleType: 'bottomRight'};
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
      
      // Width direction handle (along t_vec) - use clamped position for click detection
      const widthHandle = [cx + t[0]*w/2, cy + t[1]*w/2];
      const clampedWidthHandle = window.clampToCanvas(widthHandle);
      if(isNear(clampedWidthHandle[0], clampedWidthHandle[1])) return {type: 'ellipse', index, handleType: 'width'};
      
      // Height direction handle (along n_vec) - use clamped position for click detection
      const heightHandle = [cx + n[0]*h/2, cy + n[1]*h/2];
      const clampedHeightHandle = window.clampToCanvas(heightHandle);
      if(isNear(clampedHeightHandle[0], clampedHeightHandle[1])) return {type: 'ellipse', index, handleType: 'height'};
    }
    else if(type === 'circle' && scene?.circles?.[index]){
      const circle = scene.circles[index];
      const [cx, cy] = circle.center;
      const r = circle.radius;
      
      // Center
      if(isNear(cx, cy)) return {type: 'circle', index, handleType: 'center'};
      
      // Cardinal radius handles - use clamped positions for click detection
      const clampedRight = window.clampToCanvas([cx + r, cy]);
      const clampedLeft = window.clampToCanvas([cx - r, cy]);
      const clampedDown = window.clampToCanvas([cx, cy + r]);
      const clampedUp = window.clampToCanvas([cx, cy - r]);
      
      if(isNear(clampedRight[0], clampedRight[1])) return {type: 'circle', index, handleType: 'radius'};
      if(isNear(clampedLeft[0], clampedLeft[1])) return {type: 'circle', index, handleType: 'radius'};
      if(isNear(clampedDown[0], clampedDown[1])) return {type: 'circle', index, handleType: 'radius'};
      if(isNear(clampedUp[0], clampedUp[1])) return {type: 'circle', index, handleType: 'radius'};
    }
    else if(type === 'segment' && scene?.segments?.[index]){
      const seg = scene.segments[index];
      // Use clamped positions for click detection (handles are drawn clamped)
      const clampedA = window.clampToCanvas(seg.a);
      const clampedB = window.clampToCanvas(seg.b);
      if(isNear(clampedA[0], clampedA[1])) return {type: 'segment', index, handleType: 'a'};
      if(isNear(clampedB[0], clampedB[1])) return {type: 'segment', index, handleType: 'b'};
    }
    else if(type === 'arrow' && scene?.arrows?.[index]){
      const arrow = scene.arrows[index];
      // Use clamped positions for click detection (handles are drawn clamped)
      const clampedA = window.clampToCanvas(arrow.a);
      const clampedB = window.clampToCanvas(arrow.b);
      if(isNear(clampedA[0], clampedA[1])) return {type: 'arrow', index, handleType: 'a'};
      if(isNear(clampedB[0], clampedB[1])) return {type: 'arrow', index, handleType: 'b'};
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
      // Finn tilhørende spesifikasjon (fasitkraft eller låst kraft) for å sjekke anker-binding
      const ref = window.getForceSpec(force);
      const anchor = ref && ref.spec[ref.prop];
      
      if (!anchor || !anchor.type) return;
      
      // Sjekk om ankeret er knyttet til det flytta scene-elementet
      const isLinkedToElement = (
        anchor.type === 'point' && anchor.ref === `${elementType}${elementIndex}` ||
        anchor.type === 'segment' && anchor.ref === `${elementType}${elementIndex}`
      );
      
      if (isLinkedToElement) {
        // Låste krefter lagrer også koordinater i oppgaven
        if(force.isExpected === false && ref.spec.anchor && Array.isArray(ref.spec.anchor)){
          ['anchor', 'arrowBase', 'arrowTip'].forEach(k => {
            if(Array.isArray(ref.spec[k])){ ref.spec[k][0] += dx; ref.spec[k][1] += dy; }
          });
        }
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
    if(type === 'origin' && scene.origin){
      oldPos = [scene.origin[0], scene.origin[1]];
    } else if(type === 'rect' && scene.rects?.[index]){
      oldPos = [scene.rects[index].bottomCenter[0], scene.rects[index].bottomCenter[1]];
    } else if(type === 'ellipse' && scene.ellipses?.[index]){
      oldPos = [scene.ellipses[index].center[0], scene.ellipses[index].center[1]];
    } else if(type === 'circle' && scene.circles?.[index]){
      oldPos = [scene.circles[index].center[0], scene.circles[index].center[1]];
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
    
    if(type === 'origin'){
      guidelineOrigin = scene.origin;
    } else if(type === 'rect'){
      guidelineOrigin = scene.rects?.[index]?.bottomCenter;
    } else if(type === 'ellipse'){
      guidelineOrigin = scene.ellipses?.[index]?.center;
    } else if(type === 'circle'){
      guidelineOrigin = scene.circles?.[index]?.center;
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
    
    if(type === 'origin' && handleType === 'center' && scene.origin){
      // For center moves, set absolute position rather than using delta
      // This ensures perfect grid alignment
      const clampedPos = window.clampToCanvas(useNewPos);
      scene.origin[0] = clampedPos[0];
      scene.origin[1] = clampedPos[1];
      window.selectedSceneElement._handleStartPos = clampedPos;
      
      // Synkroniser krefter
      if(oldPos){
        const displacement = [useNewPos[0] - oldPos[0], useNewPos[1] - oldPos[1]];
        syncForcesWithSceneElement('origin', 0, displacement);
        oldPos = [useNewPos[0], useNewPos[1]];
      }
    }
    else if(type === 'plane' && scene.plane){
      if(handleType === 'through'){
        // Move plane through point - set absolute position for grid alignment
        const clampedPos = window.clampToCanvas(useNewPos);
        scene.plane.through[0] = clampedPos[0];
        scene.plane.through[1] = clampedPos[1];
        // If dirPoint exists, move it too
        if(scene.plane.dirPoint) {
          scene.plane.dirPoint[0] += snappedDx;
          scene.plane.dirPoint[1] += snappedDy;
        }
        // Save updated task to localStorage
        markEdited('task');
        window.selectedSceneElement._handleStartPos = clampedPos;
      }
      else if(handleType === 'direction'){
        // Update dirPoint and recalculate n_vec from through to dirPoint
        const clampedPos = window.clampToCanvas(useNewPos);
        scene.plane.dirPoint = [clampedPos[0], clampedPos[1]];
        
        const through = scene.plane.through;
        const dirVec = [clampedPos[0] - through[0], clampedPos[1] - through[1]];
        const len = geometry.length(dirVec);
        if(len > 0.01){
          // Normalize to get n_vec
          scene.plane.n_vec = [dirVec[0] / len, dirVec[1] / len];
          // t_vec is perpendicular (90° counter-clockwise in left-hand coords: [-n_y, n_x])
          scene.plane.t_vec = geometry.tangentFromNormal(scene.plane.n_vec);
          
          // Save updated task to localStorage (plane change invalidates old expectedForces)
          markEdited('task');
        }
        window.selectedSceneElement._handleStartPos = clampedPos;
      }
    }
    else if(type === 'ellipse' && handleType === 'center' && scene.ellipses?.[index]){
      const ellipse = scene.ellipses[index];
      // For center moves, set absolute position for grid alignment
      const clampedPos = window.clampToCanvas(useNewPos);
      ellipse.center[0] = clampedPos[0];
      ellipse.center[1] = clampedPos[1];
      window.selectedSceneElement._handleStartPos = clampedPos;
      
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
        const newWidth = newHalfWidth * 2;
        const newT = [widthVec[0] / newHalfWidth, widthVec[1] / newHalfWidth];
        
        ellipse.width = newWidth;
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
        const newHeight = newHalfHeight * 2;
        const newN = [heightVec[0] / newHalfHeight, heightVec[1] / newHalfHeight];
        
        ellipse.height = newHeight;
        ellipse.n_vec = newN;
        // Update t_vec to be perpendicular to n_vec (90° counter-clockwise: [-n[1], n[0]])
        ellipse.t_vec = geometry.tangentFromNormal(newN);
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    }
    else if(type === 'circle' && handleType === 'center' && scene.circles?.[index]){
      const circle = scene.circles[index];
      // For center moves, set absolute position for grid alignment
      const clampedPos = window.clampToCanvas(useNewPos);
      circle.center[0] = clampedPos[0];
      circle.center[1] = clampedPos[1];
      window.selectedSceneElement._handleStartPos = clampedPos;
      
      // Synkroniser krefter
      if(oldPos){
        const displacement = [useNewPos[0] - oldPos[0], useNewPos[1] - oldPos[1]];
        syncForcesWithSceneElement('circle', index, displacement);
        oldPos = [useNewPos[0], useNewPos[1]];
      }
    }
    else if(type === 'text' && handleType === 'center' && scene.texts?.[index]){
      const text = scene.texts[index];
      // For text position, set absolute position for grid alignment
      const clampedPos = window.clampToCanvas(useNewPos);
      text.pos[0] = clampedPos[0];
      text.pos[1] = clampedPos[1];
      window.selectedSceneElement._handleStartPos = clampedPos;
    }
    else if(type === 'segment' && scene.segments?.[index]){
      const segment = scene.segments[index];
      if(handleType === 'a'){
        // Set absolute position for grid alignment
        const clampedPos = window.clampToCanvas(useNewPos);
        segment.a[0] = clampedPos[0];
        segment.a[1] = clampedPos[1];
        window.selectedSceneElement._handleStartPos = clampedPos;
        
        // Synkroniser krefter
        if(oldPos){
          const displacement = [useNewPos[0] - oldPos[0], useNewPos[1] - oldPos[1]];
          syncForcesWithSceneElement('segment', index, displacement);
          oldPos = [useNewPos[0], useNewPos[1]];
        }
      }
      else if(handleType === 'b'){
        // Set absolute position for grid alignment
        const clampedPos = window.clampToCanvas(useNewPos);
        segment.b[0] = clampedPos[0];
        segment.b[1] = clampedPos[1];
        window.selectedSceneElement._handleStartPos = clampedPos;
        // Note: only 'a' is linked to expectedForce anchors, so 'b' doesn't trigger sync
      }
    }
    else if(type === 'arrow' && scene.arrows?.[index]){
      const arrow = scene.arrows[index];
      const clampedPos = window.clampToCanvas(useNewPos);
      if(handleType === 'a'){
        // Set absolute position for grid alignment
        arrow.a[0] = clampedPos[0];
        arrow.a[1] = clampedPos[1];
        window.selectedSceneElement._handleStartPos = clampedPos;
      }
      else if(handleType === 'b'){
        // Set absolute position for grid alignment
        arrow.b[0] = clampedPos[0];
        arrow.b[1] = clampedPos[1];
        window.selectedSceneElement._handleStartPos = clampedPos;
      }
    }
    else if(type === 'rect' && scene.rects?.[index]){
      const rect = scene.rects[index];
      const bc = rect.bottomCenter;
      const t = rect.t_vec || [1, 0];
      const n = rect.n_vec || [0, -1];
      
      if(handleType === 'center'){
        // Move bottom center - set absolute position for grid alignment
        const clampedPos = window.clampToCanvas(useNewPos);
        rect.bottomCenter[0] = clampedPos[0];
        rect.bottomCenter[1] = clampedPos[1];
        window.selectedSceneElement._handleStartPos = clampedPos;
        
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
    markEdited('task');
    if(window.fm){
      window.fm.syncInputs(document.getElementById('force-inputs'));
    }
  }

  canvas.addEventListener('mousemove', (e)=>{
    const pos = getMousePos(e);
    
    // Handle scene element dragging in edit mode
    if(window.draggingHandle){
      moveSceneElement(window.draggingHandle, pos);
      return;
    }
    
    const active = window.fm.forces[window.fm.activeIndex];

    // Only update hover when not interacting (no drawing/dragging)
    const isInteracting = active && (active.drawing || !!active.dragging);
    if(!isInteracting){
      window.fm.updateHover(pos);
      // Also update scene element hover (Step 5)
      updateSceneElementHover(pos);
      // Clear anchor candidates when not dragging
      window.anchorCandidates = null;
      window.anchorHoverIndex = -1;
    } else if(active && active.dragging === 'anchor'){
      // When dragging anchor in editor mode, show all anchor candidates
      // Build anchor candidates if not already built
      if(!window.anchorCandidates){
        window.anchorCandidates = window.buildAnchorCandidates ? window.buildAnchorCandidates(window.currentTask) : [];
      }
      
      // Find closest candidate to current mouse position
      let closestIdx = -1;
      let closestDist = 20; // threshold for highlighting
      window.anchorCandidates.forEach((candidate, idx) => {
        if(!candidate.pos) return;
        const dist = geometry.distance(pos, candidate.pos);
        if(dist < closestDist){
          closestDist = dist;
          closestIdx = idx;
        }
      });
      window.anchorHoverIndex = closestIdx;
      
      // Live update anchor-select dropdown to show the hovered candidate
      const forceIdx = window.fm.activeIndex;
      const anchorSelect = document.querySelector(`#force-inputs .force-anchor-select[data-index="${forceIdx}"]`);
      if(anchorSelect){
        if(closestIdx >= 0 && window.anchorCandidates[closestIdx]){
          // Update dropdown to show hovered candidate
          const candidate = window.anchorCandidates[closestIdx];
          const value = `${candidate.type}:${candidate.ref}:${candidate.point || candidate.segment}`;
          if(anchorSelect.value !== value){
            anchorSelect.value = value;
          }
        } else {
          // No candidate nearby - show custom pos[x,y]
          const customValue = `custom:${Math.round(pos[0])},${Math.round(pos[1])}`;
          if(anchorSelect.value !== customValue){
            anchorSelect.value = customValue;
          }
        }
      }
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

        // Include other forces’ arrowBase/arrowTip as extra snap candidates
        const extraPoints = [];
        if(window.fm && window.fm.forces){
          window.fm.forces.forEach((f)=>{
            if(f===active) return;
            if(f.arrowBase) extraPoints.push([f.arrowBase[0], f.arrowBase[1]]);
            if(f.arrowTip)  extraPoints.push([f.arrowTip[0],  f.arrowTip[1]]);
          });
        }
        const combinedPoints = window.snapPoints ? window.snapPoints.slice() : [];
        Array.prototype.push.apply(combinedPoints, extraPoints);

        const res = snapping.snap(pos, {
          points:combinedPoints,
          gridStep:GRID_STEP,
          origin:baseOrigin,
          axesDir:plane
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
        const res = snapping.snap(usePos, {points:window.snapPoints, gridStep:GRID_STEP, origin:window.DRAW_CENTER, axesDir:plane});
        usePos = res.pos;
        window.snapIndicator = res.source ? {pos:res.pos} : null;
      }
      active.handleMouseMove(usePos, [e.movementX, e.movementY]);
      // After body drag, snap arrowBase to grid and shift arrowTip accordingly
      if(active.dragging==='body' && active.arrowBase){
        const plane = window.currentTask && window.currentTask.scene && window.currentTask.scene.plane;
        const anchorOrigin = active.anchor ? active.anchor : (plane && plane.through ? plane.through : window.DRAW_CENTER);
        const base = active.arrowBase;
        // Include other forces' arrowBase/arrowTip as additional scene points
        const extraPoints = [];
        if(window.fm && window.fm.forces){
          window.fm.forces.forEach((f)=>{
            if(f===active) return;
            if(f.arrowBase) extraPoints.push([f.arrowBase[0], f.arrowBase[1]]);
            if(f.arrowTip) extraPoints.push([f.arrowTip[0], f.arrowTip[1]]);
          });
        }
        const combinedPoints = window.snapPoints ? window.snapPoints.slice() : [];
        Array.prototype.push.apply(combinedPoints, extraPoints);
        // snap arrowBase using guideline-aware snapping with combined points
        const resBase = snapping.snap(base, {points:combinedPoints, gridStep:GRID_STEP, origin:anchorOrigin, axesDir:plane});
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
        const plane = window.currentTask && window.currentTask.scene && window.currentTask.scene.plane;
        let originForGuidelines = (active && active.arrowBase) ? active.arrowBase : window.DRAW_CENTER;
        window.currentGuidelines = snapping.buildGuidelines(originForGuidelines, usePos, plane);
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
    
    // Check if clicking on scene element handle in edit mode
    const handle = isDrawArmed() ? null : getSceneHandleAtPos(pos);
    if(handle){
      window.draggingHandle = handle;
        window.selectedSceneElement._handleStartPos = pos;
        
        // Store the original element origin at drag start (to prevent self-snapping during editing)
        const { type, index } = handle;
        const scene = window.currentTask?.scene;
        if(scene){
          if(type === 'rect' && scene.rects?.[index]){
            const rect = scene.rects[index];
            window.draggingHandle._snapOriginAtDragStart = [rect.bottomCenter[0], rect.bottomCenter[1]];
          } else if(type === 'ellipse' && scene.ellipses?.[index]){
            const ellipse = scene.ellipses[index];
            window.draggingHandle._snapOriginAtDragStart = [ellipse.center[0], ellipse.center[1]];
          } else if(type === 'segment' && scene.segments?.[index]){
            const segment = scene.segments[index];
            window.draggingHandle._snapOriginAtDragStart = [segment.a[0], segment.a[1]];
          } else if(type === 'plane' && scene.plane){
            window.draggingHandle._snapOriginAtDragStart = [scene.plane.through[0], scene.plane.through[1]];
          } else if(type === 'origin' && scene.origin){
            window.draggingHandle._snapOriginAtDragStart = [scene.origin[0], scene.origin[1]];
          }
        }
        
        // Update guidelines for the selected scene element via updateAppState
        window.updateAppState();
        return;
      }
    
    // NEW: ensure hover state reflects this exact click position (user may click without prior mousemove)
    if(window.fm){ window.fm.updateHover(pos); }
    
    // Determine if there's a hovered force (takes priority over scene elements in editor mode)
    let hoveredForceIndex = -1;
    if(window.fm && window.fm.forces){
      for(let i=0;i<window.fm.forces.length;i++){
        if(window.fm.forces[i].hovering){ hoveredForceIndex = i; break; }
      }
    }
    
    // Valgt tom krafttekstboks: klikk starter alltid ny tegning, selv over en eksisterende kraft
    const activeBlank = window.fm && window.fm.forces[window.fm.activeIndex];
    if(activeBlank && !activeBlank.anchor && !activeBlank.arrowBase && !activeBlank.arrowTip){
      hoveredForceIndex = -1;
    }
    
    // In task mode: forces only (no scene element interaction)
    // In editor mode: scene elements take priority when hovered and no force is hovered
    updateSceneElementHover(pos);
    
    // Handle scene element selection only if no force is hovered/dragged
    if(window.hoveredSceneElement && hoveredForceIndex === -1){
      // User clicked on a scene element - select it
      window.selectedSceneElement = {
        type: window.hoveredSceneElement.type,
        index: window.hoveredSceneElement.index
      };
      // Auto-save task
      markEdited('task');
      
      // Expand the scene panel for this element (close others)
      const scenePanel = document.getElementById('scene-items');
      if(scenePanel){
        // Find and deselect all items
        const items = scenePanel.querySelectorAll('.scene-item');
        items.forEach(item => {
          item.classList.remove('selected');
          // Hide arrange buttons when deselected
          const header = item.querySelector('.scene-item-header');
          if(header){
            header.querySelectorAll('.scene-item-arrange-btn').forEach(btn => {
              btn.style.display = 'none';
            });
          }
        });
        
        // Find and expand the matching item
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
      
      // Update panel heights and anchor picker UI
      window.updateAppState();
      return;
    }
    
    // If click is outside draw area, ignore force creation logic
    const inArea = withinForceArea(pos[0], pos[1]);
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
      snapPos = snapping.snap(pos, {points:window.snapPoints, gridStep:GRID_STEP, origin:window.DRAW_CENTER}).pos;
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
    clickPos = snapping.snap(pos, {points:window.snapPoints, gridStep:GRID_STEP, origin:window.DRAW_CENTER}).pos;
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
        np = snapping.snap(pos, {points:window.snapPoints, gridStep:GRID_STEP, origin:window.DRAW_CENTER}).pos;
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
      // Update scene panel to reflect changes
      updateScenePanel();
      // Save task when scene element handle is released
      markEdited('task');
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
      const wasDragging = f.dragging;
      f.handleMouseUp(pos);
      // Keep the task spec (anchor + direction) in step with what was drawn or dragged
      if(wasDrawing || wasDragging === 'anchor' || wasDragging === 'arrowTip'){
        window.syncForceSpec(f, {
          reanchor: wasDrawing || wasDragging === 'anchor',
          redir: wasDrawing || wasDragging === 'arrowTip'
        });
      }
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
    markEdited('forces');
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
        // Save current help_lines if in editor mode
        markEdited('help', 'task');
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
            if(commentLabel) commentLabel.textContent = `Kommentar til oppgave ${taskId}`;
          }
        }
        // Update help panel if it's open
        const helpPanel = document.getElementById('help-panel');
        if(helpPanel && !helpPanel.classList.contains('hidden')){
          const helpContent = document.getElementById('help-content');
          const helpCanvas = document.getElementById('help-canvas');
          const helpTitle = document.getElementById('help-title');
          if(helpTitle) helpTitle.textContent = `Oppgave ${window.currentTask.taskTitle || window.currentTask.id}: ${window.currentTask.title}`;
          if(helpContent && helpCanvas){
            // Show editable version in editor mode
            helpContent.style.display = 'block';
            helpCanvas.style.display = 'none';
            helpContent.innerHTML = '';
            const ta = document.createElement('textarea');
            ta.id = 'help-lines-text';
            ta.className = 'help-lines-editor';
            ta.placeholder = 'Skriv hver linje på en ny rad...';
            ta.value = (window.currentTask.help_lines || []).join('\n');
            helpContent.appendChild(ta);
            setupHelpLinesEditor();
          }
        }
        return;
      }
      if(action === 'prev'){
        // Save current help_lines if in editor mode
        markEdited('help', 'task');
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
            if(commentLabel) commentLabel.textContent = `Kommentar til oppgave ${taskId}`;
          }
        }
        // Update help panel if it's open
        const helpPanel = document.getElementById('help-panel');
        if(helpPanel && !helpPanel.classList.contains('hidden')){
          const helpContent = document.getElementById('help-content');
          const helpCanvas = document.getElementById('help-canvas');
          const helpTitle = document.getElementById('help-title');
          if(helpTitle) helpTitle.textContent = `Oppgave ${window.currentTask.taskTitle || window.currentTask.id}: ${window.currentTask.title}`;
          if(helpContent && helpCanvas){
            // Show editable version in editor mode
            helpContent.style.display = 'block';
            helpCanvas.style.display = 'none';
            helpContent.innerHTML = '';
            const ta = document.createElement('textarea');
            ta.id = 'help-lines-text';
            ta.className = 'help-lines-editor';
            ta.placeholder = 'Skriv hver linje på en ny rad...';
            ta.value = (window.currentTask.help_lines || []).join('\n');
            helpContent.appendChild(ta);
            setupHelpLinesEditor();
          }
        }
        return;
      }
      if(action === 'check'){
        // Cleanup task in editor mode before evaluation
        if(window.cleanupTaskForEvaluation){
          const cleanup = window.cleanupTaskForEvaluation();
          if(cleanup.message){
            console.log('Cleanup messages:', cleanup.message);
          }
        }
        // Validate and save solution forces in editor mode
        if(window.validateSolutionForces){
          window.validateSolutionForces();
          window.saveSolutionForces();
        }
        try{ const rk=`editor_relations_${window.currentTask.id}`; if(pendingStorage.has(rk)){ const pv=pendingStorage.get(rk); if(pv) window.currentTask.relations=JSON.parse(JSON.stringify(pv)); } else { const rr=localStorage.getItem(rk); if(rr) window.currentTask.relations=JSON.parse(rr); } }catch{}
        // Save current forces before evaluating
        markEdited('forces');
        autoSave();
        if(typeof window.runEvaluation === 'function'){
          window.runEvaluation();
        }
        // Update level and user display after evaluation if score is available
        if(window.lastEvaluation && window.lastEvaluation.summary){
          const taskId = window.currentTask.id;
          const score = window.lastEvaluation.summary.finalScore;
          window.taskScores[taskId] = { score, feedback: window.lastEvaluation.lines.map(l=>l.text).join(' | ') };
          markEdited('scores');
          updateUserDisplay();
          updateHelpButton();
        }
        return;
      }
      // Clear feedback for any other toolbar action
      if(action !== 'check'){
        clearFeedback();
      }
      if(action === 'reset'){
        // Reload current task to restore initial state (keep initial forces, clear expected forces)
        autoSave();
        window.snapIndicator = null;
        window.currentGuidelines = null;
        clearFeedback();
        // Remove only expected forces, keep initial forces
        const taskKey = `editor_forces_${window.currentTask.id}`;
        try{
          const savedForces = localStorage.getItem(taskKey);
          if(savedForces){
            const parsed = JSON.parse(savedForces);
            if(Array.isArray(parsed)){
              // Keep only initial forces (isExpected=false or moveable=false)
              const initialForces = parsed.filter(f => {
                let isExpected = f.isExpected;
                if(isExpected === undefined) isExpected = (f.moveable !== false);
                return !isExpected;
              });
              if(initialForces.length){
                queueStorage(taskKey, initialForces);
              } else {
                queueStorage(taskKey, null);
              }
            }
          }
        } catch {}
        // Clear score for this task
        if(window.currentTask && window.taskScores){
          delete window.taskScores[window.currentTask.id];
          markEdited('scores');
        }
        // Now reload, which will use defaults for expected forces and keep initial forces
        loadTask(window.currentTaskIndex || 0);
        return;
      }
      if(action === 'help'){
        const helpPanel = document.getElementById('help-panel');
        if(!helpPanel) { console.warn('❌ helpPanel not found'); return; }
        if(!window.currentTask) { console.warn('❌ currentTask not found'); return; }
        // Show help lines editor in editor mode
        const helpContent = document.getElementById('help-content');
        const helpCanvas = document.getElementById('help-canvas');
        const helpTitle = document.getElementById('help-title');
        console.log('helpContent:', helpContent, 'helpCanvas:', helpCanvas);
        if(!helpContent) { console.warn('❌ helpContent not found'); }
        if(!helpCanvas) { console.warn('❌ helpCanvas not found'); }
        if(helpTitle) helpTitle.textContent = `Oppgave ${window.currentTask.taskTitle || window.currentTask.id}: ${window.currentTask.title}`;
        if(helpContent && helpCanvas) {
          // Show editable version in editor mode
          helpContent.style.display = 'block';
          helpCanvas.style.display = 'none';
          
          // Clear and recreate textarea (avoid innerHTML for form elements)
          helpContent.innerHTML = '';
          const textarea = document.createElement('textarea');
          textarea.id = 'help-lines-text';
          textarea.className = 'help-lines-editor';
          textarea.placeholder = 'Skriv hver linje på en ny rad...';
          const text = (window.currentTask.help_lines && Array.isArray(window.currentTask.help_lines)) 
            ? window.currentTask.help_lines.join('\n') 
            : '';
          textarea.value = text;
          helpContent.appendChild(textarea);
          
          setupHelpLinesEditor();
        } else {
          console.warn('❌ Skipping textarea setup because helpContent or helpCanvas missing');
        }
        helpPanel.classList.remove('hidden');
        return;
      }
      if(action === 'settings'){
        const pnl = document.getElementById('settings-panel');
        if(!pnl) return;
        // Populate controls
        const dbg = document.getElementById('settings-debug');
        const usr = document.getElementById('settings-username');
        const sSnap = document.getElementById('settings-snap');
        const sGuides = document.getElementById('settings-guidelines');
        const sShowForceCoords = document.getElementById('settings-show-force-coordinates');
        const sShowSceneCoords = document.getElementById('settings-show-scene-coordinates');
        const sEditor = document.getElementById('settings-editor');
        const taskComment = document.getElementById('settings-task-comment');
        const commentLabel = document.getElementById('settings-comment-label');
        if(dbg) dbg.checked = !!window.settings.debug;
        if(usr) usr.value = window.settings.username || '';
        if(sSnap) sSnap.checked = !!window.enableSnap;
        if(sGuides) sGuides.checked = !!window.enableGuidelines;
        if(sShowForceCoords) sShowForceCoords.checked = !!window.settings.show_force_coordinates;
        if(sShowSceneCoords) sShowSceneCoords.checked = !!window.settings.show_scene_coordinates;
        if(sEditor) sEditor.checked = true;
        // Load current task comment
        if(window.currentTask && taskComment){
          const taskId = window.currentTask.id;
          const commentText = window.currentTask.comment || (window.taskComments[taskId] && window.taskComments[taskId].comment) || '';
          taskComment.value = commentText;
          if(commentLabel) commentLabel.textContent = `Kommentar til oppgave ${taskId}`;
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
  const sShowSceneCoords = document.getElementById('settings-show-scene-coordinates');
  const sEditor = document.getElementById('settings-editor');
  function persist(){ markEdited('settings'); }
  
  if(dbg){ dbg.addEventListener('change', ()=>{ window.settings.debug = !!dbg.checked; persist(); }); }
  if(usr){ usr.addEventListener('change', ()=>{ window.settings.username = usr.value || 'Isaac Newton'; persist(); updateUserDisplay(); }); }
  if(sSnap){ sSnap.addEventListener('change', ()=>{ window.enableSnap = !!sSnap.checked; }); }
  if(sGuides){ sGuides.addEventListener('change', ()=>{ window.enableGuidelines = !!sGuides.checked; window.updateAppState(); }); }
  if(sShowForceCoords){ sShowForceCoords.addEventListener('change', ()=>{ window.settings.show_force_coordinates = !!sShowForceCoords.checked; persist(); }); }
  if(sShowSceneCoords){ sShowSceneCoords.addEventListener('change', ()=>{ window.settings.show_scene_coordinates = !!sShowSceneCoords.checked; persist(); }); }
  if(sEditor){ 
    sEditor.addEventListener('change', ()=>{ 
      // Editor mode is always on, so don't toggle it
      // (settings for theme/debug/etc)
      window.selectedSceneElement = null;
      window.updateAppState();
    }); 
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
      markEdited('task');
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
      window.tasks.splice(currentIdx + 1, 0, newTask);
      
      // Load the new task (flushes pending edits of the old one first), then save the copy
      loadTask(currentIdx + 1);
      markEdited('task', 'order');
      
      alert(`Oppgave duplikert: "${newTask.title}"`);
    });
  }
  
  if(btnNewTask){
    btnNewTask.addEventListener('click', ()=>{
      // Create a new task from scratch
      const title = prompt('Oppgave-tittel:');
      if(!title) return;
      
      const newTask = {
        id: generateUniqueTaskId(), // Auto-generate unique ID
        taskTitle: title, // Store user-provided title as taskTitle
        title: title,
        category: 'Egendefinert',
        origin: [DRAW_CENTER[0], DRAW_CENTER[1]],
        help_lines: [],
        scene: {
          plane: { angleDeg: 0, through: DRAW_CENTER.slice(), draw: true, snapping: false },
          rects: [],
          ellipses: [],
          circles: [],
          segments: [],
          arrows: [],
          texts: []
        },
        expectedForces: [],
        initialForces: [],
        sumF: {},
        relations: []
      };
      
      // Add to tasks array
      if(!window.tasks) window.tasks = [];
      window.tasks.push(newTask);
      
      // Load the new task, then save it and the updated order
      const newIndex = window.tasks.length - 1;
      loadTask(newIndex);
      markEdited('task', 'order');
      
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
      
      // Ventende lagring gjelder den slettede oppgaven og må ikke gjenopprette den
      cancelAutoSave();
      
      // Remove from task list; autoSave() removes the stored data and updates the order
      window.tasks.splice(taskIndex, 1);
      ['editor_task_', 'editor_forces_', 'editor_relations_', 'editor_sumF_'].forEach(prefix => queueStorage(prefix + taskId, null));
      markEdited('order');
      
      // Load next task or last task
      let nextIdx = taskIndex;
      if(nextIdx >= window.tasks.length) nextIdx = window.tasks.length - 1;
      
      if(nextIdx >= 0){
        loadTask(nextIdx);
      } else {
        // No tasks left - in editor, we still keep the UI visible
        window.currentTask = null;
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
            window.syncForceSpec(f);
            const ref = window.getForceSpec(f);
            const isExpected = f.isExpected !== false;
            
            if(isExpected){
              // Expected forces are exported as specs (anchor object + dir), not coordinates
              if(ref){ expectedForcesFromUI.push(JSON.parse(JSON.stringify(ref.spec))); }
            } else {
              const forceSpec = {
                anchor: [f.anchor[0], f.anchor[1]],
                arrowBase: f.arrowBase ? [f.arrowBase[0], f.arrowBase[1]] : null,
                arrowTip: f.arrowTip ? [f.arrowTip[0], f.arrowTip[1]] : null,
                name: f.name || '',
                moveable: false
              };
              if(ref && ref.spec.anchorSpec){ forceSpec.anchorSpec = JSON.parse(JSON.stringify(ref.spec.anchorSpec)); }
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
          // Only include pos if text is not linked
          if(text.linked) delete clean.pos;
          return clean;
        });
      }
      
      // Add aliases for each expectedForce
      if(task.expectedForces){
        task.expectedForces.forEach(f => {
          if(FORCE_ALIASES[f.name]) f.aliases = FORCE_ALIASES[f.name].slice();
        });
      }
      
      // Add relations from localStorage if present
      const relKey = `editor_relations_${task.id}`;
      const savedRelations = localStorage.getItem(relKey);
      if(savedRelations){
        try{ task.relations = JSON.parse(savedRelations); }catch{}
      }
      
      // Add sumF from localStorage if present
      const sumFKey = `editor_sumF_${task.id}`;
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
      relationsList._relations = undefined; // les alltid på nytt for gjeldende oppgave
      relationsList._sumF = undefined;
      showRelationsEditor();
    });
    relationsCancel.addEventListener('click', ()=>{
      relationsModal.classList.add('hidden');
    });
    relationsSave.addEventListener('click', ()=>{
      saveRelationsEditor();
      relationsModal.classList.add('hidden');
    });
  }

  function showRelationsEditor(){
    if(!window.currentTask || !window.fm) return;
    relationsModal.classList.remove('hidden');
    // Load relations from localStorage or task
    const relKey = `editor_relations_${window.currentTask.id}`;
    let relations = relationsList._relations || [];
    if(relationsList._relations === undefined){
      const savedRelations = localStorage.getItem(relKey);
      if(savedRelations){
        try{ relations = JSON.parse(savedRelations); }catch{}
      } else if(window.currentTask.relations){
        relations = JSON.parse(JSON.stringify(window.currentTask.relations));
      }
    }
    if(relationsList._sumF === undefined){
      const sfKey = `editor_sumF_${window.currentTask.id}`;
      let sf = null;
      try{ const raw = localStorage.getItem(sfKey); if(raw) sf = JSON.parse(raw); }catch{}
      if(pendingStorage.has(sfKey)) sf = pendingStorage.get(sfKey);
      if(!sf) sf = window.currentTask.sumF || {};
      relationsList._sumF = Object.assign({}, sf);
    }
    // List all forces
    const forces = window.fm.forces.filter(f=>f.name);
    // Build UI
    let html = '';
    html += '<div style="margin-bottom:8px;">Legg til eller rediger relasjoner mellom krefter:</div>';
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
        html += `</select>`;
        html += ` <button class="remove-rhs-term" data-term-idx="${termIdx}" style="padding:2px 6px;">Fjern</button>`;
        html += `</div>`;
      });
      html += `<button class="add-rhs-term" style="margin-left:16px; padding:2px 6px;">+ Legg til kraft</button>`;
      html += `</div>`;
      
      html += ` Forhold: <input type="number" step="any" class="ratio-input" value="${rel.ratio}" style="width:60px;" />`;
      html += ` Toleranse: <input type="number" step="any" class="tolerance-input" value="${rel.tol_rel||0.15}" style="width:50px;" />`;
      html += ` <span class="auto-relation" style="color:#888;">(auto: ${autoRelationValue(rel, forces)})</span>`;
      html += ` <button class="remove-relation" data-idx="${idx}">Fjern relasjon</button>`;
      html += '</div>';
    });
    html += '<button id="add-relation" style="margin-top:8px;">+ Ny relasjon</button>';
    const sfv = relationsList._sumF || {};
    html += '<div style="margin-top:14px; padding:8px; border:1px solid #ddd; border-radius:4px;">';
    html += '<div style="font-weight:bold;">Sum av krefter (ΣF)</div>';
    html += '<div style="color:#888; font-size:12px; margin-bottom:6px;">Tom = ingen krav. Brukes bare når oppgaven ikke har relasjoner.</div>';
    [['x','ΣF_x'],['y','ΣF_y'],['n','ΣF_n (normal)'],['t','ΣF_t (tangent)']].forEach(([k,label]) => {
      const v = (typeof sfv[k] === 'number') ? sfv[k] : '';
      html += `<label style="margin-right:10px;">${label} = <input type="number" step="any" class="sumf-input" data-key="${k}" value="${v}" style="width:55px;" /></label>`;
    });
    html += '</div>';
    relationsList.innerHTML = html;
    relationsList.querySelectorAll('.sumf-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value);
        if(Number.isFinite(v)) relationsList._sumF[inp.dataset.key] = v;
        else delete relationsList._sumF[inp.dataset.key];
      });
    });
    
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
      });
    });
    
    // Wire up ratio and tolerance inputs
    relationsList.querySelectorAll('.ratio-input, .tolerance-input').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('.relation-row');
        const idx = parseInt(row.dataset.idx);
        const ratioInput = row.querySelector('.ratio-input');
        const tolInput = row.querySelector('.tolerance-input');
        relations[idx].ratio = parseFloat(ratioInput.value) || 1.0;
        relations[idx].tol_rel = parseFloat(tolInput.value) || 0.15;
      });
    });
    
    const addBtn = relationsList.querySelector('#add-relation');
    if(addBtn){
      addBtn.addEventListener('click', ()=>{
        relations.push({lhs:[],rhs:[],ratio:1.0,tol_rel:0.15});
        showRelationsEditor();
      });
    }
    // Save current relations to modal for later
    relationsList._relations = relations;
  }

  function saveRelationsEditor(){
    if(!window.currentTask || !relationsList._relations) return;
    // Use the cached relations array that's been updated by event listeners
    const relations = relationsList._relations;
    window.currentTask.relations = JSON.parse(JSON.stringify(relations));
    queueStorage(`editor_relations_${window.currentTask.id}`, relations);
    if(relationsList._sumF){
      const sf = Object.assign({}, relationsList._sumF);
      window.currentTask.sumF = sf;
      queueStorage(`editor_sumF_${window.currentTask.id}`, sf);
    }
  }

  function autoRelationValue(rel, forces){
    // Example: sum of LHS force lengths / sum of RHS force lengths
    if(!rel.lhs.length || !rel.rhs.length) return '?';
    function sumLen(arr){
      return arr.map(f=>{
        const ff = forces.find(x=>x.name===f.name);
        return ff && ff.force_len ? ff.force_len : 0;
      }).reduce((a,b)=>a+b,0);
    }
    const lhsSum = sumLen(rel.lhs);
    const rhsSum = sumLen(rel.rhs);
    return rhsSum ? (lhsSum/rhsSum).toFixed(2) : '?';
  }

  // Task order manager modal logic
  const taskOrderModal = document.getElementById('task-order-modal');
  const taskList = document.getElementById('task-order-list');
  const taskOrderSave = document.getElementById('task-order-save');
  const taskOrderCancel = document.getElementById('task-order-cancel');
  
  // Track newly imported tasks (for highlighting)
  let newlyImportedTaskIds = new Set();

  function updateTaskOrderList(){
    if(!taskList) return;
    taskList.innerHTML = '';
    if(!window.tasks || window.tasks.length === 0) return;
    
    // Load saved checkbox state from localStorage
    let savedCheckState = {};
    try {
      const saved = localStorage.getItem('taskset_checkbox_state');
      if (saved) savedCheckState = JSON.parse(saved);
    } catch {}

    window.tasks.forEach((task, idx) => {
      const item = document.createElement('div');
      item.className = 'task-order-item';
      // Highlight newly imported tasks
      if (newlyImportedTaskIds.has(task.id)) {
        item.style.backgroundColor = '#c8e6c9';
      }
      item.draggable = true;
      item.dataset.index = idx;
      item.dataset.taskId = task.id;
      
      // Check if this task should be checked (saved state or newly imported)
      const isChecked = newlyImportedTaskIds.has(task.id) || (savedCheckState[task.id] !== false);
      
      const title = task.taskTitle || task.title || '(Ingen tittel)';
      const subtitle = task.taskSubTitle || task.subTitle || '';
      const category = task.category || '';

      item.innerHTML = `
        <input type="checkbox" class="task-order-checkbox" ${isChecked ? 'checked' : ''} data-task-id="${task.id}" />
        <span class="task-order-handle">⋮⋮</span>
        <span class="task-order-id">(${task.id.slice(-5)})</span>
        <span class="task-order-title">${title}</span>
        <span class="task-order-subtitle">${subtitle}</span>
        <span class="task-order-category">${category}</span>
      `;

      // Drag handlers
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', item.innerHTML);
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', (e) => {
        item.classList.remove('dragging');
        taskList.querySelectorAll('.task-order-item').forEach(el => {
          el.classList.remove('drag-over');
        });
        // Update window.tasks from current DOM order and save
        const items = taskList.querySelectorAll('.task-order-item');
        const newOrder = [];
        items.forEach(item => {
          const taskId = item.dataset.taskId;
          const task = window.tasks.find(t => t.id === taskId);
          if(task) newOrder.push(task);
        });
        window.tasks = newOrder;
        
        // Update currentTaskIndex if the current task moved
        if(window.currentTask && window.currentTaskIndex !== undefined){
          const currentTaskId = window.currentTask.id;
          const newIndex = window.tasks.findIndex(t => t.id === currentTaskId);
          if(newIndex >= 0){
            window.currentTaskIndex = newIndex;
          }
        }
        
        markEdited('order');
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const draggingItem = taskList.querySelector('.dragging');
        if(draggingItem && draggingItem !== item){
          const rect = item.getBoundingClientRect();
          const afterElement = getAfterElement(taskList, e.clientY);
          if(afterElement == null){
            taskList.appendChild(draggingItem);
          } else {
            taskList.insertBefore(draggingItem, afterElement);
          }
        }
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
      });

      // Click handler to load the clicked task
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on checkbox or dragging
        if(e.target.classList.contains('task-order-checkbox') || item.classList.contains('dragging')) {
          return;
        }
        
        const taskId = item.dataset.taskId;
        const taskIndex = window.tasks.findIndex(t => t.id === taskId);
        if(taskIndex >= 0) {
          loadTask(taskIndex);
          closeTaskOrderModal();
        }
      });

      taskList.appendChild(item);
    });
  }

  function getAfterElement(container, y){
    const draggableElements = [...container.querySelectorAll('.task-order-item:not(.dragging)')];
    
    // Find the element where cursor is closest to, returning the element below cursor
    for(let i = 0; i < draggableElements.length; i++){
      const box = draggableElements[i].getBoundingClientRect();
      const midpoint = box.top + box.height / 2;
      
      // If cursor is above this element's midpoint, insert before it
      if(y < midpoint){
        return draggableElements[i];
      }
    }
    
    // Cursor is below all elements, return null (append to end)
    return null;
  }

  // Button to open task order modal
  const btnTaskOrder = document.getElementById('btn-task-order');
  if(btnTaskOrder){
    btnTaskOrder.addEventListener('click', ()=>{
      if(!taskOrderModal) return;
      updateTaskOrderList();
      taskOrderModal.classList.remove('hidden');
    });
  }

  // Expose updateTaskOrderList as global function so ui.js can call it
  window.updateTaskOrderList = updateTaskOrderList;

  // ===== Task Set Management (Åpne/Eksporter/Importer) - integrated in task-order-modal =====
  const tasksetNameInput = document.getElementById('taskset-name');
  const tasksetErrorDiv = document.getElementById('taskset-error');
  const tasksetExportBtn = document.getElementById('taskset-export-btn');
  const tasksetOpenBtn = document.getElementById('taskset-open-btn');
  const tasksetImportBtn = document.getElementById('taskset-import-btn');
  const tasksetFileInput = document.getElementById('taskset-file-input');
  const tasksetResultDiv = document.getElementById('taskset-result');
  const tasksetReportDiv = document.getElementById('taskset-report');
  const tasksetOpenModal = document.getElementById('taskset-open-modal');
  const tasksetList = document.getElementById('taskset-list');
  const tasksetOpenConfirm = document.getElementById('taskset-open-confirm');
  const tasksetOpenCancel = document.getElementById('taskset-open-cancel');

  // Validate taskset name
  function validateTasksetName(name) {
    if (!name || name.trim().length === 0) {
      return { valid: false, error: 'Navn kan ikke være tomt' };
    }
    if (name.length > 50) {
      return { valid: false, error: 'Navn kan maks være 50 tegn' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return { valid: false, error: 'Kun bokstaver, tall og underscore tillatt' };
    }
    return { valid: true, error: '' };
  }

  // Get selected task IDs from checkboxes in task order list
  function getSelectedTaskIds() {
    const checkboxes = (taskOrderModal ? taskOrderModal.querySelectorAll('.task-order-checkbox:checked') : []);
    const selectedIds = [];
    checkboxes.forEach(cb => {
      const taskId = cb.dataset.taskId;
      if (taskId) selectedIds.push(taskId);
    });
    return selectedIds;
  }

  // Get task order from task order list
  function getTaskOrderFromList() {
    if (!taskOrderModal) return [];
    const items = taskOrderModal.querySelectorAll('.task-order-item');
    const order = [];
    items.forEach(item => {
      const taskId = item.dataset.taskId;
      if (taskId) order.push(taskId);
    });
    return order;
  }

  // ===== ÅPNE: Hent et oppgavesett som ligger på nettsiden =====
  // oppgavesett.json er en liste over tilgjengelige sett: [{ "name": "...", "file": "..." }]
  const TASKSET_MANIFEST = 'oppgavesett.json';

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function showTasksetError(msg){
    tasksetErrorDiv.textContent = msg;
    tasksetErrorDiv.style.display = 'block';
  }

  async function fetchJson(url){
    const res = await fetch(url, { cache: 'no-cache' });
    if(!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }

  // Godtar eksportfil ({tasks:[...]}), ren liste, og backup-filen (editor_task_* i localStorage)
  function extractTasks(data){
    if(Array.isArray(data)) return data;
    if(data && Array.isArray(data.tasks)) return data.tasks;
    if(data && data.localStorage && typeof data.localStorage === 'object'){
      const ls = data.localStorage;
      let order = [];
      try { order = JSON.parse(ls.editor_taskOrder || '[]'); } catch {}
      const rank = id => { const i = order.indexOf(id); return i < 0 ? Infinity : i; };
      const ids = Object.keys(ls)
        .filter(k => k.startsWith('editor_task_') && !k.startsWith('editor_task_lock_'))
        .map(k => k.slice('editor_task_'.length))
        .sort((a, b) => rank(a) - rank(b));
      const tasks = [];
      ids.forEach(id => {
        try { const t = JSON.parse(ls['editor_task_' + id]); if(t && t.id) tasks.push(t); } catch {}
      });
      return tasks;
    }
    throw new Error('Ukjent filformat – fant ingen oppgaver');
  }

  if (tasksetOpenBtn) {
    tasksetOpenBtn.addEventListener('click', async () => {
      tasksetErrorDiv.style.display = 'none';
      let sets;
      try {
        sets = await fetchJson(TASKSET_MANIFEST);
      } catch (err) {
        showTasksetError('Kunne ikke hente oppgavesett fra nettsiden (' + err.message + '). Det virker ikke fra en lokal fil (file://).');
        return;
      }
      if (!Array.isArray(sets) || sets.length === 0) {
        showTasksetError('Ingen oppgavesett er publisert på nettsiden.');
        return;
      }
      tasksetList.innerHTML = '';
      sets.forEach((s, idx) => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex; align-items:center; padding:8px; border-bottom:1px solid #eee; cursor:pointer;';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'taskset-select';
        radio.value = String(idx);
        radio.checked = idx === 0;
        radio.style.marginRight = '8px';
        const strong = document.createElement('strong');
        strong.textContent = s.name || s.file;
        label.appendChild(radio);
        label.appendChild(strong);
        tasksetList.appendChild(label);
      });
      tasksetOpenModal._sets = sets;
      tasksetOpenModal.classList.remove('hidden');
    });
  }

  if (tasksetOpenConfirm) {
    tasksetOpenConfirm.addEventListener('click', async () => {
      const selected = tasksetList.querySelector('input[name="taskset-select"]:checked');
      const set = selected && tasksetOpenModal._sets && tasksetOpenModal._sets[Number(selected.value)];
      if (!set) return;
      tasksetOpenModal.classList.add('hidden');
      try {
        const data = await fetchJson(set.file);
        await importTasks(extractTasks(data), set.name || set.file);
      } catch (err) {
        showTasksetError('Feil ved åpning av oppgavesett: ' + err.message);
      }
    });
  }

  if (tasksetOpenCancel) {
    tasksetOpenCancel.addEventListener('click', () => {
      tasksetOpenModal.classList.add('hidden');
    });
  }

  // ===== EKSPORTER: Export full task objects to JSON file =====
  if (tasksetExportBtn) {
    tasksetExportBtn.addEventListener('click', () => {
      autoSave();
      const selectedIds = getSelectedTaskIds();
      if (selectedIds.length === 0) {
        tasksetResultDiv.style.display = 'block';
        tasksetReportDiv.innerHTML = '<div class="taskset-report-item skipped">⏭️ Ingen oppgaver valgt for eksport</div>';
        return;
      }

      // Build full task objects WITHOUT forces (only task structure and initialForces)
      const tasksToExport = [];
      selectedIds.forEach(taskId => {
        const task = window.tasks.find(t => t.id === taskId);
        if (task) {
          // Deep clone task - do NOT include any drawn forces
          const taskClone = JSON.parse(JSON.stringify(task));
          // Forces are intentionally NOT included in export
          // Players start with only initialForces, no pre-drawn user forces
          
          // Merge help_lines from editor localStorage (if modified)
          const editorTaskKey = `editor_task_${taskId}`;
          try {
            const savedTask = localStorage.getItem(editorTaskKey);
            if (savedTask) {
              const parsed = JSON.parse(savedTask);
              // Copy help_lines if it exists and is an array (even if empty)
              if (Array.isArray(parsed.help_lines)) {
                taskClone.help_lines = parsed.help_lines;
              }
            }
          } catch {}

          // Relasjoner og ΣF redigeres i egne nøkler; tegnede låste krefter (med lengde) ligger i editor_forces_
          try {
            const rel = localStorage.getItem(`editor_relations_${taskId}`);
            if (rel) taskClone.relations = JSON.parse(rel);
            const sf = localStorage.getItem(`editor_sumF_${taskId}`);
            if (sf) taskClone.sumF = JSON.parse(sf);
            const drawn = JSON.parse(localStorage.getItem(`editor_forces_${taskId}`) || 'null');
            if (Array.isArray(drawn)) {
              const oldInitial = Array.isArray(taskClone.initialForces) ? taskClone.initialForces : [];
              const locked = drawn.filter(f => f.isExpected === false && f.name && f.anchor && f.arrowBase && f.arrowTip);
              if (locked.length || oldInitial.length === 0) {
                taskClone.initialForces = locked.map(f => {
                  const old = oldInitial.find(o => o.name && o.name.toLowerCase().trim() === f.name.toLowerCase().trim());
                  const spec = { name: f.name, anchor: f.anchor, arrowBase: f.arrowBase, arrowTip: f.arrowTip, moveable: false };
                  if (old && old.anchorSpec) spec.anchorSpec = old.anchorSpec;
                  return spec;
                });
              }
              // Fjern gamle spesifikasjoner uten tilhørende tegnet kraft (rester fra navn skrevet bokstav for bokstav)
              const nameKey = n => (n || '').toLowerCase().trim();
              const drawnNames = isExp => new Set(drawn.filter(f => f.name && (f.isExpected !== false) === isExp).map(f => nameKey(f.name)));
              const expNames = drawnNames(true);
              if (expNames.size) taskClone.expectedForces = (taskClone.expectedForces || []).filter(s => expNames.has(nameKey(s.name)));
              // Den tegnede fasitkraften lagres ved siden av spesifikasjonen (index.html ignorerer feltet)
              (taskClone.expectedForces || []).forEach(spec => {
                const d = drawn.find(f => f.isExpected !== false && f.name && spec.name && f.name.toLowerCase().trim() === spec.name.toLowerCase().trim() && f.anchor && f.arrowBase && f.arrowTip);
                if (d) spec.drawn = { anchor: d.anchor, arrowBase: d.arrowBase, arrowTip: d.arrowTip };
              });
            }
          } catch {}
          
          // Remove comments before export (they are developer notes, not part of task spec)
          delete taskClone.comment;
          
          tasksToExport.push(taskClone);
        }
      });

      // Build export data
      const exportData = {
        tasks: tasksToExport,
        metadata: {
          name: tasksetNameInput.value.trim() || 'taskset',
          exported: new Date().toISOString(),
          count: tasksToExport.length
        }
      };

      // Download as JSON file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `taskset_${exportData.metadata.name}_${timestamp}.json`;
      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Show success
      tasksetResultDiv.style.display = 'block';
      tasksetReportDiv.innerHTML = `<div class="taskset-report-item imported">✅ Eksportert ${tasksToExport.length} oppgaver til "${filename}"</div>`;
    });
  }

  // ===== IMPORTER: Les oppgaver fra lokal fil =====
  if (tasksetImportBtn) {
    tasksetImportBtn.addEventListener('click', () => {
      tasksetFileInput.click();
    });
  }

  if (tasksetFileInput) {
    tasksetFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        tasksetErrorDiv.style.display = 'none';
        try {
          await importTasks(extractTasks(JSON.parse(event.target.result)), file.name);
        } catch (err) {
          showTasksetError('Feil ved lesing av fil: ' + err.message);
        }
        tasksetFileInput.value = '';
      };
      reader.onerror = () => {
        showTasksetError('Kunne ikke lese filen');
        tasksetFileInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  function newTaskId(){
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  // Spør hva som skal skje når en importert oppgave har samme id som en eksisterende
  function askConflict(incoming, existing){
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal';
      const box = document.createElement('div');
      box.className = 'modal-content';
      const title = (t) => escapeHtml(t.taskTitle || t.title || t.id);
      box.innerHTML = `
        <h2 style="font-size:16px; margin:0 0 12px 0;">Oppgaven finnes allerede</h2>
        <p style="font-size:13px; margin:0 0 8px 0;">Eksisterende: <strong>${title(existing)}</strong><br>Importert: <strong>${title(incoming)}</strong></p>
        <label style="display:block; font-size:13px; margin-bottom:12px;"><input type="checkbox" id="merge-all"> Bruk samme valg for alle like oppgaver</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;"></div>`;
      const row = box.querySelector('div');
      [['keep', 'Behold gammel', '#888'], ['replace', 'Erstatt', '#FF9800'], ['renew', 'Ny id (behold begge)', '#4CAF50']].forEach(([choice, text, color]) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `padding:8px 14px; background:${color}; color:white; border:none; border-radius:4px; cursor:pointer;`;
        btn.addEventListener('click', () => {
          const all = box.querySelector('#merge-all').checked;
          overlay.remove();
          resolve({ choice, all });
        });
        row.appendChild(btn);
      });
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  // Slår importerte oppgaver sammen med de eksisterende. Nye og erstattede oppgaver havner sist i listen.
  async function importTasks(incoming, sourceName){
    autoSave(); // lagre ventende redigeringer først
    const counts = { added: 0, kept: 0, replaced: 0, renewed: 0, invalid: 0 };
    const currentId = window.currentTask && window.currentTask.id;
    let currentReplaced = false;
    let applyAll = null;
    const touched = [];

    for (const raw of incoming) {
      if (!raw || typeof raw !== 'object' || !raw.id) { counts.invalid++; continue; }
      const task = JSON.parse(JSON.stringify(raw));
      const existingIdx = window.tasks.findIndex(t => t.id === task.id);
      if (existingIdx >= 0) {
        let choice = applyAll;
        if (!choice) {
          const ans = await askConflict(task, window.tasks[existingIdx]);
          choice = ans.choice;
          if (ans.all) applyAll = choice;
        }
        if (choice === 'keep') { counts.kept++; continue; }
        if (choice === 'replace') {
          window.tasks.splice(existingIdx, 1);
          ['editor_forces_', 'editor_relations_', 'editor_sumF_'].forEach(p => queueStorage(p + task.id, null));
          if (task.id === currentId) currentReplaced = true;
          counts.replaced++;
        } else {
          task.id = newTaskId();
          counts.renewed++;
        }
      } else {
        counts.added++;
      }
      if (task._forces) {
        queueStorage(`editor_forces_${task.id}`, task._forces);
        delete task._forces;
      }
      const normalized = normalizeTaskMeta(task);
      queueStorage(`editor_task_${normalized.id}`, normalized);
      window.tasks.push(normalized);
      touched.push(normalized.id);
    }

    markEdited('order');
    autoSave();

    // Rekkefølgen kan ha endret seg når en oppgave ble erstattet
    const idx = window.tasks.findIndex(t => t.id === currentId);
    if (!window.currentTask && window.tasks.length) {
      loadTask(0); // tom editor: åpne første oppgave
    } else if (currentReplaced && idx >= 0) {
      loadTask(idx);
    } else if (idx >= 0) {
      window.currentTaskIndex = idx;
      markEdited('index');
    }

    newlyImportedTaskIds = new Set(touched);
    updateTaskOrderList();

    const line = (n, text) => n ? `<div>${n} ${text}</div>` : '';
    tasksetReportDiv.innerHTML = `
      <div style="background:#fff3cd; padding:12px; border:2px solid #ffc107; border-radius:4px; margin-bottom:12px; font-size:13px; line-height:1.6;">
        <strong>Importert fra ${escapeHtml(sourceName)}</strong> (nye og endrede oppgaver er markert grønt)
        ${line(counts.added, 'nye oppgaver')}
        ${line(counts.replaced, 'erstattet')}
        ${line(counts.renewed, 'lagt til med ny id')}
        ${line(counts.kept, 'beholdt gammel versjon')}
        ${line(counts.invalid, 'hoppet over (mangler id)')}
      </div>`;
    tasksetResultDiv.style.display = 'block';
  }

  const taskOrderSelectAll = document.getElementById('task-order-select-all');
  if(taskOrderSelectAll){
    taskOrderSelectAll.addEventListener('click', ()=>{
      const checkboxes = taskList.querySelectorAll('.task-order-checkbox');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      
      // Toggle all checkboxes
      checkboxes.forEach(cb => {
        cb.checked = !allChecked;
      });
      
      // Update button icon based on new state
      const newAllChecked = Array.from(checkboxes).every(cb => cb.checked);
      taskOrderSelectAll.textContent = newAllChecked ? '✅' : '❌';
    });
  }

  // Removed taskOrderSave and taskOrderCancel - only close button remains
  // Auto-save happens after: import, open operations, and drag-drop
  
  // Helper function to close task order modal
  function closeTaskOrderModal() {
    // Hide import results
    if (tasksetResultDiv) tasksetResultDiv.style.display = 'none';
    // Clear newly imported highlight
    newlyImportedTaskIds.clear();
    // Close modal
    if (taskOrderModal) taskOrderModal.classList.add('hidden');
  }
  
  // Close button
  const taskOrderClose = document.getElementById('task-order-close');
  if (taskOrderClose) {
    taskOrderClose.addEventListener('click', closeTaskOrderModal);
  }
  
  // Close on Esc key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && taskOrderModal && !taskOrderModal.classList.contains('hidden')) {
      closeTaskOrderModal();
    }
  });
  
  // Close on click outside modal
  if (taskOrderModal) {
    taskOrderModal.addEventListener('click', (e) => {
      if (e.target === taskOrderModal) {
        closeTaskOrderModal();
      }
    });
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
        try{ localStorage.removeItem(`editor_task_lock_${taskId}`); } catch {}
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
      autoSave();
      const backup = {
        settings: window.settings,
        taskScores: window.taskScores,
        // Comments are now part of task.comment, not stored separately
        timestamp: new Date().toISOString(),
        currentTaskIndex: (typeof window.currentTaskIndex === 'number') ? window.currentTaskIndex : 0,
        localStorage: {}
      };
      
      // Save ALL localStorage keys with editor_ prefix
      for(let i = 0; i < localStorage.length; i++){
        const key = localStorage.key(i);
        if(key && key.startsWith('editor_')){
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
      
      // Generate filename: backup_<sanitized_username>_<timestamp yyyy_mm_dd_hh_mm>
      const username = (window.settings.username || 'backup').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
      const now = new Date();
      const timestamp = `${now.getFullYear()}_${String(now.getMonth()+1).padStart(2,'0')}_${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}_${String(now.getMinutes()).padStart(2,'0')}`;
      a.download = `backup_${username}_${timestamp}.json`;
      
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
      reader.onload = (evt)=>{
        try{
          const backup = JSON.parse(evt.target?.result || '{}');
          if(backup.settings){ window.settings = { ...window.settings, ...backup.settings }; }
          if(backup.taskScores){ window.taskScores = backup.taskScores; }
          // Comments are now restored from task.comment in localStorage keys
          
          // Restore all localStorage keys
          autoSave(); // gjeldende tilstand blir steget det angres til
          window.rememberUndoSelection();
          cancelAutoSave();
          if(backup.localStorage){
            for(const key in backup.localStorage){
              try{
                localStorage.setItem(key, backup.localStorage[key]);
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
            try { localStorage.setItem('editor_currentTaskIndex', String(window.currentTaskIndex)); } catch {}
          }
          
          // Persist settings
          try{ localStorage.setItem('editor_settings', JSON.stringify(window.settings)); } catch {}
          try{ localStorage.setItem('editor_taskScores', JSON.stringify(window.taskScores)); } catch {}
          try{ localStorage.setItem('editor_taskComments', JSON.stringify(window.taskComments)); } catch {}
          // Update UI
          updateUserDisplay();
          if(usr) usr.value = window.settings.username || '';
          if(dbg) dbg.checked = !!window.settings.debug;
          alert('Innstillinger gjenopprettet!');
          // Reload current task to reflect restored forces
          if(typeof window.currentTaskIndex === 'number'){
            loadTask(window.currentTaskIndex);
          }
          recordUndo(true);
        } catch (err) {
          alert('Feil ved lesing av backup: ' + err.message);
        }
      };
      reader.readAsText(file);
      // Reset file input
      e.target.value = '';
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
    if(!window.tasks) return;
    if(!confirm('Slette alle lokale data og starte på nytt?')) return;
    autoSave(); // gjeldende tilstand blir steget det angres til
    window.rememberUndoSelection();
    cancelAutoSave();
    // Remove ALL editor_* localStorage keys (comprehensive cleanup)
    const keysToRemove = [];
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && key.startsWith('editor_')){
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
    recordUndo(true);
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
    // Update scene panel to reflect new task
    updateScenePanel();
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

