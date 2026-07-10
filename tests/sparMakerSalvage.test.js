// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for the "Salvage" pairing algorithm (pairBoxersSalvage + pairAll
// algorithm:'salvage'). Salvage is Phase 4: after the strict within-bucket phases
// it pairs the leftover pool with relaxed rules reverse-engineered from the human's
// hand edits — cross AGE group, keep EXPERIENCE tiers separate, NO weight cap, prefer
// different club, cross GENDER only as a last resort, and respect sparsPerDay.
//
// Run with:  node --test
//
// NOTE: the real roster keeps all females in one tier-less "Female" bucket, so the
// tier rule blocks female↔male salvage in practice. The cross-gender tests below use
// a fabricated tiered female bucket ("FemaleSenior_Novice") purely to exercise the
// Round-B last-resort mechanism in isolation.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { pairBoxersSalvage, pairAll } = require('../SparMaker');

let _id = 0;
// Salvage-pool boxer: carries _bucket (source bucket) so tier/gender are derivable.
function sb(weight, bucket, over = {}) {
    ++_id;
    const gender = over.gender || (bucket.startsWith('Female') ? 'female' : 'male');
    return { id: _id, name: `B${_id}`, club: `Club${_id}`, gender, yob: 2000,
             fit: true, weight, experience: 0, sparsPerDay: 1, _bucket: bucket, ...over };
}
// Plain bucket boxer (no _bucket — pairAll tags it from the bucket key).
function pb(weight, over = {}) {
    ++_id;
    return { id: _id, name: `B${_id}`, club: `Club${_id}`, gender: 'male', yob: 2000,
             fit: true, weight, experience: 0, sparsPerDay: 1, ...over };
}

// --- age crossed, tier kept ------------------------------------------------

test('salvage: crosses age groups within the same tier & gender', () => {
    const a = sb(60, 'MaleYouth_Novice',  { yob: 2009 });   // Youth
    const b = sb(61, 'MaleSenior_Novice', { yob: 2000 });   // Senior, same tier
    const { matches, remaining } = pairBoxersSalvage([a, b], {});
    assert.equal(matches.length, 1, 'cross-age same-tier pair should form');
    assert.equal(remaining.length, 0);
    assert.equal(matches[0].category, 'SALVAGE');
});

test('salvage: keeps experience tiers separate', () => {
    const a = sb(60, 'MaleYouth_Novice');
    const b = sb(60, 'MaleYouth_OpenClass');   // same age/gender, different tier
    const { matches, remaining } = pairBoxersSalvage([a, b], {});
    assert.equal(matches.length, 0, 'different experience tiers must not pair');
    assert.equal(remaining.length, 2);
});

// --- no weight cap ----------------------------------------------------------

test('salvage: no weight cap — pairs however far apart', () => {
    const a = sb(50, 'MaleSenior_Novice');
    const b = sb(90, 'MaleSenior_Novice');     // 40 kg apart, same tier/gender
    const { matches } = pairBoxersSalvage([a, b], {});
    assert.equal(matches.length, 1, 'no weight cap → the only same-tier pair still forms');
    assert.equal(matches[0].weightDiff, '40.00');
});

// --- club avoidance ---------------------------------------------------------

test('salvage: prefers different-club pairings over same-club', () => {
    // a,b share ClubA; c,d share ClubB. Two same-club or two different-club matchings
    // are both size-2; the different-club one must win.
    const a = sb(60,   'MaleSenior_Novice', { club: 'A' });
    const b = sb(60.5, 'MaleSenior_Novice', { club: 'A' });
    const c = sb(61,   'MaleSenior_Novice', { club: 'B' });
    const d = sb(61.5, 'MaleSenior_Novice', { club: 'B' });
    const { matches } = pairBoxersSalvage([a, b, c, d], {});
    assert.equal(matches.length, 2);
    for (const m of matches) {
        assert.notEqual(m.red.club, m.blue.club, 'formed a same-club pair when different-club was possible');
    }
});

// --- gender: last resort ----------------------------------------------------

test('salvage: same-gender preferred, cross-gender only when forced', () => {
    const m1 = sb(60, 'MaleSenior_Novice',   { club: 'A' });
    const m2 = sb(61, 'MaleSenior_Novice',   { club: 'B' });
    const f1 = sb(60, 'FemaleSenior_Novice', { club: 'C' });   // same tier, other gender
    const { matches, remaining } = pairBoxersSalvage([m1, m2, f1], { crossGender: 'lastResort' });
    assert.equal(matches.length, 1, 'the two males pair same-gender first');
    assert.notEqual(matches[0].red.gender, undefined);
    assert.equal(matches[0].red.gender, 'male');
    assert.equal(matches[0].blue.gender, 'male');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, f1.id, 'the lone female is left over, not cross-gender matched');
});

test('salvage: crosses gender as a last resort, or never when disabled', () => {
    const mk = () => [sb(60, 'MaleSenior_Novice', { club: 'A' }), sb(61, 'FemaleSenior_Novice', { club: 'B' })];
    const last = pairBoxersSalvage(mk(), { crossGender: 'lastResort' });
    assert.equal(last.matches.length, 1, 'no same-gender option → cross-gender pair forms');
    assert.notEqual(last.matches[0].red.gender, last.matches[0].blue.gender);

    const never = pairBoxersSalvage(mk(), { crossGender: 'never' });
    assert.equal(never.matches.length, 0, 'crossGender:never leaves them unmatched');
});

// --- capacity ---------------------------------------------------------------

test('salvage: never exceeds a boxer\'s sparsPerDay', () => {
    const pool = [];
    for (let i = 0; i < 12; i++) {
        pool.push(sb(60 + i * 0.3, 'MaleSenior_Novice', { club: 'C' + (i % 5), sparsPerDay: i % 3 === 0 ? 2 : 1 }));
    }
    const { matches } = pairBoxersSalvage(pool, { crossGender: 'lastResort' });
    const count = new Map();
    for (const m of matches) for (const x of [m.red, m.blue]) count.set(x.id, (count.get(x.id) || 0) + 1);
    for (const b of pool) {
        assert.ok((count.get(b.id) || 0) <= b.sparsPerDay, `${b.name} exceeded sparsPerDay`);
    }
});

// --- pairAll integration ----------------------------------------------------

test('salvage via pairAll: rescues cross-age leftovers greedy leaves unmatched', () => {
    // 4 kg apart so the tight ±1kg cross phase does NOT pre-empt — only salvage's
    // no-cap pass can pair them. (tightCross:false also isolates the salvage effect.)
    const mk = () => ({
        MaleYouth_Novice:  [pb(60, { yob: 2009 })],   // 1 in bucket → greedy can't pair
        MaleSenior_Novice: [pb(64, { yob: 2000 })],   // 4 kg away, different age
    });
    const g = pairAll(mk(), { algorithm: 'greedy',  tightCross: false });
    const s = pairAll(mk(), { algorithm: 'salvage', tightCross: false });
    assert.equal(g.unmatched.length, 2, 'greedy leaves both singletons unmatched');
    assert.equal(s.unmatched.length, 0, 'salvage pairs them across age (same tier), no weight cap');
    assert.equal(s.phases.phase4.matches.length, 1, 'one salvage bout recorded in phase 4');
    assert.ok(s.matches.some(m => m.category === 'SALVAGE'));
});

test('salvage via pairAll: does nothing (and adds no phase-4 bouts) when all are matched', () => {
    const mk = () => ({ Cat: [pb(70), pb(70.5), pb(80), pb(80.5)] });
    const g = pairAll(mk(), { algorithm: 'greedy' });
    const s = pairAll(mk(), { algorithm: 'salvage' });
    assert.equal(g.unmatched.length, 0);
    assert.equal(s.unmatched.length, 0);
    assert.equal(s.phases.phase4.matches.length, 0, 'no salvage bouts when nobody is left over');
});
