const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag){
    this.tagName=tag.toUpperCase();
    this.children=[];
    this.listeners={};
    this.dataset={};
    this.style={};
    this.hidden=false;
    this._className='';
    this.classList={
      add:name=>{if(!this.classList.contains(name)) this.className=`${this.className} ${name}`.trim();},
      remove:name=>{this.className=this.className.split(/\s+/).filter(value=>value!==name).join(' ');},
      contains:name=>this.className.split(/\s+/).includes(name)
    };
  }
  set className(value){this._className=value;}
  get className(){return this._className;}
  set textContent(value){this._textContent=String(value);this.children=[];}
  get textContent(){return this._textContent ?? this.children.map(child=>child.textContent).join('');}
  set innerHTML(value){
    this._innerHTML=value;
    this.children=[];
    for(const match of String(value).matchAll(/\bid="([^"]+)"/g)){
      const input=new Element('input');
      input.id=match[1];
      this.appendChild(input);
    }
  }
  get innerHTML(){return this._innerHTML || '';}
  appendChild(child){child.parent=this;child.parentElement=this;this.children.push(child);return child;}
  append(...children){children.forEach(child=>this.appendChild(child));}
  setAttribute(name,value){this[name]=value;}
  addEventListener(type,listener){(this.listeners[type] ||= []).push(listener);}
  fire(type,extras={}){
    const event={target:this,key:'',preventDefault(){this.prevented=true;},
      stopPropagation(){this.stopped=true;},...extras};
    (this.listeners[type] || []).forEach(listener=>listener(event));
    return event;
  }
  querySelector(selector){return this.querySelectorAll(selector)[0] || null;}
  querySelectorAll(selector){
    const matches=element=>{
      if(selector.startsWith('.')) return element.classList.contains(selector.slice(1));
      if(selector.startsWith('#')) return element.id===selector.slice(1);
      return false;
    };
    const found=[];
    const visit=parent=>parent.children.forEach(child=>{
      if(matches(child)) found.push(child);
      visit(child);
    });
    visit(this);
    return found;
  }
  closest(){return null;}
}

function setup(scene){
  const sceneItems=new Element('div');
  const addGroupButton=new Element('button');
  const document={createElement:tag=>new Element(tag),
    getElementById:id=>id==='scene-items' ? sceneItems :
      id==='btn-add-group' ? addGroupButton : null,
    querySelector:()=>null};
  const window={editorMode:true,activePanel:'scene',currentTask:{scene},sceneModel:{update(){ }},
    sceneEditor:{checkTask(){},buildProperties(){}},markEdited(){},updateAppState(){},
    setActivePanel(kind){this.activePanel=kind;}};
  const source=fs.readFileSync(path.join(__dirname,'..','web','ui.js'),'utf8');
  const start=source.indexOf('function updateScenePanel()');
  const end=source.indexOf('function updateHelpButton()',start);
  assert.ok(start>=0 && end>start);
  const context=vm.createContext({window,document});
  for(const file of ['geometry.js','scene_render.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web',file),'utf8'),context);
  }
  vm.runInContext(`let expandedSceneType=null;let lastSceneSelectionKey='';let lastSceneGroupTask=null;
    ${source.slice(start,end)};globalThis.render=updateScenePanel;`,context);
  return {window,sceneItems,addGroupButton,context,render:context.render};
}

test('scene types collapse to count rows, expand with previews, and follow panel or canvas selection',()=>{
  const s=setup({
    plane:null,rects:[],ellipses:[],
    segments:[{a:[1,2],b:[3,4]}],arrows:[],points:[],angles:[],
    texts:[{txt:'first long text',pos:[10,20]},{txt:'second',pos:[30,40]},{txt:'third',pos:[50,60]}]
  });
  s.render();
  const group=type=>s.sceneItems.querySelectorAll('.scene-type-group')
    .find(item=>item.dataset.type===type);
  const textGroup=group('text'),segmentGroup=group('segment');
  assert.ok(textGroup.querySelector('.scene-type-header').textContent.includes('txt (3)'));
  assert.equal(textGroup.querySelector('.scene-type-items').hidden,true);
  assert.equal(segmentGroup.querySelector('.scene-type-items').hidden,true);

  textGroup.querySelector('.scene-type-header').fire('click');
  let expandedText=group('text');
  assert.equal(expandedText.querySelector('.scene-type-items').hidden,false);
  assert.equal(expandedText.querySelectorAll('.scene-item').length,3);
  assert.equal(s.window.selectedSceneElement.type,'text');
  assert.equal(s.window.selectedSceneElement.index,0,
    'expanding a multi-element group opens the first item');
  assert.ok(expandedText.querySelector('.scene-item').classList.contains('selected'));
  const textItem=expandedText.querySelector('.scene-item');
  const textPreview=textItem.querySelector('.scene-item-text-preview');
  assert.equal(textPreview.textContent,'first long text');
  assert.equal(textPreview.parentElement,textItem.querySelector('.scene-item-header'));
  assert.equal(textPreview.title,undefined);
  assert.ok(textItem.querySelector('.scene-item-editor').innerHTML.includes('value="first long text"'),
    'the complete text remains available in its editor field');
  expandedText.querySelector('.scene-item-header').fire('click');
  assert.equal(s.window.selectedSceneElement.type,'text');

  group('segment').querySelector('.scene-type-header').fire('click');
  assert.equal(s.window.selectedSceneElement.type,'segment',
    'clicking a one-element group opens its editor directly');
  s.render();
  assert.equal(group('text').querySelector('.scene-type-items').hidden,true);
  assert.equal(group('segment').querySelector('.scene-type-items').hidden,false);
  assert.equal(group('segment').querySelector('.scene-item-preview').textContent,'(1-2)-(3-4)');
  assert.equal(group('segment').querySelector('.scene-item-preview').parentElement,
    group('segment').querySelector('.scene-item-header'));
  assert.ok(group('segment').querySelector('.scene-item').classList.contains('selected'));

  s.window.selectedSceneElement={type:'text',index:1};
  s.render();
  assert.equal(group('segment').querySelector('.scene-type-items').hidden,true,
    'canvas selection collapses the previously active type');
  assert.ok(group('text').querySelectorAll('.scene-item')[1].classList.contains('selected'));
});

test('coordinate previews stay inline and use compact coordinate pairs',()=>{
  const s=setup({
    plane:{through:[10,20],dirPoint:[30,40]},rects:[],
    ellipses:[{center:[50,60]}],segments:[],arrows:[],
    points:[{pos:[70,80]}],angles:[{vertex:{pos:[90,100]}}],texts:[]
  });
  s.render();
  const group=type=>s.sceneItems.querySelectorAll('.scene-type-group')
    .find(item=>item.dataset.type===type);
  for(const [type,preview] of [
    ['plane','(10-20)-(30-40)'],
    ['ellipse','(50-60)'],
    ['point','(70-80)'],
    ['angle','(90-100)']
  ]){
    const item=group(type).querySelector('.scene-item');
    const value=item.querySelector('.scene-item-preview');
    assert.equal(value.textContent,preview);
    assert.equal(value.parentElement,item.querySelector('.scene-item-header'));
  }
});

test('scene groups create, show references, select members, and remove only membership',()=>{
  const text={txt:'member text',pos:[10,20]};
  const arrow={a:[20,30],b:[60,30]};
  const s=setup({plane:{through:[0,0],dirPoint:[0,20]},rects:[],ellipses:[],
    segments:[],arrows:[{a:[0,0],b:[10,10]},arrow],points:[],angles:[],
    texts:[{txt:'first',pos:[1,1]},{txt:'second',pos:[2,2]},text]});
  s.render();
  s.addGroupButton.fire('click');
  assert.deepEqual(JSON.parse(JSON.stringify(s.window.currentTask.scene.groups)),
    [{description:'',members:[]}]);
  assert.equal(s.window.activeSceneGroupIndex,0);

  const group=()=>s.sceneItems.querySelector('.scene-group');
  let description=group().querySelector('.scene-group-description');
  assert.equal(description.placeholder,'Skriv beskrivelse for gruppen');
  assert.equal(group().querySelector('.scene-group-items').hidden,false);

  s.window.selectedSceneElement={type:'text',index:2,obj:text};
  s.render();
  group().querySelector('.scene-group-toggle').fire('click');
  group().querySelector('.scene-group-controls').querySelector('.scene-group-control').fire('click');
  assert.deepEqual(JSON.parse(JSON.stringify(s.window.currentTask.scene.groups[0].members)),
    [{type:'text',index:2}]);
  assert.equal(group().querySelector('.scene-group-preview').textContent,'txt[2]');

  s.window.selectedSceneElement={type:'arrow',index:1,obj:arrow};
  s.render();
  group().querySelector('.scene-group-toggle').fire('click');
  let addButton=group().querySelector('.scene-group-controls').querySelector('.scene-group-control');
  addButton.fire('click');
  assert.deepEqual(JSON.parse(JSON.stringify(s.window.currentTask.scene.groups[0].members)),
    [{type:'text',index:2},{type:'arrow',index:1}],
    'adding a selected member twice does not duplicate its reference');
  addButton=group().querySelector('.scene-group-controls').querySelector('.scene-group-control');
  assert.equal(addButton.disabled,true);
  assert.equal(group().querySelector('.scene-group-preview').textContent,'txt[2], arrow[1]');

  const rows=group().querySelectorAll('.scene-group-member');
  assert.equal(rows.length,2);
  assert.deepEqual(rows[1].children.map(child=>child.className),
    ['scene-group-member-reference','scene-group-remove-member']);
  const reference=rows[1].querySelector('.scene-group-member-reference');
  assert.equal(reference.textContent,'arrow[1]');
  reference.fire('click');
  assert.equal(s.window.selectedSceneElement.obj,arrow);
  assert.equal(s.window.activeSceneGroupIndex,0);
  assert.equal(group().querySelector('.scene-group-items').hidden,false);
  const arrowTypeGroup=s.sceneItems.querySelectorAll('.scene-type-group')
    .find(item=>item.dataset.type==='arrow');
  assert.equal(arrowTypeGroup.querySelector('.scene-type-items').hidden,true,
    'a single click selects the canvas element without opening its normal editor');

  const doubleClickReference=group().querySelectorAll('.scene-group-member')[1]
    .querySelector('.scene-group-member-reference');
  doubleClickReference.fire('dblclick');
  assert.equal(s.window.activeSceneGroupIndex,null);
  assert.equal(s.sceneItems.querySelectorAll('.scene-type-group')
    .find(item=>item.dataset.type==='arrow').querySelector('.scene-type-items').hidden,false,
    'a double click opens the element in its normal editor');

  group().querySelector('.scene-group-toggle').fire('click');
  group().querySelectorAll('.scene-group-member')[1]
    .querySelector('.scene-group-remove-member').fire('click');
  assert.deepEqual(JSON.parse(JSON.stringify(s.window.currentTask.scene.groups[0].members)),
    [{type:'text',index:2}]);
  assert.equal(s.window.currentTask.scene.arrows[1],arrow,
    'removing a member leaves the underlying scene element intact');

  description=group().querySelector('.scene-group-description');
  description.value='Samlet figur';
  description.fire('input');
  assert.equal(group().querySelector('.scene-group-preview').textContent,'Samlet figur');
  group().querySelector('.scene-group-controls').children[1].fire('click');
  assert.equal(s.window.currentTask.scene.groups.length,0);
});

test('scene groups accept planes and cannot add a stale scene selection from the force panel',()=>{
  const plane={through:[0,0],dirPoint:[0,20]};
  const s=setup({plane,rects:[],ellipses:[],segments:[],arrows:[],points:[],angles:[],texts:[],
    groups:[{description:'',members:[]}]});
  s.window.selectedSceneElement={type:'plane',obj:plane};
  s.render();
  const group=()=>s.sceneItems.querySelector('.scene-group');
  group().querySelector('.scene-group-toggle').fire('click');
  group().querySelector('.scene-group-controls').children[0].fire('click');
  assert.deepEqual(JSON.parse(JSON.stringify(s.window.currentTask.scene.groups[0].members)),
    [{type:'plane'}]);
  assert.equal(group().querySelector('.scene-group-member-reference').textContent,'plane');

  s.window.activePanel='force';
  s.render();
  assert.equal(group().querySelector('.scene-group-controls').children[0].disabled,true);
});

test('group references follow scene-element reordering, deletion, and conversion',()=>{
  const s=setup({circles:[{}],rects:[{},{},{}],ellipses:[],segments:[],
    arrows:[],points:[],angles:[],texts:[],groups:[{description:'',members:[
      {type:'rect',index:0},{type:'rect',index:1},{type:'rect',index:2},
      {type:'circle',index:0}
    ]}]});
  const model=s.window.createSceneModel();
  const task=s.window.currentTask;
  model.remapReferences(task,'rect',1,'up');
  assert.deepEqual(task.scene.groups[0].members.slice(0,3).map(member=>member.index),[1,0,2]);
  model.remapReferences(task,'rect',0,'delete');
  assert.deepEqual(task.scene.groups[0].members.filter(member=>member.type==='rect')
    .map(member=>member.index),[0,1]);
  model.remapReferences(task,'circle',0,'convert','ellipse',1);
  assert.deepEqual(JSON.parse(JSON.stringify(task.scene.groups[0].members.at(-1))),
    {type:'ellipse',index:1});
});

test('line-width number field is wide enough for decimal values',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','web','style.css'),'utf8');
  assert.match(css,/input\.scene-line-width\s*\{\s*flex:0 0 7ch;\s*width:7ch;\s*min-width:7ch/);
});
