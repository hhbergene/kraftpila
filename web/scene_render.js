// scene_render.js - draw task scene objects (plane + rects subset)
(function(){
  const GRID_STEP = window.GRID_STEP || 20;
  const WIDTH = window.WIDTH || 1000;
  const HEIGHT = window.HEIGHT || 640;
  const GRID_COLOR = window.GRID_COLOR || '#dcdcdc';
  const textGeometryCache = new WeakMap();

  window.isTaskTitleText = function(task,text){
    const title = typeof task?.title === 'string' ? task.title.trim() : '';
    return !!title && typeof text?.txt === 'string' && text.txt.trim() === title;
  };

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
      ctx.lineWidth = gl.lineWidth || 1;
      ctx.strokeStyle = gl.color || '#ccc';
      if(gl.dashed){ ctx.setLineDash(gl.dash || [8,6]); } else { ctx.setLineDash([]); }
      ctx.beginPath(); ctx.moveTo(gl.a[0] + 0.5, gl.a[1] + 0.5); ctx.lineTo(gl.b[0] + 0.5, gl.b[1] + 0.5); ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  function drawForceGridTrace(ctx,force){
    if(!window.enableGuidelines || !force) return;
    const g=window.geometry,base=force.arrowBase,tip=force.arrowTip;
    if(!g.finitePoint(base)||!g.finitePoint(tip)) return;
    if(base.every(value=>Math.abs(value-Math.round(value/GRID_STEP)*GRID_STEP)<=1e-8)) return;
    const length=g.distance(base,tip);
    if(!Number.isFinite(length)||length<1e-6) return;
    const t=[(tip[0]-base[0])/length,(tip[1]-base[1])/length];
    const n=[-t[1],t[0]],halfWidth=GRID_STEP/2,arm=GRID_STEP/2;
    const corners=[
      [base[0]+n[0]*halfWidth,base[1]+n[1]*halfWidth],
      [tip[0]+n[0]*halfWidth,tip[1]+n[1]*halfWidth],
      [tip[0]-n[0]*halfWidth,tip[1]-n[1]*halfWidth],
      [base[0]-n[0]*halfWidth,base[1]-n[1]*halfWidth]
    ];
    const major=Math.abs(t[0])>=Math.abs(t[1])?0:1,minor=1-major;
    const first=Math.ceil((Math.min(...corners.map(p=>p[major]))-arm-base[major])/GRID_STEP);
    const last=Math.floor((Math.max(...corners.map(p=>p[major]))+arm-base[major])/GRID_STEP);
    // Enumerate a narrow strip, not the full bounding box of a diagonal arrow.
    const margin=(halfWidth+arm*Math.SQRT2)/Math.abs(t[major]);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...corners[0]);
    for(const corner of corners.slice(1)) ctx.lineTo(...corner);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle='#8296aa';
    ctx.lineWidth=1;
    ctx.setLineDash([]);
    ctx.beginPath();
    for(let i=first;i<=last;i++){
      const along=i*GRID_STEP,center=along*t[minor]/t[major];
      const low=Math.ceil((center-margin)/GRID_STEP),high=Math.floor((center+margin)/GRID_STEP);
      for(let j=low;j<=high;j++){
        const point=base.slice();
        point[major]+=along;
        point[minor]+=j*GRID_STEP;
        ctx.moveTo(point[0]-arm,point[1]);ctx.lineTo(point[0]+arm,point[1]);
        ctx.moveTo(point[0],point[1]-arm);ctx.lineTo(point[0],point[1]+arm);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPlane(ctx, plane, isDim){
    if(!plane) return;
    const through = plane.through;
    const tx = plane.t_vec ? plane.t_vec[0] : Math.cos((plane.angleDeg||0)*Math.PI/180);
    const ty = plane.t_vec ? plane.t_vec[1] : -Math.sin((plane.angleDeg||0)*Math.PI/180);
    const span = 1400;
    const ax = through[0] - tx*span/2;
    const ay = through[1] - ty*span/2;
    const bx = through[0] + tx*span/2;
    const by = through[1] + ty*span/2;
    
    // Apply dim opacity if isDim flag is set
    if(isDim) ctx.globalAlpha = 0.5;
    ctx.strokeStyle = plane.color || '#777';
    ctx.lineWidth = plane.lineWidth || 4;
    if(plane.body === 'dashed') ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(ax + 0.5, ay + 0.5); ctx.lineTo(bx + 0.5, by + 0.5); ctx.stroke();
    ctx.setLineDash([]);
    if(isDim) ctx.globalAlpha = 1.0;
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

  function ellipseAnchors(e){
    const points={center:cp(e.center)};
    const g=window.geometry;
    (g?.ellipseBoundaryPoints(e)||[]).forEach(p=>{points[p.name]=p.pos;});
    return points;
  }
  function lookupCurves(task,lookup){
    (task?.scene?.ellipses||[]).forEach((ellipse,i)=>{
      if(lookup[`ellipse${i}`])lookup[`ellipse${i}`].curves={outline:modelGeometry.sampleEllipse(ellipse)};
    });
    return lookup;
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

  function drawEllipse(ctx, e){
    const cx = e.center[0];
    const cy = e.center[1];
    const rx = e.width / 2;
    const ry = e.height / 2;
    
    // Use t_vec for rotation angle (t_vec is the width direction)
    const t = e.t_vec || (e.n_vec ? [-e.n_vec[1],e.n_vec[0]] : [1, 0]);
    const angle = Math.atan2(t[1], t[0]);
    
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = e.color || '#4090ff';
    ctx.lineWidth = e.lineWidth || 2;
    if(e.body === 'dashed') ctx.setLineDash([8, 6]);
    const start = Number.isFinite(e.startAngleDeg) ? e.startAngleDeg : 0;
    const end = Number.isFinite(e.endAngleDeg) ? e.endAngleDeg : 360;
    let sweep = ((end-start)%360+360)%360;
    if(Math.abs(sweep) < 1e-10 && Math.abs(end-start) >= 360-1e-10) sweep = 360;
    const hasArc = sweep > 1e-10;
    const startRad = -start*Math.PI/180;
    const endRad = startRad - sweep*Math.PI/180;
    if(hasArc && e.fill_color){
      ctx.fillStyle = e.fill_color;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(rx*Math.cos(startRad), ry*Math.sin(startRad));
      for(let i=1;i<=Math.max(2,Math.ceil(sweep/4));i++){
        const a = startRad - sweep*Math.PI/180*i/Math.max(2,Math.ceil(sweep/4));
        ctx.lineTo(rx*Math.cos(a), ry*Math.sin(a));
      }
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1.0;
    }
    if(hasArc){
      ctx.beginPath();
      const steps = Math.max(1,Math.ceil(sweep/4));
      for(let i=0;i<=steps;i++){
        const a = startRad - sweep*Math.PI/180*i/steps;
        const x = rx*Math.cos(a), y = ry*Math.sin(a);
        if(i===0) ctx.moveTo(x+0.5,y+0.5); else ctx.lineTo(x+0.5,y+0.5);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawArrow(ctx, a){
    const dx = a.b[0]-a.a[0]; const dy = a.b[1]-a.a[1];
    const ang = Math.atan2(dy,dx);
    const len = Math.hypot(dx,dy);
    if(len <= 1e-8) return;
    const requestedHeadLength = Number.isFinite(a.arrowHeadLength) ? a.arrowHeadLength : 12;
    const head = Math.min(Math.max(4, requestedHeadLength), len);
    const tEnd = 1 - head/len;
    const bodyEnd = [a.a[0]+dx*tEnd, a.a[1]+dy*tEnd];
    ctx.save();
    ctx.strokeStyle = a.color || '#00f';
    ctx.lineWidth = Number.isFinite(a.lineWidth) && a.lineWidth > 0 ? a.lineWidth : 2;
    ctx.setLineDash(a.body==='dashed' ? [8,6] : []);
    ctx.beginPath(); ctx.moveTo(a.a[0] + 0.5, a.a[1] + 0.5); ctx.lineTo(bodyEnd[0] + 0.5, bodyEnd[1] + 0.5); ctx.stroke();
    // head
    const left=[a.b[0]-head*Math.cos(ang-Math.PI/6), a.b[1]-head*Math.sin(ang-Math.PI/6)];
    const right=[a.b[0]-head*Math.cos(ang+Math.PI/6), a.b[1]-head*Math.sin(ang+Math.PI/6)];
    ctx.fillStyle = a.color || '#00f';
    ctx.beginPath(); ctx.moveTo(a.b[0] + 0.5, a.b[1] + 0.5); ctx.lineTo(left[0] + 0.5, left[1] + 0.5); ctx.lineTo(right[0] + 0.5, right[1] + 0.5); ctx.closePath(); ctx.fill();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function updateTextPositions(task){
    const texts = task?.scene?.texts || [];
    texts.forEach((text,index)=>{
      if(!text) return;
      // Missing pos is the legacy export representation of a linked text.
      if(index>0 && !text.pos) text.linked = true;
      if(index===0 && text.linked) text.linked = false;
      if(index>0 && text.linked){
        const previous = texts[index-1];
        if(!validPos(previous?._renderedPos)){
          delete text._renderedPos;
          console.warn('updateTextPositions: invalid previous text position', index);
          return;
        }
        text.pos = [previous.pos[0],previous.pos[1]+(previous.size || 14)+5];
      }
      if(validPos(text.pos)) text._renderedPos = text.pos.slice();
      else delete text._renderedPos;
    });
  }

  function textRootIndex(texts,index){
    while(index>0 && texts[index]?.linked) index--;
    return index;
  }

  function textAngle(text){
    if(Number.isFinite(text.angle_deg)) return text.angle_deg*Math.PI/180;
    if(Array.isArray(text.n_vec) && text.n_vec.length===2 &&
       text.n_vec.every(Number.isFinite) && Math.hypot(...text.n_vec)>1e-8){
      const tangent=window.geometry.tangentFromNormal(text.n_vec);
      return Math.atan2(tangent[1],tangent[0]);
    }
    return 0;
  }

  function normalizeTextRotation(text){
    if(Number.isFinite(text?.angle_deg)){
      delete text.n_vec;
      return 'angle';
    }
    if(Array.isArray(text?.n_vec) && text.n_vec.length===2 &&
       text.n_vec.every(Number.isFinite) && Math.hypot(...text.n_vec)>1e-8){
      const length=Math.hypot(...text.n_vec);
      text.n_vec=text.n_vec.map(value=>value/length);
      delete text.angle_deg;
      return 'normal';
    }
    delete text.angle_deg;
    delete text.n_vec;
    return 'none';
  }

  function getTextGeometry(ctx,text){
    const pos=text?._renderedPos || text?.pos;
    if(!validPos(pos) || typeof text.txt!=='string' || !text.txt.trim()) return null;
    const size=text.size||14;
    const angle=textAngle(text);
    const align=text.align||(Number.isFinite(text.angle_deg)||text.n_vec?'center':'left');
    const fontFamily=Number.isFinite(text.angle_deg)||text.n_vec?'Segoe UI, Arial':'Arial';
    const key=JSON.stringify([text.txt,size,align,fontFamily,angle,pos]);
    const cached=textGeometryCache.get(text);
    if(cached?.key===key) return cached.geometry;
    const layout=window.layoutFormattedText(ctx,text.txt,0,0,{size,align,fontFamily});
    if(!layout.segments.length) return null;
    const top=layout.top-2,bottom=layout.bottom+2,left=layout.left-2,right=layout.right+2;
    const cos=Math.cos(angle),sin=Math.sin(angle);
    const world=(x,y)=>[pos[0]+x*cos-y*sin,pos[1]+x*sin+y*cos];
    const corners=[
      world(left,top),world(right,top),world(right,bottom),world(left,bottom)
    ];
    const middleY=(top+bottom)/2;
    const geometry={
      angle,layout,corners,
      centerline:[world(layout.left,middleY),world(layout.right,middleY)],
      contains(point){
        const dx=point[0]-pos[0],dy=point[1]-pos[1];
        const localX=dx*cos+dy*sin,localY=-dx*sin+dy*cos;
        return localX>=left && localX<=right && localY>=top && localY<=bottom;
      }
    };
    textGeometryCache.set(text,{key,geometry});
    return geometry;
  }

  function drawText(ctx, t, textIndex){
    const pos = t._renderedPos;
    // Ensure pos is defined before using it
    if(!pos || !Array.isArray(pos) || pos.length < 2) {
      console.warn('drawText: invalid position for text', t, '(index:', textIndex, ')');
      return;
    }
    const textGeometry=getTextGeometry(ctx,t);
    const angle=textGeometry?.angle || 0;
    const align=t.align||(Number.isFinite(t.angle_deg)||t.n_vec?'center':'left');
    const fontFamily=Number.isFinite(t.angle_deg)||t.n_vec?'Segoe UI, Arial':'Arial';
    ctx.save();
    ctx.translate(pos[0],pos[1]);
    ctx.rotate(angle);
    window.drawFormattedText(ctx,t.txt,0,0,{
      size:t.size||14,color:t.color||'#000',
      align,fontFamily,layout:textGeometry?.layout
    });

    // Draw bounding box if this text is selected in editor
    if(window.selectedSceneElement && window.selectedSceneElement.type === 'text' && window.selectedSceneElement.index === textIndex) {
      const layout=textGeometry?.layout || window.layoutFormattedText(ctx,t.txt,0,0,{
        size:t.size||14,align,fontFamily
      });
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 2;
      ctx.strokeRect(layout.left-2,layout.top-2,
        layout.right-layout.left+4,layout.bottom-layout.top+4);
    }
    ctx.restore();
  }

  function drawScene(ctx, task, editorMode){
    if(!task) return;
    if(window.sceneModel) window.sceneModel.update(task);
    task.scene = task.scene || {};
    updateTextPositions(task);
    const planeDef = task.scene.plane;
    if(planeDef){
      if(planeDef.draw === true){
        // Draw plane normally (fully opaque)
        drawPlane(ctx, planeDef, false);
      } else if(editorMode){
        // In editor mode, draw disabled plane in dim color (50% opacity)
        drawPlane(ctx, planeDef, true);
      }
    }
    if(task.scene.rects){ task.scene.rects.forEach(r=>drawRect(ctx,r)); }
    if(task.scene.segments){ task.scene.segments.forEach(s=>drawSegment(ctx,s)); }
    if(task.scene.ellipses){ task.scene.ellipses.forEach(e=>drawEllipse(ctx,e)); }
    if(task.scene.arrows){ task.scene.arrows.forEach(a=>drawArrow(ctx,a)); }
    if(task.scene.texts){
      task.scene.texts.forEach((t,idx)=>{
        if(!window.isTaskTitleText(task,t)) drawText(ctx,t,idx);
      });
    }
    drawScenePoints(ctx, task, editorMode);
    drawSceneAngles(ctx, task);
  }

  const modelGeometry = window.geometry;
  const angleRuntime = new WeakMap();
  const taskRuntime = new WeakMap();
  const TOL = 1e-7;
  const validPos = p => modelGeometry?.finitePoint(p) === true;
  const cp = p => p && [p[0],p[1]];
  const mod1 = x => ((x%1)+1)%1;

  function lineRecord(key, ref, segment, a, b, label){
    return {key,ref,type:'segment',curve:false,value:{a:cp(a),b:cp(b)},source:{ref,segment},label:label||key};
  }
  function curveRecord(key, ref, value, label){
    return {key,ref,type:'ellipse',curve:true,value,source:{ref,curve:true},label:label||key};
  }
  function geometrySources(task){
    const scene = task?.scene || {};
    const out = [];
    if(scene.plane?.through){
      const p=scene.plane.through, t=modelGeometry.normalizeVector(scene.plane.t_vec || [Math.cos((scene.plane.angleDeg||0)*Math.PI/180),-Math.sin((scene.plane.angleDeg||0)*Math.PI/180)]);
      const span=1400;
      out.push(lineRecord('plane','plane','plane',[p[0]-t[0]*span/2,p[1]-t[1]*span/2],[p[0]+t[0]*span/2,p[1]+t[1]*span/2],'plane plane'));
    }
    (scene.rects||[]).forEach((r,i)=>{
      if(!r) return;
      const p=rectPoints(r);
      [['bottom',p.bottomLeft,p.bottomRight],['top',p.topLeft,p.topRight],['left',p.bottomLeft,p.topLeft],['right',p.bottomRight,p.topRight]].forEach(([side,a,b])=>out.push(lineRecord(`rect${i}:${side}`,`rect${i}`,side,a,b,`rect${i} ${side}`)));
    });
    (scene.segments||[]).forEach((s,i)=>{ if(s?.a&&s?.b) out.push(lineRecord(`segment${i}:segment`,`segment${i}`,'segment',s.a,s.b,`segment${i} segment`)); });
    (scene.arrows||[]).forEach((s,i)=>{
      if(!s?.a||!s?.b)return;
      const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],len=Math.hypot(dx,dy);
      if(len<TOL)return;
      const angle=Math.atan2(dy,dx),head=12,bodyEnd=[s.a[0]+dx*(1-head/len),s.a[1]+dy*(1-head/len)];
      const left=[s.b[0]-12*Math.cos(angle-Math.PI/6),s.b[1]-12*Math.sin(angle-Math.PI/6)];
      const right=[s.b[0]-12*Math.cos(angle+Math.PI/6),s.b[1]-12*Math.sin(angle+Math.PI/6)];
      out.push(lineRecord(`arrow${i}:arrow`,`arrow${i}`,'arrow',s.a,bodyEnd,`arrow${i} arrow`));
      out.push(lineRecord(`arrow${i}:head_left`,`arrow${i}`,'head_left',s.b,left,`arrow${i} head_left`));
      out.push(lineRecord(`arrow${i}:head_right`,`arrow${i}`,'head_right',s.b,right,`arrow${i} head_right`));
    });
    (scene.ellipses||[]).forEach((e,i)=>{ if(modelGeometry.ellipseFrame(e)) out.push(curveRecord(`ellipse${i}`,`ellipse${i}`,e,`ellipse${i}`)); });
    return out;
  }
  function resolveSource(task, source){
    if(typeof source === 'string') source={key:source};
    if(!source||source.deleted) return null;
    const candidates=geometrySources(task);
    if(source.key) return candidates.find(x=>x.key===source.key)||null;
    const ref=source.ref || source.source?.ref;
    const segment=source.segment || source.source?.segment;
    const curve=source.curve === true || source.source?.curve === true;
    return candidates.find(x=>x.ref===ref && (curve ? x.curve : x.source.segment===segment)) || null;
  }
  function pointOnSource(record,u){
    if(!record) return null;
    if(!record.curve){
      const {a,b}=record.value;
      return [a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];
    }
    const a=mod1(u)*360, v=record.value;
    if(v.radius !== undefined) return [v.center[0]+v.radius*Math.cos(-a*Math.PI/180),v.center[1]+v.radius*Math.sin(-a*Math.PI/180)];
    return modelGeometry.ellipsePoint(v,a);
  }
  function sourceParam(record,p){
    if(!record.curve){
      const {a,b}=record.value, d=[b[0]-a[0],b[1]-a[1]], l=d[0]*d[0]+d[1]*d[1];
      return l>TOL ? ((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/l : NaN;
    }
    const v=record.value;
    let a;
    if(v.radius !== undefined) a=modelGeometry.wrapRadians(Math.atan2(-(p[1]-v.center[1]),p[0]-v.center[0]))*180/Math.PI;
    else a=modelGeometry.ellipseParameter(v,p)*180/Math.PI;
    return a/360;
  }
  function onCurvePortion(record,p){
    if(!record.curve) return true;
    if(record.value.radius !== undefined) return true;
    return modelGeometry.ellipseAngleInSweep(record.value,sourceParam(record,p)*360,1e-5);
  }
  function lineLine(a,b){
    const p=a.value.a, r=[a.value.b[0]-p[0],a.value.b[1]-p[1]], q=b.value.a, s=[b.value.b[0]-q[0],b.value.b[1]-q[1]];
    const den=modelGeometry.cross(r,s), qp=[q[0]-p[0],q[1]-p[1]];
    if(Math.abs(den)<1e-10){
      if(Math.abs(modelGeometry.cross(qp,r))<1e-8) return {hits:[],reason:'Linjestykkene overlapper eller sammenfaller; skjæringen er ikke entydig.'};
      return {hits:[]};
    }
    const u=modelGeometry.cross(qp,s)/den, v=modelGeometry.cross(qp,r)/den;
    if(u < -1e-9 || u > 1+1e-9 || v < -1e-9 || v > 1+1e-9) return {hits:[]};
    const pos=pointOnSource(a,u);
    return {hits:[{pos,params:[Math.max(0,Math.min(1,u)),Math.max(0,Math.min(1,v))]}]};
  }
  function lineCurve(line,curve){
    const a=line.value.a,b=line.value.b,d=[b[0]-a[0],b[1]-a[1]], v=curve.value;
    let center,rx,ry,t,n;
    if(v.radius !== undefined){ center=v.center; rx=ry=v.radius; t=[1,0]; n=[0,-1]; }
    else { const f=modelGeometry.ellipseFrame(v); if(!f) return {hits:[],reason:'Ellipsegeometrien er degenerert.'}; ({center,rx,ry,t,n}=f); }
    const q=[a[0]-center[0],a[1]-center[1]];
    const qx=modelGeometry.dot(q,t)/rx, qy=modelGeometry.dot(q,n)/ry;
    const dx=modelGeometry.dot(d,t)/rx, dy=modelGeometry.dot(d,n)/ry;
    const A=dx*dx+dy*dy, B=2*(qx*dx+qy*dy), C=qx*qx+qy*qy-1;
    let disc=B*B-4*A*C;
    if(A<TOL || disc < -1e-10) return {hits:[]};
    disc=Math.max(0,disc);
    const roots=disc < 1e-12 ? [-B/(2*A)] : [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)];
    const hits=[];
    roots.forEach(u=>{
      if(u < -1e-9 || u > 1+1e-9) return;
      const pos=[a[0]+d[0]*u,a[1]+d[1]*u];
      if(!onCurvePortion(curve,pos)) return;
      const cp=sourceParam(curve,pos);
      if(!hits.some(h=>modelGeometry.distance(h.pos,pos)<1e-6)) hits.push({pos,params:[Math.max(0,Math.min(1,u)),mod1(cp)]});
    });
    return {hits};
  }
  function ellipseEllipse(a,b){
    const box=record=>{
      const v=record.value;
      if(v.radius!==undefined) return {center:v.center,rx:v.radius,ry:v.radius,t:[1,0],n:[0,-1]};
      return modelGeometry.ellipseFrame(v);
    };
    const A=box(a),B=box(b);
    if(!A||!B) return {hits:[],reason:'Ellipsegeometrien er degenerert.'};
    const implicit=(frame,p)=>{
      const d=[p[0]-frame.center[0],p[1]-frame.center[1]];
      return Math.pow(modelGeometry.dot(d,frame.t)/frame.rx,2)+Math.pow(modelGeometry.dot(d,frame.n)/frame.ry,2)-1;
    };
    let same=true;
    for(let i=0;i<16;i++){ const p=pointOnSource(a,i/16); if(Math.abs(implicit(B,p))>1e-8){same=false;break;} }
    if(same){
      const sweepA=a.value.radius!==undefined?{start:0,sweep:360}:modelGeometry.ellipseSweep(a.value);
      const sweepB=b.value.radius!==undefined?{start:0,sweep:360}:modelGeometry.ellipseSweep(b.value);
      if(!sweepA.sweep||!sweepB.sweep) return {hits:[]};
      const steps=Math.max(4,Math.ceil(sweepA.sweep*4));
      const membership=[];
      for(let i=0;i<=steps;i++){
        const u=(sweepA.start+sweepA.sweep*i/steps)/360;
        membership.push(onCurvePortion(b,pointOnSource(a,u)));
      }
      if(membership.some((hit,i)=>hit&&membership[i+1])) return {hits:[],reason:'Kurvene overlapper eller sammenfaller; skjæringen er ikke entydig.'};
      const hits=[];
      const addEndpoint=(record,angle)=>{
        const pos=record.value.radius!==undefined
          ? [record.value.center[0]+record.value.radius*Math.cos(-angle*Math.PI/180),record.value.center[1]+record.value.radius*Math.sin(-angle*Math.PI/180)]
          : modelGeometry.ellipsePoint(record.value,angle);
        if(!onCurvePortion(a,pos)||!onCurvePortion(b,pos))return;
        const params=[mod1(sourceParam(a,pos)),mod1(sourceParam(b,pos))];
        if(!hits.some(h=>modelGeometry.distance(h.pos,pos)<1e-6))hits.push({pos,params});
      };
      if(a.value.radius===undefined&&sweepA.sweep<360){addEndpoint(a,sweepA.start);addEndpoint(a,sweepA.start+sweepA.sweep);}
      if(b.value.radius===undefined&&sweepB.sweep<360){addEndpoint(b,sweepB.start);addEndpoint(b,sweepB.start+sweepB.sweep);}
      return {hits};
    }
    const f=t=>implicit(B,pointOnSource(a,t));
    const roots=[];
    const n=720, step=1/n, zeroTol=2e-9;
    const add=t=>{
      t=mod1(t);
      const p=pointOnSource(a,t);
      if(Math.abs(f(t))>1e-9 || !onCurvePortion(a,p)||!onCurvePortion(b,p)) return;
      if(!roots.some(x=>Math.abs(((x-t+0.5)%1+1)%1-0.5)<2e-5)) roots.push(t);
    };
    for(let i=0;i<n;i++){
      const lo=i*step,hi=(i+1)*step, flo=f(lo),fhi=f(hi);
      if(Math.abs(flo)<zeroTol) add(lo);
      if(flo*fhi<0){
        let l=lo,h=hi,fl=flo;
        for(let j=0;j<55;j++){const m=(l+h)/2,fm=f(m);if(Math.abs(fm)<1e-14){l=h=m;break;}if(fl*fm<=0)h=m;else{l=m;fl=fm;}}
        add((l+h)/2);
      }
      const mid=(lo+hi)/2, fm=f(mid);
      if(Math.abs(fm)<Math.abs(flo)&&Math.abs(fm)<Math.abs(fhi)){
        let l=lo,h=hi;
        for(let j=0;j<45;j++){
          const x=l+(h-l)*0.38196601125,y=l+(h-l)*0.61803398875;
          if(Math.abs(f(x))<Math.abs(f(y))) h=y; else l=x;
        }
        const t=(l+h)/2;if(Math.abs(f(t))<2e-7)add(t);
      }
    }
    const hits=roots.map(t=>({pos:pointOnSource(a,t),params:[t,mod1(sourceParam(b,pointOnSource(a,t)))]}));
    return {hits};
  }
  function intersectRecords(a,b){
    if(!a||!b) return {hits:[],reason:'Kildegeometrien finnes ikke lenger.'};
    if(!a.curve&&!b.curve) return lineLine(a,b);
    if(!a.curve&&b.curve) return lineCurve(a,b);
    if(a.curve&&!b.curve){
      const result=lineCurve(b,a);
      result.hits=result.hits.map(h=>({pos:h.pos,params:[h.params[1],h.params[0]]}));
      return result;
    }
    return ellipseEllipse(a,b);
  }

  function resolvePoint(task, id){
    const points=task?.scene?.points||[];
    return points.find(p=>p && (p.id===id || `point${points.indexOf(p)}`===id)) || null;
  }
  function resolveAnchor(task,spec){
    if(!spec || typeof spec!=='object') return {pos:null,valid:false,reason:'Anker mangler.'};
    const anchor=spec.anchor && typeof spec.anchor==='object' ? spec.anchor : spec;
    if(anchor.deleted) return {pos:cp(spec.pos||anchor.pos),valid:false,reason:'Ankerkilden er slettet.'};
    if(anchor.type==='point'){
      const p=resolvePoint(task,anchor.ref);
      if(p){
        const status=pointStatus(task,p);
        return {pos:cp(p.pos),valid:status.valid,reason:status.reason,point:p};
      }
      const lookup=buildAllScenePointsBase(task);
      const entry=lookup[anchor.ref];
      const pos=entry?.points?.[anchor.point||'center'];
      return validPos(pos) ? {pos:cp(pos),valid:true} : {pos:cp(spec.pos||anchor.pos),valid:false,reason:'Punktankeret finnes ikke.'};
    }
    if(anchor.type==='segment'){
      const record=resolveSource(task,{ref:anchor.ref,segment:anchor.segment});
      if(!record || record.curve) return {pos:cp(spec.pos||anchor.pos),valid:false,reason:'Segmentankeret finnes ikke.'};
      const segment=record.value;
      let u=Number.isFinite(anchor.u)?anchor.u:null;
      if(u===null && validPos(spec.pos)){
        const d=[segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]], den=d[0]*d[0]+d[1]*d[1];
        u=den>TOL?((spec.pos[0]-segment.a[0])*d[0]+(spec.pos[1]-segment.a[1])*d[1])/den:0.5;
      }
      const pos=pointOnSource(record,Math.max(0,Math.min(1,u===null?0.5:u)));
      return {pos,segment:{a:cp(segment.a),b:cp(segment.b)},valid:true};
    }
    if(validPos(spec.pos)) return {pos:cp(spec.pos),valid:true};
    return {pos:null,valid:false,reason:'Ankeret har ingen posisjon.'};
  }
  function pointStatus(task,point){
    if(!point) return {valid:false,reason:'Punktet finnes ikke.'};
    if(point.type!=='intersection') return {valid:validPos(point.pos),reason:validPos(point.pos)?null:'Fritt punkt har ugyldige koordinater.'};
    if(point._deletedSource) return {valid:false,reason:'En kildegeometri er slettet.'};
    if(!Array.isArray(point.sources)||point.sources.length!==2) return {valid:false,reason:'Skjæringspunktet krever to kildegeometrier.'};
    const state=taskRuntime.get(task);
    const key=point.id;
    const stored=state?.pointStatus?.get(key);
    if(stored) return {valid:stored.valid,reason:stored.reason};
    return {valid:point.valid!==false,reason:point.reason||null};
  }
  function angleGeometry(angle,task){
    const reasons=[];
    const ep=(which)=>{
      const spec=angle?.[which]||{};
      const resolved=resolveAnchor(task,spec);
      if(!resolved.valid) reasons.push(resolved.reason||`${which} anker er ugyldig.`);
      if(which==='vertex'||!spec.anchor?.type&&!spec.type) return {pos:resolved.pos,dir:null};
      const anchor=spec.anchor||spec;
      if(anchor.type==='segment' && resolved.segment){
        const s=resolved.segment, d=[s.b[0]-s.a[0],s.b[1]-s.a[1]];
        if((which==='start'&&angle.startReversed)||(which==='end'&&angle.endReversed)){d[0]*=-1;d[1]*=-1;}
        return {pos:resolved.pos,dir:d};
      }
      return {pos:resolved.pos,dir:validPos(resolved.pos)?[resolved.pos[0]-vertexPos[0],resolved.pos[1]-vertexPos[1]]:null};
    };
    let vertexPos;
    const vertex=resolveAnchor(task,angle?.vertex||{});
    vertexPos=vertex.pos;
    if(!vertex.valid) reasons.push(vertex.reason||'Vinkelens toppunktanker er ugyldig.');
    if(!validPos(vertexPos)) return {vertex:vertexPos,start:null,end:null,startAngle:null,endAngle:null,anticlockwise:false,degrees:null,labelPos:null,valid:false,reason:reasons.join('; ')||'Vinkelens toppunkt er ugyldig.'};
    const startSpec=angle?.start||{},endSpec=angle?.end||{};
    const resolveRay=(spec,which)=>{
      const r=resolveAnchor(task,spec);
      if(!r.valid) reasons.push(r.reason||`${which} anker er ugyldig.`);
      let dir;
      const anchor=spec.anchor||spec;
      if(anchor.type==='segment'&&r.segment){
        dir=[r.segment.b[0]-r.segment.a[0],r.segment.b[1]-r.segment.a[1]];
        if((which==='start'&&angle.startReversed)||(which==='end'&&angle.endReversed)) dir=dir.map(x=>-x);
      }else if(validPos(spec.direction)) dir=cp(spec.direction);
      else if(validPos(r.pos)) dir=[r.pos[0]-vertexPos[0],r.pos[1]-vertexPos[1]];
      const l=dir?modelGeometry.length(dir):0;
      return {pos:r.pos,dir:l>TOL?dir.map(x=>x/l):null};
    };
    const start=resolveRay(startSpec,'start'),end=resolveRay(endSpec,'end');
    if(!start.dir) reasons.push('Startbeinet har null lengde.');
    if(!end.dir) reasons.push('Sluttbeinet har null lengde.');
    if(!start.dir||!end.dir) return {vertex:cp(vertexPos),start:cp(start.pos),end:cp(end.pos),startAngle:null,endAngle:null,anticlockwise:false,degrees:null,labelPos:null,valid:false,canDraw:false,reason:reasons.join('; ')};
    const sa=Math.atan2(start.dir[1],start.dir[0]), ea=Math.atan2(end.dir[1],end.dir[0]);
    const delta=((ea-sa)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
    const anticlockwise=delta>Math.PI;
    const sweep=anticlockwise ? 2*Math.PI-delta : delta;
    const mid=sa+(anticlockwise?-sweep/2:sweep/2),radius=Number.isFinite(angle.radius)&&angle.radius>0?angle.radius:40;
    const degrees=Math.min(delta,2*Math.PI-delta)*180/Math.PI;
    const result={vertex:cp(vertexPos),start:cp(start.pos),end:cp(end.pos),startAngle:sa,endAngle:ea,anticlockwise,degrees,labelPos:[vertexPos[0]+Math.cos(mid)*radius*1.35,vertexPos[1]+Math.sin(mid)*radius*1.35],valid:reasons.length===0,reason:reasons.length?reasons.join('; '):null};
    if(angle && typeof angle==='object') angleRuntime.set(angle,{geometry:result,startDirection:start.dir,endDirection:end.dir});
    return result;
  }
  function update(task){
    if(!task || !task.scene) return;
    migrateCirclesToEllipses(task);
    const scene=task.scene;
    if(!Array.isArray(scene.points)) scene.points=[];
    const sources=geometrySources(task);
    const signature=JSON.stringify(sources.map(s=>[s.key,s.value]));
    let state=taskRuntime.get(task);
    if(!state){state={signature:'',cache:new Map(),pointStatus:new Map()};taskRuntime.set(task,state);}
    const changed=state.signature!==signature;
    if(changed){state.signature=signature;state.cache.clear();}
    state.pointStatus.clear();
    scene.points.forEach((point,index)=>{
      if(!point || typeof point!=='object') return;
      if(!point.id) point.id=`point-${Date.now().toString(36)}-${index}`;
      if(!validPos(point.pos) && validPos(point.lastValidPos)) point.pos=cp(point.lastValidPos);
      if(point.type!=='intersection') {
        point.valid=validPos(point.pos);
        state.pointStatus.set(point.id,{valid:point.valid,reason:point.valid?null:'Fritt punkt har ugyldige koordinater.'});
        return;
      }
      let valid=false, reason='Valgt skjæring finnes ikke lenger.';
      if(point._deletedSource || !Array.isArray(point.sources)||point.sources.length!==2||point.sources.some(source=>source?.deleted)){
        reason='En kildegeometri er slettet.';
      }else{
        const [sa,sb]=point.sources,ra=resolveSource(task,sa),rb=resolveSource(task,sb);
        if(!ra||!rb){reason='En kildegeometri er slettet.';point._deletedSource=true;}
        else{
          const cacheKey=`${ra.key}|${rb.key}`;
          let result=state.cache.get(cacheKey);
          if(!result){result=intersectRecords(ra,rb);state.cache.set(cacheKey,result);}
          reason=result.reason||reason;
          if(result.hits.length){
            const prior=point.branch?.params;
            if(Array.isArray(prior)&&prior.length===2){
              const paramDelta=(a,b,curve)=>{
                const d=Math.abs(a-b);
                return curve?Math.min(d,Math.abs(1-d)):d;
              };
              const dist=h=>Math.hypot(paramDelta(h.params[0],prior[0],ra.curve),paramDelta(h.params[1],prior[1],rb.curve));
              const sorted=result.hits.slice().sort((x,y)=>dist(x)-dist(y));
              const otherBranches=point.branch?.roots||[];
              const otherOwnsCandidate=otherBranches.some(params=>{
                const same=Math.hypot(paramDelta(params[0],prior[0],ra.curve),paramDelta(params[1],prior[1],rb.curve))<1e-6;
                const candidate=sorted[0].params;
                const otherDistance=Math.hypot(paramDelta(candidate[0],params[0],ra.curve),paramDelta(candidate[1],params[1],rb.curve));
                return !same && otherDistance+1e-6<dist(sorted[0]);
              });
              if(otherOwnsCandidate){
                reason='Valgt skjæringsgren finnes ikke lenger; andre treff beholdes uten å bytte gren.';
              }else if(sorted.length>1 && Math.abs(dist(sorted[0])-dist(sorted[1]))<1e-5){
                reason='Skjæringsgrenen er tvetydig.';
              }else if((ra.curve||rb.curve) && dist(sorted[0])>0.35){
                reason='Skjæringsgrenen kan ikke identifiseres sikkert etter den store endringen.';
              }else{
                point.pos=cp(sorted[0].pos);point.lastValidPos=cp(sorted[0].pos);
                point.branch={params:sorted[0].params.slice(),roots:result.hits.map(h=>h.params.slice()),id:`${Math.round(sorted[0].params[0]*1e6)}:${Math.round(sorted[0].params[1]*1e6)}`};
                valid=true;reason=null;
              }
            }else if(point.branch?.id){
              reason='Skjæringsgrenens parametere mangler.';
            }else{
              reason='Velg en skjæringsgren eksplisitt.';
            }
          }
        }
      }
      point.valid=valid;
      point.reason=reason;
      if(validPos(point.lastValidPos)) point.pos=cp(valid?point.pos:point.lastValidPos);
      state.pointStatus.set(point.id,{valid,reason});
    });
    // Resolve angle anchors after dynamic points have been updated.
    (scene.angles||[]).forEach(a=>angleGeometry(a,task));
  }
  function candidates(task,includeNonSnapping=false){
    update(task);
    const out=[],lookup=buildAllScenePointsBase(task);
    Object.keys(lookup).forEach(ref=>{
      if(ref.startsWith('angle')) return;
      const entry=lookup[ref];
      Object.entries(entry.points||{}).forEach(([point,pos])=>{
        const stable=resolvePoint(task,ref);
        const anchor=stable?{type:'point',ref:stable.id,point:'center'}:{type:'point',ref,point};
        out.push({key:`${ref}.${point}`,kind:'point',label:`${ref} ${point}`,ref,pos:cp(pos),anchor});
      });
    });
    geometrySources(task).forEach(g=>{
      const c={key:g.key,kind:g.curve?'curve':'segment',label:g.label,ref:g.ref,segment:g.curve?undefined:{a:cp(g.value.a),b:cp(g.value.b)},source:g.source};
      c.anchor=g.curve?g.source:{type:'segment',ref:g.ref,segment:g.source.segment};
      out.push(c);
    });
    (task?.scene?.points||[]).forEach(p=>{
      if(p?.id&&(includeNonSnapping||p.snapping!==false)&&validPos(p.pos)) out.push({key:`point:${p.id}`,kind:'point',label:`${p.id} center`,ref:p.id,pos:cp(p.pos),anchor:{type:'point',ref:p.id,point:'center'}});
    });
    return out;
  }
  function anchorLabel(candidate){
    const anchor=candidate.anchor || candidate.source || candidate;
    return [anchor.ref,anchor.point || (typeof anchor.segment==='string' ? anchor.segment : '')].filter(Boolean).join(' ');
  }
  function compareAnchors(a,b){
    const aa=a.anchor || a.source || a,bb=b.anchor || b.source || b;
    return String(aa.ref).localeCompare(String(bb.ref),'en',{numeric:true}) ||
      anchorLabel(a).localeCompare(anchorLabel(b),'en',{numeric:true}) ||
      String(aa.type || a.kind || '').localeCompare(String(bb.type || b.kind || ''));
  }
  function orderAnchors(task,list,reference){
    const all=list.slice().sort(compareAnchors);
    if(!validPos(reference)) return {all,nearest:[]};
    const nearest=all.map(candidate=>{
      const anchor=candidate.anchor || candidate;
      const resolved=resolveAnchor(task,anchor);
      let distance;
      if(resolved.segment){
        const {a,b}=resolved.segment,dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
        const t=length2>0 ? Math.max(0,Math.min(1,((reference[0]-a[0])*dx+(reference[1]-a[1])*dy)/length2)) : 0;
        distance=Math.hypot(reference[0]-a[0]-t*dx,reference[1]-a[1]-t*dy);
      } else {
        const pos=resolved.pos || candidate.pos;
        distance=validPos(pos) ? Math.hypot(reference[0]-pos[0],reference[1]-pos[1]) : Infinity;
      }
      return {candidate,distance};
    }).filter(entry=>Number.isFinite(entry.distance)).sort((a,b)=>a.distance-b.distance ||
      compareAnchors(a.candidate,b.candidate)).slice(0,5);
    return {all,nearest};
  }
  function createPoint(task,pos){
    if(!validPos(pos)) throw new TypeError('Et punkt krever endelige x- og y-koordinater.');
    if(!task.scene) task.scene={};
    if(!Array.isArray(task.scene.points)) task.scene.points=[];
    const ids=new Set(task.scene.points.map(p=>p?.id).filter(Boolean));
    let i=1,id;
    do{id=`point-${i++}`;}while(ids.has(id));
    const p={id,type:'free',pos:cp(pos),visible:false};
    task.scene.points.push(p);return p;
  }
  function createIntersectionPoint(task,sourceA,sourceB,hit){
    if(!hit||!validPos(hit.pos)) throw new Error('A selected, valid intersection hit is required');
    const point=createPoint(task,hit.pos);
    point.type='intersection';point.sources=[sourceA.source||sourceA,sourceB.source||sourceB];
    const roots=intersectRecords(resolveSource(task,sourceA),resolveSource(task,sourceB)).hits.map(h=>h.params.slice());
    point.branch=hit.branch||{params:hit.params.slice(),roots,id:`${hit.params.map(x=>Math.round(x*1e6)).join(':')}`};
    point.lastValidPos=cp(hit.pos);
    update(task);return point;
  }

  function migrateCirclesToEllipses(task){
    const scene=task?.scene;
    if(!scene || scene.circles===undefined) return false;
    if(!Array.isArray(scene.circles)){
      throw new TypeError('Kan ikke migrere scene.circles fordi verdien ikke er en liste.');
    }
    if(scene.circles.length===0){
      delete scene.circles;
      return false;
    }
    if(!Array.isArray(scene.ellipses)) scene.ellipses=[];
    const converted=Array.from(scene.circles,(circle,index)=>{
      if(!circle || !validPos(circle.center) || !Number.isFinite(circle.radius) ||
         circle.radius<=0 || !Number.isFinite(circle.radius*2)){
        throw new TypeError(`Kan ikke migrere ugyldig sirkel i scene.circles[${index}].`);
      }
      const ellipse={
        ...circle,
        center:cp(circle.center),
        width:circle.radius*2,
        height:circle.radius*2,
        t_vec:[1,0],
        n_vec:[0,-1],
        color:circle.color || '#999999',
        lockAxes:true
      };
      delete ellipse.radius;
      delete ellipse.startAngleDeg;
      delete ellipse.endAngleDeg;
      return ellipse;
    });
    for(const ellipse of converted){
      remapReferences(task,'circle',0,'convert','ellipse',scene.ellipses.length);
      scene.circles.shift();
      scene.ellipses.push(ellipse);
    }
    delete scene.circles;
    return true;
  }

  function setEllipseAxisLength(ellipse,axis,length){
    if(!ellipse || !['width','height'].includes(axis) || !Number.isFinite(length) || length<=0){
      throw new TypeError('Ellipseakse må ha en endelig lengde større enn null.');
    }
    ellipse[axis]=length;
    if(ellipse.lockAxes) ellipse[axis==='width'?'height':'width']=length;
  }

  function remapReference(ref,type,index,action,targetIndex){
    const prefix={rect:'rect',rects:'rect',rectangle:'rect',segment:'segment',segments:'segment',arrow:'arrow',arrows:'arrow',circle:'circle',circles:'circle',ellipse:'ellipse',ellipses:'ellipse',point:'point',points:'point'}[type]||type;
    if(prefix==='plane') return ref;
    const m=new RegExp(`^${prefix}(\\d+)(.*)$`).exec(ref||'');
    if(!m)return ref;
    const old=Number(m[1]);
    if(action.startsWith('convert:')){
      const targetType=action.slice('convert:'.length);
      const targetPrefix={circle:'circle',ellipse:'ellipse'}[targetType] || targetType;
      if(old===index) return `${targetPrefix}${targetIndex}${m[2]}`;
      if(old>index) return `${prefix}${old-1}${m[2]}`;
      return ref;
    }
    if(action==='delete') return old===index ? null : old>index ? `${prefix}${old-1}${m[2]}` : ref;
    if(action==='up') return old===index ? `${prefix}${index-1}${m[2]}` : old===index-1 ? `${prefix}${index}${m[2]}` : ref;
    if(action==='down') return old===index ? `${prefix}${index+1}${m[2]}` : old===index+1 ? `${prefix}${index}${m[2]}` : ref;
    return ref;
  }
  function remapReferences(task,type,index,action,targetType,targetIndex){
    const scene=task?.scene;if(!scene)return;
    const prefix={rect:'rect',rects:'rect',rectangle:'rect',segment:'segment',segments:'segment',arrow:'arrow',arrows:'arrow',circle:'circle',circles:'circle',ellipse:'ellipse',ellipses:'ellipse',point:'point',points:'point'}[type]||type;
    const deletedPoint=prefix==='point'&&action==='delete' ? scene.points?.[index] : null;
    const remapSpec=(spec,angle,part)=>{
      if(!spec)return;
      const a=spec.anchor||spec;
      if(a.type!=='point'&&a.type!=='segment')return;
      const pointDeleted=deletedPoint && a.type==='point' && (a.ref===deletedPoint.id||a.ref===`point${index}`);
      const mapped=pointDeleted?null:remapReference(a.ref,type,index,
        action==='convert' ? `convert:${targetType}` : action,targetIndex);
      if(mapped===null){
        const cached=angle&&angleRuntime.get(angle)?.geometry;
        const cachedPos=cached?.[part];
        if(validPos(cachedPos)) spec.pos=cp(cachedPos);
        if(a.type==='segment'){
          const cachedValue=angle&&angleRuntime.get(angle);
          const vector=cachedValue?.[part==='start'?'startDirection':'endDirection'];
          if(validPos(spec.pos)) spec.pos=cp(spec.pos);
          if(vector) spec.direction=vector.slice();
          delete spec.anchor;
          if(spec.type==='segment') { delete spec.type; delete spec.ref; delete spec.segment; }
          spec.detachedReason='Segmentet ble slettet; ankeret er nå fritt.';
        }else{
          if(spec!==a) delete spec.anchor;
          else { delete spec.type; delete spec.ref; delete spec.point; }
          spec.detachedReason='Punktet ble slettet; ankeret er nå fritt.';
        }
      }else if(mapped!==a.ref) a.ref=mapped;
    };
    (scene.angles||[]).forEach(angle=>['start','vertex','end'].forEach(part=>remapSpec(angle[part],angle,part)));
    const remapForceSpec=(spec,field)=>{
      const anchor=spec?.[field];
      if(!anchor||typeof anchor!=='object'||Array.isArray(anchor)||(anchor.type!=='point'&&anchor.type!=='segment'))return;
      const pointDeleted=deletedPoint&&anchor.type==='point'&&(anchor.ref===deletedPoint.id||anchor.ref===`point${index}`);
      const mapped=pointDeleted?null:remapReference(anchor.ref,type,index,
        action==='convert' ? `convert:${targetType}` : action,targetIndex);
      if(mapped===null){
        const resolved=resolveAnchor(task,anchor);
        const pos=validPos(anchor.pos)?anchor.pos:resolved.pos;
        spec[field]=validPos(pos)?{type:'custom',pos:cp(pos),detachedReason:'Kildegeometrien ble slettet; ankeret er nå fritt.'}:{...anchor,deleted:true};
      }else if(mapped!==anchor.ref) anchor.ref=mapped;
    };
    const remapLegacyForceSpec=spec=>{
      if(typeof spec?.anchorFrom!=='string')return;
      const pointDeleted=deletedPoint&&(spec.anchorFrom===deletedPoint.id||spec.anchorFrom===`point${index}`);
      const mapped=pointDeleted?null:remapReference(spec.anchorFrom,type,index,
        action==='convert' ? `convert:${targetType}` : action,targetIndex);
      if(mapped===null){
        const resolved=resolveAnchor(task,{type:'point',ref:spec.anchorFrom,point:spec.point||'center'});
        if(validPos(resolved.pos)) spec.anchorSpec={type:'custom',pos:cp(resolved.pos),detachedReason:'Kildegeometrien ble slettet; ankeret er nå fritt.'};
        delete spec.anchorFrom;
      }else if(mapped!==spec.anchorFrom) spec.anchorFrom=mapped;
    };
    ['expectedForces','initialForces','forces'].forEach(name=>{
      if(!Array.isArray(task[name]))return;
      task[name].forEach(spec=>{
        ['anchor','anchorSpec'].forEach(field=>remapForceSpec(spec,field));
        remapLegacyForceSpec(spec);
      });
    });
    (scene.points||[]).forEach(point=>{
      if(point.type==='intersection'&&Array.isArray(point.sources)){
        point.sources=point.sources.map(source=>{
          const mapped=remapReference(source.ref,type,index,
            action==='convert' ? `convert:${targetType}` : action,targetIndex);
          return mapped===null?{...source,deleted:true}:mapped!==source.ref?{...source,ref:mapped}:source;
        });
        if(point.sources.some(s=>s.deleted)) point._deletedSource=true;
      }
    });
  }

  window.createSceneModel=()=>({
    update,
    geometries:geometrySources,
    candidates,
    anchorLabel,
    orderAnchors,
    intersections(task,sourceA,sourceB){
      const result=intersectRecords(resolveSource(task,sourceA),resolveSource(task,sourceB));
      const roots=result.hits.map(h=>h.params.slice());
      result.hits.forEach(hit=>{hit.branch={params:hit.params.slice(),roots:roots.map(p=>p.slice()),id:hit.params.map(x=>Math.round(x*1e6)).join(':')};});
      return result;
    },
    createPoint,
    createIntersectionPoint,
    migrateCirclesToEllipses,
    setEllipseAxisLength,
    resolveAnchor,
    angleGeometry,
    pointStatus,
    remapReferences,
    sampleCurve(task,source,maxError=0.25){
      const record=resolveSource(task,source);
      if(!record?.curve)return [];
      const value=record.value;
      return modelGeometry.sampleEllipse(value.radius===undefined?value:{center:value.center,width:2*value.radius,height:2*value.radius},maxError);
    }
  });

  function drawScenePoints(ctx, task, editorMode){
    const points = task.scene?.points;
    if(!Array.isArray(points)) return;
    points.forEach(point=>{
      if(!point || !Array.isArray(point.pos)) return;
      if(!editorMode && point.visible !== true) return;
      const [x,y] = point.pos;
      ctx.save();
      const invalidMarker=editorMode && point.valid === false;
      const radius = Number.isFinite(point.size) && point.size > 0 ? point.size : 4;
      const markerRadius = invalidMarker ? Math.max(radius, 6) : radius;
      const markerStyle = point.markerStyle || (point.color ? 'filled' : 'circle');
      ctx.lineWidth = invalidMarker ? Math.max(point.lineWidth || 1.5, 2) :
        (Number.isFinite(point.lineWidth) && point.lineWidth > 0 ? point.lineWidth : 1.5);
      ctx.strokeStyle = invalidMarker ? '#d22' : (point.color || '#222');
      ctx.fillStyle = invalidMarker ? '#fff' : (markerStyle === 'filled' ? (point.color || '#222') : '#fff');
      if(editorMode && point.valid === false){
        ctx.beginPath(); ctx.arc(x,y,markerRadius,0,Math.PI*2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c00'; ctx.font = 'bold 12px Segoe UI, Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!',x,y-0.5);
      } else if(markerStyle === 'square'){
        ctx.beginPath(); ctx.rect(x-markerRadius,y-markerRadius,markerRadius*2,markerRadius*2);
        ctx.fill(); ctx.stroke();
      } else if(markerStyle === 'cross'){
        ctx.beginPath();
        ctx.moveTo(x-markerRadius,y); ctx.lineTo(x+markerRadius,y);
        ctx.moveTo(x,y-markerRadius); ctx.lineTo(x,y+markerRadius);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(x,y,markerRadius,0,Math.PI*2);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    });
  }

  function rightAngleMarker(g,radius){
    if(Math.abs(g.degrees-90)>1e-6) return null;
    const side=radius/Math.sqrt(2);
    const u=[side*Math.cos(g.startAngle),side*Math.sin(g.startAngle)];
    const v=[side*Math.cos(g.endAngle),side*Math.sin(g.endAngle)];
    const a=[g.vertex[0]+u[0],g.vertex[1]+u[1]];
    const corner=[a[0]+v[0],a[1]+v[1]];
    const b=[g.vertex[0]+v[0],g.vertex[1]+v[1]];
    return [[a,corner],[corner,b]];
  }

  function drawSceneAngles(ctx, task){
    if(!Array.isArray(task.scene?.angles)) return;
    task.scene.angles.forEach((angle,index)=>{
      const g = window.sceneModel ? window.sceneModel.angleGeometry(angle,task) : null;
      if(!g || !g.vertex || !g.start || !g.end) return;
      const radius = Number.isFinite(angle.radius) && angle.radius > 0 ? angle.radius : 40;
      const symbol = angle.symbol || '';
      const label = symbol + (angle.showDegrees ? `${symbol ? '=' : ''}${g.degrees.toFixed(0)}°` : '');
      if(!Number.isFinite(g.startAngle)||!Number.isFinite(g.endAngle)) return;
      ctx.save();
      ctx.strokeStyle = angle.color || '#6b2ca0';
      ctx.fillStyle = angle.color || '#6b2ca0';
      ctx.lineWidth = Number.isFinite(angle.lineWidth) ? angle.lineWidth : 2;
      ctx.beginPath();
      const marker=rightAngleMarker(g,radius);
      if(marker){
        ctx.moveTo(...marker[0][0]);
        marker.forEach(segment=>ctx.lineTo(...segment[1]));
      } else ctx.arc(g.vertex[0],g.vertex[1],radius,g.startAngle,g.endAngle,g.anticlockwise);
      ctx.stroke();
      if(label && g.labelPos){
        ctx.font = `${Number.isFinite(angle.size) ? angle.size : 16}px Segoe UI, Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        window.drawFormattedText(ctx,label,g.labelPos[0],g.labelPos[1],{size:Number.isFinite(angle.size)?angle.size:16,color:angle.color||'#6b2ca0',align:'center'});
      }
      ctx.restore();
    });
  }



  function buildSceneLookup(task){
    const lookup = {};
    if(!task) return lookup;
    if(window.sceneModel) window.sceneModel.update(task);
    // Add plane if defined (use endpoints as 'a' and 'b')
    if(task.scene && task.scene.plane && task.scene.plane.draw){
      const plane = task.scene.plane;
      const through = plane.through;
      const t_vec = plane.t_vec || [Math.cos((plane.angleDeg||0)*Math.PI/180), -Math.sin((plane.angleDeg||0)*Math.PI/180)];
      const span = 1400;
      const a = [through[0] - t_vec[0]*span/2, through[1] - t_vec[1]*span/2];
      const b = [through[0] + t_vec[0]*span/2, through[1] + t_vec[1]*span/2];
      lookup['plane'] = {
        snapping: false,
        points: { a: a, b: b },
        segments: { plane: [a, b] }
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
            bottom_center:pts.bottom_center,
            top_left:pts.topLeft,
            top_right:pts.topRight,
            bottom_left:pts.bottomLeft,
            bottom_right:pts.bottomRight
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
    // Add ellipses snap points if snapping enabled
    if(task.scene.ellipses){
      task.scene.ellipses.forEach((e,i)=>{
        const id='ellipse'+i;
        const snappingEnabled = (e.snapping !== false);
        const points=ellipseAnchors(e);
        lookup[id]={
          snapping: snappingEnabled,
          points: snappingEnabled ? points : {},
          segments: {}
        };
      });
    }
    const allPoints = buildAllScenePointsBase(task);
    for(const [collection,prefix] of [['segments','segment'],['arrows','arrow'],['texts','text']]){
      (task.scene[collection] || []).forEach((element,index)=>{
        const entry = allPoints[`${prefix}${index}`];
        if(entry){
          const enabled = element.snapping !== false;
          lookup[`${prefix}${index}`] = {
            snapping:enabled,
            points:enabled ? entry.points : {},
            segments:enabled ? entry.segments : {}
          };
        }
      });
    }
    (task.scene.points||[]).forEach((p,i)=>{
      if(p?.id&&p.snapping!==false&&validPos(p.pos)){
        lookup[p.id]={snapping:true,points:{center:cp(p.pos)},segments:{}};
        lookup[`point${i}`]={snapping:true,points:{center:cp(p.pos)},segments:{}};
      }
    });
    return lookupCurves(task,lookup);
  }

  /**
   * Build all scene element points for clicking/selection (including elements without snap points).
   * This is used for scene element hover detection in editor mode.
   * Returns same structure as buildSceneLookup but includes points for ALL elements.
   */
  function buildAllScenePointsBase(task){
    updateTextPositions(task);
    const lookup = {};
    if(!task || !task.scene) return lookup;
    
    const scene = task.scene;
    
    // Plane (use endpoints a and b, plus segment) - hoverable regardless of draw state
    if(scene.plane && scene.plane.through && Array.isArray(scene.plane.through)){
      const plane = scene.plane;
      const through = plane.through;
      const t_vec = plane.t_vec || [Math.cos((plane.angleDeg||0)*Math.PI/180), -Math.sin((plane.angleDeg||0)*Math.PI/180)];
      const span = 1400;
      const a = [through[0] - t_vec[0]*span/2, through[1] - t_vec[1]*span/2];
      const b = [through[0] + t_vec[0]*span/2, through[1] + t_vec[1]*span/2];
      lookup['plane'] = {
        points: { a: a, b: b },
        segments: { plane: [a, b] }
      };
    }
    
    // Rects (same as buildSceneLookup)
    if(Array.isArray(scene.rects)){
      scene.rects.forEach((r, i)=>{
        if(!r) return;
        const pts = rectPoints(r);
        lookup[`rect${i}`] = {
          points: {
            center: pts.center, top_center: pts.top_center, bottom_center: pts.bottom_center,
            left_middle: pts.left_middle, right_middle: pts.right_middle,
            top_left: pts.topLeft, top_right: pts.topRight,
            bottom_left: pts.bottomLeft, bottom_right: pts.bottomRight
          },
          segments: { top: [pts.topLeft, pts.topRight], bottom: [pts.bottomLeft, pts.bottomRight], left: [pts.bottomLeft, pts.topLeft], right: [pts.bottomRight, pts.topRight] }
        };
      });
    }
    
    // Ellipses (same as buildSceneLookup)
    if(Array.isArray(scene.ellipses)){
      scene.ellipses.forEach((e, i)=>{
        if(!e || !e.center) return;
        lookup[`ellipse${i}`] = {
          points: ellipseAnchors(e),
          segments: {}
        };
      });
    }
    
    // Segments - add both endpoints as 'start' and 'end'
    if(Array.isArray(scene.segments)){
      scene.segments.forEach((s, i)=>{
        if(!s || !s.a || !s.b) return;
        lookup[`segment${i}`] = {
          points: { start: [s.a[0], s.a[1]], end: [s.b[0], s.b[1]] },
          segments: { segment: [[s.a[0], s.a[1]], [s.b[0], s.b[1]]] }
        };
      });
    }
    
    // Arrows - add both endpoints as 'start' and 'end'
    if(Array.isArray(scene.arrows)){
      scene.arrows.forEach((a, i)=>{
        if(!a || !a.a || !a.b) return;
        lookup[`arrow${i}`] = {
          points: { start: [a.a[0], a.a[1]], end: [a.b[0], a.b[1]] },
          segments: { arrow: [[a.a[0], a.a[1]], [a.b[0], a.b[1]]] }
        };
      });
    }
    
    // Texts - add position point
    if(Array.isArray(scene.texts)){
      scene.texts.forEach((txt, i)=>{
        if(!txt?._renderedPos) return;
        lookup[`text${i}`] = {
          points: { pos: [txt.pos[0], txt.pos[1]] },
          segments: {}
        };
      });
    }
    
    return lookupCurves(task,lookup);
  }
  function buildAllScenePoints(task){
    if(window.sceneModel) window.sceneModel.update(task);
    const lookup=buildAllScenePointsBase(task);
    if(!task?.scene) return lookup;
    (task.scene.points||[]).forEach((p,i)=>{
      if(p?.id&&validPos(p.pos)){
        const entry={points:{center:cp(p.pos)},segments:{},valid:p.valid!==false,reason:p.reason||null};
        lookup[p.id]=entry;
        lookup[`point${i}`]=entry;
      }
    });
    (task.scene.angles||[]).forEach((angle,i)=>{
      const g=window.sceneModel?.angleGeometry(angle,task);
      if(!g?.vertex||!g.start||!g.end||!Number.isFinite(g.startAngle)||!Number.isFinite(g.endAngle)) return;
      const points={start:g.start,vertex:g.vertex,end:g.end},segments=[];
      const radius=Number.isFinite(angle.radius)&&angle.radius>0?angle.radius:40;
      const marker=rightAngleMarker(g,radius);
      if(marker){
        lookup[`angle${i}`]={points,segments:{},curves:{arc:marker},valid:g.valid,reason:g.reason};
        return;
      }
      const delta=((g.endAngle-g.startAngle)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
      const sweep=g.anticlockwise?2*Math.PI-delta:delta;
      const maxStep=Math.min(Math.PI/45,2*Math.acos(Math.max(-1,1-0.25/radius)));
      const steps=Math.max(1,Math.ceil(sweep/Math.max(1e-5,maxStep)));
      const sign=g.anticlockwise?-1:1;
      let prev=[g.vertex[0]+radius*Math.cos(g.startAngle),g.vertex[1]+radius*Math.sin(g.startAngle)];
      for(let j=1;j<=steps;j++){
        const t=g.startAngle+sign*sweep*j/steps;
        const next=[g.vertex[0]+radius*Math.cos(t),g.vertex[1]+radius*Math.sin(t)];
        segments.push([prev,next]);prev=next;
      }
      lookup[`angle${i}`]={points,segments:{},curves:{arc:segments},valid:g.valid,reason:g.reason};
    });
    return lookup;
  }

  function forceSnapFrames(task,anchor){
    const g=window.geometry, frames=[];
    if(!g.finitePoint(anchor) || !task?.scene) return frames;
    const lookup=buildSceneLookup(task);
    const add=(tangent,normal=[-tangent[1],tangent[0]])=>{
      if(!g.finitePoint(tangent)||!g.finitePoint(normal)) return;
      const tl=Math.hypot(...tangent),nl=Math.hypot(...normal);
      if(tl<1e-10||nl<1e-10) return;
      const frame=[tangent.map(v=>v/tl),normal.map(v=>v/nl)];
      if(!frames.some(other=>Math.abs(g.cross(other[0],frame[0]))<1e-8)) frames.push(frame);
    };
    const checklist=window.getActiveSnapChecklist(task);
    const plane=task.scene.plane;
    if(window.hasLocalSnapMatches(checklist) && plane){
      // Geometry matching uses the plane frame independently of visibility and point snapping.
      const angle=(plane.angleDeg||0)*Math.PI/180;
      const tangent=plane.t_vec || [Math.cos(angle),-Math.sin(angle)];
      if(g.finitePoint(tangent)){
        add(tangent,plane.n_vec||[-tangent[1],tangent[0]]);
      }
    }
    for(const [collection,prefix] of [['segments','segment'],['arrows','arrow'],['rects','rect'],['ellipses','ellipse']]){
      (task.scene[collection]||[]).forEach((element,index)=>{
        const entry=lookup[`${prefix}${index}`];
        if(!entry || entry.snapping===false) return;
        const atPoint=Object.entries(entry.points).find(([,p])=>g.finitePoint(p)&&g.distance(p,anchor)<=1e-6);
        if(!atPoint) return;
        if(collection==='segments'||collection==='arrows'){
          const direction=[element.b[0]-element.a[0],element.b[1]-element.a[1]];
          add(direction);
        } else if(collection==='rects'){
          add(element.t_vec||[1,0],element.n_vec||[0,-1]);
        } else {
          const frame=g.ellipseFrame(element);
          if(!frame) return;
          if(atPoint[0]==='center'){
            add(frame.t,frame.n);
          } else {
            const delta=[anchor[0]-frame.center[0],anchor[1]-frame.center[1]];
            const x=g.dot(delta,frame.t)/(frame.rx*frame.rx);
            const y=g.dot(delta,frame.n)/(frame.ry*frame.ry);
            const normal=[x*frame.t[0]+y*frame.n[0],x*frame.t[1]+y*frame.n[1]];
            add([-normal[1],normal[0]],normal);
          }
        }
      });
    }
    return frames;
  }

  function forceSnapDirections(task,anchor){
    const directions=[],g=window.geometry;
    for(const frame of forceSnapFrames(task,anchor)){
      for(const axis of frame){
        if(!directions.some(other=>Math.abs(g.cross(other,axis))<1e-8)) directions.push(axis);
      }
    }
    return directions;
  }

  window.forceSnapFrames = forceSnapFrames;
  window.updateTextPositions = updateTextPositions;
  window.textRootIndex = textRootIndex;
  window.textAngle = textAngle;
  window.normalizeTextRotation = normalizeTextRotation;
  window.getTextGeometry = getTextGeometry;
  window.forceSnapDirections = forceSnapDirections;
  window.drawScene = drawScene;
  window.buildSceneLookup = buildSceneLookup;
  window.buildAllScenePoints = buildAllScenePoints;
  window.drawGrid = drawGrid;
  window.drawGuidelines = drawGuidelines;
  window.drawForceGridTrace = drawForceGridTrace;
  window.rectPoints = rectPoints;
})();
