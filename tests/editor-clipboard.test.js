const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname,'..');
const read = file=>fs.readFileSync(path.join(root,'web',file),'utf8');
const editor = read('editor.js');
const plain = value=>JSON.parse(JSON.stringify(value));

class Element {
  constructor(){
    this.children=[];
    this.listeners={};
    this.classes=new Set(['hidden']);
    this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),
      contains:c=>this.classes.has(c)};
    this.textContent='';
  }
  addEventListener(type,fn){ (this.listeners[type] ||= []).push(fn); }
  fire(type,extras={}){
    const event={target:this,key:'',preventDefault(){this.defaultPrevented=true;},...extras};
    for(const fn of this.listeners[type] || []) fn(event);
    return event;
  }
  closest(){ return null; }
  querySelectorAll(){ return []; }
  querySelector(){ return null; }
  replaceChildren(){ this.children=[]; }
  appendChild(child){ this.children.push(child); }
}

function setup(){
  const nodes={};
  const document=new Element();
  document.getElementById=id=>nodes[id] ||= new Element();
  document.createElement=()=>new Element();
  document.querySelector=()=>null;
  const storage=new Map();
  const localStorage={getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,value),
    removeItem:key=>storage.delete(key)};
  const window={editorMode:true,activePanel:'scene',sceneEditor:{cancel(){}},tasks:[]};
  const layouts=[];
  const context=vm.createContext({window,document,console,localStorage,
    setTimeout:()=>1,clearTimeout(){},setupFloatingPanelPositioning:(...args)=>layouts.push(args),
    markEdited:(...args)=>window.markEdited(...args),collectHelpLines(){},
    normalizeTaskMeta:task=>task,loadTask:index=>load(index)});
  for(const file of ['shared.js','force_notation.js','geometry.js','scene_render.js','scene_model.js','forces.js','forcesManager.js']){
    vm.runInContext(read(file),context);
  }
  context.Force=window.Force;
  context.geometry=window.geometry;
  vm.runInContext(editor.slice(editor.indexOf('  window.getForceSpec ='),
    editor.indexOf('  window.renameEditorForce =')),context);
  vm.runInContext(editor.slice(editor.indexOf('  window.syncForceSpec ='),
    editor.indexOf('  // Setup editor for help_lines text')),context);
  vm.runInContext(editor.slice(editor.indexOf('  const AUTOSAVE_DELAY_MS'),
    editor.indexOf('  (function setupUndoUI()')),context);
  vm.runInContext(editor.slice(editor.indexOf('  function writeTask(){'),
    editor.indexOf('  // Load all saved tasks')),context);

  function task(scene={}){
    const t={id:`task-${window.tasks.length}`,scene,expectedForces:[],initialForces:[]};
    window.tasks.push(t);
    window.currentTaskIndex=window.tasks.length-1;
    window.currentTask=t;
    window.fm=new window.ForcesManager();
    return t;
  }
  function load(index){
    window.currentTaskIndex=index;
    window.currentTask=window.tasks[index];
    window.selectedSceneElement=null;
    window.fm=new window.ForcesManager();
    const saved=JSON.parse(localStorage.getItem('editor_forces_'+window.currentTask.id) || '[]');
    window.fm.forces=saved.map(data=>{
      const force=Object.assign(new window.Force(),data);
      force.updateDirectionAndLength();
      return force;
    });
    window.fm.ensureTrailingBlank();
    window.updateAppState();
  }
  window.updateAppState=()=>{
    window.sceneModel.update(window.currentTask);
    if(window.syncSceneForceAnchors(window.currentTask,window.fm,true)) window.markEdited('task','forces');
    window.fm.ensureTrailingBlank();
    window.editorClipboard?.refresh();
  };
  task();
  vm.runInContext(read('editor_clipboard.js'),context);
  const clipboard=window.editorClipboard;
  function select(type,index=0){
    window.activePanel='scene';
    window.selectedSceneElement={type,index};
  }
  function addForce(name='G',expected=true){
    const force=Object.assign(new window.Force(),{
      name,isExpected:expected,moveable:expected,anchor:[100,100],arrowBase:[110,100],arrowTip:[110,160]});
    force.updateDirectionAndLength();
    window.fm.forces.unshift(force);
    window.activePanel='force';
    window.fm.activeIndex=0;
    return force;
  }
  return {window,document,nodes,clipboard,select,addForce,task,load,storage,layouts,context};
}

test('accumulates deep independent scene copies, with no implicit forces or task metadata',()=>{
  const s=setup(), source=s.window.currentTask;
  source.scene.rects=[{bottomCenter:[100,100],width:80,height:40,color:'#123456',snapping:false}];
  s.addForce();
  s.select('rect');
  s.clipboard.copy();
  s.clipboard.copy();
  assert.equal(s.clipboard.entries.length,2);
  source.scene.rects[0].bottomCenter[0]=400;
  const exposed=s.clipboard.entries;
  exposed[0].data.width=1000;
  const target=s.task();
  s.clipboard.paste();
  assert.equal(target.scene.rects.length,2);
  assert.deepEqual(plain(target.scene.rects[0].bottomCenter),[100,100]);
  assert.deepEqual(plain(target.scene.rects[1].bottomCenter),[110,90]);
  assert.equal(target.scene.rects[0].width,80);
  assert.equal(target.scene.rects[0].snapping,false);
  assert.deepEqual(target.expectedForces,[]);
  assert.equal(target.scene.rects[0].color,'#123456');
  assert.equal(s.clipboard.entries.length,2);
});

test('Ctrl+C in an open group adds unique member copies once; Ctrl+V keeps normal paste behavior',()=>{
  const s=setup();
  const text={txt:'Grouped text',pos:[20,30]};
  const arrow={a:[100,100],b:[160,100]};
  s.window.currentTask.scene.texts=[text];
  s.window.currentTask.scene.arrows=[arrow];
  s.window.currentTask.scene.groups=[{description:'',members:[
    {type:'text',index:0},{type:'arrow',index:0},{type:'text',index:0}
  ]}];

  s.select('text');
  s.clipboard.copy();
  s.window.activeSceneGroupIndex=0;
  const copyEvent=s.document.fire('keydown',{ctrlKey:true,key:'c'});
  assert.equal(copyEvent.defaultPrevented,true);
  assert.deepEqual(Array.from(s.clipboard.entries,entry=>entry.type),['text','arrow']);
  assert.match(s.nodes['clipboard-status'].textContent,/1 sceneelement/);

  s.document.fire('keydown',{ctrlKey:true,key:'c'});
  assert.equal(s.clipboard.entries.length,2,
    're-copying the same group does not duplicate its existing clipboard entries');

  s.document.fire('keydown',{ctrlKey:true,key:'v'});
  assert.equal(s.window.currentTask.scene.texts.length,2);
  assert.equal(s.window.currentTask.scene.arrows.length,2);
  assert.deepEqual(s.window.currentTask.scene.groups[0].members,
    [{type:'text',index:0},{type:'arrow',index:0},{type:'text',index:0}],
    'ordinary paste creates scene copies without implicitly changing group membership');
});

test('group clipboard copy preserves the single-plane clipboard rule across tasks',()=>{
  const s=setup();
  const first={through:[10,20],angleDeg:0};
  s.window.currentTask.scene.plane=first;
  s.select('plane');s.clipboard.copy();
  s.task({plane:{through:[100,200],angleDeg:0}});
  s.clipboard.copyGroup([{type:'plane'}]);
  assert.equal(s.clipboard.entries.length,1);
  assert.deepEqual(plain(s.clipboard.entries[0].data.through),[100,200]);
});

test('copied components retain role, parent and supplied fields through paste and undo/redo',()=>{
  const s=setup();
  const force=s.addForce('G_x');
  force.role=force.manualRole='component';
  force.componentOf='G';
  s.window.syncForceSpec(force);
  s.window.getForceSpec(force).spec.studentGiven={name:true,role:true};
  s.clipboard.copy();
  s.task();
  s.window.markEdited('task','forces');s.window.autoSave();s.window.recordUndo();
  s.clipboard.paste();
  const pasted=s.window.fm.forces.find(f=>f.name==='G_x');
  const spec=s.window.currentTask.expectedForces[0];
  assert.equal(pasted.role,'component');
  assert.equal(pasted.manualRole,'component');
  assert.equal(pasted.componentOf,'G');
  assert.deepEqual(plain(spec.studentGiven),{name:true,role:true});
  s.window.undo();
  assert.equal(s.window.currentTask.expectedForces.length,0);
  s.window.redo();
  assert.equal(s.window.fm.forces.find(f=>f.name==='G_x').role,'component');
  assert.equal(s.window.currentTask.expectedForces[0].studentGiven.name,true);
});

test('pasting a parent and component together remaps the component to the renamed parent',()=>{
  const s=setup();
  const parent=s.addForce('G');
  s.window.syncForceSpec(parent);
  s.clipboard.copy();
  const component=s.addForce('G_x');
  component.role=component.manualRole='component';
  s.window.syncForceSpec(component);
  s.clipboard.copy();
  s.clipboard.paste();
  const copiedParent=s.window.fm.forces.find(f=>f.name==='G_1');
  const copiedComponent=s.window.fm.forces.find(f=>f.name==='G_{x1}');
  assert.ok(copiedParent);
  assert.ok(copiedComponent);
  assert.equal(copiedComponent.componentOf,'G_1');
  const index=s.window.fm.forces.indexOf(copiedParent);
  assert.equal(s.window.fm.forces[index+1],copiedComponent);
});

test('naming before or after drawing uses exact anchor matches and otherwise keeps a free position',()=>{
  const s=setup(),task=s.window.currentTask;
  const nearby={type:'point',ref:'point-1',point:'center'};
  s.window.findSceneAnchorAtPosition=()=>null;
  s.window.findBestAnchor=()=>nearby;

  const namedAfterDraw=s.addForce('G');
  s.window.syncForceSpec(namedAfterDraw);
  const customAfter=plain(s.window.getForceSpec(namedAfterDraw).spec.anchor);

  const namedBeforeDraw=s.addForce('N');
  s.window.syncForceSpec(namedBeforeDraw,{reanchor:true});
  const customBefore=plain(s.window.getForceSpec(namedBeforeDraw).spec.anchor);

  assert.deepEqual(customAfter,{type:'custom',pos:[100,100]});
  assert.deepEqual(customBefore,customAfter);
  assert.equal(task.expectedForces.length,2);
  assert.equal(s.window.pendingForceAnchorPickerIndices,undefined,
    'a missing exact match does not open the anchor picker automatically');
});

test('exact anchor matches are retained for forces named before drawing',()=>{
  const s=setup();
  const force=s.addForce('G');
  const anchor={type:'segment',ref:'rect0',segment:'bottom'};
  s.window.findSceneAnchorAtPosition=()=>({anchor,pos:[100,100]});
  s.window.findBestAnchor=()=>{throw new Error('approximate matching must not run');};
  s.window.syncForceSpec(force,{reanchor:true});
  assert.deepEqual(plain(s.window.getForceSpec(force).spec.anchor),anchor);
  assert.deepEqual(Array.from(s.window.pendingForceAnchorPickerIndices),[0]);
});

test('all ordinary scene types preserve properties and only exactly coincident geometry shifts',()=>{
  const examples={
    rect:{bottomCenter:[100,100],width:60,height:40},
    ellipse:{center:[100,100],width:60,height:40,startAngleDeg:20,endAngleDeg:150},
    segment:{a:[100,100],b:[180,130]},arrow:{a:[100,100],b:[180,130]},
    text:{pos:[100,100],txt:'<b>literal</b>',size:18},
    point:{id:'source-point',type:'free',pos:[100,100],visible:true},
    angle:{vertex:{pos:[100,100]},start:{pos:[140,100]},end:{pos:[100,60]},radius:40}
  };
  for(const [type,data] of Object.entries(examples)){
    const s=setup(), collection={rect:'rects',ellipse:'ellipses',segment:'segments',
      arrow:'arrows',text:'texts',point:'points',angle:'angles'}[type];
    s.window.currentTask.scene[collection]=[plain(data)];
    s.select(type);
    s.clipboard.copy();
    s.clipboard.paste();
    s.clipboard.paste();
    const result=s.window.currentTask.scene[collection];
    const getPos=obj=>obj.pos || obj.center || obj.bottomCenter || obj.vertex?.pos || obj.a;
    assert.deepEqual(plain(getPos(result[1])),[110,90],type);
    assert.deepEqual(plain(getPos(result[2])),[120,80],type);
    assert.equal(s.clipboard.entries.length,1);
  }
  const s=setup();
  s.window.currentTask.scene.segments=[{a:[0,0],b:[100,100]}];
  s.select('segment');s.clipboard.copy();
  const target=s.task({segments:[{a:[0,100],b:[100,0]}]});
  s.clipboard.paste();
  assert.deepEqual(plain(target.scene.segments[1].a),[0,0],'crossing segments are not shifted');
});

test('coincidence ignores styling, tolerates rounding and recognizes reversed segments',()=>{
  const s=setup();
  s.window.currentTask.scene.segments=[{a:[100,100],b:[200,100],color:'#000'}];
  s.select('segment');s.clipboard.copy();
  const t=s.task({segments:[{a:[200,100],b:[100+1e-8,100],color:'#fff'}]});
  s.clipboard.paste();
  assert.deepEqual(plain(t.scene.segments[1].a),[110,90]);
});

test('uses half of the configured grid step without snapping subpixel source coordinates',()=>{
  const s=setup();
  s.window.GRID_STEP=30;
  s.window.currentTask.scene.points=[{type:'free',id:'p',pos:[100.125,100.25]}];
  s.select('point');s.clipboard.copy();s.clipboard.paste();
  assert.deepEqual(plain(s.window.currentTask.scene.points[1].pos),[115.125,85.25]);
});

test('intersection points become free snapshots with fresh collision-free IDs',()=>{
  const s=setup();
  const scene=s.window.currentTask.scene;
  scene.segments=[{a:[0,50],b:[100,50]},{a:[50,0],b:[50,100]}];
  const result=s.window.sceneModel.intersections(s.window.currentTask,
    {ref:'segment0',segment:'segment'},{ref:'segment1',segment:'segment'});
  scene.points=[{id:'intersection',type:'intersection',pos:[50,50],
    sources:[{ref:'segment0',segment:'segment'},{ref:'segment1',segment:'segment'}],
    branch:result.hits[0].branch,visible:true}];
  s.window.sceneModel.update(s.window.currentTask);
  s.select('point');s.clipboard.copy();
  const target=s.task({points:[{id:'point-copy-1',type:'free',pos:[0,0]}]});
  s.clipboard.paste();s.clipboard.paste();
  const copied=target.scene.points.slice(1);
  assert.equal(copied[0].type,'free');
  assert.equal(copied[0].sources,undefined);
  assert.notEqual(copied[0].id,copied[1].id);
  assert.notEqual(copied[0].id,'point-copy-1');
  assert.deepEqual(plain(copied[0].pos),[50,50]);
});

test('angle snapshots preserve reversed segment directions rather than anchor-point directions',()=>{
  const s=setup(), task=s.window.currentTask;
  task.scene.segments=[{a:[0,0],b:[100,0]},{a:[0,0],b:[0,100]}];
  task.scene.angles=[{radius:30,symbol:'a',vertex:{pos:[50,50]},
    start:{anchor:{type:'segment',ref:'segment0',segment:'segment',u:0.2}},
    end:{anchor:{type:'segment',ref:'segment1',segment:'segment',u:0.2}},startReversed:true}];
  const original=s.window.sceneModel.angleGeometry(task.scene.angles[0],task);
  s.select('angle');s.clipboard.copy();
  const target=s.task();
  s.clipboard.paste();
  const pasted=s.window.sceneModel.angleGeometry(target.scene.angles[0],target);
  assert.equal(pasted.valid,true);
  assert.ok(Math.abs(pasted.startAngle-original.startAngle)<1e-8);
  assert.ok(Math.abs(pasted.endAngle-original.endAngle)<1e-8);
  assert.equal(pasted.degrees,original.degrees);
  assert.equal(target.scene.angles[0].start.anchor,undefined);
});

test('linked text snapshots use actual coordinates and omit runtime render fields',()=>{
  const s=setup();
  s.window.currentTask.scene.texts=[{pos:[100,100],size:20,txt:'first'},{txt:'second',linked:true}];
  s.select('text',1);s.clipboard.copy();
  assert.deepEqual(plain(s.clipboard.entries[0].data.pos),[100,125]);
  assert.equal(s.clipboard.entries[0].data.linked,false);
  s.window.currentTask.scene.texts[0].pos=[101.25,101.75];
  s.window.currentTask.scene.texts[1]._renderedPos=[999,999];
  s.clipboard.copy();
  assert.deepEqual(plain(s.clipboard.entries[1].data.pos),[101.25,126.75]);
  assert.equal(s.clipboard.entries[1].data._renderedPos,undefined);
});

test('autosave persists resolved linked positions and export round-trips legacy chains',()=>{
  const s=setup();
  const task=s.window.currentTask;
  task.scene.texts=[
    {txt:'root',pos:[100,100],size:20},
    {txt:'child',linked:true,pos:[900,900]},
    {txt:'legacy child'},
    {txt:'degrees',pos:[20,30],angle_deg:45},
    {txt:'normal',pos:[40,50],n_vec:[1,0]},
    {txt:'legacy both',pos:[60,70],angle_deg:15,n_vec:[1,0]}
  ];
  vm.runInContext('writeTask();',s.context);
  const saved=JSON.parse(s.storage.get('editor_task_'+task.id));
  assert.deepEqual(saved.scene.texts[1].pos,[100,125]);
  assert.deepEqual(saved.scene.texts[2].pos,[100,144]);
  assert.equal(saved.scene.texts[2].linked,true);
  assert.equal(saved.scene.texts[5].angle_deg,15);
  assert.equal(saved.scene.texts[5].n_vec,undefined);

  const start=editor.indexOf('      // Remove rendering artifacts and linked flags from texts');
  const end=editor.indexOf('      // Add aliases for each expectedForce',start);
  s.context.task=plain(saved);
  vm.runInContext(editor.slice(start,end),s.context);
  const exported=plain(s.context.task);
  assert.equal(exported.scene.texts[1].pos,undefined);
  assert.equal(exported.scene.texts[1].linked,undefined);
  assert.equal(exported.scene.texts[1]._renderedPos,undefined);
  s.window.updateTextPositions(exported);
  assert.deepEqual(Array.from(exported.scene.texts[1].pos),[100,125]);
  assert.deepEqual(Array.from(exported.scene.texts[2].pos),[100,144]);
  assert.equal(exported.scene.texts[2].linked,true);
  assert.equal(exported.scene.texts[3].angle_deg,45);
  assert.equal(exported.scene.texts[3].n_vec,undefined);
  assert.deepEqual(exported.scene.texts[4].n_vec,[1,0]);
  assert.equal(exported.scene.texts[4].angle_deg,undefined);
  exported.scene.texts[1].linked=false;
  exported.scene.texts[0].pos=[0,0];
  s.window.updateTextPositions(exported);
  assert.deepEqual(Array.from(exported.scene.texts[1].pos),[100,125]);
});

test('active force wins over stale scene selection; both force types remain free and preserve vectors/specs',()=>{
  for(const expected of [true,false]){
    const s=setup(), task=s.window.currentTask;
    task.scene.points=[{id:'source',pos:[100,100],type:'free'}];
    s.select('point');
    const force=s.addForce('S_A',expected);
    const spec={name:'S_A',aliases:['tension'],nameBase:'S',dir:[0,1],tolerance:0.1};
    spec[expected ? 'anchor' : 'anchorSpec']={type:'point',ref:'source',point:'center'};
    task[expected ? 'expectedForces' : 'initialForces'].push(spec);
    s.clipboard.copy();
    assert.equal(s.clipboard.entries[0].type,expected ? 'expectedForce' : 'initialForce');
    force.anchor[0]=900;
    const target=s.task({points:[{id:'target',pos:[100,100],type:'free'}]});
    s.clipboard.paste();
    const pasted=s.window.fm.forces[0];
    assert.equal(pasted instanceof s.window.Force,true);
    assert.equal(pasted.isExpected,expected);
    assert.equal(pasted.moveable,expected);
    assert.deepEqual(plain(pasted.vec),[0,60]);
    assert.deepEqual(plain(pasted.anchor),[100,100]);
    assert.deepEqual(plain(pasted.arrowBase),[110,100]);
    const output=target[expected ? 'expectedForces' : 'initialForces'][0];
    assert.equal(output[expected ? 'anchor' : 'anchorSpec'].type,'custom');
    assert.deepEqual(plain(output.aliases),['tension']);
    assert.equal(output.nameBase,'S');
    assert.equal(output.tolerance,0.1);
    assert.equal(s.window.fm.isBlankForce(s.window.fm.forces.at(-1)),true);
  }
});

test('force name collisions use subscript numbering across drawings, specs and same paste',()=>{
  for(const [original,occupied,wanted] of [
    ['G',[], 'G'],['G',['G'],'G_1'],['S_A',['s_{a}'],'S_{A1}'],
    ['G_1',['G_1'],'G_2'],['G_1',['G_1','g_{2}'],'G_3'],
    ['S_{A1}',['S_A1','S_{A2}'],'S_{A3}'],['G_9',['G_9'],'G_{10}']
  ]){
    const s=setup();
    s.addForce(original);s.clipboard.copy();
    const target=s.task();
    target.expectedForces=occupied.map(name=>({name}));
    s.clipboard.paste();
    assert.equal(s.window.fm.forces[0].name,wanted,original);
  }
  const s=setup();
  s.addForce('G');s.clipboard.copy();s.clipboard.copy();s.clipboard.copy();
  s.task();s.addForce('G');
  s.clipboard.paste();
  assert.deepEqual(Array.from(s.window.fm.forces.filter(f=>f.name),f=>f.name),['G','G_1','G_2','G_3']);
  assert.deepEqual(plain(s.window.fm.forces[3].anchor),[130,70]);
  assert.deepEqual(plain(s.window.fm.forces[3].arrowBase),[140,70]);
  assert.deepEqual(plain(s.window.fm.forces[3].arrowTip),[140,130]);
});

test('initial and expected force geometry share coincidence detection within a paste',()=>{
  const s=setup();
  s.addForce('G',true);s.clipboard.copy();
  s.addForce('N',false);s.clipboard.copy();
  s.task();s.clipboard.paste();
  assert.deepEqual(plain(s.window.fm.forces[0].anchor),[100,100]);
  assert.deepEqual(plain(s.window.fm.forces[1].anchor),[110,90]);
});

test('only one plane is kept; paste replaces target plane without translating or confirmation',()=>{
  const s=setup(), source=s.window.currentTask;
  source.scene.plane={through:[100,200],angleDeg:0,draw:true,snapping:false};
  s.select('plane');s.clipboard.copy();
  source.scene.plane.through=[200,300];
  s.clipboard.copy();
  assert.equal(s.clipboard.entries.length,1);
  const target=s.task({plane:{through:[0,0],angleDeg:30}});
  s.clipboard.paste();
  assert.deepEqual(plain(target.scene.plane.through),[200,300]);
  assert.equal(target.scene.plane.snapping,false);
  assert.equal(target.scene.plane.angleDeg,0);
});

test('open is non-destructive, task changes retain clipboard and close empties it',()=>{
  const s=setup();
  s.clipboard.show();
  assert.equal(s.nodes['clipboard-empty'].hidden,false);
  s.window.currentTask.scene.points=[{id:'p',type:'free',pos:[100,100]}];
  s.select('point');s.clipboard.copy();s.clipboard.show();
  assert.equal(s.nodes['clipboard-panel'].classList.contains('hidden'),false);
  assert.equal(s.clipboard.entries.length,1);
  assert.match(s.nodes['clipboard-list'].children[0].textContent,/Punkt.*100, 100/);
  s.task();s.clipboard.paste();
  assert.equal(s.clipboard.entries.length,1);
  s.clipboard.close();s.clipboard.show();
  assert.equal(s.clipboard.entries.length,0);
  assert.equal(s.nodes['clipboard-paste'].disabled,true);
  assert.deepEqual(s.layouts,[['clipboard-panel',440]]);
});

test('shortcuts leave text controls, contenteditable, modifiers and other dialogs alone',()=>{
  const s=setup();
  const blocked={closest:()=>({})};
  for(const target of [blocked]){
    assert.equal(s.document.fire('keydown',{ctrlKey:true,key:'c',target}).defaultPrevented,undefined);
    assert.equal(s.document.fire('keydown',{metaKey:true,key:'v',target}).defaultPrevented,undefined);
  }
  for(const extras of [{altKey:true},{shiftKey:true},{defaultPrevented:true}]){
    assert.equal(s.document.fire('keydown',{ctrlKey:true,key:'c',...extras}).defaultPrevented,extras.defaultPrevented);
  }
  s.document.querySelector=()=>({});
  assert.equal(s.document.fire('keydown',{ctrlKey:true,key:'c'}).defaultPrevented,undefined);
  s.document.querySelector=()=>null;
  s.window.currentTask.scene.points=[{id:'p',type:'free',pos:[1,2]}];
  s.select('point');
  assert.equal(s.document.fire('keydown',{ctrlKey:true,key:'c'}).defaultPrevented,true);
  assert.equal(s.document.fire('keydown',{metaKey:true,key:'v'}).defaultPrevented,true);
  assert.equal(s.window.currentTask.scene.points.length,2);
});

test('invalid selections and empty clipboard show explicit status without changes',()=>{
  const s=setup();
  s.clipboard.copy();
  assert.match(s.nodes['clipboard-status'].textContent,/Velg/);
  assert.equal(s.clipboard.entries.length,0);
  s.clipboard.paste();
  assert.match(s.nodes['clipboard-status'].textContent,/tom/);
  const force=s.addForce();
  force.drawing=true;
  s.clipboard.copy();
  assert.match(s.nodes['clipboard-status'].textContent,/ferdig/);
  s.window.currentTask.scene.points=[{id:'p',pos:[NaN,0],type:'free'}];
  s.select('point');s.clipboard.copy();
  assert.equal(s.clipboard.entries.length,0);
  assert.match(s.nodes['clipboard-status'].textContent,/ugyldig/);
});

test('failed paste preparation commits nothing, including earlier valid entries',()=>{
  const s=setup();
  s.window.currentTask.scene.points=[{id:'p',type:'free',pos:[10,20]}];
  s.select('point');s.clipboard.copy();
  s.addForce('G_999999999999999999999');s.clipboard.copy();
  const target=s.task();
  target.expectedForces=[{name:'G_999999999999999999999'}];
  s.clipboard.paste();
  assert.match(s.nodes['clipboard-status'].textContent,/indeks/);
  assert.equal(target.scene.points,undefined);
  assert.equal(target.expectedForces.length,1);
});

test('real autosave and undo persist a mixed paste as one step, leaving pending edits separate',()=>{
  const s=setup(), source=s.window.currentTask;
  source.scene.points=[{type:'free',id:'p',pos:[20,30]}];
  s.select('point');s.clipboard.copy();
  s.addForce();s.clipboard.copy();
  const target=s.task({plane:{through:[0,100],angleDeg:0}});
  s.window.markEdited('task','forces');s.window.autoSave();s.window.recordUndo();
  target.title='Pending edit';
  s.window.markEdited('task');
  s.clipboard.paste();
  const id=target.id;
  assert.equal(JSON.parse(s.storage.get('editor_task_'+id)).scene.points.length,1);
  assert.equal(JSON.parse(s.storage.get('editor_forces_'+id))[0].name,'G');
  s.window.undo();
  assert.equal(s.window.currentTask.title,'Pending edit');
  assert.equal(s.window.currentTask.scene.points.length,0);
  assert.equal(s.window.currentTask.expectedForces.length,0);
  assert.equal(s.clipboard.entries.length,2);
  s.window.undo();
  assert.equal(s.window.currentTask.title,undefined);
  s.window.redo();s.window.redo();
  assert.equal(s.window.currentTask.scene.points.length,1);
  assert.equal(s.window.fm.forces[0].name,'G');
  s.load(0);s.load(1);
  assert.equal(s.window.currentTask.scene.points.length,1);
  assert.deepEqual(plain(s.window.fm.forces[0].anchor),[100,100]);
  assert.equal(s.clipboard.entries.length,2);
  for(const value of s.storage.values()) assert.equal(String(value).includes('clipboard'),false);
});

test('UI is editor-only and toolbar button is immediately before add rectangle',()=>{
  const html=fs.readFileSync(path.join(root,'editor.html'),'utf8');
  const player=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/id="btn-clipboard"[^]*?<\/button>\s*<button id="btn-add-rect"/);
  assert.match(html,/id="btn-add-group"[^>]*>\{ \}<\/button>/);
  assert.equal(player.includes('editor_clipboard.js'),false);
  assert.equal(player.includes('clipboard-panel'),false);
  const window={editorMode:false};
  vm.runInNewContext(read('editor_clipboard.js'),{window});
  assert.equal(window.editorClipboard,undefined);
});

test('undo immediately after pasting into an unedited task stays in the destination task',()=>{
  const s=setup(), source=s.window.currentTask;
  source.scene.plane={through:[100,200],angleDeg:0};
  source.scene.points=[{type:'free',id:'p',pos:[20,30]}];
  s.select('point');s.clipboard.copy();
  s.select('plane');s.clipboard.copy();
  const target=s.task({plane:{through:[300,400],angleDeg:0}});
  s.window.markEdited('task');s.window.autoSave();
  s.load(0);
  s.window.recordUndo(true);
  s.load(1);
  s.clipboard.paste();
  s.window.undo();
  assert.equal(s.window.currentTask.id,target.id);
  assert.deepEqual(plain(s.window.currentTask.scene.plane.through),[300,400]);
  assert.equal(s.window.currentTask.scene.points.length,0);
  s.window.redo();
  assert.equal(s.window.currentTask.id,target.id);
  assert.deepEqual(plain(s.window.currentTask.scene.plane.through),[100,200]);
  assert.equal(s.window.currentTask.scene.points.length,1);
});

test('invalid shape orientation is reported at copy time; unshiftable coordinates do not hang paste',()=>{
  const s=setup();
  s.window.currentTask.scene.ellipses=[{center:[10,20],width:20,height:40,t_vec:[0,0]}];
  s.select('ellipse');s.clipboard.copy();
  assert.equal(s.clipboard.entries.length,0);
  assert.match(s.nodes['clipboard-status'].textContent,/ugyldig/);
  s.window.currentTask.scene.points=[{type:'free',id:'large',pos:[1e300,1e300]}];
  s.select('point');s.clipboard.copy();
  s.clipboard.paste();
  assert.match(s.nodes['clipboard-status'].textContent,/for store/);
  assert.equal(s.window.currentTask.scene.points.length,1);
});
