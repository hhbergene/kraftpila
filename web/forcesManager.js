// forcesManager.js - minimal subset of ForcesManager
(function(){
  class ForcesManager {
    constructor(){
      this.forces = [];
      this.solutionForces = [];  // Copy of forces for editor mode solution validation
      this.activeIndex = -1;
      this.activeIndexChanged = false;
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
      // Do NOT automatically add a blank - let updateAppState handle cleanup
      // Adjust active index
      const newActive = Math.max(0, Math.min(index, this.forces.length-1));
      this.setActive(newActive);
    }
    setActive(i, forceDropdownRebuild = false){
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

    syncInputs(container, forceDropdownRebuild = false){
      if(!container) return;
      // Ensure rows match forces length
      const rows = Array.from(container.querySelectorAll('.force-row'));
      
      // Add rows if needed
      while(rows.length < this.forces.length){
        const idx = rows.length;
        const row = document.createElement('div');
        row.className = 'force-row';
        row.dataset.forceIndex = idx; // Add index tracking to row
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
          // Only trigger setActive if this is an actual focus change (not already active from mousedown)
          if(window.fm && window.fm.activeIndex !== i && window.fm.setActive) {
            window.fm.setActive(i, true); // Force dropdown rebuild on text box focus
          }
        });

        // Also listen for mousedown to update immediately before focus event
        input.addEventListener('mousedown', (e)=>{
          const i = parseInt(e.target.dataset.index,10);
          // Update activeIndex synchronously FIRST
          if(window.fm) {
            window.fm.activeIndex = i;
            const container = input.closest('#force-inputs');
            if(container) {
              // Sync DOM immediately to apply active styling
              window.fm.syncInputs(container, true);
            }
          }
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
            const fi = parseInt(nextInput.dataset.index, 10);
            nextInput.focus();
            if(window.fm && !isNaN(fi)){
              window.fm.setActive(fi, true); // Force dropdown rebuild on Tab navigation
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
            const force = window.fm.forces[i];
            const hasPoints = !!(force.anchor || force.arrowBase || force.arrowTip);
            let activeIndex = i;
            
            if(hasPoints){
              // Force has points: sync name from textbox, then clear the points but keep the force with its name
              const row = container.querySelectorAll('.force-row')[i];
              if(row){
                const input = row.querySelector('input');
                if(input) force.name = input.value;
              }
              force.anchor = null;
              force.arrowBase = null;
              force.arrowTip = null;
              force.force_dir = [1, 0];
              force.force_len = 0;
              force.drawing = false;
              force.dragging = null;
            } else {
              // Force has no points: delete the entire force
              window.fm.deleteAt(i);
              // After deletion, activeIndex might be out of bounds, adjust it
              activeIndex = Math.max(0, Math.min(i, window.fm.forces.length - 1));
            }
            
            // Set this force as active so next drawing goes to it
            window.fm.setActive(activeIndex);
            
            const containerEl = container;
            // syncInputs must be called AFTER setActive to update the active highlighting
            window.fm.syncInputs(containerEl);
            if(window.saveTaskForces) window.saveTaskForces();
            // Only call updateAppState if we actually deleted a force (not just cleared points)
            if(!hasPoints && window.updateAppState) window.updateAppState();
          }
        });
        
        row.style.display = 'flex';
        row.style.gap = '4px';
        row.style.alignItems = 'center';
        row.appendChild(label); row.appendChild(input); row.appendChild(toggleBtn); row.appendChild(deleteBtn);
        container.appendChild(row);
        rows.push(row);
        
        // Create anchor dropdown container (will be shown only for active force in editor mode)
        const anchorDropdownContainer = document.createElement('div');
        anchorDropdownContainer.className = 'force-anchor-dropdown-container';
        anchorDropdownContainer.dataset.index = idx;
        anchorDropdownContainer.style.display = 'none'; // Hidden by default
        anchorDropdownContainer.style.paddingLeft = '24px'; // Indent to align with input
        anchorDropdownContainer.style.marginTop = '4px';
        anchorDropdownContainer.style.marginBottom = '8px';
        
        const anchorLabel = document.createElement('label');
        anchorLabel.textContent = 'Anchor: ';
        anchorLabel.style.fontSize = '12px';
        anchorLabel.style.fontWeight = 'bold';
        anchorLabel.style.marginRight = '8px';
        
        const anchorSelect = document.createElement('select');
        anchorSelect.className = 'force-anchor-select';
        anchorSelect.dataset.index = idx;
        anchorSelect.style.fontSize = '12px';
        anchorSelect.style.padding = '4px';
        anchorSelect.addEventListener('change', (e)=>{
          const forceIdx = parseInt(e.target.dataset.index, 10);
          if(!window.currentTask || !window.fm || forceIdx < 0 || forceIdx >= window.fm.forces.length) return;
          
          const force = window.fm.forces[forceIdx];
          const selectedValue = e.target.value;
          
          // Parse selection: format is "point:ref:pointName" or "segment:ref:segmentName" or "custom:x,y"
          const parts = selectedValue.split(':');
          if(parts.length >= 2){
            const type = parts[0];
            
            if(type === 'custom'){
              // Custom position: "custom:x,y"
              const coords = parts[1];
              const [x, y] = coords.split(',').map(s => parseFloat(s.trim()));
              
              if(!isNaN(x) && !isNaN(y)){
                const anchorPos = [x, y];
                force.anchor = anchorPos.slice();
                console.log(`📌 Force "${force.name}" anchor moved to custom pos:`, anchorPos);
                
                // Update expectedForce anchor in task
                if(window.currentTask.expectedForces){
                  const idx_expected = window.currentTask.expectedForces.findIndex(ef => 
                    ef.name && ef.name.toLowerCase().trim() === force.name.toLowerCase().trim()
                  );
                  
                  if(idx_expected >= 0){
                    const exp = window.currentTask.expectedForces[idx_expected];
                    exp.anchor = { type: 'custom', pos: anchorPos };
                    if(window.saveTaskForces) window.saveTaskForces();
                  }
                }
              }
            } else {
              // Scene element anchor: "point:ref:pointName" or "segment:ref:segmentName"
              const ref = parts[1];
              const name = parts.slice(2).join(':');
              
              // Find the candidate to get its position
              const candidates = window.buildAnchorCandidates ? window.buildAnchorCandidates(window.currentTask) : [];
              let anchorPos = null;
              
              if(type === 'point'){
                const candidate = candidates.find(c => c.type === 'point' && c.ref === ref && c.point === name);
                if(candidate) anchorPos = candidate.pos;
              } else if(type === 'segment'){
                const candidate = candidates.find(c => c.type === 'segment' && c.ref === ref && c.segment === name);
                if(candidate) anchorPos = candidate.pos;
              }
              
              // Update force's anchor position
              if(anchorPos){
                force.anchor = anchorPos.slice();
                console.log(`📌 Force "${force.name}" anchor moved to:`, anchorPos);
              }
              
              // Update force's expectedForce anchor in task
              if(window.currentTask.expectedForces){
                const idx_expected = window.currentTask.expectedForces.findIndex(ef => 
                  ef.name && ef.name.toLowerCase().trim() === force.name.toLowerCase().trim()
                );
                
                if(idx_expected >= 0){
                  const exp = window.currentTask.expectedForces[idx_expected];
                  if(type === 'point'){
                    exp.anchor = { type: 'point', ref: ref, point: name };
                  } else if(type === 'segment'){
                    exp.anchor = { type: 'segment', ref: ref, segment: name };
                  }
                  if(window.saveTaskForces) window.saveTaskForces();
                }
              }
            }
            
            // Re-sync inputs to reflect the change
            const container = e.target.closest('#force-inputs');
            if(container && window.fm){
              window.fm.syncInputs(container);
            }
          }
        });
        
        anchorDropdownContainer.appendChild(anchorLabel);
        anchorDropdownContainer.appendChild(anchorSelect);
        container.appendChild(anchorDropdownContainer);
      }
      // Remove excess rows
      while(rows.length > this.forces.length){
        const r = rows.pop();
        r.remove();
        // Also remove corresponding dropdown container if it exists
        const dropdownToRemove = container.querySelector(`.force-anchor-dropdown-container[data-index="${rows.length}"]`);
        if(dropdownToRemove){
          dropdownToRemove.remove();
        }
      }
      
      // Update values and active highlighting
      for(let i=0;i<this.forces.length;i++){
        const f = this.forces[i];
        const row = container.querySelector(`.force-row[data-force-index="${i}"]`);
        if(!row) continue; // Skip if row doesn't exist yet
        const input = row.querySelector('input');
        const toggleBtn = row.querySelector('.force-type-toggle');
        const deleteBtn = row.querySelector('.force-delete-btn');
        // Find dropdown container by data-index instead of array reference
        const anchorDropdownContainer = container.querySelector(`.force-anchor-dropdown-container[data-index="${i}"]`);
        
        // Keep dataset index in sync in case forces array changed
        if(input.dataset.index != i){ input.dataset.index = i; }
        if(toggleBtn && toggleBtn.dataset.index != i){ toggleBtn.dataset.index = i; }
        if(deleteBtn && deleteBtn.dataset.index != i){ deleteBtn.dataset.index = i; }
        // Only push value from force->UI if user is not editing AND we have a non-empty name.
        // This prevents wiping a just-typed value when force.name hasn't yet updated (edge race) or is still empty.
        if(document.activeElement !== input){
          if(f.name && f.name.trim() !== input.value){
            input.value = f.name;
          } else if(!f.name || f.name.trim() === ''){
            // Force has no name: clear the input
            input.value = '';
          }
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
        
        // Delete button visible if force has points OR has a name (so user can delete name-only forces)
        if(deleteBtn){
          const hasPoints = !!(f.anchor || f.arrowBase || f.arrowTip);
          const hasName = !!(f.name && f.name.trim() !== '');
          const canDelete = hasPoints || hasName;
          deleteBtn.style.display = canDelete ? 'flex' : 'none';
        }
        
        // Anchor dropdown: show only for active expected force in editor mode
        if(anchorDropdownContainer){
          const isActive = (i === this.activeIndex);
          const isExpectedForce = isExpected; // expected forces show anchor dropdown
          const shouldShowDropdown = isEditorMode && isActive && isExpectedForce;
          
          // Always update visibility (show/hide)
          if(shouldShowDropdown){
            // Only rebuild dropdown content if forceDropdownRebuild is true (activeIndex changed)
            if(forceDropdownRebuild){
              // Rebuild dropdown options from buildAnchorCandidates
              const anchorSelect = anchorDropdownContainer.querySelector('.force-anchor-select');
              if(anchorSelect){
                anchorSelect.innerHTML = ''; // Clear options
                
                // Add "None" option
                const noneOption = document.createElement('option');
                noneOption.value = '';
                noneOption.textContent = '-- Velg ankerpunkt --';
                anchorSelect.appendChild(noneOption);
                
                // Get current anchor from expectedForce if available
                let currentAnchorValue = '';
                let currentCustomPos = null;
                if(window.currentTask && window.currentTask.expectedForces){
                  const expForce = window.currentTask.expectedForces.find(ef => 
                    ef.name && ef.name.toLowerCase().trim() === f.name.toLowerCase().trim()
                  );
                  if(expForce && expForce.anchor){
                    const a = expForce.anchor;
                    if(a.type === 'point'){
                      currentAnchorValue = `point:${a.ref}:${a.point}`;
                    } else if(a.type === 'segment'){
                      currentAnchorValue = `segment:${a.ref}:${a.segment}`;
                    } else if(a.type === 'custom' && a.pos){
                      // Custom position [x, y]
                      currentCustomPos = a.pos;
                      currentAnchorValue = `custom:${Math.round(a.pos[0])},${Math.round(a.pos[1])}`;
                    }
                  }
                }
                
                // Build candidates and add to dropdown
                if(window.buildAnchorCandidates && window.currentTask){
                  const candidates = window.buildAnchorCandidates(window.currentTask);
                  console.log(`🎯 Dropdown for force "${f.name}" (index ${i}): building with ${candidates.length} candidates`);
                  
                  // Group by ref for better UI
                  const groupedByRef = {};
                  candidates.forEach(c => {
                    if(!groupedByRef[c.ref]) groupedByRef[c.ref] = [];
                    groupedByRef[c.ref].push(c);
                  });
                  
                  console.log(`   Grouped into ${Object.keys(groupedByRef).length} refs:`, Object.keys(groupedByRef));
                  
                  // Add options, grouped by ref
                  Object.keys(groupedByRef).sort().forEach(ref => {
                    const group = groupedByRef[ref];
                    
                    // Create optgroup for this ref
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = ref;
                    
                    group.forEach(candidate => {
                      const option = document.createElement('option');
                      if(candidate.type === 'point'){
                        option.value = `point:${candidate.ref}:${candidate.point}`;
                        option.textContent = `point: ${candidate.point}`;
                      } else if(candidate.type === 'segment'){
                        option.value = `segment:${candidate.ref}:${candidate.segment}`;
                        option.textContent = `segment: ${candidate.segment}`;
                      }
                      optgroup.appendChild(option);
                    });
                    
                    anchorSelect.appendChild(optgroup);
                  });
                  
                  // Add custom position option if force has one
                  if(currentCustomPos){
                    const customGroup = document.createElement('optgroup');
                    customGroup.label = 'Egendefinert';
                    const customOption = document.createElement('option');
                    customOption.value = `custom:${Math.round(currentCustomPos[0])},${Math.round(currentCustomPos[1])}`;
                    customOption.textContent = `pos[${Math.round(currentCustomPos[0])},${Math.round(currentCustomPos[1])}]`;
                    customGroup.appendChild(customOption);
                    anchorSelect.appendChild(customGroup);
                  };
                  
                  // Set current selection
                  anchorSelect.value = currentAnchorValue;
                }
              }
            }
            
            anchorDropdownContainer.style.display = 'block';
          } else {
            anchorDropdownContainer.style.display = 'none';
          }
        }
        
        // Hide entire row if force is completely blank AND it's not the last one
        // (Keep the last blank force visible for adding new forces)
        const isBlank = !f.anchor && !f.arrowBase && !f.arrowTip && (!f.name || f.name.trim() === '');
        const isLastForce = (i === this.forces.length - 1);
        row.style.display = (isBlank && !isLastForce) ? 'none' : 'flex';
        
        const shouldBeActive = (i===this.activeIndex);
        if(shouldBeActive) {
          row.classList.add('active');
        } else {
          row.classList.remove('active');
        }
      }
    }
  }
  window.ForcesManager = ForcesManager;
})();
