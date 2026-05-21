// Copyright (c) 2026 ITLR Assets. All rights reserved.
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const { runTSCBuckets } = require("./PutAllFightersinBuckets");
const { main: runSparMaker } = require("./SparMaker");
const { run: runRingAssigner } = require("./RingAssigner");

const app = express();
const PORT = process.env.PORT || 5500;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const FILE = path.join(__dirname, "Sparrings.json");

// ---- API ----
app.get("/api/sparrings", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  res.json(data);
});

app.post("/api/sparrings", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  data.push(req.body);
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

app.put("/api/sparrings/:id", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  data[req.params.id] = req.body;
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

app.delete("/api/sparrings/:id", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  data.splice(req.params.id, 1);
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

// ---- SCRIPTS ----

function runWithCapture(fn) {
  const logs = [];
  const origLog   = console.log;
  const origError = console.error;
  console.log   = (...a) => { logs.push(a.map(String).join(' ')); origLog(...a); };
  console.error = (...a) => { logs.push('ERROR: ' + a.map(String).join(' ')); origError(...a); };
  try {
    fn();
    return { success: true, output: logs.join('\n'), error: null };
  } catch (e) {
    return { success: false, output: logs.join('\n'), error: e.message };
  } finally {
    console.log   = origLog;
    console.error = origError;
  }
}

app.post("/api/run/buckets", (req, res) => {
  res.json(runWithCapture(() => runTSCBuckets('data/Registered Boxer2026.csv')));
});

app.post("/api/run/spar-maker", (req, res) => {
  res.json(runWithCapture(runSparMaker));
});

app.post("/api/run/ring-assigner", (req, res) => {
  const day = parseInt(req.body?.day) || 1;
  res.json(runWithCapture(() => runRingAssigner(day)));
});

// ---- PIPELINE DATA ----
const BOXERS_CSV = path.join(__dirname, 'data', 'Registered Boxer2026.csv');

function mapHeader2026(raw) {
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
  return norm;
}

const BOXER_RAW_HEADERS = [
  'date', 'Full name', 'Club', 'Gender', 'Category', 'Date of Birth',
  'Current weight (kg)', 'BOUTS (the number only)', 'WON (the number only)',
  'LOST (the number only)', 'Additional information or comments (optional)',
  'I understand that all boxers have to weigh in on Monday 7th July.',
  'I accept that boxers under 50kg use 12oz gloves, 50-69kg use 14oz gloves and 70kg plus use 16oz gloves. Headgear, protectors (male and female) and mouthguards MUST be worn during spars.',
  'Email address', 'fit'
];
const BOXER_INTERNAL_KEYS = [
  'submissionDate', 'name', 'club', 'gender', 'category', 'dob',
  'weight', 'bouts', 'won', 'lost', 'comments',
  'consent1', 'consent2', 'email', 'fit'
];

function readBoxersCSV() {
  if (!fs.existsSync(BOXERS_CSV)) return null;
  const text = fs.readFileSync(BOXERS_CSV, 'utf8');
  const lines = splitCSVRecords(text);
  const headers = splitCSV(lines[0]).map(mapHeader2026);
  return lines.slice(1).filter(l => l.trim()).map((line, idx) => {
    const vals = splitCSV(line);
    const obj = {};
    headers.forEach((h, i) => {
      const v = (vals[i] || '').trim();
      if (h === 'weight') obj[h] = parseFloat(v) || 0;
      else if (['bouts', 'won', 'lost'].includes(h)) obj[h] = parseInt(v) || 0;
      else obj[h] = v;
    });
    obj.gender = obj.gender ? obj.gender.toLowerCase() : 'male';
    const dobParts = (obj.dob || '').split('/');
    obj.yob = parseInt(dobParts[2]) || 0;
    obj.experience = obj.bouts || 0;
    obj.id = idx + 1;
    if (!obj.fit) obj.fit = 'yes';
    return obj;
  });
}

function writeBoxersCSV(boxers) {
  const esc = v => { const s = String(v ?? ''); return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const csv = [
    BOXER_RAW_HEADERS.map(esc).join(','),
    ...boxers.map(b => BOXER_INTERNAL_KEYS.map(k => esc(b[k] ?? '')).join(','))
  ].join('\n') + '\n';
  fs.writeFileSync(BOXERS_CSV, csv, 'utf8');
}

app.get('/api/data/boxers', (req, res) => {
  const boxers = readBoxersCSV();
  if (!boxers) return res.status(404).json({ error: 'Registered Boxer2026.csv not found in data/' });
  res.json(boxers);
});

app.put('/api/data/boxers', (req, res) => {
  const boxers = req.body;
  if (!Array.isArray(boxers)) return res.status(400).json({ error: 'Expected an array of boxers' });
  writeBoxersCSV(boxers);
  res.json({ ok: true, saved: boxers.length });
});

app.patch('/api/data/boxers/:id', (req, res) => {
  const boxers = readBoxersCSV();
  if (!boxers) return res.status(404).json({ error: 'CSV not found' });
  const boxer = boxers.find(b => b.id === parseInt(req.params.id));
  if (!boxer) return res.status(404).json({ error: `Boxer id ${req.params.id} not found` });
  Object.assign(boxer, req.body);
  writeBoxersCSV(boxers);
  res.json({ ok: true });
});

function splitCSVRecords(text) {
  const records = [];
  let current  = '';
  let inQuotes = false;
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

const DATA_FILES = {
  buckets:  'output/Buckets/tsc-2025-buckets.json',
  spars:    'output/Spars/Spars.json',
  schedule: 'output/Spars/schedule_grouped.json',
};

Object.entries(DATA_FILES).forEach(([key, filePath]) => {
  const full = path.join(__dirname, filePath);

  app.get(`/api/data/${key}`, (req, res) => {
    if (!fs.existsSync(full)) {
      return res.status(404).json({ error: `${key} not yet generated — run the preceding pipeline step first.` });
    }
    res.json(JSON.parse(fs.readFileSync(full, 'utf8')));
  });

  app.put(`/api/data/${key}`, (req, res) => {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  });
});

// ---- FRONTEND ----
app.use(express.static("public"));

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));