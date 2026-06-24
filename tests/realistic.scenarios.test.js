// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Realistic pipeline scenarios exercising edge cases in generate-spars.js
// and generate-schedule.js:  phase-2 rescue, phase-3b group, ring routing,
// all-same-club pairing, and outlier boxing staying unmatched.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const dbFn       = require('../netlify/functions/db');
const sparsFn    = require('../netlify/functions/generate-spars');
const scheduleFn = require('../netlify/functions/generate-schedule');

const {
  startMongo, stopMongo, invoke,
  assertSparsDoc, assertScheduleDoc,
} = require('./helpers/mongo');

let ctx;
before(async () => { ctx = await startMongo(); });
after(async () => {
  await Promise.all([dbFn, sparsFn, scheduleFn].map(m => m._closeDb()));
  await stopMongo(ctx);
});

async function reset() {
  await Promise.all(['buckets','spars','schedule']
    .map(n => ctx.db.collection(n).deleteMany({})));
}

let _id = 0;
function b(over) {
  return { id: ++_id, name: `B${_id}`, club: 'ClubA', gender: 'male',
           yob: 2000, fit: 'yes', weight: 70, experience: 0, sparsPerDay: 1, ...over };
}

async function putBuckets(finalBuckets) {
  const total = Object.entries(finalBuckets)
    .filter(([k]) => k !== 'Notfit').reduce((n, [, v]) => n + v.length, 0);
  const r = await invoke(dbFn.handler, {
    httpMethod: 'PUT', queryStringParameters: { key: 'buckets' },
    body: JSON.stringify({ finalBuckets, summary: { totalDistributed: total } }),
  });
  assert.equal(r.statusCode, 200, `putBuckets failed: ${JSON.stringify(r.data)}`);
}

async function spars() {
  const r = await invoke(sparsFn.handler, {});
  assert.equal(r.statusCode, 200, `generate-spars: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function schedule() {
  const r = await invoke(scheduleFn.handler, { queryStringParameters: {} });
  assert.equal(r.statusCode, 200, `generate-schedule: ${JSON.stringify(r.data)}`);
  return r.data;
}

// ---------------------------------------------------------------------------

// Scenario 1: phase-2 rescue
// Two boxers at 70.0 and 72.4 kg (diff = 2.4 > phase-1 ±2.0, within phase-2 ±2.5).
// Expected: phase 1 leaves both unmatched; phase 2 matches them.
test('scenario 1: phase-2 rescue — 2.4 kg diff matched in phase 2 not phase 1', async () => {
  await reset(); _id = 0;
  await putBuckets({ SeniorMale: [
    b({ yob: 2000, weight: 70.0, club: 'ClubX' }),
    b({ yob: 2000, weight: 72.4, club: 'ClubY' }),
  ]});

  const doc = await spars();
  assertSparsDoc(doc, 's1.spars');

  assert.equal(doc.summary.matchCount,     1, 'one match');
  assert.equal(doc.summary.unmatchedCount, 0, 'none unmatched');
  assert.equal(doc.summary.groupCount,     0, 'no groups');
  // phase log
  assert.equal(doc.phaseLog.phase1.length, 2, 'both left phase 1 unmatched');
  assert.equal(doc.phaseLog.phase2.length, 0, 'phase 2 matched them');
  // the match itself must span the phase-2 tolerance band
  const m = doc.matches[0];
  const diff = Math.abs(m.red.weight - m.blue.weight);
  assert.ok(diff > 2.0,  `diff ${diff} must exceed phase-1 tolerance`);
  assert.ok(diff <= 2.5, `diff ${diff} must be within phase-2 tolerance`);
});

// Scenario 2: phase-3b group formation
// 3 boxers at 60, 61, 62 kg in the same bucket.
// Phase 1 matches 60+61; 62 is left alone.
// Phase 3b: 62 is within ±2 kg of both, so it joins as 'third'.
test('scenario 2: phase-3b group — unmatched boxer becomes third in existing pair', async () => {
  await reset(); _id = 0;
  await putBuckets({ JuniorMale: [
    b({ yob: 2010, weight: 60.0, club: 'ClubX' }),
    b({ yob: 2010, weight: 61.0, club: 'ClubY' }),
    b({ yob: 2010, weight: 62.0, club: 'ClubX' }),
  ]});

  const doc = await spars();
  assertSparsDoc(doc, 's2.spars');

  assert.equal(doc.summary.matchCount,     1, 'one bout entry');
  assert.equal(doc.summary.groupCount,     1, 'one group formed');
  assert.equal(doc.summary.matchedCount,   3, 'all 3 boxers matched');
  assert.equal(doc.summary.unmatchedCount, 0, 'nobody left unmatched');
  assert.ok(doc.matches[0].third != null, 'match.third is set');
  assert.ok(doc.matches[0].groupId != null, 'match.groupId is set');
});

// Scenario 3: senior yob=2007 never routed to R5
// isBothSenior → preferred rings are R1/R2
test('scenario 3: yob=2007 senior pair assigned to R1/R2, never R5', async () => {
  await reset(); _id = 0;
  await putBuckets({ SeniorMale: [
    b({ yob: 2007, weight: 72.0, club: 'ClubX' }),
    b({ yob: 2007, weight: 72.5, club: 'ClubY' }),
  ]});
  await spars();
  const doc = await schedule();
  assertScheduleDoc(doc, 's3.sched');

  for (const slot of doc.slots)
    for (const bout of slot.bouts)
      assert.notEqual(bout.ring, 'R5', `yob=2007 senior pair in R5 (got ${bout.ring})`);
});

// Scenario 4: yob=2008 Youth males — NOT R5-eligible (isR5Eligible uses yob>=2009)
// Falls into the 4th distribution group → preferred R2/R3/R4
test('scenario 4: yob=2008 youth pair not R5-eligible, assigned to R2/R3/R4', async () => {
  await reset(); _id = 0;
  await putBuckets({ YouthMale: [
    b({ yob: 2008, weight: 55.0, club: 'ClubX' }),
    b({ yob: 2008, weight: 55.5, club: 'ClubY' }),
  ]});
  await spars();
  const doc = await schedule();
  assertScheduleDoc(doc, 's4.sched');

  for (const slot of doc.slots)
    for (const bout of slot.bouts)
      assert.notEqual(bout.ring, 'R5',
        `yob=2008 youth pair must not be R5 (got ${bout.ring})`);
});

// Scenario 5: all-same-club roster — pairing still happens
// Club avoidance is a preference, not a hard rule.
test('scenario 5: all same club — boxers still get paired', async () => {
  await reset(); _id = 0;
  await putBuckets({ SeniorMale: [
    b({ yob: 2000, weight: 70.0, club: 'ClubA' }),
    b({ yob: 2000, weight: 70.5, club: 'ClubA' }),
    b({ yob: 2000, weight: 71.0, club: 'ClubA' }),
    b({ yob: 2000, weight: 71.5, club: 'ClubA' }),
  ]});

  const doc = await spars();
  assertSparsDoc(doc, 's5.spars');

  assert.equal(doc.summary.matchCount,     2, '4 same-club boxers → 2 matches');
  assert.equal(doc.summary.unmatchedCount, 0, 'nobody unmatched');
});

// Scenario 6: phase-3b fails — outlier too heavy to join any existing pair
// 3 boxers: 60, 61, 75 kg. Phase 1 matches 60+61; 75 can't join (15 kg gap).
test('scenario 6: outlier boxer stays unmatched after all three phases', async () => {
  await reset(); _id = 0;
  await putBuckets({ SeniorMale: [
    b({ yob: 2000, weight: 60.0, club: 'ClubX' }),
    b({ yob: 2000, weight: 61.0, club: 'ClubY' }),
    b({ yob: 2000, weight: 75.0, club: 'ClubX' }),
  ]});

  const doc = await spars();
  assertSparsDoc(doc, 's6.spars');

  assert.equal(doc.summary.matchCount,     1, '60+61 form one match');
  assert.equal(doc.summary.groupCount,     0, 'no group formed');
  assert.equal(doc.summary.unmatchedCount, 1, '75 kg boxer stays unmatched');
  assert.equal(doc.unmatched[0].weight,    75.0, '75 kg is the unmatched boxer');
});
