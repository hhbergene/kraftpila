const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file=>fs.readFileSync(path.join(__dirname,'..','web',file),'utf8');
const plain = value=>JSON.parse(JSON.stringify(value));

function runtime(document){
  const window={};
  const context=vm.createContext({window,document,console,setTimeout});
  for(const file of ['shared.js','geometry.js','scene_render.js','scene_model.js']){
    vm.runInContext(read(file),context);
  }
  return {window,context,model:window.sceneModel};
}

test('all new scene types get Norwegian IDs from 1, globally unique and stable across reordering/reload',()=>{
  const {model}=runtime();
  const task={scene:{
    planes:[{through:[0,0]}],rects:[{bottomCenter:[0,0],width:40,height:20}],
    segments:[{a:[0,0],b:[100,0]}],ellipses:[{center:[0,0],width:100,height:100}],
    arrows:[{a:[0,0],b:[10,0]}],texts:[{txt:'A',pos:[0,0]}],
    angles:[{vertex:{pos:[0,0]},start:{pos:[10,0]},end:{pos:[0,-10]}}],
    points:[{id:'Punkt-1',pos:[0,0],type:'free'},{pos:[1,1],type:'free'}]
  }};
  model.update(task);
  const expected={planes:'Plan-1',rects:'Rektangel-1',segments:'Segment-1',ellipses:'Ellipse-1',
    arrows:'Pil-1',texts:'Tekst-1',angles:'Vinkel-1'};
  for(const [collection,id] of Object.entries(expected)) assert.equal(task.scene[collection][0].id,id);
  assert.equal(task.scene.points[1].id,'Punkt-2');
  task.scene.texts.push({id:'Vogn-1',txt:'Reserved across types',pos:[0,0]});
  const point=model.createAttachedPoint(task,model.geometries(task).find(g=>g.ref==='Segment-1'),[50,0]);
  const wagon=model.createWagon(task,point);
  assert.equal(wagon.id,'Vogn-2');
  assert.equal(wagon.planeId,'Plan-1');
  assert.equal(task.scene.planes[0].lockedTo.ref,'Vogn-2');
  assert.equal(model.nextSceneId(task,'wagon',new Set(['Vogn-3'])),'Vogn-4');
  const ids=task.scene.points.map(p=>p.id);
  task.scene.points.reverse();
  model.update(task);
  assert.deepEqual(task.scene.points.map(p=>p.id),ids.reverse());
  const saved=plain(task);
  model.update(saved);
  assert.deepEqual(plain(saved),plain(task));
});

test('rename visits standard references even in unknown future types and preserves unrelated strings',()=>{
  const {model}=runtime();
  const target={id:'old',a:[0,0],b:[10,0]};
  const task={id:'old',title:'old',scene:{segments:[target],
    planes:[{id:'plane',lockedTo:{type:'wagon',ref:'old'}}],activePlaneId:'old',
    points:[{id:'attached',type:'attached',attachment:{ref:'old',segment:'segment'}},
      {id:'cross',type:'intersection',sources:[{ref:'old',curve:true},{key:'old:segment'}]}],
    wagons:[{id:'wagon',pointId:'old',planeId:'old'}],
    angles:[{id:'angle',vertex:{anchor:{type:'point',ref:'old',point:'start'}},
      start:{type:'segment',ref:'old',segment:'segment'},end:{pos:[10,10]}}],
    groups:[{description:'old',members:[{type:'segment',id:'old'}]}],
    futureWidgets:[{id:'unregistered',nested:{anchor:{type:'point',ref:'old',point:'end'}},
      sources:[{ref:'old',segment:'segment'}],geometry:{ref:'old',curve:true},
      note:'old',unknownRef:{ref:'old'}}]},
    expectedForces:[{name:'old',anchor:{type:'segment',ref:'old',segment:'segment'},planeId:'old'}],
    initialForces:[{name:'N',anchorSpec:{type:'point',ref:'old',point:'start'}}],
    forces:[{name:'G',anchorFrom:'old'}],
    relations:[{lhs:[{name:'old',planeId:'old'}],rhs:[]}],sumF:{n:0,planeId:'old'},
    metadata:{id:'old',description:'old'},comment:'old:segment'};
  const live={anchorSpec:{type:'point',ref:'old',point:'end'}};
  live.self=live;
  const drafts={relations:[{lhs:[{planeId:'old'}]}],sumF:{planeId:'old'}};
  assert.equal(model.renameSceneId(task,target,'Ny-ID',[live,drafts]),true);
  assert.equal(target.id,'Ny-ID');
  assert.equal(task.scene.planes[0].lockedTo.ref,'Ny-ID');
  assert.equal(task.scene.activePlaneId,'Ny-ID');
  assert.equal(task.scene.points[0].attachment.ref,'Ny-ID');
  assert.equal(task.scene.points[1].sources[0].ref,'Ny-ID');
  assert.equal(task.scene.points[1].sources[1].key,'Ny-ID:segment');
  assert.equal(task.scene.wagons[0].pointId,'Ny-ID');
  assert.equal(task.scene.wagons[0].planeId,'Ny-ID');
  assert.equal(task.scene.angles[0].vertex.anchor.ref,'Ny-ID');
  assert.equal(task.scene.angles[0].start.ref,'Ny-ID');
  assert.equal(task.scene.groups[0].members[0].id,'Ny-ID');
  assert.equal(task.scene.futureWidgets[0].nested.anchor.ref,'Ny-ID');
  assert.equal(task.scene.futureWidgets[0].sources[0].ref,'Ny-ID');
  assert.equal(task.scene.futureWidgets[0].geometry.ref,'Ny-ID');
  assert.equal(task.expectedForces[0].anchor.ref,'Ny-ID');
  assert.equal(task.expectedForces[0].planeId,'Ny-ID');
  assert.equal(task.initialForces[0].anchorSpec.ref,'Ny-ID');
  assert.equal(task.forces[0].anchorFrom,'Ny-ID');
  assert.equal(task.relations[0].lhs[0].planeId,'Ny-ID');
  assert.equal(task.sumF.planeId,'Ny-ID');
  assert.equal(live.anchorSpec.ref,'Ny-ID');
  assert.equal(drafts.relations[0].lhs[0].planeId,'Ny-ID');
  assert.equal(drafts.sumF.planeId,'Ny-ID');
  assert.equal(task.id,'old');
  assert.equal(task.title,'old');
  assert.equal(task.expectedForces[0].name,'old');
  assert.equal(task.scene.groups[0].description,'old');
  assert.equal(task.scene.futureWidgets[0].note,'old');
  assert.equal(task.scene.futureWidgets[0].unknownRef.ref,'old');
  assert.equal(task.metadata.id,'old');
  assert.equal(task.comment,'old:segment');
});

test('invalid, duplicate, stale and unchanged IDs never partially mutate a task',()=>{
  const {model}=runtime();
  const point={id:'legacy:id.with spaces',type:'free',pos:[1,2]};
  const task={scene:{points:[point],texts:[{id:'Taken',txt:'x',pos:[0,0]}]}};
  const before=JSON.stringify(task);
  for(const id of ['', ' ', 'a:b', 'a.b', 'two words', 'Taken']){
    assert.ok(model.validateSceneId(task,point,id));
    assert.throws(()=>model.renameSceneId(task,point,id),{name:'TypeError'});
    assert.equal(JSON.stringify(task),before);
  }
  assert.equal(model.renameSceneId(task,point,point.id),false);
  assert.equal(JSON.stringify(task),before);
  assert.equal(model.validateSceneId(task,point,'Vogn_ÆØÅ-12'),'');
  assert.equal(model.validateSceneId(task,point,'taken'),'');
  assert.throws(()=>model.renameSceneId(task,{},'New'),{name:'TypeError'});
});

test('renaming linked wagon, plane, track and point preserves all geometry and resolved anchors after reload',()=>{
  const {model}=runtime();
  const task={scene:{segments:[{id:'track',a:[0,0],b:[100,0]}]}};
  const point=model.createAttachedPoint(task,model.geometries(task)[0],[50,0]);
  const wagon=model.createWagon(task,point);
  const plane=task.scene.planes[0];
  task.scene.activePlaneId=plane.id;
  task.expectedForces=[{name:'G',anchor:{type:'point',ref:wagon.id,point:'center'},planeId:plane.id}];
  const shape=plain(model.wagonGeometry(task,wagon));
  const position=plain(model.resolveAnchor(task,task.expectedForces[0].anchor).pos);
  for(const [object,id] of [[task.scene.segments[0],'Spor'],[point,'Feste'],[wagon,'Min-Vogn'],[plane,'Mitt-Plan']]){
    model.renameSceneId(task,object,id);
    model.update(task);
    assert.deepEqual(plain(model.wagonGeometry(task,wagon)),shape);
    assert.deepEqual(plain(model.resolveAnchor(task,task.expectedForces[0].anchor).pos),position);
  }
  assert.equal(point.attachment.ref,'Spor');
  assert.equal(wagon.pointId,'Feste');
  assert.equal(wagon.planeId,'Mitt-Plan');
  assert.equal(plane.lockedTo.ref,'Min-Vogn');
  assert.equal(task.scene.activePlaneId,'Mitt-Plan');
  const loaded=plain(task);
  model.update(loaded);
  assert.equal(model.resolveAnchor(loaded,loaded.expectedForces[0].anchor).valid,true);
  assert.deepEqual(plain(model.wagonGeometry(loaded,loaded.scene.wagons[0])),shape);
});

test('actual IDs take precedence over positional legacy aliases and prototype property names',()=>{
  const {window,model}=runtime();
  const segment={id:'line',a:[7,8],b:[10,8]};
  const task={scene:{segments:[segment],rects:[{id:'box',bottomCenter:[100,100],width:10,height:10}]}};
  model.update(task);
  for(const id of ['rect0','__proto__','constructor']){
    model.renameSceneId(task,segment,id);
    const anchor={type:'point',ref:id,point:'start'};
    assert.deepEqual(plain(model.resolveAnchor(task,anchor).pos),[7,8]);
    assert.deepEqual(plain(window.buildSceneLookup(task)[id].points.start),[7,8]);
    assert.deepEqual(plain(window.buildAllScenePoints(task)[id].points.start),[7,8]);
  }
});

test('renaming intersection sources and their point preserves branch, angle and force anchors',()=>{
  const {model}=runtime();
  const task={scene:{segments:[{id:'a',a:[0,20],b:[100,20]},{id:'b',a:[30,0],b:[30,100]}]}};
  const [a,b]=model.geometries(task);
  const point=model.createIntersectionPoint(task,a,b,model.intersections(task,a,b).hits[0]);
  task.expectedForces=[{name:'G',anchor:{type:'point',ref:point.id,point:'center'}}];
  task.scene.angles=[{id:'angle',vertex:{anchor:{type:'point',ref:point.id,point:'center'}},
    start:{pos:[50,20]},end:{pos:[30,0]}}];
  model.update(task);
  const position=plain(point.pos),branch=plain(point.branch);
  model.renameSceneId(task,task.scene.segments[0],'First-Source');
  model.renameSceneId(task,task.scene.segments[1],'Second-Source');
  model.renameSceneId(task,point,'Crossing');
  model.update(task);
  assert.deepEqual(plain(point.pos),position);
  assert.deepEqual(plain(point.branch),branch);
  assert.equal(model.pointStatus(task,point).valid,true);
  assert.equal(model.angleGeometry(task.scene.angles[0],task).valid,true);
  assert.deepEqual(plain(model.resolveAnchor(task,task.expectedForces[0].anchor).pos),position);
});

test('the text export cleanup preserves renamed IDs and anchors across serialization and reload',()=>{
  const {model,context}=runtime();
  const text={id:'text-old',txt:'Anchor',pos:[20,30]};
  const task={scene:{texts:[text]},expectedForces:[
    {name:'G',anchor:{type:'point',ref:text.id,point:'pos'}}
  ]};
  model.update(task);
  model.renameSceneId(task,text,'Min-Tekst');
  context.exportTask=task;
  const source=read('editor.js');
  const start=source.indexOf('      // Remove rendering artifacts and linked flags from texts');
  const end=source.indexOf('      // Add aliases for each expectedForce',start);
  assert.ok(start>=0 && end>start);
  vm.runInContext(`const task=exportTask;\n${source.slice(start,end)}`,context);
  const imported=plain(task);
  model.update(imported);
  assert.equal(imported.scene.texts[0].id,'Min-Tekst');
  assert.equal(imported.expectedForces[0].anchor.ref,'Min-Tekst');
  assert.deepEqual(plain(model.resolveAnchor(imported,imported.expectedForces[0].anchor).pos),[20,30]);
});

class Element {
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();
    this.listeners={};
    this.children=[];
    this.style={setProperty(){},removeProperty(){}};
    this.classes=new Set();
    this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),
      contains:name=>this.classes.has(name)};
    this.isConnected=true;
    this.value='';
  }
  addEventListener(type,fn){(this.listeners[type] ||= []).push(fn);}
  fire(type,extra={}){
    const event={target:this,preventDefault(){this.prevented=true;},
      stopImmediatePropagation(){this.stopped=true;},...extra};
    for(const fn of this.listeners[type] || []){
      fn(event);
      if(event.stopped) break;
    }
    return event;
  }
  setAttribute(name,value){this[name]=value;}
  setCustomValidity(value){this.validationMessage=value;}
  focus(){this.focused=true;}
  select(){this.selected=true;}
  contains(element){return this===element || this.children.includes(element);}
}

function editorRuntime(){
  const ids=['app-canvas','scene-id-modal','scene-id-input','scene-id-old','scene-id-error',
    'scene-id-confirm','scene-id-save-icon','scene-id-cancel','scene-id-form'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element(id==='scene-id-input'?'input':'div')]));
  nodes['scene-id-modal'].children.push(nodes['scene-id-input']);
  const document=new Element();
  document.readyState='complete';
  document.getElementById=id=>nodes[id] || null;
  document.querySelectorAll=()=>[];
  const {window,context,model}=runtime(document);
  const point={id:'Old',type:'free',pos:[1,2]};
  const task={scene:{points:[point,{id:'Taken',type:'free',pos:[3,4]}]}};
  window.editorMode=true;
  window.currentTask=task;
  let commits=0;
  window.commitSceneId=(t,object,id)=>{commits++;return model.renameSceneId(t,object,id);};
  vm.runInContext(read('scene_editor.js'),context);
  const trigger=new Element('button');
  const open=()=>window.sceneEditor.openIdEditor(point,trigger);
  const type=id=>{nodes['scene-id-input'].value=id;nodes['scene-id-input'].fire('input');};
  return {window,model,document,nodes,point,task,trigger,open,type,commits:()=>commits};
}

test('ID editor validates continuously, keeps typing private and cancels with Esc or the old-ID button',()=>{
  const s=editorRuntime(),before=JSON.stringify(s.task);
  s.open();
  assert.equal(s.nodes['scene-id-input'].focused,true);
  assert.equal(s.nodes['scene-id-input'].selected,true);
  assert.equal(s.nodes['scene-id-cancel'].textContent,'Avbryt bruk Old');
  s.type('Taken');
  assert.match(s.nodes['scene-id-error'].textContent,/allerede i bruk/);
  assert.equal(s.nodes['scene-id-confirm'].disabled,true);
  s.nodes['scene-id-form'].fire('submit');
  assert.equal(s.commits(),0);
  s.type('New-ID');
  assert.equal(s.nodes['scene-id-confirm'].disabled,false);
  assert.equal(JSON.stringify(s.task),before);
  const event=s.document.fire('keydown',{key:'Escape',target:s.nodes['scene-id-input']});
  assert.equal(event.stopped,true);
  assert.equal(s.nodes['scene-id-modal'].classList.contains('hidden'),true);
  assert.equal(JSON.stringify(s.task),before);
  assert.equal(s.trigger.focused,true);
  s.open();s.type('Other');
  s.nodes['scene-id-cancel'].fire('click');
  assert.equal(JSON.stringify(s.task),before);
});

test('Enter, form confirm and disk save commit once; task changes and deleted targets cancel stale drafts',()=>{
  for(const action of ['enter','submit','disk']){
    const s=editorRuntime();
    s.open();s.type('New-ID');
    if(action==='enter') s.document.fire('keydown',{key:'Enter',target:s.nodes['scene-id-input']});
    else if(action==='submit') s.nodes['scene-id-form'].fire('submit');
    else s.nodes['scene-id-save-icon'].fire('click');
    assert.equal(s.point.id,'New-ID');
    assert.equal(s.commits(),1);
    assert.equal(s.nodes['scene-id-modal'].classList.contains('hidden'),true);
  }
  for(const action of ['task','delete','collision']){
    const s=editorRuntime();
    s.open();s.type('New-ID');
    if(action==='task') s.window.currentTask={scene:{}};
    if(action==='delete') s.task.scene.points.splice(0,1);
    if(action==='collision') s.task.scene.points.push({id:'New-ID'});
    s.nodes['scene-id-form'].fire('submit');
    assert.equal(s.point.id,'Old');
    assert.equal(s.commits(),0);
    if(action!=='collision') assert.equal(s.nodes['scene-id-modal'].classList.contains('hidden'),true);
  }
});
