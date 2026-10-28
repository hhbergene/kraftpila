/**
 * evaluate.js - Force evaluation and relation checking
 * 
 * IMPORTANT CONTRACT:
 * - Reads ONLY from task.expectedForces (forces that must be drawn by the user)
 * - Does NOT evaluate task.initialForces (pre-drawn forces locked in place)
 * - initialForces should NEVER be in the expectedForces array
 * - Non-expected student components are helper arrows, excluded from evaluation
 * - expectedForces must have complete anchor specifications (type, ref, point/segment)
 * - Explicit sumF: {} disables equilibrium checks
 * - Missing sumF defaults to {x:0, y:0} only when no complete relations exist
 * - Use window.cleanupTaskForEvaluation() before calling evaluation to ensure consistency
 */
(function(){
  const DIR_TOL_DEG = 2.0; // direction tolerance Degrees
  const POS_TOL = 5;      // position tolerance without feedback (px)
  const POS_COMMENT_ONLY = 0.999;
  const DIR_SPAN_DEG = 24; // linear falloff span for direction 
  const POS_SPAN = 44; // linear falloff span for position
  const COVERAGE_PENALTY_EXP = 1.5; // penalize missing forces
  const MATCH_THRESHOLD = 0.20; // matching threshold (keep at 0.2 for tolerance)
  const NAME_MISMATCH_PENALTY = 0.5; // penalty for name mismatch (use 0.5 for balanced matching)
  const NEATNESS_COMMENT_ONLY = 0.999;
  const NEATNESS_PENALTY_THRESHOLD = 0.95;
  const NEATNESS_OVERLAP_PENALTY = 0.9;
  // NEW: helper for adaptive direction tolerance (tighter for axis-aligned expected directions)
  function axisAlignedDirTol(dir){
    return (Math.abs(dir[0]) < 1e-3 || Math.abs(dir[1]) < 1e-3) ? (DIR_TOL_DEG/4) : DIR_TOL_DEG;
  }
  function computeNeatness(task, forceResults, allForces){
    const matched = (forceResults||[]).filter(r=> r.found && typeof r.index==='number' && r.index>=0)
      .map(r => allForces[r.index])
      .filter(f => f && Array.isArray(f.arrowBase) && Array.isArray(f.arrowTip) &&
        !(typeof window!=='undefined' && window.forceNotation && isIgnoredComponent(task,f)));
    const initialNames = new Set((task.initialForces||[])
      .map(f => f && f.name)
      .filter(Boolean)
      .map(name => name.toLowerCase().trim()));
    const initial = (allForces||[]).filter(f =>
      f && f.name && initialNames.has(f.name.toLowerCase().trim()) &&
      Array.isArray(f.arrowBase) && Array.isArray(f.arrowTip)
    );
    const forces = [
      ...matched.map(force => ({force, isInitial:false})),
      ...initial.map(force => ({force, isInitial:true}))
    ];
    const PARALLEL_TOL_DEG = 0.5;
    const OVERLAP_DIST_PX = 3;
    const BASE_POINT_TOL_PX = 3;
    let hasBasePointCrossing = false;
    let hasShaftOverlap = false;
    const cross = (a,b) => a[0]*b[1]-a[1]*b[0];
    const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
    const distanceToSegment = (point,start,end) => {
      const segment = [end[0]-start[0],end[1]-start[1]];
      const lengthSquared = segment[0]*segment[0]+segment[1]*segment[1];
      if(lengthSquared < 1e-12) return distance(point,start);
      const offset = [point[0]-start[0],point[1]-start[1]];
      const t = Math.max(0,Math.min(1,(offset[0]*segment[0]+offset[1]*segment[1])/lengthSquared));
      return distance(point,[start[0]+t*segment[0],start[1]+t*segment[1]]);
    };
    const basePointCrossesShaft = (point,start,end) => {
      const segment = [end[0]-start[0],end[1]-start[1]];
      const length = geometry.length(segment);
      if(length < 1e-6) return false;
      const offset = [point[0]-start[0],point[1]-start[1]];
      const projection = (offset[0]*segment[0]+offset[1]*segment[1])/length;
      return projection > BASE_POINT_TOL_PX && projection < length-BASE_POINT_TOL_PX &&
        distanceToSegment(point,start,end) <= BASE_POINT_TOL_PX;
    };
    const baseTouchesOtherShaft = (first,second) => {
      return basePointCrossesShaft(first.arrowBase,second.arrowBase,second.arrowTip) ||
        basePointCrossesShaft(second.arrowBase,first.arrowBase,first.arrowTip);
    };
    for(let i=0;i<forces.length;i++){
      const {force:fi,isInitial:fiInitial} = forces[i];
      const vi = [fi.arrowTip[0]-fi.arrowBase[0], fi.arrowTip[1]-fi.arrowBase[1]];
      const length = geometry.length(vi);
      if(length < 1e-6) continue;
      const axis = [vi[0]/length,vi[1]/length];
      for(let j=i+1;j<forces.length;j++){
        const {force:fj,isInitial:fjInitial} = forces[j];
        if(fiInitial && fjInitial) continue;
        if(typeof window!=='undefined' && window.forceNotation){
          const linked = (component,parent)=>window.forceNotation.role(component,task)==='component' &&
            window.forceNotation.key(window.forceNotation.parentName(component,task))===window.forceNotation.key(parent.name);
          if(linked(fi,fj) || linked(fj,fi)) continue;
        }
        const vj = [fj.arrowTip[0]-fj.arrowBase[0], fj.arrowTip[1]-fj.arrowBase[1]];
        const ang = angleBetweenDeg(vi, vj);
        const parallel = ang <= PARALLEL_TOL_DEG || Math.abs(180-ang) <= PARALLEL_TOL_DEG;
        if(!parallel){
          const offset = [fj.arrowBase[0]-fi.arrowBase[0],fj.arrowBase[1]-fi.arrowBase[1]];
          const denominator = cross(vi,vj);
          const t = cross(offset,vj)/denominator;
          const u = cross(offset,vi)/denominator;
          if(t < 0 || t > 1 || u < 0 || u > 1){
            if(baseTouchesOtherShaft(fi,fj)) hasBasePointCrossing = true;
            continue;
          }
          const intersection = [fi.arrowBase[0]+t*vi[0],fi.arrowBase[1]+t*vi[1]];
          const atBasePoint = distance(intersection,fi.arrowBase) <= BASE_POINT_TOL_PX ||
            distance(intersection,fj.arrowBase) <= BASE_POINT_TOL_PX;
          if(atBasePoint && baseTouchesOtherShaft(fi,fj)) hasBasePointCrossing = true;
          else if(atBasePoint) continue;
          else hasShaftOverlap = true;
          continue;
        }
        const offsets = [fj.arrowBase,fj.arrowTip].map(point=>[point[0]-fi.arrowBase[0],point[1]-fi.arrowBase[1]]);
        if(offsets.some(offset=>Math.abs(offset[0]*axis[1]-offset[1]*axis[0]) > OVERLAP_DIST_PX)) continue;
        const projections = offsets.map(offset=>offset[0]*axis[0]+offset[1]*axis[1]);
        const overlap = Math.min(length,Math.max(...projections))-Math.max(0,Math.min(...projections));
        if(overlap > OVERLAP_DIST_PX){
          hasShaftOverlap = true;
          continue;
        }
        if(baseTouchesOtherShaft(fi,fj)) hasBasePointCrossing = true;
      }
    }
    if(hasShaftOverlap) return NEATNESS_OVERLAP_PENALTY;
    return hasBasePointCrossing ? NEATNESS_COMMENT_ONLY : 1.0;
  }

  /**
   * Clamp value to min-max range
   * @param {number} val - Value to clamp
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} Clamped value
   */
  function clamp(val, min, max){
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Calculate angle between two vectors in degrees
   * @param {number[]} a - First vector [x, y]
   * @param {number[]} b - Second vector [x, y]
   * @returns {number} Angle in degrees (0-180), or 999 if vectors are zero
   */
  function angleBetweenDeg(a,b){
    const na = geometry.length(a);
    const nb = geometry.length(b);
    if(na<1e-6||nb<1e-6) return 999;
    let c=(a[0]*b[0]+a[1]*b[1])/(na*nb); c=Math.max(-1,Math.min(1,c));
    return Math.abs((180/Math.PI)*Math.acos(c));
  }

  /**
   * Normalize vector to unit length (magnitude 1)
   * @param {number[]} v - Vector [x, y]
   * @returns {number[]} Unit vector or [0,0] if input is zero vector
   */
  function unit(v){ const n = geometry.length(v); return n>1e-6? [v[0]/n,v[1]/n] : [0,0]; }

  /**
   * Calculate minimum distance from point to line segment
   * @param {number[]} p - Point [x, y]
   * @param {number[]} a - Segment start [x, y]
   * @param {number[]} b - Segment end [x, y]
   * @returns {number} Shortest distance from p to segment ab
   */
  function distPointToSegment(p,a,b){ const ab=[b[0]-a[0],b[1]-a[1]]; const ab2=ab[0]*ab[0]+ab[1]*ab[1]; if(ab2===0) return geometry.distance(p,a); const t=Math.max(0,Math.min(1, ((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1])/ab2)); const proj=[a[0]+t*ab[0], a[1]+t*ab[1]]; return geometry.distance(p,proj); }

  /**
   * Linear ramp-down scoring function with hard cut (strict version)
   * Returns 0 if |value| > hardCut, else linearly ramps down from tol to 0 over span
   * @param {number} value - Error value to evaluate
   * @param {number} tol - Tolerance threshold (perfect within this)
   * @param {number} span - Falloff distance
   * @param {number} hardCut - Hard cutoff (above this = 0, no mercy)
   * @returns {number} Score from 0 to 1
   */
  function rampDownLinearStrict(value, tol, span, hardCut){
    const a = Math.abs(value);
    if(a > hardCut) return 0; // Hard cut
    if(a <= tol) return 1;
    if(span <= 0) return 0;
    return clamp(1 - (a - tol)/span, 0, 1);
  }

  /**
   * Linear ramp-down scoring function (tolerance-based falloff)
   * Returns 1.0 if |value| <= tol, then linearly decreases to 0 over span distance
   * @param {number} value - Error value to evaluate
   * @param {number} tol - Tolerance threshold (perfect within this)
   * @param {number} span - Falloff distance (linear decrease from tol to tol+span)
   * @returns {number} Score from 0 to 1
   */
  function rampDownLinear(value, tol, span){ const a=Math.abs(value); if(a<=tol) return 1; if(span<=0) return 0; return clamp(1 - (a - tol)/span, 0, 1); }

  /**
   * Small position errors request feedback; larger errors fall off after half a grid step.
   * The near-1 score remains in the total so it can combine with other small deductions.
   */
  function positionScore(error){
    if(Math.abs(error) <= POS_TOL) return 1;
    return POS_COMMENT_ONLY * rampDownLinear(error, window.GRID_STEP/2, POS_SPAN);
  }

  /**
   * Geometric mean of three values (robust to zeros)
   * Returns the cubic root of product, treating zero/negative as 1e-6 minimum
   * @param {number} a - First value
   * @param {number} b - Second value
   * @param {number} c - Third value
   * @returns {number} Geometric mean
   */
  function geoMean(a,b,c){
    return Math.pow(Math.max(1e-6,a)*Math.max(1e-6,b)*Math.max(1e-6,c), 1/3);
  }

  /**
   * Normalize force name for comparison (lowercase, remove spaces/special chars)
   * @param {string} raw - Raw force name
   * @returns {string} Normalized name
   */
  function normalizeName(raw){ if(!raw) return ''; return window.forceNotation ? window.forceNotation.key(raw) : raw.toLowerCase().replace(/[ _^{}]/g,''); }

  /**
   * Build alias map for force name matching
   * Maps normalized names (including aliases) to canonical force names
   * @param {Object[]} expected - Array of expected force specs with name and optional aliases
   * @returns {Object} Map of normalized name -> canonical name
   */
  function buildAliasMap(expected){
    const map={};
    expected.forEach(spec=>{
      const cname = spec.name;
      map[normalizeName(cname)] = cname;
      (spec.aliases||[]).forEach(a=>{ map[normalizeName(a)] = cname; });
    });
    return map;
  }

  /**
   * Does a drawn name fit a spec's optional nameBase? Base + at most two letters, digits, star or apostrophe as suffix
   * (S, S_A, Sa, S_1, S*). Only used for specs that opt in with nameBase.
   */
  function matchesNameBase(rawName, base){
    const b = normalizeName(base);
    const d = normalizeName(rawName);
    if(!b || !d.startsWith(b)) return false;
    return /^[a-z0-9*'æøå]{0,2}$/.test(d.slice(b.length));
  }

  function nameMatchesSpec(rawName, spec, aliasMap){
    if(!rawName) return false;
    const drawn = normalizeName(rawName);
    if(drawn === normalizeName(spec.name)) return true;
    if(aliasMap[drawn] === spec.name) return true;
    return !!spec.nameBase && matchesNameBase(rawName, spec.nameBase);
  }

  function isIgnoredComponent(task,force){
    const notation = window.forceNotation;
    if(!notation || force.isExpected===false || force.moveable===false) return false;
    if((task.initialForces || []).some(spec=>normalizeName(spec.name)===normalizeName(force.name))) return false;
    if(notation.role(force,task)!=='component' || notation.givenSpec(force,task)) return false;
    const expected = task.expectedForces || [];
    const aliases = buildAliasMap(expected);
    return !expected.some(spec=>nameMatchesSpec(force.name,spec,aliases));
  }

  /**
   * Get expected direction vector for a force
   * @param {Object} spec - Force spec with dir (array or string reference)
   * @param {Object} task - Task object with scene/plane data
   * @returns {number[]} Unit direction vector
   */
  function expectedDir(spec, task){
    const d = spec.dir;
    if(Array.isArray(d)) return unit(d);
    const plane = task.scene.plane;
    if(d==='planeNormal') return unit(plane.n_vec);
    if(d==='planeTangent') return unit(plane.t_vec);
    return [1,0];
  }

  /**
   * Get direction vector for force component evaluation
   * @param {string} component - Component type: 'normal', 'tangent', 'vertical', or null for magnitude
   * @param {Object} task - Task object with scene/plane data
   * @returns {number[]|null} Unit direction vector or null for magnitude-only
   */
  function getComponentDir(component, task){
    const plane = task.scene.plane;
    if(component==='normal') return unit(plane.n_vec);
    if(component==='tangent') return unit(plane.t_vec);
    if(component==='vertical') return [0,-1];
    if(component==='horizontal') return [1,0];
    return null; // magnitude
  }

  /**
   * Match drawn forces to expected forces 
   * Scores based on name match, direction match and anchor position match
   * Forces without correct names can still match if score is above threshold
   * Uses greedy algorithm: highest scores matched first, each force matched at most once
   * @param {Object} task - Task with expectedForces array
   * @param {Object[]} forces - Array of drawn force objects with vec, anchor, name
   * @returns {Object} Map of expectedForceName -> drawnForceObject (for matched forces only)
   */
  function matchForcesToExpected(task, forces){
    const aliasMap = buildAliasMap(task.expectedForces||[]);
    const expectedDict = {};
    (task.expectedForces||[]).forEach(spec=>{ expectedDict[spec.name] = spec; });
    const initialNames = new Set((task.initialForces || []).map(spec=>normalizeName(spec.name)));
    
    // Compute pairwise match scores
    const pairs = []; // { score, taskName, forceIdx }
    for(const taskName in expectedDict){
      const spec = expectedDict[taskName];
      for(let idx=0; idx<forces.length; idx++){
        const drawnF = forces[idx];
        if(drawnF.isExpected===false || drawnF.moveable===false || initialNames.has(normalizeName(drawnF.name))) continue;
        if(isIgnoredComponent(task,drawnF)) continue;
        const hasGeom = drawnF.anchor && drawnF.arrowBase && drawnF.arrowTip;
        if(!hasGeom) continue;
        
        // Name match?
        let nameOk = nameMatchesSpec(drawnF.name, spec, aliasMap);
        
        // Direction match
        let dirScore = 0;
        if(drawnF.vec && spec.dir){
          const expected_dir = expectedDir(spec, task);
          const dir_tol_deg = axisAlignedDirTol(expected_dir);
          const dirErr = angleBetweenDeg(drawnF.vec, expected_dir);
          dirScore = rampDownLinear(dirErr, dir_tol_deg, DIR_SPAN_DEG);
        }
        
        // Position match
        let posScore = 0;
        if(spec.anchor && drawnF.anchor){
          if(spec.anchor.type==='point'){
            const sceneObj = window.sceneLookup[spec.anchor.ref];
            const P = sceneObj && sceneObj.points[spec.anchor.point];
            if(P){
              const posErr = geometry.distance(drawnF.anchor, P);
              posScore = positionScore(posErr);
            }
          } else if(spec.anchor.type==='segment'){
            const sceneObj = window.sceneLookup[spec.anchor.ref];
            const seg = sceneObj && sceneObj.segments[spec.anchor.segment];
            if(seg){
              const posErr = distPointToSegment(drawnF.anchor, seg[0], seg[1]);
              posScore = positionScore(posErr);
            }
          }
        }
        
        // Combined geometry score
        const geomScore = 0.6*dirScore + 0.4*posScore;
        
        // Combined with name penalty - more tolerant of missing name
        const combined = nameOk ? (0.5 + 0.5*geomScore) : (NAME_MISMATCH_PENALTY * geomScore);
        pairs.push({ score: combined, taskName, forceIdx: idx });
      }
    }
    
    // Greedy matching: sort by score, assign unique matches
    pairs.sort((a,b) => b.score - a.score);
    const matched = {};
    const usedForces = new Set();
    const usedExpected = new Set();
    
    for(const pair of pairs){
      if(pair.score <= MATCH_THRESHOLD) break;
      if(usedExpected.has(pair.taskName)) continue;
      if(usedForces.has(pair.forceIdx)) continue;
      matched[pair.taskName] = forces[pair.forceIdx];
      usedForces.add(pair.forceIdx);
      usedExpected.add(pair.taskName);
    }
    
    return matched;
  }

  /**
   * Evaluate all expected forces against drawn forces.
   * Computes name, direction, and position scores for each matched force.
   * Also stores anchorType for feedback messages.
   * 
   * CRITICAL: Only evaluates task.expectedForces, NOT initialForces.
   * initialForces must be excluded from expectedForces before calling this function.
   * Call window.cleanupTaskForEvaluation() first to ensure consistency.
   * 
   * @param {Object} task - Task with expectedForces and anchor specifications
   * @param {Object[]} forces - All drawn force objects
   * @returns {Object[]} Array of force results: {name, found, nameOk, dirErr, dirOk, posErr, posOk, index, drawnName, anchorType}
   */
  function evalForces(task, forces){
    const aliasMap = buildAliasMap(task.expectedForces||[]);
    const matched = matchForcesToExpected(task, forces);
    
    const results=[];
    const expectedForces = task.expectedForces || [];
    
    expectedForces.forEach(spec=>{
      const match = matched[spec.name];
      if(!match){
        results.push({name:spec.name, found:false, nameOk:false, drawnName:''});
        return;
      }
      
      // Direction error
      const userDir = match.vec ? unit(match.vec) : [0,0];
      const expDir = expectedDir(spec, task);
      const dirErr = angleBetweenDeg(userDir, expDir);
      const dirTolDeg = axisAlignedDirTol(expDir);
      const dirOk = dirErr <= dirTolDeg;
      
      // Name check
      let nameOk = nameMatchesSpec(match.name, spec, aliasMap);
      
      // Position error (and store anchor type for feedback)
      let posErr = null; let posOk=false; let anchorType=null;
      if(spec.anchor && match.anchor){
        if(spec.anchor.type==='point'){
          anchorType = 'point';
          const sceneObj = window.sceneLookup[spec.anchor.ref];
          const P = sceneObj && sceneObj.points[spec.anchor.point];
          if(P){ posErr = geometry.distance(match.anchor, P); posOk = positionScore(posErr) === 1; }
        } else if(spec.anchor.type==='custom' && spec.anchor.pos){
          anchorType = 'custom';
          posErr = geometry.distance(match.anchor, spec.anchor.pos); posOk = positionScore(posErr) === 1;
        } else if(spec.anchor.type==='segment'){
          anchorType = 'segment';
          const sceneObj = window.sceneLookup[spec.anchor.ref];
          const seg = sceneObj && sceneObj.segments[spec.anchor.segment];
          if(seg){ posErr = distPointToSegment(match.anchor, seg[0], seg[1]); posOk = positionScore(posErr) === 1; }
        }
      }
      
      const matchIndex = window.fm.forces.indexOf(match);
      results.push({
        name:spec.name,
        found:true,
        nameOk,
        dirErr,
        dirOk,
        dirTolDeg, 
        posErr,
        posOk,
        index:matchIndex,
        drawnName: match.name || '',
        anchorType,
        anchorSpec: spec.anchor || null,
        nameBase: spec.nameBase || null
      });
    });

    // Forces that share a nameBase but got identical names cannot be told apart by the student
    const byBase = {};
    results.forEach(r => {
      if(r.found && r.nameBase) (byBase[normalizeName(r.nameBase)] = byBase[normalizeName(r.nameBase)] || []).push(r);
    });
    Object.values(byBase).forEach(group => {
      const counts = {};
      group.forEach(r => { const k = normalizeName(r.drawnName); counts[k] = (counts[k] || 0) + 1; });
      group.forEach(r => {
        if(r.nameOk && counts[normalizeName(r.drawnName)] > 1){ r.nameOk = false; r.nameDuplicate = true; }
      });
    });
    return results;
  }

  /**
   * Get magnitude of force vector
   * @param {Object} f - Force object with optional .length property
   * @returns {number} Force magnitude
   */
  function magnitude(f){ return f.length || 0; }

  /**
   * Get component (e.g., normal, tangent) magnitude of force along direction
   * @param {Object} f - Force object with .vec property
   * @param {number[]} dir - Direction unit vector
   * @returns {number} Magnitude of force projection onto direction
   */
  function componentMagnitude(f, dir){ const v=f.vec; if(!v) return 0; const u=unit(dir); return Math.abs(v[0]*u[0]+v[1]*u[1]); }

  /**
   * Evaluate explicit sum-of-forces requirements; an empty object disables the check.
   * Checks if total force equals task requirements (tolerance ±5 units)
   * Penalizes extra unmatched forces that maintain equilibrium by 0.3 per force
   * @param {Object} task - Task with optional sumF: {x, y, n} requirements
   * @param {Object[]} forceResults - Force evaluation results (for reference)
   * @param {Object[]} allForces - All drawn force objects with .vec properties
   * @returns {Object} {x, y, n, score, errors} where score is 1.0 if equilibrium OK, lower if violated
   */
  function evalSumF(task, forceResults, allForces){
    
    const sumF = task.sumF || {};
    const result = { x: null, y: null, n: null, score: 1.0, errors: [] };
    if(!['x','y','n','t'].some(key => typeof sumF[key] === 'number')) return result;
    
    // Calculate sum of all forces (including unmatched ones)
    let sumX = 0, sumY = 0, sumN = 0, sumT = 0;
    (allForces || []).forEach((f, idx) => {
      if(!f.vec) return;
      if(window.forceNotation && window.forceNotation.role(f,task)!=='force') return;
      const isCompleted = typeof f.isCompleted==='function' ? f.isCompleted() : (f.anchor && f.arrowBase && f.arrowTip);
      if(!isCompleted) return;
      
      sumX += f.vec[0];
      sumY += f.vec[1];
      
      // Component sums (if plane exists)
      if(task.scene && task.scene.plane && (typeof sumF.n === 'number' || typeof sumF.t === 'number')){
        const plane = task.scene.plane;
        const n_unit = unit(plane.n_vec);
        const t_unit = unit(plane.t_vec || geometry.tangentFromNormal(plane.n_vec));
        sumN += f.vec[0]*n_unit[0] + f.vec[1]*n_unit[1];
        sumT += f.vec[0]*t_unit[0] + f.vec[1]*t_unit[1];
      }
    });
    
    const TOL_SUM = 0.5*GRID_STEP; // Tolerance for sum force  GRID_STEP=20?
    const SPAN_SUM = 4* TOL_SUM; // Falloff span
    
    const scores = [];
    
    // Check X component
    if(typeof sumF.x === 'number'){
      result.x = sumX;
      const err = Math.abs(sumX - sumF.x);
      const xScore = rampDownLinear(err, TOL_SUM, SPAN_SUM);
      scores.push(xScore);
      if(err > TOL_SUM) result.errors.push(`ΣF_x = ${sumX.toFixed(0)}, should be ${sumF.x}`);
    }
    
    // Check Y component
    if(typeof sumF.y === 'number'){
      result.y = sumY;
      const err = Math.abs(sumY - sumF.y);
      const yScore = rampDownLinear(err, TOL_SUM, SPAN_SUM);
      scores.push(yScore);
      if(err > TOL_SUM) result.errors.push(`ΣF_y = ${sumY.toFixed(0)}, should be ${sumF.y}`);
    }
    
    // Check T component
    if(typeof sumF.t === 'number'){
      result.t = sumT;
      const err = Math.abs(sumT - sumF.t);
      scores.push(rampDownLinear(err, TOL_SUM, SPAN_SUM));
      if(err > TOL_SUM) result.errors.push(`ΣF_t = ${sumT.toFixed(0)}, should be ${sumF.t}`);
    }

    // Check N component
    if(typeof sumF.n === 'number'){
      result.n = sumN;
      const err = Math.abs(sumN - sumF.n);
      const nScore = rampDownLinear(err, TOL_SUM, SPAN_SUM);
      scores.push(nScore);
      if(err > TOL_SUM) result.errors.push(`ΣF_n = ${sumN.toFixed(0)}, should be ${sumF.n}`);
    }
    
    // Score: mean of all component scores (or 1.0 if no components to check)
    result.score = scores.length > 0 ? (scores.reduce((a,b) => a+b, 0) / scores.length) : 1.0;
    
    return result;
  }

  /**
   * Evaluate magnitude relations between forces
   * Checks that force ratios (e.g., G = N, F = R) match expected values
   * Handles component-based comparisons (normal, tangent, vertical) when specified
   * Returns score 0 if any involved force is missing
   * @param {Object} task - Task with optional tol_rel (fraction) and tol_abs (px) per relation
   * @param {Object[]} forceResults - Force evaluation results with found/index properties
   * @returns {Object[]} Relation results with scores, absolute errors and effective tolerances
   */
  function evalRelations(task, forceResults){
    const forceByName = {};
    const indexByName = {};
    
    // Include matched expected forces from forceResults
    forceResults.forEach(r=>{
      if(r.found && r.index >= 0){
        forceByName[r.name] = window.fm.forces[r.index];
        indexByName[r.name] = r.index;
      }
    });
    
    // Include initialForces (pre-drawn forces) - they can be used in relations
    if(task.initialForces && Array.isArray(task.initialForces)){
      task.initialForces.forEach(initSpec => {
        if(initSpec.name && window.fm && window.fm.forces){
          const matchingForce = window.fm.forces.find(f => f && f.name && normalizeName(f.name) === normalizeName(initSpec.name));
          if(matchingForce){
            const idx = window.fm.forces.indexOf(matchingForce);
            if(idx >= 0){
              forceByName[initSpec.name] = matchingForce;
              indexByName[initSpec.name] = idx;
            }
          }
        }
      });
    }
    
    const out=[];
    const rels = (task.relations || []).filter(r => r && r.lhs && r.lhs.length && r.rhs && r.rhs.length); // hopp over ufullstendige relasjoner
    rels.forEach(rel=>{
      const tolRel = rel.tol_rel ?? window.RELATION_TOL_REL;
      const tolAbs = rel.tol_abs ?? window.RELATION_TOL_ABS;
      function sum(side){
        let s=0; side.forEach(term=>{
          const f = forceByName[term.name];
          if(!f) return; // missing contributes 0
          if(term.component){
            const dir = getComponentDir(term.component, task);
            if(dir) s += componentMagnitude(f, dir);
            else s += magnitude(f);
          } else {
            s += magnitude(f);
          }
        });
        return s;
      }

      const lhsNames = rel.lhs.map(t=>t.name);
      const rhsNames = rel.rhs.map(t=>t.name);
      const allNames = [...lhsNames, ...rhsNames];
      
      const formatTerm = term => {
        const suffix = {
          horizontal: 'x',
          vertical: 'y',
          tangent: 't',
          normal: 'n'
        }[term.component];
        return suffix ? `${term.name}_${suffix}` : `|${term.name}|`;
      };
      
      const lhsV = sum(rel.lhs); const rhsV = sum(rel.rhs);
      const measuredRatio = rhsV===0? null : lhsV/rhsV;
      const resolvedRatio=window.getEffectiveRelationRatio(task,rel);
      if(resolvedRatio.error) throw new Error(`Ugyldig kraftforhold: ${resolvedRatio.error}`);
      const expected = resolvedRatio.value;
      const expectedValue = expected*rhsV;
      const absError = Math.abs(lhsV-expectedValue);
      const relError = expectedValue===0 ? null : absError/Math.abs(expectedValue);
      const tolerance = Math.max(tolRel*Math.abs(expectedValue),tolAbs);

      const involvedIdx = [];
      allNames.forEach(name=>{
        const idx=indexByName[name];
        if(typeof idx==='number') involvedIdx.push(idx);
      });

      const missingNames = allNames.filter(n => typeof indexByName[n] !== 'number');
      
      // If any involved force is missing, relation score is 0 (not gradual)
      const relScore = missingNames.length > 0 ? 0 : relationScore(absError,tolerance);
      const ok = absError <= tolerance && missingNames.length === 0;

      out.push({
        lhs: lhsNames.join('+'),
        rhs: rhsNames.join('+'),
        lhsExpression: rel.lhs.map(formatTerm).join(' + '),
        rhsExpression: rel.rhs.map(formatTerm).join(' + '),
        forceNames: allNames,
        missingNames,
        missingInvolved: missingNames.length>0,
        expectedRatio: expected,
        measuredRatio,
        relError,
        absError,
        tolerance,
        relScore, 
        ok,
        indices: involvedIdx,
        tolRel,
        tolAbs
      });
    });
    return out;
  }

  // Gentle deductions up to 3 tolerances, then a steeper falloff to zero at 6.
  function relationScore(error, tolerance){
    if(error <= tolerance) return 1;
    if(tolerance === 0) return 0;
    const normalized = error/tolerance;
    if(normalized <= 3) return 1 - 0.15*(normalized-1);
    return 0.7*clamp((6-normalized)/3,0,1);
  }

  /**
   * Build user feedback lines for force and relation errors
   * Distinguishes missing names from wrong names
   * Skips detail feedback for forces with explicitly wrong names
   * Uses force name as fallback when drawnName is empty
   * Includes anchor-specific messages for position errors
   * @param {Object[]} forceResults - Force evaluation results
   * @param {Object[]} relationResults - Relation evaluation results
   * @param {Object[]} allForces - All drawn forces (for detecting extras)
   * @param {boolean} debugMode - If true, include error magnitudes in messages
   * @param {Object} task - Task object with expectedForces and initialForces
   * @param {number} neatness - Neatness factor (1.0 = perfect, < 1.0 = overlapping)
   * @returns {Object[]} Array of feedback lines: {text, indices}
   */
  function buildFeedbackLines(forceResults, relationResults, allForces, debugMode, task, neatness){
    const lines=[];
    
    // Separate forces with missing names from those with wrong names
    const missingNames = forceResults.filter(r => r.found && !r.nameOk && !r.nameDuplicate && !r.drawnName);
    const wrongNames = forceResults.filter(r => r.found && !r.nameOk && !r.nameDuplicate && r.drawnName);
    const duplicateNames = forceResults.filter(r => r.found && r.nameDuplicate);

    if(duplicateNames.length > 0){
      lines.push({
        text: 'Krefter som ikke er identiske må ha ulikt navn',
        indices: duplicateNames.map(r => r.index).filter(idx => typeof idx === 'number')
      });
    }
    
    // Feedback for missing names
    if(missingNames.length > 0){
      let msg;
      if(missingNames.length === 1){
        msg = `Det mangler navn på en kraft`;
      } else if(missingNames.length === (forceResults.filter(r=>r.found).length)){
        msg = `Det mangler navn på kreftene`;
      } else {
        msg = `Det mangler navn på ${missingNames.length} krefter`;
      }
      const indices = missingNames.map(r => r.index).filter(idx => typeof idx === 'number');
      lines.push({ text: msg, indices });
    }
    
    // Feedback for wrong names
    if(wrongNames.length > 0){
      let msg;
      if(wrongNames.length === 1){
        msg = `Feil navn på en kraft`;
      } else if(wrongNames.length === (forceResults.filter(r=>r.found).length)){
        msg = `Feil navn på krefter`;
      } else {
        msg = `Feil navn på ${wrongNames.length} krefter`;
      }
      const indices = wrongNames.map(r => r.index).filter(idx => typeof idx === 'number');
      lines.push({ text: msg, indices });
    }
    
    // Count missing forces (not found at all)
    const missingForces = forceResults.filter(r => !r.found);
    if(missingForces.length > 0){
      let msg;
      if(missingForces.length === 1){
        msg = `Det mangler en kraft`;
      } else {
        msg = `Det mangler ${missingForces.length} krefter`;
      }
      lines.push({ text: msg, indices: [] });
    }
    
    forceResults.forEach(r=>{
      if(!r.found){ 
        return; 
      }
      
      // Check name, direction, position status
      const nameOk = r.nameOk;
      const dirOk = r.dirOk;
      const posOk = (r.posErr!=null) && r.posOk;
      
      // Skip detailed feedback if name is missing or wrong
      if(!nameOk) return;
      
      // Use r.name as fallback when drawnName is empty (NEW)
      const label = r.drawnName || r.name;
      
      // Build messages based on dir and pos status
      if(!dirOk){
        // Direction wrong
        let msg = `Juster retningen til ${label}`;
        if(debugMode && typeof r.dirErr === 'number') msg += ` (${r.dirErr.toFixed(1)}°)`;
        lines.push({ text: msg, indices: [r.index] });
      }
      
      if(!posOk && r.posErr !== null){
        // Position wrong - use anchor type for message (NEW)
        let anchorDesc = 'angrepspunktet';
        const sp = r.anchorSpec || {};
if(r.anchorType === 'point'){
          anchorDesc = (sp.point === 'center') ? 'massesenteret' : 'kontaktpunktet';
        } else if(r.anchorType === 'segment'){
          anchorDesc = 'kontaktflaten';
        } else if(r.anchorType === 'custom'){
          anchorDesc = 'markert punkt';
        }
        let msg = `Angrepspunkt til ${label} bør ligge i ${anchorDesc}`;
        if(debugMode && typeof r.posErr === 'number') msg += ` (${r.posErr.toFixed(1)}px)`;
        lines.push({ text: msg, indices: [r.index] });
      }
    });
    
    relationResults.forEach(rr=>{
      if(rr.ok) return; // Skip relations that are OK
      
      // Skip if any involved force is completely missing
      if(rr.missingInvolved) return;
      
      // Check if involved forces are truly missing (not in allForces, OR in forceResults but not found)
      const involvedForcesMissing = rr.indices.some(idx => {
        // Check if force is in allForces
        if(idx < 0 || idx >= allForces.length) return true;
        const force = allForces[idx];
        const isCompleted = typeof force.isCompleted==='function' ? force.isCompleted() : (force.anchor && force.arrowBase && force.arrowTip);
        if(!isCompleted) return true;
        
        // If it's in forceResults, it must be found
        const resultForForce = forceResults.find(r => r.index === idx);
        if(resultForForce && !resultForForce.found) return true;
        
        // Otherwise, it's drawn (either expectedForce or initialForce)
        return false;
      });
      
      if(involvedForcesMissing) return;
      
      // Skip relation feedback if any involved force has wrong or missing name
      const involvedForceHasWrongName = rr.indices.some(idx => {
        const resultForForce = forceResults.find(r => r.index === idx);
        if(resultForForce && !resultForForce.nameOk) return true;
        return false;
      });
      
      if(involvedForceHasWrongName) return;

      // Bygg navnsliste
      const forceNames = [];
      if(rr.forceNames && Array.isArray(rr.forceNames)){
        forceNames.push(...rr.forceNames);
      } else {
        if(rr.lhs) forceNames.push(rr.lhs);
        if(rr.rhs) forceNames.push(rr.rhs);
      }

      let msg = '';
      if(forceNames.length <= 2){
        msg = `Lengdeforholdet mellom kreftene ${forceNames.join(' og ')} er feil`;
      } else {
        const allButLast = forceNames.slice(0, -1).join(', ');
        const last = forceNames[forceNames.length-1];
        msg = `Lengdeforholdet mellom kreftene ${allButLast} og ${last} er feil`;
      }
      
      // Feedback with measured vs expected ratio (only in debug mode)
      let feedback = '';
      if(debugMode){
        if(typeof rr.measuredRatio === 'number' && typeof rr.expectedRatio === 'number'){
          const measured = rr.measuredRatio.toFixed(2);
          const expected = rr.expectedRatio.toFixed(2);
          feedback = ` (målt ${measured}, forventet ${expected})`;
        } else {
          feedback = ` (avvik ${rr.absError.toFixed(1)}px)`;
        }
      }
      
      msg += feedback;
      lines.push({ text: msg, indices: rr.indices||[] });
    });
    
    // Check for extra unmatched forces (exclude initialForces)
    const matchedIndices = new Set();
    forceResults.forEach(r => {
      if(r.found && r.index >= 0) matchedIndices.add(r.index);
    });
    
    // Build set of initialForce names for exclusion
    const initialForceNames = new Set();
    if(task.initialForces && Array.isArray(task.initialForces)){
      task.initialForces.forEach(f => {
        if(f.name) initialForceNames.add(f.name.toLowerCase().trim());
      });
    }
    
    const extraForces = (allForces||[]).filter((f, idx) => {
      const isCompleted = typeof f.isCompleted==='function' ? f.isCompleted() : (f.anchor && f.arrowBase && f.arrowTip);
      // Exclude forces that are initialForces (matched by name)
      const isInitialForce = f.name && initialForceNames.has(f.name.toLowerCase().trim());
      return isCompleted && !matchedIndices.has(idx) && !isInitialForce && !isIgnoredComponent(task,f);
    });
    
    if(extraForces.length > 0){
      let msg;
      if(extraForces.length === 1){
        msg = `Det er tegnet 1 kraft for mye`;
      } else {
        msg = `Det er tegnet ${extraForces.length} krefter for mye`;
      }
      const indices = extraForces.map((_, idx) => allForces.indexOf(extraForces[idx])).filter(idx => idx >= 0);
      lines.push({ text: msg, indices });
    }
    
    // Warn for shaft overlap or a shaft crossing another arrow's base point.
    if(neatness !== undefined && neatness < 1.0){
      lines.push({ text: `Unngå at kraftpiler går gjennom hverandre ved å parallellforskyve pila litt til siden.`, indices: [] });
    }
    
    return lines;
  }

  /**
   * Compute overall scoring based on force and relation evaluation
   * 
   * Scoring formula:
   * - Per-force score: geoMean(nameScore, dirScore, posScore) - geometric mean makes 0 in any component very punishing
   * - baseScore: average of per-force scores for ALL expected forces (0 if not found)
   * - coverage: foundCount / expectedCount, penalized by factor ^ 1.5
   * - relations: score 0 if any force missing, else rampDownLinear
   * - gating: apply caps based on coverage and essential forces (G, N)
   * 
   * Final formula includes all components and strict gating.
   * 
   * @param {Object} task - Task with expectedForces, relations, sumF requirements
   * @param {Object[]} forceResults - Force evaluation results from evalForces()
   * @param {Object[]} relationResults - Relation evaluation results from evalRelations()
   * @param {Object[]} allForces - All drawn force objects
   * @returns {Object} {expectedCount, foundCount, extrasCount, coverage, baseScore, relationsScore, finalScore, debugOutput, sumFResult}
   */
  function computeScores(task, forceResults, relationResults, allForces){
    const expectedCount = (task.expectedForces||[]).length;
    const foundForces = forceResults.filter(r=>r.found);
    const foundCount = foundForces.length;
    const completedCount = (allForces||[]).filter(f=> typeof f.isCompleted==='function' ? f.isCompleted() : (f.anchor && f.arrowBase && f.arrowTip)).length;
    
    // Count extras: completed forces that were NOT matched to expected forces
    const matchedIndices = new Set();
    forceResults.forEach(r => {
      if(r.found && r.index >= 0) matchedIndices.add(r.index);
    });
    
    // Build set of initialForce names for exclusion from extras count
    const initialForceNames = new Set();
    if(task.initialForces && Array.isArray(task.initialForces)){
      task.initialForces.forEach(f => {
        if(f.name) initialForceNames.add(f.name.toLowerCase().trim());
      });
    }
    
    const extrasCount = (allForces||[]).reduce((count, f, idx) => {
      const isCompleted = typeof f.isCompleted==='function' ? f.isCompleted() : (f.anchor && f.arrowBase && f.arrowTip);
      // Exclude initialForces from extras count
      const isInitialForce = f.name && initialForceNames.has(f.name.toLowerCase().trim());
      return count + (isCompleted && !matchedIndices.has(idx) && !isInitialForce && !isIgnoredComponent(task,f) ? 1 : 0);
    }, 0);

    // NEW: Per-force scoring including missing forces (count as 0)
    // For each expected force, compute score from its result or 0 if not found
    let perForceScores = [];
    const expectedNames = (task.expectedForces||[]).map(s=>s.name);
    expectedNames.forEach(name=>{
      const r = forceResults.find(rr=>rr.name === name && rr.found);
      if(!r){
        // Force not found → score 0
        perForceScores.push(0);
        return;
      }
      const nameScore = r.nameOk ? 1.0 : 0.0;
      const dirTol = r.dirTolDeg || DIR_TOL_DEG;
      const dirScore = (typeof r.dirErr==='number') ? rampDownLinear(r.dirErr, dirTol, DIR_SPAN_DEG) : 0.0;
      const posScore = (typeof r.posErr==='number') ? positionScore(r.posErr) : 0.0;
      // Use arithmetic mean instead of geometric mean for more balanced scoring
      const spec = (task.expectedForces || []).find(force=>force.name===name);
      const combined = spec?.studentGiven?.name ? (dirScore + posScore) / 2 : (nameScore + dirScore + posScore) / 3;
      perForceScores.push(combined);
    });

    const baseScore = perForceScores.length > 0 ? (perForceScores.reduce((a,b)=>a+b,0)/perForceScores.length) : 0.0;
    // Coverage: how many expected forces were found (extras don't affect coverage)
    const coverage = expectedCount>0? (foundCount/expectedCount) : 1.0;
    const coverageFactor = Math.pow(clamp(coverage,0,1), COVERAGE_PENALTY_EXP);

    // NEW: Relations score with strict missing handling
    let relationsScore = 1.0;
    if(relationResults && relationResults.length){
      const relScores = relationResults.map(rr => rr.relScore);
      relationsScore = relScores.length? (relScores.reduce((a,b)=>a+b,0)/relScores.length) : 1.0;
    }
    const hasRelations = (task.relations || []).some(r => r && r.lhs && r.lhs.length && r.rhs && r.rhs.length);
    // Missing requirements default to equilibrium only when relations do not govern lengths.
    const sumFTask = task.sumF === undefined && !hasRelations ? {...task, sumF:{x:0,y:0}} : task;
    const hasSumF = !!sumFTask.sumF && ['x','y','n','t'].some(k => typeof sumFTask.sumF[k] === 'number');
    
    // Sum of forces check (penalize extra forces if they break equilibrium)
    const sumFResult = evalSumF(sumFTask, forceResults, allForces);
    const sumFScore = sumFResult.score;
    
    // Combine scores based on what we have
    let sumFWeighted = sumFScore;
    if(extrasCount > 0){
      sumFWeighted = sumFScore*0.5*(extrasCount<=2?1.:Math.pow(0.7, extrasCount-2));
    }
    
    let combined;
    if(hasRelations){
      // With relations: use base score and relations only (sumF is fallback only)
      combined = (baseScore + relationsScore) / 2;
    } else if(!hasSumF){
      // Verken relasjoner eller ΣF-krav: bare kraftgjennomsnittet teller
      combined = baseScore;
    } else {
      // Uten relasjoner, men med ΣF-krav: bruk sumF
      combined = (baseScore + sumFWeighted) / 2;
    }
    
    const neatness = computeNeatness(task, forceResults, allForces);
    // Near-1 factors request a comment but do not reduce the total score.
    const neatnessMultiplier = neatness < NEATNESS_PENALTY_THRESHOLD ? neatness : 1.0;
    let finalScore = combined * coverageFactor * neatnessMultiplier;
    
    // NEW: Apply gating/caps based on coverage and essential forces
    let cap = 1.0;
    if(coverage < 0.75) cap = Math.min(cap, 0.6);     // mangler mye → maks 60%
    if(coverage < 0.50) cap = Math.min(cap, 0.35);    // mangler halvparten → maks 35%
    
    // Check for missing essential forces (G and N)
    // Only forces the task actually expects count as essential
    const missing = name => expectedNames.includes(name) && !forceResults.find(r=>r.name === name && r.found);
    if(missing("G") || missing("N")) cap = Math.min(cap, 0.75);
    
    finalScore = Math.min(finalScore, cap);
    finalScore = clamp(finalScore, 0, 1);

    // Build debug output if needed
    let debugOutput = '';
    const debugMode = window.settings && window.settings.debug;
    if(debugMode){
      debugOutput = `═══ FULL SCORING BREAKDOWN ═══\n`;
      debugOutput += `📌 FORVENTEDE KREFTER:\n`;
      (task.expectedForces || []).forEach(spec => {
        debugOutput += `  - ${spec.name}\n`;
      });
      
      debugOutput += `✏️ TEGNEDE KREFTER:\n`;
      // Only show drawn forces that correspond to expectedForces
      const expectedForceNames = (task.expectedForces || []).map(f => f.name);
      allForces.forEach((f, idx) => {
        if(!f.anchor || !f.arrowBase || !f.arrowTip) return;
        // Skip if this force is not in expectedForces (e.g., initialForces)
        if(f.name && !expectedForceNames.includes(f.name)) return;
        const result = forceResults.find(r => r.index === idx);
        const nameStatus = result ? (result.nameOk ? '✓' : '✗') : '?';
        const dirStatus = result ? (result.dirOk ? '✓' : '✗') : '?';
        const posStatus = result ? (result.posErr !== null ? (result.posOk ? '✓' : '✗') : '-') : '?';
        const displayName = f.name || '(no name)';
        debugOutput += `  ${displayName}: Navn${nameStatus} Retning${dirStatus} Posisjon${posStatus}${result && result.dirErr !== undefined ? ` (${result.dirErr.toFixed(1)}°)` : ''}\n`;
      });
      
      debugOutput += `📊 KRAFT-SCORER (med aritmetisk gjennomsnitt):\n`;
      expectedNames.forEach((name, idx) => {
        const r = forceResults.find(rr => rr.name === name && rr.found);
        if(!r){
          debugOutput += `  ${name}: MANGLER (0%)\n`;
        } else {
          const nameScore = r.nameOk ? 1.0 : 0.0;
          const dirTol = r.dirTolDeg || DIR_TOL_DEG;
          const dirScore = (typeof r.dirErr==='number') ? rampDownLinear(r.dirErr, dirTol, DIR_SPAN_DEG) : 0.0;
          const posScore = (typeof r.posErr==='number') ? positionScore(r.posErr) : 0.0;
          const combined = perForceScores[idx];
          const nameInfo = (task.expectedForces || []).find(spec=>spec.name===name)?.studentGiven?.name ? 'oppgitt' : nameScore.toFixed(2);
          debugOutput += `  ${name}: Navn=${nameInfo} Dir=${dirScore.toFixed(2)} (tol=${dirTol.toFixed(2)}°) Pos=${posScore.toFixed(2)} → Gjennomsnitt=${(combined*100).toFixed(0)}%\n`;
        }
      });
      
      const baseScoreInfo = baseScore > 0 ? `${(baseScore*100).toFixed(0)}%` : `0%`;
      const sumFScoreInfo = `${(sumFScore*100).toFixed(0)}%`;
      const coverageFactorVal = Math.pow(coverage, 1.5);

      debugOutput += `📏 ALLE KRAFTER (navn, lengde, retning, type):\n`;
      allForces.forEach(f => {
        if(!f.anchor || !f.arrowBase || !f.arrowTip) return;
        const vec = f.vec;
        const len = typeof f.length === 'number' ? f.length : (Array.isArray(vec) ? Math.hypot(vec[0], vec[1]) : null);
        const dirV = Array.isArray(f.force_dir) ? `(${f.force_dir[0].toFixed(2)}, ${f.force_dir[1].toFixed(2)})` : '?';
        const kind = f.isExpected === false || f.moveable === false ? 'låst' : 'tegnet';
        const plane = task.scene && task.scene.plane;
        const fx = Array.isArray(vec) ? vec[0] : null;
        const fy = Array.isArray(vec) ? vec[1] : null;
        const ftDir = plane && plane.t_vec && getComponentDir('tangent', task);
        const fnDir = plane && plane.n_vec && getComponentDir('normal', task);
        const ft = Array.isArray(vec) && ftDir ? vec[0]*ftDir[0] + vec[1]*ftDir[1] : null;
        const fn = Array.isArray(vec) && fnDir ? vec[0]*fnDir[0] + vec[1]*fnDir[1] : null;
        const fmt = value => typeof value === 'number' ? value.toFixed(1) : '?';
        debugOutput += `  ${f.name || '(uten navn)'}: F_x=${fmt(fx)}, F_y=${fmt(fy)}, F_t=${fmt(ft)}, F_n=${fmt(fn)}, |F|=${fmt(len)}px, dir ${dirV}, ${kind}\n`;
      });

      if(relationResults && relationResults.length){
        debugOutput += `⚖️ RELASJONER:\n`;
        relationResults.forEach(r => {
          const status = r.ok ? '✓' : '✗';
          const ratioText = r.measuredRatio === null ? 'udefinert' : r.measuredRatio.toFixed(2);
          const relativeError = r.relError === null ? '' : ` / ${(r.relError*100).toFixed(1)}%`;
          debugOutput += `  ${status} ${r.lhsExpression || r.lhs} = ${r.rhsExpression || r.rhs}: målt forhold ${ratioText}, forventet ${r.expectedRatio}, avvik ${r.absError.toFixed(2)}px${relativeError} (tol ${(r.tolRel*100).toFixed(1)}% eller ${r.tolAbs.toFixed(2)}px; effektiv ${r.tolerance.toFixed(2)}px), score ${(r.relScore*100).toFixed(1)}%`;
          if(r.missingNames && r.missingNames.length) debugOutput += `, mangler: ${r.missingNames.join(', ')}`;
          debugOutput += `\n`;
        });
      }

      if(hasSumF){
        debugOutput += `Σ SUM AV KREFTER:\n`;
        if(sumFTask !== task) debugOutput += `  Fallback: manglende sumF uten relasjoner gir ΣF_x = ΣF_y = 0\n`;
        ['x','y','n','t'].forEach(k => {
          if(typeof sumFTask.sumF[k] === 'number') debugOutput += `  ΣF_${k} = ${sumFResult[k] === null ? '?' : sumFResult[k].toFixed(1)} (krav ${sumFTask.sumF[k]})\n`;
        });
        (sumFResult.errors || []).forEach(e => { debugOutput += `  ⚠️ ${e}\n`; });
      }
      
      debugOutput += `📈 SCORE COMPONENTS:\n`;
      debugOutput += `  Base score (kraft-gjennomsnitt): ${baseScoreInfo}\n`;
      debugOutput += hasSumF
        ? `  Sum of forces (equilibrium): ${sumFScoreInfo}${sumFResult.errors && sumFResult.errors.length ? ' ⚠️ ' + sumFResult.errors.length + ' feil' : ' ✓'}\n`
        : `  Sum of forces (equilibrium): ikke evaluert\n`;
      
      if(hasRelations){
        debugOutput += `  Relations score: ${(relationsScore*100).toFixed(0)}%\n`;
      }
      
      debugOutput += `  Coverage (${foundCount}/${expectedCount}): ${(coverage*100).toFixed(0)}%\n`;
      debugOutput += `  Coverage factor (^1.5): ${(coverageFactorVal*100).toFixed(0)}%\n`;
      debugOutput += `  Neatness factor: ${(neatness*100).toFixed(0)}%\n`;
      debugOutput += `  Gating cap: ${(cap*100).toFixed(0)}%\n`;
      
      debugOutput += `\n🧮 FINAL SCORE FORMULA:\n`;
      
      // Use consistent sumFWeighted formula for debug
      const sumFWeightedDebug = sumFWeighted;
      const sumFWeightedPct = (sumFWeightedDebug * 100).toFixed(0);
      
      if(hasRelations){
        debugOutput += `  Combined = (Base + Relations) / 2 (SumF is fallback only)\n`;
        debugOutput += `  Combined = (${baseScoreInfo} + ${(relationsScore*100).toFixed(0)}%) / 2 = ${(combined*100).toFixed(0)}%\n`;
        debugOutput += `  Intermediate = Combined × Coverage × Neatness\n`;
        debugOutput += `  Intermediate = ${(combined*100).toFixed(0)}% × ${(coverageFactorVal*100).toFixed(0)}% × ${(neatnessMultiplier*100).toFixed(0)}% = ${((combined*coverageFactorVal*neatnessMultiplier)*100).toFixed(0)}%\n`;
      } else if(!hasSumF){
        debugOutput += `  Combined = Base (ingen relasjoner eller ΣF-krav) = ${(combined*100).toFixed(0)}%\n`;
        debugOutput += `  Intermediate = Combined × Coverage × Neatness\n`;
        debugOutput += `  Intermediate = ${(combined*100).toFixed(0)}% × ${(coverageFactorVal*100).toFixed(0)}% × ${(neatnessMultiplier*100).toFixed(0)}% = ${((combined*coverageFactorVal*neatnessMultiplier)*100).toFixed(0)}%\n`;
      } else {
        debugOutput += `  Combined = (Base + SumF) / 2\n`;
        debugOutput += `  Combined = (${baseScoreInfo} + ${(sumFWeighted*100).toFixed(0)}%) / 2 = ${(combined*100).toFixed(0)}%\n`;
        debugOutput += `  Intermediate = Combined × Coverage × Neatness\n`;
        debugOutput += `  Intermediate = ${(combined*100).toFixed(0)}% × ${(coverageFactorVal*100).toFixed(0)}% × ${(neatnessMultiplier*100).toFixed(0)}% = ${((combined*coverageFactorVal*neatnessMultiplier)*100).toFixed(0)}%\n`;
      }
      
      debugOutput += `  Final = min(Intermediate, Cap) = min(${((combined*coverageFactorVal*neatnessMultiplier)*100).toFixed(0)}%, ${(cap*100).toFixed(0)}%) = ${(finalScore*100).toFixed(0)}%\n`;
      debugOutput += `═════════════════════════`;
    }
    
    return { expectedCount, foundCount, extrasCount, coverage, baseScore, relationsScore, finalScore, debugOutput, sumFResult, neatness };
  }

  /**
   * Convert finalScore (0-1) to points (0-2) with strict thresholds
   * @param {number} score - Final score (0-1)
   * @returns {number} Points (0-2)
   */
  function scoreToPoints(score){
    if(score < 0.20) return 0.0;
    if(score < 0.40) return 0.5;
    if(score < 0.65) return 1.0;
    if(score < 0.88) return 1.5;
    if(score < 0.94) return 1.75;
    return 2.0;
  }

  /**
   * Main evaluation orchestrator
   * Runs complete evaluation pipeline and displays results
   * Uses global window.currentTask and window.fm (force manager)
   * Displays score via window.showFeedback() or fallback to DOM element
   */
  function runEvaluation(){
    if(!window.currentTask || !window.fm){
      return;
    }
    const t = window.currentTask;
    const relationErrors=(t.relations || []).map((relation,index)=>{
      const result=window.getEffectiveRelationRatio(t,relation);
      return result.error ? `Relasjon ${index+1}: ${result.error}` : null;
    }).filter(Boolean);
    if(relationErrors.length){
      const message=`Oppgaven kan ikke vurderes. ${relationErrors.join(' ')}`;
      console.error(message);
      window.lastEvaluation=null;
      if(window.showFeedback) window.showFeedback([{text:message}], 'Ugyldig oppgave');
      else if(typeof alert==='function') alert(message);
      return;
    }
    window.fm.normalizeNames?.();
    const inputs = typeof document!=='undefined' && document.getElementById('force-inputs');
    if(inputs) window.fm.syncInputs?.(inputs);
    if(Array.isArray(t.expectedForces) && Array.isArray(t.initialForces) && t.initialForces.length){
      const locked = new Set(t.initialForces.map(f => f && f.name).filter(Boolean));
      t.expectedForces = t.expectedForces.filter(f => !(f && locked.has(f.name)));
    }
    const forceResults = evalForces(window.currentTask, window.fm.forces);
    const relationResults = evalRelations(window.currentTask, forceResults);
    const summary = computeScores(window.currentTask, forceResults, relationResults, window.fm.forces);
    
    // Convert finalScore (0-1) to points (0-2) with strict thresholds
    const points = scoreToPoints(summary.finalScore);
    const scoreText = `Score: ${summary.finalScore.toFixed(2)} (${points.toFixed(points === 1.75 ? 2 : 1)} poeng)`;
    
    // Build feedback lines
    const lines = [];
    
    if(summary.debugOutput){
      lines.push({ text: summary.debugOutput, indices: [] });
    }
    
    // Detailed feedback lines (force and relation errors)
    lines.push(...buildFeedbackLines(forceResults, relationResults, window.fm.forces, window.settings && window.settings.debug, window.currentTask, summary.neatness));

    
    if(window.editorMode && window.collectAuthorWarnings){
      const warnings = window.collectAuthorWarnings(t,window.fm.forces);
      lines.push(...warnings.map(text=>({text,indices:[]})));
    }
    window.lastEvaluation = { lines, summary };
    if(typeof window.showFeedback === 'function'){
      window.showFeedback(lines, scoreText);
    } else {
      const box = document.getElementById('feedback');
      if(box){ box.textContent = lines.map(l=>l.text).join('\n'); }
    }
  }

  window.runEvaluation = runEvaluation;
})();