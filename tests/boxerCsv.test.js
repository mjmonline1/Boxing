// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for the shared boxer-csv module: tokenizer, header mapping, gender
// normalization, and the raw survey-export parser (used by Server.js and the
// netlify import function). Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { splitRecords, splitLine, normalizeGender, mapRawHeader, parseRawBoxers } = require('../boxer-csv');

// --- splitLine -------------------------------------------------------------

test('splitLine: plain fields', () => {
    assert.deepEqual(splitLine('a,b,c'), ['a', 'b', 'c']);
});

test('splitLine: quoted comma stays in one field, quotes stripped', () => {
    assert.deepEqual(splitLine('1,"Doe, Jane",x'), ['1', 'Doe, Jane', 'x']);
});

test('splitLine: doubled quote inside a quoted field becomes one quote', () => {
    assert.deepEqual(splitLine('"She said ""hi""",y'), ['She said "hi"', 'y']);
});

// --- splitRecords ----------------------------------------------------------

test('splitRecords: skips blank lines and trims, strips trailing CR', () => {
    assert.deepEqual(splitRecords('a,b\r\n\nc,d\n'), ['a,b', 'c,d']);
});

test('splitRecords: a quoted newline does not split the record', () => {
    const recs = splitRecords('h1,h2\n"line\nbreak",v\n');
    assert.equal(recs.length, 2);
    assert.deepEqual(splitLine(recs[1]), ['line\nbreak', 'v']);
});

test('splitRecords: final record without trailing newline is kept', () => {
    assert.deepEqual(splitRecords('a,b\nc,d'), ['a,b', 'c,d']);
});

// --- normalizeGender -------------------------------------------------------

test('normalizeGender: casing and M/F shorthand', () => {
    assert.equal(normalizeGender('Male'), 'male');
    assert.equal(normalizeGender('FEMALE'), 'female');
    assert.equal(normalizeGender('M'), 'male');
    assert.equal(normalizeGender('f'), 'female');
    assert.equal(normalizeGender(''), '');
    assert.equal(normalizeGender('other'), 'other');
});

// --- mapRawHeader (every branch) -------------------------------------------

test('mapRawHeader: maps every known survey header and falls back to lowercased', () => {
    const cases = {
        'date': 'submissionDate',
        'Full name': 'name',
        'Club': 'club',
        'Gender': 'gender',
        'Category': 'category',
        'Date of Birth': 'dob',
        'Current weight (kg)': 'weight',
        'BOUTS (the number only)': 'bouts',
        'WON (the number only)': 'won',
        'LOST (the number only)': 'lost',
        'Additional information or comments (optional)': 'comments',
        'I understand that all boxers have to weigh in...': 'consent1',
        'I accept that boxers under 50kg...': 'consent2',
        'Email address': 'email',
        'fit': 'fit',
        'Spars per Day': 'sparsPerDay',
        'Something Unknown': 'something unknown',  // fallback → lowercased
    };
    for (const [raw, key] of Object.entries(cases))
        assert.equal(mapRawHeader(raw), key, `${raw} → ${key}`);
});

// --- parseRawBoxers --------------------------------------------------------

const RAW_HEADER =
    'date,Full name,Club,Gender,Date of Birth,Current weight (kg),' +
    'BOUTS (the number only),WON (the number only),LOST (the number only),fit,Spars per Day';

test('parseRawBoxers: derives yob/experience, coerces numbers, defaults fit/sparsPerDay', () => {
    const text = RAW_HEADER + '\n' +
        '2026-01-01,"Smith, Al",ClubA,Male,03/04/2009,55.5,7,4,3,yes,2\n';
    const [b] = parseRawBoxers(text);
    assert.equal(b.name, 'Smith, Al');
    assert.equal(b.gender, 'male');          // canonicalised
    assert.equal(b.yob, 2009);               // from dob dd/mm/yyyy
    assert.equal(b.weight, 55.5);
    assert.equal(b.bouts, 7);
    assert.equal(b.experience, 7);           // experience = bouts
    assert.equal(b.sparsPerDay, 2);
    assert.equal(b.fit, 'yes');
    assert.equal(b.id, 1);
});

test('parseRawBoxers: blank gender defaults to male; blank fit/sparsPerDay default', () => {
    const text = RAW_HEADER + '\n' +
        '2026-01-02,No Gender,ClubB,,,,,,,,\n';   // all optional cells blank
    const [b] = parseRawBoxers(text);
    assert.equal(b.gender, 'male');   // blank → male default
    assert.equal(b.weight, 0);        // parseFloat('') || 0
    assert.equal(b.bouts, 0);
    assert.equal(b.experience, 0);
    assert.equal(b.fit, 'yes');       // blank → yes default
    assert.equal(b.sparsPerDay, 1);   // blank → 1 default
    assert.equal(b.yob, 0);           // no dob → 0
});

test('parseRawBoxers: missing fit/sparsPerDay COLUMNS fall back to defaults', () => {
    // header omits both 'fit' and 'Spars per Day' entirely
    const text = 'Full name,Gender,Date of Birth\nJo Bloggs,Male,01/01/2005\n';
    const [b] = parseRawBoxers(text);
    assert.equal(b.fit, 'yes');       // absent column → default
    assert.equal(b.sparsPerDay, 1);   // absent column → default
});

test('parseRawBoxers: empty text yields no boxers', () => {
    assert.deepEqual(parseRawBoxers(''), []);
});
