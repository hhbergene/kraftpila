const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web','main.js'),'utf8');

function setup(){
  const original={id:'task-a',title:'Old',scene:{},initialForces:[]};
  const other={id:'task-b',scene:{}};
  const values=new Map([
    ['tk_task_task-a',JSON.stringify(original)],
    ['tk_forces_task-a','[{"name":"old answer"}]'],
    ['tk_forces_task-b','[{"name":"keep"}]'],
    ['tk_snapChecklistOverride_task-a','{"snapEnabled":false}']
  ]);
  const listeners=new Map();
  const warnings=[],errors=[],alerts=[],controls=new Map();
  let clears=0,displays=0,helpDraws=0;
  const window={
    currentTask:original,currentTaskIndex:0,tasks:[original,other],TASKS:[original,other],
    taskScores:{'task-a':{score:1},'task-b':{score:2}},
    taskComments:{'task-a':{comment:'old'}},
    settings:{},sceneModel:{migrateCirclesToEllipses(){}},
    buildAllScenePoints:()=>({}),updateAppState(){},
    getTaskSnapChecklist:()=>({snapEnabled:true,guidelinesEnabled:true,showForceCoordinates:false}),
    getTaskPositionLabel:()=> 'Oppgave 1',updateHelpPanelLayout(){}
  };
  class ForcesManager{
    constructor(){this.forces=[];}
    syncInputs(){}
  }
  class Force{
    updateDirectionAndLength(){}
  }
  window.fm=new ForcesManager();
  window.fm.forces.push({
    anchor:[10,20],arrowBase:[10,20],arrowTip:[30,40],name:'Drawn answer',
    moveable:true,isExpected:true
  });
  const context=vm.createContext({
    window,console:{warn:(...args)=>warnings.push(args),error:(...args)=>errors.push(args)},
    document:{getElementById:id=>controls.get(id)||null,
      addEventListener:(name,fn)=>listeners.set(name,fn)},
    localStorage:{
      getItem:key=>values.get(key)??null,
      setItem:(key,value)=>values.set(key,String(value)),
      removeItem:key=>values.delete(key)
    },
    ForcesManager,Force,inputsContainer:{innerHTML:''},snapping:{buildSnapPoints:()=>[]},
    buildSceneLookup:()=>({}),ensureInputMeta(){},
    seedInitialForces:task=>window.fm.forces.push(...task.initialForces),
    clearFeedback:()=>{clears++;},updateUserDisplay:()=>{displays++;},
    drawHelpLinesCanvas:()=>{helpDraws++;},alert:message=>alerts.push(message)
  });
  const start=source.indexOf('  function snapChecklistOverrideKey(taskId){');
  const end=source.indexOf('  // Save current task to localStorage',start);
  assert.ok(start>=0&&end>start);
  vm.runInContext(source.slice(start,end),context);
  const saveStart=source.indexOf('  window.saveTaskForces = function saveTaskForces(){');
  const saveEnd=source.indexOf('\n  };',saveStart)+5;
  assert.ok(saveStart>=0&&saveEnd>saveStart);
  vm.runInContext(source.slice(saveStart,saveEnd),context);
  const press=(options={})=>{
    const event={key:'r',ctrlKey:true,preventDefault(){this.defaultPrevented=true;},...options};
    listeners.get('keydown')(event);
    return event;
  };
  return {window,values,press,warnings,errors,alerts,controls,
    counts:()=>({clears,displays,helpDraws})};
}

test('Ctrl+R reloads editor definition and preserves currently drawn forces',()=>{
  const s=setup();
  const updated={id:'task-a',title:'Updated',scene:{points:[{name:'P'}]},
    initialForces:[{name:'G'}],expectedForces:[{name:'N'}],help_lines:['New help'],
    snapChecklist:{snapEnabled:true},comment:'Private editor note'};
  const serialized=JSON.stringify(updated);
  s.values.set('editor_task_task-a',serialized);
  s.values.set('tk_taskOrder','["task-a","task-b"]');
  const title={textContent:''};
  s.controls.set('help-title',title);
  s.controls.set('help-panel',{classList:{contains:()=>false}});
  const event=s.press();
  assert.equal(event.defaultPrevented,true);
  assert.equal(s.window.currentTask.title,'Updated');
  assert.equal(s.window.currentTask.comment,undefined);
  assert.equal(s.window.fm.forces[0].name,'G');
  const drawn=s.window.fm.forces.find(force=>force.name==='Drawn answer');
  assert.ok(drawn);
  assert.deepEqual(Array.from(drawn.anchor),[10,20]);
  assert.deepEqual(Array.from(drawn.arrowBase),[10,20]);
  assert.deepEqual(Array.from(drawn.arrowTip),[30,40]);
  assert.equal(s.window.tasks[0].title,'Updated');
  assert.equal(s.window.TASKS[0].title,'Updated');
  assert.equal(s.window.tasks[1].id,'task-b');
  assert.equal(s.values.get('tk_taskOrder'),'["task-a","task-b"]');
  assert.equal(s.values.get('editor_task_task-a'),serialized);
  assert.equal(JSON.parse(s.values.get('tk_task_task-a')).title,'Updated');
  assert.equal(JSON.parse(s.values.get('tk_forces_task-a'))[0].name,'Drawn answer');
  assert.equal(s.values.has('tk_snapChecklistOverride_task-a'),false);
  assert.equal(s.values.get('tk_forces_task-b'),'[{"name":"keep"}]');
  assert.deepEqual(JSON.parse(s.values.get('tk_taskScores')),{'task-b':{score:2}});
  assert.equal(s.window.taskComments['task-a'],undefined);
  assert.equal(title.textContent,'Oppgave 1: Updated');
  assert.deepEqual(s.counts(),{clears:1,displays:1,helpDraws:1});
  assert.equal(s.errors.length,0);
});

test('missing editor match preserves normal browser reload and all player data',()=>{
  const s=setup(),before=[...s.values];
  s.values.set('editor_task_task-b','{"id":"task-b","scene":{}}');
  const event=s.press();
  assert.notEqual(event.defaultPrevented,true);
  assert.equal(s.window.currentTask.title,'Old');
  assert.deepEqual([...s.values].slice(0,before.length),before);
  assert.equal(s.warnings.length,1);
  assert.deepEqual(s.counts(),{clears:0,displays:0,helpDraws:0});
});

test('invalid editor data reports an error without changing task or answers',()=>{
  for(const saved of ['{broken','null','[]','{"id":"other","scene":{}}',
    '{"id":"task-a"}','{"id":"task-a","scene":[]}']){
    const s=setup();
    s.values.set('editor_task_task-a',saved);
    const before=[...s.values];
    assert.equal(s.press().defaultPrevented,true);
    assert.deepEqual([...s.values],before);
    assert.equal(s.window.currentTask.title,'Old');
    assert.equal(s.errors.length,1);
    assert.equal(s.alerts.length,1);
  }
});

test('only plain Ctrl+R or Cmd+R invokes editor reload',()=>{
  for(const options of [{key:'x'},{ctrlKey:false},{shiftKey:true},{altKey:true},
    {defaultPrevented:true},{repeat:true}]){
    const s=setup();
    s.values.set('editor_task_task-a','{"id":"task-a","scene":{},"initialForces":[]}');
    s.press(options);
    assert.equal(s.window.currentTask.title,'Old');
    assert.equal(s.errors.length,0);
  }
  const s=setup();
  s.values.set('editor_task_task-a','{"id":"task-a","scene":{},"initialForces":[]}');
  assert.equal(s.press({key:'R',ctrlKey:false,metaKey:true}).defaultPrevented,true);
  assert.deepEqual(Array.from(s.window.currentTask.help_lines),[]);
});
