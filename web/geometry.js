// geometry.js - Port of utils/geometry.py vector helpers
(function(){
  const EPS = 1e-9;

  /**
   * Calculate distance between two points
   * @param {number[]} p - Point [x, y]
   * @param {number[]} q - Point [x, y]
   * @returns {number} Euclidean distance
   */
  function distance(p,q){ return Math.hypot(p[0]-q[0], p[1]-q[1]); }

  /**
   * Calculate minimum distance from point to line segment
   * @param {number[]} p - Point [x, y]
   * @param {number[]} a - Segment start [x, y]
   * @param {number[]} b - Segment end [x, y]
   * @returns {number} Shortest distance from p to segment ab
   */
  function distPointToSegment(p,a,b){
    const ab = [b[0]-a[0], b[1]-a[1]];
    const ab2 = ab[0]*ab[0] + ab[1]*ab[1];
    if(ab2===0) return distance(p,a);
    const sub_pa = [p[0]-a[0], p[1]-a[1]];
    const t = Math.max(0, Math.min(1, (sub_pa[0]*ab[0] + sub_pa[1]*ab[1])/ab2));
    const proj = [a[0]+t*ab[0], a[1]+t*ab[1]];
    return distance(p,proj);
  }

  /**
   * Get x-coordinate on line at given y-coordinate
   * @param {number} y - Y-coordinate
   * @param {number[]} origin - Point on line [x, y]
   * @param {number[]} unitV - Unit direction vector of line
   * @returns {number} X-coordinate on line, or Infinity if line is vertical
   */
  function xOnLine(y, origin, unitV){ 
    if(Math.abs(unitV[1])<EPS) return Infinity; 
    const t=(y-origin[1])/unitV[1]; 
    return origin[0]+t*unitV[0]; 
  }

  /**
   * Get y-coordinate on line at given x-coordinate
   * @param {number} x - X-coordinate
   * @param {number[]} origin - Point on line [x, y]
   * @param {number[]} unitV - Unit direction vector of line
   * @returns {number} Y-coordinate on line, or Infinity if line is horizontal
   */
  function yOnLine(x, origin, unitV){ 
    if(Math.abs(unitV[0])<EPS) return Infinity; 
    const t=(x-origin[0])/unitV[0]; 
    return origin[1]+t*unitV[1]; 
  }

  /**
   * Calculate Euclidean length (magnitude) of a vector
   * @param {number[]} v - Vector [x, y]
   * @returns {number} Length of vector
   */
  function length(v){
    return Math.hypot(v[0], v[1]);
  }

  /**
   * Normalize vector to unit length
   * @param {number[]} v - Vector [x, y]
   * @returns {number[]} Unit vector or [0, 0] if zero vector
   */
  function normalizeVector(v){
    const len = length(v);
    return len > EPS ? [v[0]/len, v[1]/len] : [0, 0];
  }

  /**
   * Get tangent vector perpendicular to normal (90° counter-clockwise in left-hand coords)
   * Formula: tangent = [-n_y, n_x]
   * @param {number[]} n - Normal vector [x, y]
   * @returns {number[]} Unit tangent vector perpendicular to normal
   */
  function tangentFromNormal(n){
    return normalizeVector([-n[1], n[0]]);
  }

  /**
   * Get normal vector perpendicular to tangent (90° counter-clockwise in left-hand coords)
   * Inverse of tangentFromNormal: if t = tangentFromNormal(n), then n = normalFromTangent(t)
   * Formula: normal = [t_y, -t_x]
   * @param {number[]} t - Tangent vector [x, y]
   * @returns {number[]} Unit normal vector perpendicular to tangent
   */
  function normalFromTangent(t){
    return normalizeVector([t[1], -t[0]]);
  }

  /**
   * Calculate distance from point to either a point or a segment for hovering/picking.
   * Used for scene element hovering and force picking with unified distance logic.
   * @param {number[]} pos - Position to test [x, y]
   * @param {number[]|null} point - Point to test against, or null
   * @param {number[][]|null} segment - Segment endpoints [a, b] or null
   * @returns {number} Minimum distance to point (if exists) or to segment (if exists), or Infinity
   */
  function distPointOrSegment(pos, point, segment){
    let minDist = Infinity;
    if(point && Array.isArray(point) && point.length >= 2){
      minDist = distance(pos, point);
    }
    if(segment && Array.isArray(segment) && segment.length >= 2 && Array.isArray(segment[0]) && Array.isArray(segment[1])){
      const segDist = distPointToSegment(pos, segment[0], segment[1]);
      minDist = Math.min(minDist, segDist);
    }
    return minDist;
  }

  window.geometry = { distance, distPointToSegment, distPointOrSegment, xOnLine, yOnLine, length, normalizeVector, tangentFromNormal, normalFromTangent };
})();
