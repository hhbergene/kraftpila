const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'..','web','editor.js'),'utf8');

function setupDefaultTasks(savedTasks=[]){
  const schema=[{id:'default-a',title:'Default',scene:{points:[{x:1,y:2}]}},{id:'default-b'}];
  const storage=new Map([['tk_task_player','untouched']]);
  const window={tasks:[],currentTaskSchema:schema,settings:{},rememberUndoSelection(){}};
  const context={window,JSON,console,parseInt,
    localStorage:{getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,value),
      removeItem:key=>storage.delete(key),get length(){return storage.size;},key:i=>Array.from(storage.keys())[i]},
    queueStorage:(key,value)=>storage.set(key,JSON.stringify(value)),
    loadSavedTasks:()=>{window.tasks=JSON.parse(JSON.stringify(savedTasks));},
    loadTaskOrder(){},migrateLegacyTasks(){},resetUndo(){},
    loadTask:index=>{window.currentTask=window.tasks[index];},
    autoSave(){},cancelAutoSave(){},recordUndo(){},updateUserDisplay(){},updateScenePanel(){},
    confirm:()=>true,alert(){},document:{getElementById:()=>null}};
  window.loadSupportedTaskSchema=async()=>schema;
  window.AppVersioning={checkStorage:async()=>true};
  const start=source.indexOf('  function restoreDefaultTasks(){');
  const end=source.indexOf('  // ===== Mouse interaction for forces =====',start);
  return {window,storage,context,schema,initialize:()=>vm.runInNewContext(source.slice(start,end),context)};
}

test('fresh editor loads and persists independent copies of the default tasks',async()=>{
  const {window,storage,schema,initialize}=setupDefaultTasks();
  await initialize();
  assert.equal(window.tasks.length,2);
  assert.equal(window.currentTask.id,'default-a');
  assert.deepEqual(JSON.parse(storage.get('editor_taskOrder')),['default-a','default-b']);
  assert.deepEqual(JSON.parse(storage.get('editor_savedTasks')),['default-a','default-b']);
  assert.equal(JSON.parse(storage.get('editor_task_default-a')).title,'Default');
  window.currentTask.scene.points[0].x=99;
  assert.equal(schema[0].scene.points[0].x,1);
});

test('editor startup preserves an existing saved taskset instead of adding defaults',async()=>{
  const {window,initialize}=setupDefaultTasks([{id:'custom-task',title:'Custom'}]);
  await initialize();
  assert.deepEqual(window.tasks.map(task=>task.id),['custom-task']);
});

test('full reset restores pristine defaults and leaves player storage untouched',async()=>{
  const {window,storage,context,initialize}=setupDefaultTasks();
  await initialize();
  window.tasks=[{id:'custom-task'}];
  window.currentTask=window.tasks[0];
  storage.set('editor_task_custom-task','{}');
  const start=source.indexOf('  function performFullReset(){');
  const end=source.indexOf('  // Wire reset button',start);
  vm.runInNewContext(`${source.slice(start,end)};performFullReset();`,context);
  assert.deepEqual(Array.from(window.tasks,task=>task.id),['default-a','default-b']);
  assert.equal(window.currentTask.id,'default-a');
  assert.equal(storage.has('editor_task_custom-task'),false);
  assert.equal(storage.get('tk_task_player'),'untouched');
  assert.deepEqual(JSON.parse(storage.get('editor_taskOrder')),['default-a','default-b']);
});

test('renaming an editor force preserves its spec and updates both sides of saved relations',()=>{
  const start=source.indexOf('  window.renameEditorForce =');
  const end=source.indexOf('  // Create/update the task spec',start);
  const spec={name:'N',anchor:{type:'custom',pos:[0,0]},aliases:['normal']};
  const relation={lhs:[{name:'N',component:'horizontal'}],rhs:[{name:'n',component:'vertical'},{name:'G'}]};
  const force={name:'N'};
  const writes=new Map();
  const window={currentTask:{id:'task-a',relations:[relation]},
    getForceSpec:()=>({spec,prop:'anchor'})};
  vm.runInNewContext(source.slice(start,end),{window,queueStorage:(key,value)=>writes.set(key,value),markEdited(){}});
  window.renameEditorForce(force,'Normal');
  assert.equal(force.name,'Normal');
  assert.equal(spec.name,'Normal');
  assert.equal(spec.aliases[0],'normal');
  assert.equal(relation.lhs[0].name,'Normal');
  assert.equal(relation.rhs[0].name,'Normal');
  assert.equal(relation.rhs[1].name,'G');
  assert.equal(writes.get('editor_relations_task-a')[0].lhs[0].name,'Normal');
  window.renameEditorForce(force,'Normal2');
  assert.equal(relation.lhs[0].name,'Normal2');
});

test('each editor check synchronizes current forces and saves before full evaluation',()=>{
  const start=source.indexOf("      if(action === 'check'){");
  const end=source.indexOf('      // Clear feedback for any other toolbar action',start);
  const calls=[];
  const force={arrowBase:[0,0],arrowTip:[0,10],updateDirectionAndLength:()=>calls.push('geometry')};
  const window={currentTask:{id:'task-a'},fm:{forces:[force]},sceneModel:{update:()=>calls.push('scene')},
    syncSceneForceAnchors:()=>calls.push('anchors'),
    syncForceSpec:(f,options)=>{assert.equal(options.redir,true);calls.push('spec');},
    runEvaluation:()=>calls.push('evaluate')};
  const context={window,action:'check',markEdited:()=>calls.push('edited'),
    autoSave:()=>calls.push('save'),console};
  const check=vm.runInNewContext(`(function(){${source.slice(start,end)}})`,context);
  check();
  check();
  assert.deepEqual(calls,['scene','anchors','geometry','spec','edited','save','evaluate',
    'scene','anchors','geometry','spec','edited','save','evaluate']);
});
