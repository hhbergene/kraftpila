const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');

function runtime(){
  const window={console,enableSnap:true};
  window.window=window;
  vm.createContext(window);
  for(const file of ['shared.js','geometry.js','forces.js','scene_render.js','scene_model.js','snapping.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),window);
  }
  return window;
}

test('enabled scene points outrank closer grid points, retaining exact coordinates',()=>{
  const window=runtime();
  const anchor=[530.25,248.5];
  for(const pos of [anchor,[539,240],[540,240]]){
    const result=window.snapping.snap(pos,{points:[anchor],origin:[500,340],gridStep:20});
    assert.equal(result.source,'point');
    assert.deepEqual(Array.from(result.pos),anchor);
  }
  const outside=window.snapping.snap([560,240],{points:[anchor],gridStep:20});
  assert.equal(outside.source,'grid');
  window.enableSnap=false;
  const pos=[539,240];
  assert.equal(window.snapping.snap(pos,{points:[anchor]}).pos,pos);
});

test('01abc uses the off-grid rope endpoint beside the ellipse rather than grid',()=>{
  const window=runtime();
  const data=JSON.parse(fs.readFileSync(path.join(root,'taskset_Default.json'),'utf8'));
  const task=data.tasks.find(task=>task.id.endsWith('01abc'));
  assert.ok(task);
  window.sceneModel.update(task);
  const points=window.snapping.buildSnapPoints(window.buildSceneLookup(task));
  const anchor=window.sceneModel.resolveAnchor(task,task.expectedForces[0].anchor).pos;
  assert.ok(anchor);
  const result=window.snapping.snap(anchor,{points,gridStep:20,origin:window.DRAW_CENTER});
  assert.equal(result.source,'point');
  assert.deepEqual(Array.from(result.pos),Array.from(anchor));
});

test('scene snapping flags exclude disabled elements from force snapping',()=>{
  const window=runtime();
  const task={origin:[500,240],scene:{ellipses:[
    {center:[530,248],width:80,height:60,snapping:true}
  ]}};
  const snap=()=>{
    const points=window.snapping.buildSnapPoints(window.buildSceneLookup(task));
    return window.snapping.snap([530,248],{points,origin:window.DRAW_CENTER,gridStep:20});
  };
  assert.equal(snap().source,'point');
  task.scene.ellipses[0].snapping=false;
  const result=snap();
  assert.notEqual(result.source,'point');
  assert.deepEqual(Array.from(result.pos),[540,240]);
});

test('segments, arrows and texts supply snap points only while element snapping is enabled',()=>{
  const window=runtime();
  for(const [collection,element,anchor] of [
    ['segments',{a:[530,248],b:[650,40]},[530,248]],
    ['arrows',{a:[530,248],b:[650,40]},[530,248]],
    ['texts',{txt:'A',pos:[530,248]},[530,248]]
  ]){
    const task={origin:[0,0],scene:{[collection]:[{...element,snapping:true}]}};
    const getResult=()=>window.snapping.snap(anchor,{
      points:window.snapping.buildSnapPoints(window.buildSceneLookup(task))
    });
    assert.equal(getResult().source,'point',collection);
    task.scene[collection][0].snapping=false;
    assert.equal(getResult().source,'grid',collection);
  }
});

test('scene point radius is inclusive and grid/guideline fallbacks remain available',()=>{
  const window=runtime();
  const options={points:[[20,0]],gridStep:20};
  assert.equal(window.snapping.snap([0,0],options).source,'point');
  assert.equal(window.snapping.snap([-0.01,0],options).source,'grid');
  const withAxes={points:[[40,35]],gridStep:20,axesDir:{t_vec:[1,0.7],n_vec:[-0.7,1]}};
  assert.equal(window.snapping.snap([40,28],withAxes).source,'point');
  const noPoint=window.snapping.snap([40,28],{...withAxes,points:[]});
  assert.equal(noPoint.source,'guideline');
  assert.deepEqual(Array.from(noPoint.pos),[40,28]);
});

test('relative grid preserves fractional offsets and ignores absolute grid, points and guidelines',()=>{
  const window=runtime();
  const options={
    origin:[530.25,248.5],gridStep:20,relativeGridOnly:true,
    points:[[560,240]],axesDir:{t_vec:[1,0.7],n_vec:[-0.7,1]}
  };
  const result=window.snapping.snap([560,240],options);
  assert.equal(result.source,'origin-grid');
  assert.deepEqual(Array.from(result.pos),[550.25,248.5]);
  assert.deepEqual(Array.from(window.snapping.snap([491,210],options).pos),[490.25,208.5]);
  window.enableSnap=false;
  const pos=[560,240];
  assert.equal(window.snapping.snap(pos,options).pos,pos);
});

for(const file of ['main.js','editor.js']){
  test(`${file}: tip grid follows base and body grid follows anchor without changing the vector`,()=>{
    const window=runtime();
    vm.runInContext(fs.readFileSync(path.join(root,'web','forces.js'),'utf8'),window);
    const source=fs.readFileSync(path.join(root,'web',file),'utf8');
    const start=source.indexOf('    // If active force is drawing/dragging, forward motion');
    const end=source.indexOf('      ensureInputMeta();',start)+'      ensureInputMeta();'.length;
    assert.ok(start>=0 && end>start);
    vm.runInContext(`function move(active,pos){
      const e={movementX:0,movementY:0}, GRID_STEP=20, inputsContainer=null;
      const ensureInputMeta=()=>{};
      ${source.slice(start,end)}
      }
    }`,window);
    window.currentTask={scene:{plane:{t_vec:[1,0.7],n_vec:[-0.7,1]}}};
    window.snapPoints=[[560,240]];
    window.fm={syncInputs(){}};
    const force=new window.Force();
    force.anchor=[530.25,248.5];
    force.arrowBase=force.anchor.slice();
    for(const drawing of [true,false]){
      force.drawing=drawing;
      force.dragging=drawing ? null : 'arrowTip';
      window.move(force,[560,240]);
      assert.deepEqual(Array.from(force.arrowTip),[550.25,248.5]);
    }
    force.dragging='body';
    force.drag_offset=[0,0];
    window.move(force,[560,240]);
    assert.deepEqual(Array.from(force.anchor),[530.25,248.5]);
    assert.deepEqual(Array.from(force.arrowBase),[560,240]);
    assert.deepEqual(Array.from(force.arrowTip),[580,240]);
    force.dragging='arrowTip';
    window.move(force,[580,260]);
    assert.deepEqual(Array.from(force.arrowTip),[580,260]);
    window.enableSnap=false;
    window.move(force,[580,260]);
    assert.deepEqual(Array.from(force.arrowTip),[580,260]);

    window.enableSnap=true;
    window.fm.forces=[force,{arrowBase:[597.25,311.5],arrowTip:[617.25,331.5]}];
    for(const target of [window.fm.forces[1].arrowBase,window.fm.forces[1].arrowTip]){
      for(const drawing of [true,false]){
        force.drawing=drawing;
        force.dragging=drawing ? null : 'arrowTip';
        window.move(force,target);
        assert.deepEqual(Array.from(force.arrowTip),target);
      }
      force.drawing=false;
      force.dragging='body';
      force.drag_offset=[7,-3];
      const vector=Array.from(force.vec);
      window.move(force,[target[0]-7,target[1]+3]);
      assert.deepEqual(Array.from(force.arrowBase),target);
      assert.deepEqual(Array.from(force.vec),vector);
      assert.deepEqual(Array.from(force.anchor),[530.25,248.5]);
    }
    const data=JSON.parse(fs.readFileSync(path.join(root,'taskset_Default.json'),'utf8'));
    window.currentTask=data.tasks.find(t=>t.id.endsWith('01abc'));
    force.anchor=[530,248];
    force.arrowBase=[550,268];
    force.dragging='arrowTip';
    window.fm.forces=[force];
    window.enableGuidelines=true;
    window.move(force,[550+80*120/208,188]);
    assert.equal(force.arrowTip[1],188);
    assert.ok(Math.abs(force.arrowTip[0]-(550+80*120/208))<1e-8);
    assert.equal(window.currentGuidelines.length,3);
    window.enableGuidelines=false;
    window.move(force,[550+80*120/208,188]);
    assert.equal(window.currentGuidelines,null);

    force.dragging='body';
    force.drag_offset=[7,-3];
    window.enableGuidelines=true;
    const anchor=force.anchor.slice();
    for(const target of [[530+80*120/208,168],[610,248+80*120/208]]){
      const vector=Array.from(force.vec);
      window.move(force,[target[0]-7,target[1]+3]);
      assert.ok(window.geometry.distance(force.arrowBase,target)<1e-8);
      assert.deepEqual(Array.from(force.anchor),anchor);
      assert.ok(window.geometry.distance(force.vec,vector)<1e-8);
      const line=window.currentGuidelines[2];
      assert.ok(window.geometry.distance(
        [(line.a[0]+line.b[0])/2,(line.a[1]+line.b[1])/2],anchor)<1e-8);
    }
    window.enableSnap=false;
    window.move(force,[703,301]);
    assert.deepEqual(Array.from(force.arrowBase),[710,298]);
    assert.deepEqual(Array.from(force.anchor),anchor);

    window.enableSnap=true;
    window.currentTask={scene:{}};
    force.anchor=[600,300];force.arrowBase=[600,300];
    window.fm.forces=[force,{arrowBase:[40,50],arrowTip:[86,-30]}];
    window.enableGuidelines=true;
    for(const drawing of [true,false]){
      force.drawing=drawing;
      force.dragging=drawing ? null : 'arrowTip';
      window.move(force,[647,339]);
      assert.deepEqual(Array.from(force.arrowTip),[646,339]);
      assert.equal(window.currentGuidelines.length,4);
      assert.deepEqual(Array.from(window.currentGuidelines[2].a),[600,300]);
      assert.deepEqual(Array.from(window.currentGuidelines[2].b),[600,339]);
      assert.deepEqual(Array.from(window.currentGuidelines[3].a),[646,339]);
      assert.deepEqual(Array.from(window.currentGuidelines[3].b),[646,300]);
      window.move(force,[646,380]);
      assert.deepEqual(Array.from(force.arrowTip),[646,380]);
      assert.equal(window.currentGuidelines.length,6);
      assert.deepEqual(Array.from(window.currentGuidelines[2].b),[600,380]);
      assert.deepEqual(Array.from(window.currentGuidelines[3].a),[646,380]);
      assert.deepEqual(Array.from(window.currentGuidelines[3].b),[646,300]);
      assert.deepEqual(Array.from(window.currentGuidelines[4].b),[646,300]);
      assert.deepEqual(Array.from(window.currentGuidelines[5].b),[600,380]);
    }
    window.enableGuidelines=false;
    window.move(force,[647,339]);
    assert.deepEqual(Array.from(force.arrowTip),[646,339]);
    assert.equal(window.currentGuidelines,null);
    window.enableSnap=false;
    window.enableGuidelines=true;
    window.move(force,[647,339]);
    assert.deepEqual(Array.from(force.arrowTip),[647,339]);
    assert.equal(window.currentGuidelines.length,2);
  });

  test('matched component guides keep the old match-line orientation and form a rectangle',()=>{
    const window=runtime();
    const force={arrowBase:[600.25,300.5],arrowTip:[554,380.5]};
    const references=[
      force,
      {arrowBase:[10,10],arrowTip:[56.25,-70]},
      {arrowBase:[0,0],arrowTip:[46.25,80]},
      {arrowBase:[NaN,0],arrowTip:[46.25,80]}
    ];
    const before=JSON.stringify(references);
    const lines=window.snapping.buildMatchedComponentGuidelines(force,references);
    assert.equal(lines.length,4);
    assert.deepEqual(Array.from(lines[0].a),[600.25,300.5]);
    assert.deepEqual(Array.from(lines[0].b),[600.25,380.5]);
    assert.deepEqual(Array.from(lines[1].a),[554,380.5]);
    assert.deepEqual(Array.from(lines[1].b),[554,300.5]);
    assert.deepEqual(Array.from(lines[2].a),[600.25,300.5]);
    assert.deepEqual(Array.from(lines[2].b),[554,300.5]);
    assert.deepEqual(Array.from(lines[3].a),[554,380.5]);
    assert.deepEqual(Array.from(lines[3].b),[600.25,380.5]);
    for(const line of lines){
      assert.equal(line.color,window.forceArrowColor(force,true));
      assert.equal(line.lineWidth,1);
      assert.deepEqual(Array.from(line.dash),[4,3]);
    }
    assert.equal(JSON.stringify(references),before);
    assert.equal(window.snapping.buildMatchedComponentGuidelines(force,[force]).length,0);
    force.arrowTip=[554,381];
    assert.equal(window.snapping.buildMatchedComponentGuidelines(force,references).length,2);
    force.arrowTip=[553,380.5];
    const yOnly=window.snapping.buildMatchedComponentGuidelines(force,references);
    assert.equal(yOnly.length,2);
    assert.deepEqual(Array.from(yOnly[0].b),[553,300.5]);
    force.arrowTip=null;
    assert.equal(window.snapping.buildMatchedComponentGuidelines(force,references).length,0);
    window.enableSnap=false;
    force.arrowTip=[554,380.5];
    assert.equal(window.snapping.buildMatchedComponentGuidelines(force,references).length,0);
  });

test('component outlines share the exact arrow color for expected, initial and highlighted forces',()=>{
  const window=runtime();
  const force={arrowBase:[100,100],arrowTip:[146,180]};
  const reference={arrowBase:[0,0],arrowTip:[46,80]};
  for(const [state,color] of [
    [{isExpected:true},'#ff5050'],
    [{isExpected:false},'#2d7d2d'],
    [{isExpected:true,checkHighlight:true},'#ff7d00'],
    [{isExpected:false,dragging:'arrowTip'},'#ff7d00']
  ]){
    Object.assign(force,{checkHighlight:false,dragging:null},state);
    const lines=window.snapping.buildMatchedComponentGuidelines(force,[force,reference]);
    assert.equal(lines.length,4);
    assert.ok(lines.every(line=>line.color===color));
  }
});
}

test('real tasks use only enabled scene geometry, never expected directions or relation answers',()=>{
  const window=runtime();
  const data=JSON.parse(fs.readFileSync(path.join(root,'taskset_Default.json'),'utf8'));
  const task=data.tasks.find(t=>t.id.endsWith('01abc'));
  const force={anchor:[530,248],arrowBase:[530,248]};
  const pos=[530+80*120/208,168];
  const options={force,task,origin:force.arrowBase,tip:true};
  const result=window.snapping.snapForce(pos,options);
  assert.equal(result.source,'scene-direction');
  assert.equal(result.pos[1]-force.arrowBase[1],-80);
  assert.ok(Math.abs(result.pos[0]-pos[0])<1e-8);
  task.expectedForces.forEach(f=>{f.dir=[0,1];});
  task.relations=[];
  assert.deepEqual(window.snapping.snapForce(pos,options),result);
  task.scene.segments[0].snapping=false;
  assert.equal(window.snapping.snapForce(pos,options).source,'origin-grid');
  task.scene.segments=[];
  assert.equal(window.snapping.snapForce(pos,options).source,'origin-grid');
  const task2=data.tasks.find(t=>t.id.endsWith('02abc'));
  for(const segment of task2.scene.segments){
    assert.equal(window.forceSnapDirections(task2,segment.a).length,0);
  }
  const task3=data.tasks.find(t=>t.id.endsWith('03abc'));
  const anchor=[520,280];
  const result3=window.snapping.snapForce([580,280],{
    task:task3,force:{anchor},origin:anchor,tip:true
  });
  assert.deepEqual(Array.from(result3.pos),[580,280]);
});

test('rotated rectangles and curves provide local axes, boundary tangents and true ellipse normals',()=>{
  const window=runtime(),g=window.geometry;
  const t=[Math.SQRT1_2,Math.SQRT1_2],n=[Math.SQRT1_2,-Math.SQRT1_2];
  const rect={bottomCenter:[100,200],width:80,height:60,t_vec:t,n_vec:n};
  const ellipse={center:[400,300],width:160,height:80,t_vec:t,startAngleDeg:30,endAngleDeg:250};
  const circle={center:[700,300],radius:40};
  const task={scene:{rects:[rect],ellipses:[ellipse],circles:[circle]}};
  const check=(anchor,expected)=>{
    const directions=window.forceSnapDirections(task,anchor);
    assert.equal(directions.length,expected.length);
    for(const vector of expected){
      const length=Math.hypot(...vector);
      assert.ok(directions.some(d=>Math.abs(g.cross(d,vector))/length<1e-8));
    }
  };
  for(const point of Object.values(window.rectPoints(rect))) check(point,[t,n]);
  check(ellipse.center,[t,n]);
  check(circle.center,[[1,0],[0,1]]);
  check([740,300],[[1,0],[0,1]]);
  const boundary=g.ellipsePoint(ellipse,30);
  const normal=[
    Math.cos(Math.PI/6)/80*t[0]+Math.sin(Math.PI/6)/40*n[0],
    Math.cos(Math.PI/6)/80*t[1]+Math.sin(Math.PI/6)/40*n[1]
  ];
  check(boundary,[normal,[-normal[1],normal[0]]]);
  ellipse.snapping=false;
  check(boundary,[]);
  check([boundary[0]+0.01,boundary[1]],[]);
  circle.radius=0;
  check(circle.center,[]);
});

test('shared endpoints deduplicate lines and ignore disabled or degenerate elements',()=>{
  const window=runtime();
  const task={scene:{
    segments:[{a:[0,0],b:[10,20]},{a:[0,0],b:[-10,-20]},
      {a:[0,0],b:[0,0]},{a:[0,0],b:[10,0],snapping:false}],
    arrows:[{a:[0,0],b:[-20,10]}],
    points:[{id:'free',pos:[100,100]}],texts:[{pos:[200,200],txt:'A'}]
  }};
  assert.equal(window.forceSnapDirections(task,[0,0]).length,2);
  assert.equal(window.forceSnapDirections(task,[100,100]).length,0);
  assert.equal(window.forceSnapDirections(task,[200,200]).length,0);
  assert.equal(window.forceSnapDirections(task,[0.1,0]).length,0);
});

test('direction eligibility uses inclusive eight-pixel distance, with nearest grid and endpoint competition',()=>{
  const window=runtime();
  const task={scene:{segments:[{a:[0,0],b:[0,100]}]}};
  const force={anchor:[0,0]},options={force,task,origin:[0,0],tip:true};
  for(const tip of [true,false]){
    for(const x of [-8,8]){
      assert.equal(window.snapping.snapForce([x,39],{...options,tip}).source,'scene-direction');
      assert.equal(window.snapping.snapForce([x+Math.sign(x)*0.001,39],{...options,tip}).source,'origin-grid');
    }
  }
  task.scene.segments[0].b=[100,50];
  assert.equal(window.snapping.snapForce([40,20],options).source,'scene-direction');
  assert.equal(window.snapping.snapForce([40,0],options).source,'origin-grid');
  options.forces=[force,{arrowTip:[40,20]}];
  assert.equal(window.snapping.snapForce([40,20],options).source,'force-point');
  options.forces=[force,{arrowBase:[41,20]}];
  assert.equal(window.snapping.snapForce([40,20],options).source,'scene-direction');
  assert.equal(window.snapping.snapForce([41,20],options).source,'force-point');
  options.forces=[{arrowTip:[43,3]}];
  assert.equal(window.snapping.snapForce([40,0],options).source,'origin-grid');
  options.forces=[{arrowTip:[40,20]}];
  assert.equal(window.snapping.snapForce([40,0],{...options,tip:false}).source,'origin-grid');
  force.arrowTip=[43,3];
  options.forces=[force,{arrowTip:[NaN,0],arrowBase:null}];
  assert.equal(window.snapping.snapForce([43,3],{...options,tip:false}).source,'origin-grid');
  window.enableSnap=false;
  const pos=[40,20];
  assert.equal(window.snapping.snapForce(pos,options).pos,pos);
});

test('direction intersections support fractional origins, negative components and near-axis lines',()=>{
  const window=runtime(),origin=[530.25,248.5];
  for(const vector of [[0,100],[100,0],[1e-9,100],[100,1e-9],[120,-208]]){
    const task={scene:{segments:[{a:origin,b:[origin[0]+vector[0],origin[1]+vector[1]]}]}};
    const pos=[origin[0]-vector[0],origin[1]-vector[1]];
    const result=window.snapping.snapForce(pos,{origin,task,force:{anchor:origin},tip:true});
    assert.ok(result.pos.every(Number.isFinite));
    const dx=result.pos[0]-origin[0],dy=result.pos[1]-origin[1];
    assert.ok(Math.abs(dx*vector[1]-dy*vector[0])<1e-5);
    assert.ok(Math.abs(dx/20-Math.round(dx/20))<1e-8 ||
      Math.abs(dy/20-Math.round(dy/20))<1e-8);
  }
});

test('equal-distance endpoint choices are stable and do not mutate force geometry',()=>{
  const window=runtime();
  const force={anchor:[0,0],arrowBase:[30,30],arrowTip:[60,70]};
  const other={arrowTip:[9,10],arrowBase:[11,10]};
  const options={force,forces:[force,other],origin:force.anchor};
  const before=JSON.stringify([force,other]);
  for(let i=0;i<3;i++){
    const result=window.snapping.snapForce([10,10],options);
    assert.equal(result.source,'force-point');
    assert.deepEqual(Array.from(result.pos),[9,10]);
    assert.notEqual(result.pos,other.arrowTip);
  }
  assert.equal(JSON.stringify([force,other]),before);
});

test('body movement compares absolute and anchor-relative grids without changing tip grid rules',()=>{
  const window=runtime();
  const origin=[530.25,248.5],force={anchor:origin},task={scene:{}};
  const options={origin,force,task};
  const absolute=window.snapping.snapForce([560,240],options);
  assert.equal(absolute.source,'grid');
  assert.deepEqual(Array.from(absolute.pos),[560,240]);
  const relative=window.snapping.snapForce([550.25,268.5],options);
  assert.equal(relative.source,'origin-grid');
  assert.deepEqual(Array.from(relative.pos),[550.25,268.5]);
  const tip=window.snapping.snapForce([560,240],{...options,tip:true});
  assert.equal(tip.source,'origin-grid');
  assert.deepEqual(Array.from(tip.pos),[550.25,248.5]);
});

test('segment and arrow normals are snap directions for both tip and body',()=>{
  const window=runtime(),origin=[101.25,203.5],force={anchor:origin};
  for(const collection of ['segments','arrows']){
    const element={a:origin,b:[131.25,243.5]};
    const task={scene:{[collection]:[element]}};
    assert.equal(window.forceSnapDirections(task,origin).length,2);
    for(const tip of [true,false]){
      for(const vector of [[60,80],[-80,60]]){
        const target=[origin[0]+vector[0],origin[1]+vector[1]];
        const result=window.snapping.snapForce(target,{origin,force,task,tip});
        assert.equal(result.source,'scene-direction');
        assert.ok(window.geometry.distance(result.pos,target)<1e-8);
      }
    }
    element.snapping=false;
    assert.equal(window.forceSnapDirections(task,origin).length,0);
  }
});

function componentSetup(){
  const window=runtime();
  const origin=[600,300],force={anchor:origin,arrowBase:origin};
  const reference={arrowBase:[40,50],arrowTip:[86,-30]};
  return {window,reference,options:{force,origin,task:{scene:{}},forces:[force,reference],tip:true}};
}

test('component snapping uses both signs of vector differences, not absolute endpoints or matching',()=>{
  const {window,reference,options}=componentSetup();
  for(const [pos,expected] of [
    [[647,339],[646,339]],[[553,339],[554,339]],
    [[639,379],[639,380]],[[639,221],[639,220]]
  ]){
    const result=window.snapping.snapForce(pos,options);
    assert.equal(result.source,'force-component');
    assert.deepEqual(Array.from(result.pos),expected);
    reference.arrowBase=reference.arrowBase.map(v=>v+1000);
    reference.arrowTip=reference.arrowTip.map(v=>v+1000);
    assert.deepEqual(window.snapping.snapForce(pos,options),result);
  }
  const before=JSON.stringify(options);
  window.snapping.snapForce([647,339],options);
  assert.equal(JSON.stringify(options),before);
  // A reference endpoint x coordinate is not itself an extra snap line.
  reference.arrowBase=[47,50];reference.arrowTip=[93,-30];
  assert.notEqual(window.snapping.snapForce([648,339],options).pos[0],647);
  const body=window.snapping.snapForce([647,339],{...options,tip:false});
  assert.notEqual(body.source,'force-component');
  window.enableSnap=false;
  const pos=[647,339];
  assert.equal(window.snapping.snapForce(pos,options).pos,pos);
});

test('component eligibility is inclusive at eight pixels and respects nearest candidate priority',()=>{
  const {window,options,reference}=componentSetup();
  // Reference x=50 leaves an eight-pixel candidate closer than the nearest grid point.
  reference.arrowTip=[90,-30];
  assert.equal(window.snapping.snapForce([642,330],options).source,'force-component');
  assert.equal(window.snapping.snapForce([658,330],options).source,'force-component');
  assert.equal(window.snapping.snapForce([641.999,330],options).source,'origin-grid');
  assert.equal(window.snapping.snapForce([658.001,330],options).source,'origin-grid');
  assert.equal(window.snapping.snapForce([640,340],options).source,'origin-grid');
  options.forces.push({arrowTip:[650,330]});
  assert.equal(window.snapping.snapForce([650,330],options).source,'force-point');
});

test('component intersections preserve geometric direction and reject distant or parallel solutions',()=>{
  const {window,options,reference}=componentSetup();
  options.task={scene:{segments:[{a:[600,300],b:[720,360]}]}};
  reference.arrowTip=[86,123]; // x component 46; y component 73 is not near the pointer.
  const result=window.snapping.snapForce([647,324],options);
  assert.equal(result.source,'force-component');
  assert.deepEqual(Array.from(result.pos),[646,323]);
  assert.ok(result.direction);
  // The freely projected point [646,324] would be nearer, but is deliberately excluded.
  assert.notEqual(result.pos[1],324);
  reference.arrowTip=[84,123];
  assert.equal(window.snapping.snapForce([644,330],options).source,'force-component');
  assert.notEqual(window.snapping.snapForce([644,330.001],options).source,'force-component');
  reference.arrowTip=[80,123];
  assert.equal(window.snapping.snapForce([640,320],options).source,'force-component');
  options.task.scene.segments[0].b=[600,400];
  reference.arrowTip=[45,123]; // x component 5, parallel to a vertical direction.
  assert.notEqual(window.snapping.snapForce([605,333],options).source,'force-component');
  reference.arrowTip=[40,123]; // coincident x=0 line
  const coincident=window.snapping.snapForce([601,333],options);
  assert.equal(coincident.source,'force-component');
  assert.deepEqual(Array.from(coincident.pos),[600,333]);
  options.task.scene.segments[0].b=[600.001,400];
  reference.arrowTip=[45,123];
  assert.notEqual(window.snapping.snapForce([605,333],options).source,'force-component');
});

test('component extraction handles fractional, duplicate, zero and invalid geometry',()=>{
  const {window,options,reference}=componentSetup();
  reference.arrowTip=[86.25,50];
  options.forces.push({arrowBase:[100,100],arrowTip:[146.25,100]},
    {arrowBase:[NaN,0],arrowTip:[7,0]},
    {arrowBase:[0,0]}, {arrowTip:[Infinity,0]});
  const result=window.snapping.snapForce([647,339],options);
  assert.equal(result.source,'force-component');
  assert.deepEqual(Array.from(result.pos),[646.25,339]);
  const zero=window.snapping.snapForce([629,301],options);
  assert.equal(zero.source,'force-component');
  assert.deepEqual(Array.from(zero.pos),[629,300]);
  options.forces=[options.force];
  options.force.arrowTip=[646.25,373];
  assert.notEqual(window.snapping.snapForce([647,339],options).source,'force-component');
});
