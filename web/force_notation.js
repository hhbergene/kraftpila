(function(){
  const roles = new Set(['force','component','resultant']);

  function normalize(raw){
    let name = String(raw || '').trim();
    const sum = /^(?:\\sum|sum|Σ)\s*/i.exec(name);
    if(sum) name = name.slice(sum[0].length).trim();
    // Only compact, single-letter force symbols acquire an implicit index.
    const indexed = /^([A-Za-zÆØÅæøå])(?:_([A-Za-zÆØÅæøå0-9]+)|([A-Za-zÆØÅæøå]{1,2}|[0-9]+))$/.exec(name);
    if(indexed){
      const index = indexed[2] || indexed[3];
      name = `${indexed[1]}_${index.length > 1 ? `{${index}}` : index}`;
    }
    return sum ? `\\sum${name ? ' '+name : ''}` : name;
  }

  function key(name){
    return normalize(name).toLowerCase().replace(/[ _^{}]/g,'');
  }

  function inferredRole(name){
    const normalized = normalize(name);
    if(normalized.startsWith('\\sum')) return 'resultant';
    return /_(?:[xytpn]|\{[^{}]*[xytpn]\})$/i.test(normalized) ? 'component' : 'force';
  }

  function matches(name,spec){
    const value = key(name);
    if(!value) return false;
    if([spec.name,...(spec.aliases || [])].some(alias=>key(alias)===value)) return true;
    const base = key(spec.nameBase);
    return !!base && value.startsWith(base) && /^[a-z0-9*'æøå]{0,2}$/.test(value.slice(base.length));
  }

  function expectedSpec(name,task){
    if(!key(name)) return null;
    const specs = task?.expectedForces || [];
    const canonical = specs.filter(spec=>key(spec.name)===key(name));
    if(canonical.length===1) return canonical[0];
    const exact = specs.filter(spec=>[spec.name,...(spec.aliases || [])].some(alias=>key(alias)===key(name)));
    if(exact.length===1) return exact[0];
    const grouped = specs.filter(spec=>matches(name,spec));
    if(grouped.length && grouped.every(spec=>(spec.role || inferredRole(spec.name))===(grouped[0].role || inferredRole(grouped[0].name)))){
      return grouped[0];
    }
    return null;
  }

  function givenSpec(force,task){
    return (task?.expectedForces || []).find(spec=>force.studentSpecName && key(spec.name)===key(force.studentSpecName)) || null;
  }

  function role(force,task){
    const given = givenSpec(force,task);
    if(given?.studentGiven?.role) return given.role || inferredRole(given.name);
    const spec = expectedSpec(force.name,task);
    const expectedRole = spec && (spec.role || inferredRole(spec.name));
    if(expectedRole==='component' || expectedRole==='resultant') return expectedRole;
    const inferred = inferredRole(force.name);
    return inferred!=='force' ? inferred : (roles.has(force.role) ? force.role : force.manualRole || 'force');
  }

  function resolve(force,task){
    // A previous automatic role must not survive a name change.
    force.role = roles.has(force.manualRole) ? force.manualRole : 'force';
    const inferred = inferredRole(force.name);
    force.role = window.editorMode===true
      ? (inferred!=='force' ? inferred : force.manualRole || 'force')
      : role(force,task);
    return force;
  }

  function metadata(force){
    return {
      role:force.role || 'force',
      ...(force.manualRole ? {manualRole:force.manualRole} : {}),
      ...(force.componentOf ? {componentOf:force.componentOf} : {}),
      ...(force.studentSpecName ? {studentSpecName:force.studentSpecName} : {})
    };
  }

  function restore(force,data,isSpec=false){
    force.role = roles.has(data.role) ? data.role : inferredRole(data.name);
    if(roles.has(data.manualRole)) force.manualRole = data.manualRole;
    else force.manualRole = isSpec && roles.has(data.role) ? data.role : 'force';
    if(data.componentOf) force.componentOf = data.componentOf;
    if(data.studentSpecName) force.studentSpecName = data.studentSpecName;
    return force;
  }

  function parentName(force,task){
    const spec = givenSpec(force,task) || expectedSpec(force.name,task);
    const explicit = force.componentOf || spec?.componentOf;
    if(explicit) return explicit;
    if(role(force,task)!=='component') return '';
    const match = /^(.+)_([xytpn]|\{([^{}]*)([xytpn])\})$/i.exec(normalize(force.name));
    if(!match) return '';
    return match[3] ? normalize(`${match[1]}_${match[3]}`) : match[1];
  }

  function sort(manager,task){
    const active = manager.forces[manager.activeIndex];
    const original = manager.forces;
    const children = new Map();
    const parents = new Set();
    original.forEach(force=>{
      const parent = parentName(force,task);
      const candidates = parent ? original.filter(other=>other!==force &&
        (key(other.name)===key(parent) || matches(other.name,{name:parent,
          aliases:(task?.initialForces || []).concat(task?.expectedForces || []).find(spec=>key(spec.name)===key(parent))?.aliases}))) : [];
      if(candidates.length!==1) return;
      const owner = candidates[0];
      if(!children.has(owner)) children.set(owner,[]);
      children.get(owner).push(force);
      parents.add(force);
    });
    const sorted = [];
    const visited = new Set();
    const append = force=>{
      if(visited.has(force)) return;
      visited.add(force);
      sorted.push(force);
      (children.get(force) || []).forEach(append);
    };
    original.filter(force=>!parents.has(force)).forEach(append);
    original.forEach(append); // Explicit cyclic links must never discard a force.
    const changed = sorted.some((force,index)=>force!==original[index]);
    if(changed){
      manager.forces = sorted;
      manager.activeIndex = sorted.indexOf(active);
      if(window.pendingForceAnchorPickerIndices){
        window.pendingForceAnchorPickerIndices = window.pendingForceAnchorPickerIndices.map(index=>sorted.indexOf(original[index])).filter(index=>index>=0);
      }
      const container = typeof document!=='undefined' && manager===window.fm && document.getElementById('force-inputs');
      if(container){
        const rows = Array.from(container.querySelectorAll('.force-row'));
        if(rows.length===original.length){
          const focused = container.contains(document.activeElement) ? document.activeElement : null;
          const dropdowns = original.map((_,index)=>container.querySelector(`.force-anchor-dropdown-container[data-index="${index}"]`));
          // Move the actual controls, not their values, so a pending click/focus
          // continues to address the same force after grouping.
          manager.reordering = true;
          sorted.forEach((force,index)=>{
            const oldIndex = original.indexOf(force);
            const row = rows[oldIndex];
            row.dataset.forceIndex = index;
            row.querySelectorAll('[data-index]').forEach(control=>{ control.dataset.index = index; });
            container.appendChild(row);
            const dropdown = dropdowns[oldIndex];
            if(dropdown){
              dropdown.dataset.index = index;
              dropdown.querySelectorAll('[data-index]').forEach(control=>{ control.dataset.index = index; });
              container.appendChild(dropdown);
            }
          });
          manager.reordering = false;
          if(focused && document.activeElement!==focused) focused.focus();
        }
      }
    }
    return changed;
  }

  function seedStudentForces(task,manager){
    (task?.expectedForces || []).forEach(spec=>{
      if(!spec.studentGiven?.name && !spec.studentGiven?.role) return;
      let force = manager.forces.find(f=>key(f.studentSpecName)===key(spec.name));
      if(!force){
        force = new window.Force();
        force.isExpected = true;
        force.studentSpecName = spec.name;
        const blank = manager.forces.findIndex(f=>!f.name && !f.anchor && !f.arrowTip && !f.arrowBase && !f.studentSpecName);
        if(blank<0) manager.forces.push(force);
        else manager.forces.splice(blank,0,force);
      }
      if(spec.studentGiven.name) force.name = normalize(spec.name);
      if(spec.studentGiven.role) force.role = spec.role || inferredRole(spec.name);
      resolve(force,task);
    });
    sort(manager,task);
  }

  window.forceNotation = {normalize,key,inferredRole,matches,expectedSpec,givenSpec,role,resolve,metadata,restore,parentName,sort,seedStudentForces};
})();
