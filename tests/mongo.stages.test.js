// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// MongoDB stage-correctness: runs the REAL netlify handlers against an in-memory
// mongod and asserts each persisted collection is correct, chained end to end
//   boxers -> buckets -> spars -> schedule
// verifying document shape AND data integrity across all four stages.
//
// Run with:  node --test --test-force-exit

const { test, before, after } = require('node:test');
const assert                  = require('node:assert/strict');
const fs                      = require('node:fs');

const HierarchicalFilter     = require('../hierarchical-filter');
const { tscBucketStructure } = require('../PutAllFightersinBuckets');
const importBoxers           = require('../netlify/functions/import-boxers');
const dbFn                   = require('../netlify/functions/db');
const sparsFn                = require('../netlify/functions/generate-spars');
const scheduleFn             = require('../netlify/functions/generate-schedule');

const {
  startMongo, stopMongo, invoke, TODAY,
  assertBoxerDoc, assertBucketsDoc, assertSparsDoc, assertScheduleDoc,
} = require('./helpers/mongo');

// --- harness ---------------------------------------------------------------

let ctx; // { server, client, db }

before(async () => { ctx = await startMongo(); });
after(async () => {
  // Release each handler's cached mongo client, then drop the in-memory server,
  // so node --test exits cleanly (no lingering sockets).
  await Promise.all([dbFn, sparsFn, scheduleFn, importBoxers].map(m => m._closeDb()));
  await stopMongo(ctx);
});

async function reset() {
  await Promise.all(['boxers', 'buckets', 'spars', 'schedule']
    .map(name => ctx.db.collection(name).deleteMany({})));
}

// --- synthetic roster (mirrors pipeline.e2e style) -------------------------

let _id = 0;
function b(over) {
  return { id: ++_id, name: `B${_id}`, club: 'ClubA', gender: 'male', yob: 2000,
           fit: 'yes', weight: 70, experience: 0, sparsPerDay: 1, ...over };
}

function makeRoster() {
  _id = 0;
  const roster = [];
  for (let i = 0; i < 6; i++)  // senior males, paired weights, mixed clubs
    roster.push(b({ yob: 2000, weight: 60 + i, experience: 2, club: i % 2 ? 'ClubX' : 'ClubY' }));
  // boundary seniors: yob 2007 is Senior everywhere — must never route to R5
  roster.push(b({ yob: 2007, weight: 72.0, experience: 2, club: 'ClubX' }),
              b({ yob: 2007, weight: 72.5, experience: 2, club: 'ClubY' }));
  for (let i = 0; i < 6; i++)  // junior males (R5-eligible)
    roster.push(b({ yob: 2010, weight: 40 + i, experience: 1, club: i % 2 ? 'ClubX' : 'ClubY' }));
  for (let i = 0; i < 4; i++)  // females
    roster.push(b({ gender: 'female', yob: 2000, weight: 55 + i, experience: 3, club: i % 2 ? 'ClubX' : 'ClubY' }));
  roster.push(b({ fit: 'no' }), b({ fit: 'no', gender: 'female' })); // unfit
  return roster;
}

function bucketize(boxers) {
  const orig = console.log; console.log = () => {};
  try {
    return new HierarchicalFilter(boxers)
      .buildTree(tscBucketStructure).applyFilters().getFinalBuckets();
  } finally { console.log = orig; }
}

// Build + persist the buckets doc the way the app does (client builds, PUTs via db.js).
async function putBuckets(finalBuckets) {
  const nonNotfit = Object.entries(finalBuckets)
    .filter(([k]) => k !== 'Notfit').reduce((n, [, v]) => n + v.length, 0);
  const body = JSON.stringify({ finalBuckets, summary: { totalDistributed: nonNotfit } });
  const r = await invoke(dbFn.handler,
    { httpMethod: 'PUT', queryStringParameters: { key: 'buckets' }, body });
  assert.equal(r.statusCode, 200, 'PUT buckets ok');
}

const idsIn = arr => new Set(arr.map(x => x.id));
const matchBoxers = m => [m.red, m.blue, m.third].filter(Boolean);

// =========================================================================

test('stage boxers: db.js PUT then GET round-trips a well-formed boxer collection', async () => {
  await reset();
  const roster = makeRoster();

  const put = await invoke(dbFn.handler,
    { httpMethod: 'PUT', queryStringParameters: { key: 'boxers' }, body: JSON.stringify(roster) });
  assert.equal(put.statusCode, 200);

  const got = await invoke(dbFn.handler,
    { httpMethod: 'GET', queryStringParameters: { key: 'boxers' } });
  assert.equal(got.statusCode, 200);
  assert.equal(got.data.length, roster.length, 'all boxers stored');
  got.data.forEach((bx, i) => {
    assertBoxerDoc(bx, `boxers[${i}]`);
    assert.equal(bx._id, undefined, 'GET strips _id');
  });

  // every stored boxer id is present, none lost or duplicated
  assert.deepEqual([...idsIn(got.data)].sort((a, c) => a - c),
                   roster.map(x => x.id).sort((a, c) => a - c));
});

test('stage buckets: real bucket logic persists a valid buckets doc with no boxer lost', async () => {
  await reset();
  const roster  = makeRoster();
  const buckets = bucketize(roster);
  await putBuckets(buckets);

  const doc = await ctx.db.collection('buckets').findOne({ _id: 'current' });
  assertBucketsDoc(doc, 'buckets.current');

  const allBucketed = Object.values(doc.finalBuckets).flat();
  assert.equal(allBucketed.length, roster.length, 'every boxer is in some bucket');
  assert.deepEqual([...idsIn(allBucketed)].sort((a, c) => a - c),
                   roster.map(x => x.id).sort((a, c) => a - c), 'no boxer lost/duplicated');
});

test('stage spars: generate-spars reads buckets, writes valid spars to current + today', async () => {
  await reset();
  const roster  = makeRoster();
  const buckets = bucketize(roster);
  await putBuckets(buckets);

  const res = await invoke(sparsFn.handler, {});
  assert.equal(res.statusCode, 200, 'generate-spars ok');
  assertSparsDoc(res.data, 'spars.response');

  const current = await ctx.db.collection('spars').findOne({ _id: 'current' });
  const dated   = await ctx.db.collection('spars').findOne({ _id: TODAY });
  assertSparsDoc(current, 'spars.current');
  assertSparsDoc(dated,   'spars.today');
  assert.equal(current.summary.matchCount, dated.summary.matchCount, 'current == today archive');

  // fit non-Notfit boxers are exactly matched ∪ unmatched (none vanish, none extra)
  const fitIds = idsIn(Object.entries(buckets)
    .filter(([k]) => k !== 'Notfit').flatMap(([, v]) => v));
  const sparIds = new Set();
  current.matches.forEach(m => matchBoxers(m).forEach(x => sparIds.add(x.id)));
  current.unmatched.forEach(x => sparIds.add(x.id));
  assert.deepEqual([...sparIds].sort((a, c) => a - c), [...fitIds].sort((a, c) => a - c),
    'spars cover exactly the fit bucketed boxers');

  // no Notfit boxer ever appears in a bout
  const notfitIds = idsIn(buckets.Notfit || []);
  for (const m of current.matches)
    for (const x of matchBoxers(m))
      assert.ok(!notfitIds.has(x.id), `unfit boxer ${x.name} must not be matched`);

  assert.equal(current.summary.matchedCount,
    current.matches.reduce((n, m) => n + (m.third ? 3 : 2), 0), 'matchedCount consistent');
});

test('stage schedule: generate-schedule reads spars, writes valid schedule to current + today', async () => {
  await reset();
  const roster  = makeRoster();
  await putBuckets(bucketize(roster));
  await invoke(sparsFn.handler, {});

  const res = await invoke(scheduleFn.handler, { queryStringParameters: {} });
  assert.equal(res.statusCode, 200, 'generate-schedule ok');
  assertScheduleDoc(res.data, 'schedule.response');

  const current = await ctx.db.collection('schedule').findOne({ _id: 'current' });
  const dated   = await ctx.db.collection('schedule').findOne({ _id: TODAY });
  assertScheduleDoc(current, 'schedule.current');
  assertScheduleDoc(dated,   'schedule.today');

  const sparsDoc = await ctx.db.collection('spars').findOne({ _id: 'current' });

  // every match scheduled exactly once; no ring double-booked within a slot
  const seen = new Set();
  let scheduled = 0;
  for (const slot of current.slots) {
    const rings = slot.bouts.map(x => x.ring);
    assert.equal(new Set(rings).size, rings.length, `slot ${slot.slot} double-books a ring`);
    for (const bt of slot.bouts) {
      const isFemale = [bt.red, bt.blue, bt.third].some(x => x && x.gender === 'female');
      const bothSenior = [bt.red, bt.blue, bt.third].filter(Boolean)
        .every(x => x.gender === 'male' && x.yob <= 2007);
      if (isFemale)   assert.equal(bt.ring, 'R5', 'female bout must be R5');
      if (bothSenior) assert.notEqual(bt.ring, 'R5', 'both-senior bout must not be R5');
      assert.ok(!seen.has(bt.sparId), `${bt.sparId} scheduled twice`);
      seen.add(bt.sparId); scheduled++;
    }
  }
  assert.equal(scheduled, sparsDoc.matches.length, 'every spar match scheduled exactly once');

  // regression: senior boundary is yob<=2007 (must match RingAssigner.js / buckets).
  // A 2007 senior pair must be COUNTED as senior, not as youth/cross-age.
  const bothSenior2007 = current.slots.flatMap(s => s.bouts)
    .filter(bt => [bt.red, bt.blue, bt.third].filter(Boolean)
      .every(x => x.gender === 'male' && x.yob <= 2007)).length;
  assert.equal(current.summary.seniorMale, bothSenior2007,
    'summary.seniorMale uses the yob<=2007 boundary');
});

test('full round-trip: boxers -> buckets -> spars -> schedule preserves every boxer', async () => {
  await reset();
  const roster = makeRoster();

  await invoke(dbFn.handler,
    { httpMethod: 'PUT', queryStringParameters: { key: 'boxers' }, body: JSON.stringify(roster) });
  const buckets = bucketize(roster);
  await putBuckets(buckets);
  await invoke(sparsFn.handler, {});
  await invoke(scheduleFn.handler, { queryStringParameters: {} });

  const boxersCol = await ctx.db.collection('boxers').find({}).toArray();
  const bucketDoc = await ctx.db.collection('buckets').findOne({ _id: 'current' });
  const sparsDoc  = await ctx.db.collection('spars').findOne({ _id: 'current' });
  const schedDoc  = await ctx.db.collection('schedule').findOne({ _id: 'current' });

  const rosterIds = roster.map(x => x.id).sort((a, c) => a - c);

  // boxers + buckets hold the whole roster
  assert.deepEqual([...idsIn(boxersCol)].sort((a, c) => a - c), rosterIds, 'boxers collection complete');
  assert.deepEqual([...idsIn(Object.values(bucketDoc.finalBuckets).flat())].sort((a, c) => a - c),
                   rosterIds, 'buckets hold whole roster');

  // spars hold exactly the fit bucketed boxers (Notfit excluded), none duplicated
  const fitIds = [...idsIn(Object.entries(buckets).filter(([k]) => k !== 'Notfit').flatMap(([, v]) => v))];
  const sparIds = [];
  sparsDoc.matches.forEach(m => matchBoxers(m).forEach(x => sparIds.push(x.id)));
  sparsDoc.unmatched.forEach(x => sparIds.push(x.id));
  assert.equal(new Set(sparIds).size, sparIds.length, 'no boxer duplicated across spars');
  assert.deepEqual([...new Set(sparIds)].sort((a, c) => a - c), fitIds.sort((a, c) => a - c),
    'spars == fit bucketed boxers');

  // schedule holds exactly the spar matches
  const schedSparIds = schedDoc.slots.flatMap(s => s.bouts.map(x => x.sparId));
  assert.equal(new Set(schedSparIds).size, schedSparIds.length, 'no match scheduled twice');
  assert.equal(schedSparIds.length, sparsDoc.matches.length, 'all matches scheduled');
});

test('db.js semantics: PATCH, dates list, absent single-doc, and delete', async () => {
  await reset();
  const roster = makeRoster();
  await invoke(dbFn.handler,
    { httpMethod: 'PUT', queryStringParameters: { key: 'boxers' }, body: JSON.stringify(roster) });

  // PATCH one boxer by id
  const patch = await invoke(dbFn.handler,
    { httpMethod: 'PATCH', queryStringParameters: { key: 'boxers', id: '1' },
      body: JSON.stringify({ weight: 99.9 }) });
  assert.equal(patch.statusCode, 200);
  assert.equal((await ctx.db.collection('boxers').findOne({ id: 1 })).weight, 99.9);

  // produce a dated spars archive, then list dates
  await putBuckets(bucketize(roster));
  await invoke(sparsFn.handler, {});
  const dates = await invoke(dbFn.handler,
    { httpMethod: 'GET', queryStringParameters: { key: 'spars', dates: '1' } });
  assert.equal(dates.statusCode, 200);
  assert.ok(dates.data.includes(TODAY), 'dates list includes today');

  // absent single-doc -> 200 null
  const absent = await invoke(dbFn.handler,
    { httpMethod: 'GET', queryStringParameters: { key: 'schedule' } });
  assert.equal(absent.statusCode, 200);
  assert.equal(absent.data, null);

  // PUT null deletes current
  await invoke(dbFn.handler,
    { httpMethod: 'PUT', queryStringParameters: { key: 'spars' }, body: 'null' });
  assert.equal(await ctx.db.collection('spars').findOne({ _id: 'current' }), null);
});

test('real CSV: full chain over the live registration roster (skips if CSV absent)', async (t) => {
  if (!fs.existsSync(importBoxers.BOXERS_CSV)) { t.skip('registration CSV not present'); return; }
  await reset();

  const imp = await invoke(importBoxers.handler, { httpMethod: 'POST' });
  assert.equal(imp.statusCode, 200, 'import-boxers ok');
  assert.ok(imp.data.imported > 0, 'imported some boxers');

  const stored = await ctx.db.collection('boxers').find({}).toArray();
  assert.equal(stored.length, imp.data.imported, 'boxers persisted');
  stored.forEach((bx, i) => assertBoxerDoc(bx, `realBoxers[${i}]`));

  // buckets from the real roster, then spars + schedule
  await putBuckets(bucketize(stored.map(({ _id, ...d }) => d)));
  const spars = await invoke(sparsFn.handler, {});
  assert.equal(spars.statusCode, 200);
  assertSparsDoc(await ctx.db.collection('spars').findOne({ _id: 'current' }), 'real.spars');

  const sched = await invoke(scheduleFn.handler, { queryStringParameters: {} });
  assert.equal(sched.statusCode, 200);
  assertScheduleDoc(await ctx.db.collection('schedule').findOne({ _id: 'current' }), 'real.schedule');
});
