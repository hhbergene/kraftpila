const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'..','web','shared.js'),'utf8');

test('page titles show the generated build time and prefer page-specific versions',()=>{
  const root=path.join(__dirname,'..');
  const versionSource=fs.readFileSync(path.join(root,'web','version.js'),'utf8');
  for(const [file,versionKey] of [['index.html','PLAYER_BUILD_TIME'],['editor.html','EDITOR_BUILD_TIME']]){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    const title=html.match(/<title>(.*?)<\/title>/)[1];
    const titleScript=Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))
      .map(match=>match[1]).find(script=>script.includes('document.title'));
    assert.ok(titleScript,`${file} updates its title`);
    assert.ok(html.indexOf('src="web/version.js"')<html.indexOf(titleScript));
    for(const mode of ['generated','page-specific','missing']){
      const window={};
      const document={title};
      const context={window,document};
      if(mode!=='missing') vm.runInNewContext(versionSource,context);
      if(mode==='page-specific') window[versionKey]='2026-10-23 13:56';
      vm.runInNewContext(titleScript,context);
      const expected=mode==='missing' ? title : `${title} (${window[versionKey] || window.BUILD_TIME})`;
      assert.equal(document.title,expected,`${file}: ${mode}`);
      if(mode==='generated') assert.ok(window.BUILD_TIME,'generated version is defined');
    }
  }
});

function setup(){
  const elements=[];
  const storage=new Map();
  const confirmations=[];
  const alerts=[];
  const window={PLAYER_BUILD_TIME:'2026-10-22 12:59',EDITOR_BUILD_TIME:'2026-10-22 12:59',
    TASKSET_FORMAT_VERSION:2,
    tasks:[{id:'first'},{id:'second'}],currentTaskIndex:1,
    confirm:message=>{confirmations.push(message);return true;},
    alert:message=>alerts.push(message)};
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
  const context={window,document,localStorage,console,Math,Promise,Object,Array,String,JSON,Set,Map,encodeURI};
  vm.runInNewContext(source,context);
  return {window,document,localStorage,elements,context,confirmations,alerts};
}

test('task schema loads the default set once without requesting the removed Intro file',async()=>{
  const {window,context}=setup();
  const requests=[];
  context.fetch=async file=>{
    requests.push(file);
    return {ok:true,json:async()=>file==='oppgavesett.json'
      ? [{name:'Intro',file:'taskset_Default.json'}]
      : {metadata:{tasksetVersion:2},tasks:[{id:'default-task',title:'Default',scene:{planes:[]}}]}};
  };
  const tasks=await window.loadSupportedTaskSchema();
  assert.deepEqual(requests,['oppgavesett.json','taskset_Default.json']);
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].id,'default-task');
});

test('task position labels are based on current list order',()=>{
  const {window}=setup();
  assert.equal(window.getTaskPositionLabel(window.tasks[1]),'Oppgave 2');
});

test('help window retains task title while the toolbar shows only task number',()=>{
  const uiSource=fs.readFileSync(path.join(__dirname,'..','web','ui.js'),'utf8');
  const start=uiSource.indexOf('function updateHelpButton(){');
  const end=uiSource.indexOf('window.updateTaskHeader = updateHelpButton;',start);
  for(const editorMode of [false,true]){
    const span={textContent:''};
    const helpTitle={textContent:''};
    const titleInput=editorMode ? {value:''} : null;
    const window={currentTask:{id:'second',title:'Tittel i hjelpevinduet'},currentTaskIndex:1,
      getTaskPositionLabel:()=> 'Oppgave 2',taskScores:{}};
    const document={getElementById(id){
      if(id==='btn-help') return {querySelector:()=>span};
      if(id==='help-title') return helpTitle;
      if(id==='help-title-input') return titleInput;
      return null;
    }};
    vm.runInNewContext(`${uiSource.slice(start,end)};updateHelpButton();`,{window,document});
    assert.equal(span.textContent,'Oppgave 2');
    if(editorMode){
      assert.equal(helpTitle.textContent,'Oppgave 2');
      assert.equal(titleInput.value,window.currentTask.title);
    }else{
      assert.equal(helpTitle.textContent,'Oppgave 2: Tittel i hjelpevinduet');
    }
  }
});

test('scene-panel title editing updates only the shared title and refreshes the task UI',()=>{
  const uiSource=fs.readFileSync(path.join(__dirname,'..','web','ui.js'),'utf8');
  const start=uiSource.indexOf('  // Task metadata fields (Id, Title, Category)');
  const end=uiSource.indexOf("  addGroup('Plan'",start);
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
    scene:{planes:[],points:[{id:'point-1',x:3,y:4,oldCoordinate:9}]}}],
    metadata:{appVersion:'2025-01-01 09:00',tasksetVersion:2}};
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

test('version filtering preserves optional force roles and supplied fields without requiring them in old tasks',async()=>{
  const {window,document,elements}=setup();
  const reference=[{id:'task',expectedForces:[{name:'G'}],initialForces:[{name:'N'}]}];
  const force={name:'G_x',role:'component',componentOf:'G',studentGiven:{name:true}};
  const data={tasks:[{id:'task',expectedForces:[force,{name:'G'}],
    initialForces:[{name:'N',role:'force',studentGiven:{role:false}}],
    scene:{planes:[]}}],metadata:{appVersion:'old',tasksetVersion:2}};
  const pending=window.AppVersioning.checkImport(data,'editor','test.json',reference);
  assert.doesNotMatch(document.body.modal.children[0].innerHTML,/\.role|\.studentGiven|\.componentOf/);
  elements.find(element=>element.textContent==='Åpne uansett').listeners.click();
  const result=await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.tasks[0].expectedForces)),[force,{name:'G'}]);
  assert.equal(result.data.tasks[0].initialForces[0].studentGiven.role,false);
});

test('version filtering preserves scene groups without requiring them in the reference tasks',async()=>{
  const {window,document,elements}=setup();
  const group={description:'Ballen',members:[
    {type:'ellipse',id:'ellipse-1'},{type:'plane',id:'plane-1'}
  ]};
  const scene={planes:[{id:'plane-1'}],activePlaneId:'plane-1',ellipses:[{id:'ellipse-1'}]};
  const reference=[{id:'task',scene}];
  const data={tasks:[{id:'task',scene:{...scene,groups:[group]}}],metadata:{tasksetVersion:2}};
  const pending=window.AppVersioning.checkImport(data,'player','groups.json',reference);
  assert.doesNotMatch(document.body.modal.children[0].innerHTML,/scene\.groups/);
  elements.find(element=>element.textContent==='Åpne uansett').listeners.click();
  const result=await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.tasks[0].scene.groups)),[group]);
});

test('version filtering preserves optional relation tolerances without requiring overrides',async()=>{
  for(const referenceOverrides of [{},{tol_rel:0.15}]){
    const {window,document,elements}=setup();
    const relation={lhs:[{name:'G'}],rhs:[{name:'N'}],ratio:1};
    const reference=[{id:'task',scene:{planes:[]},relations:[{...relation,...referenceOverrides}]}];
    const relations=[{...relation,tol_rel:0,tol_abs:3},{...relation}];
    const data={tasks:[{id:'task',scene:{planes:[]},relations}],metadata:{appVersion:'old',tasksetVersion:2}};
    const pending=window.AppVersioning.checkImport(data,'editor','test.json',reference);
    assert.doesNotMatch(document.body.modal.children[0].innerHTML,/\.tol_rel|\.tol_abs/);
    elements.find(element=>element.textContent==='Åpne uansett').listeners.click();
    const result=await pending;
    assert.deepEqual(JSON.parse(JSON.stringify(result.data.tasks[0].relations)),relations);
  }
});

test('version filtering preserves automatic ratio mode and optional answer geometry',async()=>{
  const {window,document,elements}=setup();
  const relation={lhs:[{name:'A'}],rhs:[{name:'B'}]};
  const reference=[{id:'task',expectedForces:[{name:'A'}],
    scene:{planes:[]},relations:[{...relation,ratio:1}]}];
  const answer={name:'A',drawn:{anchor:[0,0],arrowBase:[0,0],arrowTip:[3,4]}};
  const data={tasks:[{id:'task',expectedForces:[answer],
    scene:{planes:[]},relations:[relation,{...relation,ratio:2}]}],metadata:{appVersion:'old',tasksetVersion:2}};
  const pending=window.AppVersioning.checkImport(data,'editor','test.json',reference);
  assert.doesNotMatch(document.body.modal.children[0].innerHTML,/\.ratio|\.drawn/);
  elements.find(element=>element.textContent==='Åpne uansett').listeners.click();
  const result=await pending;
  const imported=JSON.parse(JSON.stringify(result.data.tasks[0]));
  assert.deepEqual(imported.expectedForces[0],answer);
  assert.deepEqual(imported.relations,[relation,{...relation,ratio:2}]);
});

test('full reset from the storage warning clears only this mode and loads current defaults',async()=>{
  const {window,localStorage,elements,confirmations}=setup();
  localStorage.setItem('tk_app_version','2025-01-01 09:00');
  localStorage.setItem('tk_task_task-a',JSON.stringify({id:'task-a'}));
  localStorage.setItem('tk_taskOrder','["task-a"]');
  localStorage.setItem('editor_task_other',JSON.stringify({id:'other'}));
  localStorage.setItem('unrelated-site-key','preserve');
  let prepared=false;
  const schema=[{id:'task-default',title:'Ny oppgave'}];
  const pending=window.AppVersioning.checkStorage('player',schema,()=>{prepared=true;});
  const reset=elements.find(element=>element.textContent==='Full reset');
  assert.ok(reset,'storage warning offers Full reset');
  reset.listeners.click();

  assert.equal(await pending,true);
  assert.equal(confirmations.length,1);
  assert.match(confirmations[0],/sletter alle lokale elevmodus-data/);
  assert.equal(prepared,false,'full reset skips migration of the outdated stored tasks');
  assert.equal(localStorage.getItem('tk_task_task-a'),null);
  assert.equal(localStorage.getItem('tk_taskOrder'),null);
  assert.equal(localStorage.getItem('tk_app_version'),window.PLAYER_BUILD_TIME);
  assert.equal(localStorage.getItem('editor_task_other'),'{"id":"other"}');
  assert.equal(localStorage.getItem('unrelated-site-key'),'preserve');
});

test('cancelling full reset leaves storage unchanged and warning open',async()=>{
  const {window,document,localStorage,elements}=setup();
  window.confirm=()=>false;
  localStorage.setItem('tk_app_version','2025-01-01 09:00');
  localStorage.setItem('tk_task_task-a',JSON.stringify({id:'task-a'}));
  const pending=window.AppVersioning.checkStorage('player',[{id:'task-a'}]);
  let settled=false;
  pending.then(()=>{settled=true;});
  const reset=elements.find(element=>element.textContent==='Full reset');
  reset.listeners.click();
  await Promise.resolve();

  assert.equal(settled,false,'the warning remains available after cancelling confirmation');
  assert.equal(localStorage.getItem('tk_app_version'),'2025-01-01 09:00');
  assert.equal(localStorage.getItem('tk_task_task-a'),'{"id":"task-a"}');
  assert.equal(document.body.modal.removed,undefined);
});
