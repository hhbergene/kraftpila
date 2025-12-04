// forces.js - Port of engine/forces.py (simplified for Canvas)
(function(){
  const HANDLE_RADIUS = 4;
  const FORCE_COLOR = '#ff5050';
  const ACTIVE_FORCE_COLOR = '#ff5050';
  const HIGHLIGHT_FORCE_COLOR = '#ff7d00';
  const ACTIVE_FORCE_HANDLE_COLOR = '#ff5050';
  const HIGHLIGHT_FORCE_HANDLE_COLOR = '#000000';
  const TEXT_COLOR = '#000';
  const MIN_LEN = 15; // lowered threshold so short first force still counts

  function normalizeName(s){
    if(!s) return '';
    s = s.trim().toLowerCase();
    const remove = new Set([' ','_','^','{','}']);
    let out='';
    for(const ch of s){ if(!remove.has(ch)) out+=ch; }
    return out;
  }

  class Force {
    constructor(){
      this.anchor = null;     // attack point
      this.arrowTip = null;   // tip of arrow
      this.arrowBase = null;  // base of arrow

      this.drawing = false;
      this.dragging = null;   // 'anchor' | 'arrowTip' | 'body' | null
      this.hovering = null;   // same options for highlighting
      this.drag_offset = [0,0];

      this.force_dir = [1,0];
      this.force_len = 0;
      this.name = '';
      this.editable = true;
      this.moveable = true;
      this.checkHighlight = false; // set true during evaluation highlighting
    }

    get vec(){
      if(!this.arrowBase || !this.arrowTip) return null;
      return [ this.arrowTip[0]-this.arrowBase[0], this.arrowTip[1]-this.arrowBase[1] ];
    }
    get length(){
      const v=this.vec; if(!v) return 0; return Math.hypot(v[0], v[1]);
    }
    isCompleted(minLen){
      // Consider a force completed if geometry exists and length >= threshold (lower threshold)
      return (!this.drawing && this.anchor && this.arrowTip && this.arrowBase && this.length>= (minLen||MIN_LEN));
    }
    angleTo(target){
      const v=this.vec; if(!v) return Infinity; const [vx,vy]=v; const nx=Math.hypot(vx,vy); const tx=target[0], ty=target[1]; const nt=Math.hypot(tx,ty); if(nx<1e-9||nt<1e-9) return Infinity; let c=(vx*tx+vy*ty)/(nx*nt); c=Math.max(-1,Math.min(1,c)); return Math.abs( (180/Math.PI)*Math.acos(c) );
    }
    hasName(aliases){
      const nm = normalizeName(this.name||'');
      for(const a of aliases){ if(nm === normalizeName(a)) return true; }
      return false;
    }
    updateDirectionAndLength(){
      if(this.arrowTip && this.arrowBase){
        const dx=this.arrowTip[0]-this.arrowBase[0];
        const dy=this.arrowTip[1]-this.arrowBase[1];
        const L=Math.hypot(dx,dy);
        if(L>1e-6){ this.force_dir=[dx/L, dy/L]; this.force_len=L; } else { this.force_len=0; }
      }
    }

    // -------- Interaction (simplified) --------
    handleMouseDown(pos){
      // Determine force type
      let isExpected = this.isExpected;
      if(isExpected === undefined){
        isExpected = (this.moveable !== false); // Fallback: moveable=false means initial
      }
      const isInitial = !isExpected;
      const isTaskMode = window.editorMode === false;
      
      // In task mode, initial forces cannot be drawn or have anchor/tip dragged
      if(isTaskMode && isInitial){
        // Only allow body dragging for initial forces in task mode
        if(this.hovering === 'body'){
          this.dragging = 'body';
          this.drag_offset = [this.arrowBase[0]-pos[0], this.arrowBase[1]-pos[1]];
          return true;
        }
        return false;
      }
      
      // In scene edit mode or for expected forces: full editing
      if(!this.editable && !this.moveable) return false;
      // Start new force if no anchor yet
      if(!this.anchor){
        this.anchor = [pos[0], pos[1]];
        this.arrowBase = this.anchor.slice();
        this.drawing = true;
        return true;
      }
      // Pick part based on current hovering state
      if(this.hovering){
        this.dragging = this.hovering;
        if(this.dragging === 'body'){
          // store offset so body drag keeps relative grip point
          this.drag_offset = [this.arrowBase[0]-pos[0], this.arrowBase[1]-pos[1]];
        }
        return true;
      }
      return false;
    }

    handleMouseMove(pos, rel){
      if(!(this.drawing || this.dragging)) return false;
      
      // Determine force type
      let isExpected = this.isExpected;
      if(isExpected === undefined){
        isExpected = (this.moveable !== false); // Fallback: moveable=false means initial
      }
      const isInitial = !isExpected;
      const isTaskMode = window.editorMode === false;
      
      // In task mode, initial forces cannot be drawn or have anchor/tip dragged
      if(isTaskMode && isInitial && this.dragging !== 'body'){
        // Only body dragging is allowed for initial forces in task mode
        return false;
      }
      
      if(!this.editable && !this.moveable) return false;
      // Drawing: update arrowTip following mouse
      if(this.drawing && this.arrowBase){
        this.arrowTip = [pos[0], pos[1]];
        const dx=this.arrowTip[0]-this.arrowBase[0];
        const dy=this.arrowTip[1]-this.arrowBase[1];
        const L=Math.hypot(dx,dy);
        this.force_dir = L>1e-6 ? [dx/L, dy/L] : [1,0];
        this.force_len = L;
        return true;
      }
      // Drag anchor: translate entire force
      if(this.dragging === 'anchor' && this.anchor){
        const delta = [pos[0]-this.anchor[0], pos[1]-this.anchor[1]];
        this.anchor = [pos[0], pos[1]];
        if(this.arrowBase) this.arrowBase = [this.arrowBase[0]+delta[0], this.arrowBase[1]+delta[1]];
        if(this.arrowTip) this.arrowTip = [this.arrowTip[0]+delta[0], this.arrowTip[1]+delta[1]];
        this.updateDirectionAndLength();
        return true;
      }
      // Drag arrowTip: change direction/length only
      if(this.dragging === 'arrowTip' && this.arrowBase){
        this.arrowTip = [pos[0], pos[1]];
        this.updateDirectionAndLength();
        return true;
      }
      // Drag body: parallel shift (anchor unchanged)
      if(this.dragging === 'body' && this.arrowBase){
        const newBase = [pos[0]+this.drag_offset[0], pos[1]+this.drag_offset[1]];
        const delta = [newBase[0]-this.arrowBase[0], newBase[1]-this.arrowBase[1]];
        this.arrowBase = newBase;
        if(this.arrowTip) this.arrowTip = [this.arrowTip[0]+delta[0], this.arrowTip[1]+delta[1]];
        this.updateDirectionAndLength();
        return true;
      }
      return false;
    }

    handleMouseUp(pos){
      const wasDrawing = this.drawing;
      this.drawing = false;
      this.dragging = null;
      this.drag_offset = [0,0];
      // Do NOT clear short forces; allow user to extend later.
      // Just keep geometry even if below MIN_LEN, but update direction.
      if(wasDrawing && !this.arrowTip){
        // aborted drawing
        this.anchor = null; this.arrowBase = null; this.force_len=0;
        return;
      }
      this.updateDirectionAndLength();
    }

    draw(ctx, active=false){
      // Draw handles (anchor + arrowTip)
      const evalHighlighted = this.checkHighlight;
      // Determine if this is an initial (non-editable) force
      let isExpected = this.isExpected;
      if(isExpected === undefined){
        isExpected = (this.moveable !== false); // Fallback: moveable=false means initial
      }
      // Draw handles if:
      // - Force is expected (user-drawn), OR
      // - Force is initial but we're in scene edit mode (editorMode=true, not taskMode)
      const isTaskMode = window.editorMode === false; // Task mode = not in editor
      const shouldDrawHandles = isExpected || !isTaskMode; // expected forces always, initial forces only in scene edit mode
      
      if(shouldDrawHandles && this.anchor){
        if(this.dragging==='anchor' || this.hovering==='anchor'){
          ctx.fillStyle = HIGHLIGHT_FORCE_HANDLE_COLOR;
          ctx.beginPath(); ctx.arc(this.anchor[0], this.anchor[1], HANDLE_RADIUS, 0, Math.PI*2); ctx.fill();
        } else if(active){
          ctx.fillStyle = ACTIVE_FORCE_HANDLE_COLOR;
          ctx.beginPath(); ctx.arc(this.anchor[0], this.anchor[1], HANDLE_RADIUS, 0, Math.PI*2); ctx.fill();
        }
      }
      if(shouldDrawHandles && this.arrowTip){
        if(this.dragging==='arrowTip' || this.hovering==='arrowTip'){
          ctx.fillStyle = HIGHLIGHT_FORCE_HANDLE_COLOR;
          ctx.beginPath(); ctx.arc(this.arrowTip[0], this.arrowTip[1], HANDLE_RADIUS, 0, Math.PI*2); ctx.fill();
        } else if(active){
          ctx.fillStyle = ACTIVE_FORCE_HANDLE_COLOR;
          ctx.beginPath(); ctx.arc(this.arrowTip[0], this.arrowTip[1], HANDLE_RADIUS, 0, Math.PI*2); ctx.fill();
        }
      }
      if(this.anchor && this.arrowTip && this.arrowBase && this.force_len >= 1e-3){
        const dx=this.arrowTip[0]-this.arrowBase[0];
        const dy=this.arrowTip[1]-this.arrowBase[1];
        const ang=Math.atan2(dy,dx);
        const ARROW_HEAD_LENGTH=12; const a=Math.PI/6; // 30 deg
        const arrow_head_left=[this.arrowTip[0]-ARROW_HEAD_LENGTH*Math.cos(ang-a), this.arrowTip[1]-ARROW_HEAD_LENGTH*Math.sin(ang-a)];
        const arrow_head_right=[this.arrowTip[0]-ARROW_HEAD_LENGTH*Math.cos(ang+a), this.arrowTip[1]-ARROW_HEAD_LENGTH*Math.sin(ang+a)];
        const arrow_length=this.force_len; const margin=ARROW_HEAD_LENGTH-2; const t_end=1.0 - (margin/arrow_length);
        const body_end=[this.arrowBase[0]+dx*t_end, this.arrowBase[1]+dy*t_end];

        // helper line anchor->arrowBase
        let baseColor = evalHighlighted ? HIGHLIGHT_FORCE_COLOR : (active ? ACTIVE_FORCE_COLOR : FORCE_COLOR);
        // Use green color for initial forces (in all modes)
        const isInitial = !isExpected;
        if(isInitial) baseColor = '#2d7d2d';
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(this.anchor[0], this.anchor[1]); ctx.lineTo(this.arrowBase[0], this.arrowBase[1]); ctx.stroke();

        // arrow body
        let arrowColor = evalHighlighted ? HIGHLIGHT_FORCE_COLOR : (active ? ACTIVE_FORCE_COLOR : FORCE_COLOR);
        // Use green color for initial forces (in all modes)
        if(isInitial) arrowColor = '#2d7d2d';
        if(this.dragging==='body' || this.hovering==='body') arrowColor = HIGHLIGHT_FORCE_COLOR;
        if(this.dragging==='arrowTip' || this.hovering==='arrowTip') arrowColor = HIGHLIGHT_FORCE_COLOR;

        ctx.lineWidth = 4;
        ctx.strokeStyle = arrowColor;
        ctx.beginPath(); ctx.moveTo(this.arrowBase[0], this.arrowBase[1]); ctx.lineTo(body_end[0], body_end[1]); ctx.stroke();

        // arrow head
        ctx.fillStyle = arrowColor;
        ctx.beginPath();
        ctx.moveTo(this.arrowTip[0], this.arrowTip[1]);
        ctx.lineTo(arrow_head_left[0], arrow_head_left[1]);
        ctx.lineTo(arrow_head_right[0], arrow_head_right[1]);
        ctx.closePath(); ctx.fill();
      }

      // name label and/or coordinates: only show after drawing (or when not drawing)
      if((this.name || window.settings?.show_force_coordinates) && this.anchor && this.arrowTip && !this.drawing){
        const v = [this.arrowTip[0]-this.arrowBase[0], this.arrowTip[1]-this.arrowBase[1]];
        const L = Math.hypot(v[0], v[1]);
        if(L > 1e-6){
          const mid = [(this.arrowBase[0]+this.arrowTip[0])/2, (this.arrowBase[1]+this.arrowTip[1])/2];
          // perpendicular (screen coords, y down)
          let n = [-v[1]/L, v[0]/L];
          const side = v[0]*(this.anchor[1]-mid[1]) - v[1]*(this.anchor[0]-mid[0]);
          const SIDE_EPS = 0.75;
          if(side > SIDE_EPS){
            n = [-n[0], -n[1]]; // flip to keep on anchor side
          }
          const offsetLen = 0.9 * (window.GRID_STEP || 20);
          const labelCenter = [mid[0] + n[0]*offsetLen, mid[1] + n[1]*offsetLen];
          
          // Build label text: name + coordinates if show_force_coordinates is on
          let labelText = this.name || '';
          if(window.settings?.show_force_coordinates){
            // Get vector with negated y (cartesian coordinates for user)
            const cartesianVec = [Math.round(v[0]), -Math.round(v[1])];
            const coordStr = `[${cartesianVec[0]},${cartesianVec[1]}]`;
            if(labelText){
              labelText += ' = ' + coordStr;
            } else {
              labelText = coordStr;
            }
          }
          
          drawFormattedText(ctx, labelText, labelCenter[0], labelCenter[1], {size:16, color:TEXT_COLOR, align:'center'});
        }
      }
    }
  }

  window.Force = Force;
})();
