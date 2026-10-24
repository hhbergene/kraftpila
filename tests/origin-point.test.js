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

test('scene update initializes point storage without creating or syncing an origin point',()=>{
  const runtime=sceneRuntime();
  const taskOrigin=[30,50];
  const task={origin:taskOrigin,scene:{}};

  runtime.sceneModel.update(task);

  assert.deepEqual(Array.from(task.scene.points),[]);
  assert.equal(task.origin,taskOrigin);
  assert.equal(Object.hasOwn(task.scene,'origin'),false);
});

test('ordinary points remain anchor candidates and resolve through their IDs',()=>{
  const runtime=sceneRuntime();
  const point={id:'center-point',type:'free',pos:[30,50],snapping:true,visible:true};
  const task={scene:{points:[point]}};

  runtime.sceneModel.update(task);

  assert.deepEqual(Array.from(runtime.sceneModel.resolveAnchor(task,{
    type:'point',ref:'center-point',point:'center'
  }).pos),[30,50]);
  assert.ok(runtime.sceneModel.candidates(task).some(candidate=>
    candidate.anchor?.ref==='center-point'));
});

test('legacy origin-shaped points can be detached and deleted like ordinary points',()=>{
  const runtime=sceneRuntime();
  const point={id:'origin',type:'free',isOrigin:true,pos:[30,50]};
  const force={name:'F',anchor:{type:'point',ref:'origin',point:'center'}};
  const task={scene:{points:[point]},expectedForces:[force]};

  runtime.sceneModel.update(task);
  runtime.sceneModel.remapReferences(task,'point',0,'delete');
  task.scene.points.splice(0,1);

  assert.equal(task.scene.points.length,0);
  assert.deepEqual(JSON.parse(JSON.stringify(force.anchor)),{
    type:'custom',pos:[30,50],detachedReason:'Kildegeometrien ble slettet; ankeret er nå fritt.'
  });
});

test('default taskset no longer stores legacy origin fields or points',()=>{
  const taskset=JSON.parse(fs.readFileSync(path.join(root,'taskset_Default.json'),'utf8'));
  for(const task of taskset.tasks){
    assert.equal(Object.hasOwn(task,'origin'),false,`${task.id} has a legacy task origin`);
    assert.equal(Object.hasOwn(task.scene,'origin'),false,`${task.id} has a legacy scene origin`);
    assert.equal(task.scene.points?.some(point=>point.id==='origin' || point.isOrigin),false,
      `${task.id} has a legacy origin point`);
  }
});

test('no origin-specific scene editor controls or fallback anchors remain',()=>{
  const sources=['editor.js','main.js','scene_editor.js','ui.js','scene_render.js']
    .map(name=>fs.readFileSync(path.join(root,'web',name),'utf8')).join('\n');
  assert.doesNotMatch(sources,/isOrigin|ensureOriginPoint|ref:\s*['"]origin['"]|scene\.origin|task\.origin/);
});
