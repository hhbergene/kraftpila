const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function loadModel(){
  const window = {WIDTH:1000,HEIGHT:640};
  const context = {window,console,Math,Date,Number,Array,JSON,Set,Map,WeakMap,RegExp};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(`${__dirname}/geometry.js`,'utf8'),context);
  vm.runInContext(fs.readFileSync(`${__dirname}/scene_render.js`,'utf8'),context);
  vm.runInContext(fs.readFileSync(`${__dirname}/scene_model.js`,'utf8'),context);
  return {window,context,geometry:window.geometry,model:window.sceneModel};
}

function taskWith(scene){
  return {scene:{rects:[],segments:[],arrows:[],ellipses:[],...scene}};
}

test('circle construction preserves actual wagon center and translates rigidly through Q and O',()=>{
  const {model,geometry}=loadModel();
  for(const side of ['inside','outside']){
    const task=taskWith({segments:[{a:[0,200],b:[400,200]}]});
    const point=model.createAttachedPoint(task,model.geometries(task)[0],[200,200]);
    const wagon=model.createWagon(task,point,{halfWidth:20,height:40,side});
    const before=model.wagonGeometry(task,wagon).center.slice();
    const state=model.enableWagonConstruction(task,wagon);
    assert.ok(geometry.distance(state.C,before)<1e-7);
    assert.equal(task.scene.ellipses[0].lockAxes,true);
    for(const handle of ['C','P']){
      const target=state[handle].map((v,i)=>v+(i?20:40));
      const solved=model.solveWagonConstruction(state,handle,target);
      assert.equal(solved.valid,true);
      model.applyWagonConstruction(task,wagon,solved);
      const current=model.wagonConstruction(task,wagon);
      assert.ok(geometry.distance(current.C,solved.C)<1e-7);
      assert.ok(geometry.distance(current.P,solved.P)<1e-7);
      assert.equal(current.radius,state.radius);
    }
    for(const handle of ['Q','O']){
      const solved=model.solveWagonConstruction(state,handle,state[handle].map(v=>v+23));
      assert.equal(solved.valid,true);
      for(const name of ['C','P','Q','O']){
        assert.ok(geometry.distance(solved[name],state[name].map(v=>v+23))<1e-8);
      }
      assert.equal(solved.height,state.height);
      assert.equal(solved.radius,state.radius);
    }
    assert.equal(model.solveWagonConstruction(state,'C',state.P).valid,false);
    assert.equal(model.solveWagonConstruction(state,'P',[NaN,0]).valid,false);
  }
});

test('existing ellipse conversion preserves IDs and supports all global cardinal handles',()=>{
  const {model,geometry}=loadModel();
  const task=taskWith({ellipses:[{center:[200,200],width:200,height:100,t_vec:[1,0]}]});
  const point=model.createAttachedPoint(task,model.geometries(task)[0],[200,150]);
  const wagon=model.createWagon(task,point,{halfWidth:15,height:50});
  const ids=[point.id,wagon.id,wagon.planeId,task.scene.ellipses[0].id];
  model.enableWagonConstruction(task,wagon);
  assert.deepEqual([point.id,wagon.id,wagon.planeId,task.scene.ellipses[0].id],ids);
  assert.equal(task.scene.ellipses.length,1);
  for(const [cardinal,direction] of Object.entries({top:[0,-1],bottom:[0,1],left:[-1,0],right:[1,0]})){
    wagon.construction.cardinal=cardinal;
    const state=model.wagonConstruction(task,wagon);
    assert.ok(geometry.distance(state.Q,state.O.map((v,i)=>v+state.radius*direction[i]))<1e-8);
  }
});

test('construction diameter limit and invalid inside height are explicit, and shared attachments follow translations',()=>{
  const {model,geometry}=loadModel();
  for(const side of ['inside','outside']){
    const task=taskWith({ellipses:[{center:[200,200],width:80,height:80}]});
    const source=model.geometries(task)[0];
    const point=model.createAttachedPoint(task,source,[200,160]);
    const other=model.createAttachedPoint(task,source,[240,200]);
    const wagon=model.createWagon(task,point,{halfWidth:40,height:120,side});
    const state={C:side==='inside'?[200,240]:[200,140],P:[200,160],O:[200,200],Q:[200,240],
      radius:40,halfWidth:40,height:120,side,ref:source.ref};
    const solved=model.solveWagonConstruction(state,'C',state.C);
    assert.equal(solved.valid,true);
    model.applyWagonConstruction(task,wagon,solved);
    assert.ok(geometry.distance(model.wagonGeometry(task,wagon).center,state.C)<1e-6);
    const translated=model.solveWagonConstruction(solved,'O',[240,260]);
    model.applyWagonConstruction(task,wagon,translated);
    assert.ok(geometry.distance(other.pos,[280,260])<1e-7);
    assert.equal(model.solveWagonConstruction({...state,radius:39},'C',state.C).valid,false);
    if(side==='inside'){
      assert.equal(model.solveWagonConstruction(state,'C',[200,180]).valid,false);
    }
  }
});

test('ellipse angles are CCW in local coordinates and arcs expose only drawn anchors',()=>{
  const {geometry}=loadModel();
  const ellipse={center:[10,20],width:8,height:4,t_vec:[1,0],startAngleDeg:300,endAngleDeg:60};
  const top=geometry.ellipsePoint(ellipse,90);
  assert.deepEqual(Array.from(top),[10,18]);
  assert.equal(geometry.ellipseAngleInSweep(ellipse,0),true);
  assert.equal(geometry.ellipseAngleInSweep(ellipse,180),false);
  const names=geometry.ellipseBoundaryPoints(ellipse).map(p=>p.name);
  assert.ok(names.includes('right_middle'));
  assert.ok(names.includes('arc_start')&&names.includes('arc_end'));
  assert.ok(!names.includes('left_middle')&&!names.includes('top_center'));
  assert.equal(geometry.ellipseSweep({startAngleDeg:0,endAngleDeg:0}).sweep,0);
  assert.equal(geometry.ellipseSweep({startAngleDeg:0,endAngleDeg:360}).sweep,360);
});

test('rectangle corner anchors follow local axes in candidates, snapping and resolution',()=>{
  const {window,model}=loadModel();
  for(const rotation of [0,Math.PI/6,Math.PI/2]){
    const t=[Math.cos(rotation),Math.sin(rotation)],n=[Math.sin(rotation),-Math.cos(rotation)];
    const rect={id:'rect-1',bottomCenter:[100,80],width:40,height:30,t_vec:t,n_vec:n};
    const task=taskWith({rects:[rect]});
    for(const [name,side,height] of [
      ['bottom_left',-1,0],['bottom_right',1,0],['top_left',-1,30],['top_right',1,30]
    ]){
      const expected=[100+side*20*t[0]+height*n[0],80+side*20*t[1]+height*n[1]];
      const cornerLabel={bottom_left:'nedre venstre',bottom_right:'nedre høyre',
        top_left:'øvre venstre',top_right:'øvre høyre'}[name];
      const candidate=model.candidates(task).find(c=>c.label===`rect-1 · ${cornerLabel}`);
      assert.ok(candidate, name);
      assert.deepEqual(Array.from(candidate.pos),expected);
      assert.deepEqual(Array.from(model.resolveAnchor(task,candidate.anchor).pos),expected);
      assert.deepEqual(Array.from(window.buildAllScenePoints(task)['rect-1'].points[name]),expected);
      assert.deepEqual(Array.from(window.buildSceneLookup(task)['rect-1'].points[name]),expected);
    }
    rect.snapping=false;
    assert.equal(Object.keys(window.buildSceneLookup(task)['rect-1'].points).length,0);
    assert.ok(model.candidates(task).some(c=>c.label==='rect-1 · øvre venstre'));
  }
});

test('line intersections are analytic, finite, and report coincident overlap',()=>{
  const {model}=loadModel();
  const task=taskWith({segments:[
    {a:[0,0],b:[10,0]},
    {a:[5,-5],b:[5,5]},
    {a:[11,-5],b:[11,5]},
    {a:[2,0],b:[8,0]},
    {a:[0,2],b:[10,2]}
  ]});
  const g=model.geometries(task);
  assert.deepEqual(Array.from(model.intersections(task,g[0].source,g[1].source).hits[0].pos),[5,0]);
  assert.equal(model.intersections(task,g[0].source,g[2].source).hits.length,0);
  assert.match(model.intersections(task,g[0].source,g[3].source).reason,/overlapper|sammenfaller/);
  assert.equal(model.intersections(task,g[0].source,g[4].source).hits.length,0);
});

test('line/ellipse respects finite segments and filters hits outside ellipse arcs',()=>{
  const {model}=loadModel();
  const task=taskWith({
    segments:[{a:[-10,0],b:[10,0]}],
    ellipses:[{center:[0,0],width:10,height:6,t_vec:[1,0],startAngleDeg:300,endAngleDeg:60}]
  });
  const [line,ellipse]=model.geometries(task);
  const result=model.intersections(task,line.source,ellipse.source);
  assert.equal(result.hits.length,1);
  assert.ok(Math.abs(result.hits[0].pos[0]-5)<1e-8);
  assert.ok(Math.abs(result.hits[0].params[1])<1e-8);
});

test('curve/curve detects crossings and deduplicates a tangent',()=>{
  const {model}=loadModel();
  const task=taskWith({ellipses:[
    {center:[0,0],width:10,height:10},{center:[6,0],width:10,height:10},
    {center:[10,0],width:10,height:10}
  ]});
  const [a,b,c]=model.geometries(task);
  const crossings=model.intersections(task,a.source,b.source).hits;
  assert.equal(crossings.length,2);
  crossings.forEach(h=>assert.ok(Math.abs(Math.hypot(h.pos[0]-0,h.pos[1])-5)<1e-6));
  const tangent=model.intersections(task,a.source,c.source).hits;
  assert.equal(tangent.length,1);
  assert.ok(Math.abs(tangent[0].pos[0]-5)<1e-5);
});

test('rotated ellipse intersections satisfy both ellipse equations',()=>{
  const {geometry,model}=loadModel();
  const task=taskWith({ellipses:[
    {center:[0,0],width:10,height:6,t_vec:[1,0]},
    {center:[3,0],width:8,height:4,t_vec:[Math.SQRT1_2,Math.SQRT1_2]}
  ]});
  const [a,b]=model.geometries(task);
  const result=model.intersections(task,a.source,b.source);
  assert.equal(result.hits.length,4);
  for(const hit of result.hits){
    for(const ellipse of [a.value,b.value]){
      const reconstructed=geometry.ellipsePoint(ellipse,hit.params[ellipse===a.value?0:1]*360);
      assert.ok(geometry.distance(hit.pos,reconstructed)<1e-6);
    }
  }
  const overlap=taskWith({ellipses:[
    {center:[0,0],width:8,height:8},{center:[0,0],width:8,height:8}
  ]});
  const [c,d]=model.geometries(overlap);
  assert.match(model.intersections(overlap,c.source,d.source).reason,/overlapper|sammenfaller/);
});

test('coincident ellipse arcs distinguish disjoint arcs from non-isolated overlap',()=>{
  const {model}=loadModel();
  const task=taskWith({ellipses:[
    {center:[0,0],width:10,height:6,startAngleDeg:0,endAngleDeg:90},
    {center:[0,0],width:10,height:6,startAngleDeg:180,endAngleDeg:270},
    {center:[0,0],width:10,height:6,startAngleDeg:80,endAngleDeg:120}
  ]});
  const [a,disjoint,overlap]=model.geometries(task);
  assert.equal(model.intersections(task,a.source,disjoint.source).hits.length,0);
  assert.match(model.intersections(task,a.source,overlap.source).reason,/overlapper|sammenfaller/);
});

test('intersection points preserve branch and last valid position through loss and recovery',()=>{
  const {model}=loadModel();
  const task=taskWith({segments:[{a:[-10,0],b:[10,0]},{a:[0,-10],b:[0,10]}]});
  const [a,b]=model.geometries(task);
  const hit=model.intersections(task,a.source,b.source).hits[0];
  const point=model.createIntersectionPoint(task,a,b,hit);
  assert.equal(model.pointStatus(task,point).valid,true);
  task.scene.segments[1].a=[5,-10]; task.scene.segments[1].b=[5,10];
  model.update(task);
  assert.equal(model.pointStatus(task,point).valid,true);
  assert.deepEqual(Array.from(point.pos),[5,0]);
  task.scene.segments[1].a=[15,-10]; task.scene.segments[1].b=[15,10];
  model.update(task);
  assert.equal(model.pointStatus(task,point).valid,true);
  assert.deepEqual(Array.from(point.pos),[5,0]);
  task.scene.segments[1].a=[0,-10]; task.scene.segments[1].b=[0,10];
  model.update(task);
  assert.equal(model.pointStatus(task,point).valid,true);
  assert.deepEqual(Array.from(point.pos),[0,0]);
  assert.equal(model.candidates(task).some(c=>c.anchor?.ref===point.id),true);
});

test('new scene point IDs use Norwegian names without reserving dangling force references',()=>{
  const {model}=loadModel();
  const task=taskWith({points:[]});
  task.expectedForces=[{name:'G',anchor:{type:'point',ref:'Punkt-1',point:'center'}}];
  task.initialForces=[{name:'N',anchorFrom:'Punkt-2',point:'center'}];
  const first=model.createPoint(task,[10,20]);
  const second=model.createPoint(task,[30,40]);
  assert.equal(first.id,'Punkt-1');
  assert.equal(second.id,'Punkt-2');
  assert.deepEqual(Array.from(task.scene.points,point=>point.id),['Punkt-1','Punkt-2']);
});

test('deleting a point detaches force references at the last source position',()=>{
  const {window,model}=loadModel();
  const point={id:'point-source',type:'free',pos:[30,40]};
  const expected={name:'G',anchor:{type:'point',ref:'point-source',point:'center'},
    drawn:{anchor:[20,30],arrowBase:[25,30],arrowTip:[25,90]}};
  const initial={name:'N',anchor:[20,30],arrowBase:[25,30],arrowTip:[25,90],
    anchorSpec:{type:'point',ref:'point-source',point:'center'}};
  const task=taskWith({points:[point]});
  task.expectedForces=[expected];
  task.initialForces=[initial];
  const expectedForce={name:'G',isExpected:true,anchor:[20,30],arrowBase:[25,30],arrowTip:[25,90],
    updateDirectionAndLength(){}};
  const initialForce={name:'N',isExpected:false,anchor:[20,30],arrowBase:[25,30],arrowTip:[25,90],
    updateDirectionAndLength(){}};
  window.fm={forces:[expectedForce,initialForce]};
  model.update(task);
  model.remapReferences(task,'point',0,'delete');
  task.scene.points.splice(0,1);
  assert.deepEqual(JSON.parse(JSON.stringify(expected.anchor)),{type:'custom',pos:[30,40]});
  assert.deepEqual(JSON.parse(JSON.stringify(expected.drawn)),
    {anchor:[30,40],arrowBase:[35,40],arrowTip:[35,100]});
  assert.deepEqual(JSON.parse(JSON.stringify(initial.anchorSpec)),{type:'custom',pos:[30,40]});
  assert.deepEqual(Array.from(initial.anchor),[30,40]);
  assert.deepEqual(Array.from(initial.arrowBase),[35,40]);
  assert.deepEqual(Array.from(initial.arrowTip),[35,100]);
  assert.deepEqual(Array.from(expectedForce.anchor),[30,40]);
  assert.deepEqual(Array.from(expectedForce.arrowBase),[35,40]);
  assert.deepEqual(Array.from(expectedForce.arrowTip),[35,100]);
  assert.deepEqual(Array.from(initialForce.anchor),[30,40]);
  assert.deepEqual(Array.from(initialForce.arrowBase),[35,40]);
  assert.deepEqual(Array.from(initialForce.arrowTip),[35,100]);
});

test('deleting a legacy anchorFrom source keeps initial force geometry and clears the reference',()=>{
  const {model}=loadModel();
  const task=taskWith({points:[{id:'point-source',type:'free',pos:[30,40]}]});
  const initial={name:'N',anchorFrom:'point-source',point:'center',anchor:[20,30],
    arrowBase:[25,30],arrowTip:[25,90]};
  task.initialForces=[initial];
  model.update(task);
  model.remapReferences(task,'point',0,'delete');
  assert.equal(initial.anchorFrom,undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(initial.anchorSpec)),{type:'custom',pos:[30,40]});
  assert.deepEqual(Array.from(initial.anchor),[30,40]);
  assert.deepEqual(Array.from(initial.arrowBase),[35,40]);
  assert.deepEqual(Array.from(initial.arrowTip),[35,100]);
});

test('a newly reused point ID cannot reattach a force already detached at its old position',()=>{
  const {window,context,model}=loadModel();
  vm.runInContext(fs.readFileSync(`${__dirname}/shared.js`,'utf8'),context);
  const force={name:'G',isExpected:true,anchor:[10,20],arrowBase:[15,20],arrowTip:[15,80],
    updateDirectionAndLength(){}};
  const spec={name:'G',anchor:{type:'point',ref:'Punkt-1',point:'center'}};
  const task=taskWith({points:[]});
  task.expectedForces=[spec];
  window.getForceSpec=()=>({spec,prop:'anchor'});
  window.fm={forces:[force]};
  assert.equal(window.syncSceneForceAnchors(task,window.fm,true),true);
  assert.deepEqual(JSON.parse(JSON.stringify(spec.anchor)),{type:'custom',pos:[10,20]});
  const point=model.createPoint(task,[90,100]);
  assert.equal(point.id,'Punkt-1');
  model.update(task);
  assert.equal(window.syncSceneForceAnchors(task,window.fm,true),false);
  assert.deepEqual(JSON.parse(JSON.stringify(spec.anchor)),{type:'custom',pos:[10,20]});
  assert.deepEqual(Array.from(force.anchor),[10,20]);
});

test('angle geometry resolves point anchors and reports degenerate rays',()=>{
  const {model}=loadModel();
  const task=taskWith({points:[
    {id:'p1',type:'free',pos:[1,0],visible:false},
    {id:'p2',type:'free',pos:[0,0],visible:false},
    {id:'p3',type:'free',pos:[0,-1],visible:false}
  ]});
  const angle={vertex:{pos:[0,0],anchor:{type:'point',ref:'p2',point:'center'}},
    start:{pos:[1,0],anchor:{type:'point',ref:'p1',point:'center'}},
    end:{pos:[0,-1],anchor:{type:'point',ref:'p3',point:'center'}},radius:20};
  const g=model.angleGeometry(angle,task);
  assert.equal(g.valid,true);
  assert.ok(Math.abs(g.degrees-90)<1e-8);
  task.scene.points[2].pos=[0,0];
  model.update(task);
  assert.equal(model.angleGeometry(angle,task).valid,false);
});

test('deleting a direct angle source detaches it and keeps the intersection as a free point',()=>{
  const {model}=loadModel();
  const task=taskWith({
    segments:[{id:'segment-1',a:[0,0],b:[10,0]},{id:'segment-2',a:[0,-5],b:[0,5]}],
    points:[{id:'crossing',type:'intersection',pos:[0,0],lastValidPos:[0,0],valid:true,
      sources:[{ref:'segment-1',segment:'segment'},{ref:'segment-2',segment:'segment'}],
      branch:{params:[0.5,0.5],id:'selected'}}],
    angles:[{vertex:{pos:[0,0]},start:{pos:[5,0],anchor:{type:'segment',ref:'segment-1',segment:'segment'}},
      end:{pos:[0,-5]},radius:20}]
  });
  model.update(task);
  model.remapReferences(task,'segment',0,'delete');
  task.scene.segments.splice(0,1);
  model.update(task);
  assert.equal(task.scene.angles[0].start.anchor,undefined);
  assert.deepEqual(Array.from(task.scene.angles[0].start.direction),[1,0]);
  assert.match(task.scene.angles[0].start.detachedReason,/slettet/);
  assert.equal(model.angleGeometry(task.scene.angles[0],task).valid,true);
  assert.equal(model.pointStatus(task,task.scene.points[0]).valid,true);
  assert.equal(task.scene.points[0].type,'free');
  assert.equal(task.scene.points[0].sources,undefined);
});

test('force and angle index references remap on reordering and force anchors detach on deletion',()=>{
  const {model}=loadModel();
  const task=taskWith({
    segments:[{id:'segment-a',a:[0,0],b:[10,0]},{id:'segment-b',a:[0,10],b:[10,10]}],
    angles:[{vertex:{pos:[0,0]},start:{pos:[5,10],anchor:{type:'segment',ref:'segment-b',segment:'segment'}},
      end:{pos:[5,0]}}]
  });
  task.expectedForces=[{name:'F',anchor:{type:'segment',ref:'segment-b',segment:'segment'}}];
  model.update(task);
  [task.scene.segments[0],task.scene.segments[1]]=[task.scene.segments[1],task.scene.segments[0]];
  model.remapReferences(task,'segment',0,'delete');
  assert.equal(task.scene.angles[0].start.anchor,undefined);
  assert.deepEqual(Array.from(task.expectedForces[0].anchor.pos),[5,10]);
  assert.equal(task.expectedForces[0].anchor.type,'custom');
});

test('rotated unequal ellipses have one isolated tangency with small coordinate residuals',()=>{
  const {geometry,model}=loadModel();
  const t=[Math.cos(0.37),Math.sin(0.37)];
  const task=taskWith({ellipses:[
    {center:[0,0],width:10,height:6,t_vec:t},
    {center:[9*t[0],9*t[1]],width:8,height:4,t_vec:t}
  ]});
  const [a,b]=model.geometries(task);
  const hits=model.intersections(task,a.source,b.source).hits;
  assert.equal(hits.length,1);
  assert.ok(geometry.distance(hits[0].pos,[5*t[0],5*t[1]])<1e-5);
  [a,b].forEach((ellipse,i)=>{
    const reconstructed=geometry.ellipsePoint(ellipse.value,hits[0].params[i]*360);
    assert.ok(geometry.distance(hits[0].pos,reconstructed)<1e-6);
  });
});

test('a disappearing arc root never switches to another nearby remaining root',()=>{
  const {model}=loadModel();
  const task=taskWith({segments:[{a:[-6,-2.9],b:[6,-2.9]}],
    ellipses:[{center:[0,0],width:10,height:6,startAngleDeg:0,endAngleDeg:360}]});
  const [line,ellipse]=model.geometries(task);
  const initial=model.intersections(task,line.source,ellipse.source).hits;
  assert.equal(initial.length,2);
  const selected=initial.find(h=>h.pos[0]<0);
  const point=model.createIntersectionPoint(task,line.source,ellipse.source,selected);
  const saved=Array.from(point.pos);
  task.scene.ellipses[0].endAngleDeg=90;
  const remaining=model.intersections(task,line.source,ellipse.source).hits;
  assert.equal(remaining.length,1);
  assert.ok(remaining[0].pos[0]>0);
  model.update(task);
  assert.equal(model.pointStatus(task,point).valid,true);
  assert.deepEqual(Array.from(point.pos),saved);
  task.scene.ellipses[0].endAngleDeg=360;
  model.update(task);
  assert.equal(model.pointStatus(task,point).valid,true);
  assert.deepEqual(Array.from(point.pos),saved);
  const imported=JSON.parse(JSON.stringify(task));
  model.update(imported);
  assert.equal(model.pointStatus(imported,imported.scene.points[0]).valid,true);
});

test('ellipse tangency annihilates a selected branch without jumping to other surviving intersections',()=>{
  const {model}=loadModel();
  const task=taskWith({ellipses:[
    {center:[0,0],width:10,height:6,t_vec:[1,0]},
    {center:[3,0],width:8,height:4,t_vec:[Math.SQRT1_2,Math.SQRT1_2]}
  ]});
  const [a,b]=model.geometries(task);
  const initial=model.intersections(task,a.source,b.source).hits;
  assert.equal(initial.length,4);
  const point=model.createIntersectionPoint(task,a.source,b.source,initial[0]);
  const saved=Array.from(point.pos);
  task.scene.ellipses[1].center[0]=3.1;
  assert.equal(model.intersections(task,a.source,b.source).hits.length,2);
  model.update(task);
  assert.equal(model.pointStatus(task,point).valid,true);
  assert.deepEqual(Array.from(point.pos),saved);
  task.scene.ellipses[1].center[0]=3;
  model.update(task);
  assert.equal(model.pointStatus(task,point).valid,true);
  assert.deepEqual(Array.from(point.pos),saved);
});

function recordingCanvas(){
  const events=[];
  let path=[];
  const context=new Proxy({},{
    get(target,key){
      if(key in target)return target[key];
      return (...args)=>{
        if(key==='beginPath')path=[];
        else if(['moveTo','lineTo','closePath','arc','ellipse'].includes(key))path.push({method:key,args});
        else if(key==='stroke'||key==='fill')events.push({method:key,path:path.map(p=>({...p})),color:target[key==='stroke'?'strokeStyle':'fillStyle']});
        else if(key==='fillText')events.push({method:key,args});
      };
    },
    set(target,key,value){target[key]=value;return true;}
  });
  return {context,events};
}

test('filled ellipse sector strokes only the curved boundary without radial strokes',()=>{
  const {window}=loadModel(),{context,events}=recordingCanvas();
  const task=taskWith({ellipses:[{center:[20,30],width:100,height:60,startAngleDeg:300,endAngleDeg:60,fill_color:'#abc'}]});
  window.drawScene(context,task,false);
  const fill=events.find(e=>e.method==='fill'),stroke=events.find(e=>e.method==='stroke');
  assert.ok(fill&&stroke);
  assert.deepEqual(fill.path[0].args,[0,0]);
  assert.equal(fill.path.some(p=>p.method==='closePath'),true);
  assert.equal(stroke.path.some(p=>p.method==='closePath'),false);
  stroke.path.filter(p=>p.method==='moveTo'||p.method==='lineTo').forEach(p=>{
    const [x,y]=p.args;
    assert.ok(Math.abs(((x-0.5)/50)**2+((y-0.5)/30)**2-1)<1e-8);
  });

});

test('right angles render rotated square markers in both modes and lookup follows the same lines',()=>{
    const {window,model}=loadModel();
    for(const rotation of [0,Math.PI/7,Math.PI*0.8]){
      for(const direction of [-1,1]){
        const vertex=[100,80],radius=30;
        const start=rotation,end=rotation+direction*Math.PI/2;
        const angle={vertex:{pos:vertex},start:{pos:[100+80*Math.cos(start),80+80*Math.sin(start)]},
          end:{pos:[100+80*Math.cos(end),80+80*Math.sin(end)]},radius,symbol:''};
        const task=taskWith({angles:[angle]});
        assert.ok(Math.abs(model.angleGeometry(angle,task).degrees-90)<1e-8);
        const lines=window.buildAllScenePoints(task).angle0.curves.arc;
        assert.equal(lines.length,2);
        const [a,corner]=lines[0],b=lines[1][1];
        assert.ok(Math.abs(Math.hypot(corner[0]-100,corner[1]-80)-radius)<1e-8);
        const side=radius/Math.sqrt(2);
        assert.ok(Math.abs(a[0]-100-side*Math.cos(start))<1e-8);
        assert.ok(Math.abs(b[1]-80-side*Math.sin(end))<1e-8);
        for(const editor of [true,false]){
          const {context,events}=recordingCanvas();
          window.drawScene(context,task,editor);
          const stroke=events.find(e=>e.method==='stroke'&&e.path.some(p=>p.method==='moveTo'));
          assert.deepEqual(stroke.path.map(p=>p.method),['moveTo','lineTo','lineTo']);
          assert.deepEqual(stroke.path.map(p=>p.args),[Array.from(a),Array.from(corner),Array.from(b)]);
        }
        angle.end.pos=[100+80*Math.cos(end+0.001),80+80*Math.sin(end+0.001)];
        const {context,events}=recordingCanvas();
        window.drawScene(context,task,false);
        assert.equal(events.find(e=>e.method==='stroke'&&e.path[0].method==='arc'&&e.path[0].args[2]===radius).path[0].method,'arc');
        assert.ok(window.buildAllScenePoints(task).angle0.curves.arc.length>2);
      }
    }
});

test('deleted intersection sources leave a normal point at its last position',()=>{
  const {window}=loadModel();
  const task=taskWith({points:[{id:'intersection-1',type:'intersection',pos:[40,50],lastValidPos:[40,50],visible:true,
    sources:[{ref:'segment-1',segment:'segment',deleted:true},{ref:'segment-2',segment:'segment'}]}]});
  const editor=recordingCanvas(),pupil=recordingCanvas();
  window.drawScene(editor.context,task,true);
  window.drawScene(pupil.context,task,false);
  assert.equal(task.scene.points[0].type,'free');
  assert.deepEqual(Array.from(task.scene.points[0].pos),[40,50]);
  assert.equal(editor.events.some(e=>e.method==='fillText'&&e.args[0]==='!'),false);
  assert.equal(editor.events.some(e=>e.method==='stroke'&&e.color==='#d22'),false);
  assert.equal(pupil.events.some(e=>e.method==='fillText'),false);
  assert.equal(pupil.events.some(e=>e.method==='stroke'&&e.color==='#d22'),false);
  task.scene.points[0].visible=false;
  const hidden=recordingCanvas();
  window.drawScene(hidden.context,task,false);
  assert.equal(hidden.events.length,0);
  assert.deepEqual(Array.from(window.buildAllScenePoints(task)['intersection-1'].points.center),[40,50]);
});

test('editor intersection styling distinguishes a lost crossing without changing pupil styling or bindings',()=>{
  const {window,model}=loadModel();
  const task=taskWith({segments:[
    {a:[0,0],b:[100,0]},{a:[40,-50],b:[40,50]}
  ]});
  const [a,b]=model.geometries(task);
  const point=model.createIntersectionPoint(task,a,b,model.intersections(task,a.source,b.source).hits[0]);
  Object.assign(point,{visible:true,color:'#123456',fill_color:'#abcdef',markerStyle:'filled',size:5,lineWidth:3});
  const binding=JSON.stringify({sources:point.sources,branch:point.branch});
  const render=editor=>{
    const canvas=recordingCanvas();
    window.drawScene(canvas.context,task,editor);
    return canvas.events;
  };
  const pointEvents=events=>events.filter(event=>['fill','stroke'].includes(event.method) &&
    event.path.some(part=>part.method==='arc' || part.method==='moveTo' && part.args[0]===35));
  const valid=pointEvents(render(true));
  assert.ok(valid.some(event=>event.method==='fill'&&event.color==='#abcdef'&&event.path[0].method==='arc'));
  assert.ok(valid.some(event=>event.method==='stroke'&&event.color==='#123456'));
  assert.equal(model.pointStatus(task,point).intersectionValid,true);
  const pupilBefore=render(false);
  assert.equal(pupilBefore.some(event=>event.color==='#ffeb3b'),false);
  assert.ok(pupilBefore.some(event=>event.method==='fill'&&event.color==='#abcdef'));
  task.scene.segments[1].a=[140,-50];
  task.scene.segments[1].b=[140,50];
  const lost=render(true);
  const cross=lost.find(event=>event.method==='stroke'&&event.color==='#d22');
  assert.ok(cross);
  assert.deepEqual(cross.path.map(part=>({method:part.method,args:Array.from(part.args)})),[
    {method:'moveTo',args:[34,-6]},{method:'lineTo',args:[46,6]},
    {method:'moveTo',args:[34,6]},{method:'lineTo',args:[46,-6]}
  ]);
  assert.equal(lost.some(event=>event.method==='fill'||event.method==='fillText'||
    event.path?.some(part=>part.method==='arc')),false);
  assert.deepEqual(Array.from(point.pos),[40,0]);
  assert.equal(model.pointStatus(task,point).valid,true,'last position remains usable by anchors');
  assert.equal(model.pointStatus(task,point).intersectionValid,false);
  assert.match(model.pointStatus(task,point).reason,/skjæring/i);
  assert.equal(JSON.stringify({sources:point.sources,branch:point.branch}),binding);
  const pupilLost=render(false);
  assert.equal(pupilLost.some(event=>event.color==='#d22'||event.color==='#ffeb3b'),false);
  assert.ok(pupilLost.some(event=>event.method==='stroke'&&event.color==='#123456'));
  task.scene.segments[1].a=[40,-50];
  task.scene.segments[1].b=[40,50];
  assert.ok(render(true).some(event=>event.method==='fill'&&event.color==='#abcdef'));
  assert.equal(model.pointStatus(task,point).intersectionValid,true);
  assert.equal(model.pointStatus(task,point).reason,null);
  assert.equal(point.color,'#123456');
  assert.equal(point.markerStyle,'filled');
  point.visible=false;
  assert.equal(render(false).some(event=>event.color==='#123456'),false);
});

test('free point rendering keeps its configured fill rather than editor intersection colors',()=>{
  const {window}=loadModel();
  const task=taskWith({points:[{id:'free',type:'free',pos:[20,30],color:'#123456',fill_color:'#abcdef',markerStyle:'filled'}]});
  const canvas=recordingCanvas();
  window.drawScene(canvas.context,task,true);
  assert.ok(canvas.events.some(event=>event.method==='fill'&&event.color==='#abcdef'));
  assert.equal(canvas.events.some(event=>event.color==='#ffeb3b'||event.color==='#d22'),false);
});

test('both point types use yellow default fill and honor shared styles in editor and pupil modes',()=>{
  const {window,model}=loadModel();
  const task=taskWith({segments:[{a:[0,0],b:[100,0]},{a:[40,-50],b:[40,50]}]});
  const [a,b]=model.geometries(task);
  const intersection=model.createIntersectionPoint(task,a,b,model.intersections(task,a.source,b.source).hits[0]);
  const free=model.createPoint(task,[60,20]);
  for(const point of [free,intersection]) point.visible=true;
  for(const editor of [true,false]){
    const canvas=recordingCanvas();
    window.drawScene(canvas.context,task,editor);
    assert.equal(canvas.events.filter(event=>event.method==='fill'&&event.color==='#ffeb3b').length,2);
    for(const point of [free,intersection]){
      point.fill_color='#abcdef';
      point.color='#123456';
      point.markerStyle='cross';
    }
    const crosses=recordingCanvas();
    window.drawScene(crosses.context,task,editor);
    assert.equal(crosses.events.some(event=>event.method==='fill'),false);
    assert.equal(crosses.events.filter(event=>event.method==='stroke'&&event.color==='#123456').length,2);
    for(const point of [free,intersection]){
      delete point.fill_color;
      delete point.color;
      delete point.markerStyle;
    }
  }
});

test('all anchor and geometry labels show actual IDs without changing bindings',()=>{
  const {model}=loadModel();
  const task=taskWith({planes:[{id:'plane-1',through:[0,0],t_vec:[1,0],draw:true}],activePlaneId:'plane-1',
    rects:[{bottomCenter:[0,0],width:40,height:20},{bottomCenter:[100,0],width:40,height:20}],
    segments:[{a:[0,0],b:[30,0]}],arrows:[{a:[0,0],b:[40,0]}],
    ellipses:[{center:[0,0],width:40,height:20}],
    points:[{id:'point-17',type:'free',pos:[5,5],visible:false}],texts:[{txt:'t',pos:[8,8]}]});
  const geometries=model.geometries(task);
  for(const geometry of geometries){
    assert.ok(geometry.label.startsWith(`${geometry.ref} · `));
    assert.notEqual(geometry.label,geometry.ref);
  }
  const labels=model.candidates(task).map(candidate=>candidate.label);
  for(const label of ['Rektangel-1 · bunn','Rektangel-2 · høyre','Segment-1 · linje','Pil-1 · pilspiss',
    'Ellipse-1 · sentrum','Ellipse-1 · topp','plane-1 · plan','point-17 · sentrum','Tekst-1 · tekstposisjon']){
    assert.ok(labels.includes(label),label);
  }
  const bottom=model.candidates(task).find(c=>c.label==='Rektangel-2 · bunn');
  assert.equal(bottom.anchor.ref,'Rektangel-2');
  assert.equal(bottom.anchor.point,'bottom_center');
  const point=model.candidates(task).find(c=>c.label==='point-17 · sentrum');
  assert.equal(point.anchor.ref,'point-17');
});

test('anchor ordering is natural and nearest uses finite segment distance with deterministic ties',()=>{
  const {model}=loadModel();
  const task=taskWith({segments:[{id:'segment-1',a:[0,0],b:[1000,0]}],points:[
    {id:'point-10',type:'free',pos:[0,10]},{id:'point-2',type:'free',pos:[0,-10]}]});
  const list=[
    {anchor:{type:'custom',ref:'rect10',pos:[40,0]}},
    {anchor:{type:'custom',ref:'rect2',pos:[20,0]}},
    {anchor:{type:'segment',ref:'segment-1',segment:'segment'}},
    ...model.candidates(task).filter(c=>c.ref?.startsWith('point-'))
  ];
  const ordered=model.orderAnchors(task,list,[0,0]);
  assert.deepEqual(ordered.all.map(c=>c.anchor.ref),['point-2','point-10','rect2','rect10','segment-1']);
  assert.deepEqual(ordered.nearest.map(e=>e.candidate.anchor.ref),['segment-1','point-2','point-10','rect2','rect10']);
  assert.equal(ordered.nearest[0].distance,0);
  assert.equal(model.orderAnchors(task,[list[2]],[1100,0]).nearest[0].distance,100);
  assert.equal(model.orderAnchors(task,list,null).nearest.length,0);
  assert.equal(model.orderAnchors(task,list.slice(0,2),[0,0]).nearest.length,2);
  const many=Array.from({length:10},(_,i)=>({anchor:{type:'custom',ref:`rect${i}`,pos:[i,0]}}));
  const result=model.orderAnchors(task,many,[0,0]);
  assert.equal(result.nearest.length,5);
  assert.equal(result.all.length,10);
});

test('shared lookup migrates legacy circles and exposes ellipse curve samples',()=>{
  const {window,model,geometry}=loadModel();
  const ellipse={center:[100,100],width:120,height:60,t_vec:[Math.SQRT1_2,Math.SQRT1_2],startAngleDeg:300,endAngleDeg:60};
  const task=taskWith({ellipses:[ellipse],circles:[{center:[0,0],radius:20}],
    angles:[{vertex:{pos:[0,0]},start:{pos:[100,0]},end:{pos:[0,-100]},radius:40}]});
  const lookup=window.buildAllScenePoints(task),outline=lookup['Ellipse-1'].curves.outline;
  assert.equal(Object.hasOwn(task.scene,'circles'),false);
  assert.ok(lookup['Ellipse-2'].curves.outline.length>0);
  assert.ok(outline.length>0);
  assert.deepEqual(Object.keys(lookup.ellipse0.segments),[]);
  assert.deepEqual(Object.keys(lookup['Vinkel-1'].segments),[]);
  assert.ok(lookup['Vinkel-1'].curves.arc.length>0);
  const candidates=model.candidates(task);
  assert.equal(candidates.some(c=>c.anchor?.type==='segment'&&(c.ref==='Ellipse-1'||c.ref==='Ellipse-2'||c.ref==='Vinkel-1')),false);
  assert.ok(geometry.distance(outline[0][0],geometry.ellipsePoint(ellipse,300))<1e-8);
  assert.ok(geometry.distance(outline.at(-1)[1],geometry.ellipsePoint(ellipse,60))<1e-8);
  outline.forEach(([a,b])=>{
    [a,b].forEach(p=>assert.equal(geometry.ellipseAngleInSweep(ellipse,geometry.ellipseParameter(ellipse,p)*180/Math.PI),true));
  });
  const excluded=geometry.ellipsePoint(ellipse,180);
  assert.ok(Math.min(...outline.map(([a,b])=>geometry.distPointToSegment(excluded,a,b)))>20);
  const migratedOutline=lookup['Ellipse-2'].curves.outline;
  const samples=model.sampleCurve(task,{ref:'Ellipse-2',curve:true});
  assert.equal(samples.length,migratedOutline.length);
  assert.equal(window.buildSceneLookup(task)['Ellipse-2'].curves.outline.length,migratedOutline.length);
  ellipse.endAngleDeg=ellipse.startAngleDeg;
  assert.equal(window.buildAllScenePoints(task)['Ellipse-1'].curves.outline.length,0);
});

test('ellipse axis length helper keeps dimensions equal only while locked',()=>{
  const {model}=loadModel();
  const ellipse={width:40,height:20,lockAxes:true};
  model.setEllipseAxisLength(ellipse,'height',60);
  assert.deepEqual(ellipse,{width:60,height:60,lockAxes:true  });

  test('attached point follows ellipse geometry and becomes explicitly invalid when source is deleted',()=>{
    const {geometry,model}=loadModel();
    const ellipse={id:'loop',center:[0,0],width:100,height:80,t_vec:[1,0]};
    const task=taskWith({ellipses:[ellipse]});
    const source=model.geometries(task).find(item=>item.ref==='loop');
    const initial=geometry.ellipsePoint(ellipse,45);
    const point=model.createAttachedPoint(task,source,initial);
    const id=point.id;
    assert.equal(point.type,'attached');
    assert.equal(model.pointStatus(task,point).valid,true);
    ellipse.center=[10,20];
    model.update(task);
    assert.ok(geometry.distance(point.pos,geometry.ellipsePoint(ellipse,45))<1e-8);
    assert.equal(point.id,id);
    assert.ok(geometry.distance(model.resolveAnchor(task,{type:'point',ref:id,point:'center'}).pos,
      point.pos)<1e-8);
    assert.ok(model.candidates(task).some(candidate=>candidate.anchor?.ref===id));
    const last=point.pos.slice();
    model.remapReferences(task,'ellipse',0,'delete');
    task.scene.ellipses.splice(0,1);
    model.update(task);
    assert.equal(point.valid,false);
    assert.deepEqual(Array.from(point.pos),Array.from(last));
  });

  test('attached points follow rectangle sides and straight-track wagons overhang endpoints',()=>{
    const {model}=loadModel();
    const rect={bottomCenter:[0,0],width:100,height:60,t_vec:[1,0],n_vec:[0,-1]};
    const task=taskWith({rects:[rect]});
    const source=model.geometries(task).find(item=>item.ref==='Rektangel-1'&&item.source.segment==='top');
    const point=model.createAttachedPoint(task,source,[50,-60]);
    const wagon=model.createWagon(task,point,{halfWidth:70,height:12});
    const g=model.wagonGeometry(task,wagon);
    assert.equal(g.valid,true);
    assert.deepEqual(Array.from(g.bottomLeft),[-20,-60]);
    assert.deepEqual(Array.from(g.bottomRight),[120,-60]);
    assert.deepEqual(Array.from(g.topLeft),[-20,-72]);
    const plane=task.scene.planes.find(item=>item.id===wagon.planeId);
    assert.equal(plane.draw,false);
    assert.deepEqual(Array.from(plane.through),Array.from(g.bottomCenter));
    assert.deepEqual(Array.from(plane.t_vec),Array.from(g.tangent));
  });

  test('ellipse wagon bottom is a requested-length chord and inside/outside select opposite normals',()=>{
    const {geometry,model}=loadModel();
    const task=taskWith({ellipses:[{center:[0,0],width:100,height:100,t_vec:[1,0]}]});
    const source=model.geometries(task).find(item=>item.ref==='Ellipse-1');
    const point=model.createAttachedPoint(task,source,[50,0]);
    const wagon=model.createWagon(task,point,{halfWidth:20,height:10});
    const outside=model.wagonGeometry(task,wagon);
    assert.equal(outside.valid,true);
    assert.ok(Math.abs(geometry.distance(outside.bottomLeft,outside.bottomRight)-40)<1e-7);
    for(const endpoint of [outside.bottomLeft,outside.bottomRight]){
      assert.ok(Math.abs((endpoint[0]**2+endpoint[1]**2)-2500)<1e-5);
    }
    assert.ok(outside.normal[0]>0);
    wagon.side='inside';
    const inside=model.wagonGeometry(task,wagon);
    assert.ok(inside.normal[0]<0);
    assert.ok(Math.abs(inside.bottomLeft[0]-outside.bottomLeft[0])<1e-7);
  });

  test('wagon-bottom anchor exposes the chord and accepts points on the curved bottom',()=>{
    const {geometry,model}=loadModel();
    const task=taskWith({ellipses:[{center:[0,0],width:100,height:100,t_vec:[1,0]}]});
    const source=model.geometries(task).find(item=>item.ref==='Ellipse-1');
    const point=model.createAttachedPoint(task,source,[50,0]);
    const wagon=model.createWagon(task,point,{halfWidth:20,height:10});
    const candidate=model.candidates(task).find(item=>
      item.anchor?.type==='segment'&&item.anchor.ref===wagon.id&&item.anchor.segment==='bottom');
    assert.ok(candidate);
    assert.match(candidate.label,/vognbunn.*bue og korde/i);
    const resolved=model.resolveAnchor(task,candidate.anchor);
    const shape=model.wagonGeometry(task,wagon);
    assert.equal(resolved.valid,true);
    assert.ok(geometry.distance(resolved.pos,shape.bottomCenter)<1e-8);
    assert.ok(model.distanceToAnchor(task,candidate.anchor,point.pos)<1e-8);
    assert.ok(model.distanceToAnchor(task,candidate.anchor,shape.bottomCenter)<1e-8);
    assert.ok(model.distanceToAnchor(task,candidate.anchor,[0,0])>5);
  });

  test('rotated ellipse wagons solve chords in the ellipse local frame',()=>{
    const {geometry,model}=loadModel();
    const ellipse={center:[7,-3],width:120,height:40,t_vec:[Math.SQRT1_2,Math.SQRT1_2]};
    const task=taskWith({ellipses:[ellipse]});
    const source=model.geometries(task).find(item=>item.ref==='Ellipse-1');
    const point=model.createAttachedPoint(task,source,geometry.ellipsePoint(ellipse,30));
    const wagon=model.createWagon(task,point,{halfWidth:10,height:8});
    const result=model.wagonGeometry(task,wagon);
    assert.equal(result.valid,true);
    assert.ok(Math.abs(geometry.distance(result.bottomLeft,result.bottomRight)-20)<1e-7);
    for(const endpoint of [result.bottomLeft,result.bottomRight]){
      const delta=[endpoint[0]-ellipse.center[0],endpoint[1]-ellipse.center[1]];
      const frame=geometry.ellipseFrame(ellipse);
      const x=geometry.dot(delta,frame.t)/frame.rx;
      const y=geometry.dot(delta,frame.n)/frame.ry;
      assert.ok(Math.abs(x*x+y*y-1)<1e-8);
    }
  });

  test('ellipse wagon keeps impossible requested width and linked plane follows the wagon',()=>{
    const {model}=loadModel();
    const ellipse={center:[0,0],width:30,height:30,t_vec:[1,0]};
    const task=taskWith({ellipses:[ellipse],planes:[{id:'hidden-plane',through:[0,0],draw:false}]});
    const source=model.geometries(task).find(item=>item.ref==='Ellipse-1');
    const point=model.createAttachedPoint(task,source,[15,0]);
    const wagon=model.createWagon(task,point,{halfWidth:20,height:10});
    assert.equal(wagon.planeId,'hidden-plane');
    assert.equal(wagon.halfWidth,20);
    assert.equal(wagon.valid,false);
    assert.match(wagon.reason,/kordebredde/);
    ellipse.width=100;ellipse.height=100;
    model.update(task);
    assert.equal(wagon.halfWidth,20);
    assert.equal(wagon.valid,true);
    const plane=task.scene.planes[0];
    assert.equal(plane.draw,false);
    assert.equal(plane.lockedTo.ref,wagon.id);
    const before=plane.through.slice();
    point.attachment.u=0.25;
    model.update(task);
    assert.notDeepEqual(Array.from(plane.through),Array.from(before));
  });

  test('wagon does not reuse an invisible plane locked to another element',()=>{
    const {model}=loadModel();
    const task=taskWith({segments:[{a:[0,0],b:[100,0]}],
      planes:[{id:'already-locked',through:[0,0],draw:false,lockedTo:{type:'other',ref:'other-1'}}]});
    const source=model.geometries(task).find(item=>item.ref==='Segment-1');
    const point=model.createAttachedPoint(task,source,[50,0]);
    const wagon=model.createWagon(task,point);
    assert.notEqual(wagon.planeId,'already-locked');
    assert.equal(task.scene.planes.length,2);
    assert.equal(task.scene.planes.find(plane=>plane.id==='already-locked').lockedTo.ref,'other-1');
    assert.equal(task.scene.planes.find(plane=>plane.id===wagon.planeId).lockedTo.ref,wagon.id);
  });

  test('wagon snap points and persistent anchors expose center, corners and placement and follow edits',()=>{
    const {model,window,geometry,context}=loadModel();
    vm.runInContext(fs.readFileSync(`${__dirname}/snapping.js`,'utf8'),context);
    window.enableSnap=true;
    const task=taskWith({ellipses:[{center:[200,200],width:200,height:120}]});
    const source=model.geometries(task).find(source=>source.curve);
    const point=model.createAttachedPoint(task,source,[200,140]);
    const wagon=model.createWagon(task,point,{halfWidth:25,height:20});
    const names=['center','bottomLeft','bottomRight','topLeft','topRight','placement'];
    const check=()=>{
      const shape=model.wagonGeometry(task,wagon);
      const snap=window.buildSceneLookup(task)[wagon.id];
      const all=window.buildAllScenePoints(task)[wagon.id];
      assert.equal(snap.snapping,true);
      for(const name of names){
        const expected=name==='placement'?point.pos:shape[name];
        assert.ok(geometry.distance(snap.points[name],expected)<1e-8);
        assert.ok(geometry.distance(all.points[name],expected)<1e-8);
        const candidate=model.candidates(task).find(item=>item.ref===wagon.id&&item.anchor.point===name);
        assert.ok(candidate,`missing ${name} anchor`);
        const resolved=model.resolveAnchor(task,candidate.anchor);
        assert.equal(resolved.valid,true);
        assert.ok(geometry.distance(resolved.pos,expected)<1e-8);
        const snapped=window.snapping.snap(expected,{points:window.snapping.buildSnapPoints(window.buildSceneLookup(task)),
          gridStep:20,origin:[0,0]});
        assert.equal(snapped.source,'point');
        assert.ok(geometry.distance(snapped.pos,expected)<1e-8);
      }
    };
    check();
    wagon.halfWidth=35;
    wagon.height=30;
    point.attachment.u=0.1;
    task.scene.ellipses[0].center=[300,250];
    model.update(task);
    check();
    wagon.snapping=false;
    assert.equal(window.buildSceneLookup(task)[wagon.id].snapping,false);
    assert.equal(Object.keys(window.buildSceneLookup(task)[wagon.id].points).length,0);
    assert.ok(window.buildAllScenePoints(task)[wagon.id].points.center);
    assert.equal(model.candidates(task).filter(item=>item.ref===wagon.id).length,0);
    assert.ok(model.candidates(task,true).some(item=>item.ref===wagon.id));
    wagon.snapping=true;
    wagon.halfWidth=1000;
    model.update(task);
    assert.equal(window.buildSceneLookup(task)[wagon.id].snapping,false);
    assert.equal(model.resolveAnchor(task,{type:'point',ref:wagon.id,point:'center'}).valid,false);
  });

  test('deleting a wagon deletes its plane when shared and unlocks the sole plane',()=>{
    const {model}=loadModel();
    const makeWagon=task=>{
      const source=model.geometries(task).find(item=>item.ref==='Segment-1');
      const point=model.createAttachedPoint(task,source,[50,0]);
      return model.createWagon(task,point);
    };
    const sole=taskWith({segments:[{a:[0,0],b:[100,0]}],planes:[]});
    const singleWagon=makeWagon(sole),singlePlane=sole.scene.planes[0];
    assert.equal(model.deleteWagon(sole,singleWagon),true);
    assert.equal(sole.scene.planes.length,1);
    assert.equal(singlePlane.lockedTo,undefined);

    const shared=taskWith({segments:[{a:[0,0],b:[100,0]}],
      planes:[{id:'other-plane',through:[0,0],draw:true}]});
    const wagon=makeWagon(shared),linkedId=wagon.planeId;
    assert.equal(shared.scene.planes.length,2);
    model.deleteWagon(shared,wagon);
    assert.equal(shared.scene.planes.length,1);
    assert.equal(shared.scene.planes[0].id,'other-plane');
    assert.equal(shared.scene.planes.some(plane=>plane.id===linkedId),false);
  });
  ellipse.lockAxes=false;
  model.setEllipseAxisLength(ellipse,'width',80);
  assert.deepEqual(ellipse,{width:80,height:60,lockAxes:false});
  assert.throws(()=>model.setEllipseAxisLength(ellipse,'width',0),/større enn null/);
});
