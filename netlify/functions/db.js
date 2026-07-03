const { MongoClient } = require('mongodb');

const SINGLE_DOC_KEYS = new Set(['spars', 'schedule', 'buckets']);

const json = (statusCode, data) => ({ statusCode, headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });

let cachedClient;

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('boxing');
}

exports.handler = async (event) => {
  const key = event.queryStringParameters?.key;
  if (!key) return json(400, { error: 'key required' });

  try {
    const db = await getDb();
    const col = db.collection(key);

    if (event.httpMethod === 'GET') {
      if (SINGLE_DOC_KEYS.has(key)) {
        // ?dates=1 → return list of date-stamped IDs for this collection
        if (event.queryStringParameters?.dates === '1') {
          const docs = await col.find({ _id: /^\d{4}-\d{2}-\d{2}$/ }).sort({ _id: -1 }).toArray();
          return json(200, docs.map(d => d._id));
        }
        const id = event.queryStringParameters?.date || 'current';
        const doc = await col.findOne({ _id: id });
        if (!doc) return json(200, null);
        const { _id, ...data } = doc;
        return json(200, data);
      }
      const docs = await col.find({}).toArray();
      return json(200, docs.map(({ _id, ...d }) => d));
    }

    if (event.httpMethod === 'PUT') {
      const data = JSON.parse(event.body);
      if (SINGLE_DOC_KEYS.has(key)) {
        if (data === null) {
          await col.deleteOne({ _id: 'current' });
        } else {
          await col.replaceOne({ _id: 'current' }, { _id: 'current', ...data }, { upsert: true });
        }
      } else {
        await col.deleteMany({});
        if (Array.isArray(data) && data.length > 0) await col.insertMany(data);
      }
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'PATCH') {
      const id = parseInt(event.queryStringParameters?.id);
      if (!id) return json(400, { error: 'id required' });
      const fields = JSON.parse(event.body);
      await col.updateOne({ id }, { $set: fields });
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return json(500, { error: e.message });
  }
};

// Test-only: release the cached connection so the event loop can drain.
exports._closeDb = async () => { if (cachedClient) { await cachedClient.close(); cachedClient = undefined; } };
