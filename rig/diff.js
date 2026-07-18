// Copyright (c) 2026 ITLR Assets. All rights reserved.
// The rig's core datum: diff(auto proposal, coach's final board). Pure, dual Node/browser
// (UMD-lite, like group-utils.js) so the same classification runs in the backtest harness
// (Node) and the live diff-vs-auto panel in SparManager (browser).
//
// The two sides are encoded differently in Spars.json:
//   - AUTO  (phaseLog.*Bouts / *Groups): red/blue/third are NAME STRINGS + separate weights.
//   - FINAL (matches):                    red/blue/third are Boxer OBJECTS.
// normalizeAuto/normalizeFinal fold both to a canonical bout keyed by its sorted member names.
// The buggy `unmatched` array is never read.
//
// Four outcomes (the naive "match by member set" misses `grew`):
//   kept    — auto bout present unchanged in the final board.
//   grew    — the coach grew an auto pair into a bigger bout (auto members ⊂ a final bout).
//   dropped — auto bout the coach discarded (neither kept nor grew).
//   added   — final bout with no auto origin (fresh manual pairing).
(function (global, factory) {
  const api = factory(typeof require !== 'undefined' ? require('../group-utils') : global.GroupUtils);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.RigDiff = api;
})(typeof window !== 'undefined' ? window : globalThis, function (GroupUtils) {
  'use strict';

  const AUTO_PAIR_PHASES  = ['phase1Bouts', 'phase2Bouts', 'phase2cBouts', 'phase4Bouts'];
  const AUTO_GROUP_PHASES = ['phase3Groups'];

  const keyOf = members => members.map(m => m.name).slice().sort().join('|');

  // One canonical bout. members carry name+weight (+club/gender/category when the source has them).
  function bout(members, category, source, ref) {
    return { members, category, kind: members.length > 2 ? 'trio' : 'pair', source, key: keyOf(members), ref };
  }

  // AUTO side — from phaseLog. Each *Bouts entry is {red,redWeight,blue,blueWeight,...}; each
  // *Groups entry adds {third,thirdWeight}. Missing phases are simply absent (older exports).
  function normalizeAuto(phaseLog) {
    if (!phaseLog) return [];
    const out = [];
    const pushBout = (b, groupish) => {
      const members = [
        { name: b.red,  weight: b.redWeight },
        { name: b.blue, weight: b.blueWeight },
      ];
      if (groupish && b.third) members.push({ name: b.third, weight: b.thirdWeight });
      if (!b.red || !b.blue) return;              // skip a half-open bout, if any
      out.push(bout(members, b.category, 'auto', b));
    };
    for (const p of AUTO_PAIR_PHASES)  for (const b of (phaseLog[p] || [])) pushBout(b, false);
    for (const p of AUTO_GROUP_PHASES) for (const b of (phaseLog[p] || [])) pushBout(b, true);
    return out;
  }

  // FINAL side — from matches (Boxer objects). membersOf handles pairs, trios and N-groups.
  function normalizeFinal(matches) {
    return (matches || [])
      .map(m => {
        const members = GroupUtils.membersOf(m).map(b => ({
          name: b.name, weight: b.weight, club: b.club, gender: b.gender, category: b.category,
        }));
        return members.length >= 2 ? bout(members, m.category, 'final', m) : null;
      })
      .filter(Boolean);
  }

  const isSubset = (small, big) => small.every(n => big.includes(n));

  // Classify every auto and final bout, one-to-one. Two passes so an EXACT match always wins
  // over a grew: otherwise an auto pair {A,B} could grow into a final trio {A,B,C} and steal it
  // from the auto trio {A,B,C} that matches it exactly.
  function diffBouts(autoBouts, finalBouts) {
    const finals = finalBouts.map(b => ({ bout: b, names: b.members.map(m => m.name), used: false }));
    const kept = [], grew = [], dropped = [];

    // Pass 1 — exact key matches (keys are the sorted member-name set).
    const pending = [];
    for (const a of autoBouts) {
      const exact = finals.find(f => !f.used && f.bout.key === a.key);
      if (exact) { exact.used = true; kept.push({ auto: a, final: exact.bout }); }
      else pending.push(a);
    }
    // Pass 2 — a leftover auto bout the coach grew (its members ⊂ a still-unclaimed final bout).
    for (const a of pending) {
      const aNames = a.members.map(m => m.name);
      const superset = finals.find(f => !f.used && f.names.length > aNames.length && isSubset(aNames, f.names));
      if (superset) { superset.used = true; grew.push({ auto: a, final: superset.bout }); }
      else dropped.push(a);
    }
    const added = finals.filter(f => !f.used).map(f => f.bout);

    const autoN = autoBouts.length;
    const stats = {
      auto: autoN, final: finalBouts.length,
      kept: kept.length, grew: grew.length, added: added.length, dropped: dropped.length,
      // §3 baseline convention: a grown pair counts as NOT surviving (its exact bout is gone).
      survivedStrict: kept.length,
      droppedStrict: dropped.length + grew.length,
      survivalRateStrict: autoN ? kept.length / autoN : 0,
    };
    return { kept, grew, added, dropped, stats };
  }

  // Convenience: diff a whole Spars.json day object.
  function diffDay(spars) {
    return diffBouts(normalizeAuto(spars && spars.phaseLog), normalizeFinal(spars && spars.matches));
  }

  return { normalizeAuto, normalizeFinal, diffBouts, diffDay, keyOf };
});
