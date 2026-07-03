// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Runtime port: reads process.env.PORT from .env, falls back to 5500 if unset.
// Check .env before assuming 5500 — it currently overrides this to a different port.
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const { main: runSparMaker } = require("./SparMaker");
const { run: runRingAssigner } = require("./RingAssigner");
const { parseRawBoxers } = require("./boxer-csv");

const app = express();
const PORT = process.env.PORT || 5500;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const FILE = path.join(__dirname, "Sparrings.json");

app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ---- API ----
app.get('/api/version', (req, res) => {
  const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  res.json({ version });
});

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
    const result = fn();
    return { success: true, output: logs.join('\n'), error: null, ...(result || {}) };
  } catch (e) {
    return { success: false, output: logs.join('\n'), error: e.message };
  } finally {
    console.log   = origLog;
    console.error = origError;
  }
}

// Note: buckets are assigned client-side in BucketAssigner.html and saved via
// PUT /api/data/buckets — there is no server-side "run buckets" step.

app.post("/api/run/spar-maker", (req, res) => {
  const maxPhase = parseInt(req.query.maxPhase) || 3;
  res.json(runWithCapture(() => runSparMaker(maxPhase)));
});

app.post("/api/run/ring-assigner", (req, res) => {
  const day = parseInt(req.body?.day) || 1;
  res.json(runWithCapture(() => runRingAssigner(day)));
});

// ---- PIPELINE DATA ----
const BOXERS_CSV = path.join(__dirname, 'data', 'Registered Boxer2026.csv');

const BOXER_RAW_HEADERS = [
  'date', 'Full name', 'Club', 'Gender', 'Category', 'Date of Birth',
  'Current weight (kg)', 'BOUTS (the number only)', 'WON (the number only)',
  'LOST (the number only)', 'Additional information or comments (optional)',
  'I understand that all boxers have to weigh in on Monday 7th July.',
  'I accept that boxers under 50kg use 12oz gloves, 50-69kg use 14oz gloves and 70kg plus use 16oz gloves. Headgear, protectors (male and female) and mouthguards MUST be worn during spars.',
  'Email address', 'fit', 'Auto Match', 'Spars per Day'
];
const BOXER_INTERNAL_KEYS = [
  'submissionDate', 'name', 'club', 'gender', 'category', 'dob',
  'weight', 'bouts', 'won', 'lost', 'comments',
  'consent1', 'consent2', 'email', 'fit', 'autoMatch', 'sparsPerDay'
];

function readBoxersCSV() {
  if (!fs.existsSync(BOXERS_CSV)) return null;
  return parseRawBoxers(fs.readFileSync(BOXERS_CSV, 'utf8'));
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

// Buckets: static all week
const bucketsFull = path.join(__dirname, 'output', 'Buckets', 'tsc-2026-buckets.json');
app.get('/api/data/buckets', (req, res) => {
  if (!fs.existsSync(bucketsFull)) return res.status(404).json({ error: 'buckets not yet generated — run Step 2 first.' });
  res.json(JSON.parse(fs.readFileSync(bucketsFull, 'utf8')));
});
app.put('/api/data/buckets', (req, res) => {
  fs.mkdirSync(path.dirname(bucketsFull), { recursive: true });
  fs.writeFileSync(bucketsFull, JSON.stringify(req.body, null, 2), 'utf8');
  res.json({ ok: true });
});

// Spars + schedule: date-stamped subdirectories (defaults to today)
function sparsDirForDate(date) {
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : new Date().toISOString().split('T')[0];
  return path.join(__dirname, 'output', 'Spars', d);
}

for (const [key, filename] of [['spars', 'Spars.json'], ['schedule', 'schedule_grouped.json']]) {
  app.get(`/api/data/${key}`, (req, res) => {
    const full = path.join(sparsDirForDate(req.query.date), filename);
    if (!fs.existsSync(full)) return res.status(404).json({ error: `${key} not yet generated — run the preceding pipeline step first.` });
    res.json(JSON.parse(fs.readFileSync(full, 'utf8')));
  });
  app.put(`/api/data/${key}`, (req, res) => {
    const full = path.join(sparsDirForDate(req.query.date), filename);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  });
}

// List available dated spar directories
app.get('/api/spar-dates', (req, res) => {
  const sparsBase = path.join(__dirname, 'output', 'Spars');
  if (!fs.existsSync(sparsBase)) return res.json([]);
  const dates = fs.readdirSync(sparsBase)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort().reverse();
  res.json(dates);
});

// ---- STATUS + INTAKE ----

app.get('/api/status', (req, res) => {
  const boxers = readBoxersCSV();
  const dates = fs.existsSync(path.join(__dirname, 'output', 'Spars'))
    ? fs.readdirSync(path.join(__dirname, 'output', 'Spars')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse()
    : [];
  let latestSpars = null;
  if (dates.length) {
    const f = path.join(__dirname, 'output', 'Spars', dates[0], 'Spars.json');
    if (fs.existsSync(f)) latestSpars = { date: dates[0], ...JSON.parse(fs.readFileSync(f, 'utf8')).summary };
  }
  res.json({
    boxerCount: boxers?.length ?? 0,
    bucketsReady: fs.existsSync(bucketsFull),
    latestSpars,
    pipelineReady: !!(boxers?.length && fs.existsSync(bucketsFull))
  });
});

app.post('/api/boxer-intake', (req, res) => {
  const boxer = req.body;
  if (!boxer?.name || !boxer?.club) return res.status(400).json({ error: 'name and club required' });
  const boxers = readBoxersCSV() || [];
  const nextId = Math.max(0, ...boxers.map(b => b.id || 0)) + 1;
  boxers.push({ submissionDate: new Date().toISOString(), fit: 'yes', sparsPerDay: 1, ...boxer, id: nextId });
  writeBoxersCSV(boxers);
  res.json({ ok: true, id: nextId, total: boxers.length });
});

// ---- FRONTEND ----
app.use(express.static("public"));

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));