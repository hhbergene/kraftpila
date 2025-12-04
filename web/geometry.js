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

  window.geometry = { distance, distPointToSegment, xOnLine, yOnLine };
})();
