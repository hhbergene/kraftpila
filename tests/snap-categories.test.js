const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');

function runtime(){
  const window={console,enableSnap:true};
  window.window=window;
  vm.createContext(window);
  for(const file of ['shared.js','geometry.js','forces.js','scene_render.js','scene_model.js','snapping.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),window);
  }
  return window;
}

const tangent=[0.8,-0.6],normal=[0.6,0.8],size=73.7;
function ownVector(type,local){
  if(type==='x') return [size,40];
  if(type==='y') return [40,size];
  if(type==='n') return [60,(size-36)/0.8];
  if(type==='t') return [(size-12)/0.8,-20];
  return local ? tangent.map(v=>v*size) : [Math.sqrt(size*size-1600),40];
}
function referenceVector(type){
  if(type==='x') return [size,127.1];
  if(type==='y') return [127.1,size];
  if(type==='n') return normal.map((v,i)=>v*size+tangent[i]*113.3);
  if(type==='t') return tangent.map((v,i)=>v*size+normal[i]*113.3);
  return [size*0.3,size*Math.sqrt(0.91)];
}
function measure(type,vector){
  if(type==='length') return Math.hypot(...vector);
  if(type==='x') return Math.abs(vector[0]);
  if(type==='y') return Math.abs(vector[1]);
  return Math.abs(vector.reduce((sum,v,i)=>sum+v*(type==='n'?normal:tangent)[i],0));
}

for(const id of ['LL','LX','LY','LN','LT','XX','YY','XY','NN','TT','NT','XN','XT','YN','YT']){
  test(`${id}: independent, symmetric snapping and markers in editor and player`,()=>{
    const window=runtime();
    const category=window.snapMatchCategories.find(c=>c.key===`snapMatch${id}`);
    const allOff=Object.fromEntries(window.snapMatchCategories.map(({key})=>[key,false]));
    for(const editorMode of [false,true]){
      window.editorMode=editorMode;
      for(const [own,reference] of [[category.a,category.b],[category.b,category.a]]){
        const local=[own,reference].some(type=>type==='n'||type==='t');
        for(const sign of [-1,1]){
          const origin=[400.25,300.5];
          const vector=ownVector(own,local).map(v=>v*sign);
          const force={anchor:[123,456],arrowBase:origin,arrowTip:origin.map((v,i)=>v+vector[i])};
          const other={anchor:[321,654],arrowBase:[2000,2000],
            arrowTip:referenceVector(reference).map(v=>v+2000)};
          const task={scene:{plane:{draw:false,snapping:false,t_vec:tangent,n_vec:normal}},
            snapChecklist:{...allOff,[category.key]:true,snapForceEndpoints:false}};
          const options={task,force,origin,forces:[force,other],tip:true};
          const pos=force.arrowTip.map(v=>v+0.15);
          const enabled=window.snapping.snapForce(pos,options);
          assert.equal(enabled.source,own==='length'?'force-length':'force-component');
          assert.ok(Math.abs(measure(own,enabled.pos.map((v,i)=>v-origin[i]))-size)<1e-8);
          const markers=window.snapping.buildMatchedComponentGuidelines(force,options.forces,20,task);
          assert.ok(markers.some(line=>line.lineWidth===2),'enabled pair has visible matches');
          task.snapChecklist[category.key]=false;
          const disabled=window.snapping.snapForce(pos,options);
          assert.ok(!['force-length','force-component'].includes(disabled.source));
          assert.equal(window.snapping.buildMatchedComponentGuidelines(force,options.forces,20,task).length,0);
        }
      }
    }
  });
}

test('legacy flags expand without mutating tasks, and fine-grained fields win',()=>{
  const window=runtime();
  const task={scene:{plane:{angleDeg:30}},snapChecklist:{
    snapSameAxisComponents:false,snapCrossAxisComponents:true,snapLocalComponents:true,
    snapForceLengths:false,snapComponentToLength:true,snapMatchLN:false,
    guidelinesEnabled:false
  }};
  const before=JSON.stringify(task);
  const result=window.getTaskSnapChecklist(task);
  assert.equal(JSON.stringify(task),before);
  assert.equal(result.snapMatchXX,false);
  assert.equal(result.snapMatchYY,false);
  assert.equal(result.snapMatchXY,true);
  assert.equal(result.snapMatchNN,true);
  assert.equal(result.snapMatchXN,true);
  assert.equal(result.snapMatchLL,false);
  assert.equal(result.snapMatchLX,true);
  assert.equal(result.snapMatchLN,false);
  assert.equal(result.snapMatchLT,true);
  assert.equal(result.guidelinesEnabled,false);
  assert.equal(Object.hasOwn(result,'snapLocalComponents'),false);
  const partial=window.getTaskSnapChecklist({snapChecklist:{snapForceLengths:true}});
  assert.equal(partial.snapMatchLL,true);
  assert.equal(partial.snapMatchLX,false,'legacy partial task keeps its original defaults');
  const override=window.normalizeSnapChecklist(task,{snapSameAxisComponents:true},result);
  assert.equal(override.snapMatchXX,true);
  assert.equal(override.snapMatchNN,true);
  assert.equal(override.snapMatchLN,false);
});

test('relevance uses only single-term equalities, with missing components meaning length',()=>{
  const window=runtime();
  const term=component=>({name:'A',...(component?{component}:{})});
  const pairs=[['magnitude','normal','snapMatchLN'],['magnitude','tangent','snapMatchLT'],
    ['normal','normal','snapMatchNN'],['normal','vertical','snapMatchYN']];
  for(const [a,b,key] of pairs){
    const relations=[{lhs:[term(a)],rhs:[term(b)],ratio:1}];
    assert.equal(window.getRelationSnapMatches(relations)[key],true);
    relations[0].ratio=2;
    assert.equal(window.getRelationSnapMatches(relations)[key],false);
    relations[0].ratio=1;
    relations[0].lhs.push(term());
    assert.equal(window.getRelationSnapMatches(relations)[key],false);
  }
  assert.equal(window.getRelationSnapMatches([{lhs:[term()],rhs:[term('normal')],ratio:1}]).snapMatchLN,true);
  const defaults=window.getSnapChecklistDefaults();
  assert.deepEqual(window.getRelationSnapMatches([{lhs:[],rhs:[],ratio:1}]),defaults);
});

test('both checklists render all categories from the same register',()=>{
  const window=runtime();
  for(const file of ['editor.html','index.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(html,/data-snap-match-options/);
    assert.doesNotMatch(html,/data-snap-checklist="snapLocalComponents"/);
  }
  const container={};
  window.populateSnapMatchOptions({querySelector:()=>container});
  for(const {key,label} of window.snapMatchCategories){
    assert.equal(container.innerHTML.split(`data-snap-checklist="${key}"`).length,2);
    assert.ok(container.innerHTML.includes(label));
  }
  assert.equal(window.snapMatchCategories.length,15);
});

test('automatic relation snap categories use the effective answer ratio rather than defaulting to one',()=>{
  const window=runtime();
  const relation={lhs:[{name:'A',component:'normal'}],rhs:[{name:'B',component:'tangent'}]};
  const task={scene:{plane:{n_vec:[0,1],t_vec:[1,0]}},
    expectedForces:[{name:'A',drawn:{arrowBase:[0,0],arrowTip:[0,10]}}],
    initialForces:[{name:'B',arrowBase:[0,0],arrowTip:[20,0]}]};
  assert.equal(window.getRelationSnapMatches([relation],task).snapMatchNT,false);
  task.initialForces[0].arrowTip=[10,0];
  assert.equal(window.getRelationSnapMatches([relation],task).snapMatchNT,true);
  delete task.expectedForces[0].drawn;
  assert.equal(window.getRelationSnapMatches([relation],task).snapMatchNT,false);
  relation.ratio=1;
  assert.equal(window.getRelationSnapMatches([relation],task).snapMatchNT,true);
});
