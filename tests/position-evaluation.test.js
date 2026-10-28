const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..','web');
const source=fs.readFileSync(path.join(root,'evaluate.js'),'utf8');
const geometrySource=fs.readFileSync(path.join(root,'geometry.js'),'utf8');

function setup(gridStep=20){
  const context={GRID_STEP:gridStep,settings:{debug:true},
    sceneLookup:{block:{points:{center:[0,0]},segments:{bottom:[[0,0],[100,0]]}}},
    fm:{forces:[]}};
  context.window=context;
  context.showFeedback=(lines,scoreText)=>{context.feedback={lines,scoreText};};
  vm.createContext(context);
  vm.runInContext(geometrySource,context);
  vm.runInContext(source.replace('  window.runEvaluation = runEvaluation;',
    `  window.runEvaluation = runEvaluation;
       window.evaluation = {positionScore, evalForces, matchForcesToExpected, scoreToPoints};`),context);
  return context;
}

function force(anchor,angle=0){
  const radians=angle*Math.PI/180;
  const vec=[100*Math.cos(radians),100*Math.sin(radians)];
  return {name:'G',anchor,arrowBase:anchor,
    arrowTip:[anchor[0]+vec[0],anchor[1]+vec[1]],vec,length:100};
}

function evaluate(context,error,{type='point',angle=0}={}){
  const anchor=type==='custom' ? {type,pos:[0,0]} :
    type==='segment' ? {type,ref:'block',segment:'bottom'} :
      {type,ref:'block',point:'center'};
  context.currentTask={expectedForces:[{name:'G',dir:[1,0],anchor}],sumF:{}};
  context.fm.forces=[force(type==='segment' ? [50,error] : [0,error],angle)];
  context.runEvaluation();
  return context.lastEvaluation;
}

function close(actual,expected){
  assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);
}

test('position score has a 5px margin, near-1 feedback band and half-grid falloff',()=>{
  const {positionScore}=setup().evaluation;
  for(const [error,expected] of [
    [0,1],[5,1],[5.000001,0.999],[9.999999,0.999],[10,0.999],
    [10.000001,0.999*(1-0.000001/44)],
    [20,0.999*(1-10/44)],[54,0],[1000,0]
  ]){
    close(positionScore(error),expected);
    close(positionScore(-error),expected);
    assert.ok(positionScore(error)>=0 && positionScore(error)<=1);
  }
  assert.ok(Math.abs(positionScore(10.000001)-positionScore(10))<1e-7);
});

test('half-grid falloff follows the existing grid step',()=>{
  const {positionScore}=setup(40).evaluation;
  assert.equal(positionScore(5),1);
  assert.equal(positionScore(20),0.999);
  close(positionScore(40),0.999*(1-20/44));
});

for(const type of ['point','custom','segment']){
  test(`${type} anchors share feedback, internal scoring and displayed scoring`,()=>{
    const context=setup();
    for(const error of [0,5,5.000001,9.999999,10,10.000001,20,54,1000]){
      const {summary,lines}=evaluate(context,error,{type});
      const results=context.evaluation.evalForces(context.currentTask,context.fm.forces);
      const expected=(2+context.evaluation.positionScore(error))/3;
      assert.equal(results[0].found,true);
      close(results[0].posErr,error);
      assert.equal(results[0].posOk,error<=5);
      assert.equal(lines.some(line=>line.text.startsWith('Angrepspunkt')),error>5);
      close(summary.baseScore,expected);
      close(summary.finalScore,expected);
      assert.match(context.feedback.scoreText,
        new RegExp(`^Score: ${expected.toFixed(2).replace('.','\\.')} `));
      if(error>5 && error<=10){
        assert.ok(summary.finalScore<1);
        assert.equal(summary.finalScore.toFixed(2),'1.00');
        assert.equal(context.evaluation.scoreToPoints(summary.finalScore),2);
        assert.match(context.feedback.scoreText,/\(2\.0 poeng\)/);
      }
      if(error===20){
        assert.equal(summary.finalScore.toFixed(2),'0.92');
        assert.equal(context.evaluation.scoreToPoints(summary.finalScore),1.75);
        assert.match(summary.debugOutput,/Pos=0\.77/);
      }
    }
  });
}

test('moving along the allowed segment stays correct, including its endpoints',()=>{
  const context=setup();
  evaluate(context,0,{type:'segment'});
  for(const x of [0,25,100]){
    context.fm.forces=[force([x,0])];
    context.runEvaluation();
    assert.equal(context.lastEvaluation.summary.finalScore,1);
    assert.equal(context.lastEvaluation.lines.some(line=>line.text.startsWith('Angrepspunkt')),false);
  }
  context.fm.forces=[force([106,0])];
  context.runEvaluation();
  assert.ok(context.lastEvaluation.lines.some(line=>line.text.startsWith('Angrepspunkt')));
  close(context.lastEvaluation.summary.finalScore,(2+0.999)/3);
});

test('small position deductions can cross a points threshold with other deductions',()=>{
  const context=setup();
  const angle=0.5+24*(3*(1-0.9401));
  const baseline=evaluate(context,0,{angle}).summary.finalScore;
  const withPositionError=evaluate(context,6,{angle}).summary.finalScore;
  close(baseline,0.9401);
  close(baseline-withPositionError,0.001/3);
  assert.equal(context.evaluation.scoreToPoints(baseline),2);
  assert.equal(context.evaluation.scoreToPoints(withPositionError),1.75);
});

for(const type of ['point','segment']){
  test(`${type} matching prefers the correct anchor for small and full-grid errors`,()=>{
    const context=setup();
    for(const error of [6,10,20]){
      evaluate(context,error,{type});
      const correct=force(type==='segment' ? [50,0] : [0,0]);
      context.fm.forces.push(correct);
      const matches=context.evaluation.matchForcesToExpected(context.currentTask,context.fm.forces);
      assert.equal(matches.G,correct);
      const results=context.evaluation.evalForces(context.currentTask,context.fm.forces);
      assert.equal(results[0].index,1);
      assert.equal(results[0].posOk,true);
    }
  });
}
