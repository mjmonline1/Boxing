// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// End-to-end: drives the REAL modules through the whole pipeline
//   roster -> buckets -> sparring pairs -> ring slots
// and asserts system-wide invariants (no boxer vanishes, weight tolerance,
// same-bucket pairing, ring eligibility, no ring double-booked).
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');

const HierarchicalFilter      = require('../hierarchical-filter');
const { tscBucketStructure }  = require('../PutAllFightersinBuckets');
const { pairBoxers }          = require('../SparMaker');
const { distributeBalanced, buildSlots,
        hasFemale, isBothSeniorMale } = require('../RingAssigner');
const importBoxers            = require('../netlify/functions/import-boxers');

const WEIGHT_TOLERANCE = 2.0;

// --- pipeline driver -------------------------------------------------------

function bucketize(boxers) {
    const orig = console.log; console.log = () => {};
    try {
        return new HierarchicalFilter(boxers)
            .buildTree(tscBucketStructure).applyFilters().getFinalBuckets();
    } finally { console.log = orig; }
}

// roster -> { buckets, matches, unmatched, slots }
function runPipeline(boxers) {
    const buckets = bucketize(boxers);

    let matches = [], unmatched = [];
    for (const [cat, members] of Object.entries(buckets)) {
        if (cat === 'Notfit' || members.length === 0) continue;     // unfit don't spar
        const r = pairBoxers(members, cat, WEIGHT_TOLERANCE);
        matches  = matches.concat(r.matches);
        unmatched = unmatched.concat(r.unmatched);
    }

    matches = matches.map((m, i) => ({ sparId: `S${i + 1}`, ...m }));
    const slots = buildSlots(distributeBalanced(matches));
    return { buckets, matches, unmatched, slots };
}

// Assert every system invariant on a pipeline result. `fitBucketed` = number of
// fit boxers that landed in a non-Notfit bucket.
function assertInvariants({ buckets, matches, unmatched, slots }, label) {
    const nonNotfit = Object.entries(buckets)
        .filter(([k]) => k !== 'Notfit')
        .reduce((n, [, v]) => n + v.length, 0);

    // 1. nobody vanishes between bucketing and sparring
    const matchedBoxers = matches.reduce((n, m) => n + (m.third ? 3 : 2), 0);
    assert.equal(matchedBoxers + unmatched.length, nonNotfit,
        `${label}: matched+unmatched must equal bucketed fit boxers`);

    // 2. every match is within weight tolerance and same category
    for (const m of matches) {
        const diff = Math.abs(m.red.weight - m.blue.weight);
        assert.ok(diff <= WEIGHT_TOLERANCE + 1e-9,
            `${label}: ${m.red.name} vs ${m.blue.name} exceed tolerance (${diff})`);
        assert.ok(buckets[m.category]?.includes(m.red) && buckets[m.category]?.includes(m.blue),
            `${label}: pair not from its own category bucket`);
    }

    // 3. ring eligibility + no double-booking + scheduled exactly once
    const seen = new Set();
    let scheduled = 0;
    for (const slot of slots) {
        const rings = slot.bouts.map(b => b.ring);
        assert.equal(new Set(rings).size, rings.length, `${label}: slot ${slot.slot} double-books a ring`);
        for (const b of slot.bouts) {
            if (hasFemale(b))        assert.equal(b.ring, 'R5', `${label}: female bout not in R5`);
            if (isBothSeniorMale(b)) assert.notEqual(b.ring, 'R5', `${label}: senior bout in R5`);
            assert.ok(!seen.has(b.sparId), `${label}: ${b.sparId} scheduled twice`);
            seen.add(b.sparId); scheduled++;
        }
    }
    assert.equal(scheduled, matches.length, `${label}: every match scheduled exactly once`);
}

// --- synthetic roster ------------------------------------------------------

let _id = 0;
function b(over) {
    return { id: ++_id, name: `B${_id}`, club: 'ClubA', gender: 'male',
             yob: 2000, fit: 'yes', weight: 70, experience: 0, ...over };
}

test('e2e: synthetic roster survives buckets -> spars -> rings intact', () => {
    const roster = [];
    // senior males, paired weights, mixed clubs
    for (let i = 0; i < 6; i++)
        roster.push(b({ gender: 'male', yob: 2000, weight: 60 + i, experience: 2,
                        club: i % 2 ? 'ClubX' : 'ClubY' }));
    // junior males (R5-eligible)
    for (let i = 0; i < 6; i++)
        roster.push(b({ gender: 'male', yob: 2010, weight: 40 + i, experience: 1,
                        club: i % 2 ? 'ClubX' : 'ClubY' }));
    // females
    for (let i = 0; i < 4; i++)
        roster.push(b({ gender: 'female', yob: 2000, weight: 55 + i, experience: 3,
                        club: i % 2 ? 'ClubX' : 'ClubY' }));
    // some unfit
    roster.push(b({ fit: 'no' }), b({ fit: 'no', gender: 'female' }));

    const result = runPipeline(roster);
    assert.ok(result.matches.length > 0, 'expected some matches');
    assertInvariants(result, 'synthetic');
});

test('e2e: unfit boxers are never matched to fight', () => {
    const roster = [
        // a fit pair so matching actually runs
        b({ gender: 'male', yob: 2000, weight: 70.0, club: 'ClubX', fit: 'yes' }),
        b({ gender: 'male', yob: 2000, weight: 70.5, club: 'ClubY', fit: 'yes' }),
        // unfit boxers at matchable weights — must stay out of every bout
        b({ gender: 'male',   yob: 2000, weight: 70.2, club: 'ClubZ', fit: 'no' }),
        b({ gender: 'female', yob: 2000, weight: 60.0, club: 'ClubZ', fit: 'no' }),
        b({ gender: 'male',   yob: 2010, weight: 40.0, club: 'ClubZ', fit: 'no' }),
    ];
    const { buckets, matches } = runPipeline(roster);

    const inBout = new Set();
    for (const m of matches) [m.red, m.blue, m.third].forEach(x => x && inBout.add(x.id));

    for (const unfit of buckets.Notfit || []) {
        assert.ok(!inBout.has(unfit.id), `unfit boxer ${unfit.name} must not be matched`);
    }
    assert.equal((buckets.Notfit || []).length, 3, 'three boxers should be Notfit');
});

test('e2e: club avoidance — different-club opponents preferred end to end', () => {
    // One bucket (senior novice), three boxers ~same weight: two ClubX, one ClubY.
    // The cross-club pair must form; the leftover ClubX boxer is unmatched.
    const roster = [
        b({ gender: 'male', yob: 2000, weight: 70.0, club: 'ClubX', experience: 0 }),
        b({ gender: 'male', yob: 2000, weight: 70.5, club: 'ClubX', experience: 0 }),
        b({ gender: 'male', yob: 2000, weight: 71.0, club: 'ClubY', experience: 0 }),
    ];
    const { matches, unmatched } = runPipeline(roster);
    assert.equal(matches.length, 1);
    assert.notEqual(matches[0].red.club, matches[0].blue.club, 'pair should be cross-club');
    assert.equal(unmatched.length, 1);
    assert.equal(unmatched[0].club, 'ClubX');
});

// --- real registration roster ----------------------------------------------

test('e2e: real CSV roster survives the whole pipeline with all invariants', (t) => {
    if (!fs.existsSync(importBoxers.BOXERS_CSV)) { t.skip('registration CSV not present'); return; }

    const boxers = importBoxers.parseBoxers();
    const result = runPipeline(boxers);

    assert.ok(result.matches.length > 0, 'real roster should produce matches');
    assertInvariants(result, 'real-csv');
});

// --- N-member group (SparManager-grown, extra[]) through ring assignment ---
// pairBoxers/pairAll never emit >3-member groups; a 4th+ member only ever comes
// from a manual SparManager edit. Simulate that hand-off directly into RingAssigner.

test('e2e: a manually-grown 5-member group (extra[]) keeps all members and correct duration through ring assignment', () => {
    const b = (name, weight) => ({ name, club: 'X', gender: 'male', yob: 2000, weight, experience: 0 });
    const match = {
        sparId: 'S1', category: 'MaleSenior_OpenClass', weightDiff: '1.00',
        red: b('R', 70), blue: b('Bl', 71), third: b('T', 72),
        extra: [b('E1', 73), b('E2', 74)],
    };
    const slots = buildSlots(distributeBalanced([match]));
    const placed = slots.flatMap(s => s.bouts).find(bt => bt.sparId === 'S1');
    assert.ok(placed, 'the group was scheduled');
    assert.deepEqual(placed.extra.map(x => x.name), ['E1', 'E2'], 'extra members preserved through buildSlots');
    assert.equal(placed.duration, 11 * 10, 'senior-male group of 5 = 11min x C(5,2)=10 bouts');
});
