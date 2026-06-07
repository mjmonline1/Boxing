// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Shared harness for MongoDB stage tests: spins a throwaway in-memory mongod,
// points the netlify handlers' MONGODB_URI at it, and exposes a verification
// client plus per-collection document validators.

const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient }       = require('mongodb');
const assert                = require('node:assert/strict');

// Start an in-memory mongod and set MONGODB_URI BEFORE any handler connects
// (handlers connect lazily off process.env.MONGODB_URI on first call).
async function startMongo() {
  const server = await MongoMemoryServer.create();
  const uri    = server.getUri();
  process.env.MONGODB_URI = uri;
  const client = new MongoClient(uri);
  await client.connect();
  return { server, client, db: client.db('boxing') };
}

async function stopMongo(ctx) {
  if (ctx?.client) await ctx.client.close();
  if (ctx?.server) await ctx.server.stop();
}

// Call a netlify handler, parse its JSON body. Returns { statusCode, data }.
async function invoke(handler, event = {}) {
  const res  = await handler(event);
  const data = res.body == null ? null : JSON.parse(res.body);
  return { statusCode: res.statusCode, data };
}

const TODAY = new Date().toISOString().split('T')[0];

// --- document validators (throw on first violation) -----------------------

function assertBoxerDoc(b, label = 'boxer') {
  assert.equal(typeof b.id,         'number', `${label}: id is number`);
  assert.equal(typeof b.name,       'string', `${label}: name is string`);
  assert.equal(typeof b.club,       'string', `${label}: club is string`);
  assert.ok(['male', 'female'].includes(b.gender), `${label}: gender male|female (got ${b.gender})`);
  assert.equal(typeof b.yob,        'number', `${label}: yob is number`);
  assert.equal(typeof b.weight,     'number', `${label}: weight is number`);
  assert.equal(typeof b.experience, 'number', `${label}: experience is number`);
}

function assertBucketsDoc(doc, label = 'buckets') {
  assert.ok(doc,                       `${label}: doc exists`);
  assert.equal(typeof doc.finalBuckets, 'object', `${label}: finalBuckets is object`);
  assert.notEqual(doc.finalBuckets, null,         `${label}: finalBuckets not null`);
  for (const [cat, arr] of Object.entries(doc.finalBuckets)) {
    assert.ok(Array.isArray(arr), `${label}: bucket "${cat}" is an array`);
    for (const b of arr) assertBoxerDoc(b, `${label}.${cat}`);
  }
  assert.equal(typeof doc.summary, 'object', `${label}: summary is object`);
}

function assertMatch(m, label = 'match') {
  assert.equal(typeof m.red,  'object', `${label}: red is object`);
  assert.equal(typeof m.blue, 'object', `${label}: blue is object`);
  assertBoxerDoc(m.red,  `${label}.red`);
  assertBoxerDoc(m.blue, `${label}.blue`);
  assert.ok(m.third == null || typeof m.third === 'object', `${label}: third absent|null|object`);
  if (m.third) assertBoxerDoc(m.third, `${label}.third`);
  assert.match(String(m.weightDiff), /^\d+\.\d{2}$/, `${label}: weightDiff is 2dp string`);
  assert.equal(typeof m.category, 'string', `${label}: category is string`);
  assert.ok(m.groupId === null || typeof m.groupId === 'string', `${label}: groupId null|string`);
}

function assertSparsDoc(doc, label = 'spars') {
  assert.ok(doc, `${label}: doc exists`);
  const s = doc.summary;
  assert.equal(typeof s, 'object', `${label}: summary is object`);
  for (const k of ['totalBoxers', 'matchedCount', 'unmatchedCount', 'matchCount', 'groupCount']) {
    assert.equal(typeof s[k], 'number', `${label}: summary.${k} is number`);
  }
  assert.match(String(s.successRate), /^\d+(\.\d+)?%$/, `${label}: successRate is percent string`);
  assert.ok(Array.isArray(doc.matches),   `${label}: matches is array`);
  assert.ok(Array.isArray(doc.unmatched), `${label}: unmatched is array`);
  doc.matches.forEach((m, i) => assertMatch(m, `${label}.matches[${i}]`));
  doc.unmatched.forEach((b, i) => assertBoxerDoc(b, `${label}.unmatched[${i}]`));
  assert.equal(typeof doc.phaseLog, 'object', `${label}: phaseLog is object`);
}

const RINGS = ['R1', 'R2', 'R3', 'R4', 'R5'];

function assertScheduleDoc(doc, label = 'schedule') {
  assert.ok(doc, `${label}: doc exists`);
  const s = doc.summary;
  assert.equal(typeof s, 'object', `${label}: summary is object`);
  assert.equal(s.strategy, 'GROUPED', `${label}: strategy GROUPED`);
  assert.equal(typeof s.totalMatches, 'number', `${label}: totalMatches is number`);
  assert.equal(typeof s.totalSlots,   'number', `${label}: totalSlots is number`);
  assert.equal(typeof s.matchesPerRing, 'object', `${label}: matchesPerRing is object`);
  for (const r of RINGS) assert.equal(typeof s.matchesPerRing[r], 'number', `${label}: matchesPerRing.${r}`);
  assert.ok(Array.isArray(doc.slots), `${label}: slots is array`);
  for (const slot of doc.slots) {
    assert.equal(typeof slot.slot, 'number', `${label}: slot.slot is number`);
    assert.ok(Array.isArray(slot.bouts), `${label}: slot.bouts is array`);
    for (const bt of slot.bouts) {
      assert.ok(RINGS.includes(bt.ring), `${label}: bout.ring in R1..R5 (got ${bt.ring})`);
      assert.equal(typeof bt.sparId,   'string', `${label}: bout.sparId is string`);
      assert.equal(typeof bt.category, 'string', `${label}: bout.category is string`);
      assert.equal(typeof bt.duration, 'number', `${label}: bout.duration is number`);
      assertBoxerDoc(bt.red,  `${label}.bout.red`);
      assertBoxerDoc(bt.blue, `${label}.bout.blue`);
      assert.ok(bt.third === null || typeof bt.third === 'object', `${label}: bout.third null|object`);
      assert.match(String(bt.weightDiff), /^\d+\.\d{2}$/, `${label}: bout.weightDiff 2dp`);
    }
  }
}

module.exports = {
  startMongo, stopMongo, invoke, TODAY,
  assertBoxerDoc, assertBucketsDoc, assertSparsDoc, assertScheduleDoc,
};
