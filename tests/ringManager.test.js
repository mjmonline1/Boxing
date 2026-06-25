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

const { AGE_GROUPS } = require('../constants');

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
    'AGE_GROUPS',
    extractFunction(HTML, 'boutType') + '\nreturn { boutType };'
)(AGE_GROUPS);

function bout(redOver = {}, blueOver = {}, third = null) {
    const male = (yob = 2000) => ({ gender: 'male', yob, weight: 70, name: 'A', club: 'X' });
    const b = { red: { ...male(), ...redOver }, blue: { ...male(), ...blueOver } };
    if (third) b.third = { ...male(), ...third };
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
