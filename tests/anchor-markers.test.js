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
    shadowColor:'#777777',shadowBlur:0,
    save(){stack.push([this.globalAlpha,this.fillStyle,this.strokeStyle,this.lineWidth,this.shadowColor,this.shadowBlur]);},
    restore(){[this.globalAlpha,this.fillStyle,this.strokeStyle,this.lineWidth,this.shadowColor,this.shadowBlur]=stack.pop();},
    beginPath(){},arc(...args){this.circle=args;},
    fill(){draws.push({circle:this.circle,color:this.fillStyle,alpha:this.globalAlpha,fill:true});},
    stroke(){draws.push({circle:this.circle,color:this.strokeStyle,alpha:this.globalAlpha,fill:false,width:this.lineWidth});}
  };
  return {ctx,draws};
}

test('shared marker styles preserve existing appearance and restore canvas state',()=>{
  const {window}=runtime();
  const expected=[
    ['sceneSelected',5,'#778396',true,0.75,0],
    ['sceneHovered',6,'#2583c5',false,1,2],
    ['scenePanelHovered',6,'#8052bd',false,1,2],
    ['forceCandidate',4,'#778396',true,0.45,0],
    ['forceHovered',6,'#2583c5',false,1,2],
    ['pickerCandidate',5,'#1599b5',false,0.85,1.5],
    ['pickerHovered',6,'#087d9a',false,1,2],
    ['pickerPreview',8,'#087d9a',false,1,2]
  ];
  for(const [state,radius,color,fill,opacity,lineWidth] of expected){
    const {ctx,draws}=canvas();
    window.drawAnchorMarker(ctx,[12,34],state);
    assert.deepEqual(draws[0],{
      circle:[12,34,radius,0,Math.PI*2],color,fill,alpha:0.4*opacity,...(!fill ? {width:lineWidth} : {})
    });
    assert.deepEqual([ctx.globalAlpha,ctx.fillStyle,ctx.strokeStyle,ctx.lineWidth],
      [0.4,'#111111','#222222',9]);
    assert.deepEqual([ctx.shadowColor,ctx.shadowBlur],['#777777',0]);
  }
});

test('central highlight constants and picker styles remain the live source of marker appearance',()=>{
  const {window}=runtime();
  window.EDITOR_HIGHLIGHT_STYLES.scene.hovered.radius=11;
  window.EDITOR_HIGHLIGHT_STYLES.scene.hovered.color='#123456';
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

test('editor highlight tokens are descriptive and separate scene, panel, picker, and force states',()=>{
  const {window}=runtime();
  const styles=window.EDITOR_HIGHLIGHT_STYLES;
  assert.equal(styles.scene.panel.color,'#8052bd');
  assert.equal(styles.picker.hovered.color,'#087d9a');
  assert.equal(styles.force.handleColor,'#1599b5');
  assert.equal(styles.force.hoveredHandleColor,'#ff7d00');
  assert.equal('outlineWidth' in styles.force,false);
  assert.equal('resultantOutlineColor' in styles.force,false);
  assert.equal('glowBlur' in styles.force,false);
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
    assert.deepEqual(calls,filename==='editor.js' ? [
      {pos:[10,20],state:'sceneSelected'},{pos:[10,20],state:'sceneHovered'}
    ] : [
      {pos:[10,20],state:'playerSceneSelected'},{pos:[10,20],state:'playerSceneHovered'}
    ],filename);
    if(filename==='editor.js'){
      calls.length=0;
      window.hoveredInteraction={domain:'force'};
      window.drawHighlights({});
      assert.deepEqual(calls,[]);
    }
  }
});

test('scene-panel hover receives its own highlight state',()=>{
  const {window,context}=runtime();
  const source=fs.readFileSync(path.join(__dirname,'..','web','editor.js'),'utf8');
  const draw=source.slice(source.indexOf('  function drawSceneElementHighlights('),
    source.indexOf('  // Draw handles for selected scene element'));
  vm.runInContext(draw+';window.drawHighlights=drawSceneElementHighlights;',context);
  const calls=[];
  window.drawAnchorMarker=(ctx,pos,state)=>calls.push({pos:Array.from(pos),state});
  window.sceneLookup={rect0:{points:{top_left:[10,20]},segments:{}}};
  window.selectedSceneElement={type:'rect',index:0};
  window.scenePanelHoverTarget={type:'rect',index:0};
  window.activePanel='scene';
  window.drawHighlights({});
  assert.deepEqual(calls,[
    {pos:[10,20],state:'sceneSelected'},
    {pos:[10,20],state:'scenePanelHovered'}
  ]);
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
