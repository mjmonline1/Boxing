const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { parseRawBoxers } = require('../../boxer-csv');

const BOXERS_CSV = path.join(__dirname, '../../data/Registered Boxer2026.csv');

function parseBoxers() {
  return parseRawBoxers(fs.readFileSync(BOXERS_CSV, 'utf8'));
}

let cachedClient;

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('boxing');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST required' }) };
  }

  try {
    const boxers = parseBoxers();
    const db = await getDb();

    // Reset all derived data before importing fresh boxers
    await Promise.all(['buckets', 'spars', 'schedule'].map(name =>
      db.collection(name).deleteMany({})
    ));

    const col = db.collection('boxers');
    await col.deleteMany({});
    await col.insertMany(boxers);
    return { statusCode: 200, body: JSON.stringify({ ok: true, imported: boxers.length }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

// Exposed for tests: the CSV->boxer-doc transform that feeds MongoDB.
exports.parseBoxers = parseBoxers;
exports.BOXERS_CSV  = BOXERS_CSV;
// Test-only: release the cached connection so the event loop can drain.
exports._closeDb = async () => { if (cachedClient) { await cachedClient.close(); cachedClient = undefined; } };
