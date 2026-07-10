// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for the tight cross-bucket phase (Phase 2c) — pairAll option tightCross.
// After phase 2, leftover fighters within ±1 kg are paired ACROSS age groups while
// experience tier and gender are kept. It reuses the salvage matcher with a weight
// cap, runs for every algorithm, and its bouts carry category 'CROSS'.
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { pairAll } = require('../SparMaker');

let _id = 0;
function pb(weight, over = {}) {
    ++_id;
    return { id: _id, name: `B${_id}`, club: `Club${_id}`, gender: 'male', yob: 2000,
             fit: true, weight, experience: 0, sparsPerDay: 1, ...over };
}

test('tightCross: pairs ≤1kg leftovers across age within the same tier', () => {
    const mk = () => ({
        MaleYouth_Novice:  [pb(60,   { yob: 2009 })],
        MaleSenior_Novice: [pb(60.5, { yob: 2000 })],   // 0.5 kg away, different age, same tier
    });
    const r = pairAll(mk(), { algorithm: 'greedy' });   // tightCross defaults on
    assert.equal(r.unmatched.length, 0);
    assert.equal(r.phases.phaseCross.matches.length, 1, 'one tight cross-bucket bout');
    const cross = r.matches.filter(m => m.category === 'CROSS');
    assert.equal(cross.length, 1);
    assert.equal(cross[0].weightDiff, '0.50');
});

test('tightCross: does NOT pair leftovers more than 1kg apart', () => {
    const mk = () => ({
        MaleYouth_Novice:  [pb(60, { yob: 2009 })],
        MaleSenior_Novice: [pb(62, { yob: 2000 })],   // 2 kg away → over the ±1kg cap
    });
    const r = pairAll(mk(), { algorithm: 'greedy' });
    assert.equal(r.phases.phaseCross.matches.length, 0);
    assert.equal(r.unmatched.length, 2);
});

test('tightCross: keeps experience tiers separate', () => {
    const mk = () => ({
        MaleYouth_Novice:    [pb(60)],
        MaleYouth_OpenClass: [pb(60.5)],   // 0.5 kg but a different tier
    });
    const r = pairAll(mk(), { algorithm: 'greedy' });
    assert.equal(r.phases.phaseCross.matches.length, 0, 'different tiers must not pair');
    assert.equal(r.unmatched.length, 2);
});

test('tightCross: keeps genders separate', () => {
    const mk = () => ({
        MaleSenior_Novice:   [pb(60)],
        FemaleSenior_Novice: [pb(60.5, { gender: 'female' })],   // 0.5 kg, same tier, other gender
    });
    const r = pairAll(mk(), { algorithm: 'greedy' });
    assert.equal(r.phases.phaseCross.matches.length, 0, 'tight phase never crosses gender');
    assert.equal(r.unmatched.length, 2);
});

test('tightCross: can be disabled with tightCross:false', () => {
    const mk = () => ({
        MaleYouth_Novice:  [pb(60,   { yob: 2009 })],
        MaleSenior_Novice: [pb(60.5, { yob: 2000 })],
    });
    const on  = pairAll(mk(), { algorithm: 'greedy', tightCross: true });
    const off = pairAll(mk(), { algorithm: 'greedy', tightCross: false });
    assert.equal(on.unmatched.length, 0, 'on → the ≤1kg cross pair forms');
    assert.equal(off.unmatched.length, 2, 'off → both stay unmatched');
});

test('tightCross: runs for every algorithm (e.g. randomSelect)', () => {
    const mk = () => ({
        MaleYouth_Novice:  [pb(60,   { yob: 2009 })],
        MaleSenior_Novice: [pb(60.5, { yob: 2000 })],
    });
    const r = pairAll(mk(), { algorithm: 'randomSelect' });
    assert.equal(r.phases.phaseCross.matches.length, 1);
    assert.equal(r.unmatched.length, 0);
});
