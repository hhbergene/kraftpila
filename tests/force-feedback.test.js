const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const taskset=JSON.parse(fs.readFileSync(path.join(root,'taskset_Default.json'),'utf8'));

function force(name,vec,anchor=[500,180],extra={}){
  return {name,vec,anchor,arrowBase:anchor,
    arrowTip:anchor.map((value,index)=>value+vec[index]),
    length:Math.hypot(...vec),...extra};
}

function setup(){
  const window={settings:{debug:true},fm:{forces:[]},sceneLookup:{}};
  window.window=window;
  window.showFeedback=()=>{};
  vm.createContext(window);
  for(const file of ['shared.js','force_notation.js','geometry.js','scene_render.js','scene_model.js','evaluate.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),window);
  }
  window.currentTask=structuredClone(taskset.tasks.find(task=>task.id==='task_1791480987568_2u5txto26'));
  window.sceneLookup=window.buildAllScenePoints(window.currentTask);
  window.fm.forces=[force('G',[0,80],[500,240],{moveable:false})];
  return window;
}

function evaluate(window,forces){
  window.fm.forces=[window.fm.forces[0],...forces];
  window.runEvaluation();
  const {summary,lines}=window.lastEvaluation;
  return {summary,lines:lines.filter(line=>line.text!==summary.debugOutput)};
}

function close(actual,expected){
  assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
}

function noCountErrors(lines){
  assert.equal(lines.some(line=>/for mye|Det mangler en kraft|Det mangler \d+ krefter/.test(line.text)),false);
}

test('sole unnamed arrow at the matching threshold receives direction feedback, not conflicting counts',()=>{
  const window=setup();
  const {summary,lines}=evaluate(window,[force('',[-40,-80])]);
  assert.equal(summary.foundCount,1);
  assert.equal(summary.coverage,1);
  assert.equal(summary.extrasCount,0);
  close(summary.baseScore,1/3);
  assert.ok(summary.relationsScore>0);
  close(summary.finalScore,(summary.baseScore+summary.relationsScore)/2);
  assert.ok(lines.some(line=>line.text==='Det mangler navn på en kraft'));
  const direction=lines.find(line=>line.text.startsWith('Juster retningen til den navnløse kraften'));
  assert.deepEqual(Array.from(direction.indices),[1]);
  noCountErrors(lines);
  assert.equal(lines.some(line=>/\bS\b/.test(line.text)),false);
});

for(const name of ['', 'Q', 'S']){
  test(`length errors remain visible with ${name || 'missing'} name without revealing the expected name`,()=>{
    const window=setup();
    const {summary,lines}=evaluate(window,[force(name,[0,-100])]);
    close(summary.baseScore,name==='S'?1:2/3);
    close(summary.relationsScore,7/15);
    close(summary.finalScore,(summary.baseScore+7/15)/2);
    const label=name || 'den navnløse kraften';
    const description=name?'kreftene ':'';
    const relation=lines.find(line=>line.text.startsWith(`Lengdeforholdet mellom ${description}G og ${label} er feil`));
    assert.ok(relation);
    assert.deepEqual(Array.from(relation.indices),[0,1]);
    if(name!=='S'){
      assert.ok(lines.some(line=>line.text===(name?'Feil navn på en kraft':'Det mangler navn på en kraft')));
      assert.equal(lines.some(line=>/\bS\b/.test(line.text)),false);
    }
    noCountErrors(lines);
    assert.equal(lines.some(line=>/Juster retningen|Angrepspunkt/.test(line.text)),false);
  });
}

for(const name of ['', 'Q', 'S']){
  test(`direction and position errors remain visible with ${name || 'missing'} name`,()=>{
    const window=setup();
    const {summary,lines}=evaluate(window,[force(name,[80,0],[900,500])]);
    assert.equal(summary.foundCount,1);
    close(summary.baseScore,name==='S'?1/3:0);
    const label=name || 'den navnløse kraften';
    for(const prefix of [`Juster retningen til ${label}`,`Angrepspunkt til ${label}`]){
      const line=lines.find(line=>line.text.startsWith(prefix));
      assert.ok(line);
      assert.deepEqual(Array.from(line.indices),[1]);
    }
    if(name!=='S') assert.equal(lines.some(line=>/\bS\b/.test(line.text)),false);
    noCountErrors(lines);
  });
}

test('a correct unnamed arrow loses points for its name only and feedback does not invent other errors',()=>{
  const window=setup();
  const {summary,lines}=evaluate(window,[force('',[0,-80])]);
  close(summary.finalScore,5/6);
  assert.deepEqual(Array.from(lines,line=>line.text),['Det mangler navn på en kraft']);
});

test('actual missing and extra forces still receive count feedback',()=>{
  const window=setup();
  let result=evaluate(window,[]);
  assert.equal(result.summary.foundCount,0);
  assert.ok(result.lines.some(line=>line.text==='Det mangler en kraft'));
  result=evaluate(window,[force('S',[0,-80]),force('Q',[80,0])]);
  assert.equal(result.summary.foundCount,1);
  assert.equal(result.summary.extrasCount,1);
  assert.ok(result.lines.some(line=>line.text==='Det er tegnet 1 kraft for mye'));
});

test('multiple unmatched arrows are not assigned arbitrarily and get uncertainty feedback',()=>{
  const window=setup();
  const {summary,lines}=evaluate(window,[force('',[80,0]),force('',[-80,0])]);
  assert.equal(summary.foundCount,0);
  assert.equal(summary.extrasCount,2);
  assert.equal(summary.finalScore,0);
  assert.match(summary.debugOutput,/Usikker kobling: 2 ukoblede elevkrefter/);
  noCountErrors(lines);
  assert.equal(lines.length,1);
  assert.match(lines[0].text,/kan ikke kobles sikkert/);
  assert.deepEqual(Array.from(lines[0].indices),[1,2]);
});

test('one arrow and multiple unmatched expectations are ambiguous',()=>{
  const window=setup();
  window.currentTask.expectedForces.push({...structuredClone(window.currentTask.expectedForces[0]),name:'N'});
  const {summary,lines}=evaluate(window,[force('',[80,0])]);
  assert.equal(summary.foundCount,0);
  noCountErrors(lines);
  assert.match(lines[0].text,/kan ikke kobles sikkert/);
});

test('existing strong matches are preserved before matching a sole remaining pair',()=>{
  const window=setup();
  window.currentTask.expectedForces.push({
    name:'N',dir:[1,0],anchor:{type:'custom',pos:[100,100]}
  });
  const {summary,lines}=evaluate(window,[force('N',[80,0],[100,100]),force('',[80,0])]);
  assert.equal(summary.foundCount,2);
  assert.equal(summary.extrasCount,0);
  const direction=lines.find(line=>line.text.startsWith('Juster retningen'));
  assert.deepEqual(Array.from(direction.indices),[2]);
  noCountErrors(lines);
});

test('locked, incomplete, excluded and helper arrows are not fallback candidates or extras',()=>{
  const window=setup();
  const excluded=[
    force('locked',[80,0],[500,180],{moveable:false}),
    force('excluded',[80,0],[500,180],{isExpected:false}),
    force('incomplete',[80,0],[500,180],{isCompleted:()=>false}),
    force('S_x',[80,0],[500,180],{role:'component',parentName:'S'}),
    {name:'unfinished',anchor:[500,180]}
  ];
  let result=evaluate(window,excluded);
  assert.equal(result.summary.foundCount,0);
  assert.equal(result.summary.extrasCount,0);
  assert.ok(result.lines.some(line=>line.text==='Det mangler en kraft'));
  result=evaluate(window,[...excluded,force('',[80,0])]);
  assert.equal(result.summary.foundCount,1);
  assert.equal(result.summary.extrasCount,0);
  noCountErrors(result.lines);
});

test('normal feedback is also complete without debug mode',()=>{
  const window=setup();
  window.settings.debug=false;
  const {summary,lines}=evaluate(window,[force('',[0,-100])]);
  assert.equal(summary.debugOutput,'');
  assert.equal(lines.length,2);
  assert.ok(lines.some(line=>line.text==='Lengdeforholdet mellom G og den navnløse kraften er feil'));
  assert.equal(lines.some(line=>/\bS\b/.test(line.text)),false);
});

test('multiple unnamed forces in a relation remain anonymous and highlight all involved arrows',()=>{
  const window=setup();
  window.currentTask.expectedForces.push({
    name:'N',dir:[1,0],anchor:{type:'custom',pos:[100,100]}
  });
  window.currentTask.relations=[{lhs:[{name:'G'}],rhs:[{name:'S'},{name:'N'}],ratio:1}];
  const {summary,lines}=evaluate(window,[force('',[0,-100]),force('',[80,0],[100,100])]);
  assert.equal(summary.foundCount,2);
  const relation=lines.find(line=>line.text.startsWith('Lengdeforholdet'));
  assert.match(relation.text,/G, den navnløse kraften og den navnløse kraften/);
  assert.deepEqual(Array.from(relation.indices),[0,1,2]);
  assert.equal(lines.some(line=>/\b(S|N)\b/.test(line.text)),false);
});

test('correct named answers and visible aliases retain full credit',()=>{
  const window=setup();
  let result=evaluate(window,[force('S',[0,-80])]);
  assert.equal(result.summary.finalScore,1);
  assert.equal(result.lines.length,0);
  window.currentTask.expectedForces[0].aliases=['Drag'];
  result=evaluate(window,[force('Drag',[0,-100])]);
  close(result.summary.baseScore,1);
  assert.ok(result.lines.some(line=>line.text.startsWith('Lengdeforholdet mellom kreftene G og Drag er feil')));
  assert.equal(result.lines.some(line=>/\bS\b/.test(line.text)),false);
});
