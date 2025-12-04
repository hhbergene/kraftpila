// forcesManager.js - minimal subset of ForcesManager
(function(){
  class ForcesManager {
    constructor(){
      this.forces = [];
      this.activeIndex = -1;
      this.addEmptyForceIfNeeded();
    }
    addForce(anchor, arrowBase, arrowTip, name=''){
      const f = new Force();
      f.anchor = anchor;
      f.arrowBase = arrowBase;
      f.arrowTip = arrowTip;
      f.name = name;
      f.updateDirectionAndLength();
      this.forces.push(f);
      if(this.activeIndex === -1) this.activeIndex = 0;
      return f;
    }
    addEmptyForceIfNeeded(){
      if(this.forces.length === 0){
        this.forces.push(new Force());
        this.activeIndex = 0;
        return;
      }
      const last = this.forces[this.forces.length-1];
      const hasGeom = !!(last.anchor||last.arrowBase||last.arrowTip);
      const hasName = (last.name && last.name.trim() !== '');
      if(hasGeom || hasName){
        this.forces.push(new Force());
      }
    }
    isBlankForce(f){
      return !!(f && f.editable && !f.anchor && !f.arrowBase && !f.arrowTip && (!f.name || f.name.trim()===''));
    }
    ensureTrailingBlank(){
      if(this.forces.length===0 || !this.isBlankForce(this.forces[this.forces.length-1])){
        this.forces.push(new Force());
      }
    }
    deleteAt(index){
      if(index<0 || index>=this.forces.length) return;
      this.forces.splice(index,1);
      // Ensure a trailing blank exists for new entries
      this.ensureTrailingBlank();
      // Adjust active index
      const newActive = Math.max(0, Math.min(index, this.forces.length-1));
      this.setActive(newActive);
    }
    setActive(i){
      if(i>=0 && i<this.forces.length) this.activeIndex = i;
    }
    updateHover(pos){
      const TH_HANDLE = 14; // tighter handle radius
      const TH_LINE = 8;    // body proximity
      // reset previous hovering
      for(const f of this.forces) f.hovering = null;

      // Collect candidates with priority: 0 = handle, 1 = body
      const candidates = [];
      const activeForce = (this.activeIndex>=0? this.forces[this.activeIndex] : null);

      for(const f of this.forces){
        // Anchor handle
        if(f.anchor){
          const dA = geometry.distance(pos, f.anchor);
          if(dA <= TH_HANDLE){
            candidates.push({priority:0, dist:dA, force:f, part:'anchor'});
          }
        }
        // ArrowTip handle
        if(f.arrowTip){
          const dT = geometry.distance(pos, f.arrowTip);
          if(dT <= TH_HANDLE){
            candidates.push({priority:0, dist:dT, force:f, part:'arrowTip'});
          }
        }
        // Body (only if not already inside a handle for that force)
        const hasHandleCandidate = candidates.some(c => c.force===f && c.priority===0);
        if(!hasHandleCandidate){
          if(f.arrowBase && f.arrowTip){
            const dBody = geometry.distPointToSegment(pos, f.arrowBase, f.arrowTip);
            if(dBody <= TH_LINE){
              candidates.push({priority:1, dist:dBody, force:f, part:'body'});
            }
          }
          if(f.anchor && f.arrowBase){
            const dAB = geometry.distPointToSegment(pos, f.anchor, f.arrowBase);
            if(dAB <= TH_LINE){
              candidates.push({priority:1, dist:dAB, force:f, part:'body'});
            }
          }
        }
      }

      if(!candidates.length) return;
      // Sort: priority then distance; prefer active force if same score
      candidates.sort((a,b)=>{
        if(a.priority !== b.priority) return a.priority - b.priority;
        // If one is active force and other not (and distances comparable), favor active
        const aActive = (a.force === activeForce);
        const bActive = (b.force === activeForce);
        if(aActive && !bActive && a.dist <= b.dist*1.3) return -1;
        if(bActive && !aActive && b.dist <= a.dist*1.3) return 1;
        return a.dist - b.dist;
      });
      const best = candidates[0];
      best.force.hovering = best.part;
    }
    drawAll(ctx){
      for(let i=0;i<this.forces.length;i++){
        this.forces[i].draw(ctx, i===this.activeIndex);
      }
    }

    syncInputs(container){
      if(!container) return;
      // Ensure rows match forces length
      const rows = Array.from(container.querySelectorAll('.force-row'));
      // Add rows if needed
      while(rows.length < this.forces.length){
        const idx = rows.length;
        const row = document.createElement('div');
        row.className = 'force-row';
        // Label
        const label = document.createElement('span');
        label.textContent = (idx+1)+'.';
        label.style.width='20px';
        const input = document.createElement('input');
        input.type='text';
        input.placeholder='Navn';
        input.dataset.index = idx;
        input.style.flex = '1';
        input.addEventListener('input', (e)=>{
          const i = parseInt(e.target.dataset.index,10);
          // Use current global manager to avoid stale closure when fm is replaced
          if(window.fm && i>=0 && i<window.fm.forces.length){
            window.fm.forces[i].name = e.target.value;
            // Save forces when force name changes
            if(window.saveTaskForces) window.saveTaskForces();
          }
        });
        input.addEventListener('focus', (e)=>{
          const i = parseInt(e.target.dataset.index,10);
          if(window.fm) window.fm.setActive(i);
        });

        // Wrap Tab navigation: last -> first, and Shift+Tab first -> last
        input.addEventListener('keydown', (e)=>{
          if(e.key !== 'Tab') return;
          const containerEl = container;
          if(!containerEl) return;
          const focusables = Array.from(containerEl.querySelectorAll('input:not([disabled])'));
          if(focusables.length === 0) return;
          const current = e.target;
          const curIdx = focusables.indexOf(current);
          if(curIdx === -1) return;
          e.preventDefault();
          let nextIdx;
          if(e.shiftKey){
            nextIdx = (curIdx - 1 + focusables.length) % focusables.length;
          } else {
            nextIdx = (curIdx + 1) % focusables.length;
          }
          const nextInput = focusables[nextIdx];
          if(nextInput){
            nextInput.focus();
            const fi = parseInt(nextInput.dataset.index, 10);
            if(window.fm && !isNaN(fi)){
              window.fm.setActive(fi);
              // refresh row highlighting
              window.fm.syncInputs(containerEl);
            }
          }
        });
        
        // Toggle button for switching between initial and expected forces
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'force-type-toggle';
        toggleBtn.style.width = '24px';
        toggleBtn.style.height = '24px';
        toggleBtn.style.padding = '0';
        toggleBtn.style.marginLeft = '4px';
        toggleBtn.style.border = '1px solid #999';
        toggleBtn.style.borderRadius = '3px';
        toggleBtn.style.background = '#f5f5f5';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.fontSize = '12px';
        toggleBtn.style.display = 'flex';
        toggleBtn.style.alignItems = 'center';
        toggleBtn.style.justifyContent = 'center';
        toggleBtn.title = 'Toggle between Initial (🔒) and Expected (🔓) forces';
        toggleBtn.dataset.index = idx;
        toggleBtn.addEventListener('click', (e)=>{
          e.preventDefault();
          const i = parseInt(toggleBtn.dataset.index, 10);
          if(window.fm && window.toggleForceType) {
            window.toggleForceType(i);
          }
        });
        
        // Delete button - same size and style as toggle button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'force-delete-btn';
        deleteBtn.style.width = '24px';
        deleteBtn.style.height = '24px';
        deleteBtn.style.padding = '0';
        deleteBtn.style.marginLeft = '4px';
        deleteBtn.style.border = '1px solid #d32f2f';
        deleteBtn.style.borderRadius = '3px';
        deleteBtn.style.background = '#fff';
        deleteBtn.style.color = '#d32f2f';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '12px';
        deleteBtn.style.display = 'flex';
        deleteBtn.style.alignItems = 'center';
        deleteBtn.style.justifyContent = 'center';
        deleteBtn.title = 'Slett kraft';
        deleteBtn.textContent = '🗑️';
        deleteBtn.dataset.index = idx;
        deleteBtn.addEventListener('click', (e)=>{
          e.preventDefault();
          const i = parseInt(deleteBtn.dataset.index, 10);
          if(window.fm && i >= 0 && i < window.fm.forces.length){
            window.fm.deleteAt(i);
            const containerEl = container;
            window.fm.syncInputs(containerEl);
            if(window.saveTaskForces) window.saveTaskForces();
          }
        });
        
        row.style.display = 'flex';
        row.style.gap = '4px';
        row.style.alignItems = 'center';
        row.appendChild(label); row.appendChild(input); row.appendChild(toggleBtn); row.appendChild(deleteBtn);
        container.appendChild(row);
        rows.push(row);
      }
      // Remove excess rows
      while(rows.length > this.forces.length){
        const r = rows.pop();
        r.remove();
      }
      // Update values and active highlighting
      for(let i=0;i<this.forces.length;i++){
        const f = this.forces[i];
        const row = rows[i];
        const input = row.querySelector('input');
        const toggleBtn = row.querySelector('.force-type-toggle');
        const deleteBtn = row.querySelector('.force-delete-btn');
        // Keep dataset index in sync in case forces array changed
        if(input.dataset.index != i){ input.dataset.index = i; }
        if(toggleBtn && toggleBtn.dataset.index != i){ toggleBtn.dataset.index = i; }
        if(deleteBtn && deleteBtn.dataset.index != i){ deleteBtn.dataset.index = i; }
        // Only push value from force->UI if user is not editing AND we have a non-empty name.
        // This prevents wiping a just-typed value when force.name hasn't yet updated (edge race) or is still empty.
        if(document.activeElement !== input){
          if(f.name && f.name.trim() !== input.value){
            input.value = f.name;
          }
          // Do NOT overwrite if f.name empty and input has content.
        }
        
        // In task mode (not editor mode), disable initial forces
        // isExpected defaults to true if not set, unless moveable is false (legacy)
        let isExpected = f.isExpected;
        if(isExpected === undefined){
          isExpected = (f.moveable !== false);
        }
        const isInitial = !isExpected;
        const isEditorMode = window.editorMode === true;
        input.disabled = (!isEditorMode && isInitial);
        
        // Color initial forces green
        if(isInitial){
          input.style.color = '#2d7d2d';
          input.style.fontWeight = 'bold';
        } else {
          input.style.color = '#222';
          input.style.fontWeight = 'normal';
        }
        
        // Toggle button only visible in editor mode
        if(toggleBtn){
          toggleBtn.style.display = isEditorMode ? 'flex' : 'none';
          toggleBtn.textContent = isExpected ? '🔓' : '🔒';
        }
        
        // Delete button visible when force is not blank (independent of editor mode)
        if(deleteBtn){
          const isBlank = !f.anchor && !f.arrowBase && !f.arrowTip && (!f.name || f.name.trim() === '');
          deleteBtn.style.display = !isBlank ? 'flex' : 'none';
        }
        
        if(i===this.activeIndex) row.classList.add('active'); else row.classList.remove('active');
      }
    }
  }
  window.ForcesManager = ForcesManager;
})();
