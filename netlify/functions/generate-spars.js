// Reads buckets from MongoDB, runs 3-phase pairing algorithm, writes spars back.
const { MongoClient } = require('mongodb');

const W_TOL1 = 2.0, W_TOL2 = 2.5, W_TOL3 = 20.0;

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

function pairBoxers(boxers, category, tolerance) {
  const sorted = [...boxers].sort((a, b) => a.weight - b.weight);
  const matches = [], unmatched = [];
  while (sorted.length > 0) {
    const cur = sorted.shift();
    let bestIdx = -1, diffClub = false, minDiff = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const opp = sorted[i];
      const diff = Math.abs(cur.weight - opp.weight);
      if (diff > tolerance) break;
      const isDiff = cur.club !== opp.club;
      if (isDiff && !diffClub) { bestIdx = i; diffClub = true; minDiff = diff; }
      else if (isDiff === diffClub && diff < minDiff) { bestIdx = i; minDiff = diff; }
    }
    if (bestIdx !== -1) {
      const opp = sorted.splice(bestIdx, 1)[0];
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

    // Phase 1: ±2 kg within bucket
    for (const [cat, boxers] of Object.entries(buckets)) {
      if (cat === 'NotFit' || !boxers.length) continue;
      const { matches, unmatched } = pairBoxers(boxers, cat, W_TOL1);
      allMatches = allMatches.concat(matches);
      bucketRemainder[cat] = unmatched;
    }

    // Phase 2: ±2.5 kg within bucket
    let allUnmatched = [];
    for (const [cat, boxers] of Object.entries(bucketRemainder)) {
      if (!boxers.length) continue;
      const { matches, unmatched } = pairBoxers(boxers, cat, W_TOL2);
      allMatches = allMatches.concat(matches);
      allUnmatched = allUnmatched.concat(unmatched);
    }

    // Phase 3: ±20 kg rescue, same age+experience group
    const ageGroups = ['Schools', 'Junior', 'Youth', 'Senior'];
    const expTiers  = [{ name: 'Novice', min: 0, max: 5 }, { name: 'Experienced', min: 6, max: 10 }, { name: 'OpenClass', min: 11, max: Infinity }];
    const remaining = [];

    for (const grp of ageGroups) {
      for (const tier of expTiers) {
        const pool = allUnmatched.filter(b =>
          b.gender === 'male' && b.experience >= tier.min && b.experience <= tier.max &&
          ((grp==='Schools'&&b.yob>=2012&&b.yob<=2014)||(grp==='Junior'&&b.yob>=2010&&b.yob<=2011)||
           (grp==='Youth'&&b.yob>=2008&&b.yob<=2009)||(grp==='Senior'&&b.yob<=2007))
        );
        if (pool.length) {
          const { matches, unmatched } = pairBoxers(pool, `${grp}_${tier.name}_Rescue`, W_TOL3);
          allMatches = allMatches.concat(matches);
          remaining.push(...unmatched);
        }
      }
    }

    const femalePool = allUnmatched.filter(b => b.gender === 'female');
    if (femalePool.length) {
      const { matches, unmatched } = pairBoxers(femalePool, 'Female_Rescue', W_TOL3);
      allMatches = allMatches.concat(matches);
      remaining.push(...unmatched);
    }

    const total = bucketsDoc.summary?.totalDistributed ?? (allMatches.length * 2 + remaining.length);
    const result = {
      summary: { totalBoxers: total, matchedCount: allMatches.length * 2,
                 unmatchedCount: remaining.length, matchCount: allMatches.length,
                 successRate: ((allMatches.length * 2 / total) * 100).toFixed(1) + '%' },
      matches:   allMatches,
      unmatched: remaining
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
