const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','web','editor.js'),'utf8');

function extract(startMarker,endMarker){
  const start=source.indexOf(startMarker);
  const end=source.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start,`Could not find source section: ${startMarker}`);
  return source.slice(start,end);
}

function setup(text){
  const task={id:'task-a',help_lines:['Original']};
  const textarea={value:text,dataset:{taskId:task.id}};
  const stored=new Map();
  const classes=new Set();
  const helpPanel={classList:{add:name=>classes.add(name)}};
  const context=vm.createContext({
    window:{currentTask:task},
    document:{getElementById:id=>id==='help-lines-text' ? textarea : null},
    helpPanel,
    autoSaveTimer:1
  });
  vm.runInContext(extract(
    '  function collectHelpLines(){',
    '\n  // Remove task specs'
  ),context);
  context.autoSave=()=>{
    context.collectHelpLines();
    stored.set(`editor_task_${task.id}`,JSON.stringify(task));
    context.autoSaveTimer=null;
  };
  vm.runInContext(extract(
    '  function closeHelpPanel(){',
    '\n  const helpCloseBtn'
  ),context);
  return {context,task,textarea,stored,classes};
}

test('closing the task window flushes and preserves all text line breaks',()=>{
  const text='Første avsnitt\n\nSiste avsnitt\n';
  const state=setup(text);

  state.context.closeHelpPanel();

  const saved=JSON.parse(state.stored.get('editor_task_task-a'));
  assert.deepEqual(Array.from(saved.help_lines),['Første avsnitt','','Siste avsnitt','']);
  assert.equal(saved.help_lines.join('\n'),text);
  assert.equal(state.classes.has('hidden'),true);
});

test('empty task text remains an empty list',()=>{
  const state=setup('');

  state.context.collectHelpLines();

  assert.deepEqual(Array.from(state.task.help_lines),[]);
});
