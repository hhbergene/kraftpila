const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function sceneRuntime(){
  const sandbox = {console};
  sandbox.window = sandbox;
  sandbox.drawFormattedText = () => {};
  sandbox.layoutFormattedText = (ctx,text,x,y,options={})=>{
    const width=String(text).length*(options.size||16)*0.5;
    const left=options.align==='center' ? -width/2 : options.align==='right' ? -width : 0;
    return {left,right:left+width,top:-(options.size||16)*0.6,bottom:(options.size||16)*0.6,
      width,height:(options.size||16)*1.2,segments:[]};
  };
  vm.createContext(sandbox);
  for(const name of ['shared.js', 'geometry.js', 'scene_render.js', 'scene_model.js']){
    vm.runInContext(fs.readFileSync(path.join(root, 'web', name), 'utf8'), sandbox, {filename: name});
  }
  return sandbox;
}

test('linked text overrides stale positions, persists coordinates and follows its chain only',()=>{
  const runtime=sceneRuntime();
  const texts=[
    {txt:'root',pos:[100,100],size:20},
    {txt:'child',linked:true,pos:[900,900],size:30},
    {txt:'legacy child'},
    {txt:'second root',pos:[400,200]},
    {txt:'second child',linked:true,pos:[1,1]}
  ];
  const task={scene:{texts}};
  runtime.updateTextPositions(task);
  const positions=()=>JSON.parse(JSON.stringify(texts.map(t=>t.pos)));
  assert.deepEqual(positions(),[[100,100],[100,125],[100,160],[400,200],[400,219]]);
  assert.equal(texts[2].linked,true);
  assert.equal(runtime.textRootIndex(texts,2),0);
  assert.equal(runtime.textRootIndex(texts,4),3);
  texts[0].pos=[140,120];
  texts[0].size=24;
  runtime.buildAllScenePoints(task);
  assert.deepEqual(positions(),[[140,120],[140,149],[140,184],[400,200],[400,219]]);
  const restored=JSON.parse(JSON.stringify(task));
  restored.scene.texts[0].pos=[200,200];
  runtime.updateTextPositions(restored);
  assert.deepEqual(Array.from(restored.scene.texts[1].pos),[200,229]);
  texts[1].linked=false;
  texts[0].pos=[0,0];
  runtime.updateTextPositions(task);
  assert.deepEqual(positions(),[[0,0],[140,149],[140,184],[400,200],[400,219]]);
});

test('linked text positions resolve before rendering even after a hidden title',()=>{
  const runtime=sceneRuntime();
  const drawn=[];
  runtime.drawFormattedText=(ctx,txt,x,y)=>drawn.push([txt,x,y]);
  const task={title:'Title',scene:{texts:[
    {txt:'Title',pos:[100,100],size:20},
    {txt:'child',linked:true,pos:[900,900]},
    {txt:'legacy'}
  ]}};
  const lookup=runtime.buildAllScenePoints(task);
  assert.deepEqual(Array.from(lookup.text2.points.pos),[100,144]);
  const ctx=new Proxy({},{
    get:(target,key)=>key in target ? target[key] : ()=>{},
    set(target,key,value){target[key]=value;return true;}
  });
  for(const mode of [true,false]){
    drawn.length=0;
    runtime.drawScene(ctx,task,mode);
    assert.deepEqual(drawn,[['child',0,0],['legacy',0,0]]);
  }
  assert.deepEqual(task.scene.texts.map(text=>Array.from(text._renderedPos)),[
    [100,100],[100,125],[100,144]
  ]);
});

test('task title scene text is hidden in both modes without deleting scene data',()=>{
  const runtime=sceneRuntime();
  const drawn=[];
  runtime.drawFormattedText=(ctx,text)=>drawn.push(text);
  const task={title:'Oppgavetittel',scene:{texts:[
    {txt:'Oppgavetittel',pos:[10,10]},
    {txt:'Annen tekst',pos:[20,20]}
  ]}};
  const before=JSON.stringify(task.scene.texts);
  const ctx=new Proxy({},{
    get:(target,key)=>key in target ? target[key] : ()=>{},
    set(target,key,value){target[key]=value;return true;}
  });
  for(const editorMode of [true,false]){
    drawn.length=0;
    runtime.drawScene(ctx,task,editorMode);
    assert.deepEqual(drawn,['Annen tekst']);
    assert.equal(JSON.stringify(task.scene.texts.map(({_renderedPos,...text})=>text)),before);
  }
  assert.equal(runtime.isTaskTitleText({title:''},{txt:''}),false);
  assert.equal(runtime.isTaskTitleText(task,{txt:'Annen tekst',angle_deg:30}),false);
  for(const entry of ['editor.js','main.js']){
    const source=fs.readFileSync(path.join(root,'web',entry),'utf8');
    assert.doesNotMatch(source,/rotatedTexts|drawRotatedText/);
    assert.match(source,/function updateHelpButton\(\)\{\s*window\.updateTaskHeader\(\);/);
    assert.match(source,/if\(Number\.isFinite\(text\.angle_deg\)\) clean\.angle_deg=text\.angle_deg/);
    assert.match(source,/else if\(Array\.isArray\(text\.n_vec\)/);
  }
});

test('shared scene renderer applies rotation and bounds to formatted text',()=>{
  const runtime=sceneRuntime();
  vm.runInContext(fs.readFileSync(path.join(root,'web','text_render.js'),'utf8'),runtime);
  const operations=[];
  const ctx=new Proxy({},{
    get(target,key){
      if(key in target) return target[key];
      if(key==='measureText') return text=>({width:text.length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2});
      return (...args)=>operations.push([key,...args]);
    },
    set(target,key,value){target[key]=value;return true;}
  });
  const task={scene:{texts:[{txt:'abc',pos:[50,60],angle_deg:90,align:'center'}]}};
  runtime.drawScene(ctx,task,true);
  assert.ok(operations.some(([name,value])=>name==='rotate'&&Math.abs(value-Math.PI/2)<1e-8));
  const geometry=runtime.getTextGeometry(ctx,task.scene.texts[0]);
  assert.ok(geometry.contains([50,60]));
  assert.ok(Math.abs(geometry.centerline[0][0]-geometry.centerline[1][0])<1e-8);
  assert.ok(geometry.centerline[1][1]>geometry.centerline[0][1]);
});

test('existing 92zvk normal-oriented velocity label keeps its actual orientation',()=>{
  const runtime=sceneRuntime();
  vm.runInContext(fs.readFileSync(path.join(root,'web','text_render.js'),'utf8'),runtime);
  const data=JSON.parse(fs.readFileSync(path.join(root,'taskset_Default.json'),'utf8'));
  const task=data.tasks.find(item=>item.id.endsWith('92zvk'));
  const text=task.scene.texts.find(item=>item.txt==='v');
  assert.ok(text?.n_vec);
  runtime.updateTextPositions(task);
  const ctx={font:'',measureText:value=>({width:value.length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2})};
  const layout=runtime.getTextGeometry(ctx,text);
  const expected=Math.atan2(text.n_vec[0],-text.n_vec[1]);
  assert.ok(Math.abs(layout.angle-expected)<1e-8);
  assert.ok(layout.contains(text.pos));
});

test('all existing tasksets retain legacy geometry and render in both modes', () => {
  const runtime = sceneRuntime();
  const coordinateMethods = new Set(['moveTo', 'lineTo', 'translate', 'rotate', 'arc', 'ellipse']);
  const ctx = new Proxy({}, {
    get(target, key){
      if(key in target) return target[key];
      return (...args) => {
        if(coordinateMethods.has(key)){
          args.filter(value => typeof value === 'number').forEach(value => assert.ok(Number.isFinite(value), `${key}: finite coordinates`));
        }
      };
    },
    set(target, key, value){ target[key] = value; return true; }
  });
  let count = 0;
  for(const filename of fs.readdirSync(root).filter(name => /^(taskset_.*|oppgavesett)\.json$/.test(name))){
    const data = JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
    const tasks = Array.isArray(data) ? data : data.tasks;
    assert.ok(Array.isArray(tasks), `${filename}: tasks array`);
    for(const source of tasks){
      if(!source.scene) continue;
      const task = JSON.parse(JSON.stringify(source));
      const before = JSON.stringify([task.scene.plane, task.scene.rects, task.scene.ellipses, task.scene.segments, task.scene.arrows]);
      runtime.drawScene(ctx, task, true);
      runtime.drawScene(ctx, task, false);
      const lookup = runtime.buildAllScenePoints(task);
      assert.ok(lookup && typeof lookup === 'object');
      assert.equal(JSON.stringify([task.scene.plane, task.scene.rects, task.scene.ellipses, task.scene.segments, task.scene.arrows]), before);
      count++;
    }
  }
  assert.ok(count > 0);
});

test('scene arrows use optional stroke and head sizes while retaining legacy defaults',()=>{
  const runtime=sceneRuntime();
  function render(arrow){
    const state={lineWidth:1,dash:[],dashCalls:[],path:[],strokes:[],fills:[]};
    const ctx=new Proxy(state,{
      get(target,key){
        if(key in target) return target[key];
        if(key==='setLineDash') return dash=>{target.dash=dash.slice();target.dashCalls.push(dash.slice());};
        if(key==='beginPath') return ()=>{target.path=[];};
        if(key==='moveTo' || key==='lineTo') return (...point)=>target.path.push(point);
        if(key==='stroke') return ()=>target.strokes.push({width:target.lineWidth,dash:target.dash.slice(),path:target.path.slice()});
        if(key==='fill') return ()=>target.fills.push(target.path.slice());
        return ()=>{};
      },
      set(target,key,value){target[key]=value;return true;}
    });
    runtime.drawScene(ctx,{scene:{arrows:[arrow]}},true);
    return state;
  }

  const legacy=render({a:[0,0],b:[100,0]});
  assert.equal(legacy.strokes[0].width,2);
  assert.deepEqual(Array.from(legacy.strokes[0].dash),[]);
  assert.ok(Math.abs(Math.hypot(
    legacy.fills[0][1][0]-legacy.fills[0][0][0],
    legacy.fills[0][1][1]-legacy.fills[0][0][1]
  )-12)<1e-8);

  const styled=render({a:[0,0],b:[100,0],lineWidth:5,arrowHeadLength:20,body:'dashed'});
  assert.equal(styled.strokes[0].width,5);
  assert.deepEqual(Array.from(styled.strokes[0].dash),[8,6]);
  assert.ok(Math.abs(Math.hypot(
    styled.fills[0][1][0]-styled.fills[0][0][0],
    styled.fills[0][1][1]-styled.fills[0][0][1]
  )-20)<1e-8);
  assert.ok(styled.dashCalls.some(dash=>dash.length===0),'arrow drawing resets line dash');
});

test('legacy circles migrate to locked ellipses and preserve their rendering styles',()=>{
  const runtime=sceneRuntime();
  function render(circle){
    const state={lineWidth:1,strokeStyle:'',fillStyle:'',globalAlpha:1,dash:[],strokes:[],fills:[]};
    const ctx=new Proxy(state,{
      get(target,key){
        if(key in target) return target[key];
        if(key==='save') return ()=>{};
        if(key==='restore') return ()=>{};
        if(key==='setLineDash') return dash=>{target.dash=dash.slice();};
        if(key==='translate' || key==='rotate') return ()=>{};
        if(key==='beginPath') return ()=>{};
        if(key==='moveTo' || key==='lineTo') return ()=>{};
        if(key==='stroke' || key==='fill') return ()=>target[key==='stroke'?'strokes':'fills'].push({
          width:target.lineWidth,color:key==='stroke'?target.strokeStyle:target.fillStyle,
          alpha:target.globalAlpha,dash:target.dash.slice()
        });
        return ()=>{};
      },
      set(target,key,value){target[key]=value;return true;}
    });
    const task={scene:{circles:[{center:[10,20],radius:5,...circle}]}};
    runtime.drawScene(ctx,task,true);
    return {state,task};
  }
  const legacy=render({});
  assert.equal(Object.hasOwn(legacy.task.scene,'circles'),false);
  assert.deepEqual(JSON.parse(JSON.stringify(legacy.task.scene.ellipses[0])),{
    center:[10,20],width:10,height:10,t_vec:[1,0],n_vec:[0,-1],
    color:'#999999',lockAxes:true
  });
  assert.equal(legacy.state.strokes[0].width,2);
  assert.equal(legacy.state.strokes[0].color,'#999999');
  assert.deepEqual(legacy.state.strokes[0].dash,[]);

  const styled=render({color:'#123456',lineWidth:4,body:'dashed',fill_color:'#abcdef',
    startAngleDeg:90,endAngleDeg:180});
  assert.equal('startAngleDeg' in styled.task.scene.ellipses[0],false,
    'legacy circles remain full even if unsupported angle fields are present');
  assert.deepEqual(JSON.parse(JSON.stringify(styled.state.strokes[0])),
    {width:4,color:'#123456',alpha:1,dash:[8,6]});
  assert.deepEqual(JSON.parse(JSON.stringify(styled.state.fills[0])),
    {width:4,color:'#abcdef',alpha:0.5,dash:[8,6]});
});

test('scene points support configurable marker, color, size, and line width with legacy defaults',()=>{
  const runtime=sceneRuntime();
  function render(point){
    const state={lineWidth:1,strokeStyle:'',fillStyle:'',path:[],markers:[]};
    const ctx=new Proxy(state,{
      get(target,key){
        if(key in target) return target[key];
        if(key==='beginPath') return ()=>{target.path=[];};
        if(key==='arc') return (...args)=>{target.path.push(['arc',...args]);};
        if(key==='rect') return (...args)=>{target.path.push(['rect',...args]);};
        if(key==='moveTo' || key==='lineTo') return (...args)=>target.path.push([key,...args]);
        if(key==='stroke' || key==='fill') return ()=>target.markers.push({
          action:key,width:target.lineWidth,stroke:target.strokeStyle,fill:target.fillStyle,path:target.path.slice()
        });
        return ()=>{};
      },
      set(target,key,value){target[key]=value;return true;}
    });
    runtime.drawScene(ctx,{scene:{points:[{pos:[10,20],visible:true,...point}]}},false);
    return state.markers;
  }

  const legacy=render({});
  assert.equal(legacy[0].width,1.5);
  assert.equal(legacy[0].stroke,'#222');
  assert.deepEqual(legacy[0].path[0],['arc',10,20,4,0,Math.PI*2]);
  assert.equal(legacy[1].fill,'#fff');
  const legacyColor=render({color:'#123456'});
  assert.equal(legacyColor[1].fill,'#123456');

  const customized=render({markerStyle:'filled',color:'#123456',size:7,lineWidth:3});
  assert.equal(customized[0].width,3);
  assert.equal(customized[0].stroke,'#123456');
  assert.equal(customized[1].fill,'#123456');
  assert.deepEqual(customized[0].path[0],['arc',10,20,7,0,Math.PI*2]);

  const square=render({markerStyle:'square',size:5});
  assert.deepEqual(square[0].path[0],['rect',5,15,10,10]);
});

test('segment direction ignores its location and reversal selects the supplementary angle', () => {
  const runtime = sceneRuntime();
  const task = {scene: {segments: [{a: [0, 0], b: [50, 0]}]}};
  const angle = {
    vertex: {pos: [100, 100]},
    start: {pos: [150, 100], anchor: {type: 'segment', ref: 'segment0', segment: 'segment'}},
    end: {pos: [150, 50]},
    radius: 20, symbol: 'a', showDegrees: true
  };
  const forward = runtime.sceneModel.angleGeometry(angle, task);
  assert.ok(forward.valid);
  assert.ok(Math.abs(forward.degrees - 45) < 1e-8);
  angle.startReversed = true;
  const reversed = runtime.sceneModel.angleGeometry(angle, task);
  assert.ok(reversed.valid);
  assert.ok(Math.abs(reversed.degrees - 135) < 1e-8);
  angle.startReversed = false;
  angle.end.pos = [150, 100];
  assert.equal(runtime.sceneModel.angleGeometry(angle, task).degrees, 0);
  angle.end.pos = [50, 100];
  assert.equal(runtime.sceneModel.angleGeometry(angle, task).degrees, 180);
});

test('pupil evaluation resolves hidden points including invalid intersections at their last valid position', () => {
  const runtime = sceneRuntime();
  runtime.showFeedback = () => {};
  vm.runInContext(fs.readFileSync(path.join(root, 'web', 'evaluate.js'), 'utf8'), runtime);
  for(const type of ['free', 'intersection']){
    const point = {id: 'point-1', type, pos: [123, 157], visible: false};
    if(type === 'intersection'){
      point.sources = [{ref: 'missing0', segment: 'segment'}, {ref: 'missing1', curve: true}];
      point.lastValidPos = point.pos.slice();
    }
    runtime.currentTask = {
      scene: {points: [point]},
      sumF: {},
      expectedForces: [{name: 'F', anchor: {type: 'point', ref: point.id, point: 'center'}, dir: [0, -1]}]
    };
    runtime.sceneModel.update(runtime.currentTask);
    runtime.sceneLookup = runtime.buildAllScenePoints(runtime.currentTask);
    runtime.fm = {forces: [{
      name: 'F', anchor: [123, 157], arrowBase: [123, 157], arrowTip: [123, 77],
      vec: [0, -80], force_dir: [0, -1], force_len: 80, moveable: true
    }, {name: '', anchor: null, arrowBase: null, arrowTip: null, moveable: true}]};
    runtime.runEvaluation();
    assert.equal(runtime.lastEvaluation.summary.expectedCount, 1);
    assert.equal(runtime.lastEvaluation.summary.foundCount, 1);
    assert.equal(runtime.lastEvaluation.summary.finalScore, 1);
    if(type === 'intersection') assert.equal(point.valid, false);
  }
});

test('angle labels use automatic equals, ignore legacy manualDegrees, and preserve literal text', () => {
  const runtime=sceneRuntime();
  const labels=[];
  runtime.drawFormattedText=(ctx,text)=>labels.push(text);
  const ctx=new Proxy({}, {get:(target,key)=>target[key] || (()=>{}),set:(target,key,value)=>(target[key]=value,true)});
  const angle={vertex:{pos:[0,0]},start:{pos:[30,0]},end:{pos:[0,-30]},
    radius:30,symbol:'α',showDegrees:true,manualDegrees:12};
  const task={scene:{angles:[angle]}};
  for(const editor of [true,false]){
    labels.length=0;
    runtime.drawScene(ctx,task,editor);
    assert.deepEqual(labels,['α=90°']);
    angle.symbol='';
    labels.length=0;
    runtime.drawScene(ctx,task,editor);
    assert.deepEqual(labels,['90°']);
    angle.symbol='\\alpha=30\\deg';
    angle.showDegrees=false;
    labels.length=0;
    runtime.drawScene(ctx,task,editor);
    assert.deepEqual(labels,['\\alpha=30\\deg']);
    angle.showDegrees=true;
    angle.symbol='α';
  }
});

test('formatted text supports alpha, deg, degree and direct symbols without prefix corruption',()=>{
  const runtime=sceneRuntime(),glyphs=[];
  vm.runInContext(fs.readFileSync(path.join(root,'web','text_render.js'),'utf8'),runtime);
  const ctx={measureText:t=>({width:t.length*8}),fillText:t=>glyphs.push(t),save(){},restore(){}};
  runtime.drawFormattedText(ctx,'\\alpha=30\\deg / \\degree / α=30°',0,0);
  assert.equal(glyphs.join(''),'α=30° / ° / α=30°');
});

test('formatted text supports nested bold and italic LaTeX-style commands',()=>{
  const runtime=sceneRuntime(),drawn=[];
  vm.runInContext(fs.readFileSync(path.join(root,'web','text_render.js'),'utf8'),runtime);
  const ctx={
    font:'',
    measureText(text){return {width:text.length*8};},
    fillText(text,x,y){drawn.push({text,font:this.font,x,y});}
  };
  runtime.drawFormattedText(ctx,'Vanlig \\textbf{fet og \\textit{fet kursiv}} tekst',100,50,{align:'center'});
  assert.equal(drawn.map(segment=>segment.text).join(''),'Vanlig fet og fet kursiv tekst');
  assert.ok(drawn.some(segment=>segment.text==='fet' && segment.font.startsWith('bold ')));
  assert.ok(drawn.some(segment=>segment.text==='fet' && segment.font.startsWith('bold italic ')));
  assert.ok(drawn.some(segment=>segment.text==='kursiv' && segment.font.startsWith('bold italic ')));
  assert.ok(drawn.some(segment=>segment.text==='Vanlig' && segment.font==='16px Arial'));
});
