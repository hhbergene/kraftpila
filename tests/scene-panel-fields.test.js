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

test('scene coordinate fields edit geometry and preserve plane direction when moving its through point',()=>{
  const cases=[
    {type:'rect',target:{bottomCenter:[10,20]},vector:'bottomCenter',axis:0,expected:[42.5,20]},
    {type:'ellipse',target:{center:[10,20]},vector:'center',axis:1,expected:[10,42.5]},
    {type:'segment',target:{a:[10,20],b:[30,40]},vector:'b',axis:1,expected:[30,42.5]},
    {type:'arrow',target:{a:[10,20],b:[30,40]},vector:'a',axis:0,expected:[42.5,20]},
    {type:'text',target:{pos:[10,20]},vector:'pos',axis:0,expected:[42.5,20]}
  ];
  for(const entry of cases){
    const edits=[], updates=[];
    const input={dataset:{field:'coordinates',type:entry.type,idx:'0',vector:entry.vector,
      axis:String(entry.axis)},type:'number',tagName:'INPUT',value:'42.5',
      addEventListener(event,fn){this[event]=fn;},
      setCustomValidity(message){this.validationMessage=message;},reportValidity(){}};
    const window={currentTask:{scene:{[entry.type+'s']:[entry.target]}},
      markEdited:(...args)=>edits.push(args),updateAppState:()=>updates.push(true)};
    const editor={querySelectorAll:selector=>selector==='.scene-editor-input' ? [input] : []};
    const context={window,updateScenePanel(){}};
    vm.runInNewContext(wiring+';globalThis.wire=setupEditorInputs;',context);
    context.wire(editor,entry.type,0,entry.target);
    input.change({});
    assert.deepEqual(Array.from(entry.target[entry.vector]),entry.expected);
    assert.deepEqual(edits,[['task']]);
    assert.equal(updates.length,1);
  }

  const ellipse={center:[100,100],width:80,height:40,t_vec:[1,0],n_vec:[0,-1]};
  const axisInput={dataset:{field:'coordinates',type:'ellipse',idx:'0',vector:'axisA',axis:'0'},
    type:'number',tagName:'INPUT',value:'150',addEventListener(event,fn){this[event]=fn;},
    setCustomValidity(message){this.validationMessage=message;},reportValidity(){}};
  const ellipseWindow={currentTask:{scene:{ellipses:[ellipse]}},markEdited(){},updateAppState(){},
    geometry:{length:vector=>Math.hypot(...vector),normalFromTangent:t=>[-t[1],t[0]],
      tangentFromNormal:n=>[-n[1],n[0]]}};
  const ellipseEditor={querySelectorAll:selector=>selector==='.scene-editor-input' ? [axisInput] : []};
  const ellipseContext={window:ellipseWindow,updateScenePanel(){}};
  vm.runInNewContext(wiring+';globalThis.wire=setupEditorInputs;',ellipseContext);
  ellipseContext.wire(ellipseEditor,'ellipse',0,ellipse);
  axisInput.change({});
  assert.equal(ellipse.width,100);
  assert.deepEqual(Array.from(ellipse.t_vec),[1,0]);
  assert.ok(Math.abs(ellipse.n_vec[0])<1e-10 && Math.abs(ellipse.n_vec[1]-1)<1e-10);
  const axisBInput={dataset:{field:'coordinates',type:'ellipse',idx:'0',vector:'axisB',axis:'1'},
    type:'number',tagName:'INPUT',value:'150',addEventListener(event,fn){this[event]=fn;},
    setCustomValidity(message){this.validationMessage=message;},reportValidity(){}};
  const axisBEditor={querySelectorAll:selector=>selector==='.scene-editor-input' ? [axisBInput] : []};
  ellipseContext.wire(axisBEditor,'ellipse',0,ellipse);
  axisBInput.change({});
  assert.equal(ellipse.height,100);
  assert.ok(Math.abs(ellipse.n_vec[0])<1e-10 && Math.abs(ellipse.n_vec[1]-1)<1e-10);
  assert.ok(Math.abs(ellipse.t_vec[0]+1)<1e-10 && Math.abs(ellipse.t_vec[1])<1e-10);

  const plane={through:[10,20],dirPoint:[10,-40],n_vec:[0,-1],t_vec:[1,0]};
  const directionInput={dataset:{field:'coordinates',type:'plane',idx:'',vector:'through',axis:'0'},
    type:'number',tagName:'INPUT',value:'42.5',addEventListener(event,fn){this[event]=fn;},
    setCustomValidity(message){this.validationMessage=message;},reportValidity(){}};
  const planeWindow={currentTask:{scene:{plane}},markEdited(){},updateAppState(){},
    geometry:{length:vector=>Math.hypot(...vector),tangentFromNormal:normal=>[-normal[1],normal[0]]}};
  const planeEditor={querySelectorAll:selector=>selector==='.scene-editor-input' ? [directionInput] : []};
  const planeContext={window:planeWindow,updateScenePanel(){}};
  vm.runInNewContext(wiring+';globalThis.wire=setupEditorInputs;',planeContext);
  planeContext.wire(planeEditor,'plane',undefined,plane);
  directionInput.change({});
  assert.deepEqual(Array.from(plane.through),[42.5,20]);
  assert.deepEqual(Array.from(plane.dirPoint),[42.5,-40]);

  const planeDirectionInput={dataset:{field:'coordinates',type:'plane',idx:'',vector:'dirPoint',axis:'1'},
    type:'number',tagName:'INPUT',value:'50',addEventListener(event,fn){this[event]=fn;},
    setCustomValidity(message){this.validationMessage=message;},reportValidity(){}};
  const planeDirectionEditor={querySelectorAll:selector=>selector==='.scene-editor-input' ? [planeDirectionInput] : []};
  planeContext.wire(planeDirectionEditor,'plane',undefined,plane);
  planeDirectionInput.change({});
  assert.deepEqual(Array.from(plane.dirPoint),[42.5,50]);
  assert.ok(Math.abs(plane.n_vec[0])<1e-10 && Math.abs(plane.n_vec[1]-1)<1e-10);
  assert.ok(Math.abs(plane.t_vec[0]+1)<1e-10 && Math.abs(plane.t_vec[1])<1e-10);
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
