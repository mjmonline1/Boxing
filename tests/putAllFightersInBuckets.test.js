// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Verifies PutAllFightersinBuckets.js puts every boxer in the CORRECT bucket.
//
// Strategy: drive the real classification pipeline used by the script
// (tscBucketStructure + HierarchicalFilter), then compare its output against an
// INDEPENDENT re-derivation of the 2026 spec (expectedBucket below). The two are
// written separately on purpose — if the script's rules drift from the spec, the
// assertions break. Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const os       = require('node:os');
const path     = require('node:path');

const HierarchicalFilter = require('../hierarchical-filter');
const { parseCSV, tscBucketStructure, explainUnassigned } = require('../PutAllFightersinBuckets');

// --- helpers ---------------------------------------------------------------

// Run the real bucketing pipeline quietly. Returns the raw buckets, an
// object->bucketName map, and any boxer found in more than one bucket.
function classify(boxers) {
    const origLog = console.log;
    console.log = () => {};                       // silence the script's chatter
    let buckets;
    try {
        buckets = new HierarchicalFilter(boxers)
            .buildTree(tscBucketStructure)
            .applyFilters()
            .getFinalBuckets();
    } finally {
        console.log = origLog;
    }

    const bucketOf   = new Map();
    const duplicates = [];
    for (const [name, members] of Object.entries(buckets)) {
        for (const b of members) {
            if (bucketOf.has(b)) duplicates.push(b);
            bucketOf.set(b, name);
        }
    }
    return { buckets, bucketOf, duplicates };
}

// Independent source of truth for the 2026 classification:
//   Gender -> Age (YOB) -> Experience.  Returns null when the spec assigns no
//   bucket (this is what the script does too — see the coverage-gap test).
function expectedBucket(b) {
    const fit = b.fit === true || b.fit === 'yes';
    if (!fit) return 'Notfit';

    const isMale   = b.gender === 'male'   || b.gender === 'M';
    const isFemale = b.gender === 'female' || b.gender === 'F';
    if (isFemale) return 'Female';
    if (!isMale)  return null;                    // unrecognised gender

    let age;
    if      (b.yob >= 2012 && b.yob <= 2014) age = 'MaleSchools';
    else if (b.yob >= 2010 && b.yob <= 2011) age = 'MaleJunior';
    else if (b.yob >= 2008 && b.yob <= 2009) age = 'MaleYouth';
    else if (b.yob <= 2007)                  age = 'MaleSenior';
    else return null;                             // yob >= 2015: too young, no bucket

    let exp;
    if      (b.experience <= 5)  exp = 'Novice';
    else if (b.experience <= 10) exp = 'Experienced';
    else                         exp = 'OpenClass';

    return `${age}_${exp}`;
}

// Build a boxer in the clean schema parseCSV produces, overriding any field.
function boxer(over = {}) {
    return {
        id: 1, name: 'Test Boxer', club: 'ClubA', gender: 'male',
        yob: 2000, fit: 'yes', weight: 70, experience: 0,
        ...over,
    };
}

// Assert a single boxer lands in exactly the expected bucket.
function assertBucket(over, expected) {
    const b = boxer(over);
    const { bucketOf } = classify([b]);
    assert.equal(bucketOf.get(b) ?? null, expected,
        `boxer ${JSON.stringify(over)} should be in ${expected}`);
}

// --- per-bucket placement --------------------------------------------------

test('not-fit boxer goes to Notfit (string "no")', () => {
    assertBucket({ fit: 'no' }, 'Notfit');
});

test('not-fit boxer goes to Notfit (boolean false)', () => {
    assertBucket({ fit: false }, 'Notfit');
});

test('not-fit takes precedence over gender/age', () => {
    assertBucket({ fit: 'no', gender: 'female', yob: 1995 }, 'Notfit');
});

test('fit female goes to Female ("female" and "F")', () => {
    assertBucket({ gender: 'female', yob: 1999 }, 'Female');
    assertBucket({ gender: 'F',      yob: 1999 }, 'Female');
});

test('every male age x experience combination lands in the right bucket', () => {
    const ages = [
        ['MaleSchools', 2013],
        ['MaleJunior',  2010],
        ['MaleYouth',   2009],
        ['MaleSenior',  2000],
    ];
    const exps = [
        ['Novice',      0],
        ['Novice',      5],
        ['Experienced', 6],
        ['Experienced', 10],
        ['OpenClass',   11],
        ['OpenClass',   25],
    ];
    for (const [agePrefix, yob] of ages) {
        for (const [tier, experience] of exps) {
            assertBucket({ yob, experience }, `${agePrefix}_${tier}`);
        }
    }
});

// --- boundary conditions ---------------------------------------------------

test('YOB boundaries map to the correct age group', () => {
    assertBucket({ yob: 2014, experience: 0 }, 'MaleSchools_Novice'); // upper Schools
    assertBucket({ yob: 2012, experience: 0 }, 'MaleSchools_Novice'); // lower Schools
    assertBucket({ yob: 2011, experience: 0 }, 'MaleJunior_Novice');  // upper Junior
    assertBucket({ yob: 2010, experience: 0 }, 'MaleJunior_Novice');  // lower Junior
    assertBucket({ yob: 2009, experience: 0 }, 'MaleYouth_Novice');   // upper Youth
    assertBucket({ yob: 2008, experience: 0 }, 'MaleYouth_Novice');   // lower Youth
    assertBucket({ yob: 2007, experience: 0 }, 'MaleSenior_Novice');  // Senior boundary
    assertBucket({ yob: 1980, experience: 0 }, 'MaleSenior_Novice');  // far Senior
});

test('experience boundaries map to the correct tier', () => {
    assertBucket({ yob: 2000, experience: 5  }, 'MaleSenior_Novice');
    assertBucket({ yob: 2000, experience: 6  }, 'MaleSenior_Experienced');
    assertBucket({ yob: 2000, experience: 10 }, 'MaleSenior_Experienced');
    assertBucket({ yob: 2000, experience: 11 }, 'MaleSenior_OpenClass');
});

// --- input normalisation ---------------------------------------------------

test('gender "M" and fit "yes" are normalised to the male path', () => {
    assertBucket({ gender: 'M', fit: 'yes', yob: 2000, experience: 0 }, 'MaleSenior_Novice');
});

test('boolean fit:true is treated as fit', () => {
    assertBucket({ fit: true, yob: 2000, experience: 0 }, 'MaleSenior_Novice');
});

// --- whole-roster invariants ----------------------------------------------

test('mixed roster: every boxer in its spec bucket, none lost, none duplicated', () => {
    const roster = [
        boxer({ id: 1,  name: 'A', fit: 'no' }),
        boxer({ id: 2,  name: 'B', gender: 'female', yob: 1998 }),
        boxer({ id: 3,  name: 'C', gender: 'F',      yob: 2005 }),
        boxer({ id: 4,  name: 'D', yob: 2013, experience: 2 }),
        boxer({ id: 5,  name: 'E', yob: 2013, experience: 8 }),
        boxer({ id: 6,  name: 'F', yob: 2010, experience: 12 }),
        boxer({ id: 7,  name: 'G', yob: 2009, experience: 0 }),
        boxer({ id: 8,  name: 'H', yob: 2008, experience: 6 }),
        boxer({ id: 9,  name: 'I', yob: 2006, experience: 30 }),
        boxer({ id: 10, name: 'J', gender: 'M', yob: 2001, experience: 5 }),
    ];

    const { buckets, bucketOf, duplicates } = classify(roster);

    // 1. correct bucket for every boxer
    for (const b of roster) {
        assert.equal(bucketOf.get(b) ?? null, expectedBucket(b),
            `${b.name} placed in wrong bucket`);
    }

    // 2. no boxer in two buckets
    assert.equal(duplicates.length, 0, 'a boxer appeared in more than one bucket');

    // 3. all accounted for (this roster is entirely classifiable)
    const totalAssigned = Object.values(buckets).reduce((n, b) => n + b.length, 0);
    assert.equal(totalAssigned, roster.length, 'every boxer should be assigned');
});

// --- known coverage gaps (documents current behaviour, not a wish) ---------

test('out-of-range young YOB is currently unassigned (coverage gap)', () => {
    // No age bucket covers YOB >= 2015; the script drops such boxers.
    assertBucket({ yob: 2016, experience: 0 }, null);
});

test('unrecognised gender is currently unassigned (coverage gap)', () => {
    assertBucket({ gender: 'other', yob: 2000, experience: 0 }, null);
});

test('gap is detectable: an unassigned boxer is in no bucket and is explained', () => {
    const young = boxer({ name: 'Tiny Tim', yob: 2016, experience: 0 });
    const { buckets } = classify([young]);

    // not silently absorbed anywhere
    const assigned = new Set(Object.values(buckets).flat());
    assert.ok(!assigned.has(young), 'under-Schools boxer should be in no bucket');

    // and the reason names the actual gap (the Schools floor)
    const why = explainUnassigned(young);
    assert.match(why, /younger than the Schools floor/);
    assert.doesNotMatch(why, /BUG/);
});

test('explainUnassigned: fit male with yob < 2015 falls through to age-bucket message', () => {
    // Exercises lines 128-129: fit male, not yob>=2015, but somehow unassigned.
    const why = explainUnassigned(boxer({ fit: true, gender: 'male', yob: 2010 }));
    assert.match(why, /matched no male age bucket/);
});

test('explainUnassigned: not-fit boxer returns BUG message', () => {
    const why = explainUnassigned(boxer({ fit: false }));
    assert.match(why, /BUG.*not-fit/);
});

test('explainUnassigned: fit female returns BUG message', () => {
    const why = explainUnassigned(boxer({ fit: true, gender: 'female' }));
    assert.match(why, /BUG.*female/);
});

test('explainUnassigned: fit boxer with unrecognised gender returns gender message', () => {
    const why = explainUnassigned(boxer({ fit: true, gender: 'robot' }));
    assert.match(why, /unrecognised gender/);
});

test('HierarchicalFilter getSummary returns correct totals', () => {
    const origLog = console.log;
    console.log = () => {};
    try {
        const boxers = [boxer({ gender: 'male', yob: 2000, experience: 0 }), boxer({ fit: 'no' })];
        const filter = new HierarchicalFilter(boxers)
            .buildTree(tscBucketStructure)
            .applyFilters();
        const s = filter.getSummary();
        assert.equal(s.totalOriginal, 2);
        assert.equal(s.totalDistributed, 2);
        assert.ok(typeof s.finalBuckets === 'object');
        assert.ok(Object.keys(s.finalBuckets).length > 0);
    } finally {
        console.log = origLog;
    }
});

test('HierarchicalFilter getBucket returns empty array for unknown bucket', () => {
    const origLog = console.log;
    console.log = () => {};
    try {
        const filter = new HierarchicalFilter([])
            .buildTree(tscBucketStructure)
            .applyFilters();
        assert.deepEqual(filter.getBucket('NoSuchBucket'), []);
    } finally {
        console.log = origLog;
    }
});

test('HierarchicalFilter buildTree with empty structure returns empty buckets', () => {
    const origLog = console.log;
    console.log = () => {};
    try {
        const filter = new HierarchicalFilter([boxer()])
            .buildTree([])
            .applyFilters();
        assert.deepEqual(filter.getFinalBuckets(), {});
    } finally {
        console.log = origLog;
    }
});

test('HierarchicalFilter node without description falls back to node name in log', () => {
    const origLog = console.log;
    console.log = () => {};
    try {
        // No description field → covers `config.description || ''` right side
        // and `child.description || child.name` right side in _filterRecursive
        const tree = [
            { name: 'All', rule: () => true },  // truthy rule → if branch
            { name: 'Pass' },                   // no rule → else branch (pass-through)
        ];
        const filter = new HierarchicalFilter([boxer()])
            .buildTree(tree)
            .applyFilters();
        assert.equal(filter.getBucket('All').length, 1);
    } finally {
        console.log = origLog;
    }
});

// --- parseCSV round-trip + classification ----------------------------------

test('parseCSV parses the clean schema and the rows bucket correctly', () => {
    const csv =
        'id,name,club,gender,yob,fit,weight,experience\n' +
        '1,"O\'Brien, Sean",Holy Trinity,male,2013,yes,33.5,2\n' +
        '2,Mary Smith,St Pauls,female,1999,yes,60,4\n' +
        '3,Tom Jones,Cookstown,male,2001,no,75.2,12\n';

    const tmp = path.join(os.tmpdir(), `boxers-${Date.now()}.csv`);
    fs.writeFileSync(tmp, csv);

    try {
        const boxers = parseCSV(tmp);

        // type coercion
        assert.equal(boxers.length, 3);
        assert.equal(boxers[0].name, "O'Brien, Sean");   // quoted comma preserved
        assert.equal(boxers[0].yob, 2013);
        assert.equal(typeof boxers[0].yob, 'number');
        assert.equal(boxers[0].weight, 33.5);
        assert.equal(boxers[0].fit, true);
        assert.equal(boxers[2].fit, false);
        assert.equal(typeof boxers[0].experience, 'number');

        // classification of the parsed rows
        const { bucketOf } = classify(boxers);
        for (const b of boxers) {
            assert.equal(bucketOf.get(b) ?? null, expectedBucket(b),
                `parsed boxer ${b.name} bucketed wrong`);
        }
        assert.equal(bucketOf.get(boxers[0]), 'MaleSchools_Novice');
        assert.equal(bucketOf.get(boxers[1]), 'Female');
        assert.equal(bucketOf.get(boxers[2]), 'Notfit');
    } finally {
        fs.rmSync(tmp, { force: true });
    }
});

// Regression (scenario failure: blank-experience vanish).
// A fit male with a BLANK experience cell used to parse as NaN, fail every
// experience-tier rule, and drop out of all buckets. It must default to 0 bouts
// (Novice) and stay accounted for.
test('parseCSV: blank experience defaults to 0 (Novice) and the boxer is not lost', () => {
    const csv =
        'id,name,club,gender,yob,fit,weight,experience\n' +
        '1,Blank Bob,ClubA,male,2000,yes,70,\n' +        // experience cell empty
        '2,Real Rita,ClubB,female,1999,yes,60,4\n';

    const tmp = path.join(os.tmpdir(), `boxers-blankexp-${Date.now()}.csv`);
    fs.writeFileSync(tmp, csv);

    try {
        const boxers = parseCSV(tmp);
        assert.equal(boxers[0].experience, 0, 'blank experience must coerce to 0');
        assert.equal(typeof boxers[0].experience, 'number');

        const { buckets, bucketOf } = classify(boxers);
        assert.equal(bucketOf.get(boxers[0]), 'MaleSenior_Novice',
            'blank-experience senior must land in Novice, not vanish');

        // system-wide: nobody dropped
        const total = Object.values(buckets).reduce((n, b) => n + b.length, 0);
        assert.equal(total, boxers.length, 'every parsed boxer must be bucketed');
    } finally {
        fs.rmSync(tmp, { force: true });
    }
});

// Regression (scenario failure: parseCSV crash on blank/short rows).
// A blank line mid-file, or a row truncated before the `fit` column, used to throw
// `undefined.toLowerCase()` and take down the whole bucket load. Blank lines must be
// skipped and short rows must parse with empty/Notfit defaults.
test('parseCSV: blank lines are skipped and short rows do not crash', () => {
    const csv =
        'id,name,club,gender,yob,fit,weight,experience\n' +
        '1,Short Row,ClubA,male,2000,yes\n' +     // truncated before weight/experience
        '\n' +                                     // stray blank line
        '3,Full Row,ClubB,female,1999,yes,60,4\n';

    const tmp = path.join(os.tmpdir(), `boxers-short-${Date.now()}.csv`);
    fs.writeFileSync(tmp, csv);

    try {
        const boxers = parseCSV(tmp);
        assert.equal(boxers.length, 2, 'blank line skipped, two real rows parsed');

        const short = boxers[0];
        assert.equal(short.name, 'Short Row');
        assert.equal(short.fit, true, 'present fit cell still read');
        assert.ok(Number.isNaN(short.weight), 'missing weight is NaN (handled downstream)');
        assert.equal(short.experience, 0, 'missing experience defaults to 0');

        // and it still classifies without throwing
        const { bucketOf } = classify(boxers);
        assert.equal(bucketOf.get(boxers[1]), 'Female');
    } finally {
        fs.rmSync(tmp, { force: true });
    }
});
