// Reads buckets from MongoDB, runs 3-phase pairing algorithm, writes spars back.
// The pairing algorithm itself lives in ../../SparMaker (pairAll) — shared with the
// file-mode pipeline so there is exactly one source of truth for matching logic.
const { MongoClient } = require('mongodb');
const { pairAll, buildPhaseLog, checkMatchingRisks } = require('../../SparMaker');
const GroupUtils = require('../../group-utils');

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

exports.handler = async (event) => {
  try {
    const maxPhase  = parseInt(event?.queryStringParameters?.maxPhase) || 3;
    // Note: DB mode does not read cross-day output/Spars/<date>/Spars.json, so randomSelect's
    // priorPairs freshness is not wired here — randomness still applies within each run.
    const algorithm = ['optimal', 'randomSelect'].includes(event?.queryStringParameters?.algorithm)
      ? event.queryStringParameters.algorithm : 'greedy';
    const rawTrioTol = parseFloat(event?.queryStringParameters?.trioTol);
    const trioTol = Number.isFinite(rawTrioTol) ? Math.min(2.5, Math.max(2.0, rawTrioTol)) : undefined;
    const db = await getDb();
    const bucketsDoc = await db.collection('buckets').findOne({ _id: 'current' });
    if (!bucketsDoc?.finalBuckets) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No bucket data. Run BucketAssigner first.' }) };
    }

    const { matches: allMatches, unmatched: stillRemaining, manualMatch, groupCount, phases } =
      pairAll(bucketsDoc.finalBuckets, { maxPhase, algorithm, ...(trioTol != null ? { trioTol } : {}) });

    const total = bucketsDoc.summary?.totalDistributed ?? (allMatches.length * 2 + stillRemaining.length);
    const result = {
      summary: {
        totalBoxers:    total,
        matchedCount:   allMatches.reduce((n, m) => n + GroupUtils.membersOf(m).length, 0),
        unmatchedCount: stillRemaining.length,
        matchCount:     allMatches.length,
        groupCount,
        maxPhase,
        successRate:    (((total - stillRemaining.length) / total) * 100).toFixed(1) + '%'
      },
      matches:   allMatches,
      unmatched: stillRemaining,
      manualMatch,
      phaseLog:  buildPhaseLog(phases),
      matchRisks: checkMatchingRisks(allMatches, stillRemaining)
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
