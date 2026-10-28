const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=name=>fs.readFileSync(path.join(__dirname,'..','web',name),'utf8');

test('help title pointer events keep native focus and selection without moving the panel',()=>{
  const ui=source('ui.js');
  const start=ui.indexOf('function setupHelpPanelPositioning(){');
  const end=ui.indexOf('// Make floating editor windows',start);
  const listeners={};
  let captures=0;
  const bounds={left:0,top:80,width:800,height:600};
  const header={offsetHeight:32,addEventListener:(event,handler)=>{listeners[event]=handler;},
    setPointerCapture:()=>{captures++;}};
  const panel={style:{setProperty(){}},classList:{contains:()=>false},
    getBoundingClientRect:()=>({width:240,height:300}),
    querySelector:selector=>selector==='.help-header' ? header : null};
  const window={editorMode:true,addEventListener(){}};
  const document={getElementById:id=>id==='help-panel' ? panel :
    id==='canvas-container' ? {getBoundingClientRect:()=>bounds} : null};
  vm.runInNewContext(`${ui.slice(start,end)};setupHelpPanelPositioning();`,
    {window,document,measureHelpPanelWidth:()=>240});
  for(const tag of ['input','textarea','select','button','[contenteditable]']){
    let prevented=false;
    listeners.pointerdown({button:0,pointerId:1,clientX:20,clientY:100,
      target:{closest:selector=>selector.split(', ').includes(tag)},
      preventDefault:()=>{prevented=true;}});
    assert.equal(prevented,false,`${tag} must keep its native pointer behavior`);
    assert.equal(captures,0);
  }
  let prevented=false;
  listeners.pointerdown({button:0,pointerId:2,clientX:20,clientY:100,
    target:{closest:()=>null},preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(captures,1,'the non-editable header still starts a panel drag');
  listeners.pointermove({pointerId:2,clientX:50,clientY:140});
  assert.equal(panel.style.left,'30px');
  assert.equal(panel.style.top,'120px');
});

function hoverCursor({editor,active,hit=null,armed=false,draggingHandle=null}){
  const js=source(editor ? 'editor.js' : 'main.js');
  const start=js.indexOf("  canvas.addEventListener('mousemove', (e)=>{");
  const end=js.indexOf('    // If active force is drawing/dragging, forward motion',start);
  assert.ok(start>=0 && end>start);
  const canvas={dataset:{},addEventListener:(event,handler)=>{canvas.move=handler;}};
  const window={draggingHandle,fm:{activeIndex:0,forces:active ? [active] : [],
    updateHover:()=>hit,getHoverCandidate:()=>hit?.domain==='force' ? hit : null}};
  vm.runInNewContext(`${js.slice(start,end)} });`,{
    canvas,window,getMousePos:()=>[0,0],moveSceneElement(){},
    updateEditorInteractionHover:()=>armed ? null : hit,
    isDrawArmed:()=>armed
  });
  canvas.move({});
  return canvas.dataset.draggable;
}

for(const editor of [false,true]){
  test(`${editor ? 'editor' : 'player'} cursor matches draggable force hits and drawing state`,()=>{
    const active={anchor:[0,0],arrowBase:[0,0],arrowTip:[50,0]};
    const hit={domain:'force',forceIndex:0};
    assert.equal(hoverCursor({editor,active,hit}),'true');
    assert.equal(hoverCursor({editor,hit}),'true','no active force does not prevent picking');
    assert.equal(hoverCursor({editor,active}),'false','empty canvas uses the drawing cursor');
    assert.equal(hoverCursor({editor,active:{},hit}),'true',
      'a blank active force does not hide the hand over an existing arrow');
    assert.equal(hoverCursor({editor,active:{},hit,armed:true}),'true',
      'force arrows show a hand even while a blank force input has focus');
    assert.equal(hoverCursor({editor,active:{},armed:true}),'false');
    assert.equal(hoverCursor({editor,active:{...active,drawing:true},hit}),'false');
    assert.equal(hoverCursor({editor,active:{...active,dragging:'body'}}),'true');
  });
}

test('editor shows a hand for scene hits and handles, but not while drawing is armed',()=>{
  assert.equal(hoverCursor({editor:true,hit:{domain:'scene'}}),'true');
  assert.equal(hoverCursor({editor:true,hit:{domain:'scene',handle:{type:'rect'}}}),'true');
  assert.equal(hoverCursor({editor:true,armed:true,hit:{domain:'scene',handle:{type:'rect'}}}),'false');
  assert.equal(hoverCursor({editor:true,draggingHandle:{type:'rect'}}),'true');
});

test('shared cursors use small black assets for canvas and editable text',()=>{
  const css=source('style.css');
  assert.match(css,/--canvas-cursor:.*width='17' height='17'.*stroke='black'.*8 8, crosshair/);
  assert.match(css,/--text-cursor:.*width='9' height='19'.*stroke='black'.*4 9, text/);
  assert.match(css,/textarea,\s*\[contenteditable\][^{]*\{[^}]*cursor:var\(--text-cursor\);[^}]*caret-color:#000;/);
  assert.match(css,/#app-canvas\[data-draggable="true"\]\s*\{\s*cursor:pointer;/);
  assert.match(source('scene_editor.js'),/setProperty\('cursor','var\(--canvas-cursor\)'\)/);
});
