// Copyright (c) 2026 ITLR Assets. All rights reserved.
// The rig's learning loop: read the coach's PAST days and distil what they actually do, so the
// live manual assistant can rank suggestions the coach's way. Node-only (reads files, like
// load-day.js). Output is a plain JSON-able model that spar-assist.score() consumes — the model
// travels; the file IO stays here.
//
// Two things are learned, both from history the coach already produced:
//   1. flagTolerance — how often the coach pairs DESPITE an advisory flag (from editLog
//      pair-added/grew-added entries). A flag the coach overrides constantly is one the assistant
//      should stop penalising so hard. minorAdult is NEVER learned away (safety line).
//   2. affinity — which people the coach actually pairs, and which pairings were marked
//      requested/consented (from the final board + editLog). Familiar/consented pairs rank up.
'use strict';
const GroupUtils = require('../group-utils');
const { loadDay, listDays } = require('./load-day');

// The advisory flags the coach can teach us to relax. minorAdult is deliberately absent.
const SOFTENABLE = ['sameClub', 'crossCategory', 'crossGender', 'overWeightRule'];

const pairKey = (a, b) => [a, b].sort().join('|');
function combos(names) {
  const out = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) out.push([names[i], names[j]]);
  return out;
}

// Build the learned model from prior days. `before` (a 'YYYY-MM-DD' string) excludes that day and
// later — pass the day you're matching so it only learns from the PAST (no leakage in a backtest).
function buildModel({ baseDir, before, dates } = {}) {
  let all = dates;
  if (!all) {
    const { diffable, finalOnly } = listDays({ baseDir });
    all = [...diffable, ...finalOnly].sort();
  }
  const days = before ? all.filter(d => d < before) : all;

  const flagCounts = Object.fromEntries(SOFTENABLE.map(f => [f, 0]));
  let manualPairings = 0;
  const affinity = {};                                   // "a|b" -> { paired, consented }
  const bump = (k, field) => { (affinity[k] || (affinity[k] = { paired: 0, consented: 0 }))[field]++; };

  let used = 0;
  for (const d of days) {
    const day = loadDay(d, { baseDir });
    if (!day) continue;
    used++;

    // Affinity + consent from the final board the coach committed.
    for (const m of (day.raw.matches || [])) {
      const names = GroupUtils.membersOf(m).map(b => b.name);
      const consented = !!m.consent;
      for (const [a, b] of combos(names)) {
        bump(pairKey(a, b), 'paired');
        if (consented) bump(pairKey(a, b), 'consented');
      }
    }

    // Flag tolerance (+ requested marks) from the deliberate-decision edit log.
    for (const e of (day.raw.editLog || [])) {
      if ((e.action === 'pair-added' || e.action === 'grew-added') && e.flags) {
        manualPairings++;
        for (const f of SOFTENABLE) if (e.flags[f]) flagCounts[f]++;
      }
      if (e.action === 'mark-requested' && Array.isArray(e.members)) {
        for (const [a, b] of combos(e.members)) bump(pairKey(a, b), 'consented');
      }
    }
  }

  const flagTolerance = {};
  for (const f of SOFTENABLE) flagTolerance[f] = manualPairings ? flagCounts[f] / manualPairings : 0;

  return { days: used, manualPairings, flagTolerance, affinity };
}

module.exports = { buildModel, pairKey, SOFTENABLE };
