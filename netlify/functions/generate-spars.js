// Reads buckets from MongoDB, runs 3-phase pairing algorithm, writes spars back.
const { MongoClient } = require('mongodb');

const W_TOL1 = 2.0, W_TOL2 = 2.5;

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

function pairBoxers(boxers, category, tolerance, sparCount) {
  const sorted = [...boxers].sort((a, b) => a.weight - b.weight);
  const matches = [], unmatched = [];
  while (sorted.length > 0) {
    const cur = sorted.shift();
    let bestIdx = -1, diffClub = false, minDiff = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const opp = sorted[i];
      const diff = Math.abs(cur.weight - opp.weight);
      if (diff > tolerance) break;
      // Skip if sparCount provided and opponent has reached their sparsPerDay limit
      if (sparCount && (sparCount.get(opp.name) || 0) >= (opp.sparsPerDay || 1)) continue;
      const isDiff = cur.club !== opp.club;
      if (isDiff && !diffClub) { bestIdx = i; diffClub = true; minDiff = diff; }
      else if (isDiff === diffClub && diff < minDiff) { bestIdx = i; minDiff = diff; }
    }
    if (bestIdx !== -1) {
      const opp = sorted.splice(bestIdx, 1)[0];
      if (sparCount) {
        sparCount.set(cur.name,  (sparCount.get(cur.name)  || 0) + 1);
        sparCount.set(opp.name,  (sparCount.get(opp.name)  || 0) + 1);
      }
      matches.push({ red: cur, blue: opp, weightDiff: Math.abs(cur.weight - opp.weight).toFixed(2), category });
    } else {
      unmatched.push(cur);
    }
  }
  return { matches, unmatched };
}

exports.handler = async () => {
  try {
    const db = await getDb();
    const bucketsDoc = await db.collection('buckets').findOne({ _id: 'current' });
    if (!bucketsDoc?.finalBuckets) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No bucket data. Run BucketAssigner first.' }) };
    }

    const buckets = bucketsDoc.finalBuckets;
    let allMatches = [], bucketRemainder = {};

    // sparCount tracks 1v1 usage across all phases (keyed by boxer name)
    const sparCount = new Map();

    // Phase 1: ±2 kg within bucket
    for (const [cat, boxers] of Object.entries(buckets)) {
      if (cat === 'NotFit' || !boxers.length) continue;
      const { matches, unmatched } = pairBoxers(boxers, cat, W_TOL1, sparCount);
      allMatches = allMatches.concat(matches);
      bucketRemainder[cat] = unmatched;
    }

    const phase1Unmatched = Object.values(bucketRemainder).flat()
      .sort((a,b) => a.weight - b.weight)
      .map(b => ({ name: b.name, weight: b.weight, experience: b.experience, club: b.club }));

    // Phase 2: ±2.5 kg within bucket — tag remainders with source bucket
    let allUnmatched = [];
    for (const [cat, boxers] of Object.entries(bucketRemainder)) {
      if (!boxers.length) continue;
      const { matches, unmatched } = pairBoxers(boxers, cat, W_TOL2, sparCount);
      allMatches = allMatches.concat(matches);
      allUnmatched = allUnmatched.concat(unmatched.map(b => ({ ...b, _bucket: cat })));
    }

    const phase2Unmatched = [...allUnmatched]
      .sort((a,b) => a.weight - b.weight)
      .map(b => ({ name: b.name, weight: b.weight, experience: b.experience, club: b.club }));

    // Phase 3b: unmatched boxer joins existing 1v1 pair in same bucket → round-robin group (±2 kg)
    let groupCounter = 0;
    const stillRemaining = [];

    for (const boxer of allUnmatched) {
      const bucket = boxer._bucket;
      let bestIdx = -1, bestDiff = Infinity, bestIsDiffClub = false;

      for (let i = 0; i < allMatches.length; i++) {
        const m = allMatches[i];
        if (m.groupId) continue;          // already in a group
        if (m.category !== bucket) continue; // same bucket only

        for (const partner of [m.red, m.blue]) {
          const diff = Math.abs(boxer.weight - partner.weight);
          if (diff > W_TOL1) continue;    // ±2 kg tolerance
          const isDiffClub = boxer.club !== partner.club;
          if (isDiffClub && !bestIsDiffClub) {
            bestIdx = i; bestDiff = diff; bestIsDiffClub = true;
          } else if (isDiffClub === bestIsDiffClub && diff < bestDiff) {
            bestIdx = i; bestDiff = diff;
          }
        }
      }

      if (bestIdx !== -1) {
        const anchor = allMatches[bestIdx];
        const gid = `g${++groupCounter}`;
        anchor.groupId = gid;
        allMatches.push({
          red: anchor.red, blue: boxer,
          weightDiff: Math.abs(anchor.red.weight - boxer.weight).toFixed(2),
          category: bucket, groupId: gid
        });
        allMatches.push({
          red: anchor.blue, blue: boxer,
          weightDiff: Math.abs(anchor.blue.weight - boxer.weight).toFixed(2),
          category: bucket, groupId: gid
        });
      } else {
        stillRemaining.push(boxer);
      }
    }

    const phase3Unmatched = [...stillRemaining]
      .sort((a,b) => a.weight - b.weight)
      .map(b => ({ name: b.name, weight: b.weight, experience: b.experience, club: b.club }));

    // Rename _bucket to category on unmatched, strip from matched boxer objects
    allMatches.forEach(m => { delete m.red._bucket; delete m.blue._bucket; });
    stillRemaining.forEach(b => { b.category = b._bucket; delete b._bucket; });

    const groupCount = groupCounter;
    const total = bucketsDoc.summary?.totalDistributed ?? (allMatches.length * 2 + stillRemaining.length);
    const result = {
      summary: {
        totalBoxers:    total,
        matchedCount:   allMatches.filter(m => !m.groupId).length * 2 + groupCount * 3,
        unmatchedCount: stillRemaining.length,
        matchCount:     allMatches.length,
        groupCount,
        successRate:    (((total - stillRemaining.length) / total) * 100).toFixed(1) + '%'
      },
      matches:   allMatches,
      unmatched: stillRemaining,
      phaseLog:  { phase1: phase1Unmatched, phase2: phase2Unmatched, phase3: phase3Unmatched }
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
