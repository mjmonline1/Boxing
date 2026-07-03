const { MongoClient } = require('mongodb');

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'POST required' }) };
  try {
    const boxer = JSON.parse(event.body);
    if (!boxer?.name || !boxer?.club) return { statusCode: 400, body: JSON.stringify({ error: 'name and club required' }) };
    const db = await getDb();
    const col = db.collection('boxers');
    const last = await col.findOne({}, { sort: { id: -1 }, projection: { id: 1 } });
    const nextId = (last?.id ?? 0) + 1;
    const doc = { submissionDate: new Date().toISOString(), fit: 'yes', autoMatch: 'yes', sparsPerDay: 1, ...boxer, id: nextId };
    await col.insertOne(doc);
    const total = await col.countDocuments();
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: nextId, total }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

exports._closeDb = async () => { if (cachedClient) { await cachedClient.close(); cachedClient = undefined; } };
