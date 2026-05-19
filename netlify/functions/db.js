const { MongoClient } = require('mongodb');

const SINGLE_DOC_KEYS = new Set(['spars', 'schedule', 'buckets']);

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
  if (!key) return { statusCode: 400, body: JSON.stringify({ error: 'key required' }) };

  try {
    const db = await getDb();
    const col = db.collection(key);

    if (event.httpMethod === 'GET') {
      if (SINGLE_DOC_KEYS.has(key)) {
        const doc = await col.findOne({ _id: 'current' });
        if (!doc) return { statusCode: 200, body: JSON.stringify(null) };
        const { _id, ...data } = doc;
        return { statusCode: 200, body: JSON.stringify(data) };
      }
      const docs = await col.find({}).toArray();
      return { statusCode: 200, body: JSON.stringify(docs.map(({ _id, ...d }) => d)) };
    }

    if (event.httpMethod === 'PUT') {
      const data = JSON.parse(event.body);
      if (SINGLE_DOC_KEYS.has(key)) {
        await col.replaceOne({ _id: 'current' }, { _id: 'current', ...data }, { upsert: true });
      } else {
        await col.deleteMany({});
        if (Array.isArray(data) && data.length > 0) await col.insertMany(data);
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
