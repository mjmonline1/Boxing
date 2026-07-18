// Netlify counterpart to Server.js GET /api/rig/diff — auto-vs-coach survival per day + aggregate,
// from the Mongo spars docs (Server.js reads output/Spars files). Aggregation is the shared pure
// RigDiff.diffMany, so file and Mongo paths stay identical.
const { MongoClient } = require('mongodb');
const { diffMany } = require('../../rig/diff');

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

exports.handler = async () => {
  try {
    const db = await getDb();
    const docs = await db.collection('spars').find({ _id: /^\d{4}-\d{2}-\d{2}$/ }).sort({ _id: 1 }).toArray();
    const entries = docs.map(d => ({ date: d._id, spars: d }));
    return { statusCode: 200, body: JSON.stringify(diffMany(entries)) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

exports._closeDb = async () => { if (cachedClient) { await cachedClient.close(); cachedClient = undefined; } };
