const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function runtime(){
  const window={editorMode:true,settings:{show_force_coordinates:false}};
  const context=vm.createContext({window,geometry:{length:vector=>Math.hypot(...vector)}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','shared.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','forces.js'),'utf8'),context);
  return window;
}

function canvas(){
  const state=['fillStyle','strokeStyle','lineWidth','lineCap','lineJoin','shadowColor','shadowBlur'];
  const stack=[],fills=[],strokes=[],events=[];
  let path=[];
  const ctx={
    fillStyle:'#000',strokeStyle:'#000',lineWidth:1,lineCap:'butt',lineJoin:'miter',
    shadowColor:'transparent',shadowBlur:0,
    save(){stack.push(Object.fromEntries(state.map(key=>[key,this[key]])));},
    restore(){Object.assign(this,stack.pop());},
    beginPath(){path=[];},
    moveTo(...pos){path.push(['moveTo',...pos]);},
    lineTo(...pos){path.push(['lineTo',...pos]);},
    arc(...args){path.push(['arc',...args]);},
    closePath(){path.push(['closePath']);},
    fill(){
      const fill={path:[...path],color:this.fillStyle};
      fills.push(fill);events.push({type:'fill',...fill});
    },
    stroke(){strokes.push({path:[...path],color:this.strokeStyle,width:this.lineWidth,
      shadowColor:this.shadowColor,shadowBlur:this.shadowBlur});
      events.push({type:'stroke',...strokes.at(-1)});
    },
    setLineDash(){}
  };
  return {ctx,fills,strokes,events};
}

function force(window,overrides={}){
  return Object.assign(new window.Force(),{
    anchor:[0,0],arrowBase:[10,0],arrowTip:[110,0],force_len:100,
    isExpected:true,moveable:true,...overrides
  });
}

test('body hover and drag use cyan handles for all force types',()=>{
  const window=runtime();
  for(const state of ['hovering','dragging']){
    const {ctx,fills,strokes}=canvas();
    force(window,{[state]:'body'}).draw(ctx,false);
    const handleColors=fills.filter(fill=>fill.path.some(command=>command[0]==='arc'))
      .map(fill=>fill.color);
    assert.deepEqual(handleColors,['#1599b5','#1599b5']);
    assert.ok(strokes.some(stroke=>stroke.width===4 && stroke.color==='#ff7d00'),
      'body hover and drag use the existing orange drag-highlight');
    assert.equal(strokes.some(stroke=>stroke.width!==2 && stroke.width!==4),false,
      'body highlight does not add an outline pass');
    assert.equal(strokes.some(stroke=>stroke.shadowBlur>0),false,'force highlights have no glow');
  }
});

test('anchor and tip hover or drag turn only the target handle orange',()=>{
  const window=runtime();
  for(const part of ['anchor','arrowTip']){
    for(const state of ['hovering','dragging']){
      const {ctx,fills,strokes}=canvas();
      force(window,{[state]:part}).draw(ctx,false);
      const handleColors=fills.filter(fill=>fill.path.some(command=>command[0]==='arc'))
        .map(fill=>fill.color);
      assert.deepEqual(handleColors,part==='anchor' ? ['#ff7d00','#1599b5'] : ['#1599b5','#ff7d00']);
      assert.ok(strokes.some(stroke=>stroke.width===4 && stroke.color==='#ff5050'),
        `${state} ${part} leaves the force arrow body in its normal color`);
      assert.equal(strokes.some(stroke=>stroke.width!==2 && stroke.width!==4),false,
        `${state} ${part} does not add an outline to the force arrow body`);
    }
  }
});

test('expected and initial force handles share cyan on body hover',()=>{
  const window=runtime();
  for(const overrides of [{},{isExpected:false,moveable:false}]){
    const {ctx,fills,strokes}=canvas();
    force(window,{...overrides,hovering:'body'}).draw(ctx,false);
    const handleColors=fills.filter(fill=>fill.path.some(command=>command[0]==='arc'))
      .map(fill=>fill.color);
    assert.deepEqual(handleColors,['#1599b5','#1599b5']);
    assert.ok(strokes.some(stroke=>stroke.width===4 && stroke.color==='#ff7d00'));
  }
});

test('resultant body hover uses color only without an outline or glow',()=>{
  const window=runtime(),{ctx,strokes}=canvas();
  force(window,{role:'resultant',hovering:'body'}).draw(ctx,false);
  assert.ok(strokes.some(stroke=>stroke.width===4 && stroke.color==='#ff7d00'));
  assert.equal(strokes.some(stroke=>stroke.width!==2 && stroke.width!==4),false);
  assert.equal(strokes.some(stroke=>stroke.shadowBlur>0),false);
});

test('handles render above the arrow and use the shared cyan color when active',()=>{
  const window=runtime(),{ctx,fills,strokes,events}=canvas();
  force(window).draw(ctx,true);
  const handleColors=fills.filter(fill=>fill.path.some(command=>command[0]==='arc'))
    .map(fill=>fill.color);
  assert.deepEqual(handleColors,['#1599b5','#1599b5']);
  const lastArrowStroke=events.findLastIndex(event=>event.type==='stroke' && event.width===4);
  const firstHandle=events.findIndex(event=>event.type==='fill' &&
    event.path.some(command=>command[0]==='arc'));
  assert.ok(firstHandle>lastArrowStroke,'handles render after arrow geometry');
  assert.equal(strokes.some(stroke=>stroke.width!==2 && stroke.width!==4),false);
});
