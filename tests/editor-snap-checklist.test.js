const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const editorSource=fs.readFileSync(path.join(root,'web','editor.js'),'utf8');

function setup(task){
  const coordinates={checked:false};
  const edited=[];
  const activeClasses=new Set();
  const guidelineButton={classList:{toggle:(name,active)=>active?activeClasses.add(name):activeClasses.delete(name)}};
  const window={currentTask:task,settings:{show_force_coordinates:false},enableGuidelines:true,
    getTaskSnapChecklist:null};
  const context=vm.createContext({
    window,
    document:{getElementById:id=>({
      'settings-show-force-coordinates':coordinates,
      'btn-guidelines':guidelineButton
    })[id]||null},
    markEdited:(...changes)=>edited.push(changes)
  });
  vm.runInContext(fs.readFileSync(path.join(root,'web','shared.js'),'utf8'),context);
  window.getTaskSnapChecklist=context.window.getTaskSnapChecklist;
  const start=editorSource.indexOf('  function syncGuidelinesButton(){');
  const end=editorSource.indexOf('\n  function loadTask(index){',start);
  assert.ok(start>=0&&end>start,'editor checklist helpers are present');
  vm.runInContext(editorSource.slice(start,end),context);
  return {context,window,coordinates,edited,activeClasses};
}

test('editor checklist is authoritative and synchronizes the settings checkbox on task changes',()=>{
  const first={id:'first',scene:{},snapChecklist:{showForceCoordinates:true}};
  const s=setup(first);
  s.context.applyTaskSnapChecklist(first);
  assert.equal(s.window.settings.show_force_coordinates,true);
  assert.equal(s.coordinates.checked,true);
  assert.equal(s.activeClasses.has('btn-active'),true);

  const second={id:'second',scene:{},snapChecklist:{guidelinesEnabled:false,showForceCoordinates:false}};
  s.window.currentTask=second;
  s.context.applyTaskSnapChecklist(second);
  assert.equal(s.window.settings.show_force_coordinates,false);
  assert.equal(s.coordinates.checked,false);
  assert.equal(s.activeClasses.has('btn-active'),false);
});

test('changing force-coordinate settings updates the current task checklist, not global settings',()=>{
  const task={id:'task-a',scene:{},snapChecklist:{snapEnabled:false,showForceCoordinates:false}};
  const s=setup(task);
  s.context.applyTaskSnapChecklist(task);
  s.context.setTaskShowForceCoordinates(true);

  assert.equal(task.snapChecklist.showForceCoordinates,true);
  assert.equal(task.snapChecklist.snapEnabled,false);
  assert.equal(s.window.settings.show_force_coordinates,true);
  assert.equal(s.coordinates.checked,true);
  assert.deepEqual(s.edited,[['task']]);
});

test('editor labels scene-handle coordinates separately and applies the task checklist during load',()=>{
  const html=fs.readFileSync(path.join(root,'editor.html'),'utf8');
  assert.match(html,/Vis koordinater på sceneelementer/);
  assert.match(editorSource,/window\.currentTask = task;\s*}\s*applyTaskSnapChecklist\(window\.currentTask\);/);
});

test('taskset export includes only current checklist fields without changing stored tasks',()=>{
  const task={id:'export-task',scene:{},snapChecklist:{snapMatchXY:true,removedOption:true}};
  const s=setup(task);
  s.window.tasks=[task];
  s.window.confirmAuthorExport=()=>true;
  s.window.AppVersioning={time:()=> 'test'};
  let exportTasks;
  let exported;
  Object.assign(s.context,{
    tasksetExportBtn:{addEventListener:(event,handler)=>{exportTasks=handler;}},
    getSelectedTaskIds:()=>[task.id],relationsModal:null,autoSave:()=>{},
    localStorage:{getItem:()=>null},
    tasksetNameInput:{value:'Default'},tasksetResultDiv:{style:{}},tasksetReportDiv:{},
    Blob:class {constructor(parts){exported=parts.join('');}},
    URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},
    document:{
      createElement:()=>({click:()=>{}}),
      body:{appendChild:()=>{},removeChild:()=>{}}
    }
  });
  const start=editorSource.indexOf('  if (tasksetExportBtn) {');
  const end=editorSource.indexOf('  // ===== IMPORTER:',start);
  assert.ok(start>=0 && end>start);
  vm.runInContext(editorSource.slice(start,end),s.context);
  exportTasks();
  const checklist=JSON.parse(exported).tasks[0].snapChecklist;
  assert.equal(checklist.snapMatchXY,true);
  assert.equal(Object.hasOwn(checklist,'removedOption'),false);
  assert.deepEqual(Object.keys(checklist).sort(),Object.keys(s.window.getSnapChecklistDefaults()).sort());
  assert.equal(task.snapChecklist.removedOption,true);
});
