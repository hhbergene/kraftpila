const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function sceneRuntime(){
  const sandbox = {console};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for(const name of ['shared.js', 'geometry.js', 'scene_render.js', 'scene_model.js']){
    vm.runInContext(fs.readFileSync(path.join(root, 'web', name), 'utf8'), sandbox, {filename: name});
  }
  return sandbox;
}

function canvasContext(arcs){
  return new Proxy({}, {
    get(target,key){
      if(key==='arc') return (...args)=>arcs.push(args.slice(0,3));
      return key in target ? target[key] : ()=>{};
    },
    set(target,key,value){target[key]=value;return true;}
  });
}

test('legacy origin migrates to a required point without shifting existing point references',()=>{
  const runtime=sceneRuntime();
  const existing={id:'point-existing',type:'free',pos:[90,110]};
  const task={origin:[30,50],scene:{origin:[10,20],points:[existing]}};

  runtime.sceneModel.update(task);

  const origin=task.scene.points.find(point=>point.isOrigin);
  assert.ok(origin);
  assert.equal(origin.id,'origin');
  assert.equal(origin.type,'free');
  assert.deepEqual(Array.from(origin.pos),[30,50]);
  assert.equal(origin.visible,false);
  assert.equal(origin.snapping,false);
  assert.equal(task.scene.points[0],existing);
  assert.equal(runtime.sceneModel.resolveAnchor(task,{type:'point',ref:'point0'}).pos[0],90);
  assert.equal(runtime.sceneModel.resolveAnchor(task,{type:'point',ref:'origin'}).pos[1],50);
  assert.equal(task.origin,origin.pos);
  assert.equal(task.scene.origin,origin.pos);

  runtime.sceneModel.remapReferences(task,'point',task.scene.points.indexOf(origin),'delete');
  assert.ok(task.scene.points.includes(origin),'the required origin is not deleted');
});

test('legacy forces anchored to origin follow its migrated point position',()=>{
  const runtime=sceneRuntime();
  const anchorSpec={type:'point',ref:'origin',point:'center'};
  const initial={name:'F',anchorSpec};
  const task={origin:[30,50],scene:{},initialForces:[initial]};
  const force={name:'F',isExpected:false,anchor:[30,50],arrowBase:[35,50],arrowTip:[35,110],
    updateDirectionAndLength(){this.updated=true;}};

  runtime.sceneModel.update(task);
  assert.equal(runtime.syncSceneForceAnchors(task,{forces:[force]},false),false);
  task.scene.points.find(point=>point.isOrigin).pos[0]=45;
  runtime.sceneModel.update(task);

  assert.equal(runtime.syncSceneForceAnchors(task,{forces:[force]},false),true);
  assert.deepEqual(Array.from(force.anchor),[45,50]);
  assert.deepEqual(Array.from(force.arrowBase),[50,50]);
  assert.deepEqual(Array.from(force.arrowTip),[50,110]);
  assert.equal(force.updated,true);
});

test('origin visibility and snap settings control only student rendering and snapping candidates',()=>{
  const runtime=sceneRuntime();
  const arcs=[];
  const ctx=canvasContext(arcs);
  const task={origin:[40,60],scene:{points:[]}};

  runtime.drawScene(ctx,task,false);
  assert.deepEqual(arcs,[],'the default hidden origin is not drawn for students');
  assert.equal(runtime.sceneModel.candidates(task).some(candidate=>candidate.anchor.ref==='origin'),false);
  assert.equal(Object.hasOwn(runtime.buildSceneLookup(task),'origin'),false);

  const origin=task.scene.points.find(point=>point.isOrigin);
  origin.visible=true;
  origin.snapping=true;
  runtime.drawScene(ctx,task,false);
  assert.deepEqual(arcs,[[40,60,4]]);
  assert.equal(runtime.sceneModel.candidates(task).some(candidate=>candidate.anchor.ref==='origin'),true);
  assert.ok(Object.hasOwn(runtime.buildSceneLookup(task),'origin'));

  origin.visible=false;
  origin.snapping=false;
  arcs.length=0;
  runtime.drawScene(ctx,task,true);
  assert.deepEqual(arcs,[[40,60,4]],'the editor still draws the required point');
});

test('origin editor exposes coordinates, visibility and snapping but no delete action',()=>{
  const ui=fs.readFileSync(path.join(root,'web','ui.js'),'utf8');
  const editor=fs.readFileSync(path.join(root,'web','scene_editor.js'),'utf8');
  assert.match(ui,/const originPoint = scene\.points\?\.find\(point => point\?\.isOrigin\)/);
  assert.match(ui,/scenePanel\.insertBefore\(originItem, scenePanel\.firstChild\)/);
  assert.match(editor,/numberField\(parent,'x:'/);
  assert.match(editor,/numberField\(parent,'y:'/);
  assert.match(editor,/checkbox\(parent,'Synlig for eleven',obj\.visible/);
  assert.match(editor,/checkbox\(parent,'Snap',obj\.snapping!==false/);
  assert.match(editor,/if\(!obj\.isOrigin\)\{/);
});
