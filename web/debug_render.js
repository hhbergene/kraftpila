// debug_render.js - Debug visualizations (snap points, coordinates, etc.)
(function(){
  // Draw snap points if debug mode is on
  function drawSnapPoints(ctx){
    if(!window.settings || !window.settings.debug) return;
    if(!window.snapPoints || !window.snapPoints.length) return;
    
    ctx.fillStyle = '#888888';
    const radius = 3;
    window.snapPoints.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  window.drawSnapPoints = drawSnapPoints;
})();
