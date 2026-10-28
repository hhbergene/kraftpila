const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'..','web','ui.js'),'utf8');
// Exercise the real nested event wiring without introducing a DOM dependency.
const wiring = source.slice(source.indexOf('  function setupEditorInputs('),
  source.indexOf('  // Task metadata fields'));
const editorHTMLSource=source.slice(source.indexOf('  function sceneElementNormal('),
  source.indexOf('  // Helper to wire up editor inputs'));

function editorHTML(type,obj,scene={}){
  const context=vm.createContext({window:{GRID_STEP:20,currentTask:{scene}},
    expandHexColor:color=>color || '#222222'});
  vm.runInContext(`${editorHTMLSource};globalThis.buildEditorHTML=getEditorHTML;`,context);
  return context.buildEditorHTML(type,obj,0);
}

function setup(type='ellipse',target={color:'#222222',lineWidth:2},coordinateSpecs=[]){
  const scene={rects:[],ellipses:[],segments:[],arrows:[],texts:[]};
  scene[type+'s']=[target];
  const task={scene};
  const remaps=[], edits=[];
  const window={currentTask:task,markEdited:(...args)=>edits.push(args),
    updateAppState(){},requestAnimationFrame(){},sceneEditor:{cancel(){}},
    geometry:{length:vector=>Math.hypot(...vector),
      finitePoint:p=>Array.isArray(p) && p.length===2 && p.every(Number.isFinite),
      normalFromTangent:t=>[-t[1],t[0]],tangentFromNormal:n=>[-n[1],n[0]]},
    sceneModel:{
      remapReferences(t,kind,index,action){
        assert.equal(t.scene[kind+'s'][index],target,'remapping runs before deletion');
        remaps.push({kind,index,action});
      },
      setEllipseAxisLength(ellipse,axis,length){
        ellipse[axis]=length;
        if(ellipse.lockAxes) ellipse[axis==='width'?'height':'width']=length;
      }
    }};
  function input(field,inputType,value){
    const handlers={};
    return {dataset:{field,type,idx:'0'},type:inputType,tagName:'INPUT',value,
      checked:false,addEventListener:(event,fn)=>handlers[event]=fn,
      fire(event){
        if(this.dataset.field==='coordinates') this.value=String(this.value);
        handlers[event]?.({target:this});
      },
      setCustomValidity(message){this.validationMessage=message;},reportValidity(){}};
  }
  const start=input('startAngleDeg','number','0'), end=input('endAngleDeg','number','360');
  const enable=input('fillEnabled','checkbox',''), color=input('fill_color','color','#4090ff');
  const style=input('color','color','#ff0000'), width=input('lineWidth','number','3');
  const lock=input('lockAxes','checkbox','');
  const linked=input('linked','checkbox',''), size=input('size','number','20');
  const angle=input('rotationAngle','number','0'), normalX=input('rotationNormal','number','0');
  const normalY=input('rotationNormal','number','-1'), normalSource=input('copyNormal','select','');
  angle.classList={toggle(){}};
  normalX.classList=normalY.classList={toggle(){}};
  normalX.dataset.axis='0';normalY.dataset.axis='1';
  normalSource.tagName='SELECT';
  const coordinateInputs=coordinateSpecs.map(({vector,axis,value})=>{
    const control=input('coordinates','number',String(value));
    control.dataset.vector=vector;
    control.dataset.axis=String(axis);
    return control;
  });
  const controls=[start,end,enable,color,style,width,lock,linked,size,angle,normalX,normalY,
    normalSource,...coordinateInputs];
  const remove=input('','button','');
  remove.dataset={type,idx:'0'};
  const editor={querySelectorAll:selector=>selector==='.scene-editor-input' ? [...controls,...coordinateInputs] :
      selector==='.scene-text-normal' ? [normalX,normalY] :
      selector==='.scene-coordinate-input' ? coordinateInputs :
        selector==='.scene-delete-element-btn' ? [remove] : [],
    querySelector:selector=>selector==='.scene-text-angle' ? angle : color,closest:()=>null};
  const context={window,updateScenePanel(){}};
  const runtime=vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','scene_render.js'),'utf8'),runtime);
  context.document={querySelectorAll:()=>coordinateInputs};
  vm.runInContext(source.slice(source.indexOf('window.refreshSceneTextCoordinates ='),
    source.indexOf('function updateScenePanel(){')),runtime);
  vm.runInNewContext(editorHTMLSource,context);
  vm.runInNewContext(wiring+';globalThis.wire=setupEditorInputs;',context);
  context.wire(editor,type,0,target);
  return {window,target,task,start,end,enable,color,style,width,lock,remove,
    coordinateInputs,linked,size,angle,normalX,normalY,normalSource,remaps,edits};
}

test('text rotation controls switch source, derive the other field and clear rotation',()=>{
  const s=setup('text',{txt:'A',pos:[10,20]});
  s.normalX.value='0.6';
  s.normalY.value='-0.8';
  s.normalX.fire('input');
  assert.deepEqual(Array.from(s.target.n_vec),[0.6,-0.8]);
  assert.equal(s.target.angle_deg,undefined);
  assert.ok(Math.abs(Number(s.angle.value)-36.86989764584402)<1e-8);
  s.angle.value='90';
  s.angle.fire('input');
  assert.equal(s.target.angle_deg,90);
  assert.equal(s.target.n_vec,undefined);
  assert.ok(Math.abs(Number(s.normalX.value)-1)<1e-8);
  s.angle.value='';
  s.angle.fire('change');
  assert.equal(s.target.angle_deg,undefined);
  assert.equal(s.target.n_vec,undefined);
  assert.equal(s.angle.value,'0');
  assert.equal(s.normalX.value,'0');
  assert.equal(s.normalY.value,'-1');
});

test('normal selector copies normalized plan, rectangle and ellipse normals once',()=>{
  for(const [value,vector] of [['plane',[0,-1]],['rect:0',[1,0]],['ellipse:0',[0,1]]]){
    const s=setup('text',{txt:'A',pos:[10,20]});
    s.task.scene.plane={through:[0,0],n_vec:[0,-4]};
    s.task.scene.rects=[{bottomCenter:[0,0],n_vec:[5,0]}];
    s.task.scene.ellipses=[{center:[0,0],n_vec:[0,7]}];
    s.normalSource.value=value;
    s.normalSource.fire('change');
    assert.deepEqual(Array.from(s.target.n_vec),vector);
    assert.equal(s.target.angle_deg,undefined);
    assert.equal(s.normalSource.value,'');
  }
});

test('rotation controls and normal list are present with clear copy semantics',()=>{
  const html=editorHTML('text',{txt:'A',pos:[10,20],angle_deg:30},{
    plane:{through:[0,0],n_vec:[0,-1]},
    rects:[{bottomCenter:[0,0]}],ellipses:[{center:[0,0]}]
  });
  assert.match(html,/data-field="rotationAngle"/);
  assert.match(html,/data-field="rotationNormal"/);
  assert.match(html,/scene-rotation-derived/);
  assert.match(html,/<option value="plane">Plan<\/option>/);
  assert.match(html,/<option value="rect:0">Rektangel 1<\/option>/);
  assert.match(html,/<option value="ellipse:0">Ellipse 1<\/option>/);
  assert.match(html,/Kopierer normalen én gang/);
});

test('linked coordinates are read-only and refresh through linking, size changes and unlinking',()=>{
  const s=setup('text',{txt:'root',pos:[100,100],size:20},[
    {vector:'pos',axis:0,value:900},{vector:'pos',axis:1,value:900}
  ]);
  const child={txt:'child',pos:[900,900]};
  s.task.scene.texts.push(child);
  s.linked.dataset.idx='1';
  s.coordinateInputs.forEach(input=>input.dataset.idx='1');
  s.linked.checked=true;
  s.linked.fire('change');
  assert.deepEqual(Array.from(child.pos),[100,125]);
  assert.equal(s.coordinateInputs[0].value,100);
  assert.equal(s.coordinateInputs[1].value,125);
  assert.ok(s.coordinateInputs.every(input=>input.readOnly));
  s.coordinateInputs[0].value='999';
  s.coordinateInputs[0].fire('input');
  s.coordinateInputs[0].fire('change');
  assert.deepEqual(Array.from(child.pos),[100,125]);
  assert.equal(child.coordinates,undefined);
  s.size.value='30';
  s.size.fire('input');
  assert.deepEqual(Array.from(child.pos),[100,135]);
  s.linked.checked=false;
  s.linked.fire('change');
  assert.ok(s.coordinateInputs.every(input=>!input.readOnly));
  s.target.pos=[0,0];
  s.window.updateTextPositions(s.task);
  assert.deepEqual(Array.from(child.pos),[100,135]);
  const html=editorHTML('text',{pos:[100,135],linked:true});
  assert.equal((html.match(/readonly/g)||[]).length,2);
  assert.match(html,/value="135"/);
  const css=fs.readFileSync(path.join(__dirname,'..','web','style.css'),'utf8');
  assert.match(css,/scene-coordinate-input:read-only\s*\{[^}]*color:#777/);
});

test('deleting the root freezes the first linked child at its computed position',()=>{
  const s=setup('text',{txt:'root',pos:[100,100],size:20});
  s.task.scene.texts.push({txt:'child',linked:true,pos:[900,900]},{txt:'grandchild',linked:true});
  s.remove.fire('click');
  s.window.updateTextPositions(s.task);
  assert.equal(s.task.scene.texts[0].linked,false);
  assert.deepEqual(Array.from(s.task.scene.texts[0].pos),[100,125]);
  assert.deepEqual(Array.from(s.task.scene.texts[1].pos),[100,144]);
});

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

test('empty ellipse angle fields remove optional values so geometry defaults to a full ellipse',()=>{
  const s=setup('ellipse',{center:[10,20],width:40,height:30,startAngleDeg:30,endAngleDeg:120});
  const updates=[];
  s.window.updateAppState=options=>updates.push(options);
  s.start.value='';
  s.start.fire('change');
  assert.equal('startAngleDeg' in s.target,false);
  assert.equal(s.start.validationMessage,'');
  assert.deepEqual(JSON.parse(JSON.stringify(updates)),[{preserveScenePanel:true}]);
  s.end.value='';
  s.end.fire('change');
  assert.equal('endAngleDeg' in s.target,false);
});

test('locking ellipse axes keeps A and coordinate edits preserve equal axis lengths',()=>{
  const ellipse={center:[100,100],width:80,height:40,t_vec:[1,0],n_vec:[0,-1]};
  const s=setup('ellipse',ellipse,[
    {vector:'axisA',axis:0,value:160},{vector:'axisB',axis:1,value:30}
  ]);
  s.lock.checked=true;
  s.lock.fire('change');
  assert.equal(ellipse.lockAxes,true);
  assert.equal(ellipse.width,80);
  assert.equal(ellipse.height,80);

  const [axisA,axisB]=s.coordinateInputs;
  axisA.value='160';
  axisA.fire('change');
  assert.equal(ellipse.width,120);
  assert.equal(ellipse.height,120);

  axisB.value='30';
  axisB.fire('change');
  assert.equal(ellipse.width,140);
  assert.equal(ellipse.height,140);
});

test('scene editor markup groups the requested controls on their intended rows',()=>{
  const rows=html=>Array.from(html.matchAll(/<div class="scene-editor-row[^"]*"[^>]*>([\s\S]*?)<\/div>/g),
    match=>match[1]);
  const plane=rows(editorHTML('plane',{through:[0,0],n_vec:[0,-1]}));
  assert.match(plane[2],/Synlig:[\s\S]*Farge:/);
  assert.match(plane[3],/Linje px:[\s\S]*scene-line-style/);

  const ellipse=rows(editorHTML('ellipse',{center:[0,0],width:80,height:40}));
  assert.match(ellipse[1],/Lås akser:[\s\S]*lockAxes/);
  assert.match(ellipse[4],/Start °:[\s\S]*Slutt °:/);
  assert.match(ellipse[5],/Farge:[\s\S]*Fyll:[\s\S]*fill_color/);
  assert.match(ellipse[6],/Linje px:[\s\S]*scene-line-style/);
  assert.doesNotMatch(ellipse[0],/scene-convert-element-btn/);

  const segment=rows(editorHTML('segment',{a:[0,0],b:[10,10]}));
  assert.match(segment[2],/Farge:/);
  assert.match(segment[3],/Linje px:[\s\S]*scene-line-style/);

  const arrow=rows(editorHTML('arrow',{a:[0,0],b:[10,10]}));
  assert.match(arrow[3],/Linje px:[\s\S]*scene-line-style/);
  assert.match(arrow[4],/Pilhode px:/);

  const text=rows(editorHTML('text',{pos:[0,0],txt:'x'}));
  assert.match(text[3],/Koblet:[\s\S]*Align:/);
  assert.match(text[6],/Snap:/);
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
      markEdited:(...args)=>edits.push(args),updateAppState:options=>updates.push(options)};
    const editor={querySelectorAll:selector=>selector==='.scene-editor-input' ? [input] : []};
    const context={window,updateScenePanel(){}};
    vm.runInNewContext(wiring+';globalThis.wire=setupEditorInputs;',context);
    context.wire(editor,entry.type,0,entry.target);
    input.change({});
    assert.deepEqual(Array.from(entry.target[entry.vector]),entry.expected);
    assert.deepEqual(edits,[['task']]);
    assert.equal(updates.length,1);
    assert.equal(updates[0].preserveScenePanel,true);
  }

  const ellipse={center:[100,100],width:80,height:40,t_vec:[1,0],n_vec:[0,-1]};
  const axisInput={dataset:{field:'coordinates',type:'ellipse',idx:'0',vector:'axisA',axis:'0'},
    type:'number',tagName:'INPUT',value:'150',addEventListener(event,fn){this[event]=fn;},
    setCustomValidity(message){this.validationMessage=message;},reportValidity(){}};
  const ellipseWindow={currentTask:{scene:{ellipses:[ellipse]}},markEdited(){},updateAppState(){},
    sceneModel:{setEllipseAxisLength(target,axis,length){
      target[axis]=length;
      if(target.lockAxes) target[axis==='width'?'height':'width']=length;
    }},
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

test('ellipse fill controls enable, recolor, and remove fill',()=>{
  const s=setup('ellipse');
  s.enable.checked=true;s.enable.fire('change');
  assert.equal(s.target.fill_color,'#4090ff');
  assert.equal(s.color.disabled,false);
  s.color.value='#123456';s.color.fire('change');
  assert.equal(s.target.fill_color,'#123456');
  s.enable.checked=false;s.enable.fire('change');
  assert.equal(Object.hasOwn(s.target,'fill_color'),false);
  assert.equal(s.color.disabled,true);
  assert.deepEqual(s.remaps,[]);
});

test('real deletion handlers remap once before removing all supported geometry types',()=>{
  for(const type of ['ellipse','rect','segment','arrow','text']){
    const s=setup(type,type==='text' ? {pos:[10,20]} : undefined);
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
