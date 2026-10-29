const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag){
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {setProperty(){}, removeProperty(){}};
    this.value = '';
    this.isConnected = true;
  }
  appendChild(child){ child.parent = this; child.parentElement=this; this.children.push(child); return child; }
  append(...children){ children.forEach(child => this.appendChild(child)); }
  replaceChildren(...children){ this.children = []; this.append(...children); }
  remove(){ this.isConnected = false; if(this.parent) this.parent.children = this.parent.children.filter(c=>c!==this); }
  get options(){ return this.children.flatMap(c=>c.tagName==='OPTION' ? [c] : c.options); }
  querySelector(selector){
    return this.children.find(c=>selector==='[data-preview]' && c.dataset.preview) || null;
  }
  addEventListener(type, listener){ (this.listeners[type] ||= []).push(listener); }
  fire(type, extras = {}){
    const event = {target:this, button:0, preventDefault(){this.prevented=true;},
      stopImmediatePropagation(){this.stopped=true;}, stopPropagation(){this.stopped=true;}, ...extras};
    (this.listeners[type] || []).forEach(fn=>fn(event));
    return event;
  }
  setAttribute(name, value){ this[name] = value; }
  removeAttribute(name){ delete this[name]; }
  focus(){ this.focused=true; }
  closest(){ return null; }
  contains(el){ return this===el || this.children.some(c=>c.contains(el)); }
  setCustomValidity(message){ this.validationMessage=message; }
  reportValidity(){ this.reported=true; }
}

function setup(){
  const nodes = {'app-canvas':new Element('canvas'), 'btn-add-point':new Element('button'),
    'scene-panel':new Element('div')};
  const document = new Element('document');
  document.readyState='complete';
  document.getElementById=id=>nodes[id] || null;
  document.createElement=tag=>new Element(tag);
  document.body=new Element('body');
  const spec = {anchor:{type:'custom',pos:[10,20]}};
  const force = {anchor:[10,20],arrowBase:[15,20],arrowTip:[15,80],
    updateDirectionAndLength(){this.updated=true;}};
  const task = {scene:{points:[],angles:[]}};
  let edits = [];
  const window = {editorMode:true,currentTask:task,fm:{forces:[force]},
    getMousePos:e=>e.pos,getForceSpec:()=>({spec,prop:'anchor'}),syncForceSpec(){},
    markEdited:(...parts)=>edits.push(parts), updateAppState(){}, updateScenePanel(){}};
  const candidate = {kind:'point',ref:'segment-1',pos:[100,100],
    anchor:{type:'point',ref:'segment-1',point:'a'}};
  window.sceneModel = {
    orderAnchors:(task,list)=>({all:list,nearest:[]}),
    anchorLabel:c=>`${c.anchor.ref} ${c.anchor.point || c.anchor.segment}`,
    candidates:()=>[candidate],
    resolveAnchor:()=>({pos:[100,100],valid:true}),
    createPoint:(t,pos)=>{
      const p={id:`point-${t.scene.points.length}`,type:'free',pos:pos.slice(),visible:false};
      t.scene.points.push(p); return p;
    },
    geometries:()=>{
      task.scene.segments ||= [{id:'segment-1',a:[0,50],b:[100,50]}];
      task.scene.ellipses ||= [{id:'ellipse-1',center:[40,50],width:80,height:60}];
      return [{key:'a',label:'a',ref:'segment-1',value:task.scene.segments[0],
      source:{ref:'segment-1',segment:'segment'}},
      {key:'b',label:'b',ref:'ellipse-1',curve:true,value:task.scene.ellipses[0],source:{ref:'ellipse-1',curve:true}}];
    },
    intersections:()=>({hits:[{pos:[40,50],params:[0.5,0.2],branch:{id:'one',params:[0.5,0.2]}}]}),
    update(){}, pointStatus:()=>({valid:true})
  };
  const context=vm.createContext({window,document,console,setTimeout});
  const getMousePos=window.getMousePos;
  for(const file of ['geometry.js','snapping.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web',file),'utf8'),context);
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','shared.js'),'utf8'),context);
  window.getMousePos=getMousePos;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','scene_editor.js'),'utf8'),context);
  const select = new Element('select');
  select.dataset.index='0';
  select.value='custom:10,20';
  const parent=new Element('div');
  parent.appendChild(select);
  window.sceneEditor.bindForcePicker(select,parent);
  const open=()=>parent.children.find(c=>c.className==='scene-anchor-field').fire('click');
  return {window,document,nodes,select,parent,force,spec,task,edits,candidate,open};
}

test('force segment selection projects existing position and refreshes anchor controls immediately',()=>{
  const s=setup();
  s.nodes['force-inputs']=new Element('div');
  let rebuilds=0;
  s.window.fm.syncInputs=(container,forceRebuild)=>{
    assert.equal(container,s.nodes['force-inputs']);
    assert.equal(forceRebuild,true);
    rebuilds++;
  };
  s.window.sceneModel.resolveAnchor=(task,slot)=>{
    assert.equal(slot.anchor.type,'segment');
    assert.deepEqual(Array.from(slot.pos),[10,20]);
    return {valid:true,pos:[10,50]};
  };
  s.window.sceneEditor.applyForceAnchor(0,{type:'segment',ref:'rect-1',segment:'bottom'},[50,50],false);
  assert.deepEqual(Array.from(s.force.anchor),[10,50]);
  assert.deepEqual(Array.from(s.force.arrowBase),[15,50]);
  assert.deepEqual(Array.from(s.force.arrowTip),[15,110]);
  assert.equal(s.spec.anchor.segment,'bottom');
  assert.equal(rebuilds,1);
});

test('automatic anchor selection opens the picker with the chosen anchor visible',()=>{
  const s=setup();
  s.select.className='force-anchor-select';
  s.select.value='point:segment-1:a';
  const option=new Element('option');
  option.value=s.select.value;
  option.textContent='segment-1 a';
  s.select.appendChild(option);
  s.document.querySelector=selector=>selector.includes('.force-anchor-select') ? s.select : null;
  assert.equal(s.window.sceneEditor.showForceAnchorPicker(0),true);
  assert.equal(s.window.sceneEditor.isPicking(s.select),true);
  const list=s.parent.children.find(child=>child.className==='scene-anchor-list');
  assert.equal(list.hidden,false);
  assert.equal(list.children[0].dataset.value,s.select.value);
  assert.equal(list.children[0]['aria-selected'],'true');
});

test('hover previews a candidate without edits or point creation; Esc restores selection',()=>{
  const s=setup();
  s.open();
  const event=s.nodes['app-canvas'].fire('mousemove',{pos:[101,100]});
  assert.equal(event.stopped,true);
  assert.equal(s.select.value,'point:segment-1:a');
  assert.equal(s.task.scene.points.length,0);
  assert.equal(s.edits.length,0);
  s.document.fire('keydown',{key:'Escape'});
  assert.equal(s.select.value,'custom:10,20');
  assert.equal(s.edits.length,0);
});

test('free force anchor click keeps a custom position without creating a scene point',()=>{
  const s=setup();
  s.open();
  s.nodes['app-canvas'].fire('mousemove',{pos:[33.25,44.75]});
  assert.equal(s.task.scene.points.length,0);
  s.nodes['app-canvas'].fire('mousedown',{pos:[33.25,44.75]});
  assert.equal(s.task.scene.points.length,0);
  assert.deepEqual(Array.from(s.spec.anchor.pos),[33.25,44.75]);
  assert.equal(s.spec.anchor.type,'custom');
  assert.deepEqual(s.edits,[['forces']]);
  assert.deepEqual(Array.from(s.force.arrowBase),[38.25,44.75]);
  assert.deepEqual(Array.from(s.force.arrowTip),[38.25,104.75]);
  assert.equal(s.nodes['app-canvas'].fire('mouseup',{pos:[33.25,44.75]}).stopped,true);
});

test('candidate force anchor commit creates no point and preserves force vector',()=>{
  const s=setup();
  s.open();
  s.nodes['app-canvas'].fire('mousedown',{pos:[100,100]});
  assert.equal(s.task.scene.points.length,0);
  assert.equal(s.spec.anchor.ref,'segment-1');
  assert.deepEqual(Array.from(s.force.arrowTip),[105,160]);
  assert.deepEqual(s.edits,[['forces']]);
});

test('task changes and deleted force consumers cancel before canvas can commit',()=>{
  const s=setup();
  s.open();
  s.window.currentTask={scene:{points:[]}};
  s.window.sceneEditor.checkTask();
  assert.equal(s.select.value,'custom:10,20');
  assert.equal(s.nodes['app-canvas'].fire('mousedown',{pos:[30,30]}).stopped,undefined);
  s.window.currentTask=s.task;
  s.open();
  s.window.fm.forces=[];
  s.window.sceneEditor.checkTask();
  assert.equal(s.window.sceneEditor.isPicking(s.select),false);
});

test('free point preserves coordinates with snapping off; a unique intersection is automatic',()=>{
  const s=setup();
  s.nodes['btn-add-point'].fire('click');
  assert.equal(s.task.scene.points.length,0);
  s.nodes['app-canvas'].fire('mousedown',{pos:[100.5,100.25]});
  assert.deepEqual(Array.from(s.task.scene.points[0].pos),[100.5,100.25]);
  s.nodes['btn-add-point'].fire('click');
  assert.equal(s.nodes['btn-add-point'].dataset.mode,'intersection');
  const panel=s.nodes['scene-panel'].children.find(c=>c.isConnected && c.className?.includes('scene-intersection-picker'));
  const selects=panel.children.flatMap(row=>row.children).filter(c=>c.tagName==='SELECT');
  selects[0].value='0'; selects[0].fire('change');
  assert.equal(s.task.scene.points.length,2);
  assert.equal(s.task.scene.points[1].type,'intersection');
  assert.equal(s.task.scene.points[1].branch.id,'one');
});

function startIntersectionTool(s){
  s.nodes['btn-add-point'].fire('click');
  s.nodes['btn-add-point'].fire('click');
  const panel=s.nodes['scene-panel'].children.at(-1);
  const rows=panel.children.filter(child=>child.className==='scene-editor-row');
  const field=i=>rows[i].children.find(child=>child.className==='scene-anchor-field');
  const list=i=>rows[i].children.find(child=>child.className==='scene-anchor-list');
  const select=i=>rows[i].children.find(child=>child.tagName==='SELECT');
  const choose=(i,value)=>list(i).children.find(item=>item.dataset.value===String(value)).fire('click');
  return {panel,field,list,select,choose};
}

function intersectionMarkers(s){
  const markers=[];
  s.window.drawAnchorMarker=(ctx,pos,state)=>markers.push({pos:Array.from(pos),state});
  s.window.sceneEditor.drawOverlay({save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}});
  return markers;
}

function crossingSetup(){
  return realAngleSetup([
    {a:[0,0],b:[100,0]},
    {a:[25,-30],b:[25,30]},
    {a:[75,-30],b:[75,30]},
    {a:[0,10],b:[100,10]},
    {a:[20,0],b:[80,0]},
    {a:[110,-30],b:[110,30]}
  ]);
}

test('point icons reflect mode and free point preview and commit share snapping settings',()=>{
  const s=setup();
  s.window.enableSnap=true;
  s.window.GRID_STEP=20;
  s.window.DRAW_CENTER=[0,0];
  s.nodes['btn-add-point'].fire('click');
  assert.equal(s.nodes['btn-add-point'].innerHTML,'●');
  s.nodes['app-canvas'].fire('mousemove',{pos:[31,42]});
  assert.deepEqual(intersectionMarkers(s),[{pos:[40,40],state:'pickerPreview'}]);
  assert.deepEqual(Array.from(s.window.snapIndicator.pos),[40,40]);
  s.nodes['app-canvas'].fire('mousedown',{pos:[31,42]});
  assert.deepEqual(Array.from(s.task.scene.points[0].pos),[40,40]);
  assert.equal(s.window.snapIndicator,null);
  s.nodes['btn-add-point'].fire('click');
  assert.match(s.nodes['btn-add-point'].innerHTML,/<svg.*<path.*fill="none".*<circle/);
  assert.match(s.nodes['btn-add-point']['aria-label'],/Skjæringspunkt/);
  s.document.fire('keydown',{key:'Escape'});
  assert.equal(s.nodes['btn-add-point']['aria-pressed'],'false');
});

test('free point snaps to enabled scene points and force endpoints, and stops when snap is off',()=>{
  for(const kind of ['scene','force','off']){
    const s=setup();
    s.window.enableSnap=kind!=='off';
    s.window.GRID_STEP=20;
    s.window.DRAW_CENTER=[0,0];
    s.window.snapPoints=kind==='scene' ? [[33.5,44.5]] : [];
    s.force.arrowTip=[33.5,44.5];
    s.nodes['btn-add-point'].fire('click');
    s.nodes['app-canvas'].fire('mousedown',{pos:[34,45]});
    assert.deepEqual(Array.from(s.task.scene.points[0].pos),kind==='off' ? [34,45] : [33.5,44.5]);
  }
});

test('intersection first field opens and scrolls into view without creating a point',()=>{
  const s=setup(),panel=s.nodes['scene-panel'];
  panel.scrollTop=0;
  panel.getBoundingClientRect=()=>({top:100,bottom:300});
  s.document.createElement=tag=>{
    const el=new Element(tag);
    el.closest=()=>panel;
    el.getBoundingClientRect=()=>({top:320,bottom:350});
    return el;
  };
  const picker=startIntersectionTool(s);
  assert.equal(picker.field(0)['aria-expanded'],'true');
  assert.equal(picker.field(1)['aria-expanded'],'false');
  assert.equal(panel.scrollTop,54);
  assert.equal(s.task.scene.points.length,0);
  assert.equal(s.edits.length,0);
});

test('second source excludes self, parallel, overlapping and nonintersecting geometries on every surface',()=>{
  const s=crossingSetup(),picker=startIntersectionTool(s);
  picker.choose(0,0);
  assert.equal(picker.field(1)['aria-expanded'],'true');
  assert.deepEqual(Array.from(picker.select(1).options,option=>option.value),['','1','2']);
  assert.deepEqual(intersectionMarkers(s).map(marker=>marker.pos),[[25,0],[75,0]]);
  for(const index of [0,3,4,5]){
    s.window.sceneEditor.previewSceneSource('segment',index,true);
    assert.equal(highlightedPaths(s).length,0);
    s.window.sceneEditor.chooseSceneSource('segment',index);
    assert.equal(s.task.scene.points.length,0);
    assert.equal(picker.field(1)['aria-expanded'],'true');
  }
  s.nodes['app-canvas'].fire('mousedown',{pos:[95,10]});
  assert.equal(s.task.scene.points.length,0);
  assert.equal(s.window.sceneEditor.isSelectingGeometry(),true);
  picker.choose(1,2);
  assert.equal(s.task.scene.points.length,1);
  assert.deepEqual(Array.from(s.task.scene.points[0].pos),[75,0]);
  assert.equal(s.task.scene.points[0].sources[1].ref,s.task.scene.segments[2].id);
  assert.equal(s.edits.length,1);
});

test('candidate handles select the correct source pair before source two and do not recalculate on hover or draw',()=>{
  const s=crossingSetup();
  let calculations=0;
  const intersections=s.window.sceneModel.intersections;
  s.window.sceneModel.intersections=(...args)=>{calculations++;return intersections(...args);};
  const picker=startIntersectionTool(s);
  picker.choose(0,0);
  assert.equal(calculations,5);
  for(let i=0;i<3;i++){
    s.nodes['app-canvas'].fire('mousemove',{pos:[25,20]});
    const markers=intersectionMarkers(s);
    assert.equal(markers.length,2);
    assert.equal(markers[0].state,'pickerHovered');
    assert.equal(s.task.scene.points.length,0);
  }
  assert.equal(calculations,5);
  assert.equal(picker.select(1).value,'');
  s.nodes['app-canvas'].fire('mousedown',{pos:[25,0]});
  assert.equal(s.task.scene.points.length,1);
  assert.deepEqual(Array.from(s.task.scene.points[0].pos),[25,0]);
  assert.equal(s.task.scene.points[0].sources[1].ref,s.task.scene.segments[1].id);
  assert.ok(s.task.scene.points[0].branch.params);
  assert.equal(calculations,5);
});

test('geometry keyboard navigation previews without editing and confirms only filtered candidates',()=>{
  const s=crossingSetup(),picker=startIntersectionTool(s);
  picker.field(0).fire('keydown',{key:'ArrowDown'});
  assert.equal(highlightedPaths(s).length,1);
  assert.equal(s.edits.length,0);
  picker.field(0).fire('keydown',{key:'Enter'});
  assert.equal(picker.field(1)['aria-expanded'],'true');
  picker.field(1).fire('keydown',{key:'ArrowDown'});
  assert.equal(picker.select(1).value,'');
  assert.equal(s.task.scene.points.length,0);
  picker.field(1).fire('keydown',{key:'Enter'});
  assert.equal(s.task.scene.points.length,1);
  assert.equal(s.task.scene.points[0].sources[1].ref,s.task.scene.segments[1].id);
});

test('all four ellipse crossings remain handles and source-two hover preserves other candidates',()=>{
  const s=realAngleSetup([]);
  s.task.scene.ellipses=[
    {center:[0,0],width:100,height:40},
    {center:[0,0],width:40,height:100},
    {center:[40,0],width:40,height:40}
  ];
  const picker=startIntersectionTool(s);
  picker.choose(0,0);
  const total=intersectionMarkers(s).length;
  assert.ok(total>4);
  picker.list(1).children.find(item=>item.dataset.value==='1').fire('mouseenter');
  assert.equal(intersectionMarkers(s).length,total);
  assert.equal(intersectionMarkers(s).filter(marker=>marker.state==='pickerHovered').length,4);
  picker.choose(1,1);
  const markers=intersectionMarkers(s);
  assert.equal(markers.length,4);
  assert.equal(s.task.scene.points.length,0);
  assert.equal(picker.field(1)['aria-expanded'],'false');
  s.nodes['app-canvas'].fire('mousedown',{pos:markers[0].pos});
  assert.equal(s.task.scene.points.length,1);
  assert.equal(s.task.scene.points[0].sources[1].ref,s.task.scene.ellipses[1].id);
  assert.ok(s.task.scene.points[0].branch.params);
});

test('rectangles use explicit part choices and text, arrows and points never become geometry sources',()=>{
  const s=realAngleSetup([]);
  s.task.scene.rects=[{bottomCenter:[0,0],width:100,height:60}];
  s.task.scene.arrows=[{a:[0,0],b:[100,100]}];
  s.task.scene.texts=[{pos:[0,0],text:'Text'}];
  s.task.scene.points=[{id:'p',pos:[0,0]}];
  const picker=startIntersectionTool(s);
  assert.equal(picker.select(0).options.length,5);
  for(const type of ['text','arrow','point']){
    s.window.sceneEditor.chooseSceneSource(type,0);
    assert.equal(s.window.sceneEditor.isSelectingGeometry(),true);
    assert.equal(picker.field(0)['aria-expanded'],'true');
  }
  s.window.sceneEditor.previewSceneSource('rect',0,true);
  assert.equal(highlightedPaths(s).length,4);
  s.window.sceneEditor.chooseSceneSource('rect',0);
  assert.equal(s.edits.length,0);
  assert.equal(picker.list(0).children.filter(item=>!item.hidden).length,4);
});

test('no crossing has an explicit empty state; changing source clears old handles and Esc makes no edits',()=>{
  const s=crossingSetup(),picker=startIntersectionTool(s);
  picker.choose(0,0);
  assert.equal(intersectionMarkers(s).length,2);
  picker.field(0).fire('click');
  assert.equal(intersectionMarkers(s).length,0);
  picker.choose(0,5);
  assert.equal(intersectionMarkers(s).length,0);
  assert.equal(picker.select(1).options.length,1);
  assert.match(picker.panel.children.find(child=>child.role==='status').textContent,/Ingen andre geometrier/);
  assert.equal(picker.panel.children.some(child=>child.textContent?.startsWith('Bekreft treff')),false);
  s.document.fire('keydown',{key:'Escape'});
  assert.equal(picker.panel.isConnected,false);
  assert.equal(s.task.scene.points.length,0);
  assert.equal(s.edits.length,0);
});

test('task changes and cancelled intersection reassignment preserve existing points',()=>{
  const s=crossingSetup();
  const point={id:'keep',type:'free',pos:[11,12]};
  s.task.scene.points.push(point);
  const parent=new Element('div');
  s.window.sceneEditor.buildProperties(parent,'point',point,0);
  parent.children.find(child=>child.textContent==='Gjør om til skjæringspunkt').fire('click');
  s.window.sceneEditor.chooseSceneSource('segment',0);
  assert.equal(point.type,'free');
  assert.deepEqual(point.pos,[11,12]);
  s.window.currentTask={scene:{points:[]}};
  s.window.sceneEditor.checkTask();
  assert.equal(s.window.sceneEditor.isSelectingGeometry(),false);
  assert.equal(s.nodes['scene-panel'].children.length,0);
  assert.equal(s.edits.length,0);
});

test('native dropdown change ends picker without reverting the chosen selection',()=>{
  const s=setup();
  s.open();
  s.select.value='point:segment-1:a';
  s.select.fire('change');
  assert.equal(s.select.value,'point:segment-1:a');
  assert.equal(s.window.sceneEditor.isPicking(s.select),false);
});

test('angle fields expose Symbol/tekst, remove manual control, and reject nonfinite values',()=>{
  const s=setup(), parent=new Element('div');
  const angle={start:{pos:[20,0]},vertex:{pos:[0,0]},end:{pos:[0,20]},symbol:'"><img src=x>'};
  s.task.scene.angles.push(angle);
  s.window.sceneEditor.buildProperties(parent,'angle',angle,0);
  const field=label=>parent.children.find(r=>r.children[0]?.textContent===label)?.children[1];
  assert.equal(field('Manuelle grader:'),undefined);
  const radius=field('Radius:');
  radius.value='Infinity'; radius.fire('change');
  assert.equal(angle.radius,undefined);
  assert.equal(field('Symbol/tekst:').value,'"><img src=x>');
});

test('point properties expose marker styling and use the shared compact delete button',()=>{
  const s=setup(), parent=new Element('div');
  const point={id:'point-1',type:'free',pos:[10,20],visible:true,snapping:true};
  s.task.scene.points.push(point);
  let remapped=null;
  s.window.sceneModel.remapReferences=(task,type,index,action)=>{remapped={task,type,index,action};};
  s.window.sceneEditor.buildProperties(parent,'point',point,0);
  const row=label=>parent.children.find(item=>item.children[0]?.textContent===label);
  const coordinateRow=parent.children.find(item=>item.children.some(child=>child.textContent==='x:') &&
    item.children.some(child=>child.textContent==='y:'));
  assert.ok(coordinateRow,'x and y controls share a row');
  assert.equal(coordinateRow.children.filter(child=>child.tagName==='INPUT').length,2);
  assert.equal(coordinateRow.children[0].textContent,'O:');
  assert.equal(parent.children.some(item=>['Type:','ID:'].includes(item.children[0]?.textContent)),false,
    'free point omits type and ID rows');
  const sizeStyle=parent.children.find(item=>item.children.some(child=>child.textContent==='Stil:'));
  assert.ok(sizeStyle);
  assert.ok(sizeStyle.children.findIndex(child=>child.textContent==='Størrelse:')<
    sizeStyle.children.findIndex(child=>child.textContent==='Stil:'));
  const markerStyle=sizeStyle.children.find(child=>child.tagName==='SELECT');
  assert.deepEqual(Array.from(markerStyle.options,option=>option.textContent),['○','●','□','×']);
  markerStyle.value='square';
  markerStyle.fire('change');
  assert.equal(point.markerStyle,'square');
  const color=row('Farge:').children[1];
  color.value='#123456';
  color.fire('change');
  assert.equal(point.color,'#123456');
  const fill=row('Fyllfarge:').children[1];
  assert.equal(fill.value,'#ffeb3b');
  fill.value='#abcdef';
  fill.fire('change');
  assert.equal(point.fill_color,'#abcdef');
  const size=sizeStyle.children.find(child=>child.tagName==='INPUT' && child.type==='number');
  size.value='7';
  size.fire('change');
  assert.equal(point.size,7);
  const width=row('Linje px:').children[1];
  width.value='3';
  width.fire('change');
  assert.equal(point.lineWidth,3);
  const snapRow=row('Snap');
  const remove=snapRow.children.find(child=>child.className==='scene-delete-element-btn');
  assert.ok(remove);
  assert.equal(remove.textContent,'🗑️');
  assert.equal(remove.title,'Slett point');
  remove.fire('click');
  assert.equal(s.task.scene.points.length,0);
  assert.deepEqual(remapped,{task:s.task,type:'point',index:0,action:'delete'});
});

test('points convert between free and intersection forms without changing their identity',()=>{
  const freeSetup=setup(), parent=new Element('div');
  const point={id:'point-stable',type:'free',pos:[12,34],visible:true};
  freeSetup.task.scene.points.push(point);
  freeSetup.window.sceneEditor.buildProperties(parent,'point',point,0);
  const convert=parent.children.find(child=>child.tagName==='BUTTON' &&
    child.textContent==='Gjør om til skjæringspunkt');
  assert.ok(convert);
  convert.fire('click');
  assert.equal(freeSetup.nodes['btn-add-point'].dataset.mode,'intersection');
  assert.equal(freeSetup.nodes['btn-add-point']['aria-pressed'],'true');
  const selects=freeSetup.nodes['scene-panel'].children.at(-1).children
    .filter(child=>child.tagName==='DIV').flatMap(row=>row.children)
    .filter(child=>child.tagName==='SELECT');
  assert.equal(selects.length,2);
  selects[0].value='0';
  selects[0].fire('change');
  assert.equal(point.id,'point-stable');
  assert.equal(point.type,'intersection');

  const intersectionSetup=setup(), intersectionParent=new Element('div');
  const intersection={id:'point-stable',type:'intersection',pos:[40,50],lastValidPos:[40,50],
    sources:[{ref:'segment-1'},{ref:'ellipse-1'}],branch:{params:[0.5,0.2]}};
  intersectionSetup.task.scene.points.push(intersection);
  intersectionSetup.window.sceneEditor.buildProperties(intersectionParent,'point',intersection,0);
  for(const label of ['Størrelse:','Farge:','Fyllfarge:','Linje px:']){
    assert.ok(intersectionParent.children.some(row=>row.children[0]?.textContent===label));
  }
  const fill=intersectionParent.children.find(row=>row.children[0]?.textContent==='Fyllfarge:').children[1];
  fill.value='#abcdef';
  fill.fire('change');
  assert.equal(intersection.fill_color,'#abcdef');
  const toFree=intersectionParent.children.find(child=>child.tagName==='BUTTON' &&
    child.textContent==='Gjør om til fritt punkt');
  assert.ok(toFree);
  toFree.fire('click');
  assert.equal(intersection.id,'point-stable');
  assert.equal(intersection.type,'free');
  assert.deepEqual(intersection.pos,[40,50]);
  assert.equal('sources' in intersection,false);
  assert.equal('branch' in intersection,false);
  assert.equal('lastValidPos' in intersection,false);
});

test('angle vertex picker only offers points and commits point anchor',()=>{
  const s=setup(), parent=new Element('div');
  const angle={start:{pos:[20,0]},vertex:{pos:[0,0]},end:{pos:[0,20]}};
  s.task.scene.angles.push(angle);
  s.window.sceneEditor.buildProperties(parent,'angle',angle,0);
  const vertex=parent.children.find(r=>r.children[0]?.textContent==='Toppunkt:').children[1];
  parent.children.find(r=>r.children[0]?.textContent==='Toppunkt:').children
    .find(c=>c.className==='scene-anchor-field').fire('click');
  s.nodes['app-canvas'].fire('mousedown',{pos:[100,100]});
  assert.equal(angle.vertex.anchor.type,'point');
  assert.equal(angle.vertex.anchor.ref,'segment-1');
  assert.equal(s.task.scene.points.length,0);
});

test('free anchor picker flushes prior autosave without adding a scene point',()=>{
  const s=setup(), records=[];
  s.window.autoSave=()=>records.push([s.task.scene.points.length,s.edits.length]);
  s.open();
  s.nodes['app-canvas'].fire('mousemove',{pos:[30,40]});
  assert.deepEqual(records,[]);
  s.nodes['app-canvas'].fire('mousedown',{pos:[30,40]});
  assert.deepEqual(records,[[0,0],[0,1]]);
  assert.equal(s.task.scene.points.length,0);
});

test('invalid-point hover tooltip wraps and stays in the scrolled visible canvas viewport',()=>{
  const s=setup(), canvas=s.nodes['app-canvas'], viewport=new Element('div');
  canvas.width=1000;canvas.height=700;
  canvas.getBoundingClientRect=()=>({left:-400,top:0,right:600,bottom:700,width:1000,height:700});
  viewport.getBoundingClientRect=()=>({left:0,top:0,right:200,bottom:500,width:200,height:500});
  s.nodes['canvas-container']=viewport;
  s.task.scene.points.push({pos:[579,340]});
  s.window.sceneModel.pointStatus=()=>({valid:false,reason:'Den valgte skjæringen finnes ikke lenger'});
  s.window.sceneEditor.mouse=[580,340];
  const boxes=[], texts=[];
  const ctx={save(){},restore(){},measureText:text=>({width:text.length*6}),
    fillRect:(...args)=>boxes.push(args),fillText:(...args)=>texts.push(args)};
  s.window.sceneEditor.drawOverlay(ctx);
  assert.equal(boxes.length,1);
  const [x,y,width,height]=boxes[0];
  assert.ok(x>=404 && x+width<=596);
  assert.ok(y>=4 && y+height<=496);
  assert.ok(texts.length>1,'long reason wraps instead of clipping');
  s.window.sceneEditor.mouse=[0,0];
  s.window.sceneEditor.drawOverlay(ctx);
  assert.equal(boxes.length,1,'tooltip remains hover-only');
});

test('deleted intersection source keeps a normal hidden point without an invalid marker',()=>{
  const s=setup(), context={window:s.window,console};
  for(const file of ['geometry.js','scene_render.js','scene_model.js']){
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','web',file),'utf8'),context);
    if(file==='geometry.js') context.geometry=s.window.geometry;
  }
  s.task.scene.points=[{id:'point-broken',type:'intersection',pos:[579,340],
    lastValidPos:[579,340],sources:[{ref:'segment-1',segment:'segment',deleted:true},
      {ref:'ellipse-1',curve:true}],_deletedSource:true,visible:false}];
  const canvas=s.nodes['app-canvas'], viewport=new Element('div');
  canvas.width=1000;canvas.height=700;
  canvas.getBoundingClientRect=()=>({left:-400,top:0,right:600,bottom:700,width:1000,height:700});
  viewport.getBoundingClientRect=()=>({left:0,top:0,right:200,bottom:500,width:200,height:500});
  s.nodes['canvas-container']=viewport;
  const text=[],boxes=[];
  const ctx=new Proxy({measureText:t=>({width:t.length*6}),
    fillText:(...args)=>text.push(args),fillRect:(...args)=>boxes.push(args)},
    {get:(target,key)=>key in target ? target[key] : ()=>{}});
  s.window.drawScene(ctx,s.task,true);
  assert.deepEqual(text.map(t=>t[0]),[]);
  assert.equal(s.task.scene.points[0].type,'free');
  s.window.sceneEditor.mouse=[580,340];
  s.window.sceneEditor.drawOverlay(ctx);
  assert.equal(boxes.length,0);
  text.length=0;boxes.length=0;
  s.window.editorMode=false;
  s.window.drawScene(ctx,s.task,false);
  s.window.sceneEditor.drawOverlay(ctx);
  assert.equal(text.length,0,'pupil never sees a hidden point');
});

test('lost intersection shows hover reason even while its last position remains a valid anchor',()=>{
  const s=realAngleSetup([{a:[0,0],b:[100,0]},{a:[40,-50],b:[40,50]}]);
  const model=s.window.sceneModel;
  const [a,b]=model.geometries(s.task);
  const point=model.createIntersectionPoint(s.task,a,b,model.intersections(s.task,a.source,b.source).hits[0]);
  s.task.scene.segments[1].a=[140,-50];
  s.task.scene.segments[1].b=[140,50];
  model.update(s.task);
  assert.equal(model.pointStatus(s.task,point).valid,true);
  assert.equal(model.pointStatus(s.task,point).intersectionValid,false);
  s.window.sceneEditor.mouse=[40,0];
  const texts=[];
  s.window.sceneEditor.drawOverlay({save(){},restore(){},measureText:text=>({width:text.length*6}),
    fillRect(){},fillText:text=>texts.push(text)});
  assert.ok(texts.join(' ').includes('skjæring'));
});

test('real editor offset and scrollbar client viewport clamp tooltip in scene coordinates',()=>{
  const s=setup(), canvas=s.nodes['app-canvas'], viewport=new Element('div');
  canvas.width=1400;canvas.height=1040;
  canvas.getBoundingClientRect=()=>({left:-350.4,top:-120,right:1049.6,bottom:920,width:1400,height:1040});
  viewport.getBoundingClientRect=()=>({left:0,top:80,right:558.4,bottom:472,width:558.4,height:392});
  viewport.clientWidth=543;viewport.clientHeight=377;
  s.nodes['canvas-container']=viewport;
  s.task.scene.points=[{pos:[578.8810637746619,340]}];
  s.window.sceneModel.pointStatus=()=>({valid:false,reason:'Valgt skjæring finnes ikke lenger.'});
  s.window.sceneEditor.mouse=[587.8810637746619,340];
  const boxes=[],texts=[];
  const ctx={save(){},restore(){},getTransform:()=>({a:1,b:0,c:0,d:1,e:200,f:200}),
    measureText:t=>({width:t.length*6}),fillRect:(...args)=>boxes.push(args),
    fillText:(...args)=>texts.push(args)};
  s.window.sceneEditor.drawOverlay(ctx);
  const [x,y,w,h]=boxes[0];
  assert.ok(x>=154.4 && x+w<=689.4,'bounds subtract drawing offset and exclude scrollbar');
  assert.ok(y>=4 && y+h<=373);
  const cssLeft=x+200-350.4,cssRight=cssLeft+w;
  assert.ok(cssLeft>=4 && cssRight<=539,'painted box stays entirely inside actual visible client area');
  assert.ok(x+w<s.task.scene.points[0].pos[0],'tooltip opens to left of point near right edge');
});

function realAngleSetup(segments=[]){
  const s=setup();
  Object.assign(s.window,{window:s.window,document:s.document,console});
  vm.createContext(s.window);
  for(const file of ['shared.js','geometry.js','scene_render.js','scene_model.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web',file),'utf8'),s.window);
  }
  s.window.getMousePos=e=>e.pos;
  s.task.scene.segments=segments;
  const angle={vertex:{pos:[0,0]},start:{pos:[30,0]},end:{pos:[30*Math.cos(Math.PI/6),-15]},
    radius:30,symbol:'α'};
  s.task.scene.angles.push(angle);
  const parent=new Element('div');
  const rebuild=()=>{
    parent.replaceChildren();
    s.window.sceneEditor.buildProperties(parent,'angle',angle,0);
  };
  s.window.updateScenePanel=rebuild;
  rebuild();
  const field=label=>parent.children.find(r=>r.children[0]?.textContent===label)
    .children.find(c=>c.className==='scene-anchor-field');
  const list=label=>parent.children.find(r=>r.children[0]?.textContent===label)
    .children.find(c=>c.className==='scene-anchor-list');
  return {...s,angle,parent,field,list,rebuild};
}

test('new angle sequence uses real segments, keeps suggestions unbound until Enter, and ends after Slutt',()=>{
  const s=realAngleSetup([{a:[-50,0],b:[50,0]},{a:[0,0],b:[30,-30]}]);
  s.window.sceneEditor.startAngle(s.angle);
  assert.equal(s.field('Toppunkt:')['aria-expanded'],'true');
  s.nodes['app-canvas'].fire('mousedown',{pos:[0,0]});
  assert.equal(s.field('Toppunkt:')['aria-expanded'],'false');
  assert.equal(s.field('Start:')['aria-expanded'],'true');
  assert.equal(s.angle.start.anchor,undefined);
  assert.equal(s.field('Start:').textContent,'Segment 1 · linje (0px)');
  assert.equal(s.edits.length,1);
  s.field('Start:').fire('keydown',{key:'Enter'});
  assert.equal(s.angle.start.anchor.ref,'segment-1');
  assert.equal(s.field('Slutt:')['aria-expanded'],'true');
  assert.equal(s.angle.end.anchor,undefined);
  s.field('Slutt:').fire('keydown',{key:'Enter'});
  assert.equal(s.angle.end.anchor.ref,'segment-2');
  assert.equal(s.field('Slutt:')['aria-expanded'],'false');
  assert.equal(s.window.sceneModel.angleGeometry(s.angle,s.task).degrees,45);
});

test('one reversed segment suggests Start and free Slutt 30 degrees beyond it; Esc never binds the suggestion',()=>{
  const s=realAngleSetup([{a:[30,30],b:[-30,-30]}]);
  s.window.sceneEditor.startAngle(s.angle);
  s.nodes['app-canvas'].fire('mousedown',{pos:[0,0]});
  s.field('Start:').fire('keydown',{key:'Enter'});
  assert.equal(s.angle.startReversed,true);
  assert.ok(Math.abs(s.window.sceneModel.angleGeometry(s.angle,s.task).degrees-30)<1e-8);
  const before=JSON.stringify(s.angle);
  s.document.fire('keydown',{key:'Escape'});
  assert.equal(JSON.stringify(s.angle),before);
  assert.equal(s.angle.end.anchor,undefined);
});

test('no segments through vertex means free fallbacks; Enter creates no helper points',()=>{
  const s=realAngleSetup([{a:[50,0],b:[80,0]},{a:[0,0],b:[0,0]}]);
  s.window.sceneEditor.startAngle(s.angle);
  s.nodes['app-canvas'].fire('mousedown',{pos:[0,0]});
  s.field('Start:').fire('keydown',{key:'Enter'});
  s.field('Slutt:').fire('keydown',{key:'Enter'});
  assert.equal(s.task.scene.points.length,0);
  assert.equal(s.angle.start.anchor,undefined);
  assert.equal(s.angle.end.anchor,undefined);
  assert.ok(Math.abs(s.window.sceneModel.angleGeometry(s.angle,s.task).degrees-30)<1e-8);
});

test('list confirmation advances, Frikoble keeps segment direction, and repeated field clicks reactivate',()=>{
  const s=realAngleSetup([{a:[50,0],b:[-50,0]}]);
  s.field('Start:').fire('click');
  s.list('Start:').children.find(c=>c.dataset.value==='segment:segment-1:segment').fire('click');
  assert.equal(s.field('Slutt:')['aria-expanded'],'true');
  s.document.fire('keydown',{key:'Escape'});
  s.angle.startReversed=true;
  s.rebuild();
  const before=s.window.sceneModel.angleGeometry(s.angle,s.task).degrees;
  s.field('Start:').fire('click');
  s.list('Start:').children.find(c=>c.dataset.value==='').fire('click');
  assert.equal(s.angle.start.anchor,undefined);
  assert.equal(s.angle.startReversed,false);
  assert.ok(Math.abs(s.window.sceneModel.angleGeometry(s.angle,s.task).degrees-before)<1e-8);
  s.document.fire('keydown',{key:'Escape'});
  s.field('Slutt:').fire('click');
  assert.equal(s.field('Slutt:')['aria-expanded'],'true');
});

test('external action confirms suggestion without advancing and never confirms plain hover',async()=>{
  const s=realAngleSetup([{a:[-50,0],b:[50,0]}]);
  s.window.sceneEditor.startAngle(s.angle);
  s.nodes['app-canvas'].fire('mousedown',{pos:[0,0]});
  const target=new Element('button');
  target.closest=()=>target;
  let rebuilt=0;
  s.window.updateScenePanel=()=>{rebuilt++;s.rebuild();};
  s.document.fire('click',{target});
  assert.equal(rebuilt,0,'external target must run before panel rebuild');
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(rebuilt>0);
  assert.equal(s.angle.start.anchor.ref,'segment-1');
  assert.equal(s.field('Slutt:')['aria-expanded'],'false');
  s.field('Slutt:').fire('click');
  s.nodes['app-canvas'].fire('mousemove',{pos:[0,0]});
  const before=JSON.stringify(s.angle);
  s.document.fire('click',{target});
  assert.equal(JSON.stringify(s.angle),before);
});

test('editing an existing vertex never guesses over confirmed legs; parallel segments yield only one suggestion',()=>{
  const s=realAngleSetup([{a:[-50,0],b:[50,0]},{a:[-80,0],b:[80,0]}]);
  s.angle.start.anchor={type:'segment',ref:'segment-1',segment:'segment'};
  s.angle.end.anchor={type:'segment',ref:'segment-2',segment:'segment'};
  const legs=JSON.stringify([s.angle.start,s.angle.end]);
  s.rebuild();
  s.field('Toppunkt:').fire('click');
  s.nodes['app-canvas'].fire('mousedown',{pos:[0,0]});
  assert.equal(JSON.stringify([s.angle.start,s.angle.end]),legs);
  s.document.fire('keydown',{key:'Escape'});
  delete s.angle.start.anchor;
  delete s.angle.end.anchor;
  s.rebuild();
  s.window.sceneEditor.startAngle(s.angle);
  s.nodes['app-canvas'].fire('mousedown',{pos:[0,0]});
  s.field('Start:').fire('keydown',{key:'Enter'});
  s.field('Slutt:').fire('keydown',{key:'Enter'});
  assert.equal(s.angle.start.anchor.ref,'segment-1');
  assert.equal(s.angle.end.anchor,undefined);
  assert.ok(Math.abs(s.window.sceneModel.angleGeometry(s.angle,s.task).degrees-30)<1e-8);
});

test('force list detach keeps geometry and keyboard selection can confirm a candidate',()=>{
  const s=setup();
  s.select.appendChild(Object.assign(new Element('option'),{value:'',textContent:'Frikoble'}));
  s.select.appendChild(Object.assign(new Element('option'),{value:'point:segment-1:a',textContent:'Point'}));
  s.open();
  const list=s.parent.children.find(c=>c.className==='scene-anchor-list');
  list.children.find(c=>c.dataset.value==='').fire('click');
  assert.equal(s.spec.anchor.type,'custom');
  assert.deepEqual(Array.from(s.force.anchor),[10,20]);
  assert.deepEqual(Array.from(s.force.arrowBase),[15,20]);
  assert.deepEqual(Array.from(s.force.arrowTip),[15,80]);
  s.open();
  const field=s.parent.children.find(c=>c.className==='scene-anchor-field');
  field.fire('keydown',{key:'ArrowDown'});
  field.fire('keydown',{key:'ArrowDown'});
  field.fire('keydown',{key:'Enter'});
  assert.equal(s.spec.anchor.ref,'segment-1');
});

test('reveal scrolls only when the active field is outside its own panel viewport',()=>{
  const s=setup(),field=new Element('button'),panel=new Element('div');
  panel.scrollTop=20;
  panel.getBoundingClientRect=()=>({top:100,bottom:300});
  field.closest=()=>panel;
  field.getBoundingClientRect=()=>({top:150,bottom:180});
  s.window.sceneEditor.reveal(field);
  assert.equal(panel.scrollTop,20);
  field.getBoundingClientRect=()=>({top:280,bottom:330});
  s.window.sceneEditor.reveal(field);
  assert.equal(panel.scrollTop,54);
});

function highlightedPaths(s){
  const paths=[];
  let path;
  const ctx={save(){},restore(){},beginPath(){path=[];},arc(...args){path.push(['arc',...args]);},
    moveTo(...args){path.push(['moveTo',...args]);},lineTo(...args){path.push(['lineTo',...args]);},
    stroke(){if(this.strokeStyle===s.window.ANCHOR_MARKER_STYLES.pickerHovered.color) paths.push(path);}};
  s.window.sceneEditor.drawOverlay(ctx);
  return paths;
}

test('picker point, segment and free previews consume shared styles without changing bindings',()=>{
  const s=setup();
  const calls=[];
  s.window.drawAnchorMarker=(ctx,pos,state)=>calls.push({pos:Array.from(pos),state});
  s.open();
  s.nodes['app-canvas'].fire('mousemove',{pos:[100,100]});
  s.window.sceneEditor.drawOverlay({save(){},restore(){}});
  assert.deepEqual(calls,[{pos:[100,100],state:'pickerHovered'}]);
  calls.length=0;
  s.nodes['app-canvas'].fire('mousemove',{pos:[30,40]});
  s.window.sceneEditor.drawOverlay({save(){},restore(){}});
  assert.deepEqual(calls,[{pos:[100,100],state:'pickerCandidate'},{pos:[30,40],state:'pickerPreview'}]);
  assert.equal(s.edits.length,0);
  assert.equal(s.task.scene.points.length,0);

  const a=realAngleSetup([{a:[-50,0],b:[50,0]}]);
  a.window.ANCHOR_MARKER_STYLES.pickerHovered.color='#123456';
  a.window.ANCHOR_MARKER_STYLES.pickerHovered.lineWidth=7;
  a.field('Start:').fire('click');
  a.list('Start:').children.find(c=>c.dataset.value==='segment:segment-1:segment').fire('mouseenter');
  let path;
  const lines=[];
  const ctx={save(){},restore(){},beginPath(){path=[];},arc(){},
    moveTo(...args){path.push(args);},lineTo(...args){path.push(args);},
    stroke(){if(path.length) lines.push({color:this.strokeStyle,width:this.lineWidth,path});}};
  a.window.sceneEditor.drawOverlay(ctx);
  assert.ok(lines.some(line=>line.color==='#123456' && line.width===7));
  assert.equal(a.edits.length,0);
});

test('panel hover and keyboard navigation highlight point candidates without edits; Esc restores',()=>{
  const s=setup();
  s.select.appendChild(Object.assign(new Element('option'),{value:'',textContent:'Frikoble'}));
  s.select.appendChild(Object.assign(new Element('option'),{value:'point:segment-1:a',textContent:'Point'}));
  s.open();
  const list=s.parent.children.find(c=>c.className==='scene-anchor-list');
  list.children[1].fire('mouseenter');
  assert.equal(s.select.value,'point:segment-1:a');
  assert.deepEqual(highlightedPaths(s),[[['arc',100,100,6,0,2*Math.PI]]]);
  assert.equal(s.edits.length,0);
  assert.equal(s.task.scene.points.length,0);
  assert.deepEqual(s.force.anchor,[10,20]);
  const field=s.parent.children.find(c=>c.className==='scene-anchor-field');
  field.fire('keydown',{key:'ArrowUp'});
  assert.deepEqual(highlightedPaths(s),[]);
  field.fire('keydown',{key:'ArrowDown'});
  assert.equal(highlightedPaths(s).length,1);
  s.document.fire('keydown',{key:'Escape'});
  assert.equal(s.select.value,'custom:10,20');
  assert.equal(s.edits.length,0);
});

test('angle list hover and focus highlight segment lines and clear highlight for Frikoble',()=>{
  const s=realAngleSetup([{a:[-50,0],b:[50,0]}]);
  s.field('Start:').fire('click');
  const segment=s.list('Start:').children.find(c=>c.dataset.value==='segment:segment-1:segment');
  segment.fire('mouseenter');
  assert.deepEqual(highlightedPaths(s),[[['moveTo',-50,0],['lineTo',50,0]]]);
  assert.equal(s.angle.start.anchor,undefined);
  assert.equal(s.edits.length,0);
  s.list('Start:').children[0].fire('focus');
  assert.deepEqual(highlightedPaths(s),[]);
  segment.fire('focus');
  assert.equal(highlightedPaths(s).length,1);
  segment.fire('click');
  assert.equal(s.angle.start.anchor.ref,'segment-1');
});

test('angle lists rank from selected other anchors, show complete groups, and navigate duplicate rows',()=>{
  const s=realAngleSetup([{a:[-50,0],b:[50,0]}]);
  const select=label=>s.parent.children.find(r=>r.children[0]?.textContent===label)
    .children.find(c=>c.tagName==='SELECT');
  assert.deepEqual(select('Start:').children.filter(c=>c.tagName==='OPTGROUP').map(c=>c.label),['Alle ankrene']);
  s.task.scene.points.push({id:'a-point',type:'free',pos:[0,0],snapping:false});
  s.window.sceneModel.update(s.task);
  s.angle.vertex.anchor={type:'point',ref:'a-point',point:'center'};
  s.rebuild();
  const start=select('Start:');
  assert.deepEqual(start.children.filter(c=>c.tagName==='OPTGROUP').map(c=>c.label),['5 nærmeste','Alle ankrene']);
  const near=start.children[1],all=start.children[2];
  assert.equal(near.children.length,4);
  assert.equal(all.children.length,4);
  s.field('Start:').fire('click');
  const list=s.list('Start:');
  assert.deepEqual(list.children.filter(c=>c.className==='scene-anchor-group').map(c=>c.textContent),
    ['5 nærmeste','Alle ankrene']);
  const rows=list.children.filter(c=>c.dataset.value!==undefined);
  const copies=rows.filter(c=>c.dataset.value==='point:a-point:center');
  assert.equal(copies.length,2);
  copies[1].fire('mouseenter');
  assert.equal(copies[1]['aria-selected'],'true');
  assert.equal(copies[0]['aria-selected'],'false');
  const next=rows[rows.indexOf(copies[1])+1];
  s.field('Start:').fire('keydown',{key:'ArrowDown'});
  assert.equal(next['aria-selected'],'true');
  s.document.fire('keydown',{key:'Escape'});
  assert.equal(start.value,'');
});

test('vertex nearest reference uses one selected endpoint or midpoint of two resolved endpoints',()=>{
  const s=realAngleSetup();
  s.task.scene.points.push({id:'point-1',type:'free',pos:[100,0]},
    {id:'point-2',type:'free',pos:[200,0]},{id:'point-3',type:'free',pos:[150,0]});
  const nearest=()=>{
    const row=s.parent.children.find(r=>r.children[0]?.textContent==='Toppunkt:');
    return row.children.find(c=>c.tagName==='SELECT').children.find(c=>c.label==='5 nærmeste').children[0].value;
  };
  s.angle.start.anchor={type:'point',ref:'point-1',point:'center'};
  s.rebuild();
  assert.equal(nearest(),'point:point-1:center');
  s.angle.end.anchor={type:'point',ref:'point-2',point:'center'};
  s.rebuild();
  assert.equal(nearest(),'point:point-3:center');
  s.task.scene.points[0].pos=[0,0];
  s.rebuild();
  assert.equal(nearest(),'point:point-3:center');
});
