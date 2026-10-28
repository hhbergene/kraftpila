const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..','web');
const source=fs.readFileSync(path.join(root,'editor.js'),'utf8');

function button(){
  return {listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},
    click(){this.listeners.click();}};
}

function setup(overrides={}){
  const storage=new Map();
  const add=button();
  const list={
    fields:[],querySelector:selector=>selector==='#add-relation' ? add : null,
    querySelectorAll(selector){return this.fields.filter(input=>selector===`.${input.className}`);},
    set innerHTML(html){
      this.html=html;
      this.fields=[];
      for(const row of html.split('<div class="relation-row"').slice(1)){
        const idx=row.match(/data-idx="(\d+)"/)[1];
        for(const match of row.matchAll(/<input ([^>]+)>/g)){
          const attrs=Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)]
            .map(([,key,value])=>[key,value]));
          if(!['ratio-input','tolerance-input'].includes(attrs.class)) continue;
          this.fields.push({...attrs,className:attrs.class,dataset:{key:attrs['data-key']},
            validity:{badInput:false},listeners:{},validationMessage:'',
            closest:()=>({dataset:{idx}}),
            addEventListener(type,fn){this.listeners[type]=fn;},
            setCustomValidity(message){this.validationMessage=message;},
            reportValidity(){this.reported=true;return !this.validationMessage;},
            fire(type){this.listeners[type]();}});
        }
      }
    }
  };
  const modal={hidden:true,classList:{add(){modal.hidden=true;},remove(){modal.hidden=false;},
    contains(){return modal.hidden;}}};
  const alerts=[];
  const relation={lhs:[{name:'A'}],rhs:[{name:'B'}],ratio:1,...overrides};
  [relation.lhs,relation.rhs].forEach(terms=>terms?.forEach(term=>{
    if(['normal','tangent'].includes(term.component)) term.planeId ||= 'plane-1';
  }));
  const window={currentTask:{id:'test',scene:{planes:[{id:'plane-1'}],activePlaneId:'plane-1'},
    relations:[relation]},
    fm:{forces:[{name:'A'},{name:'B'}]},alert:message=>alerts.push(message)};
  const context={window,relationsList:list,relationsModal:modal,
    btnEditRelations:button(),relationsSave:button(),relationsCancel:button(),
    localStorage:{getItem:key=>storage.get(key) ?? null},
    pendingStorage:new Map(),queueStorage:(key,value)=>storage.set(key,JSON.stringify(value)),
    markEdited(){},escapeHtml:value=>value,console};
  const controls={
    'relation-snap-choice':{open:false,showModal(){this.open=true;},close(){this.open=false;}},
    'relation-snap-differences':{},
    'relation-snap-merge':{},
    'relation-snap-replace':{}
  };
  context.document={getElementById:id=>controls[id]||null};
  context.applyTaskSnapChecklist=task=>{window.currentSnapChecklist=window.getTaskSnapChecklist(task);};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'shared.js'),'utf8'),context);
  const start=source.indexOf('  // Relations editor modal logic');
  const end=source.indexOf('  // Task order manager modal logic',start);
  vm.runInContext(source.slice(start,end),context);
  context.btnEditRelations.click();
  return {...context,list,modal,storage,add,context,controls,alerts,
    field:key=>list.fields.find(field=>field.dataset.key===key)};
}

test('blank tolerance fields show defaults without storing them, including after ratio changes',()=>{
  const s=setup();
  assert.equal(s.field('tol_rel').value,'');
  assert.equal(s.field('tol_rel').placeholder,'5');
  assert.equal(s.field('tol_abs').value,'');
  assert.equal(s.field('tol_abs').placeholder,'2');
  const ratio=s.list.fields.find(input=>input.className==='ratio-input');
  ratio.value='2';
  ratio.fire('change');
  s.relationsSave.click();
  assert.equal(s.modal.hidden,true);
  const saved=JSON.parse(s.storage.get('editor_relations_test'))[0];
  assert.equal(saved.ratio,2);
  assert.equal(Object.hasOwn(saved,'tol_rel'),false);
  assert.equal(Object.hasOwn(saved,'tol_abs'),false);
  s.btnEditRelations.click();
  assert.equal(s.field('tol_rel').value,'');
  assert.equal(s.field('tol_abs').value,'');
});

test('relation match differences defer all writes, and merge preserves extra and non-match settings',()=>{
  const s=setup();
  const task=s.window.currentTask;
  task.snapChecklist={snapMatchLL:false,snapMatchXY:true,guidelinesEnabled:false,snapEnabled:false};
  s.list._relations[0].lhs[0].component='normal';
  s.list._relations[0].lhs[0].planeId='plane-1';
  const before=JSON.stringify(task);
  s.relationsSave.click();
  assert.equal(s.controls['relation-snap-choice'].open,true);
  assert.equal(JSON.stringify(task),before);
  assert.equal(s.storage.size,0);
  const differences=s.controls['relation-snap-differences'].innerHTML;
  assert.match(differences,/Mangler i sjekklista/);
  assert.match(differences,/Lengde–normal/);
  assert.match(differences,/Valgt utover relevante/);
  assert.match(differences,/x–y/);
  assert.doesNotMatch(differences,/summer|ΣF/i);
  s.controls['relation-snap-merge'].onclick();
  assert.equal(s.controls['relation-snap-choice'].open,false);
  assert.equal(s.modal.hidden,true);
  assert.equal(task.snapChecklist.snapMatchLL,true);
  assert.equal(task.snapChecklist.snapMatchLN,true);
  assert.equal(task.snapChecklist.snapMatchXY,true);
  assert.equal(task.snapChecklist.guidelinesEnabled,false);
  assert.equal(task.snapChecklist.snapEnabled,false);
  assert.equal(task.relations[0].lhs[0].component,'normal');
  assert.equal(s.window.currentSnapChecklist.snapMatchLN,true);
  assert.equal(JSON.parse(s.storage.get('editor_relations_test'))[0].lhs[0].component,'normal');
});

test('replace removes extras, cancel writes nothing, and stale choices cannot affect another task',()=>{
  const s=setup();
  const task=s.window.currentTask;
  task.snapChecklist={snapMatchXY:true,showForceCoordinates:true};
  s.list._relations[0].rhs[0].component='tangent';
  s.list._relations[0].rhs[0].planeId='plane-1';
  const before=JSON.stringify(task);
  s.relationsSave.click();
  s.controls['relation-snap-choice'].close();
  assert.equal(JSON.stringify(task),before);
  assert.equal(s.storage.size,0);
  s.relationsSave.click();
  s.controls['relation-snap-replace'].onclick();
  assert.equal(task.snapChecklist.snapMatchXY,false);
  assert.equal(task.snapChecklist.snapMatchLT,true);
  assert.equal(task.snapChecklist.showForceCoordinates,true);
  const saved=JSON.stringify(task);
  s.btnEditRelations.click();
  assert.equal(s.context.saveRelationsEditor(),true,'no difference saves without another choice');
  assert.equal(JSON.stringify(task),saved);
  task.snapChecklist.snapMatchXY=true;
  s.relationsSave.click();
  const next={id:'other',relations:[]};
  s.window.currentTask=next;
  s.controls['relation-snap-replace'].onclick();
  assert.equal(next.snapChecklist,undefined);
});

test('task changes save automatically without a choice and keep the panel open',()=>{
  const s=setup();
  s.context.confirm=()=>{throw new Error('Unexpected confirmation');};
  s.list._relations[0].rhs[0].component='normal';
  s.list._relations[0].rhs[0].planeId='plane-1';
  assert.equal(s.context.resolveRelationsEditorBeforeTaskChange('next'),true);
  assert.equal(s.controls['relation-snap-choice'].open,false);
  assert.equal(s.window.currentTask.snapChecklist.snapMatchLN,true);
  assert.equal(s.storage.has('editor_relations_test'),true);
  assert.equal(s.modal.hidden,false);
});

test('new relations omit tolerance overrides',()=>{
  const s=setup();
  s.add.click();
  assert.equal(s.list._relations.length,2);
  assert.equal(Object.hasOwn(s.list._relations[1],'tol_rel'),false);
  assert.equal(Object.hasOwn(s.list._relations[1],'tol_abs'),false);
  assert.equal(Object.hasOwn(s.list._relations[1],'ratio'),false);
});

test('explicit values and zero persist, reopen and can be cleared independently',()=>{
  const s=setup({tol_rel:0.15,tol_abs:0});
  assert.equal(s.field('tol_rel').value,'15');
  assert.equal(s.field('tol_abs').value,'0');
  s.field('tol_rel').value='7.5';
  s.field('tol_rel').fire('input');
  s.field('tol_abs').value='3';
  s.field('tol_abs').fire('input');
  s.relationsSave.click();
  assert.equal(s.window.currentTask.relations[0].tol_rel,0.075);
  assert.equal(s.window.currentTask.relations[0].tol_abs,3);
  s.btnEditRelations.click();
  assert.equal(s.field('tol_rel').value,'7.5');
  assert.equal(s.field('tol_abs').value,'3');
  s.field('tol_rel').value='';
  s.field('tol_rel').fire('input');
  s.field('tol_abs').value='0';
  s.relationsSave.click();
  const saved=JSON.parse(s.storage.get('editor_relations_test'))[0];
  assert.equal(Object.hasOwn(saved,'tol_rel'),false);
  assert.equal(saved.tol_abs,0);
});

test('invalid tolerance input reports errors and blocks saving without hiding the modal',()=>{
  for(const [key,value,badInput] of [
    ['tol_rel','-1',false],['tol_rel','101',false],['tol_abs','-1',false],
    ['tol_abs','Infinity',false],['tol_abs','',true]
  ]){
    const s=setup();
    const input=s.field(key);
    input.value=value;
    input.validity.badInput=badInput;
    input.fire('input');
    s.relationsSave.click();
    assert.ok(input.validationMessage);
    assert.equal(input.reported,true);
    assert.equal(s.modal.hidden,false);
    assert.equal(s.storage.has('editor_relations_test'),false);
    input.value='0';
    input.validity.badInput=false;
    input.fire('input');
    s.relationsSave.click();
    assert.equal(s.modal.hidden,true);
    assert.equal(s.window.currentTask.relations[0][key],0);
  }
});

test('task export preserves omitted and explicitly supplied tolerances',()=>{
  for(const overrides of [{},{tol_rel:0,tol_abs:3}]){
    const s=setup(overrides);
    s.relationsSave.click();
    s.window.currentTask.snapChecklist.removedOption=true;
    s.window.fm.forces=[];
    s.window.confirmAuthorExport=()=>true;
    s.window.sceneModel={update(){}};
    s.window.syncSceneForceAnchors=()=>{};
    let exported;
    Object.assign(s.context,{
      btnExportTask:button(),autoSave(){},FORCE_ALIASES:{},
      Blob:class {constructor(parts){exported=parts.join('');}},
      URL:{createObjectURL:()=>'',revokeObjectURL(){}},
      document:{createElement:()=>({click(){}})}
    });

    const start=source.indexOf('  if(btnExportTask){');
    const end=source.indexOf('  // Force details popup:',start);
    vm.runInContext(source.slice(start,end),s.context);
    s.context.btnExportTask.click();
    const tasks=[];
    vm.runInNewContext(exported,{TASKS:tasks});
    const exportedRelation=tasks[0].relations[0];
    assert.deepEqual(JSON.parse(JSON.stringify(tasks[0].snapChecklist)),
      JSON.parse(JSON.stringify(s.window.getTaskSnapChecklist(s.window.currentTask))));
    assert.deepEqual(JSON.parse(JSON.stringify(exportedRelation)),{
      lhs:[{name:'A'}],rhs:[{name:'B'}],ratio:1,...overrides
    });
  }
});

function setAnswerGeometry(s){
  s.window.fm.forces=[
    {name:'A',anchor:[0,0],arrowBase:[0,0],arrowTip:[6,8]},
    {name:'B',anchor:[0,0],arrowBase:[0,0],arrowTip:[3,4]}
  ];
  s.context.refreshRelationsRatioInputs();
}

test('blank ratio shows a component-aware placeholder and remains omitted through save and reopen',()=>{
  const s=setup({ratio:undefined});
  setAnswerGeometry(s);
  const input=s.list.fields.find(input=>input.className==='ratio-input');
  assert.equal(input.value,'');
  assert.equal(input.placeholder,'2');
  assert.doesNotMatch(s.list.html,/auto-relation|\(auto:/);
  s.list._relations[0].lhs[0].component='horizontal';
  s.context.refreshRelationsRatioInputs();
  assert.equal(input.placeholder,'1.2');
  s.list._relations[0].lhs[0].component='magnitude';
  s.list.scrollTop=45;
  assert.equal(s.context.resolveRelationsEditorBeforeTaskChange('next'),true);
  assert.equal(s.list.scrollTop,45);
  assert.equal(s.modal.hidden,false);
  assert.equal(Object.hasOwn(JSON.parse(s.storage.get('editor_relations_test'))[0],'ratio'),false);
  s.btnEditRelations.click();
  const reopened=s.list.fields.find(input=>input.className==='ratio-input');
  assert.equal(reopened.value,'');
  assert.equal(reopened.placeholder,'2');
});

test('explicit ratio overrides the automatic placeholder and clearing it restores automatic mode',()=>{
  const s=setup({ratio:3});
  setAnswerGeometry(s);
  const input=s.list.fields.find(input=>input.className==='ratio-input');
  assert.equal(input.value,'3');
  assert.equal(input.placeholder,'2');
  input.value='';
  input.fire('change');
  assert.equal(Object.hasOwn(s.list._relations[0],'ratio'),false);
  assert.equal(s.context.saveRelationsEditor('merge'),true);
  input.value='4';
  assert.equal(s.context.saveRelationsEditor('merge'),true,'save reads the last keystroke without change');
  assert.equal(s.window.currentTask.relations[0].ratio,4);
});

test('invalid override or unavailable automatic value blocks saves and task switching without closing',()=>{
  for(const [value,badInput] of [['0',false],['-1',false],['Infinity',false],['',true],['',false]]){
    const s=setup();
    const input=s.list.fields.find(input=>input.className==='ratio-input');
    input.value=value;
    input.validity.badInput=badInput;
    assert.equal(s.context.resolveRelationsEditorBeforeTaskChange('next'),false);
    assert.ok(input.validationMessage);
    assert.equal(s.storage.size,0);
    assert.equal(s.modal.hidden,false);
    input.validity.badInput=false;
    input.value='1';
    assert.equal(s.context.resolveRelationsEditorBeforeTaskChange('next'),true);
  }
});

test('discard causes no writes and reopening restores the last saved relation',()=>{
  const s=setup();
  s.list._relations[0].ratio=9;
  s.relationsCancel.click();
  assert.equal(s.modal.hidden,true);
  assert.equal(s.storage.size,0);
  s.btnEditRelations.click();
  assert.equal(s.list._relations[0].ratio,1);
});

test('Escape discards the relation panel but does not dismiss it under the nested choice dialog',()=>{
  const s=setup();
  let handler;
  s.context.document={
    getElementById:id=>s.controls[id] || null,
    addEventListener:(event,fn)=>{handler=fn;}
  };
  const start=source.indexOf('  // ESC key closes settings/help/feedback panels');
  const end=source.indexOf('  // Placeholder for videre porteringsfaser',start);
  vm.runInContext(source.slice(start,end),s.context);
  const escape={key:'Escape',preventDefault(){},stopImmediatePropagation(){},stopPropagation(){}};
  s.controls['relation-snap-choice'].open=true;
  handler(escape);
  assert.equal(s.modal.hidden,false);
  s.controls['relation-snap-choice'].open=false;
  handler(escape);
  assert.equal(s.modal.hidden,true);
  assert.equal(s.storage.size,0);
  s.btnEditRelations.click();
  assert.equal(s.list._relations[0].ratio,1);
});

test('top save icon invokes the validated bottom save, retaining the panel on failure',()=>{
  const s=setup();
  const top=button();
  const ui=fs.readFileSync(path.join(root,'ui.js'),'utf8');
  const start=ui.indexOf('function setupFloatingPanelPositioning(');
  const end=ui.indexOf('// Draw help lines on canvas',start);
  s.modal.querySelector=selector=>selector==='.relations-header' ? {addEventListener(){}} : null;
  s.context.document={getElementById:id=>({
    'relations-modal':s.modal,'canvas-container':{},
    'relations-close':top,'relations-save':s.relationsSave,'relations-cancel':s.relationsCancel
  })[id]};
  s.window.addEventListener=()=>{};
  s.context.MutationObserver=class {observe(){}};
  const call=ui.match(/^setupFloatingPanelPositioning\('relations-modal'.*$/m)[0];
  vm.runInContext(ui.slice(start,end)+call,s.context);
  const input=s.list.fields.find(input=>input.className==='ratio-input');
  input.value='-1';
  top.click();
  assert.equal(s.modal.hidden,false);
  assert.equal(s.storage.size,0);
  input.value='3';
  top.click();
  assert.equal(s.modal.hidden,true);
  assert.equal(s.window.currentTask.relations[0].ratio,3);
  const html=fs.readFileSync(path.join(root,'..','editor.html'),'utf8');
  assert.match(html,/id="relations-close"[^>]*aria-label="Lagre og lukk"/);
  assert.match(html,/id="relations-cancel"[^>]*>Forkast</);
});

test('actual task load saves the outgoing draft and refreshes the open panel without changing position',()=>{
  const s=setup();
  const first=s.window.currentTask;
  const second={id:'second',relations:[{lhs:[{name:'C'}],rhs:[{name:'D'}],ratio:3}]};
  s.window.tasks=[first,second];
  s.window.sceneEditor={cancel(){}};
  s.window.sceneModel={migrateCirclesToEllipses:()=>false};
  s.window.buildAllScenePoints=()=>({});
  s.window.updateAppState=()=>{};
  s.modal.style={left:'125px',top:'210px'};
  const body={scrollTop:30};
  s.modal.querySelector=()=>body;
  Object.assign(s.context.document,{
    activeElement:null,
    querySelectorAll:()=>[]
  });
  Object.assign(s.context,{
    autoSave(){s.storage.set(`editor_task_${s.window.currentTask.id}`,JSON.stringify(s.window.currentTask));},
    normalizeTaskMeta:task=>task,
    inputsContainer:{innerHTML:''},
    buildSceneLookup:()=>({}),snapping:{buildSnapPoints:()=>[]},
    ForcesManager:class {constructor(){this.forces=[];} syncInputs(){}},
    seedInitialForces(){},
    seedExpectedForces:task=>{s.window.fm.forces=task.relations.flatMap(r=>[...r.lhs,...r.rhs]);},
    ensureInputMeta(){}
  });
  const start=source.indexOf('  function loadTask(index){');
  const end=source.indexOf('  // ===== Autolagring =====',start);
  vm.runInContext(source.slice(start,end),s.context);
  const input=s.list.fields.find(input=>input.className==='ratio-input');
  input.value='-1';
  assert.equal(s.context.loadTask(1),false);
  assert.equal(s.window.currentTask.id,'test');
  input.value='2';
  assert.equal(s.context.loadTask(1),true);
  assert.equal(first.relations[0].ratio,2);
  assert.equal(s.window.currentTask.id,'second');
  assert.equal(s.list._relations[0].ratio,3);
  assert.equal(s.modal.hidden,false);
  assert.deepEqual(s.modal.style,{left:'125px',top:'210px'});
  assert.equal(body.scrollTop,30);
});

test('teacher geometry is persisted in answer specs for automatic evaluation after reload',()=>{
  const s=setup({ratio:undefined});
  setAnswerGeometry(s);
  const task=s.window.currentTask;
  task.expectedForces=[{name:'A',anchor:{type:'custom',pos:[0,0]},dir:[1,0]}];
  task.initialForces=[{name:'B',anchorSpec:{type:'custom',pos:[0,0]}}];
  s.window.fm.forces[1].isExpected=false;
  s.window.getForceSpec=force=>{
    const expected=force.isExpected!==false;
    return {spec:(expected ? task.expectedForces : task.initialForces)[0],
      prop:expected ? 'anchor' : 'anchorSpec'};
  };
  const start=source.indexOf('  window.syncForceSpec = function(');
  const end=source.indexOf('  // Setup editor for help_lines text',start);
  vm.runInContext(source.slice(start,end),s.context);
  assert.equal(s.context.saveRelationsEditor('merge'),true);
  const reloaded=JSON.parse(JSON.stringify(task));
  assert.deepEqual(reloaded.expectedForces[0].drawn.arrowTip,[6,8]);
  assert.deepEqual(reloaded.initialForces[0].arrowTip,[3,4]);
  assert.equal(s.window.getEffectiveRelationRatio(reloaded,reloaded.relations[0]).value,2);
});

test('invalid tolerance blocks automatic task switching; a deleted task is never recreated by saving',()=>{
  const s=setup();
  s.field('tol_rel').value='101';
  assert.equal(s.context.resolveRelationsEditorBeforeTaskChange('next'),false);
  assert.equal(s.storage.size,0);
  s.window.tasks=[{id:'other'}];
  assert.equal(s.context.resolveRelationsEditorBeforeTaskChange('other'),true);
  assert.equal(s.storage.size,0);
});

test('player relation controls use answer placeholders and preserve automatic or explicit ratio modes',()=>{
  const s=setup({ratio:undefined});
  const answer=name=>({name,drawn:{arrowBase:[0,0],arrowTip:name==='A' ? [6,8] : [3,4]}});
  s.window.currentTask.expectedForces=[answer('A'),answer('B')];
  s.window.fm.forces=[{name:'A',force_len:100},{name:'B',force_len:1}];
  const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
  const start=main.indexOf('  // Relations editor modal logic');
  const end=main.indexOf('  // Conflict modal handlers',start);
  vm.runInContext(main.slice(start,end),s.context);
  s.btnEditRelations.click();
  const input=s.list.fields.find(input=>input.className==='ratio-input');
  assert.equal(input.value,'');
  assert.equal(input.placeholder,'2','student force lengths are not the answer');
  assert.equal(s.context.saveRelationsEditor(),true);
  assert.equal(Object.hasOwn(s.window.currentTask.relations[0],'ratio'),false);
  input.value='3';
  assert.equal(s.context.saveRelationsEditor(),true);
  assert.equal(s.window.currentTask.relations[0].ratio,3);
  input.value='-1';
  s.relationsSave.click();
  assert.equal(s.modal.hidden,false);
});
