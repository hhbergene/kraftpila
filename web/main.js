// Tegne Krefter JS Port - Step 1 + Step 5 (bare knapper)
// Fallback uten ES-moduler slik at fil kan åpnes direkte via file://.
// Senere kan vi gå tilbake til type="module" når vi bruker lokal server.

(function(){
    // Predefined force aliases (extend as needed)
    const FORCE_ALIASES = {
      G: ['g','ga','tyngde','fg','G'],
      N: ['n','na','normalkraft','r','fn','N'],
      F: ['f','fa','kraft','applied','F'],
      R: ['r','ra','friksjon','fr','R'],
      N_B: ['nb*','n*','nb\'','n\'','b','nba','nab','N_B']
      // Add more as needed
    };
  // ===== Konstanter (fra utils/settings.py) =====
  window.WIDTH = 1000;
  window.HEIGHT = 640;
  window.GRID_STEP = 20;
  window.DRAW_CENTER = [500, 320 + 20];  // [WIDTH/2, HEIGHT/2 + GRID_STEP]
  window.BG_COLOR = '#f0f0f0'; // (240,240,240)
  window.GRID_COLOR = '#dcdcdc'; // (220,220,220)

  // ===== Canvas init =====
  const canvas = document.getElementById('app-canvas');
  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext('2d');

  function clear() {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
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
      const n = t.n_vec;
      const len = Math.hypot(n[0], n[1]) || 1;
      const nn = [ n[0]/len, n[1]/len ];
      const tv = [ -nn[1], nn[0] ];
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
      drawScene(ctx, window.currentTask);
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
    // Draw test forces
    if(window.fm){
      window.fm.drawAll(ctx);
    }
    // Draw selection handles for selected scene element
    if(window.selectedSceneElement && window.editorMode){
      drawSceneElementHandles(ctx, window.selectedSceneElement);
    }
    requestAnimationFrame(frame);
  }
  
  // Draw handles for selected scene element
  function drawSceneElementHandles(ctx, selection){
    if(!selection || !window.currentTask) return;
    
    const { type, index, obj } = selection;
    const scene = window.currentTask.scene;
    const handleRadius = 5;
    
    function drawHandle(x, y) {
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.arc(x, y, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Draw coordinates if show_scene_coordinates is on
      if(window.settings?.show_scene_coordinates){
        // Cartesian coordinates (negated y)
        const cartX = Math.round(x);
        const cartY = -Math.round(y);
        const coordStr = `(${cartX},${cartY})`;
        
        ctx.fillStyle = '#000';
        ctx.font = '12px Segoe UI, Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(coordStr, x + handleRadius + 6, y - 8);
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
    else if(type === 'circle' && scene.circles && scene.circles[index]){
      const circle = scene.circles[index];
      const [cx, cy] = circle.center;
      const r = circle.radius;
      
      // Center and 4 cardinal points
      drawHandle(cx, cy);
      drawHandle(cx + r, cy);
      drawHandle(cx - r, cy);
      drawHandle(cx, cy + r);
      drawHandle(cx, cy - r);
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
      const [x, y] = text.pos;
      drawHandle(x, y);
    } 
    else if(type === 'text' && scene.texts && scene.texts[index]){
      const text = scene.texts[index];
      const [x, y] = text.pos;
      drawHandle(x, y);
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

  const ICONS = {
    snap: '🧲', guidelines: '📐', grid_off: '⊞', grid_on: '◻', prev: '⬅', next: '➡', help: '❓', check: '✅', reset: '🔄', settings: '⚙'
  };
  let gridOn = true; // starter som på

  // Ikon: viser fylte ruter ◻ når grid er PÅ, tomt ⊞ når grid er AV
  function updateGridIcon() {
    const el = document.getElementById('btn-grid');
    if (!el) return;
    const oldImg = el.querySelector('img');
    if (oldImg) oldImg.remove();
    const sym = gridOn ? ICONS.grid_off : ICONS.grid_on;
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
        const url = makeIconPNG(ICONS[key]);
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
  // Initialize editor mode UI based on saved state
  updateEditorMode();
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
  // Load persisted settings
  try {
    const raw = localStorage.getItem('tk_settings');
    if(raw){ const s = JSON.parse(raw); if(typeof s.debug==='boolean') window.settings.debug=s.debug; if(typeof s.username==='string') window.settings.username=s.username; if(typeof s.show_force_coordinates==='boolean') window.settings.show_force_coordinates=s.show_force_coordinates; if(typeof s.show_scene_coordinates==='boolean') window.settings.show_scene_coordinates=s.show_scene_coordinates; }
  } catch {}
  // Editor mode state (persisted, default OFF)
  window.editorMode = false;
  try {
    const raw = localStorage.getItem('tk_editorMode');
    if(raw !== null){ window.editorMode = JSON.parse(raw); }
  } catch {}
  // Show editor panels if edit mode was loaded as enabled
  updateEditorMode();
  window.taskScores = {};
  try {
    const raw = localStorage.getItem('tk_taskScores');
    if(raw){ window.taskScores = JSON.parse(raw); }
  } catch {}
  // Task comments: taskId -> { comment: string }
  window.taskComments = {};
  try {
    const raw = localStorage.getItem('tk_taskComments');
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
    window.fm.setActive = function(i){
      origSetActive(i);
      // Sync for å sikre at raden finnes i DOM før fokus
      window.fm.syncInputs(inputsContainer);
      ensureInputMeta();
      focusInputFor(i);
      updateDeleteForceButtonVisibility();
    };
  }
  wireFocusToSetActive();

  // Update delete force button visibility
  // ===== Feedback panel helpers =====
  function clearHighlights(){ if(window.fm){ window.fm.forces.forEach(f=> f.checkHighlight=false); } }
  function applyHighlightsFor(indices){ clearHighlights(); if(!indices) return; indices.forEach(idx=>{ const f=window.fm.forces[idx]; if(f) f.checkHighlight=true; }); }
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
      return;
    }
    
    // Show navigation if we have lines
    if(navEl) navEl.style.display = 'flex';
    const line = feedback_lines[index];
    if(textEl) textEl.textContent = line.text;
    if(countEl) countEl.textContent = `${index+1} / ${feedback_lines.length}`;
    applyHighlightsFor(line.indices || []);
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
    clearHighlights();
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

  // ===== Debug Modal =====
  window.debugLog = [];
  window.addDebugLog = function(msg){
    if(!window.debugLog) window.debugLog = [];
    const timestamp = new Date().toLocaleTimeString();
    const fullMsg = `[${timestamp}] ${msg}`;
    window.debugLog.push(fullMsg);
    
    const debugContent = document.getElementById('debug-content');
    if(debugContent){
      debugContent.textContent = window.debugLog.join('\n');
      debugContent.scrollTop = debugContent.scrollHeight; // auto-scroll to bottom
    }
    
    // Show debug modal if debug mode is on
    if(window.settings && window.settings.debug){
      const debugModal = document.getElementById('debug-modal');
      if(debugModal) debugModal.classList.remove('hidden');
    }
  };
  
  // Debug modal close button
  document.getElementById('debug-close').addEventListener('click', ()=>{
    const debugModal = document.getElementById('debug-modal');
    if(debugModal) debugModal.classList.add('hidden');
  });
  
  // Clear debug log
  document.getElementById('debug-clear').addEventListener('click', ()=>{
    window.debugLog = [];
    const debugContent = document.getElementById('debug-content');
    if(debugContent) debugContent.textContent = '';
  });
  
  // Copy debug log
  document.getElementById('debug-copy').addEventListener('click', ()=>{
    const text = window.debugLog.join('\n');
    navigator.clipboard.writeText(text).then(()=>{
      alert('Debug output kopiert til clipboard');
    }).catch(err=>{
      console.error('Kunne ikke kopiere:', err);
    });
  });

  // ===== Load initial task (Task 1) =====
  function seedInitialForces(task){
    if(!task || !task.initialForces) return;
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

  function updateHelpButton(){
    const helpBtn = document.getElementById('btn-help');
    if(helpBtn && window.currentTask){
      const span = helpBtn.querySelector('span');
      if(span){
        let btnText = 'Oppgave ' + window.currentTask.id;
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
    const sceneVisible = window.editorMode && !scenePanel.classList.contains('hidden');
    
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
   * Updates application state after task loads or when forces/scene elements change.
   * Rebuilds snap points, guidelines, scene panel, and synchronizes UI.
   * Called whenever:
   * - Loading a new task
   * - Editing forces or scene elements
   * - Changing settings
   * - Clicking toolbar buttons
   */
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
    
    // 0. Rebuild scene lookup from current scene (must be before snap points)
    window.sceneLookup = buildSceneLookup(window.currentTask);
    
    // 1. Rebuild snap points from current scene
    if(window.sceneLookup){
      window.snapPoints = snapping.buildSnapPoints(window.sceneLookup);
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
    
    // 3. Update scene panel (if editor mode)
    if(window.editorMode){
      updateScenePanel();
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

  function loadTask(index){
    if(!window.TASKS || !window.TASKS.length) return;
    window.currentTaskIndex = (index + window.TASKS.length) % window.TASKS.length;
    // NEW: persist current task index
    try { localStorage.setItem('tk_currentTaskIndex', String(window.currentTaskIndex)); } catch {}
    window.currentTask = window.TASKS[window.currentTaskIndex];
    window.sceneLookup = buildSceneLookup(window.currentTask);
    window.snapPoints = snapping.buildSnapPoints(window.sceneLookup);
      
    // Auto-calculate pos for texts that don't have it
    if(window.currentTask.scene && Array.isArray(window.currentTask.scene.texts)){
      let lastValidY = window.DRAW_CENTER[1];
      window.currentTask.scene.texts.forEach(text => {
        if(!text.pos || !Array.isArray(text.pos) || text.pos.length !== 2) {
          // Generate pos based on previous text and mark as linked
          const textSize = text.size || 14;
          const padding = 5;
          text.pos = [window.DRAW_CENTER[0], lastValidY + textSize + padding];
          text.linked = true;  // Mark that pos is auto-calculated
        }
        // Update lastValidY for next text
        if(text.pos && Array.isArray(text.pos)) {
          const textSize = text.size || 14;
          lastValidY = text.pos[1];
        }
      });
    }
    
    // Create new ForcesManager (will be populated below)
    window.fm = new ForcesManager();
    // Rebuild inputs for new manager to avoid stale listeners
    inputsContainer.innerHTML = '';
    // Load persisted forces for this task (if any)
    const taskKey = `tk_forces_${window.currentTask.id}`;
    const savedForces = localStorage.getItem(taskKey);
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
        }
      } catch {
        seedInitialForces(window.currentTask);
      }
    } else {
      // No saved forces, use defaults
      seedInitialForces(window.currentTask);
    }
    window.fm.syncInputs(inputsContainer);
    ensureInputMeta();
    // Update all derived state after task load
    window.updateAppState();
  }
  
  // Save current task to localStorage
  function saveTask(){
    if(!window.currentTask) return;
    const taskId = window.currentTask.id;
    
    // Save the entire task (scene, forces stored separately)
    const taskToSave = JSON.parse(JSON.stringify(window.currentTask));
    try {
      localStorage.setItem(`tk_task_${taskId}`, JSON.stringify(taskToSave));
      
      // Also save to tasks list so we know it exists
      const savedTasksKey = 'tk_savedTasks';
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
  
  // Load all saved tasks from localStorage and merge with default TASKS
  function loadSavedTasks(){
    const savedTasksKey = 'tk_savedTasks';
    try {
      const stored = localStorage.getItem(savedTasksKey);
      if(!stored) return;
      
      const savedTaskIds = JSON.parse(stored);
      for(const taskId of savedTaskIds){
        const taskKey = `tk_task_${taskId}`;
        const taskData = localStorage.getItem(taskKey);
        if(!taskData) continue;
        
        try {
          const savedTask = JSON.parse(taskData);
          // Find and replace existing task with same ID, or add new one
          const existingIdx = window.TASKS.findIndex(t => t.id === taskId);
          if(existingIdx >= 0){
            window.TASKS[existingIdx] = savedTask;
          } else {
            window.TASKS.push(savedTask);
          }
        } catch {}
      }
    } catch {}
  }

  // Save task order to localStorage
  function saveTaskOrder(){
    try {
      const taskOrder = window.TASKS.map(t => t.id);
      localStorage.setItem('tk_taskOrder', JSON.stringify(taskOrder));
    } catch {}
  }

  // Load and apply task order from localStorage, append new tasks from tasks.js
  function loadTaskOrder(){
    try {
      const saved = localStorage.getItem('tk_taskOrder');
      if(!saved) return;

      const savedOrder = JSON.parse(saved);
      
      // Create map of all current tasks
      const taskMap = new Map(window.TASKS.map(t => [t.id, t]));
      
      // Rebuild TASKS array: apply saved order, then append new tasks
      const orderedTasks = [];
      for(const id of savedOrder){
        if(taskMap.has(id)){
          orderedTasks.push(taskMap.get(id));
          taskMap.delete(id); // Mark as used
        }
      }
      
      // Append remaining tasks (new ones from tasks.js)
      for(const task of taskMap.values()){
        orderedTasks.push(task);
      }
      
      window.TASKS = orderedTasks;
    } catch {}
  }
  
  // Populate the scene panel with all scene elements
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
      item.dataset.index = index !== undefined ? index : -1;
      
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
        window.selectedSceneElement = { type, index: index !== undefined ? index : -1, obj };
        
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
          const array = scene[arrayKey];
          
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
            <label>Snap:</label>
            <input type="checkbox" class="scene-editor-input" data-field="snapping" data-type="segment" data-idx="${index}" ${(segObj.snapping ? 'checked' : '')} />
          </div>
          ${getDeleteButtonHTML()}
        `;
      } else if(type === 'arrow') {
        const arrObj = obj;
        return `
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
            <label>Farge:</label>
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
          
          if(fieldType === 'text' && scene.texts[idx]) {
            if(input.type === 'number') {
              scene.texts[idx][field] = parseInt(input.value) || 14;
            } else if(input.type !== 'checkbox') {
              scene.texts[idx][field] = input.value;
            }
            saveTask();
          }
        });
        
        // Change event for color and selects
        input.addEventListener('change', (e) => {
          const field = input.dataset.field;
          const fieldType = input.dataset.type;
          const idx = parseInt(input.dataset.idx);
          
          if(fieldType === 'text' && scene.texts[idx]) {
            if(input.type === 'checkbox') {
              // Simply toggle the linked flag - no position calculation
              scene.texts[idx][field] = input.checked;
            } else if(input.type === 'color') {
              scene.texts[idx][field] = input.value;
            } else if(input.type === 'number') {
              scene.texts[idx][field] = parseInt(input.value) || 14;
            } else {
              scene.texts[idx][field] = input.value;
            }
            saveTask();
          } else if(fieldType === 'rect' && scene.rects[idx]) {
            if(input.type === 'checkbox') {
              scene.rects[idx][field] = input.checked;
            } else if(input.type === 'color') {
              scene.rects[idx][field] = input.value;
            } else if(input.type === 'number') {
              scene.rects[idx][field] = parseFloat(input.value) || 2;
            }
            saveTask();
          } else if(fieldType === 'ellipse' && scene.ellipses[idx]) {
            if(input.type === 'checkbox') {
              scene.ellipses[idx][field] = input.checked;
            } else if(input.type === 'color') {
              scene.ellipses[idx][field] = input.value;
            } else if(input.type === 'number') {
              scene.ellipses[idx][field] = parseFloat(input.value) || 2;
            }
            saveTask();
          } else if(fieldType === 'circle' && scene.circles[idx]) {
            if(input.type === 'checkbox') {
              scene.circles[idx][field] = input.checked;
            }
            saveTask();
          } else if(fieldType === 'segment' && scene.segments[idx]) {
            if(input.type === 'checkbox') {
              scene.segments[idx][field] = input.checked;
            } else if(input.type === 'color') {
              scene.segments[idx][field] = input.value;
            } else if(input.type === 'number') {
              scene.segments[idx][field] = parseFloat(input.value) || 2;
            }
            saveTask();
          } else if(fieldType === 'arrow' && scene.arrows[idx]) {
            if(input.type === 'checkbox') {
              scene.arrows[idx][field] = input.checked;
            }
            saveTask();
          } else if(fieldType === 'plane' && scene.plane) {
            if(input.type === 'color') {
              scene.plane[field] = input.value;
            } else if(input.type === 'number') {
              scene.plane[field] = parseFloat(input.value) || 4;
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
          
          if(btnType === 'text' && scene.texts[btnIdx]) {
            scene.texts.splice(btnIdx, 1);
          } else if(btnType === 'rect' && scene.rects[btnIdx]) {
            scene.rects.splice(btnIdx, 1);
          } else if(btnType === 'ellipse' && scene.ellipses[btnIdx]) {
            scene.ellipses.splice(btnIdx, 1);
          } else if(btnType === 'circle' && scene.circles[btnIdx]) {
            scene.circles.splice(btnIdx, 1);
          } else if(btnType === 'segment' && scene.segments[btnIdx]) {
            scene.segments.splice(btnIdx, 1);
          } else if(btnType === 'arrow' && scene.arrows[btnIdx]) {
            scene.arrows.splice(btnIdx, 1);
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
            const keys = ['tk_task_', 'tk_forces_', 'tk_relations_', 'tk_sumF_'];
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
  }

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
      saveTask();
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
      saveTask();
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
      saveTask();
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
      saveTask();
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
      saveTask();
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
      window.currentTask.expectedForces.push({ name: force.name });
      force.isExpected = true;
    }
    
    // Save and refresh
    saveTaskForces();
    window.fm.syncInputs(document.getElementById('force-inputs'));
  };

  window.saveTaskForces = function saveTaskForces(){
    if(!window.currentTask || !window.fm) return;
    const taskKey = `tk_forces_${window.currentTask.id}`;
    
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

  // Load saved tasks from localStorage before loading initial task
  loadSavedTasks();
  
  // Apply saved task order from localStorage
  loadTaskOrder();

  // Load initial task based on persisted index
  (function(){
    let startIdx = 0;
    try {
      const s = localStorage.getItem('tk_currentTaskIndex');
      if(s !== null){
        const n = parseInt(s, 10);
        if(!Number.isNaN(n)) startIdx = n;
      }
    } catch {}
    loadTask(startIdx);
  })();

  // ===== Mouse interaction for forces =====
  function withinForceArea(x,y){
    // Allow drawing anywhere within canvas bounds
    return x >= 0 && y >= 0 && x <= WIDTH && y <= HEIGHT;
  }

  function getMousePos(evt){
    const rect = canvas.getBoundingClientRect();
    return [evt.clientX - rect.left, evt.clientY - rect.top];
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
    if(!window.editorMode || !window.selectedSceneElement) return null;
    
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
    else if(type === 'circle' && scene?.circles?.[index]){
      const circle = scene.circles[index];
      const [cx, cy] = circle.center;
      if(isNear(cx, cy)) return {type: 'circle', index, handleType: 'center'};
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
      const [x, y] = text.pos;
      if(isNear(x, y)) return {type: 'text', index, handleType: 'center'};
    }
    
    return null;
  }
  
  function moveSceneElement(handleInfo, newPos){
    if(!handleInfo || !window.currentTask) return;
    
    const { type, index, handleType } = handleInfo;
    const scene = window.currentTask.scene;
    
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
        const n_vec = [t_vec[1], -t_vec[0]]; // perpendicular
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
      scene.origin[0] += snappedDx;
      scene.origin[1] += snappedDy;
      window.selectedSceneElement._handleStartPos = useNewPos;
    }
    else if(type === 'plane' && scene.plane){
      if(handleType === 'through'){
        // Move plane through point
        scene.plane.through[0] += snappedDx;
        scene.plane.through[1] += snappedDy;
        // If dirPoint exists, move it too
        if(scene.plane.dirPoint) {
          scene.plane.dirPoint[0] += snappedDx;
          scene.plane.dirPoint[1] += snappedDy;
        }
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
      else if(handleType === 'direction'){
        // Update dirPoint and recalculate n_vec from through to dirPoint
        scene.plane.dirPoint = [useNewPos[0], useNewPos[1]];
        
        const through = scene.plane.through;
        const dirVec = [useNewPos[0] - through[0], useNewPos[1] - through[1]];
        const len = Math.hypot(dirVec[0], dirVec[1]);
        if(len > 0.01){
          // Normalize to get n_vec
          scene.plane.n_vec = [dirVec[0] / len, dirVec[1] / len];
          // t_vec is perpendicular (90° clockwise from n_vec)
          scene.plane.t_vec = [scene.plane.n_vec[1], -scene.plane.n_vec[0]];
        }
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    }
    else if(type === 'ellipse' && handleType === 'center' && scene.ellipses?.[index]){
      const ellipse = scene.ellipses[index];
      ellipse.center[0] += snappedDx;
      ellipse.center[1] += snappedDy;
      window.selectedSceneElement._handleStartPos = useNewPos;
    }
    else if(type === 'ellipse' && scene.ellipses?.[index]){
      const ellipse = scene.ellipses[index];
      const [cx, cy] = ellipse.center;


      if(handleType === 'width'){
        // Dragging width handle updates width and t_vec (like rect bottomRight)
        const widthRightPos = [useNewPos[0], useNewPos[1]];
        const widthVec = [widthRightPos[0] - cx, widthRightPos[1] - cy];
        const newHalfWidth = Math.hypot(widthVec[0], widthVec[1]);
        const newWidth = newHalfWidth * 2;
        const newT = [widthVec[0] / newHalfWidth, widthVec[1] / newHalfWidth];
        
        ellipse.width = newWidth;
        ellipse.t_vec = newT;
        // n_vec is perpendicular to t_vec (90° counter-clockwise)
        ellipse.n_vec = [newT[1], -newT[0]];
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    else if(handleType === 'height'){
        // Dragging height handle updates height and n_vec (like rect topCenter)
        const heightTopPos = [useNewPos[0], useNewPos[1]];
        const heightVec = [heightTopPos[0] - cx, heightTopPos[1] - cy];
        const newHalfHeight = Math.hypot(heightVec[0], heightVec[1]);
        const newHeight = newHalfHeight * 2;
        const newN = [heightVec[0] / newHalfHeight, heightVec[1] / newHalfHeight];
        
        ellipse.height = newHeight;
        ellipse.n_vec = newN;
        // Update t_vec to be perpendicular to n_vec (90° clockwise: [n[1], -n[0]])
        ellipse.t_vec = [-newN[1], newN[0]];
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    }
    else if(type === 'circle' && handleType === 'center' && scene.circles?.[index]){
      const circle = scene.circles[index];
      circle.center[0] += snappedDx;
      circle.center[1] += snappedDy;
      window.selectedSceneElement._handleStartPos = useNewPos;
    }
    else if(type === 'text' && handleType === 'center' && scene.texts?.[index]){
      const text = scene.texts[index];
      text.pos[0] += snappedDx;
      text.pos[1] += snappedDy;
      window.selectedSceneElement._handleStartPos = useNewPos;
    }
    else if(type === 'segment' && scene.segments?.[index]){
      const segment = scene.segments[index];
      if(handleType === 'a'){
        segment.a[0] += snappedDx;
        segment.a[1] += snappedDy;
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
      else if(handleType === 'b'){
        segment.b[0] += snappedDx;
        segment.b[1] += snappedDy;
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    }
    else if(type === 'arrow' && scene.arrows?.[index]){
      const arrow = scene.arrows[index];
      if(handleType === 'a'){
        arrow.a[0] += snappedDx;
        arrow.a[1] += snappedDy;
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
      else if(handleType === 'b'){
        arrow.b[0] += snappedDx;
        arrow.b[1] += snappedDy;
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    }
    else if(type === 'rect' && scene.rects?.[index]){
      const rect = scene.rects[index];
      const bc = rect.bottomCenter;
      const t = rect.t_vec || [1, 0];
      const n = rect.n_vec || [0, -1];
      
      if(handleType === 'center'){
        // Move bottom center
        rect.bottomCenter[0] += snappedDx;
        rect.bottomCenter[1] += snappedDy;
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
      else if(handleType === 'topCenter'){
        // Dragging top center updates height and n_vec
        const topCenterPos = [useNewPos[0], useNewPos[1]];
        const heightVec = [topCenterPos[0] - bc[0], topCenterPos[1] - bc[1]];
        const newHeight = Math.hypot(heightVec[0], heightVec[1]);
        const newN = [heightVec[0] / newHeight, heightVec[1] / newHeight];
        
        rect.height = newHeight;
        rect.n_vec = newN;
        // Update t_vec to be perpendicular to n_vec (rotate 90° clockwise: [n[1], -n[0]])
        rect.t_vec = [-newN[1], newN[0]];
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
      else if(handleType === 'bottomRight'){
        // Dragging bottom right updates width and t_vec (allows rotation)
        const bottomRightPos = [useNewPos[0], useNewPos[1]];
        const widthVec = [bottomRightPos[0] - bc[0], bottomRightPos[1] - bc[1]];
        const halfWidth = Math.hypot(widthVec[0], widthVec[1]);
        const newWidth = halfWidth * 2;
        const newT = [widthVec[0] / halfWidth, widthVec[1] / halfWidth];
        
        rect.width = newWidth;
        rect.t_vec = newT;
        // Update n_vec to be perpendicular to t_vec (rotate 90° counter-clockwise: [-t[1], t[0]])
        rect.n_vec = [newT[1], -newT[0]];
        window.selectedSceneElement._handleStartPos = useNewPos;
      }
    }
  }

  canvas.addEventListener('mousemove', (e)=>{
    const pos = getMousePos(e);
    
    // Handle scene element dragging in edit mode
    if(window.draggingHandle && window.editorMode){
      moveSceneElement(window.draggingHandle, pos);
      return;
    }
    
    const active = window.fm.forces[window.fm.activeIndex];

    // Only update hover when not interacting (no drawing/dragging)
    const isInteracting = active && (active.drawing || !!active.dragging);
    if(!isInteracting){
      window.fm.updateHover(pos);
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
        if(Math.hypot(usePos[0]-pos[0], usePos[1]-pos[1]) > 1){
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
    if(window.editorMode){
      const handle = getSceneHandleAtPos(pos);
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
    }
    
    // NEW: ensure hover state reflects this exact click position (user may click without prior mousemove)
    if(window.fm){ window.fm.updateHover(pos); }
    // If click is outside draw area, ignore force creation logic
    const inArea = withinForceArea(pos[0], pos[1]);
    // Determine hovered force (if any)
    let hoveredIndex = -1;
    for(let i=0;i<window.fm.forces.length;i++){
      if(window.fm.forces[i].hovering){ hoveredIndex = i; break; }
    }
    if(inArea && hoveredIndex === -1){
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
      
      window.fm.setActive(targetIndex);
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
    const picked = (hoveredIndex !== -1) ? hoveredIndex : window.fm.activeIndex;
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
      if(window.editorMode) saveTask();
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
        loadTask(window.currentTaskIndex+1);
        // Update settings window if it's open
        const settingsPanel = document.getElementById('settings-panel');
        if(settingsPanel && !settingsPanel.classList.contains('hidden')){
          const taskComment = document.getElementById('settings-task-comment');
          const commentLabel = document.getElementById('settings-comment-label');
          if(window.currentTask && taskComment){
            const taskId = window.currentTask.id;
            const commentText = (window.taskComments[taskId] && window.taskComments[taskId].comment) || '';
            taskComment.value = commentText;
            if(commentLabel) commentLabel.textContent = `Kommentar til oppgave ${taskId}`;
          }
        }
        // Update help panel if it's open
        const helpPanel = document.getElementById('help-panel');
        if(helpPanel && !helpPanel.classList.contains('hidden')){
          const helpContent = document.getElementById('help-content');
          const helpTitle = document.getElementById('help-title');
          if(helpTitle) helpTitle.textContent = `Oppgave ${window.currentTask.id}: ${window.currentTask.title}`;
          if(helpContent && window.currentTask.help_lines){
            helpContent.innerHTML = window.currentTask.help_lines.map(line => `<p>${line}</p>`).join('');
          }
        }
        return;
      }
      if(action === 'prev'){
        loadTask(window.currentTaskIndex-1);
        // Update settings window if it's open
        const settingsPanel = document.getElementById('settings-panel');
        if(settingsPanel && !settingsPanel.classList.contains('hidden')){
          const taskComment = document.getElementById('settings-task-comment');
          const commentLabel = document.getElementById('settings-comment-label');
          if(window.currentTask && taskComment){
            const taskId = window.currentTask.id;
            const commentText = (window.taskComments[taskId] && window.taskComments[taskId].comment) || '';
            taskComment.value = commentText;
            if(commentLabel) commentLabel.textContent = `Kommentar til oppgave ${taskId}`;
          }
        }
        // Update help panel if it's open
        const helpPanel = document.getElementById('help-panel');
        if(helpPanel && !helpPanel.classList.contains('hidden')){
          const helpContent = document.getElementById('help-content');
          const helpTitle = document.getElementById('help-title');
          if(helpTitle) helpTitle.textContent = `Oppgave ${window.currentTask.id}: ${window.currentTask.title}`;
          if(helpContent && window.currentTask.help_lines){
            helpContent.innerHTML = window.currentTask.help_lines.map(line => `<p>${line}</p>`).join('');
          }
        }
        return;
      }
      if(action === 'check'){
        // Save current forces before evaluating
        saveTaskForces();
        runEvaluation();
        // Update level and user display after evaluation if score is available
        if(window.lastEvaluation && window.lastEvaluation.summary){
          const taskId = window.currentTask.id;
          const score = window.lastEvaluation.summary.finalScore;
          window.taskScores[taskId] = { score, feedback: window.lastEvaluation.lines.map(l=>l.text).join(' | ') };
          try{ localStorage.setItem('tk_taskScores', JSON.stringify(window.taskScores)); } catch {}
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
        window.snapIndicator = null;
        window.currentGuidelines = null;
        clearFeedback();
        // Remove only expected forces, keep initial forces
        const taskKey = `tk_forces_${window.currentTask.id}`;
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
                localStorage.setItem(taskKey, JSON.stringify(initialForces));
              } else {
                localStorage.removeItem(taskKey);
              }
            }
          }
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
        // Show help lines
        const helpContent = document.getElementById('help-content');
        const helpTitle = document.getElementById('help-title');
        if(helpTitle) helpTitle.textContent = `Oppgave ${window.currentTask.id}: ${window.currentTask.title}`;
        if(helpContent && window.currentTask.help_lines){
          helpContent.innerHTML = window.currentTask.help_lines.map(line => `<p>${line}</p>`).join('');
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
        if(sEditor) sEditor.checked = !!window.editorMode;
        // Load current task comment
        if(window.currentTask && taskComment){
          const taskId = window.currentTask.id;
          const commentText = (window.taskComments[taskId] && window.taskComments[taskId].comment) || '';
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
  
  const dbg = document.getElementById('settings-debug');
  const usr = document.getElementById('settings-username');
  const sSnap = document.getElementById('settings-snap');
  const sGuides = document.getElementById('settings-guidelines');
  const sShowForceCoords = document.getElementById('settings-show-force-coordinates');
  const sShowSceneCoords = document.getElementById('settings-show-scene-coordinates');
  const sEditor = document.getElementById('settings-editor');
  function persist(){ try{ localStorage.setItem('tk_settings', JSON.stringify(window.settings)); }catch{} }
  
  if(dbg){ dbg.addEventListener('change', ()=>{ window.settings.debug = !!dbg.checked; persist(); }); }
  if(sSnap){ sSnap.addEventListener('change', ()=>{ window.enableSnap = !!sSnap.checked; }); }
  if(sGuides){ sGuides.addEventListener('change', ()=>{ window.enableGuidelines = !!sGuides.checked; window.updateAppState(); }); }
  if(sShowForceCoords){ sShowForceCoords.addEventListener('change', ()=>{ window.settings.show_force_coordinates = !!sShowForceCoords.checked; persist(); }); }
  if(sShowSceneCoords){ sShowSceneCoords.addEventListener('change', ()=>{ window.settings.show_scene_coordinates = !!sShowSceneCoords.checked; persist(); }); }
  if(sEditor){ 
    sEditor.addEventListener('change', ()=>{ 
      window.editorMode = !!sEditor.checked;
      try{ localStorage.setItem('tk_editorMode', JSON.stringify(window.editorMode)); } catch {}
      updateEditorMode();
      window.selectedSceneElement = null;
      window.updateAppState();
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
        localStorage.removeItem(`tk_relations_${taskId}`);
        localStorage.removeItem(`tk_sumF_${taskId}`);
        
        // Update saved tasks list
        const savedTasksKey = 'tk_savedTasks';
        let savedTasks = [];
        try {
          const stored = localStorage.getItem(savedTasksKey);
          if(stored) savedTasks = JSON.parse(stored);
        } catch {}
        savedTasks = savedTasks.filter(id => id !== taskId);
        localStorage.setItem(savedTasksKey, JSON.stringify(savedTasks));
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
      
      // Remove pos and linked flag from linked texts
      if(task.scene && Array.isArray(task.scene.texts)){
        task.scene.texts.forEach(text => {
          if(text.linked) {
            delete text.pos;
            delete text.linked;
          }
        });
      }
      
      // Add aliases for each expectedForce
      if(task.expectedForces){
        task.expectedForces.forEach(f => {
          if(FORCE_ALIASES[f.name]) f.aliases = FORCE_ALIASES[f.name].slice();
        });
      }
      // Add relations from localStorage if present
      const relKey = `tk_relations_${task.id}`;
      const savedRelations = localStorage.getItem(relKey);
      if(savedRelations){
        try{ task.relations = JSON.parse(savedRelations); }catch{}
      }
      // Add sumF from localStorage if present
      const sumFKey = `tk_sumF_${task.id}`;
      const savedSumF = localStorage.getItem(sumFKey);
      if(savedSumF){
        try{ task.sumF = JSON.parse(savedSumF); }catch{}
      }
      // Generate JavaScript export code
      const code = `TASKS.push(${JSON.stringify(task, null, 2)});`;
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
    const relKey = `tk_relations_${window.currentTask.id}`;
    let relations = relationsList._relations || [];
    if(relationsList._relations === undefined){
      const savedRelations = localStorage.getItem(relKey);
      if(savedRelations){
        try{ relations = JSON.parse(savedRelations); }catch{}
      } else if(window.currentTask.relations){
        relations = JSON.parse(JSON.stringify(window.currentTask.relations));
      }
    }
    // List all forces
    const forces = window.fm.forces.filter(f=>f.name);
    // Build UI
    let html = '';
    html += '<div style="margin-bottom:8px;">Legg til eller rediger relasjoner mellom krefter:</div>';
    relations.forEach((rel, idx) => {
      html += `<div class="relation-row" data-idx="${idx}" style="margin-bottom:6px;">`;
      html += `LHS: <select multiple size="1" class="lhs-select">${forces.map(f=>`<option value="${f.name}"${rel.lhs.some(l=>l.name===f.name)?' selected':''}>${f.name}</option>`).join('')}</select>`;
      html += ` RHS: <select multiple size="1" class="rhs-select">${forces.map(f=>`<option value="${f.name}"${rel.rhs.some(r=>r.name===f.name)?' selected':''}>${f.name}</option>`).join('')}</select>`;
      html += ` Forhold: <input type="number" step="any" value="${rel.ratio}" style="width:60px;" />`;
      html += ` Toleranse: <input type="number" step="any" value="${rel.tol_rel||0.15}" style="width:50px;" />`;
      html += ` <span class="auto-relation" style="color:#888;">(auto: ${autoRelationValue(rel, forces)})</span>`;
      html += ` <button class="remove-relation" data-idx="${idx}">Fjern</button>`;
      html += '</div>';
    });
    html += '<button id="add-relation" style="margin-top:8px;">+ Ny relasjon</button>';
    relationsList.innerHTML = html;
    // Wire up remove/add
    relationsList.querySelectorAll('.remove-relation').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const idx = parseInt(btn.dataset.idx);
        relations.splice(idx,1);
        showRelationsEditor();
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
    // Read values from modal
    const rows = relationsList.querySelectorAll('.relation-row');
    const relations = [];
    rows.forEach(row=>{
      const lhsSel = row.querySelector('.lhs-select');
      const rhsSel = row.querySelector('.rhs-select');
      const ratioInput = row.querySelector('input[type="number"]');
      const tolInput = row.querySelectorAll('input[type="number"]')[1];
      const lhs = Array.from(lhsSel.selectedOptions).map(opt=>({name:opt.value}));
      const rhs = Array.from(rhsSel.selectedOptions).map(opt=>({name:opt.value}));
      const ratio = parseFloat(ratioInput.value)||1.0;
      const tol_rel = parseFloat(tolInput.value)||0.15;
      relations.push({lhs,rhs,ratio,tol_rel});
    });
    // Save to localStorage
    const relKey = `tk_relations_${window.currentTask.id}`;
    try{ localStorage.setItem(relKey, JSON.stringify(relations)); }catch{}
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
  const taskList = document.getElementById('task-list');
  const taskCount = document.getElementById('task-count');
  const taskOrderClose = document.getElementById('task-order-close');

  function updateTaskOrderList(){
    if(!taskList) return;
    taskList.innerHTML = '';
    if(!window.TASKS || window.TASKS.length === 0) return;

    taskCount.textContent = window.TASKS.length;

    window.TASKS.forEach((task, idx) => {
      const item = document.createElement('div');
      item.className = 'task-order-item';
      item.draggable = true;
      item.dataset.index = idx;
      item.dataset.taskId = task.id;
      item.innerHTML = `
        <span class="task-order-handle">⋮⋮</span>
        <span class="task-order-id">${task.id}</span>
        <span class="task-order-title">${task.title || '(Ingen tittel)'}</span>
        <span class="task-order-category">${task.category || ''}</span>
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

  if(taskOrderClose){
    taskOrderClose.addEventListener('click', ()=>{
      // Apply current order from DOM
      const items = taskList.querySelectorAll('.task-order-item');
      const newOrder = [];
      items.forEach(item => {
        const taskId = item.dataset.taskId;
        const task = window.TASKS.find(t => t.id === taskId);
        if(task) newOrder.push(task);
      });
      window.TASKS = newOrder;
      saveTaskOrder();
      
      if(taskOrderModal) taskOrderModal.classList.add('hidden');
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
        // NEW: include current task index
        currentTaskIndex: (typeof window.currentTaskIndex === 'number') ? window.currentTaskIndex : 0,
      };
      // Also save all task forces
      const allForces = {};
      if(window.TASKS){
        window.TASKS.forEach(task=>{
          const key = `tk_forces_${task.id}`;
          const saved = localStorage.getItem(key);
          if(saved) allForces[key] = JSON.parse(saved);
        });
      }
      backup.forces = allForces;
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
      reader.onload = (evt)=>{
        try{
          const backup = JSON.parse(evt.target?.result || '{}');
          if(backup.settings){ window.settings = { ...window.settings, ...backup.settings }; }
          if(backup.taskScores){ window.taskScores = backup.taskScores; }
          if(backup.taskComments){ window.taskComments = backup.taskComments; }
          if(backup.forces){
            for(const key in backup.forces){
              localStorage.setItem(key, JSON.stringify(backup.forces[key]));
            }
          }
          // NEW: restore current task index
          if(typeof backup.currentTaskIndex === 'number'){
            window.currentTaskIndex = backup.currentTaskIndex;
            try { localStorage.setItem('tk_currentTaskIndex', String(window.currentTaskIndex)); } catch {}
          }
          // Persist settings
          try{ localStorage.setItem('tk_settings', JSON.stringify(window.settings)); } catch {}
          try{ localStorage.setItem('tk_taskScores', JSON.stringify(window.taskScores)); } catch {}
          try{ localStorage.setItem('tk_taskComments', JSON.stringify(window.taskComments)); } catch {}
          // Update UI
          updateUserDisplay();
          if(usr) usr.value = window.settings.username || '';
          if(dbg) dbg.checked = !!window.settings.debug;
          alert('Innstillinger gjenopprettet!');
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
    // Remove per-task forces
    window.TASKS.forEach(t=>{
      try{ localStorage.removeItem(`tk_forces_${t.id}`); }catch{}
    });
    // Remove global data
    ['tk_settings','tk_taskScores','tk_taskComments','tk_currentTaskIndex'].forEach(k=>{
      try{ localStorage.removeItem(k); }catch{}
    });
    // Reinit runtime state
    window.settings = { debug:false, username:'Isaac Newton' };
    window.taskScores = {};
    window.taskComments = {};
    // Reload first task
    loadTask(0);
    updateUserDisplay();
    // Hide settings panel
    const pnl = document.getElementById('settings-panel');
    if(pnl) pnl.classList.add('hidden');
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
