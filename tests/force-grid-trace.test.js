const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');

function runtime(gridStep=20){
  const window={console,enableGuidelines:true,enableSnap:false,GRID_STEP:gridStep};
  window.window=window;
  vm.createContext(window);
  for(const file of ['geometry.js','scene_render.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),window);
  }
  return window;
}

function canvas(){
  const paths=[],stack=[];
  let current=[];
  return {
    paths,clipPath:null,strokeStyle:'original',lineWidth:7,dash:[8,6],
    save(){stack.push({strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,dash:this.dash,clipPath:this.clipPath});},
    restore(){Object.assign(this,stack.pop());},
    beginPath(){current=[];},
    moveTo(x,y){current.push(['M',x,y]);},
    lineTo(x,y){current.push(['L',x,y]);},
    closePath(){current.push(['Z']);},
    clip(){this.clipPath=current.slice();},
    setLineDash(dash){this.dash=Array.from(dash);},
    stroke(){paths.push({lines:current.slice(),clip:this.clipPath,style:this.strokeStyle,width:this.lineWidth,dash:this.dash});}
  };
}

for(const gridStep of [20,40]){
for(const vector of [[100,0],[0,100],[46,-80],[-83,57],[1,2],[10000,9999]]){
  test(`grid trace uses half-grid arms and corridor at grid ${gridStep}: ${vector}`,()=>{
    const window=runtime(gridStep),ctx=canvas();
    const base=[530.25,248.5],tip=base.map((v,i)=>v+vector[i]);
    const force={arrowBase:base,arrowTip:tip},before=JSON.stringify(force);
    window.drawForceGridTrace(ctx,force);
    assert.equal(ctx.paths.length,1);
    const drawn=ctx.paths[0],length=Math.hypot(...vector);
    const t=vector.map(v=>v/length),n=[-t[1],t[0]];
    const corners=drawn.clip.filter(p=>p[0]!=='Z').map(p=>p.slice(1));
    assert.equal(corners.length,4);
    for(let i=0;i<4;i++){
      const delta=corners[i].map((v,k)=>v-base[k]);
      assert.ok(Math.abs(window.geometry.dot(delta,t)-(i===1||i===2?length:0))<1e-8);
      assert.ok(Math.abs(window.geometry.dot(delta,n)-(i<2?gridStep/2:-gridStep/2))<1e-8);
    }
    assert.equal(drawn.clip[4][0],'Z');
    assert.equal(drawn.width,1);
    assert.deepEqual(drawn.dash,[]);
    for(let i=0;i<drawn.lines.length;i+=4){
      const [a,b,c,d]=drawn.lines.slice(i,i+4);
      const center=[(a[1]+b[1])/2,(a[2]+b[2])/2];
      assert.equal(b[1]-a[1],gridStep);
      assert.equal(d[2]-c[2],gridStep);
      assert.equal(a[2],b[2]);
      assert.equal(c[1],d[1]);
      assert.deepEqual(center,[c[1],(c[2]+d[2])/2]);
      for(let axis=0;axis<2;axis++){
        const coordinate=(center[axis]-base[axis])/gridStep;
        assert.ok(Math.abs(coordinate-Math.round(coordinate))<1e-8);
      }
    }
    assert.ok(drawn.lines.length/4<length/gridStep*8+30);
    assert.equal(ctx.strokeStyle,'original');
    assert.equal(ctx.lineWidth,7);
    assert.deepEqual(ctx.dash,[8,6]);
    assert.equal(ctx.clipPath,null);
    assert.equal(JSON.stringify(force),before);
  });
}
}

test('trace visibility depends only on guidelines and complete nonzero geometry',()=>{
  const window=runtime(),ctx=canvas(),force={arrowBase:[10,8],arrowTip:[90,8]};
  for(const invalid of [undefined,{}, {arrowBase:[0,0]}, {arrowBase:[NaN,0],arrowTip:[20,0]},
    {arrowBase:[0,0],arrowTip:[0,0]}]){
    window.drawForceGridTrace(ctx,invalid);
  }
  assert.equal(ctx.paths.length,0);
  window.enableGuidelines=false;
  window.drawForceGridTrace(ctx,force);
  assert.equal(ctx.paths.length,0);
  window.enableGuidelines=true;
  window.currentGuidelines=null;
  window.enableSnap=false;
  window.drawForceGridTrace(ctx,force);
  assert.equal(ctx.paths.length,1);
});

test('both entrypoints render only the selected force trace before forces, with no retained state',()=>{
  for(const file of ['main.js','editor.js']){
    const window=runtime(),source=fs.readFileSync(path.join(root,'web',file),'utf8');
    const start=source.indexOf('    // Guidelines (before forces for visibility)');
    const end=source.indexOf('\n    }',start)+6;
    assert.ok(start>=0 && end>start);
    const traces=[],events=[];
    const first={arrowBase:[1,0],arrowTip:[81,0]},second={arrowBase:[10,8],arrowTip:[90,8]};
    const ctx=canvas();
    window.fm={forces:[first,second],activeIndex:1,drawAll(){events.push('forces');}};
    const original=window.drawForceGridTrace;
    window.drawForceGridTrace=(ctx,force)=>{traces.push(force);events.push('trace');original(ctx,force);};
    window.drawGuidelines=()=>events.push('guidelines');
    window.ctx=ctx;window.g=ctx;
    const guidelinesEnd=source.indexOf('\n    }',end)+6;
    const forcesStart=source.indexOf('    // Draw test forces',guidelinesEnd);
    const forcesEnd=source.indexOf('\n    }',forcesStart)+6;
    const draw=()=>{
      vm.runInContext(source.slice(start,guidelinesEnd),window);
      vm.runInContext(source.slice(forcesStart,forcesEnd),window);
    };
    assert.ok(end<source.indexOf('      drawGuidelines(',start));
    assert.ok(end<source.indexOf('      window.fm.drawAll(',start));
    draw();
    assert.equal(traces[0],second);
    assert.deepEqual(events,['trace','guidelines','forces']);
    window.fm.activeIndex=0;
    draw();
    assert.equal(traces[1],first);
    window.fm.forces=[];
    draw();
    assert.equal(traces[2],undefined);
    assert.equal(ctx.paths.length,2);
  }
});

test('trace is unnecessary only when both base coordinates align with the canvas grid',()=>{
  for(const gridStep of [20,40]){
    const window=runtime(gridStep),ctx=canvas();
    for(const base of [[0,0],[gridStep*3,-gridStep*2],[-gridStep,gridStep]]){
      window.drawForceGridTrace(ctx,{arrowBase:base,arrowTip:[base[0]+83,base[1]-57]});
    }
    assert.equal(ctx.paths.length,0);
    for(const base of [[gridStep+0.25,gridStep],[gridStep,gridStep-0.25]]){
      window.drawForceGridTrace(ctx,{arrowBase:base,arrowTip:[base[0]+83,base[1]-57]});
    }
    assert.equal(ctx.paths.length,2);
  }
});
