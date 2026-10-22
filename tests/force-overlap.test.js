const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'web','evaluate.js'),'utf8');
const context={geometry:{length:vector=>Math.hypot(...vector)}};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function computeNeatness('),
  source.indexOf('  function unit(')),context);

function neatness(segments){
  const forces=segments.map(([arrowBase,arrowTip])=>({arrowBase,arrowTip}));
  const matches=forces.map((_,index)=>({found:true,index}));
  return context.computeNeatness({},matches,forces);
}

test('arrows with different directions do not lose points for common endpoints or crossings',()=>{
  assert.equal(neatness([[[0,0],[80,0]],[[0,0],[0,80]]]),1);
  assert.equal(neatness([[[0,0],[80,0]],[[40,-40],[40,40]]]),1);
  assert.equal(neatness([[[0,0],[80,0]],[[0,0],[-80,0]]]),1);
});

test('only parallel shafts with a shared length receive the overlap penalty',()=>{
  assert.equal(neatness([[[0,0],[80,0]],[[0,0],[40,0]]]),0.9);
  assert.equal(neatness([[[0,0],[80,0]],[[60,0],[20,0]]]),0.9);
  assert.equal(neatness([[[0,0],[80,0]],[[80,0],[120,0]]]),1);
  assert.equal(neatness([[[0,0],[80,0]],[[0,5],[80,5]]]),1);
  assert.equal(neatness([[[0,0],[0,0]],[[0,0],[80,0]]]),1);
});

test('Hengende kasse 07abc has no overlap penalty for its diverging snordrag',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(root,'taskset_Default.json'),'utf8'));
  const task=data.tasks.find(task=>task.id.endsWith('07abc'));
  assert.ok(task);
  assert.equal(neatness(task.expectedForces.map(force=>[force.drawn.arrowBase,force.drawn.arrowTip])),1);
});
