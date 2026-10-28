const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(){
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'shared.js'), 'utf8'), {window});
  const anchor = {type: 'point', ref: 'point-test', point: 'center'};
  const initial = {name: 'G', anchorSpec: anchor, anchor: [10, 20], arrowBase: [15, 20], arrowTip: [15, 80]};
  const expected = {name: 'N', anchor};
  const task = {scene: {}, initialForces: [initial], expectedForces: [expected]};
  window.sceneModel = {
    resolveAnchor: () => ({pos: [40, 50], valid: true}),
    candidates: () => []
  };
  window.getForceSpec = force => ({
    spec: force.isExpected === false ? initial : expected,
    prop: force.isExpected === false ? 'anchorSpec' : 'anchor'
  });
  const force = {
    name: 'G', isExpected: false,
    anchor: [10, 20], arrowBase: [15, 20], arrowTip: [15, 80],
    updateDirectionAndLength(){ this.updated = true; }
  };
  return {window, task, force, initial, expected};
}

test('editor follows point anchor and preserves arrow offset and vector', () => {
  const {window, task, force, initial} = setup();
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, true), true);
  assert.deepEqual(Array.from(force.anchor), [40, 50]);
  assert.deepEqual(Array.from(force.arrowBase), [45, 50]);
  assert.deepEqual(Array.from(force.arrowTip), [45, 110]);
  assert.deepEqual(Array.from(initial.anchor), [40, 50]);
  assert.equal(force.updated, true);
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, true), false);
});

test('editor follows expected point anchors as well as locked forces', () => {
  const {window, task, force} = setup();
  force.name = 'N';
  force.isExpected = true;
  window.syncSceneForceAnchors(task, {forces: [force]}, true);
  assert.deepEqual(Array.from(force.anchor), [40, 50]);
});

test('pupil locked forces follow points without rewriting source coordinates', () => {
  const {window, task, force, initial} = setup();
  window.syncSceneForceAnchors(task, {forces: [force]}, false);
  assert.deepEqual(Array.from(force.anchor), [40, 50]);
  assert.deepEqual(initial.anchor, [10, 20]);
});

test('pupil drawings are not moved to expected answers', () => {
  const {window, task, force} = setup();
  force.name = 'N';
  force.isExpected = true;
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, false), false);
  assert.deepEqual(force.anchor, [10, 20]);
});

test('invalid intersection anchor is detached at its last valid force position', () => {
  const {window, task, force, initial} = setup();
  window.sceneModel.resolveAnchor = () => ({pos: [30, 40], valid: false, reason: 'Skjæringen finnes ikke'});
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, true), true);
  assert.deepEqual(Array.from(force.anchor), [10, 20]);
  assert.deepEqual(force.arrowBase, [15, 20]);
  assert.deepEqual(force.arrowTip, [15, 80]);
  assert.equal(initial.anchorSpec.type, 'custom');
  assert.deepEqual(Array.from(initial.anchorSpec.pos), [10, 20]);
});

test('custom anchors and active dragging retain existing behavior', () => {
  const {window, task, force, initial} = setup();
  initial.anchorSpec = {type: 'custom', pos: [10, 20]};
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, true), false);
  initial.anchorSpec = {type: 'point', ref: 'point-test', point: 'center'};
  force.dragging = 'anchor';
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, true), false);
  assert.deepEqual(force.anchor, [10, 20]);
});

test('unresolved anchors are not moved to a success-shaped default', () => {
  const {window, task, force, initial} = setup();
  window.sceneModel.resolveAnchor = () => ({valid: false, reason: 'Anker finnes ikke'});
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, true), true);
  assert.deepEqual(force.anchor, [10, 20]);
  assert.equal(initial.anchorSpec.type, 'custom');
  assert.deepEqual(Array.from(initial.anchorSpec.pos), [10, 20]);
});

test('editor follows segment anchors at their saved fraction and persists force coordinates', () => {
  const {window, task, force, initial} = setup();
  initial.anchorSpec = {type: 'segment', ref: 'segment0', segment: 'segment', u: 0.25};
  force.anchor = [10, 20];
  force.arrowBase = [15, 20];
  force.arrowTip = [15, 80];
  window.sceneModel.resolveAnchor = (scene, anchor) => {
    assert.equal(anchor.u, 0.25);
    return {pos: [40, 50], segment: {a: [0, 50], b: [100, 50]}, valid: true};
  };
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, true), true);
  assert.deepEqual(Array.from(force.anchor), [40, 50]);
  assert.deepEqual(Array.from(force.arrowBase), [45, 50]);
  assert.deepEqual(Array.from(force.arrowTip), [45, 110]);
  assert.deepEqual(Array.from(initial.anchor), [40, 50]);
  assert.deepEqual(Array.from(initial.arrowBase), [45, 50]);
  assert.deepEqual(Array.from(initial.arrowTip), [45, 110]);
});

test('automatic matching prefers an inward-facing segment over a coincident point', () => {
  const {window, task, force} = setup();
  task.scene.rects = [
    {bottomCenter: [0, 20], width: 20, height: 20, n_vec: [0, -1]},
    {bottomCenter: [0, 20], width: 20, height: 20, n_vec: [0, 1]}
  ];
  force.anchor = [0, 20];
  force.arrowBase = [0, 20];
  force.arrowTip = [0, 10];
  window.sceneModel.candidates = () => [
    {kind:'point', ref:'point0', pos:[0,20], anchor:{type:'point',ref:'point0',point:'center'}},
    {kind:'segment', ref:'rect1', segment:'bottom', anchor:{type:'segment',ref:'rect1',segment:'bottom'},
      segment:{a:[-10,20],b:[10,20]}},
    {kind:'segment', ref:'rect0', segment:'bottom', anchor:{type:'segment',ref:'rect0',segment:'bottom'},
      segment:{a:[-10,20],b:[10,20]}}
  ];
  window.sceneModel.resolveAnchor = () => ({valid:true,pos:[0,20]});
  const best = window.findSceneAnchorAtPosition(force, task);
  assert.equal(best.anchor.type, 'segment');
  assert.equal(best.anchor.ref, 'rect0');
  assert.deepEqual(Array.from(best.pos), [0,20]);
});

test('automatic matching requires an exact position match', () => {
  const {window, task, force} = setup();
  window.sceneModel.candidates = () => [
    {kind:'point', ref:'point0', pos:[0,0], anchor:{type:'point',ref:'point0',point:'center'}}
  ];
  window.sceneModel.resolveAnchor = () => ({valid:true,pos:[0,0]});
  force.anchor = [0,0];
  assert.equal(window.findSceneAnchorAtPosition(force, task).anchor.ref, 'point0');
  force.anchor = [0,0.5];
  assert.equal(window.findSceneAnchorAtPosition(force, task), null);
  force.anchor = [0,1];
  assert.equal(window.findSceneAnchorAtPosition(force, task), null);
});

test('adding a scene point does not attach or move a force without an anchor spec', () => {
  const {window, task, force, initial} = setup();
  initial.anchorSpec = undefined;
  force.anchor = [10,20];
  force.arrowBase = [15,20];
  force.arrowTip = [15,80];
  window.sceneModel.candidates = () => [
    {kind:'point',ref:'point-new',pos:[40,50],anchor:{type:'point',ref:'point-new',point:'center'}}
  ];
  assert.equal(window.syncSceneForceAnchors(task, {forces:[force]}, true), false);
  assert.deepEqual(Array.from(force.anchor), [10,20]);
  assert.deepEqual(Array.from(force.arrowBase), [15,20]);
  assert.deepEqual(Array.from(force.arrowTip), [15,80]);
  assert.equal(initial.anchorSpec, undefined);
});

test('missing anchor source detaches at the current position without reconnecting when its ID is reused', () => {
  const {window, task, force, initial} = setup();
  window.sceneModel.resolveAnchor = (scene, anchor) => anchor.ref === 'point-near'
    ? {valid:true, pos:[10,20]}
    : {valid:false, pos:[10,20], reason:'Punkt ugyldig'};
  window.sceneModel.candidates = () => [
    {kind:'point',ref:'point-near',pos:[10,20],anchor:{type:'point',ref:'point-near',point:'center'}}
  ];
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, true), true);
  assert.deepEqual(JSON.parse(JSON.stringify(initial.anchorSpec)),{type:'custom',pos:[10,20]});
  assert.equal(window.pendingForceAnchorPickerIndices,undefined);
  assert.deepEqual(Array.from(force.anchor),[10,20]);
  window.sceneModel.candidates = () => [
    {kind:'point',ref:'point-test',pos:[90,100],anchor:{type:'point',ref:'point-test',point:'center'}}
  ];
  window.sceneModel.resolveAnchor = () => ({valid:true,pos:[90,100]});
  assert.equal(window.syncSceneForceAnchors(task,{forces:[force]},true),false);
  assert.deepEqual(JSON.parse(JSON.stringify(initial.anchorSpec)),{type:'custom',pos:[10,20]});
  assert.deepEqual(Array.from(force.anchor),[10,20]);
});

test('temporarily invalid existing intersection point keeps its force reference', () => {
  const {window, task, force, initial} = setup();
  const point={id:'point-test',pos:[40,50],type:'intersection'};
  window.sceneModel.resolveAnchor = () => ({
    valid:false,pos:[40,50],point,reason:'Skjæringen finnes ikke akkurat nå'
  });
  assert.equal(window.syncSceneForceAnchors(task, {forces:[force]}, true),true);
  assert.deepEqual(JSON.parse(JSON.stringify(initial.anchorSpec)),
    {type:'point',ref:'point-test',point:'center'});
  assert.deepEqual(Array.from(force.anchor),[40,50]);
  assert.deepEqual(Array.from(force.arrowBase),[45,50]);
  assert.deepEqual(Array.from(force.arrowTip),[45,110]);
  assert.deepEqual(Array.from(initial.anchor),[40,50]);
});

test('deleted-anchor detachment stays at its saved position and does not reopen the picker', () => {
  const {window, task, force, initial} = setup();
  initial.anchorSpec = {type:'custom', pos:[10,20], detachedReason:'Kildegeometrien ble slettet.'};
  assert.equal(window.syncSceneForceAnchors(task, {forces:[force]}, true), true);
  assert.equal(initial.anchorSpec.type, 'custom');
  assert.deepEqual(Array.from(initial.anchorSpec.pos), [10,20]);
  assert.equal(initial.anchorSpec.detachedReason, undefined);
  assert.equal(window.pendingForceAnchorPickerIndices,undefined);
  delete window.pendingForceAnchorPickerIndices;
  assert.equal(window.syncSceneForceAnchors(task, {forces:[force]}, true), false);
});

test('legacy initial force anchorFrom is cleared when its source is missing', () => {
  const {window,task,force,initial}=setup();
  initial.anchorSpec=undefined;
  initial.anchorFrom='deleted-point';
  initial.anchor='source-coordinate';
  window.sceneModel.resolveAnchor=()=>({valid:false,pos:[10,20],reason:'Punktankeret finnes ikke.'});
  assert.equal(window.syncSceneForceAnchors(task,{forces:[force]},false),true);
  assert.deepEqual(JSON.parse(JSON.stringify(initial.anchorSpec)),{type:'custom',pos:[10,20]});
  assert.equal(initial.anchorFrom,undefined);
  assert.deepEqual(Array.from(initial.anchor),[10,20]);
});

test('canvas coordinates account for scrolling and CSS scaling', () => {
  const {window} = setup();
  const canvas = {
    width: 1400, height: 1040,
    getBoundingClientRect: () => ({left: -100, top: -40, width: 700, height: 520})
  };
  const context = {window, document: {getElementById: () => canvas}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'shared.js'), 'utf8'), context);
  assert.deepEqual(Array.from(window.getMousePos({clientX: 150, clientY: 160})), [300, 200]);
});
