/**
 * shared.js - Shared constants and utilities for main.js and editor.js
 * Allows both modes to use identical configuration without duplication
 */

// ===== UI Constants =====
window.WIDTH = 1000;
window.HEIGHT = 640;
window.GRID_STEP = 20;
window.RELATION_TOL_REL = 0.05;
window.RELATION_TOL_ABS = 2; // px; either tolerance can accept a relation
window.TOP_BAR_HEIGHT = 80;  // Height of the top navigation panel
window.FORCE_HEADER_HEIGHT = 16;  // Height of "Krefter" title: 12px font + 2px padding top + 2px padding bottom with line-height:1
window.DRAW_CENTER = [500, 320 + 20];  // [WIDTH/2, HEIGHT/2 + GRID_STEP]
window.BG_COLOR = '#f0f0f0'; // (240,240,240)
window.GRID_COLOR = '#dcdcdc'; // (220,220,220)

// ===== Canvas Dimensions =====
// Grid area is 1000x640, with 200px margin on each side (offsets)
// Canvas extends from -200,-200 to 1000,640 = total 1400x1040
window.CANVAS_WIDTH = window.WIDTH + 2 * 200;     // 1000 + 400 = 1400px
window.CANVAS_HEIGHT = window.HEIGHT + 2 * 200;   // 640 + 400 = 1040px

// ===== Canvas Offset (for rendering translation) =====
// Grid area (0,0 to WIDTH,HEIGHT) is translated by these offsets
window.offsetX = 200;         // Left/right margin (canvas extends from -200 to 1000)
window.offsetY = 200;         // Top/bottom margin (canvas extends from -200 to 640)

// ===== Scene Element Highlighting Constants =====
window.HIGHLIGHT_SCENE_POINT_DIM_COLOR = '#aaaaaa';      // Dim color for selected element points
window.HIGHLIGHT_SCENE_POINT_DIM_RADIUS = 6;
window.HIGHLIGHT_SCENE_POINT_BRIGHT_COLOR = '#ffff00';   // Bright yellow for hovered element points
window.HIGHLIGHT_SCENE_POINT_BRIGHT_RADIUS = 8;
window.HIGHLIGHT_SCENE_LINE_DIM_COLOR = '#4488ff';       // Blue for segment lines (selected, dim)
window.HIGHLIGHT_SCENE_LINE_DIM_WIDTH = 4;
window.HIGHLIGHT_SCENE_LINE_BRIGHT_COLOR = '#66bbff';    // Bright cyan for segment lines (hovered)
window.HIGHLIGHT_SCENE_LINE_BRIGHT_WIDTH = 6;

// Adjust anchor marker styles here; scene highlighting uses the constants above.
window.ANCHOR_MARKER_STYLES = {
  get sceneSelected(){
    return {radius:window.HIGHLIGHT_SCENE_POINT_DIM_RADIUS,color:window.HIGHLIGHT_SCENE_POINT_DIM_COLOR,fill:true,opacity:1};
  },
  get sceneHovered(){
    return {radius:window.HIGHLIGHT_SCENE_POINT_BRIGHT_RADIUS,color:window.HIGHLIGHT_SCENE_POINT_BRIGHT_COLOR,fill:true,opacity:1};
  },
  get forceCandidate(){
    return {radius:5,color:window.HIGHLIGHT_SCENE_POINT_DIM_COLOR,fill:true,opacity:0.5};
  },
  get forceHovered(){
    return this.sceneHovered;
  },
  pickerCandidate:{radius:6,color:'#1686ad',fill:false,opacity:1,lineWidth:2},
  pickerHovered:{radius:6,color:'#e89100',fill:false,opacity:1,lineWidth:2},
  get pickerPreview(){
    return {...this.pickerHovered,radius:8};
  }
};

window.drawAnchorMarker = function(ctx,pos,state){
  const style=window.ANCHOR_MARKER_STYLES[state];
  ctx.save();
  ctx.globalAlpha*=style.opacity;
  ctx.beginPath();
  ctx.arc(pos[0],pos[1],style.radius,0,Math.PI*2);
  if(style.fill){
    ctx.fillStyle=style.color;
    ctx.fill();
  }else{
    ctx.strokeStyle=style.color;
    ctx.lineWidth=style.lineWidth;
    ctx.stroke();
  }
  ctx.restore();
};

// ===== Scene Element Handles Constants =====
window.SCENE_HANDLE_RADIUS = 5;
window.SCENE_HANDLE_COLOR = '#ff9800';     // Orange
window.SCENE_HANDLE_STROKE_COLOR = '#ffffff';
window.SCENE_HANDLE_STROKE_WIDTH = 1;
window.SCENE_HANDLE_TEXT_COLOR = '#000';
window.SCENE_HANDLE_TEXT_SIZE = 12;

// ===== Scene Element Hover Detection Constants =====
window.HOVER_THRESHOLD = 20;               // pixels, same as SNAP_THRESHOLD
window.PREFER_SELECTED_DIST = 20;          // Prefer selected element within this distance (GRID_STEP)

// ===== Feedback Panel Configuration =====
window.FEEDBACK_PANEL_MAX_WIDTH = 400;     // Maximum width in pixels
window.FEEDBACK_PANEL_MAX_HEIGHT = 300;    // Maximum height in pixels
window.FEEDBACK_PANEL_CHAR_WIDTH = 8.5;    // Estimated pixels per character (monospace ~8.5px)
window.FEEDBACK_PANEL_LINE_HEIGHT = 24;    // Height per line in pixels

// ===== Force Aliases =====
window.FORCE_ALIASES = {
  G: ['g','ga','tyngde','fg','G'],
  N: ['n','na','normalkraft','r','fn','N'],
  F: ['f','fa','kraft','applied','F'],
  R: ['r','ra','friksjon','fr','R'],
  N_B: ['nb*','n*','nb\'','n\'','b','nba','nab','N_B']
};

// ===== Icon Symbols =====
window.ICONS = {
  snap: '🧲',
  guidelines: '📐',
  grid_off: '⊞',
  grid_on: '◻',
  undo: '↶',
  redo: '↷',
  prev: '⬅',
  next: '➡',
  help: '❓',
  check: '✅',
  reset: '🔄',
  settings: '⚙'
};

window.snapMatchCategories = [
  ['LL','length','length','Lengde–lengde',true],
  ['LX','length','x','Lengde–x',true],
  ['LY','length','y','Lengde–y',true],
  ['LN','length','n','Lengde–normal (n)',false],
  ['LT','length','t','Lengde–tangent (t)',false],
  ['XX','x','x','x–x',true],
  ['YY','y','y','y–y',true],
  ['XY','x','y','x–y',false],
  ['NN','n','n','Normal–normal (n–n)',false],
  ['TT','t','t','Tangent–tangent (t–t)',false],
  ['NT','n','t','Normal–tangent (n–t)',false],
  ['XN','x','n','x–normal (n)',false],
  ['XT','x','t','x–tangent (t)',false],
  ['YN','y','n','y–normal (n)',false],
  ['YT','y','t','y–tangent (t)',false]
].map(([id,a,b,label,enabled])=>({key:`snapMatch${id}`,a,b,label,enabled}));

window.snapMatchCategory = function(a,b){
  return window.snapMatchCategories.find(category=>
    (category.a===a&&category.b===b)||(category.a===b&&category.b===a));
};

window.getSnapChecklistDefaults = function(){
  const defaults={
    snapEnabled:true,
    guidelinesEnabled:true,
    showForceCoordinates:false,
    snapForceEndpoints:true
  };
  for(const category of window.snapMatchCategories) defaults[category.key]=category.enabled;
  return defaults;
};

window.normalizeSnapChecklist = function(task,saved,base){
  const checklist={...(base||window.getSnapChecklistDefaults())};
  if(!saved||typeof saved!=='object'||Array.isArray(saved)) return checklist;
  const legacyKeys=['snapSameAxisComponents','snapCrossAxisComponents','snapLocalComponents',
    'snapForceLengths','snapComponentToLength'];
  const hasLegacy=legacyKeys.some(key=>typeof saved[key]==='boolean');
  // A legacy task starts with its old defaults; an override changes only its saved fields.
  const plane=task?.scene?.plane;
  let inclined=false;
  if(plane){
    const tangent=Array.isArray(plane.t_vec)
      ? plane.t_vec
      : [Math.cos((Number(plane.angleDeg)||0)*Math.PI/180),-Math.sin((Number(plane.angleDeg)||0)*Math.PI/180)];
    const length=Math.hypot(...tangent);
    if(Number.isFinite(length)&&length>1e-10){
      const x=Math.abs(tangent[0]/length),y=Math.abs(tangent[1]/length);
      inclined=x>1e-8&&y>1e-8;
    }
  }
  const legacy={
    snapSameAxisComponents:true,
    snapCrossAxisComponents:false,
    snapLocalComponents:false,
    snapForceLengths:false,
    snapComponentToLength:inclined
  };
  if(hasLegacy){
    for(const category of window.snapMatchCategories){
      const {a,b}=category;
      const key=a==='length'&&b==='length' ? 'snapForceLengths'
        : a==='length'||b==='length' ? 'snapComponentToLength'
        : a==='n'||a==='t'||b==='n'||b==='t' ? 'snapLocalComponents'
        : a===b ? 'snapSameAxisComponents' : 'snapCrossAxisComponents';
      if(typeof saved[key]==='boolean') checklist[category.key]=saved[key];
      else if(!base) checklist[category.key]=legacy[key];
    }
    if(!base){
      const local=typeof saved.snapLocalComponents==='boolean' ? saved.snapLocalComponents : legacy.snapLocalComponents;
      const length=typeof saved.snapComponentToLength==='boolean' ? saved.snapComponentToLength : legacy.snapComponentToLength;
      checklist.snapMatchLN=checklist.snapMatchLT=local&&length;
    }else if(saved.snapLocalComponents===false){
      checklist.snapMatchLN=checklist.snapMatchLT=false;
    }
  }
  // Explicit fine-grained values always win over legacy flags in the same object.
  for(const key of Object.keys(checklist)){
    if(typeof saved[key]==='boolean') checklist[key]=saved[key];
  }
  return checklist;
};

window.getTaskSnapChecklist = function(task){
  return window.normalizeSnapChecklist(task,task?.snapChecklist);
};

window.getActiveSnapChecklist = function(task){
  const checklist=window.getTaskSnapChecklist(task);
  return task===window.currentTask&&window.currentSnapChecklist
    ? window.normalizeSnapChecklist(task,window.currentSnapChecklist,checklist) : checklist;
};

window.hasLocalSnapMatches = function(checklist){
  return window.snapMatchCategories.some(({key,a,b})=>
    checklist[key]&&(a==='n'||a==='t'||b==='n'||b==='t'));
};

window.populateSnapMatchOptions = function(modal){
  const container=modal.querySelector('[data-snap-match-options]');
  if(!container) return;
  container.innerHTML=window.snapMatchCategories.map(({key,label},index)=>
    `${index===0?'<strong>Lengder</strong>':index===5?'<strong>Globale komponenter</strong>':
      index===8?'<strong>Lokale komponenter</strong>':index===11?'<strong>Globale mot lokale komponenter</strong>':''}`+
    `<label><input type="checkbox" data-snap-checklist="${key}"> ${label}</label>`).join('');
};

// Reference geometry is author data, never the student's current force manager.
window.getAutomaticRelationRatio = function(task,relation,referenceForces){
  const fail = error=>({value:null,error});
  const point = value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite);
  const forces = referenceForces || [
    ...(task?.expectedForces || []).map(spec=>({...spec.drawn,name:spec.name})),
    ...(task?.initialForces || [])
  ];
  function sum(terms){
    if(!Array.isArray(terms)||!terms.length) return fail('Begge sider må ha minst én kraft.');
    let total=0;
    for(const term of terms){
      const force=forces.find(force=>force.name===term.name);
      if(!force||!point(force.arrowBase)||!point(force.arrowTip)){
        return fail(`Mangler fasitgeometri for ${term.name || '?'}. Oppgi et forhold.`);
      }
      const vector=force.arrowTip.map((value,index)=>value-force.arrowBase[index]);
      const component=term.component || 'magnitude';
      if(component==='magnitude'){
        total+=Math.hypot(...vector);
        continue;
      }
      const plane=task?.scene?.plane;
      const axis=component==='horizontal' ? [1,0] : component==='vertical' ? [0,-1]
        : component==='normal' ? plane?.n_vec : component==='tangent' ? plane?.t_vec : null;
      if(!point(axis)||Math.hypot(...axis)===0){
        return fail(`Ugyldig akse for komponenten ${component}. Oppgi et forhold.`);
      }
      total+=Math.abs(vector[0]*axis[0]+vector[1]*axis[1])/Math.hypot(...axis);
    }
    return {value:total,error:null};
  }
  const lhs=sum(relation?.lhs),rhs=sum(relation?.rhs);
  if(lhs.error) return lhs;
  if(rhs.error) return rhs;
  if(rhs.value===0) return fail('Fasitens høyre side er null. Oppgi et forhold.');
  const value=lhs.value/rhs.value;
  return Number.isFinite(value)&&value>0 ? {value,error:null}
    : fail('Automatisk forhold må være større enn 0. Oppgi et forhold.');
};

window.getEffectiveRelationRatio = function(task,relation,referenceForces){
  if(relation?.ratio!==undefined){
    return Number.isFinite(relation.ratio)&&relation.ratio>0
      ? {value:relation.ratio,error:null}
      : {value:null,error:'Forhold må være et endelig tall større enn 0.'};
  }
  return window.getAutomaticRelationRatio(task,relation,referenceForces);
};

window.refreshRelationRatioInput = function(input,task,relation,referenceForces){
  const automatic=window.getAutomaticRelationRatio(task,relation,referenceForces);
  input.placeholder=automatic.error ? 'Oppgi forhold' : String(Number(automatic.value.toPrecision(6)));
  input.title=automatic.error || 'Tomt felt bruker automatisk forhold fra fasiten.';
};

window.readRelationRatioInput = function(input,task,relation,referenceForces,report=true){
  const blank=input.value===''&&!input.validity.badInput;
  const candidate={...relation};
  if(blank) delete candidate.ratio;
  else candidate.ratio=Number(input.value);
  const result=window.getEffectiveRelationRatio(task,candidate,referenceForces);
  const error=input.validity.badInput ? 'Oppgi et gyldig forhold større enn 0.' : result.error;
  input.setCustomValidity(error || '');
  if(error){
    if(report) input.reportValidity();
    return false;
  }
  if(blank) delete relation.ratio;
  else relation.ratio=candidate.ratio;
  return true;
};

window.getRelationSnapMatches = function(relations,task,referenceForces){
  const relevant=window.getSnapChecklistDefaults();
  const components={magnitude:'length',horizontal:'x',vertical:'y',normal:'n',tangent:'t'};
  for(const relation of relations||[]){
    if(relation?.lhs?.length!==1||relation?.rhs?.length!==1) continue;
    const ratio=window.getEffectiveRelationRatio(task,relation,referenceForces);
    if(ratio.error||Math.abs(ratio.value-1)>1e-10) continue;
    const a=components[relation.lhs[0].component||'magnitude'];
    const b=components[relation.rhs[0].component||'magnitude'];
    const category=window.snapMatchCategory(a,b);
    if(category) relevant[category.key]=true;
  }
  return relevant;
};

/**
 * Calculate dynamic width and height for feedback panel based on content
 * @param {Array<Object>} lines - Feedback lines with text property
 * @returns {Object} { width, height } in pixels
 */
window.calculateFeedbackPanelSize = function(lines) {
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    return { width: 240, height: 100 };
  }

  // Find the longest segment and count total rendered lines
  let maxLength = 0;
  let totalRenderedLines = 0;
  
  lines.forEach(line => {
    if (line.text) {
      // Count actual lines (newline-separated segments) in this text
      const textLines = line.text.split('\n');
      totalRenderedLines += textLines.length;
      
      // Find longest segment
      textLines.forEach(segment => {
        maxLength = Math.max(maxLength, segment.length);
      });
    }
  });

  // Calculate width based on longest line segment
  let width = Math.ceil(maxLength * window.FEEDBACK_PANEL_CHAR_WIDTH) + 24; // 24px padding
  width = Math.min(width, window.FEEDBACK_PANEL_MAX_WIDTH);
  width = Math.max(width, 240); // Minimum 240px

  // Calculate height based on total rendered lines (including multi-line text) plus header/nav
  const headerHeight = 40; // Score area
  const navHeight = 28;    // Navigation buttons
  const padding = 24;      // Top/bottom padding
  const contentHeight = totalRenderedLines * window.FEEDBACK_PANEL_LINE_HEIGHT;

  let height = headerHeight + contentHeight + navHeight + padding;
  height = Math.min(height, window.FEEDBACK_PANEL_MAX_HEIGHT);
  height = Math.max(height, 100); // Minimum 100px

  return { width, height };
};

/**
 * Highlight forces based on feedback line indices
 * @param {Array<number>} indices - Array of force indices to highlight
 */
window.applyHighlightsFor = function(indices) {
  if (window.fm) {
    window.fm.forces.forEach(f => f.checkHighlight = false);
  }
  if (!indices) return;
  indices.forEach(idx => {
    const f = window.fm?.forces?.[idx];
    if (f) f.checkHighlight = true;
  });
};

/**
 * Clear all force highlights
 */
window.clearHighlights = function() {
  if (window.fm) {
    window.fm.forces.forEach(f => f.checkHighlight = false);
  }
};

/**
 * Get mouse position relative to canvas, accounting for scroll offset and rendering translation.
 * Canvas dimensions are CANVAS_WIDTH x CANVAS_HEIGHT with rendering translated by (offsetX, offsetY).
 * @param {MouseEvent} evt - The mouse event
 * @returns {Array<number>} [x, y] position in canvas coordinates
 */
window.getMousePos = function(evt) {
  const canvas = document.getElementById('app-canvas');
  if(!canvas) throw new Error('Canvas mangler ved koordinatberegning');
  const bounds = canvas.getBoundingClientRect();
  if(bounds.width <= 0 || bounds.height <= 0) throw new Error('Canvas har ugyldig størrelse');
  const x = (evt.clientX - bounds.left) * canvas.width / bounds.width - window.offsetX;
  const y = (evt.clientY - bounds.top) * canvas.height / bounds.height - window.offsetY;
  return [x, y];
};

window.findSceneAnchorAtPosition = function(force, task){
  const position = force?.anchor;
  if(!Array.isArray(position) || position.length < 2 || !position.every(Number.isFinite) ||
     !task?.scene || !window.sceneModel) return null;
  const direction = force.arrowBase && force.arrowTip
    ? [force.arrowTip[0] - force.arrowBase[0], force.arrowTip[1] - force.arrowBase[1]]
    : force.force_dir || [0, 0];
  const matches = [];
  (window.sceneModel.candidates?.(task) || []).forEach(candidate => {
    let anchor = candidate.anchor;
    if(!anchor?.type){
      const type = candidate.kind === 'point' ? 'point' :
        candidate.kind === 'segment' ? 'segment' : null;
      if(!type) return;
      anchor = {type, ref:candidate.ref, point:candidate.point, segment:candidate.source?.segment};
    }
    if(anchor.type !== 'point' && anchor.type !== 'segment') return;
    const resolved = window.sceneModel.resolveAnchor(task, anchor);
    if(!resolved.valid) return;
    let pos = resolved.pos;
    if(anchor.type === 'segment'){
      const segment = candidate.segment || resolved.segment;
      if(!segment?.a || !segment?.b) return;
      const dx = segment.b[0] - segment.a[0], dy = segment.b[1] - segment.a[1];
      const lengthSquared = dx * dx + dy * dy;
      if(lengthSquared < 1e-16) return;
      const u = Math.max(0, Math.min(1,
        ((position[0] - segment.a[0]) * dx + (position[1] - segment.a[1]) * dy) / lengthSquared));
      pos = [segment.a[0] + u * dx, segment.a[1] + u * dy];
      anchor = {...anchor, u};
    }
    if(!Array.isArray(pos) || pos.length < 2 || !pos.every(Number.isFinite)) return;
    const distance = Math.hypot(position[0] - pos[0], position[1] - pos[1]);
    const integerCoordinates = position.every(Number.isInteger) && pos.every(Number.isInteger);
    if(distance >= (integerCoordinates ? 1e-8 : 1)) return;
    let pointsInward = false;
    if(anchor.type === 'segment' && /^rect(\d+)$/.test(anchor.ref)){
      const rect = task.scene.rects?.[Number(anchor.ref.match(/^rect(\d+)$/)[1])];
      if(rect?.bottomCenter){
        const normal = rect.n_vec || [0, -1];
        const center = [rect.bottomCenter[0] + normal[0] * rect.height / 2,
          rect.bottomCenter[1] + normal[1] * rect.height / 2];
        pointsInward = direction[0] * (center[0] - pos[0]) +
          direction[1] * (center[1] - pos[1]) > 1e-8;
      }
    }
    matches.push({anchor, pos, distance, pointsInward});
  });
  matches.sort((a, b) => {
    const aSegment = a.anchor.type === 'segment', bSegment = b.anchor.type === 'segment';
    return Number(bSegment) - Number(aSegment) ||
      Number(b.pointsInward) - Number(a.pointsInward) ||
      a.distance - b.distance;
  });
  return matches[0] || null;
};

window.syncSceneForceAnchors = function(task, manager, editorMode){
  if(!task?.scene || !manager || !window.sceneModel) return false;
  let changed = false;
  const pickerIndices = [];
  const moveForce = (force, pos) => {
    const dx = pos[0] - force.anchor[0], dy = pos[1] - force.anchor[1];
    if(Math.hypot(dx, dy) < 1e-8) return false;
    force.anchor = pos.slice();
    if(force.arrowBase) force.arrowBase = [force.arrowBase[0] + dx, force.arrowBase[1] + dy];
    if(force.arrowTip) force.arrowTip = [force.arrowTip[0] + dx, force.arrowTip[1] + dy];
    if(force.arrowBase && force.arrowTip) force.updateDirectionAndLength();
    return true;
  };
  manager.forces.forEach((force, index) => {
    if(force.drawing || force.dragging || !force.anchor || !force.name) return;
    let spec, prop, anchor;
    if(editorMode){
      const match = window.getForceSpec(force);
      if(!match) return;
      ({spec, prop} = match);
      anchor = spec[prop];
    } else {
      if(force.isExpected !== false) return;
      spec = (task.initialForces || []).find(s => s.name === force.name);
      if(!spec) return;
      prop = 'anchorSpec';
      anchor = spec.anchorSpec || (spec.anchorFrom ? {type: 'point', ref: spec.anchorFrom, point: spec.point} : null);
    }
    if(editorMode && anchor?.type === 'custom' && anchor.detachedReason && Array.isArray(anchor.pos)){
      const match = window.findSceneAnchorAtPosition(force, task);
      if(match){
        spec[prop] = match.anchor;
        moveForce(force, match.pos);
      } else {
        spec[prop] = {type:'custom', pos:force.anchor.slice()};
      }
      pickerIndices.push(index);
      changed = true;
      return;
    }
    if(anchor?.type !== 'point' && !(editorMode && anchor?.type === 'segment')) return;
    const resolved = window.sceneModel.resolveAnchor(task, {...anchor, pos:force.anchor});
    if(!resolved.valid || !resolved.pos){
      if(!editorMode) return;
      const match = window.findSceneAnchorAtPosition(force, task);
      if(match){
        spec[prop] = match.anchor;
        moveForce(force, match.pos);
      } else {
        spec[prop] = {type:'custom', pos:force.anchor.slice()};
      }
      pickerIndices.push(index);
      changed = true;
      return;
    }
    if(editorMode && anchor.type === 'segment' && resolved.segment){
      const dx = resolved.segment.b[0] - resolved.segment.a[0];
      const dy = resolved.segment.b[1] - resolved.segment.a[1];
      const lengthSquared = dx * dx + dy * dy;
      if(lengthSquared > 1e-16){
        const u = Math.max(0, Math.min(1,
          ((resolved.pos[0] - resolved.segment.a[0]) * dx +
            (resolved.pos[1] - resolved.segment.a[1]) * dy) / lengthSquared));
        if(!Number.isFinite(anchor.u) || Math.abs(anchor.u - u) > 1e-8){
          anchor.u = u;
          changed = true;
        }
      }
    }
    if(moveForce(force, resolved.pos)) changed = true;
    if(editorMode && force.isExpected === false){
      spec.anchor = force.anchor.slice();
      if(force.arrowBase) spec.arrowBase = force.arrowBase.slice();
      if(force.arrowTip) spec.arrowTip = force.arrowTip.slice();
    }
  });
  if(pickerIndices.length){
    window.pendingForceAnchorPickerIndices ||= [];
    pickerIndices.forEach(index => {
      if(!window.pendingForceAnchorPickerIndices.includes(index)){
        window.pendingForceAnchorPickerIndices.push(index);
      }
    });
  }
  return changed;
};

/**
 * Clear canvas: fill entire canvas with grey background, then fill grid area with white.
 * This function requires a canvas context to be passed.
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 */
window.clearCanvas = function(ctx) {
  if (!ctx) return;
  
  // Fill entire canvas with grey (background outside grid area)
  ctx.fillStyle = window.BG_COLOR;  // '#f0f0f0' - light grey
  ctx.fillRect(0, 0, window.CANVAS_WIDTH, window.CANVAS_HEIGHT);
  
  // Fill grid area with white, offset by (offsetX, offsetY)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(window.offsetX, window.offsetY, window.WIDTH, window.HEIGHT);
};

/**
 * Initialize scroll position to show grid area at top-left of viewport.
 * Scrolls container so (offsetX, offsetY) appears at the top-left of the viewport.
 */
window.initializeScroll = function() {
  const container = document.getElementById('canvas-container');
  if (container) {
    container.scrollLeft = window.offsetX;
    container.scrollTop = window.offsetY;
  }
};

/**
 * Clamp a position to stay within canvas bounds (including grey margins).
 * Canvas coordinate system is 0 to CANVAS_WIDTH horizontally, 0 to CANVAS_HEIGHT vertically.
 * Allows positions anywhere in the full canvas including grey areas.
 * @param {Array<number>} pos - Position [x, y] to clamp
 * @returns {Array<number>} Clamped position [x, y]
 */
window.clampToCanvas = function(pos) {
  if (!pos || pos.length < 2) return [0, 0];
  
  // Full canvas extends from -offsetX to (WIDTH - offsetX) when in grid coords
  // But positions are stored in canvas coords: 0 to CANVAS_WIDTH, 0 to CANVAS_HEIGHT
  // Clamp to negative values (left/top margins) and positive (right/bottom margins)
  const minX = -window.offsetX;
  const maxX = window.WIDTH + window.offsetX;
  const minY = -window.offsetY;
  const maxY = window.HEIGHT + window.offsetY;
  
  const x = Math.max(minX, Math.min(pos[0], maxX));
  const y = Math.max(minY, Math.min(pos[1], maxY));
  
  return [x, y];
};

/**
 * Helper functions for task geometry (extracted from tasks.js)
 */

// Vector magnitude/norm
window.norm = function(v) { 
  return window.geometry && window.geometry.length ? window.geometry.length(v) : Math.sqrt(v[0]*v[0] + v[1]*v[1]);
};

// Normalize vector to unit length
window.unit = function(v) { 
  const n = window.norm(v); 
  return n > 1e-6 ? [v[0]/n, v[1]/n] : [0, 0];
};

// Get plane normal vector from rotation angle (degrees)
window.planeNormalFromAngle = function(angleDeg) {
  const a = angleDeg * Math.PI / 180;
  // Python logic: nx=-sin(a), ny=-cos(a) (y down)
  return window.unit([-Math.sin(a), -Math.cos(a)]);
};

// Get plane tangent vector from rotation angle (degrees)
window.planeTangentFromAngle = function(angleDeg) {
  const a = angleDeg * Math.PI / 180;
  // (y-positive down) tangent t = (cos(a), -sin(a))
  return window.unit([Math.cos(a), -Math.sin(a)]);
};

// Get tangent vector perpendicular to normal
window.tangentFromNormal = function(n) { 
  return window.unit([-n[1], n[0]]);
};

window.getTaskPositionLabel = function(task){
  const tasks = Array.isArray(window.tasks) ? window.tasks : [];
  const index = tasks.findIndex(item => item && item.id === task?.id);
  return `Oppgave ${index >= 0 ? index + 1 : (window.currentTaskIndex || 0) + 1}`;
};

window.loadSupportedTaskSchema = async function(){
  const taskFiles = new Set(['taskset_Default.json']);
  try{
    const response = await fetch('oppgavesett.json',{cache:'no-store'});
    if(!response.ok) throw new Error('HTTP ' + response.status);
    const manifest = await response.json();
    if(Array.isArray(manifest)) manifest.forEach(item => {if(item?.file) taskFiles.add(item.file);});
  }catch(error){
    console.warn('Kunne ikke hente oppgavesettlisten for skjemakontroll:',error);
  }
  const results = await Promise.all(Array.from(taskFiles,async file => {
    try{
      const response = await fetch(encodeURI(file),{cache:'no-store'});
      if(!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      return (Array.isArray(data) ? data : data.tasks || []).filter(task => task && task.id);
    }catch(error){
      console.warn(`Kunne ikke hente oppgaveskjema fra ${file}:`,error);
      return [];
    }
  }));
  return results.flat();
};

window.AppVersioning = (function(){
  const modeInfo = {
    player: {time:window.PLAYER_BUILD_TIME || window.BUILD_TIME || 'ukjent', key:'tk_app_version', prefix:'tk_'},
    editor: {time:window.EDITOR_BUILD_TIME || window.BUILD_TIME || 'ukjent', key:'editor_app_version', prefix:'editor_'}
  };

  function collectSchema(values){
    const objectKeys = new Set();
    const requiredKeys = values.length && values.every(value => value && typeof value === 'object' && !Array.isArray(value))
      ? Object.keys(values[0]) : [];
    values.forEach(value => {
      if(value && typeof value === 'object' && !Array.isArray(value)){
        Object.keys(value).forEach(key => objectKeys.add(key));
      }
    });
    const sharedRequired = requiredKeys.filter(key => values.every(value => Object.hasOwn(value, key)));
    const children = {};
    objectKeys.forEach(key => {
      const present = values.filter(value => value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, key)).map(value => value[key]);
      children[key] = collectSchema(present);
    });
    const arrayItems = values.filter(Array.isArray).flat();
    return {
      objectKeys,
      requiredKeys:sharedRequired,
      children,
      item:arrayItems.length ? collectSchema(arrayItems) : null
    };
  }

  function diff(value, schema, path, missing, unknown){
    if(Array.isArray(value)){
      if(schema.item) value.forEach((item,index) => diff(item,schema.item,`${path}[${index}]`,missing,unknown));
      return;
    }
    if(!value || typeof value !== 'object') return;
    schema.requiredKeys.forEach(key => {
      if(!Object.hasOwn(value,key)) missing.push(`${path}.${key}`);
    });
    Object.keys(value).forEach(key => {
      if(!schema.objectKeys.has(key)){
        unknown.push(`${path}.${key}`);
      }else if(schema.children[key]){
        diff(value[key],schema.children[key],`${path}.${key}`,missing,unknown);
      }
    });
  }

  function supportedTaskSchema(reference){
    const schema = collectSchema([{tasks:Array.isArray(reference) ? reference : reference ? [reference] : []}]);
    const task = schema.children.tasks?.item;
    const optional = collectSchema([
      {role:'force',componentOf:'',studentGiven:{}},
      {studentGiven:{name:false}},
      {studentGiven:{role:false}},
      {}
    ]);
    for(const collection of ['expectedForces','initialForces']){
      const force = task?.children[collection]?.item;
      if(!force) continue;
      optional.objectKeys.forEach(key=>{
        force.objectKeys.add(key);
        force.children[key] = optional.children[key];
      });
      force.requiredKeys = force.requiredKeys.filter(key=>!optional.objectKeys.has(key));
      if(collection==='expectedForces'){
        const answer=collectSchema([{drawn:{anchor:[0,0],arrowBase:[0,0],arrowTip:[0,0]}},{}]);
        force.objectKeys.add('drawn');
        force.children.drawn ||= answer.children.drawn;
        force.requiredKeys=force.requiredKeys.filter(key=>key!=='drawn');
      }
    }
    const relation = task?.children.relations?.item;
    if(relation){
      const tolerances = collectSchema([{ratio:1,tol_rel:0.05,tol_abs:2},{}]);
      tolerances.objectKeys.forEach(key=>{
        relation.objectKeys.add(key);
        relation.children[key] = tolerances.children[key];
      });
      relation.requiredKeys = relation.requiredKeys.filter(key=>!tolerances.objectKeys.has(key));
    }
    return schema;
  }

  function filter(value,schema){
    if(Array.isArray(value)) return schema.item ? value.map(item => filter(item,schema.item)) : value;
    if(!value || typeof value !== 'object') return value;
    const result = {};
    Object.keys(value).forEach(key => {
      if(schema.objectKeys.has(key)){
        result[key] = schema.children[key] ? filter(value[key],schema.children[key]) : value[key];
      }
    });
    return result;
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function confirmMismatch({mode,source,oldTime,data,reference}){
    const schema = supportedTaskSchema(reference);
    const missing = [], unknown = [];
    const wrappedData = {tasks:data};
    if(data && schema.objectKeys.size) diff(wrappedData,schema,'$',missing,unknown);
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal';
      overlay.style.zIndex = '10000';
      const box = document.createElement('div');
      box.className = 'modal-content';
      const currentTime = modeInfo[mode].time;
      const allRows = [
        ...missing.map(path => `<li>Mangler: <code>${escapeHtml(path)}</code></li>`),
        ...unknown.map(path => `<li>Ukjent og blir utelatt: <code>${escapeHtml(path)}</code></li>`)
      ];
      const rows = allRows.slice(0,100);
      if(allRows.length > rows.length) rows.push(`<li>... og ${allRows.length - rows.length} flere avvik</li>`);
      box.innerHTML = `<h2>Ulik programversjon</h2>
        <p>${escapeHtml(source)} er lagret med versjon ${escapeHtml(oldTime || 'ukjent')}. Denne versjonen er fra ${escapeHtml(currentTime)}.</p>
        <p>Eldre programversjon (${escapeHtml(oldTime || 'ukjent')}) må eventuelt lastes manuelt. «Åpne uansett» beholder bare felter og strukturer som finnes i dagens datasett; ukjente felter blir utelatt.</p>
        <div style="max-height:240px;overflow:auto;"><ul>${rows.length ? rows.join('') : '<li>Fant ingen feltavvik mot oppgavestrukturen som er tilgjengelig nå.</li>'}</ul></div>`;
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Åpne uansett';
      open.addEventListener('click',() => {
        overlay.remove();
        resolve({approved:true, data:schema.objectKeys.size ? filter(wrappedData,schema).tasks : data});
      });
      box.appendChild(open);
      if(source === 'localStorage'){
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = 'Full reset';
        reset.addEventListener('click',() => {
          if(!window.confirm(`Full reset sletter alle lokale ${mode === 'editor' ? 'editor' : 'elevmodus'}-data i denne nettleseren. Andre nettsteders data berøres ikke. Fortsette?`)) return;
          const keys=[];
          for(let index=0; index<localStorage.length; index++){
            const key=localStorage.key(index);
            if(key?.startsWith(modeInfo[mode].prefix)) keys.push(key);
          }
          for(const key of keys){
            try{
              localStorage.removeItem(key);
            }catch(error){
              console.error(`Kunne ikke slette lokal data ${key} ved full reset:`,error);
              window.alert(`Full reset ble avbrutt fordi lokal data ikke kunne slettes: ${key}`);
              return;
            }
          }
          stamp(mode);
          overlay.remove();
          resolve({approved:true,reset:true});
        });
        box.appendChild(reset);
      }
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  function stamp(mode){
    const info = modeInfo[mode];
    try{ localStorage.setItem(info.key,info.time); }catch(error){ console.warn('Kunne ikke lagre programversjon:',error); }
  }

  function checkStorage(mode,reference,prepare){
    const info = modeInfo[mode];
    const keys = [];
    for(let index=0; index<localStorage.length; index++){
      const key = localStorage.key(index);
      if(key && key.startsWith(info.prefix) && key !== info.key) keys.push(key);
    }
    const storedTime = read(mode);
    if(!keys.length || storedTime === info.time){
      if(prepare) prepare();
      stamp(mode);
      return Promise.resolve(true);
    }
    const taskPrefix = mode === 'editor' ? 'editor_task_' : 'tk_task_';
    const taskEntries = keys.filter(key => key.startsWith(taskPrefix) && !key.startsWith(`${taskPrefix}lock_`)).map(key => {
      try{return {key,task:JSON.parse(localStorage.getItem(key))};}catch{return {key,task:null};}
    }).filter(entry => entry.task && typeof entry.task === 'object');
    const tasks = taskEntries.map(entry => entry.task);
    return confirmMismatch({mode,source:'localStorage',oldTime:storedTime,data:tasks,reference}).then(result => {
      if(!result.approved) return false;
      if(result.reset) return true;
      if(prepare) prepare();
      const currentTaskEntries = [];
      for(let index=0; index<localStorage.length; index++){
        const key = localStorage.key(index);
        if(!key || !key.startsWith(taskPrefix) || key.startsWith(`${taskPrefix}lock_`)) continue;
        try{
          const task = JSON.parse(localStorage.getItem(key));
          if(task && typeof task === 'object') currentTaskEntries.push({key,task});
        }catch(error){console.warn(`Kunne ikke lese lagret oppgave ${key}:`,error);}
      }
      const schema = supportedTaskSchema(reference);
      const taskSchema = schema.children.tasks?.item;
      const byId = new Map();
      currentTaskEntries.forEach(entry => {
        const task = taskSchema ? filter(entry.task,taskSchema) : entry.task;
        if(!task || !task.id) return;
        localStorage.setItem(entry.key,JSON.stringify(task));
        byId.set(task.id,task);
      });
      const knownIds = new Set([...byId.keys(),...(Array.isArray(reference) ? reference : []).map(task => task?.id).filter(Boolean)]);
      currentTaskEntries.forEach(entry => {if(!byId.has(entry.task.id)) localStorage.removeItem(entry.key);});
      const orderKey = mode === 'editor' ? 'editor_taskOrder' : 'tk_taskOrder';
      try{
        const order = JSON.parse(localStorage.getItem(orderKey) || '[]');
        localStorage.setItem(orderKey,JSON.stringify(order.filter(id => knownIds.has(id))));
      }catch(error){console.warn('Kunne ikke filtrere oppgaverekkefølgen:',error);}
      stamp(mode);
      return true;
    });
  }

  function read(mode){
    const info = modeInfo[mode];
    try{return localStorage.getItem(info.key);}catch(error){console.warn('Kunne ikke lese programversjon:',error);return null;}
  }

  return {
    time(mode){return modeInfo[mode].time;},
    stamp,
    read,
    checkStorage,
    checkImport(data,mode,source,reference){
      const sourceTime = data?.metadata?.appVersion || data?.appVersion || null;
      if(sourceTime === modeInfo[mode].time) return Promise.resolve({approved:true,data});
      let tasks = Array.isArray(data) ? data : data?.tasks;
      let storageTaskKeys = [];
      if(!Array.isArray(tasks) && data?.localStorage && typeof data.localStorage === 'object'){
        tasks = [];
        storageTaskKeys = Object.keys(data.localStorage).filter(key => /^(editor|tk)_task_/.test(key));
        storageTaskKeys.forEach(key => {
          try{
            const task = JSON.parse(data.localStorage[key]);
            if(task && task.id) tasks.push(task);
          }catch(error){console.warn(`Kunne ikke lese ${key} fra backup:`,error);}
        });
      }
      if(!Array.isArray(tasks)) return Promise.resolve({approved:true,data});
      return confirmMismatch({mode,source,oldTime:sourceTime,data:tasks,reference}).then(result => {
        if(Array.isArray(data)) return {...result,data:result.data};
        if(Array.isArray(data?.tasks)) return {...result,data:{...data,tasks:result.data}};
        if(storageTaskKeys.length){
          const keptIds = new Set(result.data.map(task => task.id));
          const localStorageCopy = {...data.localStorage};
          storageTaskKeys.forEach(key => {
            let id = key.slice(key.indexOf('_task_') + 6);
            if(!keptIds.has(id)) delete localStorageCopy[key];
            else{
              const task = result.data.find(item => item.id === id);
              localStorageCopy[key] = JSON.stringify(task);
            }
          });
          return {...result,data:{...data,localStorage:localStorageCopy}};
        }
        return {...result,data};
      });
    },
    confirmMismatch
  };
})();
