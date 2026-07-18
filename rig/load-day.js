// Copyright (c) 2026 ITLR Assets. All rights reserved.
// Node-only data layer for the rig: read a day's Spars.json and hand it to rig/diff.js.
// Read-only — never writes, never trusts the buggy `unmatched` field.
'use strict';
const fs = require('fs');
const path = require('path');
const RigDiff = require('./diff');

const SPARS_DIR = path.join(__dirname, '..', 'output', 'Spars');

const dayFile = (date, baseDir = SPARS_DIR) => path.join(baseDir, date, 'Spars.json');

// { date, hasAuto, autoBouts, finalBouts, raw } — or null if the file is absent/unreadable.
function loadDay(date, { baseDir = SPARS_DIR } = {}) {
  const f = dayFile(date, baseDir);
  if (!fs.existsSync(f)) return null;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
  return {
    date,
    hasAuto: !!raw.phaseLog,
    autoBouts: RigDiff.normalizeAuto(raw.phaseLog),
    finalBouts: RigDiff.normalizeFinal(raw.matches),
    raw,
  };
}

// All dated folders that hold a Spars.json, split by whether they carry the auto side
// (phaseLog). Only `diffable` days can produce an auto-vs-final diff.
function listDays({ baseDir = SPARS_DIR } = {}) {
  if (!fs.existsSync(baseDir)) return { diffable: [], finalOnly: [] };
  const diffable = [], finalOnly = [];
  for (const name of fs.readdirSync(baseDir)) {
    const f = dayFile(name, baseDir);
    let stat; try { stat = fs.statSync(path.join(baseDir, name)); } catch { continue; }
    if (!stat.isDirectory() || !fs.existsSync(f)) continue;
    let raw; try { raw = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    (raw.phaseLog ? diffable : finalOnly).push(name);
  }
  diffable.sort(); finalOnly.sort();
  return { diffable, finalOnly };
}

// Diff every diffable day and aggregate the four outcome counts.
function diffAll({ baseDir = SPARS_DIR, dates } = {}) {
  const days = (dates || listDays({ baseDir }).diffable);
  const perDay = {};
  const agg = { auto: 0, final: 0, kept: 0, grew: 0, added: 0, dropped: 0 };
  for (const d of days) {
    const day = loadDay(d, { baseDir });
    if (!day || !day.hasAuto) continue;
    const { stats } = RigDiff.diffBouts(day.autoBouts, day.finalBouts);
    perDay[d] = stats;
    for (const k of Object.keys(agg)) agg[k] += stats[k];
  }
  agg.survivalRateStrict = agg.auto ? agg.kept / agg.auto : 0;
  agg.droppedStrict = agg.dropped + agg.grew;
  return { perDay, agg };
}

module.exports = { loadDay, listDays, diffAll, SPARS_DIR };
