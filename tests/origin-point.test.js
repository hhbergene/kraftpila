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

test('legacy circles migrate to locked ellipses and remap force, angle, and intersection references',()=>{
  const runtime=sceneRuntime();
  const ellipses=[{center:[5,5],width:10,height:20}];
  const circles=[
    {center:[10,10],radius:5,color:'#123456',snapping:false},
    {center:[20,20],radius:8,fill_color:'#abcdef'}
  ];
  const force={anchor:{type:'point',ref:'circle0',point:'center'}};
  const laterForce={anchor:{type:'point',ref:'circle1',point:'center'}};
  const angle={start:{pos:[0,0]},vertex:{pos:[0,0],anchor:{type:'point',ref:'circle1',point:'center'}},
    end:{pos:[1,1]}};
  const intersection={type:'intersection',sources:[
    {ref:'circle0',curve:true},{ref:'circle1',curve:true}
  ]};
  const task={scene:{ellipses,circles,angles:[angle],points:[intersection]},
    forces:[force,laterForce]};

  assert.equal(runtime.sceneModel.migrateCirclesToEllipses(task),true);
  assert.equal(Object.hasOwn(task.scene,'circles'),false);
  assert.deepEqual(JSON.parse(JSON.stringify(ellipses.slice(1))),[
    {center:[10,10],color:'#123456',snapping:false,width:10,height:10,
      t_vec:[1,0],n_vec:[0,-1],lockAxes:true},
    {center:[20,20],fill_color:'#abcdef',width:16,height:16,
      t_vec:[1,0],n_vec:[0,-1],color:'#999999',lockAxes:true}
  ]);
  assert.equal('radius' in ellipses[1],false);
  assert.equal(force.anchor.ref,'ellipse1');
  assert.equal(laterForce.anchor.ref,'ellipse2');
  assert.equal(angle.vertex.anchor.ref,'ellipse2');
  assert.deepEqual(JSON.parse(JSON.stringify(intersection.sources)),[
    {ref:'ellipse1',curve:true},{ref:'ellipse2',curve:true}
  ]);
  assert.equal(runtime.sceneModel.migrateCirclesToEllipses(task),false,
    'migration is idempotent after the legacy collection is removed');
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
