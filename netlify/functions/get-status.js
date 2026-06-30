const { MongoClient } = require('mongodb');

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

exports.handler = async () => {
  try {
    const db = await getDb();
    const [boxerCount, bucketsDoc, sparsDoc] = await Promise.all([
      db.collection('boxers').countDocuments(),
      db.collection('buckets').findOne({ _id: 'current' }, { projection: { _id: 1 } }),
      db.collection('spars').findOne({ _id: 'current' }, { projection: { summary: 1 } })
    ]);
    return {
      statusCode: 200,
      body: JSON.stringify({
        boxerCount,
        bucketsReady: !!bucketsDoc,
        latestSpars: sparsDoc?.summary ?? null,
        pipelineReady: boxerCount > 0 && !!bucketsDoc
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

exports._closeDb = async () => { if (cachedClient) { await cachedClient.close(); cachedClient = undefined; } };
