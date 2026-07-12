const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pairBoxers, pairBoxersRandom, pairAll, checkMatchingRisks } = require('../SparMaker');

const WEIGHT_TOLERANCE = 2.0;
const PHASE2_TOLERANCE = 2.5;

function boxer(name, weight, club, sparsPerDay = 1) {
    return { name, weight, club, sparsPerDay };
}

// 1. Basic pairing
test('pairs two boxers within tolerance from different clubs', () => {
    const boxers = [boxer('A', 70, 'ClubX'), boxer('B', 71, 'ClubY')];
    const { matches, unmatched } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 1);
    assert.equal(unmatched.length, 0);
});

// 2. Tolerance enforced
test('does not pair boxers outside tolerance', () => {
    const boxers = [boxer('A', 70, 'ClubX'), boxer('B', 72.1, 'ClubY')];
    const { matches, unmatched } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 0);
    assert.equal(unmatched.length, 2);
});

// 3. Club avoidance — different club preferred even if larger weight diff
test('prefers different-club opponent over same-club closer opponent', () => {
    // A@70, B@70.5 (same club as A), C@71.5 (different club)
    // A should pair with C despite B being closer
    const boxers = [
        boxer('A', 70, 'ClubX'),
        boxer('B', 70.5, 'ClubX'),
        boxer('C', 71.5, 'ClubY'),
    ];
    const { matches } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 1);
    const m = matches[0];
    const names = [m.red.name, m.blue.name];
    assert.ok(names.includes('A'), 'A should be matched');
    assert.ok(names.includes('C'), 'A should pair with C (different club)');
});

// 4. All same club — still pairs closest
test('pairs same-club boxers when no other option', () => {
    const boxers = [boxer('A', 70, 'ClubX'), boxer('B', 71, 'ClubX')];
    const { matches, unmatched } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 1);
    assert.equal(unmatched.length, 0);
});

// 5. sparsPerDay limit — boxer at limit is skipped; both end up unmatched
test('skips boxer who has reached sparsPerDay limit', () => {
    const B = boxer('B', 71, 'ClubY', 1);
    const sparCount = new Map([[B, 1]]);  // keyed on object reference, not name
    const boxers = [boxer('A', 70, 'ClubX'), B];
    const { matches, unmatched } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE, sparCount);
    assert.equal(matches.length, 0);
    // A has no valid opponent (B is at limit); B then has no one left — both unmatched
    assert.equal(unmatched.length, 2);
});

// 6. Odd count — one unmatched
test('leaves one boxer unmatched when count is odd', () => {
    const boxers = [
        boxer('A', 70, 'ClubX'),
        boxer('B', 71, 'ClubY'),
        boxer('C', 72, 'ClubZ'),
    ];
    const { matches, unmatched } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 1);
    assert.equal(unmatched.length, 1);
});

// 7. Empty array
test('handles empty boxer array', () => {
    const { matches, unmatched } = pairBoxers([], 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 0);
    assert.equal(unmatched.length, 0);
});

// 8. Single boxer
test('single boxer goes unmatched', () => {
    const { matches, unmatched } = pairBoxers([boxer('A', 70, 'ClubX')], 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 0);
    assert.equal(unmatched.length, 1);
});

// 9. weightDiff is a 2-decimal string
test('weightDiff is formatted as 2-decimal string', () => {
    const boxers = [boxer('A', 70, 'ClubX'), boxer('B', 71.5, 'ClubY')];
    const { matches } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches[0].weightDiff, '1.50');
});

// 10. category carried through
test('match carries the category name', () => {
    const boxers = [boxer('A', 70, 'ClubX'), boxer('B', 71, 'ClubY')];
    const { matches } = pairBoxers(boxers, 'MaleSenior_Novice', WEIGHT_TOLERANCE);
    assert.equal(matches[0].category, 'MaleSenior_Novice');
});

// 11. Phase 2 tolerance (2.5kg) catches what Phase 1 misses
test('phase 2 tolerance of 2.5kg matches boxers 2.1kg apart', () => {
    const boxers = [boxer('A', 70, 'ClubX'), boxer('B', 72.1, 'ClubY')];
    const p1 = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(p1.matches.length, 0, 'Phase 1 should not match');

    const p2 = pairBoxers(boxers, 'TestCat', PHASE2_TOLERANCE);
    assert.equal(p2.matches.length, 1, 'Phase 2 should match');
});

// 12. Four boxers — two pairs, none unmatched
test('pairs four boxers into two matches', () => {
    const boxers = [
        boxer('A', 60, 'ClubX'),
        boxer('B', 60.5, 'ClubY'),
        boxer('C', 70, 'ClubX'),
        boxer('D', 70.5, 'ClubY'),
    ];
    const { matches, unmatched } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 2);
    assert.equal(unmatched.length, 0);
});

// 13. Same weight, different clubs — weightDiff is "0.00"
test('same-weight pair produces weightDiff of "0.00"', () => {
    const boxers = [boxer('A', 70, 'ClubX'), boxer('B', 70, 'ClubY')];
    const { matches } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches[0].weightDiff, '0.00');
});

// 14. Same name different club — sparCount uses object ref, no collision
test('two boxers with same name but different clubs track spar limits independently', () => {
    // Alex@69 is lightest → becomes current first
    // john1@70 (at limit) → skipped as opponent
    // john2@71 (same name, different object, NOT at limit) → selected
    const extra = boxer('Alex', 69, 'ClubZ');
    const john1 = boxer('John', 70, 'ClubX');
    const john2 = boxer('John', 71, 'ClubY');

    const sparCount = new Map([[john1, 1]]);  // only john1 at limit

    const { matches, unmatched } = pairBoxers([extra, john1, john2], 'TestCat', WEIGHT_TOLERANCE, sparCount);
    assert.equal(matches.length, 1, 'Alex should pair with john2 (john1 skipped as at-limit opponent)');
    const names = [matches[0].red.name, matches[0].blue.name];
    assert.ok(names.includes('Alex'));
    assert.ok(names.includes('John'));
    // john1 ends up unmatched — skipped by Alex, then no one left
    assert.equal(unmatched.length, 1);
    assert.equal(unmatched[0].club, 'ClubX', 'john1 (ClubX, at limit) is unmatched');
});

// 15. Non-group matches have groupId: null (explicit, not undefined)
test('non-group match has groupId null', () => {
    const boxers = [boxer('A', 70, 'ClubX'), boxer('B', 71, 'ClubY')];
    const { matches } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches[0].groupId, null);
});

// 16. sparsPerDay absent on opponent — default limit of 1 used (covers || 1 branch)
test('default sparsPerDay of 1 applied when opponent has no sparsPerDay property', () => {
    const B = { name: 'B', weight: 71, club: 'ClubY' }; // no sparsPerDay
    const sparCount = new Map([[B, 1]]);                  // B at 1 spar
    const boxers = [{ name: 'A', weight: 70, club: 'ClubX' }, B];
    // 1 >= (undefined || 1) → true → skip B → no match
    const { matches } = pairBoxers(boxers, 'Cat', WEIGHT_TOLERANCE, sparCount);
    assert.equal(matches.length, 0);
});

// Regression (scenario failure: blank-weight sabotage).
// A boxer with a non-finite weight (blank CSV cell → NaN) used to sit mid-list and
// trip the ascending-scan `break`, starving valid neighbours of opponents. It must be
// set aside as unmatched and NOT block others from pairing.
test('blank-weight boxer is unmatched and does not block valid neighbours from pairing', () => {
    const boxers = [
        boxer('A', 60, 'ClubX'),
        { name: 'Bad', weight: NaN, club: 'ClubY', sparsPerDay: 1 }, // blank weight
        boxer('B', 61, 'ClubZ'),
    ];
    const { matches, unmatched } = pairBoxers(boxers, 'Cat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 1, 'A and B must still pair (1 kg apart)');
    const names = [matches[0].red.name, matches[0].blue.name].sort();
    assert.deepEqual(names, ['A', 'B']);
    assert.equal(unmatched.length, 1);
    assert.equal(unmatched[0].name, 'Bad', 'the blank-weight boxer is the only one unmatched');
});

// ── pairAll: full 3-phase pipeline ──────────────────────────────────────────

function eb(name, weight, club) { return { name, weight, club, experience: 0, sparsPerDay: 1 }; }

// 17. End-to-end across all three phases + skips, in one bucket map.
test('pairAll runs phases 1-3b, skips Notfit/empty, folds leftover into a group', () => {
    const buckets = {
        Notfit: [eb('NF', 70, 'X')],                              // skipped
        Empty:  [],                                               // skipped
        Grp:    [eb('A', 70, 'X'), eb('B', 71, 'Y'), eb('C', 70.5, 'Z')], // pair + group third
        P2:     [eb('D', 60, 'X'), eb('E', 62.3, 'Y')],           // 2.3kg → only phase 2 matches
        Solo:   [eb('F', 100, 'X')],                              // never matches
    };

    const r = pairAll(buckets);

    // Two 1v1 matches: A/C (then folds in B as third) and D/E.
    assert.equal(r.matches.length, 2);
    assert.equal(r.groupCount, 1);
    const group = r.matches.find(m => m.third);
    assert.ok(group, 'one match became a 3-person group');
    assert.equal(group.groupId, 'g1');
    assert.equal(group.third.name, 'B');

    // F never matches → unmatched, tagged with its source bucket, _bucket stripped.
    assert.equal(r.unmatched.length, 1);
    assert.equal(r.unmatched[0].name, 'F');
    assert.equal(r.unmatched[0].category, 'Solo');
    assert.ok(!('_bucket' in r.unmatched[0]), '_bucket must be stripped');

    // No _bucket leaks onto matched boxers.
    for (const m of r.matches) {
        for (const b of [m.red, m.blue, m.third].filter(Boolean)) {
            assert.ok(!('_bucket' in b), `_bucket leaked onto ${b.name}`);
        }
    }

    // Per-phase breakdown.
    assert.equal(r.phases.phase1.matches.length, 1);   // A/C
    assert.equal(r.phases.phase1.unmatched.length, 4); // B, D, E, F
    assert.equal(r.phases.phase2.matches.length, 1);   // D/E
    assert.equal(r.phases.phase2.unmatched.length, 2); // B, F
    assert.equal(r.phases.phase3.groups.length, 1);
    assert.equal(r.phases.phase3.unmatched.length, 1); // F
});

// 17b. maxPhase stops the pipeline early — same fixture as test 17.
test('pairAll maxPhase=1 stops after phase 1: no phase-2 pair, no group fold', () => {
    const buckets = {
        Grp: [eb('A', 70, 'X'), eb('B', 71, 'Y'), eb('C', 70.5, 'Z')],
        P2:  [eb('D', 60, 'X'), eb('E', 62.3, 'Y')],
        Solo: [eb('F', 100, 'X')],
    };
    const r = pairAll(buckets, { maxPhase: 1 });
    assert.equal(r.matches.length, 1, 'only the phase-1 A/C pair');
    assert.equal(r.groupCount, 0, 'no group fold — B stays unmatched');
    assert.equal(r.unmatched.length, 4, 'B, D, E, F all still unmatched');
    assert.equal(r.phases.phase2.matches.length, 0);
    assert.equal(r.phases.phase3.groups.length, 0);
});

test('pairAll maxPhase=2 runs phase 2 but skips the group fold', () => {
    const buckets = {
        Grp: [eb('A', 70, 'X'), eb('B', 71, 'Y'), eb('C', 70.5, 'Z')],
        P2:  [eb('D', 60, 'X'), eb('E', 62.3, 'Y')],
        Solo: [eb('F', 100, 'X')],
    };
    const r = pairAll(buckets, { maxPhase: 2 });
    assert.equal(r.matches.length, 2, 'A/C and D/E pair, but B is not folded in');
    assert.equal(r.groupCount, 0, 'group fold did not run');
    assert.equal(r.unmatched.length, 2, 'B and F remain unmatched, not folded');
    assert.ok(r.unmatched.some(b => b.name === 'B'));
});

// 18. tol1 option is honoured — widening phase 1 matches what default leaves for phase 2.
test('pairAll respects custom tol1', () => {
    const buckets = { Cat: [eb('D', 60, 'X'), eb('E', 62.3, 'Y')] };
    const widened = pairAll(buckets, { tol1: 2.5 });
    assert.equal(widened.phases.phase1.matches.length, 1, 'phase 1 matches with tol1=2.5');
    assert.equal(widened.phases.phase2.matches.length, 0);
});

// 19. Float-boundary regression (bug #7): two boxers EXACTLY at a tolerance whose IEEE-754
// difference lands just over it (63.4 vs 65.9 → 2.500000000000007) must still pair. The
// phase-2 (2.5) tolerance is the outermost — a drop here is never rescued by a later phase.
test('pairBoxers pairs an exact-tolerance pair despite float error (phase-2 edge)', () => {
    // sanity: this pair really does trip the naive compare
    assert.ok(Math.abs(63.4 - 65.9) > 2.5, 'precondition: float diff exceeds 2.5');
    const boxers = [boxer('A', 63.4, 'ClubX'), boxer('B', 65.9, 'ClubY')];
    const { matches, unmatched } = pairBoxers(boxers, 'Cat', PHASE2_TOLERANCE);
    assert.equal(matches.length, 1, 'exact-2.5 pair must match');
    assert.equal(unmatched.length, 0);
});

// 20. checkMatchingRisks — reproduces the design doc's own worked examples
// (docs/matching-optimality-design.md) so the detector matches the documented cases.
test('checkMatchingRisks flags the doc\'s stranding example (63.5 stranded near a taken 65.7)', () => {
    const matches = [{ category: 'Female', groupId: null,
        red: { name: 'B', weight: 65.7 }, blue: { name: 'C', weight: 67.4 } }];
    const unmatched = [{ name: 'A', weight: 63.5, category: 'Female' }];
    const { strandedCandidates, overSpreadTrios } = checkMatchingRisks(matches, unmatched);
    assert.equal(overSpreadTrios.length, 0);
    assert.equal(strandedCandidates.length, 1);
    assert.equal(strandedCandidates[0].nearestMatchedPartner, 'B');
    assert.equal(strandedCandidates[0].diff, 2.2);
});

test('checkMatchingRisks flags the doc\'s over-spread trio example (70/72 pair + 73.9 third)', () => {
    const matches = [{ category: 'Cat', groupId: 'g1',
        red: { name: 'R', weight: 70.0 }, blue: { name: 'Bl', weight: 72.0 }, third: { name: 'T', weight: 73.9 } }];
    const { overSpreadTrios, strandedCandidates } = checkMatchingRisks(matches, []);
    assert.equal(strandedCandidates.length, 0);
    assert.equal(overSpreadTrios.length, 1);
    assert.equal(overSpreadTrios[0].worstPair, 'R vs T');
    assert.equal(overSpreadTrios[0].worstDiff, 3.9);
});

// Defensive-only: phase 3b itself never produces >3-member groups, but a
// SparManager-grown 5-member group (extra[]) fed back through checkMatchingRisks
// (e.g. on a re-save) must not crash and must scan all C(5,2)=10 pairs.
test('checkMatchingRisks: a manually-grown 5-member group scans all C(5,2)=10 pairs without crashing', () => {
    const matches = [{ category: 'Cat', groupId: 'g1',
        red: { name: 'R', weight: 70.0 }, blue: { name: 'Bl', weight: 71.0 }, third: { name: 'T', weight: 72.0 },
        extra: [{ name: 'E1', weight: 73.0 }, { name: 'E2', weight: 80.0 }] }];
    const { overSpreadTrios } = checkMatchingRisks(matches, []);
    assert.equal(overSpreadTrios.length, 1);
    assert.equal(overSpreadTrios[0].worstPair, 'R vs E2');
    assert.equal(overSpreadTrios[0].worstDiff, 10);
});

test('matchedCount reducer counts every member including extra[]', () => {
    const matches = [
        { red: {}, blue: {} },
        { red: {}, blue: {}, third: {} },
        { red: {}, blue: {}, third: {}, extra: [{}, {}] },
    ];
    const GroupUtils = require('../group-utils');
    const matchedCount = matches.reduce((n, m) => n + GroupUtils.membersOf(m).length, 0);
    assert.equal(matchedCount, 2 + 3 + 5);
});

// 21. pairAll — autoMatch='no' boxers are held out of pairing entirely and returned
// as manualMatch, not paired and not counted as unmatched.
test('pairAll holds autoMatch="no" boxers out of pairing, returns them as manualMatch', () => {
    const buckets = { Cat: [eb('A', 70, 'X'), eb('B', 71, 'Y'), { ...eb('C', 70.5, 'Z'), autoMatch: 'no' }] };
    const r = pairAll(buckets);
    assert.equal(r.matches.length, 1, 'A/B still pair normally');
    assert.equal(r.unmatched.length, 0, 'C is not "unmatched" — held out, not attempted');
    assert.equal(r.manualMatch.length, 1);
    assert.equal(r.manualMatch[0].name, 'C');
    assert.equal(r.manualMatch[0].category, 'Cat');
});

test('pairAll: boxers with no autoMatch field default to auto-matched (backward compatible)', () => {
    const buckets = { Cat: [eb('A', 70, 'X'), eb('B', 71, 'Y')] };
    const r = pairAll(buckets);
    assert.equal(r.matches.length, 1);
    assert.equal(r.manualMatch.length, 0);
});

// 20. Same bug end-to-end through pairAll: the exact-2.5 pair surfaces as a match, not as
// two unmatched boxers in the same bucket.
test('pairAll does not drop an exact-tolerance pair on the phase-2 boundary', () => {
    const buckets = { Cat: [
        { id: 1, name: 'A', club: 'X', gender: 'male', yob: 2000, weight: 63.4, experience: 1, sparsPerDay: 1 },
        { id: 2, name: 'B', club: 'Y', gender: 'male', yob: 2000, weight: 65.9, experience: 1, sparsPerDay: 1 },
    ]};
    const r = pairAll(buckets);
    assert.equal(r.matches.length, 1, 'the 2.5 kg pair must be matched');
    assert.equal(r.unmatched.length, 0, 'nobody left unmatched');
});

// 21. Phase-1 group-join (phase 3b) honours the same epsilon: a third exactly tol1 from a
// pair member joins the group rather than being spuriously dropped by float error.
test('pairAll phase-3b folds a third sitting exactly on the tol1 boundary', () => {
    assert.ok(Math.abs(63.4 - 65.4) > 2.0, 'precondition: 63.4↔65.4 float diff exceeds 2.0');
    const buckets = { Cat: [
        { id: 1, name: 'A', club: 'X', gender: 'male', yob: 2000, weight: 65.4, experience: 1, sparsPerDay: 1 },
        { id: 2, name: 'B', club: 'Y', gender: 'male', yob: 2000, weight: 65.0, experience: 1, sparsPerDay: 1 },
        { id: 3, name: 'C', club: 'Z', gender: 'male', yob: 2000, weight: 63.4, experience: 1, sparsPerDay: 1 }, // exactly 2.0 from A
    ]};
    const r = pairAll(buckets);
    const group = r.matches.find(m => m.third);
    assert.ok(group, 'a 3-person group forms');
    assert.equal(r.unmatched.length, 0, 'the exact-boundary third is not dropped');
});

// ── sparsPerDay > 1 : a boxer stays matchable until they hit their daily cap ──────

function sp(id, name, club, weight, sparsPerDay) {
    return { id, name, club, gender: 'male', yob: 2000, weight, experience: 1, sparsPerDay };
}

// 22. A boxer with sparsPerDay=2 sits in TWO bouts, against two DIFFERENT opponents, while
// his single-spar opponents each appear once. (Covers pool-retention + per-opponent cap.)
test('pairAll: sparsPerDay=2 boxer spars two different opponents', () => {
    const buckets = { Cat: [
        sp(1, 'A', 'X', 70.0, 2),
        sp(2, 'B', 'Y', 70.4, 1),
        sp(3, 'C', 'Z', 70.8, 1),
        sp(4, 'D', 'W', 71.2, 1),
    ]};
    const r = pairAll(buckets);

    const appears = name => r.matches.reduce((n, m) =>
        n + [m.red, m.blue, m.third].filter(Boolean).filter(p => p.name === name).length, 0);
    assert.equal(appears('A'), 2, 'A (sparsPerDay=2) is in exactly two bouts');
    assert.equal(appears('B'), 1, 'B (sparsPerDay=1) is in one bout');

    // A's two opponents are distinct — no rematch
    const aOpps = r.matches
        .filter(m => [m.red, m.blue, m.third].filter(Boolean).some(p => p.name === 'A'))
        .flatMap(m => [m.red, m.blue, m.third].filter(Boolean).map(p => p.name))
        .filter(n => n !== 'A');
    assert.equal(new Set(aOpps).size, aOpps.length, 'A never spars the same opponent twice');
    assert.equal(r.unmatched.length, 0, 'nobody left over');
});

// 23. Two cap-2 boxers alone do NOT pair twice — the no-rematch guard stops a second bout
// between the same pair even though both still have spare capacity. (Covers hasMet/no-rematch.)
test('pairAll: capacity left but no new opponent → no rematch, single bout', () => {
    const buckets = { Cat: [ sp(1, 'A', 'X', 70.0, 2), sp(2, 'B', 'Y', 70.5, 2) ] };
    const r = pairAll(buckets);
    assert.equal(r.matches.length, 1, 'one bout only — they cannot rematch each other');
    assert.equal(r.unmatched.length, 0, 'a boxer who already sparred is not "unmatched"');
});

// 24. An at-cap opponent is skipped mid-scan: B (cap 1) is exhausted by A, so when C looks
// for a partner B is no longer eligible and C falls to its next option. (Covers opponent-cap.)
test('pairAll: an opponent already at their cap is skipped', () => {
    const buckets = { Cat: [
        sp(1, 'A', 'X', 70.0, 2),
        sp(2, 'B', 'Y', 70.3, 1),
        sp(3, 'C', 'Z', 70.6, 2),
    ]};
    const r = pairAll(buckets);
    // everyone pairs; B appears exactly once (its single cap), A and C soak the extra spars
    const appears = name => r.matches.reduce((n, m) =>
        n + [m.red, m.blue, m.third].filter(Boolean).filter(p => p.name === name).length, 0);
    assert.equal(appears('B'), 1, 'B is used exactly once (cap 1)');
    assert.ok(appears('A') >= 1 && appears('C') >= 1, 'A and C both spar');
});

// 25. Regression (real-roster bug, 2026-07): a sparsPerDay=2 boxer who gets exactly ONE
// spar within a single pairBoxers() call, then fails to find a second opponent, must NOT
// also appear in that same call's own `unmatched` — that double-counts them (they show up
// as matched AND unmatched). Reproduces the "Alpha Käser" case found in the real roster:
// a cap-2 boxer paired once, alone in the pool on the next pass, no leftover.
test('pairBoxers: sparsPerDay=2 boxer matched once, no 2nd opponent, is not double-counted', () => {
    const boxers = [boxer('A', 70, 'ClubX', 2), boxer('B', 70.5, 'ClubY', 1)];
    const { matches, unmatched } = pairBoxers(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 1, 'A and B pair once');
    assert.equal(unmatched.length, 0, 'A already sparred — not also unmatched');
});

test('pairBoxersRandom: sparsPerDay=2 boxer matched once, no 2nd opponent, is not double-counted', () => {
    const boxers = [boxer('A', 70, 'ClubX', 2), boxer('B', 70.5, 'ClubY', 1)];
    const { matches, unmatched } = pairBoxersRandom(boxers, 'TestCat', WEIGHT_TOLERANCE);
    assert.equal(matches.length, 1, 'A and B pair once');
    assert.equal(unmatched.length, 0, 'A already sparred — not also unmatched');
});
