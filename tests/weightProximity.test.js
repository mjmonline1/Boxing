// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for WeightProximity.js — findProximityPairs and toCSV.
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { findProximityPairs, toCSV } = require('../WeightProximity');

// --- findProximityPairs -------------------------------------------------------

test('findProximityPairs: pairs within 2kg tolerance', () => {
    const buckets = {
        MaleJunior: [
            { name: 'A', club: 'Club1', weight: 60.0 },
            { name: 'B', club: 'Club2', weight: 61.5 },  // diff 1.5 ≤ 2
            { name: 'C', club: 'Club1', weight: 63.0 },  // diff 1.5 from B ≤ 2, diff 3.0 from A > 2
        ],
    };
    const rows = findProximityPairs(buckets);
    assert.equal(rows.length, 2);
    const ab = rows.find(r => r.boxer_a === 'A' && r.boxer_b === 'B');
    assert.ok(ab, 'A-B pair missing');
    assert.equal(ab.weight_diff, '1.50');
    assert.equal(ab.same_club, 'no');
    assert.equal(ab.category, 'MaleJunior');
});

test('findProximityPairs: excludes pairs beyond tolerance', () => {
    const buckets = {
        Cat: [
            { name: 'A', club: 'C1', weight: 60.0 },
            { name: 'B', club: 'C2', weight: 62.1 },  // diff 2.1 > 2.0
        ],
    };
    assert.equal(findProximityPairs(buckets).length, 0);
});

test('findProximityPairs: skips NotFit category', () => {
    const buckets = {
        NotFit: [
            { name: 'X', club: 'C', weight: 70 },
            { name: 'Y', club: 'C', weight: 70 },
        ],
        Valid: [
            { name: 'A', club: 'C1', weight: 70 },
            { name: 'B', club: 'C2', weight: 70 },
        ],
    };
    const rows = findProximityPairs(buckets);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].category, 'Valid');
});

test('findProximityPairs: skips empty categories', () => {
    const buckets = {
        Empty: [],
        Cat: [
            { name: 'A', club: 'C1', weight: 70 },
            { name: 'B', club: 'C2', weight: 70 },
        ],
    };
    const rows = findProximityPairs(buckets);
    assert.equal(rows.length, 1);
});

test('findProximityPairs: same_club flag', () => {
    const buckets = {
        Cat: [
            { name: 'A', club: 'SameClub', weight: 70 },
            { name: 'B', club: 'SameClub', weight: 70 },
        ],
    };
    assert.equal(findProximityPairs(buckets)[0].same_club, 'yes');
});

test('findProximityPairs: weight_diff formatted to 2 decimal places', () => {
    const buckets = {
        Cat: [
            { name: 'A', club: 'C1', weight: 70.0 },
            { name: 'B', club: 'C2', weight: 70.0 },
        ],
    };
    assert.equal(findProximityPairs(buckets)[0].weight_diff, '0.00');
});

test('findProximityPairs: returns empty array for empty input', () => {
    assert.deepEqual(findProximityPairs({}), []);
});

// --- toCSV -------------------------------------------------------------------

test('toCSV: header always present, empty input returns only header', () => {
    const csv = toCSV([]);
    assert.ok(csv.startsWith('category,boxer_a,club_a,weight_a,boxer_b,club_b,weight_b,weight_diff,same_club'));
    assert.equal(csv.split('\n').length, 1);
});

test('toCSV: normal row serialises without extra quotes', () => {
    const rows = [{
        category: 'Cat', boxer_a: 'Alice', club_a: 'C1', weight_a: 70,
        boxer_b: 'Bob',  club_b: 'C2',    weight_b: 71,
        weight_diff: '1.00', same_club: 'no',
    }];
    const lines = toCSV(rows).split('\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[1], 'Cat,Alice,C1,70,Bob,C2,71,1.00,no');
});

test('toCSV: values containing a comma are quoted', () => {
    const rows = [{
        category: 'Cat,Sub', boxer_a: 'A', club_a: 'C1', weight_a: 70,
        boxer_b: 'B',        club_b: 'C2', weight_b: 71,
        weight_diff: '1.00', same_club: 'no',
    }];
    const lines = toCSV(rows).split('\n');
    assert.ok(lines[1].startsWith('"Cat,Sub"'));
});
