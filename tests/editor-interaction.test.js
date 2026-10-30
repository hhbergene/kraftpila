const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const editorSource=fs.readFileSync(path.join(root,'web','editor.js'),'utf8');

function editorHelpers({
  activePanel,
  selectedSceneElement=null,
  activeForceIndex=-1,
  focusedForceIndex=null
}={}){
  const start=editorSource.indexOf('  function isInteractionSelected(');
  const end=editorSource.indexOf('  // Find the closest scene hit',start);
  assert.ok(start>=0 && end>start);
  const activeElement=focusedForceIndex===null ? null : {
    tagName:'INPUT',dataset:{index:String(focusedForceIndex)}
  };
  const document={activeElement};
  const window={activePanel,selectedSceneElement,fm:{activeIndex:activeForceIndex}};
  const context=vm.createContext({window,document});
  vm.runInContext(fs.readFileSync(path.join(root,'web','geometry.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'web','text_render.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'web','scene_render.js'),'utf8'),context);
  vm.runInContext(`const inputsContainer={contains:element=>element===document.activeElement};
    ${editorSource.slice(start,end)}
    globalThis.isInteractionSelected=isInteractionSelected;
    globalThis.compareInteractionHits=compareInteractionHits;
    globalThis.shouldDrawSceneElementHandles=shouldDrawSceneElementHandles;
    globalThis.shouldDrawActiveForceHandles=shouldDrawActiveForceHandles;`,context);
  return context;
}

function sceneHoverFinder(pointLookup, selectedSceneElement=null, scene={}, activePanel='scene'){
  const start=editorSource.indexOf('  function updateSceneElementHover(');
  const end=editorSource.indexOf('  function updateEditorInteractionHover(',start);
  assert.ok(start>=0 && end>start);
  const geometry={
    distance:(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),
    finitePoint:p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite),
    tangentFromNormal:n=>{const len=Math.hypot(...n)||1;return [-n[1]/len,n[0]/len];},
    distPointToSegment:(point,a,b)=>{
      const dx=b[0]-a[0],dy=b[1]-a[1];
      const lenSq=dx*dx+dy*dy;
      const t=lenSq ? Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/lenSq)) : 0;
      return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
    }
  };
  const context=editorHelpers({activePanel,selectedSceneElement});
  Object.assign(context.window,{
    currentTask:{scene},HOVER_THRESHOLD:20,buildAllScenePoints:()=>pointLookup,
    geometry,clampToCanvas:pos=>pos
  });
  Object.assign(context,{
    geometry,isDrawArmed:()=>false,
    ctx:{font:'',measureText:text=>({width:String(text).length*7})}
  });
  vm.runInContext(fs.readFileSync(path.join(root,'web','text_render.js'),'utf8'),context);
  const handleStart=editorSource.indexOf('  function getSceneHandleAtPos(');
  const handleEnd=editorSource.indexOf('  function syncForcesWithSceneElement(',handleStart);
  vm.runInContext(editorSource.slice(handleStart,handleEnd),context);
  vm.runInContext('globalThis.findSceneHandle=getSceneHandleAtPos;',context);
  vm.runInContext(`${editorSource.slice(start,end)}
    globalThis.findSceneHit=updateSceneElementHover;`,context);
  context.window.selectedSceneElement=selectedSceneElement;
  return context;
}

test('text hit geometry follows formatted bounds and rotated midline',()=>{
  const context=editorHelpers();
  const geometry={
    finitePoint:p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite),
    tangentFromNormal:n=>{const len=Math.hypot(...n)||1;return [-n[1]/len,n[0]/len];}
  };
  Object.assign(context.window,{geometry});
  context.ctx={font:'',measureText:text=>({width:String(text).length*10})};
  const texts=[
    {txt:'abcd',pos:[20,30],size:20,align:'center'},
    {txt:'abcd',pos:[20,30],size:20,align:'center',angle_deg:90}
  ];
  const flat=context.window.getTextGeometry(context.ctx,texts[0]);
  const rotated=context.window.getTextGeometry(context.ctx,texts[1]);
  assert.equal(flat.contains([20,30]),true);
  assert.equal(flat.contains([20,45]),false);
  assert.equal(flat.contains([42,30]),true,'two-pixel box margin reaches the glyph edge');
  assert.equal(flat.contains([43,30]),false);
  assert.equal(rotated.contains([20,30]),true);
  assert.ok(Math.abs(rotated.centerline[0][0]-rotated.centerline[1][0])<1e-8);
  assert.ok(rotated.centerline[1][1]>rotated.centerline[0][1]);
  assert.equal(context.window.getTextGeometry(context.ctx,texts[1]),rotated,
    'unchanged text reuses its measured geometry');
  texts[1].txt='changed';
  assert.notEqual(context.window.getTextGeometry(context.ctx,texts[1]),rotated);
});
function interactionUpdater(forceHit,sceneHit){
  const start=editorSource.indexOf('  function updateEditorInteractionHover(');
  const end=editorSource.indexOf('  // Update delete force button visibility',start);
  assert.ok(start>=0 && end>start);
  let appliedForceHit='not-applied';
  const window={fm:{
    getHoverCandidate:()=>forceHit,
    setHoverCandidate:candidate=>{appliedForceHit=candidate;}
  }};
  const context=vm.createContext({
    window,isDrawArmed:()=>false,updateSceneElementHover:()=>sceneHit,
    compareInteractionHits:editorHelpers().compareInteractionHits
  });
  vm.runInContext(`${editorSource.slice(start,end)}
    globalThis.updateHover=updateEditorInteractionHover;`,context);
  const winner=context.updateHover([0,0]);
  return {winner,window,appliedForceHit};
}

function forceManager(activePanel){
  const geometry={
    distance:(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),
    distPointToSegment:(point,a,b)=>{
      const dx=b[0]-a[0],dy=b[1]-a[1];
      const lenSq=dx*dx+dy*dy;
      const t=lenSq ? Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/lenSq)) : 0;
      return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
    }
  };
  const Force=class{};
  const window={editorMode:true,activePanel,Force};
  const context=vm.createContext({window,geometry,Force});
  vm.runInContext(fs.readFileSync(path.join(root,'web','forcesManager.js'),'utf8'),context);
  return new window.ForcesManager();
}

function canvasInteractions(context){
  const handlers={};
  context.canvas={dataset:{},addEventListener:(name,handler)=>{handlers[name]=handler;}};
  Object.assign(context,{
    clearFeedback:()=>{},getMousePos:event=>event.pos,
    markEdited:()=>{},ensureInputMeta:()=>{},requestAnimationFrame:()=>{},
    withinForceArea:()=>true,DRAW_CENTER:[0,0],GRID_STEP:20,
    snapping:{snap:pos=>({pos})}
  });
  context.document.getElementById=()=>null;
  context.window.setActivePanel=panel=>{context.window.activePanel=panel;};
  context.window.updateAppState=()=>{};
  context.window.fm.syncInputs=()=>{};
  vm.runInContext('inputsContainer.querySelectorAll=()=>[];',context);
  const hoverStart=editorSource.indexOf('  function updateEditorInteractionHover(');
  const hoverEnd=editorSource.indexOf('  // Update delete force button visibility',hoverStart);
  vm.runInContext(editorSource.slice(hoverStart,hoverEnd),context);
  const moveStart=editorSource.indexOf('  function moveSceneElement(');
  const mouseUpStart=editorSource.indexOf("  canvas.addEventListener('mouseup',",moveStart);
  vm.runInContext(editorSource.slice(moveStart,mouseUpStart),context);
  return handlers;
}

test('shared hit arbitration selects the nearest hit, then closest point, then scene',()=>{
  const context=editorHelpers();
  const compare=context.compareInteractionHits;
  const scene={domain:'scene',distance:4,pointDistance:10};
  const force={domain:'force',distance:3,pointDistance:2};
  assert.equal(compare(force,scene),force);
  assert.equal(compare({...force,distance:4,pointDistance:5},scene).domain,'force');
  assert.equal(compare({...force,distance:4,pointDistance:10},scene),scene);
});

test('selected force and selected scene element win equal-distance overlaps',()=>{
  const force={domain:'force',distance:2,pointDistance:8,forceIndex:1};
  const scene={domain:'scene',distance:2,pointDistance:3,type:'segment',index:0};
  const selectedForce=editorHelpers({
    activePanel:'force',activeForceIndex:1,focusedForceIndex:1
  });
  assert.equal(selectedForce.compareInteractionHits(force,scene),force);

  const selectedScene=editorHelpers({
    activePanel:'scene',selectedSceneElement:{type:'segment',index:0}
  });
  assert.equal(selectedScene.compareInteractionHits(force,scene),scene);

  const unrelatedForceFocus=editorHelpers({
    activePanel:'force',activeForceIndex:1,focusedForceIndex:0
  });
  assert.equal(unrelatedForceFocus.compareInteractionHits(force,scene),force);

  const unfocusedForce=editorHelpers({activePanel:'force',activeForceIndex:1});
  assert.equal(unfocusedForce.compareInteractionHits(force,scene),force);
});

test('text body loses exact ties but a nearer text wins and its selected handle stays active',()=>{
  const context=editorHelpers({activePanel:'scene',selectedSceneElement:{type:'text',index:0}});
  const compare=context.compareInteractionHits;
  const text={domain:'scene',type:'text',index:0,distance:4,pointDistance:10,textBody:true};
  const segment={domain:'scene',type:'segment',index:2,distance:4,pointDistance:20};
  assert.equal(compare(text,segment),segment);
  assert.equal(compare({...text,distance:3},segment).type,'text');
  const handle={...text,distance:4,handle:{type:'text',index:0,handleType:'center'}};
  assert.equal(compare(handle,segment),handle);
  const force=editorHelpers({activePanel:'force',activeForceIndex:1});
  assert.equal(force.compareInteractionHits(
    {...text,distance:4},
    {domain:'force',forceIndex:1,distance:4,pointDistance:1}
  ).domain,'force');
});

test('text hover uses its oriented bounds and compares centerline distance to scene geometry',()=>{
  const context=sceneHoverFinder({
    segment0:{points:{a:[0,10],b:[28,10]},segments:{edge:[[0,10],[28,10]]}},
    text0:{points:{pos:[0,0]},segments:{}}
  },{type:'text',index:0},{texts:[{txt:'abcd',pos:[0,0],size:20,align:'left'}]});
  assert.equal(context.findSceneHit([14,0]).type,'text');
  assert.equal(context.findSceneHit([14,10]).type,'segment',
    'equal midline distance loses to the non-text element');
  assert.equal(context.findSceneHit([14,12]).type,'segment',
    'outside the box, the text is not a candidate');
});
test('the hover coordinator applies only the shared winner to force and scene states',()=>{
  const force={domain:'force',forceIndex:0,part:'arrowTip',distance:3,pointDistance:3};
  const scene={domain:'scene',type:'segment',index:0,feature:'segment',distance:2,pointDistance:8};
  const sceneWins=interactionUpdater(force,scene);
  assert.equal(sceneWins.winner,scene);
  assert.equal(sceneWins.appliedForceHit,null);
  assert.equal(sceneWins.window.hoveredSceneElement.type,'segment');
  assert.equal(sceneWins.window.hoveredSceneElement.feature,'segment');

  const forceWins=interactionUpdater({...force,distance:1},scene);
  assert.equal(forceWins.winner.domain,'force');
  assert.equal(forceWins.appliedForceHit.forceIndex,0);
  assert.equal(forceWins.window.hoveredSceneElement,null);
});

test('scene hover uses nearest geometry instead of keeping a farther selected element',()=>{
  const context=sceneHoverFinder({
    rect0:{points:{left:[0,0],right:[100,0]},segments:{edge:[[0,0],[100,0]]}},
    rect1:{points:{center:[50,2]},segments:{}}
  },{type:'rect',index:0});
  const hit=context.findSceneHit([50,1.5]);
  assert.equal(hit.type,'rect');
  assert.equal(hit.index,1);
  assert.equal(hit.feature,'center');
});

test('the open scene element wins equal geometry distances before point proximity',()=>{
  const context=sceneHoverFinder({
    segment0:{points:{start:[50,0]},segments:{edge:[[0,0],[100,0]]}},
    segment1:{points:{start:[0,-100],end:[100,100]},segments:{edge:[[0,-100],[100,100]]}}
  },{type:'segment',index:1});
  assert.equal(context.findSceneHit([50,0]).index,1);
});

test('an active text handle wins throughout its hit area over scene geometry',()=>{
  for(const offset of [0,4,8]){
    const context=sceneHoverFinder({
      segment0:{points:{start:[104,100]},segments:{edge:[[0,100],[200,100]]}},
      text0:{points:{pos:[100,100]},segments:{}}
    },{type:'text',index:0},{texts:[{pos:[100,100]}]});
    const hit=context.findSceneHit([100+offset,100]);
    assert.equal(hit.type,'text');
    assert.equal(hit.handle?.handleType,'center');
  }
});

test('text handles do not capture hits outside their radius or when inactive or linked',()=>{
  const lookup={
    segment0:{points:{start:[104,100]},segments:{edge:[[0,100],[200,100]]}},
    text0:{points:{pos:[100,100]},segments:{}}
  };
  const selected={type:'text',index:0};
  assert.equal(sceneHoverFinder(lookup,selected,{texts:[{pos:[100,100]}]})
    .findSceneHit([109,100]).type,'segment');
  assert.equal(sceneHoverFinder(lookup,selected,{texts:[{pos:[100,100]}]},'force')
    .findSceneHit([104,100]).type,'segment');
  const linked=sceneHoverFinder(lookup,{type:'text',index:1},{
    texts:[{pos:[0,0]},{pos:[100,100],linked:true}]
  });
  assert.equal(linked.findSceneHit([104,100]).type,'segment');
});

test('scene handles absent from the point lookup still win competing geometry',()=>{
  const cases=[
    ['rect',{rects:[{bottomCenter:[0,0],width:200,height:100}]},[100,0],'bottomRight'],
    ['ellipse',{ellipses:[{center:[0,0],width:200,height:100}]},[100,0],'width'],
    ['segment',{segments:[{a:[100,0],b:[200,0]}]},[100,0],'a'],
    ['arrow',{arrows:[{a:[100,0],b:[200,0]}]},[100,0],'a'],
    ['point',{points:[{type:'free',pos:[100,0]}]},[100,0],'center'],
    ['plane',{plane:{through:[0,0],dirPoint:[100,0]}},[100,0],'direction']
  ];
  for(const [type,scene,pos,handleType] of cases){
    const context=sceneHoverFinder({
      text1:{points:{pos},segments:{}}
    },{type,index:0},scene);
    const hit=context.findSceneHit(pos);
    assert.equal(hit.type,type);
    assert.equal(hit.handle.handleType,handleType);
  }
  const context=sceneHoverFinder({}, {type:'text',index:0},{texts:[{pos:[100,0]}]});
  assert.equal(context.findSceneHit([100,0]).handle.handleType,'center');
});

test('arrow body is draggable as a segment without changing its vector',()=>{
  const arrow={a:[20,40],b:[100,40]};
  const context=sceneHoverFinder({
    arrow0:{points:{start:arrow.a,end:arrow.b},segments:{arrow:[arrow.a,arrow.b]}}
  },{type:'arrow',index:0},{arrows:[arrow]});
  assert.equal(context.findSceneHandle([60,44]).handleType,'body');
  assert.equal(context.findSceneHandle([20,40]).handleType,'a');
  assert.equal(context.findSceneHandle([100,40]).handleType,'b');

  context.window.fm={forces:[],activeIndex:-1,syncInputs(){},getHoverCandidate:()=>null,setHoverCandidate(){}};
  context.window.setActivePanel=panel=>{context.window.activePanel=panel;};
  context.window.updateAppState=()=>{};
  const handlers=canvasInteractions(context);
  handlers.mousedown({pos:[60,44]});
  assert.equal(context.window.draggingHandle.handleType,'body');
  assert.deepEqual(Array.from(context.window.draggingHandle._arrowStartA),[20,40]);
  assert.deepEqual(Array.from(context.window.draggingHandle._arrowStartB),[100,40]);
  handlers.mousemove({pos:[80,64]});
  assert.deepEqual(Array.from(arrow.a),[40,60]);
  assert.deepEqual(Array.from(arrow.b),[120,60]);
  assert.deepEqual([arrow.b[0]-arrow.a[0],arrow.b[1]-arrow.a[1]],[80,0]);
  const endpointContext=sceneHoverFinder({
    arrow0:{points:{start:arrow.a,end:arrow.b},segments:{arrow:[arrow.a,arrow.b]}}
  },{type:'arrow',index:0},{arrows:[arrow]});
  endpointContext.window.fm={forces:[],activeIndex:-1,syncInputs(){},getHoverCandidate:()=>null,setHoverCandidate(){}};
  endpointContext.window.setActivePanel=panel=>{endpointContext.window.activePanel=panel;};
  endpointContext.window.updateAppState=()=>{};
  const endpointHandlers=canvasInteractions(endpointContext);
  endpointHandlers.mousedown({pos:[40,60]});
  assert.equal(endpointContext.window.draggingHandle.handleType,'a');
  endpointHandlers.mousemove({pos:[50,70]});
  assert.deepEqual(Array.from(arrow.a),[50,70]);
  assert.deepEqual(Array.from(arrow.b),[120,60]);
});

test('active force wins tied shafts before endpoint proximity, but not nearer geometry',()=>{
  const manager=forceManager('force');
  const active={arrowBase:[0,0],arrowTip:[100,0]};
  const other={arrowBase:[50,-20],arrowTip:[50,20]};
  manager.forces=[active,other];
  manager.activeIndex=0;
  const hit=manager.getHoverCandidate([50,0],true);
  assert.equal(hit.force,active);
  const context=editorHelpers({activePanel:'force',activeForceIndex:0});
  assert.equal(context.compareInteractionHits(hit,{
    domain:'scene',distance:0,pointDistance:0,type:'text',index:0
  }),hit);
  assert.equal(manager.getHoverCandidate([50,1],true).force,other);
});

test('hover and drag move the same active text despite an overlapping segment and force',()=>{
  const scene={texts:[{pos:[100,100]}]};
  const context=sceneHoverFinder({
    segment0:{points:{start:[104,100]},segments:{edge:[[0,100],[200,100]]}},
    text0:{points:{pos:[100,100]},segments:{}}
  },{type:'text',index:0},scene);
  const manager=forceManager('scene');
  const force={arrowBase:[0,100],arrowTip:[200,100],handleMouseMove:()=>{}};
  manager.forces=[force];
  manager.activeIndex=0;
  context.window.fm=manager;
  const handlers=canvasInteractions(context);
  handlers.mousemove({pos:[104,100]});
  assert.equal(context.window.hoveredSceneElement.type,'text');
  assert.equal(force.hovering,null);
  handlers.mousedown({pos:[104,100]});
  assert.equal(context.window.draggingHandle.type,'text');
  handlers.mousemove({pos:[140,120]});
  assert.deepEqual(scene.texts[0].pos,[140,120]);
  assert.deepEqual(force.arrowTip,[200,100]);
});

test('a selected linked text shows and drags its root handle, moving the whole chain',()=>{
  const scene={texts:[
    {txt:'root',pos:[100,100],size:20},
    {txt:'child',pos:[900,900],linked:true},
    {txt:'grandchild',linked:true},
    {txt:'independent',pos:[300,300]}
  ]};
  const context=sceneHoverFinder({
    segment0:{points:{start:[104,100]},segments:{edge:[[0,100],[200,100]]}}
  },{type:'text',index:2},scene);
  const manager=forceManager('scene');
  manager.forces=[{arrowBase:[0,100],arrowTip:[200,100],handleMouseMove(){}}];
  manager.activeIndex=0;
  context.window.fm=manager;
  const drawn=[];
  context.window.SCENE_HANDLE_COLOR='#000';
  const drawStart=editorSource.indexOf('  function drawSceneElementHandles(');
  const drawEnd=editorSource.indexOf('  requestAnimationFrame(frame);',drawStart);
  vm.runInContext(editorSource.slice(drawStart,drawEnd),context);
  context.drawSceneElementHandles({
    beginPath(){},arc:(x,y)=>drawn.push([x,y]),fill(){},stroke(){}
  },context.window.selectedSceneElement);
  assert.deepEqual(drawn,[[100,100]]);

  const handlers=canvasInteractions(context);
  handlers.mousemove({pos:[104,100]});
  assert.equal(context.window.hoveredInteraction.index,0);
  assert.equal(context.window.hoveredInteraction.handle.index,0);
  handlers.mousedown({pos:[104,100]});
  assert.equal(context.window.selectedSceneElement.index,0);
  assert.equal(context.window.draggingHandle.index,0);
  context.window.updateAppState=()=>context.window.updateTextPositions(context.window.currentTask);
  handlers.mousemove({pos:[140,120]});
  assert.deepEqual(JSON.parse(JSON.stringify(scene.texts.map(t=>t.pos))),
    [[140,120],[140,145],[140,164],[300,300]]);
});

test('a selected attached point exposes a handle and canvas dragging updates its track parameter',()=>{
  const scene={segments:[{a:[0,50],b:[100,50]}]};
  const context=sceneHoverFinder({},null,scene);
  vm.runInContext(fs.readFileSync(path.join(root,'web','scene_model.js'),'utf8'),context);
  const model=context.window.sceneModel;
  const source=model.geometries(context.window.currentTask)[0];
  const point=model.createAttachedPoint(context.window.currentTask,source,[25,50]);
  context.window.selectedSceneElement={type:'point',index:0,obj:point};
  context.window.editorMode=true;
  context.window.enableSnap=false;
  context.document.readyState='loading';
  context.document.addEventListener=()=>{};
  for(const file of ['snapping.js','scene_editor.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),context);
  }
  const drawn=[];
  context.window.SCENE_HANDLE_COLOR='#000';
  const drawStart=editorSource.indexOf('  function drawSceneElementHandles(');
  const drawEnd=editorSource.indexOf('  requestAnimationFrame(frame);',drawStart);
  vm.runInContext(editorSource.slice(drawStart,drawEnd),context);
  context.drawSceneElementHandles({
    beginPath(){},arc:(x,y)=>drawn.push([x,y]),fill(){},stroke(){}
  },context.window.selectedSceneElement);
  assert.deepEqual(drawn,[[25,50]]);
  assert.equal(context.findSceneHandle([25,50]).handleType,'center');
  const manager=forceManager('scene');
  manager.forces=[];
  manager.activeIndex=-1;
  context.window.fm=manager;
  const handlers=canvasInteractions(context);
  handlers.mousedown({pos:[25,50]});
  assert.equal(context.window.draggingHandle.type,'point');
  handlers.mousemove({pos:[71.25,85]});
  assert.deepEqual(Array.from(point.pos),[71.25,50]);
  assert.equal(point.attachment.u,0.7125);
  assert.equal(point.attachment.ref,source.ref);
  assert.equal(scene.points.length,1);
  assert.equal(context.window.selectedSceneElement.type,'point');
  assert.equal(context.window.selectedSceneElement.index,0);
});

test('wagon canvas handles dispatch width and height resizing instead of generic scene movement',()=>{
  const scene={segments:[{a:[0,100],b:[200,100]}]};
  const context=sceneHoverFinder({},null,scene);
  vm.runInContext(fs.readFileSync(path.join(root,'web','geometry.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'web','scene_model.js'),'utf8'),context);
  const model=context.window.sceneModel,task=context.window.currentTask;
  const point=model.createAttachedPoint(task,model.geometries(task)[0],[100,100]);
  const wagon=model.createWagon(task,point,{halfWidth:20,height:15});
  context.window.selectedSceneElement={type:'wagon',index:0};
  context.window.enableSnap=false;
  context.document.readyState='loading';
  context.document.addEventListener=()=>{};
  for(const file of ['snapping.js','scene_editor.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),context);
  }
  const manager=forceManager('scene');
  manager.forces=[];
  manager.activeIndex=-1;
  context.window.fm=manager;
  const handlers=canvasInteractions(context);
  assert.equal(context.findSceneHandle([120,100]).handleType,'width');
  handlers.mousedown({pos:[120,100]});
  handlers.mousemove({pos:[150,110]});
  assert.equal(wagon.halfWidth,50);
  context.window.draggingHandle=null;
  assert.equal(context.findSceneHandle([100,85]).handleType,'height');
  handlers.mousedown({pos:[100,85]});
  handlers.mousemove({pos:[120,60]});
  assert.equal(wagon.height,40);
  assert.deepEqual(Array.from(point.pos),[100,100]);
});

test('construction handles select wagon rather than attachment and preview before commit',()=>{
  const scene={segments:[{a:[0,200],b:[400,200]}]};
  const context=sceneHoverFinder({},null,scene);
  for(const file of ['geometry.js','scene_model.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),context);
  }
  const model=context.window.sceneModel,task=context.window.currentTask;
  const point=model.createAttachedPoint(task,model.geometries(task)[0],[200,200]);
  const wagon=model.createWagon(task,point,{halfWidth:20,height:40});
  model.enableWagonConstruction(task,wagon);
  context.window.selectedSceneElement={type:'wagon',index:0};
  context.window.enableSnap=false;
  context.document.readyState='loading';
  context.document.addEventListener=()=>{};
  for(const file of ['snapping.js','scene_editor.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),context);
  }
  const manager=forceManager('scene');
  manager.forces=[];
  manager.activeIndex=-1;
  context.window.fm=manager;
  const handlers=canvasInteractions(context);
  const state=model.wagonConstruction(task,wagon);
  assert.equal(context.findSceneHandle(state.P).handleType,'construction-P');
  assert.equal(context.findSceneHandle(state.O).handleType,'construction-O');
  handlers.mousedown({pos:state.O});
  assert.equal(context.window.selectedSceneElement.type,'wagon');
  handlers.mousemove({pos:state.O.map(v=>v+25)});
  assert.deepEqual(Array.from(model.wagonConstruction(task,wagon).O),Array.from(state.O));
  context.window.sceneEditor.finishConstructionDrag();
  assert.deepEqual(Array.from(model.wagonConstruction(task,wagon).O),Array.from(state.O,v=>v+25));
  assert.equal(wagon.height,state.height);
});

test('selected wagon exposes its placement point as a point handle for selection and dragging',()=>{
  const scene={segments:[{a:[0,100],b:[200,100]}]};
  const context=sceneHoverFinder({},null,scene);
  for(const file of ['geometry.js','scene_model.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),context);
  }
  const model=context.window.sceneModel,task=context.window.currentTask;
  const point=model.createAttachedPoint(task,model.geometries(task)[0],[100,100]);
  const wagon=model.createWagon(task,point,{halfWidth:20,height:15});
  context.window.selectedSceneElement={type:'wagon',index:0};
  context.window.enableSnap=false;
  context.document.readyState='loading';
  context.document.addEventListener=()=>{};
  for(const file of ['snapping.js','scene_editor.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),context);
  }
  const drawn=[];
  context.window.SCENE_HANDLE_COLOR='#000';
  const drawStart=editorSource.indexOf('  function drawSceneElementHandles(');
  const drawEnd=editorSource.indexOf('  requestAnimationFrame(frame);',drawStart);
  vm.runInContext(editorSource.slice(drawStart,drawEnd),context);
  context.drawSceneElementHandles({
    beginPath(){},arc:(x,y)=>drawn.push([x,y]),fill(){},stroke(){}
  },context.window.selectedSceneElement);
  assert.deepEqual(drawn,[[100,100],[100,85],[120,100]]);
  const handle=context.findSceneHandle([100,100]);
  assert.equal(handle.type,'point');
  assert.equal(handle.index,0);
  const manager=forceManager('scene');
  manager.forces=[];
  manager.activeIndex=-1;
  context.window.fm=manager;
  const handlers=canvasInteractions(context);
  handlers.mousedown({pos:[100,100]});
  assert.equal(context.window.selectedSceneElement.type,'point');
  assert.equal(context.window.selectedSceneElement.index,0);
  handlers.mousemove({pos:[150,130]});
  assert.deepEqual(Array.from(point.pos),[150,100]);
  assert.deepEqual(Array.from(model.wagonGeometry(task,wagon).bottomCenter),[150,100]);
  const plane=scene.planes.find(plane=>plane.id===wagon.planeId);
  assert.deepEqual(Array.from(plane.through),[150,100]);
  assert.equal(wagon.halfWidth,20);
  assert.equal(wagon.height,15);
});

test('an unfocused active force wins hover and drag against another force and scene text',()=>{
  const context=sceneHoverFinder({
    text0:{points:{pos:[50,0]},segments:{}}
  },{type:'text',index:0},{texts:[{pos:[50,0]}]},'force');
  const manager=forceManager('force');
  let dragged=false;
  const active={
    arrowBase:[0,0],arrowTip:[100,0],
    handleMouseDown:()=>{dragged=true;return true;},
    handleMouseMove:()=>{}
  };
  manager.forces=[active,{arrowBase:[50,-20],arrowTip:[50,20]}];
  manager.activeIndex=0;
  context.window.fm=manager;
  const handlers=canvasInteractions(context);
  handlers.mousemove({pos:[50,0]});
  assert.equal(context.window.hoveredInteraction.force,active);
  assert.equal(context.window.hoveredSceneElement,null);
  handlers.mousedown({pos:[50,0]});
  assert.equal(dragged,true);
  assert.equal(context.window.draggingHandle,undefined);
  assert.equal(manager.activeIndex,0);
});

test('force hover can use nearest distance and point-distance tie-breaking',()=>{
  const manager=forceManager();
  const fartherHandle={anchor:[50,5],arrowBase:[50,5],arrowTip:[50,30]};
  const nearerShaft={anchor:[0,-30],arrowBase:[0,0],arrowTip:[100,0]};
  manager.forces=[fartherHandle,nearerShaft];
  manager.activeIndex=0;
  const nearest=manager.updateHover([50,0],true);
  assert.equal(nearest.force,nearerShaft);
  assert.equal(nearerShaft.hovering,'body');
  assert.equal(fartherHandle.hovering,null);

  const distantEndpoints={arrowBase:[0,0],arrowTip:[100,0]};
  const closerEndpoints={arrowBase:[50,-20],arrowTip:[50,20]};
  manager.forces=[distantEndpoints,closerEndpoints];
  const pointTie=manager.getHoverCandidate([50,0],true);
  assert.equal(pointTie.force,closerEndpoints);
  assert.equal(pointTie.distance,0);
  assert.equal(pointTie.pointDistance,20);
  const compare=editorHelpers().compareInteractionHits;
  assert.equal(compare(pointTie,{domain:'scene',distance:0,pointDistance:10}).domain,'scene');
  assert.equal(compare(pointTie,{domain:'scene',distance:0,pointDistance:25}).domain,'force');
});

test('a force tip beats an overlapping shaft segment when it is the nearer point',()=>{
  const manager=forceManager();
  const force={anchor:[0,0],arrowBase:[0,0],arrowTip:[50,0]};
  manager.forces=[force];
  manager.activeIndex=0;
  const tipHit=manager.getHoverCandidate([48,0],true);
  const segmentHit={domain:'scene',distance:0,pointDistance:48,type:'segment',index:0};
  assert.equal(tipHit.distance,0);
  assert.equal(tipHit.part,'arrowTip');
  assert.equal(editorHelpers().compareInteractionHits(tipHit,segmentHit),tipHit);

  const baseHit=manager.getHoverCandidate([2,0],true);
  const baseSegmentHit={domain:'scene',distance:0,pointDistance:2,type:'segment',index:0};
  assert.equal(baseHit.distance,0);
  assert.equal(editorHelpers().compareInteractionHits(baseHit,baseSegmentHit),baseSegmentHit);
});

test('force and scene handles are visually exclusive according to active panel and hover winner',()=>{
  const context=editorHelpers();
  const window=context.window;
  window.selectedSceneElement={type:'segment',index:0};
  window.activePanel='force';
  window.hoveredInteraction=null;
  assert.equal(context.shouldDrawSceneElementHandles(),false);
  assert.equal(context.shouldDrawActiveForceHandles(),true);

  window.activePanel='scene';
  assert.equal(context.shouldDrawSceneElementHandles(),true);
  assert.equal(context.shouldDrawActiveForceHandles(),false);

  window.hoveredInteraction={domain:'force'};
  assert.equal(context.shouldDrawSceneElementHandles(),false);
  assert.equal(context.shouldDrawActiveForceHandles(),false);

  window.activePanel='force';
  window.hoveredInteraction={domain:'scene'};
  assert.equal(context.shouldDrawSceneElementHandles(),false);
  assert.equal(context.shouldDrawActiveForceHandles(),false);
});
