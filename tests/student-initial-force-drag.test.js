const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');

function setup(editorMode=false){
  const geometry={
    distance:(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),
    distPointToSegment:(point,a,b)=>{
      const dx=b[0]-a[0],dy=b[1]-a[1];
      const lengthSquared=dx*dx+dy*dy;
      const t=lengthSquared
        ? Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/lengthSquared))
        : 0;
      return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
    },
    length:vector=>Math.hypot(vector[0],vector[1])
  };
  const window={editorMode};
  const context=vm.createContext({window,geometry});
  vm.runInContext(fs.readFileSync(path.join(root,'web','forces.js'),'utf8'),context);
  context.Force=window.Force;
  vm.runInContext(fs.readFileSync(path.join(root,'web','forcesManager.js'),'utf8'),context);
  const force=new window.Force();
  force.isExpected=false;
  force.moveable=false;
  force.editable=false;
  force.anchor=[0,0];
  force.arrowBase=[0,0];
  force.arrowTip=[100,0];
  force.updateDirectionAndLength();
  const manager=new window.ForcesManager();
  manager.forces=[force];
  manager.activeIndex=0;
  return {force,manager,context};
}

test('student mode can drag an initial force body but not its editable handles',()=>{
  const {force,manager}=setup();
  assert.equal(manager.updateHover([50,4]).part,'body');
  assert.equal(manager.updateHover([0,0]),null);
  assert.equal(manager.updateHover([100,0]),null);
  manager.updateHover([50,4]);
  assert.equal(force.handleMouseDown([50,4]),true);
  assert.equal(force.dragging,'body');
});

test('dragging a student-mode initial force translates the arrow without changing its vector',()=>{
  const {force}=setup();
  const initialVector=Array.from(force.vec);
  const initialLength=force.length;
  force.hovering='body';
  assert.equal(force.handleMouseDown([50,0]),true);
  force.handleMouseMove([60,15]);
  assert.deepEqual(Array.from(force.anchor),[0,0]);
  assert.deepEqual(Array.from(force.arrowBase),[10,15]);
  assert.deepEqual(Array.from(force.arrowTip),[110,15]);
  assert.deepEqual(Array.from(force.vec),initialVector);
  assert.equal(force.length,initialLength);
});

test('clicking an initial force body beats drawing from the active blank force',()=>{
  const {force,manager,context}=setup();
  const blankForce=new context.window.Force();
  blankForce.isExpected=true;
  manager.forces.push(blankForce);
  manager.activeIndex=1;

  const handlers={};
  Object.assign(context,{
    canvas:{addEventListener:(event,handler)=>{handlers[event]=handler;}},
    GRID_STEP:20,
    clearFeedback(){},
    getMousePos:()=>[50,4],
    withinForceArea:()=>true,
    inputsContainer:{querySelectorAll:()=>[]},
    snapping:{snap:pos=>({pos})},
    ensureInputMeta(){},
    requestAnimationFrame:callback=>callback()
  });
  context.window.fm=manager;
  context.window.DRAW_CENTER=[0,0];
  context.window.snapPoints=[];
  manager.syncInputs=()=>{};
  const source=fs.readFileSync(path.join(root,'web','main.js'),'utf8');
  const start=source.indexOf("  canvas.addEventListener('mousedown', (e)=>{");
  const end=source.indexOf("  canvas.addEventListener('mouseup', (e)=>{",start);
  assert.ok(start>=0 && end>start);
  vm.runInContext(source.slice(start,end),context);

  handlers.mousedown({});

  assert.equal(manager.activeIndex,0);
  assert.equal(force.dragging,'body');
});

test('clicking an inactive student-drawn force anchor starts a new force',()=>{
  const {force,manager,context}=setup();
  force.isExpected=true;
  force.moveable=true;
  force.editable=true;
  const blankForce=new context.window.Force();
  blankForce.isExpected=true;
  manager.forces.push(blankForce);
  manager.activeIndex=1;

  const handlers={};
  Object.assign(context,{
    canvas:{addEventListener:(event,handler)=>{handlers[event]=handler;}},
    GRID_STEP:20,
    clearFeedback(){},
    getMousePos:()=>[0,0],
    withinForceArea:()=>true,
    inputsContainer:{querySelectorAll:()=>[]},
    snapping:{snap:pos=>({pos})},
    ensureInputMeta(){},
    requestAnimationFrame:callback=>callback()
  });
  context.window.fm=manager;
  context.window.DRAW_CENTER=[0,0];
  context.window.snapPoints=[];
  manager.syncInputs=()=>{};
  const source=fs.readFileSync(path.join(root,'web','main.js'),'utf8');
  const start=source.indexOf("  canvas.addEventListener('mousedown', (e)=>{");
  const end=source.indexOf("  canvas.addEventListener('mouseup', (e)=>{",start);
  assert.ok(start>=0 && end>start);
  vm.runInContext(source.slice(start,end),context);

  assert.equal(manager.updateHover([0,0]).part,'anchor');
  handlers.mousedown({});

  assert.equal(manager.activeIndex,1);
  assert.equal(force.dragging,null);
  assert.equal(blankForce.drawing,true);
  assert.deepEqual(Array.from(blankForce.anchor),[0,0]);
});

test('clicking the focused student-drawn force anchor moves the anchor',()=>{
  const {force,manager,context}=setup();
  force.isExpected=true;
  force.moveable=true;
  force.editable=true;
  const blankForce=new context.window.Force();
  blankForce.isExpected=true;
  manager.forces.push(blankForce);
  manager.activeIndex=0;

  const handlers={};
  Object.assign(context,{
    canvas:{addEventListener:(event,handler)=>{handlers[event]=handler;}},
    GRID_STEP:20,
    clearFeedback(){},
    getMousePos:()=>[0,0],
    withinForceArea:()=>true,
    inputsContainer:{querySelectorAll:()=>[]},
    snapping:{snap:pos=>({pos})},
    ensureInputMeta(){},
    requestAnimationFrame:callback=>callback()
  });
  context.window.fm=manager;
  context.window.DRAW_CENTER=[0,0];
  context.window.snapPoints=[];
  manager.syncInputs=()=>{};
  const source=fs.readFileSync(path.join(root,'web','main.js'),'utf8');
  const start=source.indexOf("  canvas.addEventListener('mousedown', (e)=>{");
  const end=source.indexOf("  canvas.addEventListener('mouseup', (e)=>{",start);
  assert.ok(start>=0 && end>start);
  vm.runInContext(source.slice(start,end),context);

  handlers.mousedown({});

  assert.equal(manager.activeIndex,0);
  assert.equal(force.dragging,'anchor');
  assert.equal(blankForce.drawing,false);
});

test('editor mode keeps initial force endpoint handles available',()=>{
  const {manager}=setup(true);
  assert.equal(manager.updateHover([100,0]).part,'arrowTip');
});
