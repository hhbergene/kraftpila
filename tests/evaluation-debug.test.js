const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','web','evaluate.js'),'utf8');
const start=source.indexOf('  function computeScores(');
const end=source.indexOf('  function scoreToPoints(',start);
const relationsStart=source.indexOf('  function evalRelations(');
const relationsEnd=source.indexOf('\n  /**',relationsStart);
const context={
  window:{settings:{debug:true},fm:{forces:[]}},
  DIR_TOL_DEG:2,
  POS_TOL:22,
  DIR_SPAN_DEG:24,
  POS_SPAN:44,
  COVERAGE_PENALTY_EXP:1.5,
  NEATNESS_PENALTY_THRESHOLD:0.95,
  clamp:value=>Math.max(0,Math.min(1,value)),
  rampDownLinear:()=>1,
  evalSumF:()=>({score:1,errors:[]}),
  computeNeatness:()=>1,
  unit:vector=>{
    const length=Math.hypot(vector[0],vector[1]);
    return length>1e-9?[vector[0]/length,vector[1]/length]:[0,0];
  },
  getComponentDir:(component,task)=>{
    const plane=task.scene.plane;
    if(component==='normal') return plane.n_vec;
    if(component==='tangent') return plane.t_vec;
    if(component==='vertical') return [0,-1];
    if(component==='horizontal') return [1,0];
    return null;
  },
  magnitude:force=>force.length||0,
  componentMagnitude:(force,direction)=>{
    const unit=context.unit(direction);
    return Math.abs(force.vec[0]*unit[0]+force.vec[1]*unit[1]);
  }
};
vm.createContext(context);
vm.runInContext(source.slice(relationsStart,relationsEnd),context);
vm.runInContext(source.slice(start,end),context);

test('debug relations use force-component notation instead of separate component details',()=>{
  const force={
    name:'S_1',
    anchor:[0,0],
    arrowBase:[0,0],
    arrowTip:[3,4],
    force_dir:[0.6,0.8],
    vec:[3,4],
    length:5,
    isCompleted:()=>true
  };
  const secondForce={
    name:'G',
    anchor:[0,0],
    arrowBase:[0,0],
    arrowTip:[0,5],
    force_dir:[0,1],
    vec:[0,5],
    length:5,
    isCompleted:()=>true
  };
  context.window.fm.forces=[force,secondForce];
  const task={
    expectedForces:[],
    scene:{plane:{t_vec:[1,0],n_vec:[0,-1]}},
    relations:[
      {lhs:[{name:'S_1',component:'vertical'}],rhs:[{name:'G'}]},
      {lhs:[{name:'S_1',component:'horizontal'}],rhs:[{name:'G',component:'tangent'}]},
      {lhs:[{name:'S_1',component:'normal'}],rhs:[{name:'G',component:'magnitude'}]}
    ]
  };
  const relationResults=context.evalRelations(task,[
    {name:'S_1',found:true,index:0},
    {name:'G',found:true,index:1}
  ]);

  const summary=context.computeScores(task,[],relationResults,[force]);

  assert.match(summary.debugOutput,/S_1: F_x=3\.0, F_y=4\.0, F_t=3\.0, F_n=-4\.0, \|F\|=5\.0px/);
  assert.match(summary.debugOutput,/S_1_y = \|G\|:/);
  assert.match(summary.debugOutput,/S_1_x = G_t:/);
  assert.match(summary.debugOutput,/S_1_n = \|G\|:/);
  assert.doesNotMatch(summary.debugOutput,/Komponenter:/);

  context.computeNeatness=()=>0.999;
  const commentOnlySummary=context.computeScores(task,[],relationResults,[force]);
  assert.equal(commentOnlySummary.neatness,0.999);
  assert.equal(commentOnlySummary.finalScore,summary.finalScore);
  assert.match(commentOnlySummary.debugOutput,/Intermediate = .* × 100% =/);
});
