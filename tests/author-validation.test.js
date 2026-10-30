const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','web','author_validation.js'),'utf8');

function setup(){
  const confirmations=[];
  const alerts=[];
  const window={
    buildAllScenePoints:()=>({ellipse0:{points:{center:[0,0]},segments:{edge:[[0,0],[10,0]]}}}),
    sceneModel:{resolveAnchor(task,anchor){
      const wagon=task.scene?.wagons?.find(item=>item.id===anchor.ref);
      return wagon?.valid===false ? {valid:false} : wagon
        ? {valid:true,pos:[0,0],segment:{a:[-10,0],b:[10,0]}}
        : {valid:false};
    }}
  };
  const context=vm.createContext({window,alert:message=>alerts.push(message),
    confirm:message=>{confirmations.push(message);return false;}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','shared.js'),'utf8'),context);
  vm.runInContext(source,context);
  const force=name=>({name,anchor:{type:'point',ref:'ellipse0',point:'center'}});
  const task={id:'one',title:'Test',help_lines:['Beskrivelse'],expectedForces:[force('N'),force('G')],
    relations:[{lhs:[{name:'N'}],rhs:[{name:'G',component:'vertical'}],ratio:1,tol_rel:0.15}]};
  return {window,task,confirmations,alerts};
}

test('unavailable automatic ratios block single-task and task-set export without an override confirmation',()=>{
  const {window,task,confirmations,alerts}=setup();
  delete task.relations[0].ratio;
  assert.equal(window.confirmAuthorExport([task]),false);
  assert.match(alerts[0],/Eksport stoppet.*Oppgi/s);
  assert.equal(confirmations.length,0);
  task.expectedForces[0].drawn={arrowBase:[0,0],arrowTip:[0,20]};
  task.expectedForces[1].drawn={arrowBase:[0,0],arrowTip:[0,10]};
  assert.equal(window.collectRelationRatioErrors(task).length,0);
  assert.equal(window.confirmAuthorExport([task]),false,'incomplete anchors remain ordinary author warnings');
  task.relations[0].ratio=2;
  assert.equal(window.collectRelationRatioErrors(task).length,0);
  assert.equal(window.confirmAuthorExport([task,{...task,id:'broken',
    relations:[{lhs:[],rhs:[]}]}]),false);
  assert.equal(alerts.length,2);
});

test('valid task passes author checks and export without confirmation',()=>{
  const {window,task,confirmations}=setup();
  assert.equal(window.collectAuthorWarnings(task).length,0);
  assert.equal(window.confirmAuthorExport([task]),true);
  assert.equal(confirmations.length,0);
});

test('custom and broken scene anchors warn, even when custom coordinates are valid',()=>{
  const {window,task}=setup();
  task.expectedForces[0].anchor={type:'custom',pos:[1,2]};
  task.expectedForces[1].anchor={type:'point',ref:'deleted',point:'center'};
  const warnings=window.collectAuthorWarnings(task);
  assert.ok(warnings.includes('Advarsel: Kraft N mangler anchor (type custom).'));
  assert.ok(warnings.some(text=>text.includes('G har anchor') && text.includes('manglende')));
  task.expectedForces[0].anchor={type:'segment',ref:'ellipse0',segment:'edge'};
  assert.ok(!window.collectAuthorWarnings(task).some(text=>text.includes('Kraft N')));
});

test('valid wagon-bottom virtual segment passes author checks but missing or invalid wagons warn',()=>{
  const {window,task}=setup();
  task.expectedForces[0].anchor={type:'segment',ref:'wagon-1',segment:'bottom'};
  task.scene={wagons:[{id:'wagon-1',valid:true}]};
  assert.ok(!window.collectAuthorWarnings(task).some(text=>text.includes('Kraft N')&&text.includes('segment')));

  task.scene.wagons=[];
  assert.ok(window.collectAuthorWarnings(task).some(text=>
    text.includes('Kraft N')&&text.includes('manglende eller ugyldig segment')));

  task.scene.wagons=[{id:'wagon-1',valid:false}];
  assert.ok(window.collectAuthorWarnings(task).some(text=>
    text.includes('Kraft N')&&text.includes('manglende eller ugyldig segment')));
});

test('author validation resolves a real wagon-bottom anchor against wagon geometry',()=>{
  const window={WIDTH:1000,HEIGHT:640};
  window.window=window;
  const context=vm.createContext({window,console,Math,Date,Number,Array,JSON,Set,Map,WeakMap,RegExp});
  for(const file of ['shared.js','geometry.js','scene_render.js','scene_model.js','author_validation.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web',file),'utf8'),context);
  }
  const task={id:'wagon-anchor',title:'Vogn',help_lines:['Beskrivelse'],
    scene:{ellipses:[{center:[0,0],width:100,height:100,t_vec:[1,0]}],points:[],wagons:[],planes:[]},
    expectedForces:[{name:'M'}],initialForces:[],relations:[]};
  const source=window.sceneModel.geometries(task).find(item=>item.ref==='Ellipse-1');
  const point=window.sceneModel.createAttachedPoint(task,source,[50,0]);
  const wagon=window.sceneModel.createWagon(task,point,{halfWidth:20,height:10});
  task.expectedForces[0].anchor={type:'segment',ref:wagon.id,segment:'bottom'};
  window.sceneModel.update(task);
  assert.equal(wagon.valid,true);
  assert.ok(!window.collectAuthorWarnings(task).some(text=>text.includes('manglende eller ugyldig segment')));
  wagon.halfWidth=1000;
  window.sceneModel.update(task);
  assert.equal(wagon.valid,false);
  assert.ok(window.collectAuthorWarnings(task).some(text=>text.includes('manglende eller ugyldig segment')));
});

test('relations report missing forces, sides, components, ratio and tolerance',()=>{
  const {window,task}=setup();
  task.relations=[{lhs:[],rhs:[{name:'Old',component:'unknown'}],ratio:0,tol_rel:2}];
  const warnings=window.collectAuthorWarnings(task);
  for(const fragment of ['venstre side','manglende kraft: Old','ugyldig komponent','ugyldig forholdstall','ugyldig toleranse']){
    assert.ok(warnings.some(text=>text.includes(fragment)),fragment);
  }
});

test('absent relations are a reminder only for multiple forces without resultant requirements',()=>{
  const {window,task}=setup();
  task.relations=[];
  assert.ok(window.collectAuthorWarnings(task).some(text=>text.includes('Ingen relasjoner')));
  task.sumF={x:0,y:0};
  assert.equal(window.collectAuthorWarnings(task).length,0);
  delete task.sumF;
  task.expectedForces.pop();
  assert.equal(window.collectAuthorWarnings(task).length,0);
});

test('absolute relation tolerance is optional, accepts zero and rejects invalid values',()=>{
  const {window,task}=setup();
  delete task.relations[0].tol_rel;
  assert.equal(window.collectAuthorWarnings(task).length,0);
  for(const value of [0,2,100]){
    task.relations[0].tol_abs=value;
    assert.equal(window.collectAuthorWarnings(task).length,0);
  }
  for(const value of [-1,Infinity,NaN,'2']){
    task.relations[0].tol_abs=value;
    assert.ok(window.collectAuthorWarnings(task).some(text=>text.includes('ugyldig absolutt toleranse')));
  }
});

test('metadata, duplicate names and drawn force geometry produce actionable warnings',()=>{
  const {window,task,confirmations}=setup();
  task.title='';
  task.help_lines=[];
  task.expectedForces[1].name='n';
  const drawn=[{name:'',anchor:[0,0]}, {name:'N',anchor:[0,0],arrowBase:[0,0],arrowTip:[0,0]},{}];
  const warnings=window.collectAuthorWarnings(task,drawn);
  for(const fragment of ['mangler tittel','mangler oppgavebeskrivelse','samme navn','mangler navn','ufullstendig','null lengde']){
    assert.ok(warnings.some(text=>text.includes(fragment)),fragment);
  }
  window.currentTask=task;
  window.fm={forces:drawn};
  assert.equal(window.confirmAuthorExport([task]),false);
  assert.equal(confirmations.length,1);
  assert.match(confirmations[0],/Eksporter likevel/);
  task.expectedForces=[];
  assert.ok(window.collectAuthorWarnings(task).some(text=>text.includes('ingen forventede')));
});

test('author warnings appear only in editor feedback and do not alter evaluation scores',()=>{
  const window={};
  window.window=window;
  window.console=console;
  vm.createContext(window);
  for(const file of ['shared.js','geometry.js','scene_render.js','scene_model.js','author_validation.js','evaluate.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web',file),'utf8'),window);
  }
  window.currentTask={id:'empty',title:'',help_lines:[],scene:{},expectedForces:[],initialForces:[],relations:[]};
  window.fm={forces:[]};
  window.settings={debug:false};
  window.sceneLookup={};
  window.showFeedback=()=>{};
  window.editorMode=false;
  window.runEvaluation();
  const playerScore=window.lastEvaluation.summary.finalScore;
  assert.ok(!window.lastEvaluation.lines.some(line=>line.text.startsWith('Advarsel:')));
  window.editorMode=true;
  window.runEvaluation();
  assert.equal(window.lastEvaluation.summary.finalScore,playerScore);
  assert.ok(window.lastEvaluation.lines.some(line=>line.text==='Advarsel: Oppgaven mangler tittel.'));
});
