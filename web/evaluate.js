/**
 * evaluate.js - Force evaluation and relation checking
 * 
 * IMPORTANT CONTRACT:
 * - Reads ONLY from task.expectedForces (forces that must be drawn by the user)
 * - Does NOT evaluate task.initialForces (pre-drawn forces locked in place)
 * - initialForces should NEVER be in the expectedForces array
 * - expectedForces must have complete anchor specifications (type, ref, point/segment)
 * - Use window.cleanupTaskForEvaluation() before calling evaluation to ensure consistency
 */
(function(){
  const DIR_TOL_DEG = 2.0; // direction tolerance Degrees
  const POS_TOL = 22;     // position tolerance (px)
  const DIR_SPAN_DEG = 24; // linear falloff span for direction 
  const POS_SPAN = 44; // linear falloff span for position
  const COVERAGE_PENALTY_EXP = 1.5; // penalize missing forces
  const MATCH_THRESHOLD = 0.20; // matching threshold (keep at 0.2 for tolerance)
  const NAME_MISMATCH_PENALTY = 0.5; // penalty for name mismatch (use 0.5 for balanced matching)
  // NEW: helper for adaptive direction tolerance (tighter for axis-aligned expected directions)
  function axisAlignedDirTol(dir){
    return (Math.abs(dir[0]) < 1e-3 || Math.abs(dir[1]) < 1e-3) ? (DIR_TOL_DEG/4) : DIR_TOL_DEG;
  }
  // NEW: geometry helpers for neatness (overlap detection)
  function segOrient(a,b,c){ return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]); }
  function onSeg(a,b,p){
    return Math.min(a[0],b[0]) - 1e-6 <= p[0] && p[0] <= Math.max(a[0],b[0]) + 1e-6 &&
           Math.min(a[1],b[1]) - 1e-6 <= p[1] && p[1] <= Math.max(a[1],b[1]) + 1e-6;
  }
  function segmentsIntersect(a,b,c,d){
    const o1 = segOrient(a,b,c), o2 = segOrient(a,b,d), o3 = segOrient(c,d,a), o4 = segOrient(c,d,b);
    if((o1>0&&o2<0 || o1<0&&o2>0) && (o3>0&&o4<0 || o3<0&&o4>0)) return true;
    if(Math.abs(o1) < 1e-6 && onSeg(a,b,c)) return true;
    if(Math.abs(o2) < 1e-6 && onSeg(a,b,d)) return true;
    if(Math.abs(o3) < 1e-6 && onSeg(c,d,a)) return true;
    if(Math.abs(o4) < 1e-6 && onSeg(c,d,b)) return true;
    return false;
  }
  function minSegDistance(a,b,c,d){
    // Uses existing point-to-seg helper
    const d1 = distPointToSegment(a,c,d);
    const d2 = distPointToSegment(b,c,d);
    const d3 = distPointToSegment(c,a,b);
    const d4 = distPointToSegment(d,a,b);
    return Math.min(d1,d2,d3,d4);
  }
  function computeNeatness(task, forceResults, allForces){
    // Consider only matched expected forces with complete geometry
    const matched = (forceResults||[]).filter(r=> r.found && typeof r.index==='number' && r.index>=0)
      .map(r => window.fm.forces[r.index])
      .filter(f => f && f.arrowBase && f.arrowTip && Array.isArray(f.arrowBase) && Array.isArray(f.arrowTip));
    const NON_PARALLEL_DEG = 0.5; // treat angle > 0.5° as non-parallel
    const OVERLAP_DIST_PX = 3;   // consider segments overlapping if closer than this
    for(let i=0;i<matched.length;i++){
      const fi = matched[i];
      const vi = [fi.arrowTip[0]-fi.arrowBase[0], fi.arrowTip[1]-fi.arrowBase[1]];
      for(let j=i+1;j<matched.length;j++){
        const fj = matched[j];
        const vj = [fj.arrowTip[0]-fj.arrowBase[0], fj.arrowTip[1]-fj.arrowBase[1]];
        const ang = angleBetweenDeg(vi, vj);
        // For parallel forces (same direction), allow them to overlap
        // For non-parallel forces (including anti-parallel), check for overlaps and penalize
        if(ang < NON_PARALLEL_DEG) continue; // Skip only strictly parallel (same direction)
        // overlap if they intersect or are very close
        const inter = segmentsIntersect(fi.arrowBase, fi.arrowTip, fj.arrowBase, fj.arrowTip);
        const near = minSegDistance(fi.arrowBase, fi.arrowTip, fj.arrowBase, fj.arrowTip) <= OVERLAP_DIST_PX;
        if(inter || near) return 0.9;
      }
    }
    return 1.0;
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
  function normalizeName(raw){ if(!raw) return ''; return raw.toLowerCase().replace(/[ _^{}]/g,''); }

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
    
    // Compute pairwise match scores
    const pairs = []; // { score, taskName, forceIdx }
    for(const taskName in expectedDict){
      const spec = expectedDict[taskName];
      for(let idx=0; idx<forces.length; idx++){
        const drawnF = forces[idx];
        const hasGeom = drawnF.anchor && drawnF.arrowBase && drawnF.arrowTip;
        if(!hasGeom) continue;
        
        // Name match?
        let nameOk = false;
        if(drawnF.name){
          const drawn = normalizeName(drawnF.name);
          const canon = normalizeName(taskName);
          if(drawn === canon) nameOk = true;
          else if(aliasMap[drawn] === taskName) nameOk = true;
        }
        
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
              posScore = rampDownLinear(posErr, POS_TOL, POS_SPAN);
            }
          } else if(spec.anchor.type==='segment'){
            const sceneObj = window.sceneLookup[spec.anchor.ref];
            const seg = sceneObj && sceneObj.segments[spec.anchor.segment];
            if(seg){
              const posErr = distPointToSegment(drawnF.anchor, seg[0], seg[1]);
              posScore = rampDownLinear(posErr, POS_TOL, POS_SPAN);
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
      let nameOk = false;
      if(match.name){
        const drawn = normalizeName(match.name);
        const canon = normalizeName(spec.name); // canoncialal name
        if(drawn === canon) nameOk = true; // or alias match
        else if(aliasMap[drawn] === spec.name) nameOk = true;
      }
      
      // Position error (and store anchor type for feedback)
      let posErr = null; let posOk=false; let anchorType=null;
      if(spec.anchor && match.anchor){
        if(spec.anchor.type==='point'){
          anchorType = 'point';
          const sceneObj = window.sceneLookup[spec.anchor.ref];
          const P = sceneObj && sceneObj.points[spec.anchor.point];
          if(P){ posErr = geometry.distance(match.anchor, P); posOk = posErr <= POS_TOL; }
        } else if(spec.anchor.type==='segment'){
          anchorType = 'segment';
          const sceneObj = window.sceneLookup[spec.anchor.ref];
          const seg = sceneObj && sceneObj.segments[spec.anchor.segment];
          if(seg){ posErr = distPointToSegment(match.anchor, seg[0], seg[1]); posOk = posErr <= POS_TOL; }
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
        anchorType
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
   * Evaluate sum of forces (equilibrium check)
   * Checks if total force equals task requirements (tolerance ±5 units)
   * Penalizes extra unmatched forces that maintain equilibrium by 0.3 per force
   * @param {Object} task - Task with optional sumF: {x, y, n} requirements
   * @param {Object[]} forceResults - Force evaluation results (for reference)
   * @param {Object[]} allForces - All drawn force objects with .vec properties
   * @returns {Object} {x, y, n, score, errors} where score is 1.0 if equilibrium OK, lower if violated
   */
  function evalSumF(task, forceResults, allForces){
    
    const sumF = task.sumF;
    const result = { x: null, y: null, n: null, score: 1.0, errors: [] };
    
    // Calculate sum of all forces (including unmatched ones)
    let sumX = 0, sumY = 0, sumN = 0, sumT = 0;
    (allForces || []).forEach((f, idx) => {
      if(!f.vec) return;
      const isCompleted = typeof f.isCompleted==='function' ? f.isCompleted() : (f.anchor && f.arrowBase && f.arrowTip);
      if(!isCompleted) return;
      
      sumX += f.vec[0];
      sumY += f.vec[1];
      
      // Component sums (if plane exists)
      if(task.scene && task.scene.plane){
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
   * @param {Object} task - Task with relations array: [{lhs: [{name, component?}], rhs: [...], ratio, tol_rel}]
   * @param {Object[]} forceResults - Force evaluation results with found/index properties
   * @returns {Object[]} Array of relation results: {lhs, rhs, measuredRatio, expectedRatio, relError, ok, indices, tolRel}
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
          const matchingForce = window.fm.forces.find(f => f && f.name && f.name.toLowerCase().trim() === initSpec.name.toLowerCase().trim());
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
    const rels = task.relations || [];
    rels.forEach(rel=>{
      const tolRel = (typeof rel.tol_rel === 'number')? rel.tol_rel : 0.15;
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
      
      // Build detailed component info for logging
      const lhsDetails = rel.lhs.map(term => {
        const f = forceByName[term.name];
        const comp = term.component || 'magnitude';
        let val = 0;
        if(f){
          if(term.component){
            const dir = getComponentDir(term.component, task);
            if(dir) val = componentMagnitude(f, dir);
            else val = magnitude(f);
          } else {
            val = magnitude(f);
          }
        }
        return `${term.name}[${comp}]=${val.toFixed(2)}`;
      });
      const rhsDetails = rel.rhs.map(term => {
        const f = forceByName[term.name];
        const comp = term.component || 'magnitude';
        let val = 0;
        if(f){
          if(term.component){
            const dir = getComponentDir(term.component, task);
            if(dir) val = componentMagnitude(f, dir);
            else val = magnitude(f);
          } else {
            val = magnitude(f);
          }
        }
        return `${term.name}[${comp}]=${val.toFixed(2)}`;
      });
      
      const lhsV = sum(rel.lhs); const rhsV = sum(rel.rhs);
      const measuredRatio = rhsV===0? 0 : lhsV/rhsV;
      const expected = rel.ratio || 1.0;
      const relError = expected===0? 0 : Math.abs(measuredRatio - expected)/expected;

      const involvedIdx = [];
      allNames.forEach(name=>{
        const idx=indexByName[name];
        if(typeof idx==='number') involvedIdx.push(idx);
      });

      const missingNames = allNames.filter(n => typeof indexByName[n] !== 'number');
      
      // If any involved force is missing, relation score is 0 (not gradual)
      const relScore = missingNames.length > 0 ? 0 : rampDownLinear(relError, tolRel, tolRel);
      const ok = relError <= tolRel && missingNames.length === 0;

      out.push({
        lhs: lhsNames.join('+'),
        rhs: rhsNames.join('+'),
        forceNames: allNames,
        missingNames,
        missingInvolved: missingNames.length>0,
        expectedRatio: expected,
        measuredRatio,
        relError,
        relScore, 
        ok,
        indices: involvedIdx,
        tolRel
      });
    });
    return out;
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
    const missingNames = forceResults.filter(r => r.found && !r.nameOk && !r.drawnName);
    const wrongNames = forceResults.filter(r => r.found && !r.nameOk && r.drawnName);
    
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
        if(r.anchorType === 'point'){
          anchorDesc = 'massemidtpunktet';
        } else if(r.anchorType === 'segment'){
          // Determine based on force type (G=gravity, others=friction/normal)
          if(label.toUpperCase().includes('G')){
            anchorDesc = 'massemidtpunktet';
          } else {
            anchorDesc = 'kontaktflaten/segmentet';
          }
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
          const errPct = (rr.relError*100).toFixed(1)+'%';
          feedback = ` (feil ${errPct})`;
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
      return isCompleted && !matchedIndices.has(idx) && !isInitialForce;
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
    
    // Check neatness - warn about overlapping forces
    if(neatness !== undefined && neatness < 1.0){
      lines.push({ text: `Unngå overlappende kraftpiler ved å parallellforskyve pila litt til siden for angrepspunktet.`, indices: [] });
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
      return count + (isCompleted && !matchedIndices.has(idx) && !isInitialForce ? 1 : 0);
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
      const posScore = (typeof r.posErr==='number') ? rampDownLinear(r.posErr, POS_TOL, POS_SPAN) : 0.0;
      // Use arithmetic mean instead of geometric mean for more balanced scoring
      const combined = (nameScore + dirScore + posScore) / 3;
      perForceScores.push(combined);
    });

    const baseScore = perForceScores.length > 0 ? (perForceScores.reduce((a,b)=>a+b,0)/perForceScores.length) : 0.0;
    // Coverage: how many expected forces were found (extras don't affect coverage)
    const coverage = expectedCount>0? (foundCount/expectedCount) : 1.0;
    const coverageFactor = Math.pow(clamp(coverage,0,1), COVERAGE_PENALTY_EXP);

    // NEW: Relations score with strict missing handling
    let relationsScore = 1.0;
    if(relationResults && relationResults.length){
      const relScores = relationResults.map(rr => rr.relScore !== undefined ? rr.relScore : (rr.missingInvolved ? 0 : rampDownLinear(rr.relError, rr.tolRel||0.15, rr.tolRel||0.15)));
      relationsScore = relScores.length? (relScores.reduce((a,b)=>a+b,0)/relScores.length) : 1.0;
    }
    const hasRelations = (task.relations && task.relations.length)>0;
    const hasSumF = !!task.sumF && ['x','y','n'].some(k => typeof task.sumF[k] === 'number');
    
    // Sum of forces check (penalize extra forces if they break equilibrium)
    const sumFResult = evalSumF(task, forceResults, allForces);
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
    let finalScore = combined * coverageFactor * neatness;
    
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
          const posScore = (typeof r.posErr==='number') ? rampDownLinear(r.posErr, POS_TOL, POS_SPAN) : 0.0;
          const combined = (nameScore + dirScore + posScore) / 3;
          debugOutput += `  ${name}: Navn=${nameScore.toFixed(2)} Dir=${dirScore.toFixed(2)} (tol=${dirTol.toFixed(2)}°) Pos=${posScore.toFixed(2)} → Gjennomsnitt=${(combined*100).toFixed(0)}%\n`;
        }
      });
      
      const baseScoreInfo = baseScore > 0 ? `${(baseScore*100).toFixed(0)}%` : `0%`;
      const sumFScoreInfo = `${(sumFScore*100).toFixed(0)}%`;
      const coverageFactorVal = Math.pow(coverage, 1.5);
      
      debugOutput += `📈 SCORE COMPONENTS:\n`;
      debugOutput += `  Base score (kraft-gjennomsnitt): ${baseScoreInfo}\n`;
      debugOutput += `  Sum of forces (equilibrium): ${sumFScoreInfo}${sumFResult.errors && sumFResult.errors.length ? ' ⚠️ ' + sumFResult.errors.length + ' feil' : ' ✓'}\n`;
      
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
        debugOutput += `  Intermediate = ${(combined*100).toFixed(0)}% × ${(coverageFactorVal*100).toFixed(0)}% × ${(neatness*100).toFixed(0)}% = ${((combined*coverageFactorVal*neatness)*100).toFixed(0)}%\n`;
      } else if(!hasSumF){
        debugOutput += `  Combined = Base (ingen relasjoner eller ΣF-krav) = ${(combined*100).toFixed(0)}%\n`;
        debugOutput += `  Intermediate = Combined × Coverage × Neatness\n`;
        debugOutput += `  Intermediate = ${(combined*100).toFixed(0)}% × ${(coverageFactorVal*100).toFixed(0)}% × ${(neatness*100).toFixed(0)}% = ${((combined*coverageFactorVal*neatness)*100).toFixed(0)}%\n`;
      } else {
        debugOutput += `  Combined = (Base + SumF) / 2\n`;
        debugOutput += `  Combined = (${baseScoreInfo} + ${(sumFWeighted*100).toFixed(0)}%) / 2 = ${(combined*100).toFixed(0)}%\n`;
        debugOutput += `  Intermediate = Combined × Coverage × Neatness\n`;
        debugOutput += `  Intermediate = ${(combined*100).toFixed(0)}% × ${(coverageFactorVal*100).toFixed(0)}% × ${(neatness*100).toFixed(0)}% = ${((combined*coverageFactorVal*neatness)*100).toFixed(0)}%\n`;
      }
      
      debugOutput += `  Final = min(Intermediate, Cap) = min(${((combined*coverageFactorVal*neatness)*100).toFixed(0)}%, ${(cap*100).toFixed(0)}%) = ${(finalScore*100).toFixed(0)}%\n`;
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
    const forceResults = evalForces(window.currentTask, window.fm.forces);
    const relationResults = evalRelations(window.currentTask, forceResults);
    const summary = computeScores(window.currentTask, forceResults, relationResults, window.fm.forces);
    
    // Convert finalScore (0-1) to points (0-2) with strict thresholds
    const points = scoreToPoints(summary.finalScore);
    const scoreText = `Score: ${summary.finalScore.toFixed(2)} (${points.toFixed(1)} poeng)`;
    
    // Build feedback lines
    const lines = [];
    
    if(summary.debugOutput){
      lines.push({ text: summary.debugOutput, indices: [] });
    }
    
    // Detailed feedback lines (force and relation errors)
    lines.push(...buildFeedbackLines(forceResults, relationResults, window.fm.forces, window.settings && window.settings.debug, window.currentTask, summary.neatness));

    
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