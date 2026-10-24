const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const mainSource=fs.readFileSync(path.join(root,'web','main.js'),'utf8');

function setup(task){
  const values=new Map();
  const controls=new Map();
  const window={currentTask:task,settings:{show_force_coordinates:false},enableSnap:true,enableGuidelines:true,
    getTaskSnapChecklist:null,getSnapChecklistDefaults:null,updateAppState(){}};
  const document={getElementById:id=>controls.get(id)||null};
  const context=vm.createContext({
    window,document,console,
    localStorage:{
      getItem:key=>values.get(key)||null,
      setItem:(key,value)=>values.set(key,String(value)),
      removeItem:key=>values.delete(key)
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root,'web','shared.js'),'utf8'),context);
  window.getTaskSnapChecklist=context.window.getTaskSnapChecklist;
  window.getSnapChecklistDefaults=context.window.getSnapChecklistDefaults;
  const start=mainSource.indexOf('  function snapChecklistOverrideKey(taskId){');
  const end=mainSource.indexOf('\n  function loadTask(index){',start);
  assert.ok(start>=0&&end>start,'snap checklist runtime helpers are present');
  vm.runInContext(mainSource.slice(start,end),context);
  return {context,window,values,controls};
}

test('player applies checklist defaults for legacy tasks and overlays per-task overrides',()=>{
  const task={id:'legacy-task',scene:{plane:{t_vec:[0.8,-0.6]}}};
  const s=setup(task);
  const snap={checked:false},guidelines={checked:false},coordinates={checked:true};
  s.controls.set('settings-snap',snap);
  s.controls.set('settings-guidelines',guidelines);
  s.controls.set('settings-show-force-coordinates',coordinates);
  s.context.applySnapChecklist(task);
  assert.equal(s.window.enableSnap,true);
  assert.equal(s.window.enableGuidelines,true);
  assert.equal(s.window.settings.show_force_coordinates,false);
  assert.equal(s.window.currentSnapChecklist.snapComponentToLength,true);
  assert.deepEqual([snap.checked,guidelines.checked,coordinates.checked],[true,true,false]);

  s.values.set('tk_snapChecklistOverride_legacy-task',JSON.stringify({
    snapEnabled:false,guidelinesEnabled:false,showForceCoordinates:true,snapCrossAxisComponents:true
  }));
  s.context.applySnapChecklist(task);
  assert.equal(s.window.enableSnap,false);
  assert.equal(s.window.enableGuidelines,false);
  assert.equal(s.window.settings.show_force_coordinates,true);
  assert.equal(s.window.currentSnapChecklist.snapCrossAxisComponents,true);
  assert.deepEqual([snap.checked,guidelines.checked,coordinates.checked],[false,false,true]);
});

test('player saves override separately from task definition and updates settings controls',()=>{
  const task={id:'task-a',scene:{plane:{angleDeg:0}}};
  const s=setup(task);
  const control=(checked=false)=>({checked});
  s.controls.set('settings-snap',control());
  s.controls.set('settings-guidelines',control());
  s.controls.set('settings-show-force-coordinates',control());
  s.context.applySnapChecklist(task);
  s.context.saveSnapChecklistOverride({
    ...s.window.currentSnapChecklist,
    snapEnabled:false,
    guidelinesEnabled:false,
    showForceCoordinates:true
  });
  assert.equal(s.values.has('tk_snapChecklistOverride_task-a'),true);
  assert.equal(JSON.parse(s.values.get('tk_snapChecklistOverride_task-a')).snapEnabled,false);
  assert.equal(task.snapChecklist,undefined);
  assert.equal(s.window.enableSnap,false);
  assert.equal(s.window.enableGuidelines,false);
  assert.equal(s.window.settings.show_force_coordinates,true);
  assert.deepEqual(
    [s.controls.get('settings-snap').checked,s.controls.get('settings-guidelines').checked,
      s.controls.get('settings-show-force-coordinates').checked],
    [false,false,true]
  );
});
