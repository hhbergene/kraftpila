const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'..','web','editor.js'),'utf8');

test('renaming an editor force preserves its spec and updates both sides of saved relations',()=>{
  const start=source.indexOf('  window.renameEditorForce =');
  const end=source.indexOf('  // Create/update the task spec',start);
  const spec={name:'N',anchor:{type:'custom',pos:[0,0]},aliases:['normal']};
  const relation={lhs:[{name:'N',component:'horizontal'}],rhs:[{name:'n',component:'vertical'},{name:'G'}]};
  const force={name:'N'};
  const writes=new Map();
  const window={currentTask:{id:'task-a',relations:[relation]},
    getForceSpec:()=>({spec,prop:'anchor'})};
  vm.runInNewContext(source.slice(start,end),{window,queueStorage:(key,value)=>writes.set(key,value),markEdited(){}});
  window.renameEditorForce(force,'Normal');
  assert.equal(force.name,'Normal');
  assert.equal(spec.name,'Normal');
  assert.equal(spec.aliases[0],'normal');
  assert.equal(relation.lhs[0].name,'Normal');
  assert.equal(relation.rhs[0].name,'Normal');
  assert.equal(relation.rhs[1].name,'G');
  assert.equal(writes.get('editor_relations_task-a')[0].lhs[0].name,'Normal');
  window.renameEditorForce(force,'Normal2');
  assert.equal(relation.lhs[0].name,'Normal2');
});

test('each editor check synchronizes current forces and saves before full evaluation',()=>{
  const start=source.indexOf("      if(action === 'check'){");
  const end=source.indexOf('      // Clear feedback for any other toolbar action',start);
  const calls=[];
  const force={arrowBase:[0,0],arrowTip:[0,10],updateDirectionAndLength:()=>calls.push('geometry')};
  const window={currentTask:{id:'task-a'},fm:{forces:[force]},sceneModel:{update:()=>calls.push('scene')},
    syncSceneForceAnchors:()=>calls.push('anchors'),
    syncForceSpec:(f,options)=>{assert.equal(options.redir,true);calls.push('spec');},
    runEvaluation:()=>calls.push('evaluate')};
  const context={window,action:'check',markEdited:()=>calls.push('edited'),
    autoSave:()=>calls.push('save'),console};
  const check=vm.runInNewContext(`(function(){${source.slice(start,end)}})`,context);
  check();
  check();
  assert.deepEqual(calls,['scene','anchors','geometry','spec','edited','save','evaluate',
    'scene','anchors','geometry','spec','edited','save','evaluate']);
});
