// Copyright (c) 2026 ITLR Assets. All rights reserved.
// Generic N-member round-robin group helpers, shared by the Node pipeline
// (SparMaker.js, RingAssigner.js, netlify/functions/*) and the browser tools
// (SparManager.html, RingManager.html via <script src="group-utils.js">).
(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.GroupUtils = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Ordered member list. Order is load-bearing: red, blue, third, then extra[]
  // in order — reproduces today's pairwise (red-blue, red-third, blue-third) order exactly.
  function membersOf(match) {
    return [match.red, match.blue, match.third, ...(match.extra || [])].filter(Boolean);
  }

  // Writes an ordered member array back onto match, preserving the additive
  // wire format: groups of <=3 never get an `extra` key (byte-identical to today).
  function setMembers(match, members) {
    match.red = members[0];
    match.blue = members[1];
    if (members.length >= 3) match.third = members[2];
    else delete match.third;
    if (members.length > 3) match.extra = members.slice(3);
    else delete match.extra;
  }

  // All C(n,2) unique pairs, in the same order as today's hardcoded d1/d2/d3.
  function generateBouts(members) {
    const bouts = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        bouts.push([members[i], members[j]]);
      }
    }
    return bouts;
  }

  // Closed-form n*(n-1)/2 — avoids allocating the bout array where only the count is needed.
  function boutCount(members) {
    const n = members.length;
    return n * (n - 1) / 2;
  }

  function avgWeight(members) {
    return members.reduce((s, b) => s + b.weight, 0) / members.length;
  }

  function memberCount(match) {
    return membersOf(match).length;
  }

  function isGroup(match) {
    return memberCount(match) > 2;
  }

  return { membersOf, setMembers, generateBouts, boutCount, avgWeight, memberCount, isGroup };
});
