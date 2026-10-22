const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'..','web','ui.js'),'utf8');
// Exercise the real nested event wiring without introducing a DOM dependency.
const wiring = source.slice(source.indexOf('  function setupEditorInputs('),
  source.indexOf('  // Task metadata fields'));

function setup(type='ellipse'){
  const target={color:'#222222',lineWidth:2};
  const task={scene:{[type+'s']:[target]}};
  const remaps=[], edits=[];
  const window={currentTask:task,markEdited:(...args)=>edits.push(args),
    updateAppState(){},requestAnimationFrame(){},sceneEditor:{cancel(){}},
    sceneModel:{remapReferences(t,kind,index,action){
      assert.equal(t.scene[kind+'s'][index],target,'remapping runs before deletion');
      remaps.push({kind,index,action});
    }}};
  function input(field,inputType,value){
    const handlers={};
    return {dataset:{field,type,idx:'0'},type:inputType,tagName:'INPUT',value,
      checked:false,addEventListener:(event,fn)=>handlers[event]=fn,
      fire:event=>handlers[event]?.({}),
      setCustomValidity(message){this.validationMessage=message;},reportValidity(){}};
  }
  const start=input('startAngleDeg','number','0'), end=input('endAngleDeg','number','360');
  const enable=input('fillEnabled','checkbox',''), color=input('fill_color','color','#4090ff');
  const style=input('color','color','#ff0000'), width=input('lineWidth','number','3');
  const controls=[start,end,enable,color,style,width];
  const remove=input('','button','');
  remove.dataset={type,idx:'0'};
  const editor={querySelectorAll:selector=>selector==='.scene-editor-input' ? controls : [remove],
    querySelector:()=>color};
  const context={window,updateScenePanel(){}};
  vm.runInNewContext(wiring+';globalThis.wire=setupEditorInputs;',context);
  context.wire(editor,type,0,target);
  return {window,target,task,start,end,enable,color,style,width,remove,remaps,edits};
}

test('real ellipse change handlers preserve zero, validate finite arcs, and never remap',()=>{
  const s=setup();
  s.start.fire('change');
  assert.equal(s.target.startAngleDeg,0);
  s.end.value='60';s.end.fire('change');
  assert.equal(s.target.endAngleDeg,60);
  s.start.value='Infinity';s.start.fire('change');
  assert.equal(s.target.startAngleDeg,0);
  assert.ok(s.start.validationMessage);
  s.style.fire('change');s.width.fire('change');
  assert.equal(s.target.color,'#ff0000');
  assert.equal(s.target.lineWidth,3);
  assert.deepEqual(s.remaps,[]);
});

test('real ellipse and circle fill change handlers enable, recolor, and remove fill',()=>{
  for(const type of ['ellipse','circle']){
    const s=setup(type);
    s.enable.checked=true;s.enable.fire('change');
    assert.equal(s.target.fill_color,'#4090ff');
    assert.equal(s.color.disabled,false);
    s.color.value='#123456';s.color.fire('change');
    assert.equal(s.target.fill_color,'#123456');
    s.enable.checked=false;s.enable.fire('change');
    assert.equal(Object.hasOwn(s.target,'fill_color'),false);
    assert.equal(s.color.disabled,true);
    assert.deepEqual(s.remaps,[]);
  }
});

test('real deletion handlers remap once before removing all supported geometry types',()=>{
  for(const type of ['ellipse','circle','rect','segment','arrow','text']){
    const s=setup(type);
    s.remove.fire('click');
    assert.equal(s.task.scene[type+'s'].length,0);
    assert.deepEqual(s.remaps,[{kind:type,index:0,action:'delete'}]);
  }
});

test('real reorder handlers remap once before swapping and retain selected object',()=>{
  const marker="      btn.addEventListener('click', (e) => {";
  const start=source.indexOf(marker);
  const end=source.indexOf('      });',start);
  const handler=source.slice(start+marker.length,end);
  for(const direction of ['up','down']){
    const index=direction==='up' ? 1 : 0, obj={id:'selected'}, other={id:'other'};
    const array=direction==='up' ? [other,obj] : [obj,other];
    const calls=[];
    const window={currentTask:{scene:{ellipses:array}},sceneEditor:{cancel(){}},
      sceneModel:{remapReferences(task,type,idx,action){
        assert.equal(array[idx],obj);
        calls.push([type,idx,action]);
      }},markEdited(){},updateAppState(){}};
    vm.runInNewContext(`(function(e){${handler}})({stopPropagation(){}})`,
      {window,btn:{dataset:{arrange:direction}},type:'ellipse',index,obj,updateScenePanel(){}});
    assert.equal(array[direction==='up' ? 0 : 1],obj);
    assert.equal(window.selectedSceneElement.obj,obj);
    assert.deepEqual(calls,[['ellipse',index,direction]]);
  }
});
