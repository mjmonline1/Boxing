// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Verifies RingAssigner.js allocates bouts to rings correctly: eligibility rules
// (females -> R5 only, seniors never in R5), load balancing, bout durations, and
// slot building (no ring double-booked, every match scheduled exactly once).
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
    RINGS_OPEN, RINGS_ALL,
    isBothSeniorMale, hasFemale, isR5Eligible,
    distributeBalanced, distributeGrouped,
    isSeniorBout, boutDuration, buildSlots,
} = require('../RingAssigner');

// --- fixtures --------------------------------------------------------------

let _id = 0;
function bx(over = {}) {
    return { name: `B${++_id}`, club: 'ClubA', gender: 'male',
             yob: 2000, weight: 70, ...over };
}
function match(over = {}) {
    const { red, blue, third, ...rest } = over;
    return {
        sparId: `S${++_id}`, category: 'Cat', weightDiff: '1.00',
        red:  red  || bx(),
        blue: blue || bx(),
        third: third || null,
        ...rest,
    };
}

const seniorM = (o) => bx({ gender: 'male',   yob: 2000, ...o });
const juniorM = (o) => bx({ gender: 'male',   yob: 2010, ...o });
const youthM  = (o) => bx({ gender: 'male',   yob: 2008, ...o });
const female  = (o) => bx({ gender: 'female', yob: 2000, ...o });

// --- classifiers -----------------------------------------------------------

test('hasFemale detects a female in any corner', () => {
    assert.equal(hasFemale(match({ red: female() })), true);
    assert.equal(hasFemale(match({ blue: female() })), true);
    assert.equal(hasFemale(match({ red: seniorM(), blue: seniorM(), third: female() })), true);
    assert.equal(hasFemale(match({ red: seniorM(), blue: juniorM() })), false);
});

test('isBothSeniorMale requires all corners male and yob<=2007', () => {
    assert.equal(isBothSeniorMale(match({ red: seniorM(), blue: seniorM() })), true);
    assert.equal(isBothSeniorMale(match({ red: seniorM(), blue: juniorM() })), false);
    assert.equal(isBothSeniorMale(match({ red: seniorM(), blue: female() })), false);
});

test('isR5Eligible: every corner female or junior male (yob>=2009)', () => {
    assert.equal(isR5Eligible(match({ red: juniorM(), blue: juniorM() })), true);
    assert.equal(isR5Eligible(match({ red: female(),  blue: juniorM() })), true);
    assert.equal(isR5Eligible(match({ red: juniorM(), blue: youthM() })), false); // youth 2008
    assert.equal(isR5Eligible(match({ red: juniorM(), blue: seniorM() })), false);
});

// --- distributeBalanced ----------------------------------------------------

test('balanced: female bouts go to R5 only', () => {
    const matches = Array.from({ length: 6 }, () => match({ red: female(), blue: female() }));
    const q = distributeBalanced(matches);
    assert.equal(q.R5.length, 6);
    RINGS_OPEN.forEach(r => assert.equal(q[r].length, 0, `${r} must be empty`));
});

test('balanced: senior/youth bouts never land in R5', () => {
    const matches = [
        ...Array.from({ length: 4 }, () => match({ red: seniorM(), blue: seniorM() })),
        ...Array.from({ length: 4 }, () => match({ red: youthM(),  blue: youthM() })),
    ];
    const q = distributeBalanced(matches);
    assert.equal(q.R5.length, 0, 'R5 must stay empty for seniors/youth');
    assert.equal(RINGS_OPEN.reduce((n, r) => n + q[r].length, 0), 8);
});

test('balanced: junior-male load spread across all five rings, evenly', () => {
    const matches = Array.from({ length: 10 }, () => match({ red: juniorM(), blue: juniorM() }));
    const q = distributeBalanced(matches);
    RINGS_ALL.forEach(r => assert.equal(q[r].length, 2, `${r} should hold 2`));
});

// --- distributeGrouped -----------------------------------------------------

test('grouped: seniors -> R1/R2, females -> R5', () => {
    const matches = [
        ...Array.from({ length: 4 }, () => match({ red: seniorM(), blue: seniorM() })),
        ...Array.from({ length: 3 }, () => match({ red: female(),  blue: female() })),
    ];
    const q = distributeGrouped(matches);
    assert.equal(q.R5.length, 3, 'all females in R5');
    assert.equal(q.R1.length + q.R2.length, 4, 'seniors packed into R1/R2');
    assert.equal(q.R3.length + q.R4.length, 0);
});

// --- bout duration ---------------------------------------------------------

test('boutDuration: senior=11, youth/junior=8, round-robin group x3', () => {
    assert.equal(isSeniorBout(match({ red: seniorM(), blue: seniorM() })), true);
    assert.equal(boutDuration(match({ red: seniorM(), blue: seniorM() })), 11);
    assert.equal(boutDuration(match({ red: juniorM(), blue: juniorM() })), 8);
    assert.equal(boutDuration(match({ red: youthM(),  blue: youthM() })), 8);
    // a group of three seniors: 11 * 3
    assert.equal(boutDuration(match({ red: seniorM(), blue: seniorM(), third: seniorM() })), 33);
});

// --- buildSlots invariants -------------------------------------------------

test('buildSlots: no ring double-booked in a slot; every match scheduled once', () => {
    // Mixed roster so multiple rings are active.
    const matches = [
        ...Array.from({ length: 5 }, () => match({ red: seniorM(), blue: seniorM() })),
        ...Array.from({ length: 5 }, () => match({ red: juniorM(), blue: juniorM() })),
        ...Array.from({ length: 3 }, () => match({ red: female(),  blue: female() })),
    ];
    const q = distributeBalanced(matches);
    const slots = buildSlots(q);

    let scheduled = 0;
    const seen = new Set();
    for (const slot of slots) {
        const rings = slot.bouts.map(b => b.ring);
        assert.equal(new Set(rings).size, rings.length, `slot ${slot.slot} double-books a ring`);
        for (const b of slot.bouts) {
            assert.ok(!seen.has(b.sparId), `${b.sparId} scheduled twice`);
            seen.add(b.sparId);
            scheduled++;
        }
    }
    assert.equal(scheduled, matches.length, 'every match must appear exactly once');
});

test('buildSlots: slot count equals the busiest ring queue', () => {
    const matches = Array.from({ length: 7 }, () => match({ red: seniorM(), blue: seniorM() }));
    const q = distributeBalanced(matches);   // 7 seniors across R1-R4
    const slots = buildSlots(q);
    const busiest = Math.max(...RINGS_ALL.map(r => q[r].length));
    assert.equal(slots.length, busiest);
});
