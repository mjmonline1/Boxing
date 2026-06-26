// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Realistic end-to-end tournament scenarios. Each drives the REAL modules:
//   roster -> buckets (HierarchicalFilter + tscBucketStructure)
//          -> sparring pairs (SparMaker.pairAll, all 3 phases)
//          -> ring slots (RingAssigner, BOTH balanced + grouped strategies)
// and asserts every system invariant.
//
// Includes the regression BENCHMARK for the blank-experience vanish bug
// (see tests/putAllFightersInBuckets.test.js for the focused regression).
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const os       = require('node:os');
const path     = require('node:path');

const HierarchicalFilter     = require('../hierarchical-filter');
const { tscBucketStructure, parseCSV } = require('../PutAllFightersinBuckets');
const { pairAll }            = require('../SparMaker');
const { distributeBalanced, distributeGrouped, buildSlots,
        hasFemale, isBothSeniorMale, isR5Eligible, boutDuration } = require('../RingAssigner');

const PHASE2_TOLERANCE = 2.5;

// --- pipeline driver -------------------------------------------------------

function bucketize(boxers) {
    const orig = console.log; console.log = () => {};
    try {
        return new HierarchicalFilter(boxers)
            .buildTree(tscBucketStructure).applyFilters().getFinalBuckets();
    } finally { console.log = orig; }
}

// roster -> { buckets, matches, unmatched, balanced, grouped }
// Mirrors RingAssigner.run(day): day-parity weight sort, then both strategies.
function runFull(boxers, day = 1) {
    const buckets = bucketize(boxers);
    const { matches, unmatched } = pairAll(buckets);

    const withIds = matches.map((m, i) => ({ sparId: `S${i + 1}`, ...m }));
    const avg = m => m.third
        ? (m.red.weight + m.blue.weight + m.third.weight) / 3
        : (m.red.weight + m.blue.weight) / 2;
    const odd = day % 2 === 1;
    withIds.sort((a, b) => odd ? avg(b) - avg(a) : avg(a) - avg(b));

    return {
        buckets, matches: withIds, unmatched,
        balanced: buildSlots(distributeBalanced(withIds)),
        grouped:  buildSlots(distributeGrouped(withIds)),
    };
}

// Assert every system invariant. Checked against BOTH ring strategies.
function assertInvariants({ buckets, matches, unmatched, balanced, grouped }, label) {
    const nonNotfit = Object.entries(buckets)
        .filter(([k]) => k !== 'Notfit')
        .reduce((n, [, v]) => n + v.length, 0);

    // 1. nobody vanishes between bucketing and sparring
    const matchedBoxers = matches.reduce((n, m) => n + (m.third ? 3 : 2), 0);
    assert.equal(matchedBoxers + unmatched.length, nonNotfit,
        `${label}: matched+unmatched (${matchedBoxers}+${unmatched.length}) must equal bucketed fit boxers (${nonNotfit})`);

    // 2. every 1v1 within phase-2 tolerance and from its own bucket.
    // Membership is by boxer id, not object identity: pairAll emits phase-2/3b
    // leftover boxers as detached copies (spread with _bucket), so a group `third`
    // is the same boxer but a different object than the one held in the bucket.
    for (const m of matches) {
        const diff = Math.abs(m.red.weight - m.blue.weight);
        assert.ok(diff <= PHASE2_TOLERANCE + 1e-9,
            `${label}: ${m.red.name} vs ${m.blue.name} exceed tolerance (${diff})`);
        const ids = new Set((buckets[m.category] || []).map(x => x.id));
        for (const p of [m.red, m.blue, m.third].filter(Boolean))
            assert.ok(ids.has(p.id),
                `${label}: ${p.name} (id ${p.id}) not from bucket ${m.category}`);
    }

    // 3. per-strategy scheduling invariants
    for (const [stratName, slots] of [['balanced', balanced], ['grouped', grouped]]) {
        const seen = new Set();
        let scheduled = 0;
        for (const slot of slots) {
            const rings = slot.bouts.map(b => b.ring);
            assert.equal(new Set(rings).size, rings.length,
                `${label}/${stratName}: slot ${slot.slot} double-books a ring`);

            // no boxer appears in two bouts in the same time slot
            const boxersInSlot = [];
            for (const bt of slot.bouts)
                for (const p of [bt.red, bt.blue, bt.third].filter(Boolean))
                    boxersInSlot.push(p.id ?? p.name);
            assert.equal(new Set(boxersInSlot).size, boxersInSlot.length,
                `${label}/${stratName}: slot ${slot.slot} double-books a boxer`);

            for (const bt of slot.bouts) {
                // ring eligibility
                if (hasFemale(bt))
                    assert.equal(bt.ring, 'R5', `${label}/${stratName}: female bout not in R5`);
                if (isBothSeniorMale(bt))
                    assert.notEqual(bt.ring, 'R5', `${label}/${stratName}: senior bout in R5`);
                if (!hasFemale(bt) && !isR5Eligible(bt))
                    assert.notEqual(bt.ring, 'R5',
                        `${label}/${stratName}: youth/cross-age bout wrongly in R5`);

                assert.ok(!seen.has(bt.sparId), `${label}/${stratName}: ${bt.sparId} scheduled twice`);
                seen.add(bt.sparId); scheduled++;
            }
        }
        assert.equal(scheduled, matches.length,
            `${label}/${stratName}: every match scheduled exactly once`);
    }
}

// --- roster builder --------------------------------------------------------

let _id = 0;
function b(over) {
    return { id: ++_id, name: `B${_id}`, club: 'ClubA', gender: 'male',
             yob: 2000, fit: 'yes', weight: 70, experience: 0, sparsPerDay: 1, ...over };
}

// ===========================================================================
// BENCHMARK — class-level guard for the blank-experience vanish bug.
// A realistic mixed roster, loaded via parseCSV, that INCLUDES a dirty row with a
// missing experience cell. The system-wide "no fit boxer vanishes" invariant must
// hold end to end.
// ===========================================================================

test('benchmark: realistic CSV roster with a blank-experience row loses nobody', () => {
    const rows = [
        '1,Senior One,ClubX,male,2000,yes,70.0,3',
        '2,Senior Two,ClubY,male,2001,yes,71.0,4',
        '3,Blank Exp,ClubX,male,2002,yes,70.5,',     // <- missing experience
        '4,Junior One,ClubY,male,2010,yes,45.0,1',
        '5,Junior Two,ClubX,male,2011,yes,46.0,2',
        '6,Youth One,ClubY,male,2008,yes,55.0,0',
        '7,Youth Two,ClubX,male,2009,yes,55.5,1',
        '8,Female One,ClubY,female,1999,yes,60.0,5',
        '9,Female Two,ClubX,female,2000,yes,61.0,2',
        '10,Unfit Guy,ClubY,male,2000,no,70.0,9',
    ];
    const csv = 'id,name,club,gender,yob,fit,weight,experience\n' + rows.join('\n') + '\n';
    const tmp = path.join(os.tmpdir(), `roster-${Date.now()}.csv`);
    fs.writeFileSync(tmp, csv);

    try {
        const boxers = parseCSV(tmp);
        assert.equal(boxers.length, 10);
        const blank = boxers.find(x => x.name === 'Blank Exp');
        assert.equal(blank.experience, 0, 'blank experience coerced to 0');

        const result = runFull(boxers);

        // the dirty boxer is bucketed (Senior Novice) and accounted for
        const bucketed = new Set(Object.values(result.buckets).flat());
        assert.ok(bucketed.has(blank), 'blank-experience boxer must be in a bucket');

        assertInvariants(result, 'benchmark');
    } finally {
        fs.rmSync(tmp, { force: true });
    }
});

// ===========================================================================
// STREAK — 5 realistic scenarios that must pass consecutively.
// ===========================================================================

// Scenario 1: full divisional tournament across every age group + females + unfit.
test('streak 1: full divisional roster survives buckets -> spars -> rings', () => {
    _id = 0;
    const roster = [];
    for (let i = 0; i < 6; i++) roster.push(b({ yob: 2000, weight: 64 + i, experience: 3, club: i % 2 ? 'ClubX' : 'ClubY' })); // seniors
    for (let i = 0; i < 6; i++) roster.push(b({ yob: 2010, weight: 40 + i, experience: 1, club: i % 2 ? 'ClubX' : 'ClubY' })); // juniors
    for (let i = 0; i < 4; i++) roster.push(b({ yob: 2008, weight: 50 + i, experience: 0, club: i % 2 ? 'ClubX' : 'ClubY' })); // youth
    for (let i = 0; i < 4; i++) roster.push(b({ yob: 2013, weight: 32 + i, experience: 0, club: i % 2 ? 'ClubX' : 'ClubY' })); // schools
    for (let i = 0; i < 4; i++) roster.push(b({ gender: 'female', yob: 2000, weight: 55 + i, experience: 2, club: i % 2 ? 'ClubX' : 'ClubY' }));
    roster.push(b({ fit: 'no' }), b({ fit: 'no', gender: 'female' }));

    const result = runFull(roster);
    assert.ok(result.matches.length > 0, 'expected matches');
    assertInvariants(result, 'streak1');
});

// Scenario 2: every female bout routes to R5; senior males fill the other rings.
test('streak 2: female cohort routes only to R5, both strategies', () => {
    _id = 0;
    const roster = [];
    for (let i = 0; i < 8; i++) roster.push(b({ gender: 'female', yob: 2000, weight: 52 + i, experience: 1, club: i % 2 ? 'ClubX' : 'ClubY' }));
    for (let i = 0; i < 6; i++) roster.push(b({ yob: 2000, weight: 70 + i * 0.5, experience: 4, club: i % 2 ? 'ClubX' : 'ClubY' }));

    const result = runFull(roster);
    assertInvariants(result, 'streak2');

    const femaleMatches = result.matches.filter(hasFemale);
    assert.ok(femaleMatches.length >= 3, 'expected several female matches');
    for (const slots of [result.balanced, result.grouped])
        for (const slot of slots)
            for (const bt of slot.bouts)
                if (hasFemale(bt)) assert.equal(bt.ring, 'R5', 'female bout must be R5');
});

// Scenario 3: youth (2008) + cross-age pairs never land in R5.
test('streak 3: youth + cross-age bouts stay out of R5', () => {
    _id = 0;
    const roster = [];
    for (let i = 0; i < 6; i++) roster.push(b({ yob: 2008, weight: 48 + i, experience: 0, club: i % 2 ? 'ClubX' : 'ClubY' })); // youth
    for (let i = 0; i < 4; i++) roster.push(b({ yob: 2000, weight: 80 + i, experience: 6, club: i % 2 ? 'ClubX' : 'ClubY' })); // seniors

    const result = runFull(roster);
    assertInvariants(result, 'streak3');

    // every non-female, non-R5-eligible bout must avoid R5 (the invariant already
    // checks this; assert explicitly that such bouts exist so the test isn't vacuous)
    const restricted = result.matches.filter(m => !hasFemale(m) && !isR5Eligible(m));
    assert.ok(restricted.length > 0, 'expected youth/senior bouts that cannot use R5');
});

// Scenario 4: odd same-bucket count forms a round-robin group; durations correct.
test('streak 4: odd senior bucket forms a group of 3 with 3x bout duration', () => {
    _id = 0;
    const roster = [
        b({ yob: 2000, weight: 70.0, experience: 2, club: 'ClubX' }),
        b({ yob: 2000, weight: 70.8, experience: 2, club: 'ClubY' }),
        b({ yob: 2000, weight: 71.5, experience: 2, club: 'ClubZ' }),
    ];
    const result = runFull(roster);
    assertInvariants(result, 'streak4');

    assert.equal(result.matches.length, 1, 'one bout entry');
    const g = result.matches[0];
    assert.ok(g.third, 'a 3-person group formed');
    // senior single bout = 11 min; a senior group runs all three = 33 min
    assert.equal(boutDuration(g), 33, 'senior group duration is 3x single');
});

// Scenario 6 (benchmark): a blank-weight boxer in a real bucket must not sabotage
// its neighbours' pairing, and must surface as unmatched (never silently lost).
test('streak 6: blank-weight boxer is sidelined, neighbours still pair', () => {
    _id = 0;
    const roster = [
        b({ yob: 2000, weight: 60.0, experience: 1, club: 'ClubX' }),
        b({ yob: 2000, weight: NaN,  experience: 1, club: 'ClubY' }), // missing weight
        b({ yob: 2000, weight: 61.0, experience: 1, club: 'ClubZ' }),
        b({ yob: 2000, weight: 61.5, experience: 1, club: 'ClubX' }),
    ];
    const result = runFull(roster);
    assertInvariants(result, 'streak6');

    assert.ok(result.matches.length >= 1, 'valid boxers still pair around the bad row');
    const bad = result.unmatched.find(x => !Number.isFinite(x.weight));
    assert.ok(bad, 'the blank-weight boxer surfaces as unmatched, not lost');
});

// Scenario 7 (benchmark): a CSV with a blank line and a truncated row must load and
// run end-to-end without crashing, losing nobody who is classifiable.
test('streak 7: messy CSV (blank line + short row) survives the whole pipeline', () => {
    const csv =
        'id,name,club,gender,yob,fit,weight,experience\n' +
        '1,Senior A,ClubX,male,2000,yes,70.0,2\n' +
        '2,Senior B,ClubY,male,2000,yes,70.5,3\n' +
        '\n' +                                    // blank line in the middle
        '4,Truncated,ClubZ,male,2001,yes\n' +     // missing weight/experience
        '5,Female A,ClubX,female,1999,yes,60,1\n' +
        '6,Female B,ClubY,female,2000,yes,60.5,2\n';
    const tmp = path.join(os.tmpdir(), `messy-${Date.now()}.csv`);
    fs.writeFileSync(tmp, csv);

    try {
        const boxers = parseCSV(tmp);
        assert.equal(boxers.length, 5, 'blank line skipped; five real rows');

        const result = runFull(boxers);
        assertInvariants(result, 'streak7');

        // Senior A/B pair; the truncated (no-weight) boxer surfaces unmatched, not lost
        const trunc = result.unmatched.find(x => x.name === 'Truncated');
        assert.ok(trunc, 'truncated/no-weight boxer is unmatched, never silently dropped');
    } finally {
        fs.rmSync(tmp, { force: true });
    }
});

// Scenario 8 (benchmark): mixed-case genders from a CSV classify correctly and the
// female bouts still route to R5 end-to-end.
test('streak 8: mixed-case genders classify and females still route to R5', () => {
    const csv =
        'id,name,club,gender,yob,fit,weight,experience\n' +
        '1,M One,ClubX,Male,2000,yes,70.0,2\n' +
        '2,M Two,ClubY,MALE,2000,yes,70.5,2\n' +
        '3,F One,ClubX,Female,1999,yes,60.0,1\n' +
        '4,F Two,ClubY,F,2000,yes,60.5,2\n';
    const tmp = path.join(os.tmpdir(), `gendered-${Date.now()}.csv`);
    fs.writeFileSync(tmp, csv);

    try {
        const boxers = parseCSV(tmp);
        const result = runFull(boxers);
        assertInvariants(result, 'streak8');

        // nobody dropped for casing
        const matchedBoxers = result.matches.reduce((n, m) => n + (m.third ? 3 : 2), 0);
        assert.equal(matchedBoxers + result.unmatched.length, 4, 'all 4 boxers accounted for');

        const femaleMatches = result.matches.filter(hasFemale);
        assert.ok(femaleMatches.length >= 1, 'the two females form a bout');
        for (const slots of [result.balanced, result.grouped])
            for (const slot of slots)
                for (const bt of slot.bouts)
                    if (hasFemale(bt)) assert.equal(bt.ring, 'R5', 'female bout must be R5');
    } finally {
        fs.rmSync(tmp, { force: true });
    }
});

// Scenario 9 (benchmark): senior-aged females get 3x2 (8 min) bouts, senior males 3x3
// (11 min), in the actual schedule slots.
test('streak 9: bout durations are gender-aware end-to-end', () => {
    _id = 0;
    const roster = [];
    for (let i = 0; i < 4; i++) roster.push(b({ gender: 'female', yob: 2000, weight: 55 + i, experience: 1, club: i % 2 ? 'ClubX' : 'ClubY' }));
    for (let i = 0; i < 4; i++) roster.push(b({ yob: 2000, weight: 75 + i, experience: 5, club: i % 2 ? 'ClubX' : 'ClubY' })); // senior males

    const result = runFull(roster);
    assertInvariants(result, 'streak9');

    for (const slot of result.balanced)
        for (const bt of slot.bouts) {
            if (hasFemale(bt)) assert.equal(bt.duration, 8, 'senior-aged female bout must be 8 min');
            else if (isBothSeniorMale(bt)) assert.equal(bt.duration, 11, 'senior-male bout must be 11 min');
        }
});

// Scenario 10: even-day scheduling sorts lightest-first (vs heaviest-first on odd days)
// and still satisfies every invariant.
test('streak 10: even-day schedule is lightest-first and invariant-clean', () => {
    _id = 0;
    // three pairable bouts spread across the weight range (light/mid/heavy)
    const roster = [
        b({ yob: 2000, weight: 60.0, experience: 4, club: 'ClubX' }),
        b({ yob: 2000, weight: 60.5, experience: 4, club: 'ClubY' }),
        b({ yob: 2000, weight: 70.0, experience: 4, club: 'ClubX' }),
        b({ yob: 2000, weight: 70.5, experience: 4, club: 'ClubY' }),
        b({ yob: 2000, weight: 80.0, experience: 4, club: 'ClubX' }),
        b({ yob: 2000, weight: 80.5, experience: 4, club: 'ClubY' }),
    ];

    const odd  = runFull(roster, 1);
    const even = runFull(roster, 2);
    assertInvariants(odd,  'streak10-odd');
    assertInvariants(even, 'streak10-even');

    const avg = m => m.third ? (m.red.weight + m.blue.weight + m.third.weight) / 3
                             : (m.red.weight + m.blue.weight) / 2;
    // Slot 1 of odd day is the heaviest bout; slot 1 of even day is the lightest.
    const firstBout = res => res.balanced[0].bouts.slice().sort((a, b) => a.ring < b.ring ? -1 : 1)[0];
    const oddFirst  = avg(firstBout(odd));
    const evenFirst = avg(firstBout(even));
    assert.ok(oddFirst > evenFirst,
        `odd day starts heavier (${oddFirst}) than even day (${evenFirst})`);
});

// Scenario 5: phase-2 rescue inside a realistic bucket (2.4 kg gap).
test('streak 5: 2.4 kg pair rescued in phase 2, plus a clean phase-1 pair', () => {
    _id = 0;
    const roster = [
        // clean phase-1 pair (0.5 kg)
        b({ yob: 2000, weight: 60.0, experience: 1, club: 'ClubX' }),
        b({ yob: 2000, weight: 60.5, experience: 1, club: 'ClubY' }),
        // phase-2-only pair (2.4 kg apart — misses +-2.0, caught at +-2.5)
        b({ yob: 2000, weight: 80.0, experience: 1, club: 'ClubX' }),
        b({ yob: 2000, weight: 82.4, experience: 1, club: 'ClubY' }),
    ];
    const result = runFull(roster);
    assertInvariants(result, 'streak5');

    assert.equal(result.matches.length, 2, 'two matches total');
    assert.equal(result.unmatched.length, 0, 'nobody unmatched');
    const rescued = result.matches.find(m => Math.abs(m.red.weight - m.blue.weight) > 2.0);
    assert.ok(rescued, 'one pair spans the phase-2 tolerance band');
    assert.ok(Math.abs(rescued.red.weight - rescued.blue.weight) <= 2.5);
});
