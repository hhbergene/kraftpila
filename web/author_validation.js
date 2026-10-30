(function(){
  const finitePoint = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
  const components = new Set(['magnitude','normal','tangent','vertical','horizontal']);
  const nameKey = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

  window.collectRelationRatioErrors = function(task,drawnForces){
    return (task.relations || []).flatMap((relation,index)=>{
      const result=window.getEffectiveRelationRatio(task,relation,drawnForces);
      return result.error ? [`Relasjon ${index+1}: ${result.error}`] : [];
    });
  };

  window.collectAuthorWarnings = function(task,drawnForces){
    const warnings = [];
    if(!task) return ['Advarsel: Ingen oppgave er valgt.'];
    const warn = message => warnings.push(`Advarsel: ${message}`);
    if(!nameKey(task.title)) warn('Oppgaven mangler tittel.');
    if(!Array.isArray(task.help_lines) || !task.help_lines.some(line=>typeof line === 'string' && line.trim())){
      warn('Oppgaven mangler oppgavebeskrivelse.');
    }
    const expected = Array.isArray(task.expectedForces) ? task.expectedForces : [];
    const initial = Array.isArray(task.initialForces) ? task.initialForces : [];
    if(!expected.length) warn('Oppgaven har ingen forventede krefter.');
    const specs = [...expected,...initial];
    const names = new Set();
    const relationNames = new Set(specs.map(force=>force?.name).filter(name=>typeof name === 'string' && name.trim()));
    const lookup = window.buildAllScenePoints(task);
    (task.scene?.points||[]).forEach((point,index)=>{
      if(point?.type==='attached'&&point.valid===false){
        warn(`Festet punkt ${index+1}: ${point.reason||'sporkilden finnes ikke eller er ugyldig.'}`);
      }
    });
    (task.scene?.wagons||[]).forEach((wagon,index)=>{
      if(wagon?.valid===false){
        warn(`Vogn ${index+1}: ${wagon.reason||'geometrien eller målene er ugyldige.'}`);
      }
    });
    specs.forEach((force,index)=>{
      const label = force?.name || `? (${index + 1})`;
      const key = nameKey(force?.name);
      if(!key) warn(`Kraft ${label} mangler navn.`);
      else if(names.has(key)) warn(`Flere krefter har samme navn: ${label}.`);
      if(key) names.add(key);
      if(force?.role!==undefined && !['force','component','resultant'].includes(force.role)){
        warn(`Kraft ${label} har ugyldig krafttype.`);
      }
      if(force?.componentOf){
        if(force.role!=='component') warn(`Kraft ${label} har hovedkraft uten å være en komponent.`);
        const parent = specs.find(other=>other!==force &&
          (window.forceNotation ? window.forceNotation.key(other.name)===window.forceNotation.key(force.componentOf) : nameKey(other.name)===nameKey(force.componentOf)));
        if(!parent) warn(`Komponent ${label} viser til en manglende hovedkraft: ${force.componentOf}.`);
      }
      if(force?.studentGiven && ['name','role'].some(field=>force.studentGiven[field]!==undefined && typeof force.studentGiven[field]!=='boolean')){
        warn(`Kraft ${label} har ugyldige felt for forhåndsgitte opplysninger.`);
      }
      const anchor = index < expected.length ? force?.anchor : force?.anchorSpec;
      if(anchor?.type === 'custom'){
        warn(`Kraft ${label} mangler anchor (type custom).`);
        if(!finitePoint(anchor.pos)) warn(`Kraft ${label} har ugyldige anchor-koordinater.`);
      }else if(anchor?.type === 'point'){
        if(!finitePoint(lookup[anchor.ref]?.points?.[anchor.point])){
          warn(`Kraft ${label} har anchor som viser til et manglende eller ugyldig punkt.`);
        }
      }else if(anchor?.type === 'segment'){
        const wagon = anchor.segment === 'bottom'
          ? task.scene?.wagons?.find(item=>item?.id===anchor.ref) : null;
        const resolved = wagon ? window.sceneModel?.resolveAnchor(task,anchor) : null;
        const segment = wagon ? resolved?.segment : lookup[anchor.ref]?.segments?.[anchor.segment];
        const valid = wagon
          ? resolved?.valid === true && finitePoint(resolved.pos) &&
            finitePoint(segment?.a) && finitePoint(segment?.b)
          : Array.isArray(segment) && segment.length === 2 && segment.every(finitePoint);
        if(!valid){
          warn(`Kraft ${label} har anchor som viser til et manglende eller ugyldig segment.`);
        }
      }else{
        warn(`Kraft ${label} mangler gyldig anchor.`);
      }
    });
    const geometryForces = drawnForces || [
      ...expected.filter(force=>force?.drawn).map(force=>({...force.drawn,name:force.name})),
      ...initial
    ];
    geometryForces.forEach((force,index)=>{
      if(!force) return;
      const hasData = nameKey(force.name) || force.anchor || force.arrowBase || force.arrowTip;
      if(!hasData) return;
      const label = force.name || `? (${index + 1})`;
      if(!nameKey(force.name)) warn(`Tegnet kraft ${label} mangler navn.`);
      if(!finitePoint(force.anchor) || !finitePoint(force.arrowBase) || !finitePoint(force.arrowTip)){
        warn(`Kraft ${label} har ufullstendig eller ugyldig kraftgeometri.`);
      }else if(Math.hypot(force.arrowTip[0]-force.arrowBase[0],force.arrowTip[1]-force.arrowBase[1]) === 0){
        warn(`Kraft ${label} har null lengde.`);
      }
    });
    const relations = Array.isArray(task.relations) ? task.relations : [];
    const hasSum = ['x','y','t','n'].some(key=>Number.isFinite(task.sumF?.[key]));
    if(!relations.length && specs.length >= 2 && !hasSum){
      warn('Ingen relasjoner eller krav til resultantkraft er definert. Kontroller om dette er tilsiktet.');
    }
    relations.forEach((relation,index)=>{
      const label = `Relasjon ${index + 1}`;
      for(const [side,text] of [['lhs','venstre'],['rhs','høyre']]){
        const terms = relation?.[side];
        if(!Array.isArray(terms) || !terms.length){
          warn(`${label} mangler ${text} side.`);
          continue;
        }
        terms.forEach(term=>{
          if(!relationNames.has(term?.name)) warn(`${label} viser til en manglende kraft: ${term?.name || '?'}.`);
          if(term?.component !== undefined && !components.has(term.component)){
            warn(`${label} har ugyldig komponent: ${term.component}.`);
          }
        });
      }
      if(relation?.ratio !== undefined && (!Number.isFinite(relation.ratio) || relation.ratio <= 0)){
        warn(`${label} har ugyldig forholdstall (må være større enn 0).`);
      }
      if(relation?.ratio===undefined){
        const result=window.getAutomaticRelationRatio(task,relation,drawnForces);
        if(result.error) warn(`${label}: ${result.error}`);
      }
      if(relation?.tol_rel !== undefined && (!Number.isFinite(relation.tol_rel) || relation.tol_rel < 0 || relation.tol_rel > 1)){
        warn(`${label} har ugyldig toleranse (må være mellom 0 og 1).`);
      }
      if(relation?.tol_abs !== undefined && (!Number.isFinite(relation.tol_abs) || relation.tol_abs < 0)){
        warn(`${label} har ugyldig absolutt toleranse (må være et ikke-negativt antall px).`);
      }
    });
    return [...new Set(warnings)];
  };

  window.confirmAuthorExport = function(tasks){
    const errors=tasks.flatMap(task=>{
      const drawn=task.id===window.currentTask?.id ? window.fm?.forces : undefined;
      return window.collectRelationRatioErrors(task,drawn)
        .map(error=>`${task.title || task.id || 'Oppgave'}: ${error}`);
    });
    if(errors.length){
      alert(`Eksport stoppet. Oppgi et gyldig forhold eller rett fasiten:\n\n${errors.join('\n')}`);
      return false;
    }
    const messages = tasks.flatMap(task=>{
      const drawn = task.id === window.currentTask?.id ? window.fm?.forces : undefined;
      return window.collectAuthorWarnings(task,drawn).map(message=>`${task.title || task.id || 'Oppgave'}: ${message}`);
    });
    return !messages.length || confirm(`Oppgavene har forfatteradvarsler:\n\n${messages.join('\n')}\n\nDisse bør rettes før publisering. Eksporter likevel?`);
  };
})();
