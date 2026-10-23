const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'web','evaluate.js'),'utf8');
const context={
  geometry:{length:vector=>Math.hypot(...vector)},
  NEATNESS_COMMENT_ONLY:0.999,
  NEATNESS_PENALTY_THRESHOLD:0.95,
  NEATNESS_OVERLAP_PENALTY:0.9
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function computeNeatness('),
  source.indexOf('  function unit(')),context);

function neatness(segments){
  const forces=segments.map(([arrowBase,arrowTip])=>({arrowBase,arrowTip}));
  const matches=forces.map((_,index)=>({found:true,index}));
  return context.computeNeatness({},matches,forces);
}

test('arrow shafts passing through a base point produce a warning without a penalty',()=>{
  const forces=[
    {name:'G',arrowBase:[680,360],arrowTip:[680,480]},
    {name:'N',arrowBase:[700,420],arrowTip:[668.4,325.1]}
  ];
  const result=context.computeNeatness({},forces.map((_,index)=>({found:true,index})),forces);
  assert.equal(result,0.999);

  const feedbackStart=source.indexOf('  function buildFeedbackLines(');
  const scoringComment=source.indexOf('Compute overall scoring based on',feedbackStart);
  const feedbackEnd=source.lastIndexOf('  /**',scoringComment);
  vm.runInContext(source.slice(feedbackStart,feedbackEnd),context);
  const lines=context.buildFeedbackLines([],[],[],false,{initialForces:[]},result);
  assert.ok(lines.some(line=>line.text.includes('basepunkt')));
});

test('arrow shafts crossing away from base points receive the overlap penalty',()=>{
  const forces=[
    {name:'G',arrowBase:[0,0],arrowTip:[80,0]},
    {name:'N',arrowBase:[40,-40],arrowTip:[40,40]}
  ];
  const result=context.computeNeatness({},forces.map((_,index)=>({found:true,index})),forces);
  assert.equal(result,0.9);
});

test('initial forces are included when checking user-drawn shaft overlap',()=>{
  const initialForce={name:'G',arrowBase:[0,0],arrowTip:[0,80]};
  const expectedForce={name:'N',arrowBase:[0,60],arrowTip:[0,-20]};
  const forces=[initialForce,expectedForce];
  const result=context.computeNeatness(
    {initialForces:[{name:'G'}]},
    [{found:true,index:1}],
    forces
  );
  assert.equal(result,0.9);
});

test('arrows with different directions do not lose points for a shared endpoint',()=>{
  assert.equal(neatness([[[0,0],[80,0]],[[0,0],[0,80]]]),1);
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
