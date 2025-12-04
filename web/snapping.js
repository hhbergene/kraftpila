// snapping.js - simple snap & guidelines utilities
(function(){
  const SNAP_THRESHOLD = 20; // px radius for point snapping
  // Build an array of snap points from sceneLookup
  function buildSnapPoints(sceneLookup){
    const pts = [];
    if(!sceneLookup) return pts;
    Object.keys(sceneLookup).forEach(key => {
      const entry = sceneLookup[key];
      // Honor snapping flag: default true unless explicitly false
      if(entry && entry.snapping === false) return;
      if(entry.points){
        Object.values(entry.points).forEach(p => { if(p && Array.isArray(p)) pts.push(p); });
      }
      if(entry.segments){
        Object.values(entry.segments).forEach(seg => { if(seg && seg.length===2){ pts.push(seg[0], seg[1]); } });
      }
    });
    return pts;
  }

  function nearestPoint(pos, points){
    let best=null, bestD2=Infinity;
    for(const p of points){
      const dx = pos[0]-p[0]; const dy=pos[1]-p[1]; const d2 = dx*dx+dy*dy;
      if(d2 < bestD2){ bestD2=d2; best=p; }
    }
    return {point:best, d2:bestD2};
  }

  function snapPoint(pos, options){
    const {snapOn, points} = options;
    if(!snapOn) return pos;
    if(!points || !points.length) return pos;
    const {point, d2} = nearestPoint(pos, points);
    if(point && d2 <= SNAP_THRESHOLD*SNAP_THRESHOLD){ return [point[0], point[1]]; }
    return pos;
  }

   // Composite snap: considers block/scene points and XY grid.
  function snap_old(pos, options){
    const { snapOn=true, points=[], gridStep=20, gridOrigin=[0,0], plane=null, axesOrigin=null } = options || {};
    if(!snapOn) return { pos, source:null };
    const px = pos[0], py = pos[1];
    // Collect candidates separately for priority logic
    // Grid candidate
    const ox = gridOrigin[0]||0, oy = gridOrigin[1]||0;
    const gx = Math.round((px - ox) / gridStep) * gridStep + ox;
    const gy = Math.round((py - oy) / gridStep) * gridStep + oy;
    const gridCandidate = { pos:[gx,gy], source:'grid', d2:(px-gx)*(px-gx)+(py-gy)*(py-gy) };

    // Scene point candidate (nearest, regardless of SNAP_THRESHOLD; threshold applied later)
    let pointCandidate = null;
    if(points && points.length){
      const np = nearestPoint(pos, points);
      if(np.point){ pointCandidate = { pos:[np.point[0], np.point[1]], source:'point', d2:np.d2 }; }
    }

    // Guideline candidates
    let guidelineCandidates = [];
    const originLine = axesOrigin || gridOrigin;
    if(plane && plane.n_vec && plane.t_vec){
      const n = plane.n_vec; const t = plane.t_vec; const snapped_x = gx; const snapped_y = gy;
      const g = window.geometry;
      if(g){
        const x1 = g.xOnLine(snapped_y, originLine, n); if(isFinite(x1)) guidelineCandidates.push([x1, snapped_y]);
        const y2 = g.yOnLine(snapped_x, originLine, n); if(isFinite(y2)) guidelineCandidates.push([snapped_x, y2]);
        const x3 = g.xOnLine(snapped_y, originLine, t); if(isFinite(x3)) guidelineCandidates.push([x3, snapped_y]);
        const y4 = g.yOnLine(snapped_x, originLine, t); if(isFinite(y4)) guidelineCandidates.push([snapped_x, y4]);
        //const x5 = g.xOnLine(snapped_y, gridOrigin, n); if(isFinite(x5)) guidelineCandidates.push([x5, snapped_y]);
        //const y6 = g.yOnLine(snapped_x, gridOrigin, n); if(isFinite(y6)) guidelineCandidates.push([snapped_x, y6]);
        //const x7 = g.xOnLine(snapped_y, gridOrigin, t); if(isFinite(x7)) guidelineCandidates.push([x7, snapped_y]);
        //const y8 = g.yOnLine(snapped_x, gridOrigin, t); if(isFinite(y8)) guidelineCandidates.push([snapped_x, y8]);
      }
    }
    let guidelineBest = null;
    for(const c of guidelineCandidates){
      const dx = px - c[0]; const dy = py - c[1]; const d2 = dx*dx+dy*dy;
      if(!guidelineBest || d2 < guidelineBest.d2){ guidelineBest = { pos:[c[0],c[1]], source:'guideline', d2 }; }
    }

    // Priority rule:
    // If grid distance <= gridStep/2 AND (scene point within 1.5*gridStep OR guideline within 1.5*gridStep), prefer non-grid even if grid closer.
    const HALF_GRID2 = (gridStep/2)*(gridStep/2);
    const ONE_POINT_FIVE_GRID2 = (gridStep*1.5)*(gridStep*1.5);
    const gridClose = gridCandidate.d2 <= HALF_GRID2;
    const pointClose = pointCandidate && pointCandidate.d2 <= ONE_POINT_FIVE_GRID2;
    const guidelineClose = guidelineBest && guidelineBest.d2 <= ONE_POINT_FIVE_GRID2;
    let best;
    if(gridClose && (pointClose || guidelineClose)){
      // Prefer closest among point / guideline that are within range and also reasonably within SNAP_THRESHOLD if point
      let candidates = [];
      if(pointClose) candidates.push(pointCandidate);
      if(guidelineClose) candidates.push(guidelineBest);
      // If scene point also within original SNAP_THRESHOLD, keep it; else still eligible due to rule
      best = candidates.reduce((acc,c)=> acc ? (c.d2 < acc.d2 ? c : acc) : c, null);
    } else {
      // Normal closest selection among all existing candidates including grid
      best = gridCandidate; // start with grid
      if(pointCandidate && pointCandidate.d2 < best.d2){ best = pointCandidate; }
      if(guidelineBest && guidelineBest.d2 < best.d2){ best = guidelineBest; }
      // Apply original SNAP_THRESHOLD for scene point only (to avoid far snap)
      if(best.source==='point' && best.d2 > SNAP_THRESHOLD*SNAP_THRESHOLD){ best = gridCandidate; }
    }
    return { pos: best.pos, source: best.source };
  }
 

  // Composite snap: considers block/scene points and XY grid.
  function snap(pos, options){
    const { points=[], gridStep=20, origin=[0,0], axesDir=null, priorityFactor=1.5 } = options || {};
    //snap_old(pos, options); // for debugging comparison
    //return;
    // Check snapping enabled globally
    if(!window.enableSnap) return { pos, source:null };
    
    const px = pos[0], py = pos[1];
    // Collect candidates separately for priority logic
    // Origin-based grid candidate (aligned to origin)
    const ox = origin[0]||0, oy = origin[1]||0;
    const gx = Math.round((px - ox) / gridStep) * gridStep + ox;
    const gy = Math.round((py - oy) / gridStep) * gridStep + oy;
    // Round to ensure clean integer coordinates (avoid floating point errors)
    const gx_clean = Math.round(gx);
    const gy_clean = Math.round(gy);
    const originCandidate = { pos:[gx_clean, gy_clean], source:'origin-grid', d2:(px-gx_clean)*(px-gx_clean)+(py-gy_clean)*(py-gy_clean) };

    // Pure XY grid candidate (aligned to 0,0 regardless of origin)
    const gx_pure = Math.round(px / gridStep) * gridStep;
    const gy_pure = Math.round(py / gridStep) * gridStep;
    const gridCandidate = { pos:[gx_pure, gy_pure], source:'grid', d2:(px-gx_pure)*(px-gx_pure)+(py-gy_pure)*(py-gy_pure) };

    // Scene point candidate (nearest, regardless of SNAP_THRESHOLD; threshold applied later)
    let pointCandidate = null;
    if(points && points.length){
      const np = nearestPoint(pos, points);
      if(np.point){ pointCandidate = { pos:[np.point[0], np.point[1]], source:'point', d2:np.d2 }; }
    }

    // Guideline candidates
    let guidelineCandidates = [];
    if(axesDir && axesDir.n_vec && axesDir.t_vec){
      const n = axesDir.n_vec; const t = axesDir.t_vec; const snapped_x = gx_clean; const snapped_y = gy_clean;
      const g = window.geometry;
      if(g){
        const x1 = g.xOnLine(snapped_y, origin, n); if(isFinite(x1)) guidelineCandidates.push([x1, snapped_y]);
        const y2 = g.yOnLine(snapped_x, origin, n); if(isFinite(y2)) guidelineCandidates.push([snapped_x, y2]);
        const x3 = g.xOnLine(snapped_y, origin, t); if(isFinite(x3)) guidelineCandidates.push([x3, snapped_y]);
        const y4 = g.yOnLine(snapped_x, origin, t); if(isFinite(y4)) guidelineCandidates.push([snapped_x, y4]);
        //const x5 = g.xOnLine(snapped_y, gridOrigin, n); if(isFinite(x5)) guidelineCandidates.push([x5, snapped_y]);
        //const y6 = g.yOnLine(snapped_x, gridOrigin, n); if(isFinite(y6)) guidelineCandidates.push([snapped_x, y6]);
        //const x7 = g.xOnLine(snapped_y, gridOrigin, t); if(isFinite(x7)) guidelineCandidates.push([x7, snapped_y]);
        //const y8 = g.yOnLine(snapped_x, gridOrigin, t); if(isFinite(y8)) guidelineCandidates.push([snapped_x, y8]);
      }
    }
    let guidelineBest = null;
    for(const c of guidelineCandidates){
      const dx = px - c[0]; const dy = py - c[1]; const d2 = dx*dx+dy*dy;
      if(!guidelineBest || d2 < guidelineBest.d2){ guidelineBest = { pos:[c[0],c[1]], source:'guideline', d2 }; }
    }

    // Priority rule:
    // Grid snapping (origin-based or pure) should be preferred over guideline/point snapping
    // because grid gives clean integer coordinates, while guideline/point can have decimals.
    const HALF_GRID2 = (gridStep/2)*(gridStep/2);
    const PRIORITY_GRID2 = (gridStep*priorityFactor)*(gridStep*priorityFactor);
    const originGridClose = originCandidate.d2 <= HALF_GRID2;
    const pointClose = pointCandidate && pointCandidate.d2 <= PRIORITY_GRID2;
    const guidelineClose = guidelineBest && guidelineBest.d2 <= PRIORITY_GRID2;
    
    // IMPORTANT: Check pure grid FIRST - if very close (within 2px), prefer it regardless of other candidates
    const PURE_GRID_THRESHOLD2 = 2*2;
    if(gridCandidate.d2 <= PURE_GRID_THRESHOLD2){
      return { pos: gridCandidate.pos, source: 'grid' };
    }
    
    let best;
    
    // Strategy: Always prefer clean grid coordinates over fuzzy guideline/point coordinates
    // Check if pure grid or origin-grid is closer than guideline
    const pureGridCloserThanGuideline = gridCandidate.d2 < (guidelineBest ? guidelineBest.d2 : Infinity);
    const originGridCloserThanGuideline = originCandidate.d2 < (guidelineBest ? guidelineBest.d2 : Infinity);
    
    if(pureGridCloserThanGuideline || originGridCloserThanGuideline){
      // Prefer whichever grid is closer
      best = (gridCandidate.d2 <= originCandidate.d2) ? gridCandidate : originCandidate;
    } else {
      // Only use guideline/point if they're closer than both grids
      best = originCandidate; // default fallback
      if(pointCandidate && pointCandidate.d2 < best.d2){ best = pointCandidate; }
      if(guidelineBest && guidelineBest.d2 < best.d2){ best = guidelineBest; }
      // Apply original SNAP_THRESHOLD for scene point only (to avoid far snap)
      if(best.source==='point' && best.d2 > SNAP_THRESHOLD*SNAP_THRESHOLD){ best = originCandidate; }
    }
    
    return { pos: best.pos, source: best.source };
  }

  // Guidelines: produce line segments for rendering
  function buildGuidelines(anchor, mousePos, plane){
    const lines = [];
    if(!anchor || !mousePos) return lines;
    // horizontal through anchor
    lines.push({a:[0, anchor[1]], b:[(window.WIDTH||1000), anchor[1]], color:'#bbb', dashed:true});
    // vertical through anchor
    lines.push({a:[anchor[0], 0], b:[anchor[0], (window.HEIGHT||640)], color:'#bbb', dashed:true});
    if(plane && (plane.n_vec || plane.t_vec)){
      const n = plane.n_vec; const t = plane.t_vec;
      if(n){
        const span = 1400; // line length
        lines.push({a:[anchor[0]-n[0]*span/2, anchor[1]-n[1]*span/2], b:[anchor[0]+n[0]*span/2, anchor[1]+n[1]*span/2], color:'#d0a0ff', dashed:true});
      }
      if(t){
        const span = 1400;
        lines.push({a:[anchor[0]-t[0]*span/2, anchor[1]-t[1]*span/2], b:[anchor[0]+t[0]*span/2, anchor[1]+t[1]*span/2], color:'#a0d0ff', dashed:true});
      }
    }
    return lines;
  }

  window.snapping = { buildSnapPoints, snapPoint, buildGuidelines, snap };
})();
