// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Verifies the PRODUCTION / MongoDB bucketing path puts every boxer in the
// CORRECT bucket — the counterpart to putAllFightersInBuckets.test.js for the
// netlify version, where data flows CSV -> MongoDB -> buckets -> MongoDB.
//
// Two real code paths are tested:
//   1. BucketAssigner.html assignBucket()/explainUnassigned() — the client
//      bucketer (extracted straight from the HTML source, not a copy).
//   2. netlify/functions/import-boxers.js parseBoxers() — the raw-registration
//      CSV -> boxer-doc transform that populates MongoDB.
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const path     = require('node:path');

// --- extract the real bucketer functions from BucketAssigner.html -----------

// Pull a top-level `function name(...) { ... }` out of source by brace-matching,
// so the test exercises the ACTUAL shipped code, not a transcription of it.
function extractFunction(src, name) {
    const start = src.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `function ${name} not found in BucketAssigner.html`);
    let depth = 0, end = -1;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    assert.notEqual(end, -1, `unbalanced braces extracting ${name}`);
    return src.slice(start, end);
}

const HTML = fs.readFileSync(path.join(__dirname, '../BucketAssigner.html'), 'utf8');
const { assignBucket, explainUnassigned } = new Function(
    extractFunction(HTML, 'assignBucket') + '\n' +
    extractFunction(HTML, 'explainUnassigned') + '\n' +
    'return { assignBucket, explainUnassigned };'
)();

// --- shared spec + helpers (independent re-derivation of the 2026 rules) ----

const VALID_BUCKETS = new Set([
    'Notfit',
    'MaleSchools_Novice', 'MaleSchools_Experienced', 'MaleSchools_OpenClass',
    'MaleJunior_Novice',  'MaleJunior_Experienced',  'MaleJunior_OpenClass',
    'MaleYouth_Novice',   'MaleYouth_Experienced',   'MaleYouth_OpenClass',
    'MaleSenior_Novice',  'MaleSenior_Experienced',  'MaleSenior_OpenClass',
    'Female',
]);

function expectedBucket(b) {
    const fit = b.fit === true || String(b.fit).toLowerCase() === 'yes';
    if (!fit) return 'Notfit';

    const g = String(b.gender).toLowerCase();
    if (g === 'female' || g === 'f') return 'Female';
    if (g !== 'male' && g !== 'm')   return null;

    let age;
    if      (b.yob >= 2012 && b.yob <= 2014) age = 'MaleSchools';
    else if (b.yob >= 2010 && b.yob <= 2011) age = 'MaleJunior';
    else if (b.yob >= 2008 && b.yob <= 2009) age = 'MaleYouth';
    else if (b.yob <= 2007)                  age = 'MaleSenior';
    else return null;

    const exp = b.experience <= 5 ? 'Novice' : b.experience <= 10 ? 'Experienced' : 'OpenClass';
    return `${age}_${exp}`;
}

function boxer(over = {}) {
    return { id: 1, name: 'Test', club: 'ClubA', gender: 'male',
             yob: 2000, fit: 'yes', weight: 70, experience: 0, ...over };
}

function assertBucket(over, expected) {
    const b = boxer(over);
    assert.equal(assignBucket(b), expected,
        `boxer ${JSON.stringify(over)} should be ${expected}`);
}

// --- client bucketer: per-bucket placement ---------------------------------

test('client assignBucket: not-fit -> Notfit (string and boolean)', () => {
    assertBucket({ fit: 'no' },  'Notfit');
    assertBucket({ fit: false }, 'Notfit');
    assertBucket({ fit: 'no', gender: 'female', yob: 1995 }, 'Notfit'); // precedence
});

test('client assignBucket: fit female -> Female ("female" and "F")', () => {
    assertBucket({ gender: 'female', yob: 1999 }, 'Female');
    assertBucket({ gender: 'F',      yob: 1999 }, 'Female');
});

test('client assignBucket: every male age x experience bucket', () => {
    const ages = [['MaleSchools', 2013], ['MaleJunior', 2010],
                  ['MaleYouth', 2009],   ['MaleSenior', 2000]];
    const exps = [['Novice', 0], ['Novice', 5], ['Experienced', 6],
                  ['Experienced', 10], ['OpenClass', 11], ['OpenClass', 25]];
    for (const [agePrefix, yob] of ages)
        for (const [tier, experience] of exps)
            assertBucket({ yob, experience }, `${agePrefix}_${tier}`);
});

// --- client bucketer: boundaries -------------------------------------------

test('client assignBucket: YOB boundaries', () => {
    assertBucket({ yob: 2014, experience: 0 }, 'MaleSchools_Novice');
    assertBucket({ yob: 2012, experience: 0 }, 'MaleSchools_Novice');
    assertBucket({ yob: 2011, experience: 0 }, 'MaleJunior_Novice');
    assertBucket({ yob: 2010, experience: 0 }, 'MaleJunior_Novice');
    assertBucket({ yob: 2009, experience: 0 }, 'MaleYouth_Novice');
    assertBucket({ yob: 2008, experience: 0 }, 'MaleYouth_Novice');
    assertBucket({ yob: 2007, experience: 0 }, 'MaleSenior_Novice');
    assertBucket({ yob: 1980, experience: 0 }, 'MaleSenior_Novice');
});

test('client assignBucket: experience boundaries', () => {
    assertBucket({ yob: 2000, experience: 5  }, 'MaleSenior_Novice');
    assertBucket({ yob: 2000, experience: 6  }, 'MaleSenior_Experienced');
    assertBucket({ yob: 2000, experience: 10 }, 'MaleSenior_Experienced');
    assertBucket({ yob: 2000, experience: 11 }, 'MaleSenior_OpenClass');
});

test('client assignBucket: gender "M"/fit "yes" normalised; bool fit true', () => {
    assertBucket({ gender: 'M', fit: 'yes', yob: 2000 }, 'MaleSenior_Novice');
    assertBucket({ fit: true, yob: 2000 },               'MaleSenior_Novice');
});

// --- client bucketer: gaps return null and are explained -------------------

test('client assignBucket: under-Schools YOB is a null gap, explained', () => {
    assertBucket({ yob: 2016, experience: 0 }, null);
    assert.match(explainUnassigned(boxer({ yob: 2016 })), /younger than the Schools floor/);
});

test('client assignBucket: unrecognised gender is a null gap', () => {
    assertBucket({ gender: 'other', yob: 2000 }, null);
});

// --- netlify import path: real CSV -> well-formed docs -> correct buckets ----

const importBoxers = require('../netlify/functions/import-boxers');

test('netlify import: parseBoxers yields well-formed MongoDB docs', (t) => {
    if (!fs.existsSync(importBoxers.BOXERS_CSV)) {
        t.skip('registration CSV not present');
        return;
    }
    const boxers = importBoxers.parseBoxers();
    assert.ok(boxers.length > 0, 'should parse at least one boxer');

    for (const b of boxers) {
        assert.equal(typeof b.yob, 'number', `${b.name}: yob not numeric`);
        assert.ok(b.yob > 1900 && b.yob < 2030, `${b.name}: implausible yob ${b.yob}`);
        assert.equal(typeof b.experience, 'number', `${b.name}: experience not numeric`);
        assert.ok(['male', 'female'].includes(b.gender), `${b.name}: bad gender ${b.gender}`);
        assert.ok(b.fit === 'yes' || b.fit === 'no', `${b.name}: bad fit ${b.fit}`);
        assert.equal(typeof b.id, 'number', `${b.name}: id not numeric`);
    }
});

test('netlify import: every real boxer buckets correctly with no gaps', (t) => {
    if (!fs.existsSync(importBoxers.BOXERS_CSV)) {
        t.skip('registration CSV not present');
        return;
    }
    const boxers = importBoxers.parseBoxers();

    let gaps = 0;
    for (const b of boxers) {
        const key = assignBucket(b);
        if (key === null) {
            gaps++;
            console.error(`GAP: ${b.name} — ${explainUnassigned(b)}`);
            continue;
        }
        assert.ok(VALID_BUCKETS.has(key), `${b.name}: invalid bucket ${key}`);
        assert.equal(key, expectedBucket(b), `${b.name}: wrong bucket`);
    }
    assert.equal(gaps, 0, 'the real roster should leave no boxer unbucketed');
});
