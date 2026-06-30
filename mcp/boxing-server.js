#!/usr/bin/env node
// Minimal MCP stdio server — no external deps, drives the Boxing pipeline from Claude Code.
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { main: runSparMaker } = require('../SparMaker');
const { run: runRingAssigner } = require('../RingAssigner');
const { parseRawBoxers } = require('../boxer-csv');
const { runTSCBuckets } = require('../PutAllFightersinBuckets');

const BOXERS_CSV   = path.join(ROOT, 'data', 'Registered Boxer2026.csv');
const CLEAN_CSV    = path.join(ROOT, 'data', 'RegisteredBoxers2025.csv');
const BUCKETS_FILE = path.join(ROOT, 'output', 'Buckets', 'tsc-2026-buckets.json');
const SPARS_BASE   = path.join(ROOT, 'output', 'Spars');

const BOXER_RAW_HEADERS = [
  'date', 'Full name', 'Club', 'Gender', 'Category', 'Date of Birth',
  'Current weight (kg)', 'BOUTS (the number only)', 'WON (the number only)',
  'LOST (the number only)', 'Additional information or comments (optional)',
  'I understand that all boxers have to weigh in on Monday 7th July.',
  'I accept that boxers under 50kg use 12oz gloves, 50-69kg use 14oz gloves and 70kg plus use 16oz gloves. Headgear, protectors (male and female) and mouthguards MUST be worn during spars.',
  'Email address', 'fit', 'Spars per Day'
];
const BOXER_INTERNAL_KEYS = [
  'submissionDate', 'name', 'club', 'gender', 'category', 'dob',
  'weight', 'bouts', 'won', 'lost', 'comments',
  'consent1', 'consent2', 'email', 'fit', 'sparsPerDay'
];

function generateCleanCSV() {
  const boxers = parseRawBoxers(fs.readFileSync(BOXERS_CSV, 'utf8'));
  const esc = v => { const s = String(v ?? ''); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [
    'id,name,club,gender,yob,fit,weight,experience',
    ...boxers.map(b => [b.id, b.name, b.club, b.gender, b.yob, b.fit, b.weight, b.experience].map(esc).join(','))
  ].join('\n') + '\n';
  fs.writeFileSync(CLEAN_CSV, csv, 'utf8');
}

function writeBoxersCSV(boxers) {
  const esc = v => { const s = String(v ?? ''); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [
    BOXER_RAW_HEADERS.map(esc).join(','),
    ...boxers.map(b => BOXER_INTERNAL_KEYS.map(k => esc(b[k] ?? '')).join(','))
  ].join('\n') + '\n';
  fs.writeFileSync(BOXERS_CSV, csv, 'utf8');
}

function latestSparsDate() {
  if (!fs.existsSync(SPARS_BASE)) return null;
  const dates = fs.readdirSync(SPARS_BASE).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function capture(fn) {
  const logs = [];
  const orig = { log: console.log, error: console.error };
  console.log   = (...a) => logs.push(a.map(String).join(' '));
  console.error = (...a) => logs.push('ERROR: ' + a.map(String).join(' '));
  try   { fn(); return { success: true,  output: logs.join('\n') }; }
  catch (e) { return { success: false, output: logs.join('\n'), error: e.message }; }
  finally   { Object.assign(console, orig); }
}

const TOOLS = [
  {
    name: 'get_status',
    description: 'Current pipeline state: boxer count, buckets ready, latest spars summary.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_boxers',
    description: 'Return the boxer roster. filter: "all" (default) | "fit" | "unfit".',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['all', 'fit', 'unfit'] }
      }
    }
  },
  {
    name: 'generate_spars',
    description: 'Run SparMaker — reads buckets JSON, generates sparring pairs, writes Spars.json.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'assign_rings',
    description: 'Run RingAssigner — reads Spars.json, assigns bouts to rings, writes schedule.',
    inputSchema: {
      type: 'object',
      properties: {
        day: { type: 'number', description: 'Day number (odd=heavy first, even=light first). Default 1.' }
      }
    }
  },
  {
    name: 'set_fit',
    description: 'Set a boxer\'s fit status (yes/no) by id. Returns updated boxer.',
    inputSchema: {
      type: 'object',
      properties: {
        id:  { type: 'number', description: 'Boxer id.' },
        fit: { type: 'string', enum: ['yes', 'no'], description: 'New fit value.' }
      },
      required: ['id', 'fit']
    }
  },
  {
    name: 'run_buckets',
    description: 'Run PutAllFightersinBuckets — regenerates bucket assignments from the boxer CSV.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'add_boxer',
    description: 'Append a new boxer to the roster CSV.',
    inputSchema: {
      type: 'object',
      properties: {
        name:       { type: 'string' },
        club:       { type: 'string' },
        gender:     { type: 'string', enum: ['Male', 'Female'] },
        yob:        { type: 'number', description: 'Year of birth.' },
        weight:     { type: 'number', description: 'Weight in kg.' },
        experience: { type: 'number', description: 'Number of bouts.' }
      },
      required: ['name', 'club', 'gender', 'yob', 'weight', 'experience']
    }
  },
  {
    name: 'get_schedule',
    description: 'Return the ring schedule (grouped strategy). date: YYYY-MM-DD or omit for latest.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD. Defaults to latest.' }
      }
    }
  },
  {
    name: 'get_buckets',
    description: 'Return current bucket assignments (output of run_buckets / PutAllFightersinBuckets).',
    inputSchema: { type: 'object', properties: {} }
  }
];

function getStatus() {
  const boxers = fs.existsSync(BOXERS_CSV) ? parseRawBoxers(fs.readFileSync(BOXERS_CSV, 'utf8')) : [];
  const bucketsReady = fs.existsSync(BUCKETS_FILE);
  const dates = fs.existsSync(SPARS_BASE)
    ? fs.readdirSync(SPARS_BASE).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse()
    : [];
  let latestSpars = null;
  if (dates.length) {
    const f = path.join(SPARS_BASE, dates[0], 'Spars.json');
    if (fs.existsSync(f)) latestSpars = { date: dates[0], ...JSON.parse(fs.readFileSync(f, 'utf8')).summary };
  }
  return { boxerCount: boxers.length, bucketsReady, latestSpars, pipelineReady: boxers.length > 0 && bucketsReady };
}

function getBoxers({ filter = 'all' } = {}) {
  if (!fs.existsSync(BOXERS_CSV)) return { error: 'Boxer CSV not found', count: 0, boxers: [] };
  let boxers = parseRawBoxers(fs.readFileSync(BOXERS_CSV, 'utf8'));
  if (filter === 'fit')   boxers = boxers.filter(b => b.fit === 'yes');
  if (filter === 'unfit') boxers = boxers.filter(b => b.fit !== 'yes');
  return { count: boxers.length, boxers };
}

function setFit({ id, fit }) {
  if (!fs.existsSync(BOXERS_CSV)) throw new Error('Boxer CSV not found');
  const boxers = parseRawBoxers(fs.readFileSync(BOXERS_CSV, 'utf8'));
  const boxer = boxers.find(b => Number(b.id) === Number(id));
  if (!boxer) throw new Error(`Boxer id ${id} not found`);
  boxer.fit = fit;
  writeBoxersCSV(boxers);
  return { ok: true, id: boxer.id, name: boxer.name, fit: boxer.fit };
}

function addBoxer({ name, club, gender, yob, weight, experience }) {
  if (!fs.existsSync(BOXERS_CSV)) throw new Error('Boxer CSV not found');
  const boxers = parseRawBoxers(fs.readFileSync(BOXERS_CSV, 'utf8'));
  const nextId = Math.max(0, ...boxers.map(b => Number(b.id) || 0)) + 1;
  boxers.push({
    submissionDate: new Date().toISOString(), name, club, gender,
    category: '', dob: `01/01/${yob}`, weight: String(weight),
    bouts: String(experience), won: '', lost: '', comments: '',
    consent1: '', consent2: '', email: '', fit: 'yes', sparsPerDay: '1',
    id: nextId
  });
  writeBoxersCSV(boxers);
  return { ok: true, id: nextId, name, total: boxers.length };
}

function getSchedule({ date } = {}) {
  const d = date ?? latestSparsDate();
  if (!d) return { error: 'No spar dates found' };
  const f = path.join(SPARS_BASE, d, 'schedule_grouped.json');
  if (!fs.existsSync(f)) return { error: `schedule_grouped.json not found for ${d}` };
  return { date: d, schedule: JSON.parse(fs.readFileSync(f, 'utf8')) };
}

function getBuckets() {
  if (!fs.existsSync(BUCKETS_FILE)) return { error: 'Buckets file not found — run run_buckets first' };
  return JSON.parse(fs.readFileSync(BUCKETS_FILE, 'utf8'));
}

function callTool(name, args = {}) {
  switch (name) {
    case 'get_status':     return getStatus();
    case 'get_boxers':     return getBoxers(args);
    case 'generate_spars': return capture(runSparMaker);
    case 'assign_rings':   return capture(() => runRingAssigner(args.day ?? 1));
    case 'set_fit':        return setFit(args);
    case 'run_buckets':    return capture(() => { generateCleanCSV(); runTSCBuckets(CLEAN_CSV); });
    case 'add_boxer':      return addBoxer(args);
    case 'get_schedule':   return getSchedule(args);
    case 'get_buckets':    return getBuckets();
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP stdio protocol ────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('line', line => {
  let msg;
  try { msg = JSON.parse(line.trim()); } catch { return; }
  if (!msg) return;

  const { method, params, id } = msg;
  if (id === undefined) return; // notification — no response

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'boxing', version: '1.0.0' }
    }});
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    try {
      const result = callTool(params.name, params.arguments);
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }});
    } catch (e) {
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true
      }});
    }
  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
});
