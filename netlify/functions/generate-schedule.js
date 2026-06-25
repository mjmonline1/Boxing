// Reads spars from MongoDB, runs grouped ring allocation, writes schedule back.
const { MongoClient } = require('mongodb');
const { distributeGrouped, buildSlots, makeSummary,
        isBothSeniorMale, hasFemale, isR5Eligible, RINGS_ALL } = require('../../RingAssigner');

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

exports.handler = async (event) => {
  try {
    const day = parseInt(event.queryStringParameters?.day ?? '1');
    const db  = await getDb();

    const sparsDoc = await db.collection('spars').findOne({ _id: 'current' });
    if (!sparsDoc?.matches) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No spar data. Run SparManager first.' }) };
    }

    const matches = sparsDoc.matches.map((m, i) => ({ sparId: `S${i + 1}`, ...m }));
    const avg     = m => m.third ? (m.red.weight + m.blue.weight + m.third.weight) / 3 : (m.red.weight + m.blue.weight) / 2;
    matches.sort((a, b) => day % 2 === 1 ? avg(b) - avg(a) : avg(a) - avg(b));

    const queues  = distributeGrouped(matches);
    const slots   = buildSlots(queues);
    const summary = makeSummary('GROUPED', matches, queues, slots);

    const result = { summary, slots };
    const today = new Date().toISOString().split('T')[0];
    await db.collection('schedule').replaceOne({ _id: 'current' }, { _id: 'current', ...result }, { upsert: true });
    await db.collection('schedule').replaceOne({ _id: today },     { _id: today,     ...result }, { upsert: true });

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

// Test-only: release the cached connection so the event loop can drain.
exports._closeDb = async () => { if (cachedClient) { await cachedClient.close(); cachedClient = undefined; } };
