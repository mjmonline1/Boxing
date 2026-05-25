const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pairBoxers } = require('../SparMaker');

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
