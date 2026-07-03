// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Single source of truth for boxer-roster CSV parsing. Shared by:
//   - Server.js                         (local file API, raw survey schema)
//   - netlify/functions/import-boxers.js (cloud import, raw survey schema)
//   - PutAllFightersinBuckets.js         (clean schema — shares tokenizer + gender norm)
//
// Node module (require) — all three consumers run server-side.

// Split a whole CSV file into records, honouring quoted newlines and skipping blanks.
function splitRecords(text) {
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

// Split one record into fields, honouring quoted commas and "" escapes.
function splitLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// Canonicalise gender to lowercase 'male'/'female', expanding the M/F shorthand, so any
// casing a human types classifies. Returns '' for blank/unknown (caller decides default).
function normalizeGender(v) {
  const g = (v || '').toLowerCase();
  return g === 'm' ? 'male' : g === 'f' ? 'female' : g;
}

// Map a raw survey-export header to the internal boxer key.
function mapRawHeader(raw) {
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
  if (norm === 'auto match') return 'autoMatch';
  return norm;
}

// Parse the RAW survey export (the Registered Boxer2026.csv shape) into boxer objects.
// Pure: takes the file text, returns boxers[]. Derives yob from dob, experience from
// bouts, and defaults fit/sparsPerDay the way registration expects.
function parseRawBoxers(text) {
  const lines = splitRecords(text);
  if (lines.length === 0) return [];
  const headers = splitLine(lines[0]).map(mapRawHeader);
  return lines.slice(1).map((line, idx) => {
    const vals = splitLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      const v = (vals[i] || '').trim();
      if (h === 'weight') obj[h] = parseFloat(v) || 0;
      else if (['bouts', 'won', 'lost'].includes(h)) obj[h] = parseInt(v) || 0;
      else if (h === 'sparsPerDay') obj[h] = parseInt(v) || 1;
      else obj[h] = v;
    });
    obj.gender = obj.gender ? normalizeGender(obj.gender) : 'male';
    const dobParts = (obj.dob || '').split('/');
    obj.yob = parseInt(dobParts[2]) || 0;
    obj.experience = obj.bouts || 0;
    obj.id = idx + 1;
    if (!obj.fit) obj.fit = 'yes';
    if (!obj.sparsPerDay) obj.sparsPerDay = 1;
    if (obj.autoMatch !== 'no') obj.autoMatch = 'yes';
    return obj;
  });
}

module.exports = { splitRecords, splitLine, normalizeGender, mapRawHeader, parseRawBoxers };
