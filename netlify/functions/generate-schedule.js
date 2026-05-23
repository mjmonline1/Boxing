// Reads spars from MongoDB, runs grouped ring allocation, writes schedule back.
const { MongoClient } = require('mongodb');

let cachedClient;
async function getDb() {
  if (!cachedClient) { cachedClient = new MongoClient(process.env.MONGODB_URI); await cachedClient.connect(); }
  return cachedClient.db('boxing');
}

const RINGS_OPEN = ['R1','R2','R3','R4'];
const RINGS_ALL  = ['R1','R2','R3','R4','R5'];

const isSeniorMale  = b => b.gender === 'male' && b.yob <= 2006;
const isBothSenior  = m => isSeniorMale(m.red) && isSeniorMale(m.blue);
const hasFemale     = m => m.red.gender === 'female' || m.blue.gender === 'female';
const isR5Eligible  = m => { const ok = b => b.gender==='female'||(b.gender==='male'&&b.yob>=2009); return ok(m.red)&&ok(m.blue); };
const boutDuration  = m => m.category?.includes('Senior') ? 11 : 8;

function distributeGrouped(matches) {
  const queues = Object.fromEntries(RINGS_ALL.map(r => [r, []]));
  const CAP    = Math.ceil(matches.length / RINGS_ALL.length);

  function fill(group, preferred, fallback) {
    for (const m of group) {
      const avail = preferred.filter(r => queues[r].length < CAP);
      const ring  = avail.length ? avail[0] : fallback.reduce((a, b) => queues[a].length <= queues[b].length ? a : b);
      queues[ring].push(m);
    }
  }

  fill(matches.filter(isBothSenior),                                        ['R1','R2'],       RINGS_OPEN);
  fill(matches.filter(hasFemale),                                           ['R5'],             ['R5']);
  fill(matches.filter(m =>  isR5Eligible(m) && !hasFemale(m)),             ['R3','R4','R5'],   RINGS_ALL);
  fill(matches.filter(m => !isBothSenior(m) && !hasFemale(m) && !isR5Eligible(m)), ['R2','R3','R4'], RINGS_OPEN);

  return queues;
}

function buildSlots(queues) {
  const active   = RINGS_ALL.filter(r => queues[r].length > 0);
  const maxSlots = Math.max(...active.map(r => queues[r].length));
  const slots    = [];
  for (let i = 0; i < maxSlots; i++) {
    const bouts = [];
    for (const ring of active) {
      const m = queues[ring][i];
      if (m) bouts.push({ ring, sparId: m.sparId, category: m.category,
                          duration: boutDuration(m), red: m.red, blue: m.blue, weightDiff: m.weightDiff });
    }
    slots.push({ slot: i + 1, bouts });
  }
  return slots;
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
    const avg     = m => (m.red.weight + m.blue.weight) / 2;
    matches.sort((a, b) => day % 2 === 1 ? avg(b) - avg(a) : avg(a) - avg(b));

    const queues  = distributeGrouped(matches);
    const slots   = buildSlots(queues);
    const summary = {
      strategy:      'GROUPED',
      totalMatches:  matches.length,
      seniorMale:    matches.filter(isBothSenior).length,
      female:        matches.filter(hasFemale).length,
      juniorMale:    matches.filter(m =>  isR5Eligible(m) && !hasFemale(m)).length,
      youthCrossAge: matches.filter(m => !isBothSenior(m) && !hasFemale(m) && !isR5Eligible(m)).length,
      totalSlots:    slots.length,
      matchesPerRing: Object.fromEntries(RINGS_ALL.map(r => [r, queues[r].length]))
    };

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
