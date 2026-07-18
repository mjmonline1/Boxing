// Copyright (c) 2026 ITLR Assets. All rights reserved.
// Manual-match assistant core — pure, dual Node/browser (UMD-lite, like group-utils.js).
//
// Purpose: help the HUMAN finish the board after the strict auto pass. It answers two
// questions and never makes a decision for the coach:
//   1. Who still needs a spar?          -> unmatchedPool()
//   2. Who could I pair them with?       -> rankCandidates() (ranked, flagged, NEVER filtered)
//
// Hard rule: the auto matcher's constraints (±2kg, category buckets, club, gender) are
// ADVISORY here. flagsFor() reports them; nothing is ever excluded from the candidate list.
// The one safety line is minor<->adult: flagged loudly (`minorAdult`) so the UI can force an
// explicit confirm — but it is still never auto-removed from the list.
(function (global, factory) {
  const api = factory(typeof require !== 'undefined'
    ? require('./group-utils')
    : global.GroupUtils);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.SparAssist = api;
})(typeof window !== 'undefined' ? window : globalThis, function (GroupUtils) {
  'use strict';

  const WEIGHT_RULE = 2.0;   // the strict auto tolerance — used only to LABEL breakers
  const membersOf = GroupUtils.membersOf;

  const idOf = b => (b && (b.id != null ? b.id : b.name));
  const thisYear = () => new Date().getFullYear();

  function ageOf(boxer, year) { return (year || thisYear()) - boxer.yob; }
  // A minor is under 18. yob missing -> not treated as a minor (can't assert the safety line).
  function isMinor(boxer, year) {
    return Number.isFinite(boxer.yob) && ageOf(boxer, year) < 18;
  }

  // How many bouts each boxer is currently in on the board. Keyed by id (falls back to name).
  // Uses membersOf so trios/N-groups count every member. Ignores the buggy `unmatched` field.
  function loadMap(matches) {
    const load = new Map();
    for (const m of (matches || [])) {
      for (const b of membersOf(m)) {
        const k = idOf(b);
        load.set(k, (load.get(k) || 0) + 1);
      }
    }
    return load;
  }

  const capacityOf = b => (b.sparsPerDay || 1);

  // Boxers who still have spar capacity left (cap - current load > 0). fit===false are
  // excluded entirely (not sparring today). autoMatch==='no' boxers ARE included — the whole
  // point of manual is to place them by hand.
  function unmatchedPool(roster, matches, { includeUnfit = false } = {}) {
    const load = loadMap(matches);
    return (roster || [])
      .filter(b => includeUnfit || b.fit !== false)
      .map(b => ({ boxer: b, load: load.get(idOf(b)) || 0, capacity: capacityOf(b) }))
      .filter(x => x.capacity - x.load > 0)
      .map(x => ({ ...x, remaining: x.capacity - x.load }));
  }

  // Advisory flags for pairing a with b. Every field is informational — none blocks.
  function flagsFor(a, b, { year } = {}) {
    const weightGap = Number.isFinite(a.weight) && Number.isFinite(b.weight)
      ? Math.abs(a.weight - b.weight) : Infinity;
    return {
      weightGap,
      overWeightRule: weightGap > WEIGHT_RULE + 1e-9,   // breaks the strict ±2kg auto rule
      crossCategory: !!(a.category && b.category) && a.category !== b.category,
      crossGender: a.gender !== b.gender,
      sameClub: a.club === b.club,
      minorAdult: isMinor(a, year) !== isMinor(b, year), // SAFETY: needs explicit human confirm
    };
  }

  // Soft suitability score (LOWER = better). Weight proximity dominates; the advisory breaks
  // add penalties but can never remove a candidate — a coach can always override. minorAdult
  // gets the largest penalty so it sinks to the bottom, yet still appears (with its flag).
  function score(flags) {
    let s = Number.isFinite(flags.weightGap) ? flags.weightGap : 100;
    if (flags.sameClub) s += 3;
    if (flags.crossCategory) s += 2;
    if (flags.crossGender) s += 8;
    if (flags.minorAdult) s += 1000;
    return s;
  }

  // Advisory flags for ADDING `boxer` into an existing bout `match` (forming/growing a trio+).
  // weightGap = the worst NEW gap the boxer introduces (boxer vs each existing member). Every
  // break is advisory; minorAdult trips if the boxer and ANY member cross the safety line.
  function boutFlagsFor(boxer, match, { year } = {}) {
    const members = membersOf(match);
    const gaps = members
      .filter(m => Number.isFinite(m.weight) && Number.isFinite(boxer.weight))
      .map(m => Math.abs(boxer.weight - m.weight));
    const weightGap = gaps.length ? Math.max(...gaps) : Infinity;
    return {
      weightGap,
      overWeightRule: weightGap > WEIGHT_RULE + 1e-9,
      crossCategory: !!(boxer.category && match.category) && boxer.category !== match.category,
      crossGender: members.some(m => m.gender !== boxer.gender),
      sameClub: members.some(m => m.club === boxer.club),
      minorAdult: members.some(m => isMinor(m, year) !== isMinor(boxer, year)),
    };
  }

  // Rank existing bouts as places to ADD `boxer` (grow a pair into a trio, etc). Never filters
  // out a bout — skips only bouts the boxer is already in. Sorted best (closest) fit first.
  function rankBouts(boxer, matches, { year } = {}) {
    return (matches || [])
      .filter(m => !membersOf(m).some(x => idOf(x) === idOf(boxer)))
      .map(m => { const flags = boutFlagsFor(boxer, m, { year }); return { match: m, sparId: m.sparId, flags, score: score(flags) }; })
      .sort((a, b) => a.score - b.score);
  }

  // Rank EVERY other pool member as a candidate partner for `boxer`. Never filters anyone out
  // (except the boxer themselves and anyone already sharing a bout with them, to avoid a
  // same-day rematch — pass allowRematch:true to include them too).
  function rankCandidates(boxer, pool, { year, matches, allowRematch = false } = {}) {
    const partnered = new Set();
    if (!allowRematch && matches) {
      for (const m of matches) {
        const ids = membersOf(m).map(idOf);
        if (ids.includes(idOf(boxer))) ids.forEach(id => partnered.add(id));
      }
    }
    return pool
      .map(x => x.boxer || x)                       // accept pool entries or raw boxers
      .filter(c => idOf(c) !== idOf(boxer) && !partnered.has(idOf(c)))
      .map(c => { const flags = flagsFor(boxer, c, { year }); return { boxer: c, flags, score: score(flags) }; })
      .sort((p, q) => p.score - q.score);
  }

  return { unmatchedPool, rankCandidates, rankBouts, flagsFor, boutFlagsFor, loadMap, isMinor, ageOf, score, WEIGHT_RULE };
});
