// scene_render.js - draw task scene objects (plane + rects subset)
(function(){
  const GRID_STEP = window.GRID_STEP || 20;
  const WIDTH = window.WIDTH || 1000;
  const HEIGHT = window.HEIGHT || 640;
  const GRID_COLOR = window.GRID_COLOR || '#dcdcdc';

  function drawGrid(ctx){
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WIDTH; x += GRID_STEP) {
      ctx.moveTo(x + 0.5, 0); // +0.5 for crisp lines
      ctx.lineTo(x + 0.5, HEIGHT);
    }
    for (let y = 0; y <= HEIGHT; y += GRID_STEP) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(WIDTH, y + 0.5);
    }
    ctx.stroke();
  }

  function drawGuidelines(ctx){
    if(!window.enableGuidelines || !window.currentGuidelines) return;
    ctx.lineWidth = 1;
    window.currentGuidelines.forEach(gl=>{
      ctx.strokeStyle = gl.color || '#ccc';
      if(gl.dashed){ ctx.setLineDash([8,6]); } else { ctx.setLineDash([]); }
      ctx.beginPath(); ctx.moveTo(gl.a[0] + 0.5, gl.a[1] + 0.5); ctx.lineTo(gl.b[0] + 0.5, gl.b[1] + 0.5); ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  function drawPlane(ctx, plane){
    if(!plane) return;
    const through = plane.through;
    const tx = plane.t_vec ? plane.t_vec[0] : Math.cos((plane.angleDeg||0)*Math.PI/180);
    const ty = plane.t_vec ? plane.t_vec[1] : -Math.sin((plane.angleDeg||0)*Math.PI/180);
    const span = 1400;
    const ax = through[0] - tx*span/2;
    const ay = through[1] - ty*span/2;
    const bx = through[0] + tx*span/2;
    const by = through[1] + ty*span/2;
    ctx.strokeStyle = plane.color || '#777';
    ctx.lineWidth = plane.lineWidth || 4;
    ctx.beginPath(); ctx.moveTo(ax + 0.5, ay + 0.5); ctx.lineTo(bx + 0.5, by + 0.5); ctx.stroke();
  }

  function rectPoints(r){
    const w = r.width, h = r.height;
    const bc = r.bottomCenter;
    // Use precomputed unit tangent (t_vec) and normal (n_vec) if present
    const t = r.t_vec || [1,0];
    const n = r.n_vec || [0,-1];
    // Bottom edge endpoints
    const halfW = w/2;
    const bottomLeft = [ bc[0] - t[0]*halfW, bc[1] - t[1]*halfW ];
    const bottomRight= [ bc[0] + t[0]*halfW, bc[1] + t[1]*halfW ];
    // Top center is bottomCenter + n*h (n points "up" / opposite gravity)
    const topCenter = [ bc[0] + n[0]*h, bc[1] + n[1]*h ];
    const topLeft  = [ topCenter[0] - t[0]*halfW, topCenter[1] - t[1]*halfW ];
    const topRight = [ topCenter[0] + t[0]*halfW, topCenter[1] + t[1]*halfW ];
    const center   = [ bc[0] + n[0]*(h/2), bc[1] + n[1]*(h/2) ];
    return {
      bottomLeft, bottomRight,
      topLeft, topRight,
      center,
      right_middle:[ center[0] + t[0]*halfW, center[1] + t[1]*halfW ],
      left_middle:[ center[0] - t[0]*halfW, center[1] - t[1]*halfW ],
      top_center: topCenter,
      bottom_center: bc
    };
  }

  function drawRect(ctx, r){
    const pts = rectPoints(r);
    ctx.strokeStyle = r.color || '#4090ff';
    ctx.lineWidth = r.lineWidth || 2;
    if(r.body === 'dashed') ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(pts.bottomLeft[0] + 0.5, pts.bottomLeft[1] + 0.5);
    ctx.lineTo(pts.bottomRight[0] + 0.5, pts.bottomRight[1] + 0.5);
    ctx.lineTo(pts.topRight[0] + 0.5, pts.topRight[1] + 0.5);
    ctx.lineTo(pts.topLeft[0] + 0.5, pts.topLeft[1] + 0.5);
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSegment(ctx, s){
    ctx.strokeStyle = s.color || '#222';
    ctx.lineWidth = s.lineWidth || 2;
    if(s.body === 'dashed') ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(s.a[0] + 0.5, s.a[1] + 0.5); ctx.lineTo(s.b[0] + 0.5, s.b[1] + 0.5); ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCircle(ctx, c){
    ctx.strokeStyle = c.color || '#999';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.center[0], c.center[1], c.radius, 0, Math.PI*2); ctx.stroke();
    if(c.fill_color){ ctx.fillStyle = c.fill_color; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(c.center[0], c.center[1], c.radius, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha=1.0; }
  }

  function drawEllipse(ctx, e){
    const cx = e.center[0];
    const cy = e.center[1];
    const rx = e.width / 2;
    const ry = e.height / 2;
    
    // Use t_vec for rotation angle (t_vec is the width direction)
    const t = e.t_vec || [1, 0];
    const angle = Math.atan2(t[1], t[0]);
    
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = e.color || '#4090ff';
    ctx.lineWidth = e.lineWidth || 2;
    if(e.body === 'dashed') ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    if(e.fill_color){ ctx.fillStyle = e.fill_color; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha=1.0; }
    ctx.restore();
  }

  function drawArrow(ctx, a){
    const dx = a.b[0]-a.a[0]; const dy = a.b[1]-a.a[1];
    const ang = Math.atan2(dy,dx);
    const len = Math.hypot(dx,dy);
    const head = 12; const tEnd = 1 - head/len;
    const bodyEnd = [a.a[0]+dx*tEnd, a.a[1]+dy*tEnd];
    ctx.strokeStyle = a.color || '#00f';
    ctx.lineWidth = 2;
    if(a.body==='dashed'){
      ctx.setLineDash([8,6]);
    }
    ctx.beginPath(); ctx.moveTo(a.a[0] + 0.5, a.a[1] + 0.5); ctx.lineTo(bodyEnd[0] + 0.5, bodyEnd[1] + 0.5); ctx.stroke();
    ctx.setLineDash([]);
    // head
    const left=[a.b[0]-12*Math.cos(ang-Math.PI/6), a.b[1]-12*Math.sin(ang-Math.PI/6)];
    const right=[a.b[0]-12*Math.cos(ang+Math.PI/6), a.b[1]-12*Math.sin(ang+Math.PI/6)];
    ctx.fillStyle = a.color || '#00f';
    ctx.beginPath(); ctx.moveTo(a.b[0] + 0.5, a.b[1] + 0.5); ctx.lineTo(left[0] + 0.5, left[1] + 0.5); ctx.lineTo(right[0] + 0.5, right[1] + 0.5); ctx.closePath(); ctx.fill();
  }

  function drawText(ctx, t, textIndex, allTexts){
    // Calculate position: if linked and not first text, position below previous text
    let pos = t.pos;
    if(t.linked && textIndex > 0 && allTexts) {
      // Find the previous text element (not filtered by _isShortLines)
      const prevText = allTexts[textIndex - 1];
      if(prevText && prevText._renderedPos) {
        const prevY = prevText._renderedPos[1];
        const prevX = prevText._renderedPos[0];
        const prevSize = prevText.size || 14;
        const padding = 5;
        const newY = prevY + prevSize + padding;
        pos = [prevX, newY];
      }
    }
    // Store the actual rendered position for linked texts
    t._renderedPos = pos;
    
    drawFormattedText(ctx, t.txt, pos[0], pos[1], {size:t.size||14, color:t.color||'#000', align:t.align||'left'});
    
    // Draw bounding box if this text is selected in editor
    if(window.selectedSceneElement && window.selectedSceneElement.type === 'text' && window.selectedSceneElement.index === textIndex) {
      const baseSize = t.size || 14;
      ctx.save();
      ctx.font = `${baseSize}px Segoe UI, Arial`;
      const metrics = ctx.measureText(t.txt);
      const width = metrics.width;
      const height = baseSize * 1.2;  // Slightly larger for padding
      const align = t.align || 'left';
      
      // Calculate bounding box position based on text alignment
      let boxX = pos[0];
      if(align === 'center') {
        boxX = pos[0] - width / 2;
      } else if(align === 'right') {
        boxX = pos[0] - width;
      }
      const boxY = pos[1] - height / 2;
      
      // Draw bounding box with handle color
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX - 2, boxY - 2, width + 4, height + 4);
      ctx.restore();
    }
  }

  function drawScene(ctx, task){
    if(!task) return;
    const planeDef = task.scene.plane;
    if(planeDef && planeDef.draw === true){ drawPlane(ctx, planeDef); }
    if(task.scene.rects){ task.scene.rects.forEach(r=>drawRect(ctx,r)); }
    if(task.scene.segments){ task.scene.segments.forEach(s=>drawSegment(ctx,s)); }
    if(task.scene.circles){ task.scene.circles.forEach(c=>drawCircle(ctx,c)); }
    if(task.scene.ellipses){ task.scene.ellipses.forEach(e=>drawEllipse(ctx,e)); }
    if(task.scene.arrows){ task.scene.arrows.forEach(a=>drawArrow(ctx,a)); }
    if(task.scene.texts){ task.scene.texts.forEach((t,idx)=>drawText(ctx,t,idx,task.scene.texts)); }
  }

  function buildSceneLookup(task){
    const lookup = {};
    if(!task) return lookup;
    // Add origin if defined
    if(task.origin){
      lookup['origin'] = {
        snapping: true,
        points: { center: task.origin },
        segments: {}
      };
    }
    if(task.scene.rects){
      task.scene.rects.forEach((r,i)=>{
        const id='rect'+i;
        const snappingEnabled = (r.snapping !== false);
        const pts = rectPoints(r);
        lookup[id]={
          snapping: snappingEnabled,
          points: snappingEnabled ? {
            center:pts.center,
            right_middle:pts.right_middle,
            left_middle:pts.left_middle,
            top_center:pts.top_center,
            bottom_center:pts.bottom_center
          } : {},
          segments: snappingEnabled ? {
            bottom:[pts.bottomLeft, pts.bottomRight],
            top:[pts.topLeft, pts.topRight],
            right:[pts.bottomRight, pts.topRight],
            left:[pts.bottomLeft, pts.topLeft]
          } : {}
        };
      });
    }
    // Add circles snap points if snapping enabled
    if(task.scene.circles){
      task.scene.circles.forEach((c,i)=>{
        const id='circle'+i;
        const snappingEnabled = (c.snapping !== false);
        lookup[id]={
          snapping: snappingEnabled,
          points: snappingEnabled ? {
            center: c.center
          } : {},
          segments: {}
        };
      });
    }
    // Add ellipses snap points if snapping enabled
    if(task.scene.ellipses){
      task.scene.ellipses.forEach((e,i)=>{
        const id='ellipse'+i;
        const snappingEnabled = (e.snapping !== false);
        lookup[id]={
          snapping: snappingEnabled,
          points: snappingEnabled ? {
            center: e.center
          } : {},
          segments: {}
        };
      });
    }
    return lookup;
  }

  window.drawScene = drawScene;
  window.buildSceneLookup = buildSceneLookup;
  window.drawGrid = drawGrid;
  window.drawGuidelines = drawGuidelines;
})();
