// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for the optimal (maximum-weight matching) pairing algorithm.
// Reproduces the two worked examples from docs/matching-optimality-design.md
// that the greedy matcher gets wrong.
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { pairBoxers, pairBoxersOptimal, pairBoxersSalvage, pairAll, checkMatchingRisks } = require('../SparMaker');

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

// --- pairAll dispatch ---------------------------------------------------------

test('pairAll algorithm=optimal: seed-255 bucket fully paired; greedy control strands one', () => {
    const mk = () => ({ Female: [bx(63.5), bx(65.7), bx(67.4), bx(67.4)] });
    const opt = pairAll(mk(), { algorithm: 'optimal' });
    assert.equal(opt.unmatched.length, 0, 'optimal: nobody unmatched');
    assert.equal(opt.matches.length, 2);
    const greedy = pairAll(mk());
    assert.equal(greedy.unmatched.length, 1, 'greedy control: 63.5 stranded (or folded check)');
});

test('pairAll algorithm=optimal: over-spread trio never forms (doc case 70/72 + 73.9)', () => {
    // Greedy folds 73.9 onto the 70/72 pair → an internal 3.9 kg bout.
    // Optimal must not ship any trio with an internal diff above tol2.
    const r = pairAll({ Cat: [bx(70.0), bx(72.0), bx(73.9)] }, { algorithm: 'optimal' });
    const { overSpreadTrios } = checkMatchingRisks(r.matches, r.unmatched);
    assert.equal(overSpreadTrios.length, 0, 'no over-spread trio under optimal');
    // The trio is rejected (70↔73.9 = 3.9 > 2.5): one clean pair + one unmatched.
    assert.equal(r.matches.length, 1);
    assert.equal(r.unmatched.length, 1);
});

test('pairAll algorithm=optimal: trio-fold still forms valid trios (all three diffs in tolerance)', () => {
    // 70, 71, 72: optimal pairs two, the leftover is within 2.5 of BOTH members
    // and the pair diff is fine → a legal trio forms at maxPhase 3.
    const r = pairAll({ Cat: [bx(70), bx(71), bx(72)] }, { algorithm: 'optimal' });
    assert.equal(r.matches.length, 1);
    assert.ok(r.matches[0].third, 'leftover folded into a round-robin trio');
    assert.equal(r.unmatched.length, 0);
    const { overSpreadTrios } = checkMatchingRisks(r.matches, r.unmatched);
    assert.equal(overSpreadTrios.length, 0);
});

test('pairAll algorithm=optimal: maxPhase<3 skips the trio-fold', () => {
    const r = pairAll({ Cat: [bx(70), bx(71), bx(72)] }, { algorithm: 'optimal', maxPhase: 1 });
    assert.equal(r.matches.length, 1);
    assert.ok(!r.matches[0].third);
    assert.equal(r.unmatched.length, 1);
});

test('pairAll algorithm=optimal: phaseLog shape — combined pass under phase1, phase2 empty', () => {
    const r = pairAll({ Cat: [bx(70), bx(71)] }, { algorithm: 'optimal' });
    assert.equal(r.phases.phase1.matches.length, 1);
    assert.equal(r.phases.phase2.matches.length, 0, 'optimal never populates phase 2');
});

test('pairAll algorithm=optimal: manualMatch and NaN-weight behave identically to greedy', () => {
    const held = bx(70.2, { autoMatch: 'no' });
    const nan  = bx(NaN);
    const r = pairAll({ Cat: [bx(70), held, bx(70.4), nan] }, { algorithm: 'optimal' });
    assert.deepEqual(r.manualMatch.map(b => b.id), [held.id], 'autoMatch=no held out');
    assert.ok(r.unmatched.some(b => b.id === nan.id), 'NaN weight unmatched');
    assert.equal(r.matches.length, 1, 'remaining two pair normally');
});

test('pairAll: matched-count invariant — optimal never matches fewer boxers than greedy', () => {
    const fixtures = [
        () => ({ A: [bx(63.5), bx(65.7), bx(67.4), bx(67.4)] }),                  // stranding case
        () => ({ A: [bx(70), bx(71), bx(72)] }),                                   // trio case
        () => ({ A: [bx(50), bx(51.8), bx(53.6), bx(55.4)], B: [bx(90), bx(99)] }), // chain + hopeless
    ];
    const countMatched = r => r.matches.reduce((n, m) => n + (m.third ? 3 : 2), 0);
    for (const mk of fixtures) {
        const o = countMatched(pairAll(mk(), { algorithm: 'optimal' }));
        const g = countMatched(pairAll(mk()));
        assert.ok(o >= g, `optimal (${o}) must match at least as many boxers as greedy (${g})`);
    }
});

test('pairAll: omitted algorithm defaults to greedy (byte-identical baseline)', () => {
    const mk = () => ({ Cat: [bx(70), bx(71.5), bx(74), bx(76.6)] });
    const def = pairAll(mk());
    const g   = pairAll(mk(), { algorithm: 'greedy' });
    assert.deepEqual(
        def.matches.map(m => `${m.red.weight}-${m.blue.weight}`),
        g.matches.map(m => `${m.red.weight}-${m.blue.weight}`));
});

// --- adjustable trio-fold tolerance (trioTol) ---------------------------------

test('pairAll optimal: default trioTol=2.0 rejects a trio in the 2.0-2.5 band (zero over-spread guarantee)', () => {
    // Reviewer's case: optimal pairs 72.3/72.4; leftover 70.0 is 2.3/2.4 from
    // the members — above the default 2.0 fold tolerance, so NO trio forms.
    const r = pairAll({ Cat: [bx(70.0), bx(72.3), bx(72.4)] }, { algorithm: 'optimal' });
    assert.equal(r.matches.length, 1);
    assert.ok(!r.matches[0].third, 'no trio at default trioTol');
    assert.equal(r.unmatched.length, 1);
    const { overSpreadTrios } = checkMatchingRisks(r.matches, r.unmatched);
    assert.equal(overSpreadTrios.length, 0);
});

test('pairAll optimal: trioTol=2.5 admits that same trio (and matchRisks reports it, by design)', () => {
    const r = pairAll({ Cat: [bx(70.0), bx(72.3), bx(72.4)] }, { algorithm: 'optimal', trioTol: 2.5 });
    assert.equal(r.matches.length, 1);
    assert.ok(r.matches[0].third, 'trio forms at trioTol=2.5');
    assert.equal(r.unmatched.length, 0);
    const { overSpreadTrios } = checkMatchingRisks(r.matches, r.unmatched);
    assert.equal(overSpreadTrios.length, 1, 'over-2.0 trio is surfaced in the risk report');
});

test('pairAll greedy: trioTol option is ignored — greedy fold unchanged at tol1', () => {
    const mk = () => ({ Cat: [bx(70.0), bx(72.0), bx(73.9)] });
    const a = pairAll(mk());
    const b = pairAll(mk(), { trioTol: 2.5 });
    assert.deepEqual(
        a.matches.map(m => [m.red.weight, m.blue.weight, m.third?.weight ?? null]),
        b.matches.map(m => [m.red.weight, m.blue.weight, m.third?.weight ?? null]));
});

// --- Regression (real-roster bug, 2026-07): sparsPerDay>1 double-count -------
// Same bug class as pairBoxers (see sparMaker.test.js #25), fixed in pairBoxersOptimal
// and pairBoxersSalvage by only leftover-ing boxers with zero matches THIS call.

test('optimal: sparsPerDay=2 boxer matched once, no 2nd opponent, is not double-counted', () => {
    const boxers = [bx(70, { sparsPerDay: 2 }), bx(70.5, { sparsPerDay: 1 })];
    const { matches, unmatched } = pairBoxersOptimal(boxers, 'Cat', 2.0);
    assert.equal(matches.length, 1, 'the two pair once');
    assert.equal(unmatched.length, 0, 'the cap-2 boxer already sparred — not also unmatched');
});

test('salvage: sparsPerDay=2 boxer matched once, no 2nd opponent, is not double-counted', () => {
    const pool = [
        bx(70, { sparsPerDay: 2, _bucket: 'MaleSenior_Novice' }),
        bx(70.5, { sparsPerDay: 1, _bucket: 'MaleSenior_Novice' }),
    ];
    const { matches, remaining } = pairBoxersSalvage(pool);
    assert.equal(matches.length, 1, 'the two pair once');
    assert.equal(remaining.length, 0, 'the cap-2 boxer already sparred — not also remaining');
});
