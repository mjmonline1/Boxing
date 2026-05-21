const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const BOXERS_CSV = path.join(__dirname, '../../data/Registered Boxer2026.csv');

function splitCSVRecords(text) {
  const records = [];
  let current = '', inQuotes = false;
  for (const c of text) {
    if (c === '"') { inQuotes = !inQuotes; current += c; }
    else if (c === '\n' && !inQuotes) {
      const rec = current.replace(/\r$/, '').trim();
      if (rec) records.push(rec);
      current = '';
    } else { current += c; }
  }
  const rec = current.trim();
  if (rec) records.push(rec);
  return records;
}

function splitCSV(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function mapHeader(raw) {
  const norm = raw.trim().toLowerCase();
  if (norm === 'date') return 'submissionDate';
  if (norm === 'full name') return 'name';
  if (norm === 'club') return 'club';
  if (norm === 'gender') return 'gender';
  if (norm === 'category') return 'category';
  if (norm === 'date of birth') return 'dob';
  if (norm === 'current weight (kg)') return 'weight';
  if (norm === 'bouts (the number only)') return 'bouts';
  if (norm === 'won (the number only)') return 'won';
  if (norm === 'lost (the number only)') return 'lost';
  if (norm.startsWith('additional information')) return 'comments';
  if (norm.startsWith('i understand')) return 'consent1';
  if (norm.startsWith('i accept')) return 'consent2';
  if (norm === 'email address') return 'email';
  if (norm === 'fit') return 'fit';
  if (norm === 'spars per day') return 'sparsPerDay';
  return norm;
}

function parseBoxers() {
  const text = fs.readFileSync(BOXERS_CSV, 'utf8');
  const lines = splitCSVRecords(text);
  const headers = splitCSV(lines[0]).map(mapHeader);
  return lines.slice(1).filter(l => l.trim()).map((line, idx) => {
    const vals = splitCSV(line);
    const obj = {};
    headers.forEach((h, i) => {
      const v = (vals[i] || '').trim();
      if (h === 'weight') obj[h] = parseFloat(v) || 0;
      else if (['bouts', 'won', 'lost'].includes(h)) obj[h] = parseInt(v) || 0;
      else if (h === 'sparsPerDay') obj[h] = parseInt(v) || 1;
      else obj[h] = v;
    });
    obj.gender = obj.gender ? obj.gender.toLowerCase() : 'male';
    const dobParts = (obj.dob || '').split('/');
    obj.yob = parseInt(dobParts[2]) || 0;
    obj.experience = obj.bouts || 0;
    obj.id = idx + 1;
    if (!obj.fit) obj.fit = 'yes';
    if (!obj.sparsPerDay) obj.sparsPerDay = 1;
    return obj;
  });
}

let cachedClient;

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('boxing');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST required' }) };
  }

  try {
    const boxers = parseBoxers();
    const db = await getDb();

    // Reset all derived data before importing fresh boxers
    await Promise.all(['buckets', 'spars', 'schedule'].map(name =>
      db.collection(name).deleteMany({})
    ));

    const col = db.collection('boxers');
    await col.deleteMany({});
    await col.insertMany(boxers);
    return { statusCode: 200, body: JSON.stringify({ ok: true, imported: boxers.length }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
