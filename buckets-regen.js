// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Single source of truth for rebuilding output/Buckets/tsc-2026-buckets.json from the
// roster. Shared by Server.js (HTTP API) and mcp/boxing-server.js (MCP tools) so both
// paths behave identically — no divergent copies.
//
// The roster CSV is the source of truth for MEMBERSHIP (who exists), so this always
// covers the live roster and never uses stale/positional data. Each boxer's BUCKET is
// ALWAYS the bucketizer's output (runTSCBuckets: gender → age-by-YOB → experience-by-bouts)
// — the classifier is the single source of truth. We deliberately do NOT preserve prior
// placements, so a boxer whose bouts/age change is re-categorised every rebuild and a stale
// or prefilled category can never override the rules. autoMatch/sparsPerDay/dob are
// re-attached from the roster because the clean-schema round-trip runTSCBuckets needs would
// otherwise drop them — and SparMaker must see autoMatch='no' or it auto-pairs boxers held
// for manual. dob (full "dd/mm/yyyy") rides along only for reporting; matching uses yob.

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { parseRawBoxers } = require('./boxer-csv');
const { runTSCBuckets }  = require('./PutAllFightersinBuckets');

const ROOT         = __dirname;
const BOXERS_CSV   = path.join(ROOT, 'data', 'Registered Boxer2026.csv');
const BUCKETS_FILE = path.join(ROOT, 'output', 'Buckets', 'tsc-2026-buckets.json');

function regenerateBuckets() {
  if (!fs.existsSync(BOXERS_CSV)) throw new Error('Registered Boxer2026.csv not found in data/');
  const boxers = parseRawBoxers(fs.readFileSync(BOXERS_CSV, 'utf8'));

  // 1. Deterministic auto-assignment via runTSCBuckets (expects the clean-schema CSV).
  //    runTSCBuckets exports to a CWD-relative output/Buckets path, so pin CWD to ROOT
  //    for the call (synchronous, so no concurrency risk) then restore it.
  const q = s => { s = String(s ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = 'id,name,club,gender,yob,fit,weight,experience\n' +
    boxers.map(b => [b.id, q(b.name), q(b.club), b.gender, b.yob, b.fit, b.weight, b.experience].join(',')).join('\n') + '\n';
  const tmp = path.join(os.tmpdir(), `boxers-clean-${process.pid}-${Date.now()}.csv`);
  fs.writeFileSync(tmp, csv);
  const prevCwd = process.cwd();
  try {
    process.chdir(ROOT);
    runTSCBuckets(tmp);
  } finally {
    try { process.chdir(prevCwd); } catch (_) { /* ignore */ }
    try { fs.unlinkSync(tmp); } catch (_) { /* best-effort cleanup */ }
  }

  // 2. Keep the bucketizer's placement verbatim (single source of truth) and re-attach
  //    the fields the clean-schema round-trip dropped (autoMatch, sparsPerDay, dob).
  const metaById = new Map(boxers.map(x => [x.id, { autoMatch: x.autoMatch, sparsPerDay: x.sparsPerDay, dob: x.dob }]));
  const auto = JSON.parse(fs.readFileSync(BUCKETS_FILE, 'utf8'));
  const autoBuckets = auto.finalBuckets || {};
  const reconciled = {};
  for (const key of Object.keys(autoBuckets)) reconciled[key] = [];
  for (const [autoKey, list] of Object.entries(autoBuckets)) {
    for (const b of (list || [])) {
      const meta = metaById.get(b.id);
      if (meta) { b.autoMatch = meta.autoMatch; b.sparsPerDay = meta.sparsPerDay; b.dob = meta.dob; }
      (reconciled[autoKey] = reconciled[autoKey] || []).push(b);
    }
  }

  // 3. Persist buckets in the canonical {summary, finalBuckets} shape.
  const counts = {};
  let distributed = 0;
  for (const [k, v] of Object.entries(reconciled)) { counts[k] = v.length; distributed += v.length; }
  fs.writeFileSync(BUCKETS_FILE, JSON.stringify({
    summary: { totalOriginal: boxers.length, totalDistributed: distributed, finalBuckets: counts },
    finalBuckets: reconciled
  }, null, 2), 'utf8');
  return boxers.length;
}

module.exports = { regenerateBuckets, BOXERS_CSV, BUCKETS_FILE };
