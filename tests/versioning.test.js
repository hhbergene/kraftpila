const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'..','web','shared.js'),'utf8');

function setup(){
  const elements=[];
  const storage=new Map();
  const window={PLAYER_BUILD_TIME:'2026-10-22 12:59',EDITOR_BUILD_TIME:'2026-10-22 12:59',
    tasks:[{id:'first'},{id:'second'}],currentTaskIndex:1};
  const document={createElement(){
    const element={children:[],listeners:{},style:{},appendChild(child){this.children.push(child);},
      addEventListener(name,handler){this.listeners[name]=handler;},remove(){this.removed=true;}};
    elements.push(element);
    return element;
  },body:{appendChild(element){this.modal=element;}}};
  const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,
    setItem:(key,value)=>storage.set(key,String(value)),
    removeItem:key=>storage.delete(key),
    get length(){return storage.size;},
    key:index=>Array.from(storage.keys())[index]};
  const context={window,document,localStorage,console,Math,Promise,Object,Array,String,JSON,Set,Map};
  vm.runInNewContext(source,context);
  return {window,document,localStorage,elements};
}

test('task position labels are based on current list order',()=>{
  const {window}=setup();
  assert.equal(window.getTaskPositionLabel(window.tasks[1]),'Oppgave 2');
});

test('scene-panel title editing updates only the shared title and refreshes the task UI',()=>{
  const uiSource=fs.readFileSync(path.join(__dirname,'..','web','ui.js'),'utf8');
  const start=uiSource.indexOf('  // Task metadata fields (Id, Title, Category)');
  const end=uiSource.indexOf('  // Origin (one per task)',start);
  const snippet=uiSource.slice(start,end);
  const titleInput={value:'Ny tittel',addEventListener(event,handler){this.change=handler;}};
  const subtitleInput={value:'',addEventListener(){}};
  const categoryInput={value:'',addEventListener(){}};
  const editor={style:{},querySelector(selector){
    if(selector==='#task-title-input') return titleInput;
    if(selector==='#task-subtitle-input') return subtitleInput;
    if(selector==='#task-category-input') return categoryInput;
  }};
  const task={id:'task-a',title:'Gammel tittel',taskTitle:'Ignoreres',scene:{}};
  const listTask={...task};
  const calls=[];
  const window={currentTask:task,currentTaskIndex:0,tasks:[listTask],
    markEdited:kind=>calls.push(kind),updateTaskOrderList:()=>calls.push('order')};
  const context={window,document:{createElement:()=>editor},
    scenePanel:{appendChild(){}},scene:{},updateHelpButton:()=>calls.push('header')};
  vm.runInNewContext(`(function(scenePanel,scene){${snippet}})`,context)(context.scenePanel,context.scene);
  titleInput.value='Ny tittel';
  titleInput.change();
  assert.equal(task.title,'Ny tittel');
  assert.equal(listTask.title,'Ny tittel');
  assert.equal(task.taskTitle,'Ignoreres');
  assert.deepEqual(calls,['task','header','order']);
});

test('help description title editing writes the same title to the current task and list',()=>{
  const editorSource=fs.readFileSync(path.join(__dirname,'..','web','editor.js'),'utf8');
  const start=editorSource.indexOf("  const helpTitleInput = document.getElementById('help-title-input');");
  const end=editorSource.indexOf('  // Solution forces removed',start);
  const snippet=editorSource.slice(start,end);
  const titleInput={value:'Endret fra beskrivelsen',addEventListener(event,handler){this.input=handler;}};
  const sceneTitleInput={value:'Før'};
  const current={id:'task-a',title:'Før'};
  const listed={id:'task-a',title:'Før'};
  const calls=[];
  const window={currentTask:current,tasks:[listed],updateTaskHeader:()=>calls.push('header'),
    updateTaskOrderList:()=>calls.push('order')};
  const context={window,document:{getElementById:id=>id==='help-title-input'?titleInput:id==='task-title-input'?sceneTitleInput:null},
    markEdited:kind=>calls.push(kind)};
  vm.runInNewContext(snippet,context);
  titleInput.input();
  assert.equal(current.title,titleInput.value);
  assert.equal(listed.title,titleInput.value);
  assert.equal(sceneTitleInput.value,titleInput.value);
  assert.deepEqual(calls,['task','header','order']);
});

test('version warning lists paths and removes unsupported fields only after approval',async()=>{
  const {window,document,elements}=setup();
  const schema=[{id:'task-a',title:'Oppgave',scene:{points:[{x:1,y:2}]}}];
  const imported={tasks:[{id:'task-a',title:'Oppgave eldre',legacyField:7,
    scene:{points:[{x:3,y:4,oldCoordinate:9}]}}],metadata:{appVersion:'2025-01-01 09:00'}};
  const pending=window.AppVersioning.checkImport(imported,'editor','gammelt.json',schema);
  const button=elements.find(element=>element.textContent==='Åpne uansett');
  assert.ok(button,'warning has an explicit continue action');
  assert.match(document.body.modal.children[0].innerHTML,/\$\.tasks\[0\]\.legacyField/);
  assert.match(document.body.modal.children[0].innerHTML,/\$\.tasks\[0\]\.scene\.points\[0\]\.oldCoordinate/);
  button.listeners.click();
  const result=await pending;
  assert.equal(Object.hasOwn(result.data.tasks[0],'legacyField'),false);
  assert.equal(Object.hasOwn(result.data.tasks[0].scene.points[0],'oldCoordinate'),false);
  assert.equal(result.data.tasks[0].scene.points[0].x,3);
  assert.equal(result.data.metadata.appVersion,'2025-01-01 09:00');
});

test('outdated localStorage stays untouched until approval and is filtered afterward',async()=>{
  const {window,localStorage,elements}=setup();
  const saved={id:'task-a',title:'Lagret',scene:{points:[]},obsolete:{value:1}};
  localStorage.setItem('tk_app_version','2025-01-01 09:00');
  localStorage.setItem('tk_task_task-a',JSON.stringify(saved));
  localStorage.setItem('tk_taskOrder',JSON.stringify(['task-a','removed-task']));
  const schema=[{id:'task-a',title:'Oppgave',scene:{points:[]}}];
  const pending=window.AppVersioning.checkStorage('player',schema);
  assert.equal(JSON.parse(localStorage.getItem('tk_task_task-a')).obsolete.value,1);
  assert.equal(localStorage.getItem('tk_app_version'),'2025-01-01 09:00');
  const button=elements.find(element=>element.textContent==='Åpne uansett');
  assert.ok(button);
  button.listeners.click();
  await pending;
  const filtered=JSON.parse(localStorage.getItem('tk_task_task-a'));
  assert.equal(Object.hasOwn(filtered,'obsolete'),false);
  assert.deepEqual(JSON.parse(localStorage.getItem('tk_taskOrder')),['task-a']);
  assert.equal(localStorage.getItem('tk_app_version'),window.PLAYER_BUILD_TIME);
});
