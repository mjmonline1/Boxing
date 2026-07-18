'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const RigDiff = require('../rig/diff');
const { loadDay, listDays, diffAll } = require('../rig/load-day');

// ── Unit: classification on hand-built bouts ─────────────────────────────────
test('diffBouts: kept / grew / added / dropped', () => {
  const auto = RigDiff.normalizeAuto({
    phase1Bouts: [
      { red: 'A', redWeight: 60, blue: 'B', blueWeight: 61, category: 'X' }, // kept
      { red: 'C', redWeight: 62, blue: 'D', blueWeight: 63, category: 'X' }, // grew (C,D -> C,D,E)
      { red: 'F', redWeight: 70, blue: 'G', blueWeight: 71, category: 'Y' }, // dropped
    ],
  });
  const final = RigDiff.normalizeFinal([
    { red: { name: 'A', weight: 60 }, blue: { name: 'B', weight: 61 }, category: 'X' },                       // == kept
    { red: { name: 'C', weight: 62 }, blue: { name: 'D', weight: 63 }, third: { name: 'E', weight: 64 }, category: 'X' }, // grew
    { red: { name: 'H', weight: 55 }, blue: { name: 'I', weight: 56 }, category: 'Z' },                       // added
  ]);
  const { stats } = RigDiff.diffBouts(auto, final);
  assert.strictEqual(stats.kept, 1);
  assert.strictEqual(stats.grew, 1);
  assert.strictEqual(stats.dropped, 1);
  assert.strictEqual(stats.added, 1);
  assert.strictEqual(stats.droppedStrict, 2, 'a grown pair counts as dropped in the strict/§3 view');
});

test('normalizeAuto: reads name-string phaseLog bouts and trios; ignores half-open', () => {
  const a = RigDiff.normalizeAuto({
    phase1Bouts: [{ red: 'A', redWeight: 60, blue: 'B', blueWeight: 61, category: 'X' }],
    phase3Groups: [{ groupId: 'g1', red: 'C', redWeight: 62, blue: 'D', blueWeight: 63, third: 'E', thirdWeight: 64, category: 'X' }],
  });
  assert.strictEqual(a.length, 2);
  assert.strictEqual(a[1].kind, 'trio');
  assert.deepStrictEqual(a[0].members.map(m => m.name).sort(), ['A', 'B']);
});

// ── Gate: reproduce the §3 baseline over Jul 6–10 from the real fixture files ──
// This is the correctness lock for the loader + diff. §3 (measured by the coach): auto 167,
// survived 66 (40%) strict, dropped 101 strict. If loader/diff drift, this fails loudly.
test('§3 baseline: Jul 6–10 aggregate = auto 167 / kept 66 (40%) / dropped-strict 101', () => {
  const window = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'];
  const present = window.filter(d => loadDay(d));
  if (present.length < window.length) {
    // Fixtures not fully present in this checkout — don't fail the suite, just skip the gate.
    console.warn(`[rig gate] skipped: only ${present.length}/5 baseline days present`);
    return;
  }
  const { agg } = diffAll({ dates: window });
  assert.strictEqual(agg.auto, 167, 'auto proposal count');
  assert.strictEqual(agg.kept, 66, 'exact survivors');
  assert.strictEqual(agg.droppedStrict, 101, 'dropped (grew folded in, §3 convention)');
  assert.strictEqual(agg.grew, 17, 'pairs the coach grew into trios');
  assert.strictEqual(Math.round(agg.survivalRateStrict * 100), 40, 'survival rate %');
  // §3 strict view folds grew both ways: dropped 101 AND added = 96 + 17 = 113 (the coach's adds).
  assert.strictEqual(agg.added + agg.grew, 113, 'coach-added bouts, §3 strict');
});

test('listDays: separates diffable (has phaseLog) from final-only', () => {
  const { diffable, finalOnly } = listDays();
  assert.ok(diffable.includes('2026-07-06'), 'Jul-06 has phaseLog');
  // Older exports (pre-phaseLog) are final-only, if present.
  assert.ok(Array.isArray(finalOnly));
});
