// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for boutType() extracted from RingManager.html.
// Uses the same new Function injection pattern as bucketAssigner.test.js.
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const path     = require('node:path');

const { AGE_GROUPS, R5_ELIGIBLE_YOB_MIN } = require('../constants');
const GroupUtils = require('../group-utils');

function extractFunction(src, name) {
    const start = src.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `function ${name} not found in RingManager.html`);
    let depth = 0, end = -1;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    assert.notEqual(end, -1, `unbalanced braces extracting ${name}`);
    return src.slice(start, end);
}

const HTML = fs.readFileSync(path.join(__dirname, '../RingManager.html'), 'utf8');
const { boutType } = new Function(
    'AGE_GROUPS', 'GroupUtils',
    extractFunction(HTML, 'boutType') + '\nreturn { boutType };'
)(AGE_GROUPS, GroupUtils);

const { canPlaceInR5 } = new Function(
    'R5_ELIGIBLE_YOB_MIN', 'GroupUtils',
    extractFunction(HTML, 'canPlaceInR5') + '\nreturn { canPlaceInR5 };'
)(R5_ELIGIBLE_YOB_MIN, GroupUtils);

const { boutHTML } = new Function(
    'GroupUtils', 'boutFormat',
    extractFunction(HTML, 'boutHTML') + '\nreturn { boutHTML };'
)(GroupUtils, () => '');

function bout(redOver = {}, blueOver = {}, third = null, extra = []) {
    const male = (yob = 2000) => ({ gender: 'male', yob, weight: 70, name: 'A', club: 'X' });
    const b = { red: { ...male(), ...redOver }, blue: { ...male(), ...blueOver }, category: 'Cat' };
    if (third) b.third = { ...male(), ...third };
    if (extra.length) b.extra = extra.map(o => ({ ...male(), ...o }));
    return b;
}

test('boutType: female red -> female', () => {
    assert.equal(boutType(bout({ gender: 'female' })), 'female');
});

test('boutType: female blue -> female', () => {
    assert.equal(boutType(bout({}, { gender: 'female' })), 'female');
});

test('boutType: female third in 3-person bout -> female', () => {
    assert.equal(boutType(bout({}, {}, { gender: 'female' })), 'female');
});

test('boutType: YOB age groups', () => {
    assert.equal(boutType(bout({ yob: 2013 })), 'schools');
    assert.equal(boutType(bout({ yob: 2010 })), 'junior');
    assert.equal(boutType(bout({ yob: 2009 })), 'youth');
    assert.equal(boutType(bout({ yob: 2000 })), 'senior');
});

test('boutType: YOB boundaries', () => {
    assert.equal(boutType(bout({ yob: 2014 })), 'schools');
    assert.equal(boutType(bout({ yob: 2012 })), 'schools');
    assert.equal(boutType(bout({ yob: 2011 })), 'junior');
    assert.equal(boutType(bout({ yob: 2010 })), 'junior');
    assert.equal(boutType(bout({ yob: 2009 })), 'youth');
    assert.equal(boutType(bout({ yob: 2008 })), 'youth');
    assert.equal(boutType(bout({ yob: 2007 })), 'senior');
    assert.equal(boutType(bout({ yob: 1980 })), 'senior');
});

// --- N-member groups (4/5) & the canPlaceInR5 bug fix ----------------------

test('boutType: female in extra[] of a 5-person group -> female', () => {
    const b = bout({}, {}, { yob: 2010 }, [{ yob: 2010 }, { gender: 'female', yob: 2010 }]);
    assert.equal(boutType(b), 'female');
});

test('canPlaceInR5: eligible third no longer silently ignored (pre-existing bug, now fixed)', () => {
    const eligible   = { yob: R5_ELIGIBLE_YOB_MIN };
    const ineligible = { yob: R5_ELIGIBLE_YOB_MIN - 1 };
    assert.equal(canPlaceInR5(bout(eligible, eligible, eligible)), true);
    // Before the fix, an ineligible third was invisible to this check.
    assert.equal(canPlaceInR5(bout(eligible, eligible, ineligible)), false);
});

test('canPlaceInR5: ineligible member in extra[] also blocks placement', () => {
    const eligible   = { yob: R5_ELIGIBLE_YOB_MIN };
    const ineligible = { yob: R5_ELIGIBLE_YOB_MIN - 1 };
    assert.equal(canPlaceInR5(bout(eligible, eligible, eligible, [eligible, ineligible])), false);
});

test('boutHTML: 5-member group renders all C(5,2)=10 pairwise bouts and diffs', () => {
    const weights = [70, 71, 72, 73, 74];
    const [red, blue, third, ...extra] = weights.map((weight, i) => ({ yob: 2000, weight, name: `M${i}` }));
    const b = bout(red, blue, third, extra);
    b.startTime = '10:00'; b.endTime = '10:30';
    const html = boutHTML(b);
    const names = (html.match(/M\d vs M\d/g) || []);
    assert.equal(names.length, 10, 'C(5,2) = 10 pairwise name lines');
    const diffs = html.match(/⚖ ([\d.]+ \/ ){9}[\d.]+ kg diff/);
    assert.ok(diffs, '10 pairwise weight diffs rendered');
});
