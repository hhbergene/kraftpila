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
  window.sceneModel = {resolveAnchor: () => ({pos: [40, 50], valid: true})};
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

test('invalid intersection anchor uses its last valid position', () => {
  const {window, task, force} = setup();
  window.sceneModel.resolveAnchor = () => ({pos: [30, 40], valid: false, reason: 'Skjæringen finnes ikke'});
  window.syncSceneForceAnchors(task, {forces: [force]}, true);
  assert.deepEqual(Array.from(force.anchor), [30, 40]);
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
  const {window, task, force} = setup();
  window.sceneModel.resolveAnchor = () => ({valid: false, reason: 'Anker finnes ikke'});
  assert.equal(window.syncSceneForceAnchors(task, {forces: [force]}, true), false);
  assert.deepEqual(force.anchor, [10, 20]);
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
