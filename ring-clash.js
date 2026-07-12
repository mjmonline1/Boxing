// Copyright (c) 2026 ITLR Assets. All rights reserved.
// Cross-ring double-booking detector, shared by the browser tools:
//   RingManager.html (live on-board warning) and Utilities.html (Ring Clashes report).
// A "clash" is one fighter in two bouts in DIFFERENT rings whose times overlap, or are so
// tight back-to-back they couldn't move between rings. Same-ring bouts are sequential by
// construction (see computeTimes) so they never clash.
(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.RingClash = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Default minimum gap (minutes) a fighter needs between bouts in two different rings.
  // Larger than the 1-min in-ring changeover so a genuinely impossible hop is flagged.
  const DEFAULT_BUFFER_MIN = 3;

  // entries: [{ id, name, club, ring, start, end, sparId, label }]  (start/end in minutes)
  // returns: [{ id, name, club, type:'overlap'|'tight', gap, a:{…}, b:{…} }]
  //   gap = minutes between the two bouts (negative when they overlap); worst-first order.
  function findClashes(entries, bufferMin) {
    const buffer = bufferMin == null ? DEFAULT_BUFFER_MIN : bufferMin;
    const byFighter = new Map();
    for (const e of entries) {
      if (!byFighter.has(e.id)) byFighter.set(e.id, []);
      byFighter.get(e.id).push(e);
    }

    const clashes = [];
    for (const list of byFighter.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const x = list[i], y = list[j];
          if (x.ring === y.ring) continue;                 // same ring → sequential, no clash
          const [first, second] = x.end <= y.end ? [x, y] : [y, x];
          const gap = second.start - first.end;            // < 0 means they overlap
          if (gap < buffer) {
            clashes.push({
              id: x.id, name: x.name, club: x.club,
              type: gap < 0 ? 'overlap' : 'tight',
              gap,
              a: first, b: second
            });
          }
        }
      }
    }

    // Worst first: overlaps before tight gaps, then by biggest overlap / smallest gap.
    clashes.sort((p, q) => p.gap - q.gap || String(p.name).localeCompare(String(q.name)));
    return clashes;
  }

  return { findClashes, DEFAULT_BUFFER_MIN };
});
