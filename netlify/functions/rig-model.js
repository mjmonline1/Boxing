// Netlify counterpart to Server.js GET /api/rig/model — the rig learning model, aggregated from
// the coach's past days stored in Mongo (Server.js reads output/Spars files instead). The pure
// aggregator is shared (rig/learn.js aggregateDays), so file and Mongo paths cannot drift.
const { MongoClient } = require('mongodb');
const { aggregateDays } = require('../../rig/learn');

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

exports.handler = async (event) => {
  const before = event.queryStringParameters?.before;
  try {
    const db = await getDb();
    // Date strings sort lexicographically = chronologically, so $lt gives "before this day".
    const query = { _id: /^\d{4}-\d{2}-\d{2}$/ };
    if (before) query._id = { $regex: /^\d{4}-\d{2}-\d{2}$/, $lt: before };
    const docs = await db.collection('spars').find(query).sort({ _id: 1 }).toArray();
    return { statusCode: 200, body: JSON.stringify(aggregateDays(docs)) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

exports._closeDb = async () => { if (cachedClient) { await cachedClient.close(); cachedClient = undefined; } };
