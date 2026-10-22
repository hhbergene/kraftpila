const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function sceneRuntime(){
  const sandbox = {console};
  sandbox.window = sandbox;
  sandbox.drawFormattedText = () => {};
  vm.createContext(sandbox);
  for(const name of ['shared.js', 'geometry.js', 'scene_render.js', 'scene_model.js']){
    vm.runInContext(fs.readFileSync(path.join(root, 'web', name), 'utf8'), sandbox, {filename: name});
  }
  return sandbox;
}

test('all existing tasksets retain legacy geometry and render in both modes', () => {
  const runtime = sceneRuntime();
  const coordinateMethods = new Set(['moveTo', 'lineTo', 'translate', 'rotate', 'arc', 'ellipse']);
  const ctx = new Proxy({}, {
    get(target, key){
      if(key in target) return target[key];
      return (...args) => {
        if(coordinateMethods.has(key)){
          args.filter(value => typeof value === 'number').forEach(value => assert.ok(Number.isFinite(value), `${key}: finite coordinates`));
        }
      };
    },
    set(target, key, value){ target[key] = value; return true; }
  });
  let count = 0;
  for(const filename of fs.readdirSync(root).filter(name => /^(taskset_.*|oppgavesett)\.json$/.test(name))){
    const data = JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
    const tasks = Array.isArray(data) ? data : data.tasks;
    assert.ok(Array.isArray(tasks), `${filename}: tasks array`);
    for(const source of tasks){
      if(!source.scene) continue;
      const task = JSON.parse(JSON.stringify(source));
      const before = JSON.stringify([task.scene.plane, task.scene.rects, task.scene.circles, task.scene.ellipses, task.scene.segments, task.scene.arrows]);
      runtime.drawScene(ctx, task, true);
      runtime.drawScene(ctx, task, false);
      const lookup = runtime.buildAllScenePoints(task);
      assert.ok(lookup && typeof lookup === 'object');
      assert.equal(JSON.stringify([task.scene.plane, task.scene.rects, task.scene.circles, task.scene.ellipses, task.scene.segments, task.scene.arrows]), before);
      count++;
    }
  }
  assert.ok(count > 0);
});

test('segment direction ignores its location and reversal selects the supplementary angle', () => {
  const runtime = sceneRuntime();
  const task = {scene: {segments: [{a: [0, 0], b: [50, 0]}]}};
  const angle = {
    vertex: {pos: [100, 100]},
    start: {pos: [150, 100], anchor: {type: 'segment', ref: 'segment0', segment: 'segment'}},
    end: {pos: [150, 50]},
    radius: 20, symbol: 'a', showDegrees: true
  };
  const forward = runtime.sceneModel.angleGeometry(angle, task);
  assert.ok(forward.valid);
  assert.ok(Math.abs(forward.degrees - 45) < 1e-8);
  angle.startReversed = true;
  const reversed = runtime.sceneModel.angleGeometry(angle, task);
  assert.ok(reversed.valid);
  assert.ok(Math.abs(reversed.degrees - 135) < 1e-8);
  angle.startReversed = false;
  angle.end.pos = [150, 100];
  assert.equal(runtime.sceneModel.angleGeometry(angle, task).degrees, 0);
  angle.end.pos = [50, 100];
  assert.equal(runtime.sceneModel.angleGeometry(angle, task).degrees, 180);
});

test('pupil evaluation resolves hidden points including invalid intersections at their last valid position', () => {
  const runtime = sceneRuntime();
  runtime.showFeedback = () => {};
  vm.runInContext(fs.readFileSync(path.join(root, 'web', 'evaluate.js'), 'utf8'), runtime);
  for(const type of ['free', 'intersection']){
    const point = {id: 'point-1', type, pos: [123, 157], visible: false};
    if(type === 'intersection'){
      point.sources = [{ref: 'missing0', segment: 'segment'}, {ref: 'missing1', curve: true}];
      point.lastValidPos = point.pos.slice();
    }
    runtime.currentTask = {
      scene: {points: [point]},
      expectedForces: [{name: 'F', anchor: {type: 'point', ref: point.id, point: 'center'}, dir: [0, -1]}]
    };
    runtime.sceneModel.update(runtime.currentTask);
    runtime.sceneLookup = runtime.buildAllScenePoints(runtime.currentTask);
    runtime.fm = {forces: [{
      name: 'F', anchor: [123, 157], arrowBase: [123, 157], arrowTip: [123, 77],
      vec: [0, -80], force_dir: [0, -1], force_len: 80, moveable: true
    }, {name: '', anchor: null, arrowBase: null, arrowTip: null, moveable: true}]};
    runtime.runEvaluation();
    assert.equal(runtime.lastEvaluation.summary.expectedCount, 1);
    assert.equal(runtime.lastEvaluation.summary.foundCount, 1);
    assert.equal(runtime.lastEvaluation.summary.finalScore, 1);
    if(type === 'intersection') assert.equal(point.valid, false);
  }
});

test('angle labels use automatic equals, ignore legacy manualDegrees, and preserve literal text', () => {
  const runtime=sceneRuntime();
  const labels=[];
  runtime.drawFormattedText=(ctx,text)=>labels.push(text);
  const ctx=new Proxy({}, {get:(target,key)=>target[key] || (()=>{}),set:(target,key,value)=>(target[key]=value,true)});
  const angle={vertex:{pos:[0,0]},start:{pos:[30,0]},end:{pos:[0,-30]},
    radius:30,symbol:'α',showDegrees:true,manualDegrees:12};
  const task={scene:{angles:[angle]}};
  for(const editor of [true,false]){
    labels.length=0;
    runtime.drawScene(ctx,task,editor);
    assert.deepEqual(labels,['α=90°']);
    angle.symbol='';
    labels.length=0;
    runtime.drawScene(ctx,task,editor);
    assert.deepEqual(labels,['90°']);
    angle.symbol='\\alpha=30\\deg';
    angle.showDegrees=false;
    labels.length=0;
    runtime.drawScene(ctx,task,editor);
    assert.deepEqual(labels,['\\alpha=30\\deg']);
    angle.showDegrees=true;
    angle.symbol='α';
  }
});

test('formatted text supports alpha, deg, degree and direct symbols without prefix corruption',()=>{
  const runtime=sceneRuntime(),glyphs=[];
  vm.runInContext(fs.readFileSync(path.join(root,'web','text_render.js'),'utf8'),runtime);
  const ctx={measureText:t=>({width:t.length*8}),fillText:t=>glyphs.push(t),save(){},restore(){}};
  runtime.drawFormattedText(ctx,'\\alpha=30\\deg / \\degree / α=30°',0,0);
  assert.equal(glyphs.join(''),'α=30° / ° / α=30°');
});
