// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for the optimal (maximum-weight matching) pairing algorithm.
// Reproduces the two worked examples from docs/matching-optimality-design.md
// that the greedy matcher gets wrong.
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { pairBoxers, pairBoxersOptimal, pairAll, checkMatchingRisks } = require('../SparMaker');

let _id = 0;
function bx(weight, over = {}) {
    ++_id;
    return { id: _id, name: `B${_id}`, club: `Club${_id}`, gender: 'male',
             yob: 2000, fit: true, weight, experience: 0, ...over };
}

// --- pairBoxersOptimal (function level) --------------------------------------

test('optimal: seed-255 stranding case — all four boxers pair (greedy strands one)', () => {
    // docs/matching-optimality-design.md (A): 63.5, 65.7, 67.4, 67.4.
    // Greedy pairs 65.7-67.4 first, stranding 63.5 (its only ±2.5 partner is gone).
    // Optimal at ±2.5 finds 63.5-65.7 + 67.4-67.4 → everyone spars.
    const boxers = [bx(63.5), bx(65.7), bx(67.4), bx(67.4)];
    const { matches, unmatched } = pairBoxersOptimal(boxers, 'Female', 2.5);
    assert.equal(matches.length, 2, 'two pairs formed');
    assert.equal(unmatched.length, 0, 'nobody stranded');
    const pairKey = m => [m.red.weight, m.blue.weight].sort((a, b) => a - b).join('-');
    assert.deepEqual(matches.map(pairKey).sort(), ['63.5-65.7', '67.4-67.4']);
});

test('optimal: unambiguous case agrees with greedy exactly', () => {
    // One unique best pairing — both algorithms must produce it.
    const mk = () => [bx(70), bx(70.5), bx(80), bx(80.5)];
    const key = m => [m.red.weight, m.blue.weight].sort((a, b) => a - b).join('-');
    const g = pairBoxers(mk(), 'Cat', 2.5);
    const o = pairBoxersOptimal(mk(), 'Cat', 2.5);
    assert.deepEqual(o.matches.map(key).sort(), g.matches.map(key).sort());
    assert.equal(o.unmatched.length, 0);
    assert.equal(g.unmatched.length, 0);
});

test('optimal: prefers different-club when weight ties', () => {
    // 70(ClubX), 70(ClubX), 70(ClubY), 70(ClubY): all zero-diff. Optimal must
    // cross clubs (score +5 per cross-club edge → two cross pairs beat two same-club).
    const boxers = [bx(70, { club: 'X' }), bx(70, { club: 'X' }),
                    bx(70, { club: 'Y' }), bx(70, { club: 'Y' })];
    const { matches } = pairBoxersOptimal(boxers, 'Cat', 2.5);
    assert.equal(matches.length, 2);
    matches.forEach(m => assert.notEqual(m.red.club, m.blue.club, 'cross-club pairing preferred'));
});

test('optimal: non-finite weight boxer goes straight to unmatched, never poisons the solve', () => {
    const nan = bx(NaN);
    const boxers = [bx(70), nan, bx(71)];
    const { matches, unmatched } = pairBoxersOptimal(boxers, 'Cat', 2.5);
    assert.equal(matches.length, 1);
    assert.deepEqual(unmatched.map(b => b.id), [nan.id]);
});

test('optimal: no-rematch — a partneredWith pair is never re-paired', () => {
    const a = bx(70), b = bx(70.2), c = bx(70.4);
    const partnered = new Map([[a, new Set([b])], [b, new Set([a])]]);
    const { matches } = pairBoxersOptimal([a, b, c], 'Cat', 2.5, new Map(), partnered);
    assert.equal(matches.length, 1);
    const pair = matches[0];
    const ids = [pair.red.id, pair.blue.id].sort();
    assert.ok(!(ids[0] === Math.min(a.id, b.id) && ids[1] === Math.max(a.id, b.id)),
        'a-b must not re-pair; one of them pairs with c instead');
});

test('optimal: sparsPerDay=2 boxer gets two distinct opponents via rerun loop', () => {
    // Weights chosen so the first solve deterministically pairs multi-b
    // (0.2 diff beats b-c's 0.4 and multi-c's 0.6 — no score ties):
    // solve 1 → multi-b; solve 2 (multi under cap, c never matched) → multi-c.
    const multi = bx(70, { sparsPerDay: 2 });
    const boxers = [multi, bx(70.2), bx(70.6)];
    const { matches } = pairBoxersOptimal(boxers, 'Cat', 2.5);
    assert.equal(matches.length, 2, 'multi-spar boxer fights twice');
    const opponents = matches.map(m => (m.red === multi ? m.blue : m.red).id);
    assert.equal(new Set(opponents).size, 2, 'two different opponents, no rematch');
});
