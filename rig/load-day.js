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

// Diff every diffable day and aggregate the four outcome counts (delegates to the pure
// RigDiff.diffMany so file and Mongo paths stay identical).
function diffAll({ baseDir = SPARS_DIR, dates } = {}) {
  const days = (dates || listDays({ baseDir }).diffable);
  const entries = days.map(d => { const day = loadDay(d, { baseDir }); return { date: d, spars: day && day.raw }; });
  return RigDiff.diffMany(entries);
}

module.exports = { loadDay, listDays, diffAll, SPARS_DIR };
