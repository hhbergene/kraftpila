const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function runtime(){
  const window={};
  const context=vm.createContext({window});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','shared.js'),'utf8'),context);
  return {window,context};
}

function canvas(){
  const stack=[],draws=[];
  const ctx={
    globalAlpha:0.4,fillStyle:'#111111',strokeStyle:'#222222',lineWidth:9,
    save(){stack.push([this.globalAlpha,this.fillStyle,this.strokeStyle,this.lineWidth]);},
    restore(){[this.globalAlpha,this.fillStyle,this.strokeStyle,this.lineWidth]=stack.pop();},
    beginPath(){},arc(...args){this.circle=args;},
    fill(){draws.push({circle:this.circle,color:this.fillStyle,alpha:this.globalAlpha,fill:true});},
    stroke(){draws.push({circle:this.circle,color:this.strokeStyle,alpha:this.globalAlpha,fill:false,width:this.lineWidth});}
  };
  return {ctx,draws};
}

test('shared marker styles preserve existing appearance and restore canvas state',()=>{
  const {window}=runtime();
  const expected=[
    ['sceneSelected',6,'#aaaaaa',true,1],
    ['sceneHovered',8,'#ffff00',true,1],
    ['forceCandidate',5,'#aaaaaa',true,0.5],
    ['forceHovered',8,'#ffff00',true,1],
    ['pickerCandidate',6,'#1686ad',false,1],
    ['pickerHovered',6,'#e89100',false,1],
    ['pickerPreview',8,'#e89100',false,1]
  ];
  for(const [state,radius,color,fill,opacity] of expected){
    const {ctx,draws}=canvas();
    window.drawAnchorMarker(ctx,[12,34],state);
    assert.deepEqual(draws[0],{
      circle:[12,34,radius,0,Math.PI*2],color,fill,alpha:0.4*opacity,...(!fill ? {width:2} : {})
    });
    assert.deepEqual([ctx.globalAlpha,ctx.fillStyle,ctx.strokeStyle,ctx.lineWidth],
      [0.4,'#111111','#222222',9]);
  }
});

test('central highlight constants and picker styles remain the live source of marker appearance',()=>{
  const {window}=runtime();
  window.HIGHLIGHT_SCENE_POINT_BRIGHT_RADIUS=11;
  window.HIGHLIGHT_SCENE_POINT_BRIGHT_COLOR='#123456';
  for(const state of ['sceneHovered','forceHovered']){
    const {ctx,draws}=canvas();
    window.drawAnchorMarker(ctx,[0,0],state);
    assert.equal(draws[0].circle[2],11);
    assert.equal(draws[0].color,'#123456');
  }
  Object.assign(window.ANCHOR_MARKER_STYLES.pickerHovered,{color:'#654321',lineWidth:4});
  const {ctx,draws}=canvas();
  window.drawAnchorMarker(ctx,[0,0],'pickerPreview');
  assert.equal(draws[0].circle[2],8);
  assert.equal(draws[0].color,'#654321');
  assert.equal(draws[0].width,4);
});

test('editor and player scene highlights use the shared renderer',()=>{
  for(const filename of ['editor.js','main.js']){
    const {window,context}=runtime();
    const source=fs.readFileSync(path.join(__dirname,'..','web',filename),'utf8');
    const draw=source.slice(source.indexOf('  function drawSceneElementHighlights('),
      source.indexOf('  function drawSceneElementHandles('));
    vm.runInContext(draw+';window.drawHighlights=drawSceneElementHighlights;',context);
    const calls=[];
    window.drawAnchorMarker=(ctx,pos,state)=>calls.push({pos:Array.from(pos),state});
    window.sceneLookup={rect0:{points:{top_left:[10,20]},segments:{}}};
    window.selectedSceneElement={type:'rect',index:0};
    window.hoveredSceneElement={type:'rect',index:0};
    window.activePanel='scene';
    window.drawHighlights({});
    assert.deepEqual(calls,[
      {pos:[10,20],state:'sceneSelected'},{pos:[10,20],state:'sceneHovered'}
    ],filename);
    if(filename==='editor.js'){
      calls.length=0;
      window.hoveredInteraction={domain:'force'};
      window.drawHighlights({});
      assert.deepEqual(calls,[]);
    }
  }
});

test('force-anchor dragging uses the shared candidate and hover states',()=>{
  const {window,context}=runtime();
  const source=fs.readFileSync(path.join(__dirname,'..','web','editor.js'),'utf8');
  const draw=source.slice(source.indexOf('    if(window.anchorCandidates &&'),
    source.indexOf('    // Draw test forces'));
  const calls=[];
  window.drawAnchorMarker=(ctx,pos,state)=>calls.push({pos:Array.from(pos),state});
  window.anchorCandidates=[{pos:[10,20]},{pos:[30,40]}];
  window.anchorHoverIndex=1;
  vm.runInContext('const ctx={};'+draw,context);
  assert.deepEqual(calls,[
    {pos:[10,20],state:'forceCandidate'},{pos:[30,40],state:'forceHovered'}
  ]);
});
