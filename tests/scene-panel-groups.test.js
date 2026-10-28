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
    const event={target:this,key:'',preventDefault(){this.prevented=true;},...extras};
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
  const document={createElement:tag=>new Element(tag),
    getElementById:id=>id==='scene-items' ? sceneItems : null};
  const window={currentTask:{scene},sceneModel:{update(){}},
    sceneEditor:{checkTask(){},buildProperties(){}},markEdited(){},updateAppState(){},
    setActivePanel(){}};
  const source=fs.readFileSync(path.join(__dirname,'..','web','ui.js'),'utf8');
  const start=source.indexOf('function updateScenePanel()');
  const end=source.indexOf('function updateHelpButton()',start);
  assert.ok(start>=0 && end>start);
  const context=vm.createContext({window,document});
  for(const file of ['geometry.js','scene_render.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web',file),'utf8'),context);
  }
  vm.runInContext(`let expandedSceneType=null;let lastSceneSelectionKey='';
    ${source.slice(start,end)};globalThis.render=updateScenePanel;`,context);
  return {window,sceneItems,render:context.render};
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

test('line-width number field is wide enough for decimal values',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','web','style.css'),'utf8');
  assert.match(css,/input\.scene-line-width\s*\{\s*flex:0 0 7ch;\s*width:7ch;\s*min-width:7ch/);
});
