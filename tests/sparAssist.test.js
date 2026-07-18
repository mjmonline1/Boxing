'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const A = require('../spar-assist');

// Tiny roster. yob drives the minor<->adult safety line at a fixed reference year (2026).
const YEAR = 2026;
const roster = [
  { id: 1, name: 'Amy',  club: 'Red',  gender: 'female', yob: 2010, fit: true,  weight: 50, sparsPerDay: 1, category: 'Female' },       // age 16 minor
  { id: 2, name: 'Bea',  club: 'Blue', gender: 'female', yob: 2011, fit: true,  weight: 51, sparsPerDay: 1, category: 'Female' },       // age 15 minor
  { id: 3, name: 'Cara', club: 'Red',  gender: 'female', yob: 2000, fit: true,  weight: 62, sparsPerDay: 2, category: 'Senior' },       // age 26 adult
  { id: 4, name: 'Dan',  club: 'Blue', gender: 'male',   yob: 2005, fit: true,  weight: 63, sparsPerDay: 1, category: 'MaleSenior_Novice' }, // adult
  { id: 5, name: 'Eve',  club: 'Red',  gender: 'female', yob: 2012, fit: false, weight: 49, sparsPerDay: 1, category: 'Female' },       // unfit -> excluded
];

test('unmatchedPool: excludes unfit, respects sparsPerDay capacity', () => {
  const matches = [{ red: roster[0], blue: roster[1] }]; // Amy & Bea each at load 1 (cap 1) -> full
  const pool = A.unmatchedPool(roster, matches);
  const names = pool.map(p => p.boxer.name).sort();
  // Amy, Bea full; Eve unfit; Cara (cap 2, load 0) and Dan (cap 1, load 0) remain.
  assert.deepStrictEqual(names, ['Cara', 'Dan']);
  assert.strictEqual(pool.find(p => p.boxer.name === 'Cara').remaining, 2);
});

test('unmatchedPool: a cap-2 boxer already in one bout still has remaining capacity', () => {
  const matches = [{ red: roster[2], blue: roster[3] }]; // Cara(cap2) load1 -> remaining 1; Dan full
  const pool = A.unmatchedPool(roster, matches).map(p => p.boxer.name).sort();
  assert.ok(pool.includes('Cara'));
  assert.ok(!pool.includes('Dan'));
});

test('flagsFor: reports every advisory break, blocks nothing', () => {
  const f = A.flagsFor(roster[1], roster[3], { year: YEAR }); // Bea(minor,F,Blue,51) vs Dan(adult,M,Blue,63)
  assert.strictEqual(f.overWeightRule, true);   // 12kg gap
  assert.strictEqual(f.crossGender, true);
  assert.strictEqual(f.sameClub, true);
  assert.strictEqual(f.minorAdult, true);       // safety line crossed
  assert.strictEqual(f.crossCategory, true);
});

test('rankCandidates: NEVER filters — minor↔adult present but ranked last with its flag', () => {
  const pool = A.unmatchedPool(roster, []); // everyone fit & free
  const ranked = A.rankCandidates(roster[0], pool, { year: YEAR }); // candidates for Amy (minor)
  const names = ranked.map(r => r.boxer.name);
  // All other fit boxers appear — nobody excluded for breaking a rule.
  assert.deepStrictEqual(names.sort(), ['Bea', 'Cara', 'Dan']);
  // Bea (closest weight, same age-class) ranks first; the adults (minorAdult) sink to the bottom.
  assert.strictEqual(ranked[0].boxer.name, 'Bea');
  assert.ok(ranked[ranked.length - 1].flags.minorAdult, 'an adult (minorAdult) is ranked last');
});

test('rankCandidates: no same-day rematch by default; allowRematch re-includes', () => {
  // Both cap-2 so each still has capacity after their first bout together.
  const P = { id: 10, name: 'P', club: 'X', gender: 'male', yob: 2000, fit: true, weight: 60, sparsPerDay: 2, category: 'MaleSenior_Novice' };
  const Q = { id: 11, name: 'Q', club: 'Y', gender: 'male', yob: 2000, fit: true, weight: 61, sparsPerDay: 2, category: 'MaleSenior_Novice' };
  const matches = [{ red: P, blue: Q }];       // P & Q already sparred; both remaining 1
  const pool = A.unmatchedPool([P, Q], matches);
  assert.strictEqual(pool.length, 2, 'both still have capacity');
  const def = A.rankCandidates(P, pool, { year: YEAR, matches });
  assert.ok(!def.some(r => r.boxer.name === 'Q'), 'Q excluded as a rematch by default');
  const re = A.rankCandidates(P, pool, { year: YEAR, matches, allowRematch: true });
  assert.ok(re.some(r => r.boxer.name === 'Q'), 'allowRematch re-includes Q');
});

test('rankBouts: ranks existing bouts to add a fighter, closest fit first, never filters', () => {
  const matches = [
    { sparId: 'S1', red: roster[0], blue: roster[1] },  // Amy 50 / Bea 51  -> add Cara(62): worst gap 12
    { sparId: 'S2', red: roster[2], blue: roster[3] },  // Cara 62 / Dan 63
  ];
  // Add Dan(63) to bouts. S2 already contains Dan -> skipped. S1 remains (worst gap vs 50/51 = 13).
  const ranked = A.rankBouts(roster[3], matches, { year: YEAR });
  assert.strictEqual(ranked.length, 1, 'the bout Dan is already in is skipped');
  assert.strictEqual(ranked[0].sparId, 'S1');
  assert.ok(ranked[0].flags.overWeightRule, 'adding a 63kg to a 50/51 pair breaks the rule (advisory)');
  assert.strictEqual(ranked[0].flags.minorAdult, true, 'Dan(adult) joining Amy/Bea(minors) trips the safety flag');
});

test('boutFlagsFor: weightGap is the worst NEW gap the added fighter introduces', () => {
  const bout = { sparId: 'S1', red: roster[0], blue: roster[1] }; // 50 / 51
  const f = A.boutFlagsFor(roster[2], bout, { year: YEAR });       // add Cara 62
  assert.strictEqual(f.weightGap, 12);   // max(|62-50|, |62-51|) = 12
});

test('isMinor: under-18 by reference year; missing yob is not a minor', () => {
  assert.strictEqual(A.isMinor({ yob: 2010 }, YEAR), true);
  assert.strictEqual(A.isMinor({ yob: 2005 }, YEAR), false);
  assert.strictEqual(A.isMinor({}, YEAR), false);
});
