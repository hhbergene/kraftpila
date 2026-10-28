const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const taskset=JSON.parse(fs.readFileSync(path.join(root,'taskset_Default.json'),'utf8'));

function setup(){
  const window={settings:{debug:true},fm:{forces:[]},sceneLookup:{}};
  window.window=window;
  window.showFeedback=(lines,scoreText)=>{window.feedback={lines,scoreText};};
  vm.createContext(window);
  for(const file of ['shared.js','geometry.js','evaluate.js']){
    let source=fs.readFileSync(path.join(root,'web',file),'utf8');
    if(file==='evaluate.js') source=source.replace('  window.runEvaluation = runEvaluation;',
      '  window.runEvaluation = runEvaluation; window.evaluation = {evalRelations,relationScore,scoreToPoints};');
    vm.runInContext(source,window);
  }
  return window;
}

function force(name,vec,anchor=[0,0]){
  return {name,vec,anchor,arrowBase:anchor,
    arrowTip:[anchor[0]+vec[0],anchor[1]+vec[1]],length:Math.hypot(...vec)};
}

function relation(window,left,right,overrides={}){
  window.fm.forces=[force('A',[left,0]),force('B',[right,0])];
  const task={relations:[{lhs:[{name:'A'}],rhs:[{name:'B'}],ratio:1,...overrides}]};
  const results=[{name:'A',index:0,found:true},{name:'B',index:1,found:true}];
  return window.evaluation.evalRelations(task,results)[0];
}

function close(actual,expected){
  assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
}

test('w4p6n reference answer evaluates without local plane axes or a sumF check',()=>{
  const window=setup();
  const task=structuredClone(taskset.tasks.find(task=>task.id.endsWith('w4p6n')));
  window.currentTask=task;
  window.sceneLookup={
    rect1:{points:{center:[360,220]},segments:{bottom:[[300,280],[420,280]]}},
    segment0:{segments:{segment:[[420,220],[600,220]]}}
  };
  window.fm.forces=[
    ...task.expectedForces.map(spec=>({...spec.drawn,name:spec.name})),
    ...task.initialForces
  ].map(spec=>({
    ...spec,
    vec:spec.arrowTip.map((value,index)=>value-spec.arrowBase[index]),
    length:Math.hypot(...spec.arrowTip.map((value,index)=>value-spec.arrowBase[index]))
  }));
  window.runEvaluation();
  const summary=window.lastEvaluation.summary;
  assert.equal(summary.finalScore,1);
  assert.equal(summary.relationsScore,1);
  assert.equal(summary.sumFResult.x,null);
  assert.equal(summary.sumFResult.y,null);
  assert.match(summary.debugOutput,/Sum of forces \(equilibrium\): ikke evaluert/);
  assert.doesNotMatch(summary.debugOutput,/NaN|Infinity|Fallback:/);
});

test('missing sumF without relations defaults to zero on global axes only',()=>{
  for(const vector of [[100,0],[0,100],[0,0]]){
    const window=setup();
    window.currentTask={
      scene:{plane:{angleDeg:0}},
      expectedForces:[{name:'A',dir:vector,anchor:{type:'custom',pos:[0,0]}}]
    };
    window.fm.forces=[force('A',vector)];
    window.runEvaluation();
    const summary=window.lastEvaluation.summary;
    assert.equal(summary.sumFResult.x,vector[0]);
    assert.equal(summary.sumFResult.y,vector[1]);
    assert.equal(summary.sumFResult.score,vector.some(value=>value!==0)?0.5:1);
    assert.match(summary.debugOutput,/Fallback:/);
    assert.equal(Object.hasOwn(window.currentTask,'sumF'),false);
  }
});

test('explicit empty sumF disables equilibrium, while explicit requirements remain active',()=>{
  for(const sumF of [{},{x:0},{y:100}]){
    const window=setup();
    window.currentTask={
      scene:{plane:{angleDeg:0}},
      expectedForces:[{name:'A',dir:[1,0],anchor:{type:'custom',pos:[0,0]}}],
      sumF
    };
    window.fm.forces=[force('A',[100,0])];
    window.runEvaluation();
    const summary=window.lastEvaluation.summary;
    assert.equal(summary.sumFResult.x,Object.hasOwn(sumF,'x')?100:null);
    assert.equal(summary.sumFResult.y,Object.hasOwn(sumF,'y')?0:null);
    assert.equal(summary.finalScore,Object.keys(sumF).length?0.5:1);
    assert.doesNotMatch(summary.debugOutput,/Fallback:/);
  }
});

test('missing sumF with relations does not enable an equilibrium fallback',()=>{
  const window=setup();
  window.currentTask={
    expectedForces:[{name:'A',dir:[1,0],anchor:{type:'custom',pos:[0,0]}}],
    relations:[{lhs:[{name:'A'}],rhs:[{name:'A'}],ratio:1}]
  };
  window.fm.forces=[force('A',[100,0])];
  window.runEvaluation();
  const summary=window.lastEvaluation.summary;
  assert.equal(summary.finalScore,1);
  assert.equal(summary.sumFResult.x,null);
  assert.equal(summary.sumFResult.y,null);
  assert.doesNotMatch(summary.debugOutput,/Fallback:/);
});

test('92zvk incorrect component match gives feedback and 0.92 with 1.75 points',()=>{
  const window=setup();
  const task=structuredClone(taskset.tasks.find(task=>task.id.endsWith('92zvk')));
  const normal=task.scene.plane.n_vec;
  window.currentTask=task;
  window.sceneLookup={rect0:{points:{center:[480,320]},
    segments:{bottom:[[420,400],[580,320]]}}};
  window.fm.forces=[
    force('G',[0,80],[480,320]),
    {...force('N',normal.map(value=>value*80),[520,350]),anchor:[500,360]}
  ];
  window.runEvaluation();
  const results=window.evaluation.evalRelations(task,[
    {name:'G',index:0,found:true},{name:'N',index:1,found:true}
  ]);
  const result=results[0];
  close(result.absError,8.44582472000673);
  close(result.relError,0.10557280900008414);
  close(result.tolerance,4);
  close(result.relScore,0.8332815729997477);
  assert.equal(result.ok,false);
  close(window.lastEvaluation.summary.finalScore,0.9166407864998738);
  assert.equal(window.evaluation.scoreToPoints(window.lastEvaluation.summary.finalScore),1.75);
  assert.match(window.feedback.scoreText,/Score: 0\.92 \(1\.75 poeng\)/);
  assert.ok(window.feedback.lines.some(line=>line.text.includes('Lengdeforholdet')));
  assert.match(window.lastEvaluation.summary.debugOutput,/avvik 8\.45px \/ 10\.6%/);
  assert.match(window.lastEvaluation.summary.debugOutput,/tol 5\.0% eller 2\.00px; effektiv 4\.00px/);
});

test('curve is continuous at T, 3T and 6T and clamped to 0..1',()=>{
  const {relationScore}=setup().evaluation;
  for(const [error,score] of [[0,1],[4,1],[8,0.85],[12,0.7],[18,0.35],[24,0],[100,0]]){
    close(relationScore(error,4),score);
    assert.ok(relationScore(error,4)>=0 && relationScore(error,4)<=1);
  }
  for(const boundary of [4,12,24]){
    close(relationScore(boundary-1e-10,4),relationScore(boundary+1e-10,4));
  }
  assert.equal(relationScore(0,0),1);
  assert.equal(relationScore(0.001,0),0);
});

test('8px error loses a quarter point while a small excess retains full points',()=>{
  const window=setup();
  const result=relation(window,72,80);
  close(result.relScore,0.85);
  close((1+result.relScore)/2,0.925);
  assert.equal(window.evaluation.scoreToPoints((1+result.relScore)/2),1.75);
  const small=relation(window,75.9,80);
  assert.equal(small.ok,false);
  assert.ok(small.relScore<1);
  assert.equal(window.evaluation.scoreToPoints((1+small.relScore)/2),2);
});

test('relative or absolute tolerance is sufficient, including exact boundaries',()=>{
  const window=setup();
  for(const [left,right,tolerance,ok] of [
    [22,20,2,true],[22.01,20,2,false],[105,100,5,true],[105.01,100,5,false],
    [2,0,2,true],[2.01,0,2,false],[0,0,2,true],[0,100,5,false]
  ]){
    const result=relation(window,left,right);
    assert.equal(result.tolerance,tolerance);
    assert.equal(result.ok,ok);
    assert.equal(result.relScore===1,ok);
    if(right===0){
      assert.equal(result.measuredRatio,null);
      assert.equal(result.relError,null);
    }
  }
});

test('custom tolerances, explicit zero and non-unit ratios use the expected side',()=>{
  const window=setup();
  assert.equal(relation(window,110,100,{tol_rel:0.15}).ok,true);
  assert.equal(relation(window,110,100,{tol_abs:10}).ok,true);
  assert.equal(relation(window,100.01,100,{tol_rel:0,tol_abs:0}).relScore,0);
  assert.equal(relation(window,100,100,{tol_rel:0,tol_abs:0}).relScore,1);
  assert.equal(relation(window,101,100,{tol_rel:0}).ok,true);
  assert.equal(relation(window,105,100,{tol_abs:0}).ok,true);
  const result=relation(window,210,100,{ratio:2});
  close(result.tolerance,10);
  assert.equal(result.ok,true);
});

test('relations include multiple terms, components and initial forces; missing forces score zero',()=>{
  const window=setup();
  window.fm.forces=[force('A',[3,4]),force('B',[7,0]),force('C',[11,0])];
  const task={scene:{plane:{n_vec:[0,1],t_vec:[1,0]}},
    initialForces:[{name:'C'}],
    relations:[{lhs:[{name:'A',component:'normal'},{name:'B'}],rhs:[{name:'C'}],ratio:1}]};
  const results=[{name:'A',found:true,index:0},{name:'B',found:true,index:1}];
  assert.equal(window.evaluation.evalRelations(task,results)[0].relScore,1);
  const missing=window.evaluation.evalRelations(task,results.slice(0,1))[0];
  assert.equal(missing.relScore,0);
  assert.equal(missing.ok,false);
  assert.equal(missing.missingInvolved,true);
});

test('zero comparison side has explicit debug output without NaN or Infinity',()=>{
  const window=setup();
  window.currentTask={expectedForces:[],initialForces:[{name:'A'},{name:'B'}],
    relations:[{lhs:[{name:'A'}],rhs:[{name:'B'}],ratio:1}]};
  window.fm.forces=[force('A',[3,0]),force('B',[0,0],[50,50])];
  window.runEvaluation();
  assert.match(window.lastEvaluation.summary.debugOutput,/målt forhold udefinert/);
  assert.match(window.lastEvaluation.summary.debugOutput,/avvik 3\.00px \(tol/);
  assert.doesNotMatch(window.lastEvaluation.summary.debugOutput,/NaN|Infinity/);
});

test('bundled relations inherit tolerances instead of persisting defaults',()=>{
  const relations=taskset.tasks.flatMap(task=>task.relations || []);
  assert.ok(relations.length>=22);
  assert.ok(relations.every(rel=>!Object.hasOwn(rel,'tol_rel') && !Object.hasOwn(rel,'tol_abs')));
});

function answerTask(component='magnitude'){
  return {
    scene:{plane:{n_vec:[0,2],t_vec:[3,0]}},
    expectedForces:[{name:'A',drawn:force('A',[6,-8])}],
    initialForces:[force('B',[3,-4])],
    relations:[{lhs:[{name:'A',component}],rhs:[{name:'B',component}]}]
  };
}

test('automatic ratios project absolute answer components, normalize axes and include given forces',()=>{
  const window=setup();
  for(const component of ['magnitude','horizontal','vertical','normal','tangent']){
    const task=answerTask(component);
    close(window.getAutomaticRelationRatio(task,task.relations[0]).value,2);
    task.expectedForces[0].drawn=force('A',[-6,8]);
    close(window.getAutomaticRelationRatio(task,task.relations[0]).value,2);
  }
  const task=answerTask('normal');
  task.scene.plane.n_vec=[3,4];
  task.scene.plane.t_vec=[4,-3];
  task.expectedForces[0].drawn=force('A',[0,10]);
  task.initialForces[0]=force('B',[5,0]);
  close(window.getAutomaticRelationRatio(task,task.relations[0]).value,8/3);
  task.relations[0].lhs.push({name:'B',component:'tangent'});
  close(window.getAutomaticRelationRatio(task,task.relations[0]).value,4);
});

test('automatic evaluation uses teacher geometry rather than student geometry and explicit ratios still win',()=>{
  const window=setup();
  const task=answerTask('vertical');
  window.fm.forces=[force('A',[0,8]),force('B',[0,4])];
  const results=[{name:'A',index:0,found:true}];
  assert.equal(window.evaluation.evalRelations(task,results)[0].relScore,1);
  window.fm.forces[0]=force('A',[0,40]);
  const wrong=window.evaluation.evalRelations(task,results)[0];
  assert.equal(wrong.expectedRatio,2);
  assert.equal(wrong.measuredRatio,10);
  assert.equal(wrong.relScore,0);
  task.relations[0].ratio=10;
  assert.equal(window.evaluation.evalRelations(task,results)[0].relScore,1);
  const reloaded=JSON.parse(JSON.stringify(task));
  delete reloaded.relations[0].ratio;
  assert.equal(window.evaluation.evalRelations(reloaded,results)[0].expectedRatio,2);
});

test('unavailable automatic ratios never fall back to one or student geometry',()=>{
  const window=setup();
  for(const change of [
    task=>{delete task.expectedForces[0].drawn;},
    task=>{task.initialForces[0].arrowTip=[0,0];},
    task=>{task.relations[0].lhs=[];},
    task=>{task.relations[0].lhs[0].component='unknown';},
    task=>{task.scene.plane.n_vec=[0,0];},
    task=>{task.expectedForces[0].drawn.arrowTip=[0,0];}
  ]){
    const task=answerTask('normal');
    change(task);
    const result=window.getEffectiveRelationRatio(task,task.relations[0]);
    assert.equal(result.value,null);
    assert.ok(result.error);
    task.relations[0].ratio=3;
    assert.equal(window.getEffectiveRelationRatio(task,task.relations[0]).value,3);
  }
  window.currentTask=answerTask();
  delete window.currentTask.expectedForces[0].drawn;
  window.fm.forces=[force('A',[10,0]),force('B',[10,0])];
  window.runEvaluation();
  assert.equal(window.lastEvaluation,null);
  assert.match(window.feedback.scoreText,/Ugyldig oppgave/);
  assert.match(window.feedback.lines[0].text,/Mangler fasitgeometri/);
});
