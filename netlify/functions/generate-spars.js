// Reads buckets from MongoDB, runs 3-phase pairing algorithm, writes spars back.
// The pairing algorithm itself lives in ../../SparMaker (pairAll) — shared with the
// file-mode pipeline so there is exactly one source of truth for matching logic.
const { MongoClient } = require('mongodb');
const { pairAll }     = require('../../SparMaker');

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

exports.handler = async () => {
  try {
    const db = await getDb();
    const bucketsDoc = await db.collection('buckets').findOne({ _id: 'current' });
    if (!bucketsDoc?.finalBuckets) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No bucket data. Run BucketAssigner first.' }) };
    }

    const { matches: allMatches, unmatched: stillRemaining, groupCount, phases } =
      pairAll(bucketsDoc.finalBuckets);

    const unmatchedView = list => [...list]
      .sort((a, b) => a.weight - b.weight)
      .map(b => ({ name: b.name, weight: b.weight, experience: b.experience, club: b.club }));
    const boutView = m => ({ red: m.red.name, redWeight: m.red.weight, blue: m.blue.name, blueWeight: m.blue.weight, weightDiff: m.weightDiff, category: m.category });

    const phase1Unmatched = unmatchedView(phases.phase1.unmatched);
    const phase1Bouts     = phases.phase1.matches.map(boutView);
    const phase2Unmatched = unmatchedView(phases.phase2.unmatched);
    const phase2Bouts     = phases.phase2.matches.map(boutView);
    const phase3Unmatched = unmatchedView(phases.phase3.unmatched);
    const phase3Groups    = phases.phase3.groups.map(m => ({ groupId: m.groupId, red: m.red.name, redWeight: m.red.weight, blue: m.blue.name, blueWeight: m.blue.weight, third: m.third.name, thirdWeight: m.third.weight, category: m.category }));

    const total = bucketsDoc.summary?.totalDistributed ?? (allMatches.length * 2 + stillRemaining.length);
    const result = {
      summary: {
        totalBoxers:    total,
        matchedCount:   allMatches.reduce((n, m) => n + (m.third ? 3 : 2), 0),
        unmatchedCount: stillRemaining.length,
        matchCount:     allMatches.length,
        groupCount,
        successRate:    (((total - stillRemaining.length) / total) * 100).toFixed(1) + '%'
      },
      matches:   allMatches,
      unmatched: stillRemaining,
      phaseLog:  {
        phase1: phase1Unmatched, phase1Bouts,
        phase2: phase2Unmatched, phase2Bouts,
        phase3: phase3Unmatched, phase3Groups
      }
    };

    const today = new Date().toISOString().split('T')[0];
    await db.collection('spars').replaceOne({ _id: 'current' }, { _id: 'current', ...result }, { upsert: true });
    await db.collection('spars').replaceOne({ _id: today },     { _id: today,     ...result }, { upsert: true });

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

// Test-only: release the cached connection so the event loop can drain.
exports._closeDb = async () => { if (cachedClient) { await cachedClient.close(); cachedClient = undefined; } };
