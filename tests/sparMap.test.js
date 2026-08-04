// Copyright (c) 2026 ITLR Assets. All rights reserved.
const test = require('node:test');
const assert = require('node:assert');
const SparMap = require('../spar-map');

const boxers = [
  { id: 1, name: 'A', gender: 'male',   weight: 52, experience: 3 },
  { id: 2, name: 'B', gender: 'male',   weight: 54, experience: 20 },
  { id: 3, name: 'C', gender: 'female', weight: 51, experience: 4 },
  { id: 4, name: 'D', gender: 'female', weight: 60, experience: 8 },
];
const byGender = b => b.gender === 'female' ? 'Female' : 'Male';
const byExp    = b => b.experience <= 5 ? '0–5 bouts' : '6+ bouts';

test('layout: one hub per band, every node anchored', () => {
  const { hubs, anchors } = SparMap.layout(boxers, byGender, null, 1000, 600);
  assert.strictEqual(hubs.length, 2);
  assert.strictEqual(anchors.size, 4);
  const female = hubs.find(h => h.label === 'Female');
  const male   = hubs.find(h => h.label === 'Male');
  assert.strictEqual(female.count, 2);
  assert.notStrictEqual(Math.round(female.x), Math.round(male.x)); // hubs apart
});

test('layout: secondary grouper makes sub-hubs with distinct anchors', () => {
  const { hubs, anchors } = SparMap.layout(boxers, byGender, byExp, 1000, 600);
  assert.strictEqual(hubs.filter(h => h.sub).length, 4); // 2 exp bands per gender here
  const a1 = anchors.get(boxers[0]), a2 = anchors.get(boxers[1]); // same gender, diff exp
  assert.ok(Math.hypot(a1.x - a2.x, a1.y - a2.y) > 10);
});

test('band labels sort numerically, not alphabetically', () => {
  const g = SparMap.groupBy(
    [{ e: '6–15' }, { e: '0–5' }, { e: '31+' }, { e: '16–30' }],
    x => x.e);
  assert.deepStrictEqual([...g.keys()], ['0–5', '6–15', '16–30', '31+']);
});

test('tapResult: click on empty clears selection', () => {
  const r = SparMap.tapResult({ x: 10, y: 10 }, { x: 11, y: 11 }, null, 5);
  assert.deepStrictEqual(r, { action: 'clear', selectedId: null });
});

test('tapResult: click same node toggles off', () => {
  const r = SparMap.tapResult({ x: 10, y: 10 }, { x: 10, y: 10 }, 7, 7);
  assert.deepStrictEqual(r, { action: 'clear', selectedId: null });
});

test('tapResult: click a different node switches straight to it', () => {
  const r = SparMap.tapResult({ x: 10, y: 10 }, { x: 12, y: 11 }, 8, 3);
  assert.deepStrictEqual(r, { action: 'select', selectedId: 8 });
});

test('tapResult: movement past slop is a drag, selection unchanged', () => {
  const r = SparMap.tapResult({ x: 10, y: 10 }, { x: 40, y: 10 }, 8, 3);
  assert.deepStrictEqual(r, { action: 'drag', selectedId: 3 });
});

test('tapResult: tiny tremor under slop still selects (the jitter bug)', () => {
  const r = SparMap.tapResult({ x: 100, y: 100 }, { x: 102, y: 101 }, 9, null, 4);
  assert.deepStrictEqual(r, { action: 'select', selectedId: 9 });
});

test('simStep pulls nodes toward their anchor; pinned nodes stay put', () => {
  const nodes = [
    { id: 1, x: 0, y: 0, vx: 0, vy: 0 },
    { id: 2, x: 900, y: 500, vx: 0, vy: 0, pinned: true },
  ];
  const anchors = new Map([[nodes[0], { x: 500, y: 300 }], [nodes[1], { x: 0, y: 0 }]]);
  const before = Math.hypot(500 - nodes[0].x, 300 - nodes[0].y);
  for (let i = 0; i < 60; i++) SparMap.simStep(nodes, anchors);
  const after = Math.hypot(500 - nodes[0].x, 300 - nodes[0].y);
  assert.ok(after < before / 2, `node did not converge: ${after}`);
  assert.strictEqual(nodes[1].x, 900); // pinned untouched
});
