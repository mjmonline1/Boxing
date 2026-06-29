// Copyright (c) 2026 ITLR Assets. All rights reserved. 
'use strict';
const fs   = require('fs');
const path = require('path');
const { SENIOR_YOB_MAX, R5_ELIGIBLE_YOB_MIN } = require('./constants');

const _d        = new Date();
const TODAY     = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
const DATA_FILE = path.join(__dirname, 'output', 'Spars', TODAY, 'Spars.json');
const OUT_DIR   = path.join(__dirname, 'output', 'Spars', TODAY);

const RINGS_OPEN = ['R1', 'R2', 'R3', 'R4'];
const RINGS_ALL  = ['R1', 'R2', 'R3', 'R4', 'R5'];

// ── Classifiers ──────────────────────────────────────────────────────────────

// All boxers in the match are male seniors (YOB ≤ SENIOR_YOB_MAX)
function isBothSeniorMale(match) {
  const sm = b => b.gender === 'male' && b.yob <= SENIOR_YOB_MAX;
  return sm(match.red) && sm(match.blue) && (!match.third || sm(match.third));
}

// Any boxer in the match is female
function hasFemale(match) {
  return match.red.gender === 'female' || match.blue.gender === 'female'
      || match.third?.gender === 'female';
}

// R5-eligible: every boxer must be female OR male Schools/Junior (YOB ≥ R5_ELIGIBLE_YOB_MIN).
function isR5Eligible(match) {
  const ok = b => b.gender === 'female' || (b.gender === 'male' && b.yob >= R5_ELIGIBLE_YOB_MIN);
  return ok(match.red) && ok(match.blue) && (!match.third || ok(match.third));
}

// ── Strategy 1: BALANCED ─────────────────────────────────────────────────────
// Least-loaded eligible ring.
// Females → R5 only. Junior males → R1-R5. Seniors/youth/cross-age → R1-R4.

function distributeBalanced(matches) {
  const queues = Object.fromEntries(RINGS_ALL.map(r => [r, []]));
  for (const match of matches) {
    const eligible = hasFemale(match)    ? ['R5']    :   // females must be in R5
                     isR5Eligible(match) ? RINGS_ALL :   // junior males can use any ring
                                          RINGS_OPEN;    // seniors/youth/cross-age → R1-R4
    const ring = eligible.reduce((best, r) =>
      queues[r].length < queues[best].length ? r : best
    );
    queues[ring].push(match);
  }
  return queues;
}

// ── Strategy 2: GROUPED ──────────────────────────────────────────────────────
// Senior males → R1/R2.  Junior males → R3/R4/R5.  Females → R5 only.
// Youth/cross-age males → R1-R4 (no R5).
// Greedy fill: pack preferred rings to cap before spilling to fallback.

function distributeGrouped(matches) {
  const queues = Object.fromEntries(RINGS_ALL.map(r => [r, []]));
  const CAP    = Math.ceil(matches.length / RINGS_ALL.length);

  function fillGroup(group, preferred, fallback) {
    for (const m of group) {
      const underCap = preferred.filter(r => queues[r].length < CAP);
      const ring = underCap.length > 0
        ? underCap[0]
        : fallback.reduce((a, b) => queues[a].length <= queues[b].length ? a : b);
      queues[ring].push(m);
    }
  }

  const seniorMales = matches.filter(isBothSeniorMale);
  const females     = matches.filter(hasFemale);
  const juniorMales = matches.filter(m => isR5Eligible(m) && !hasFemale(m));
  const other       = matches.filter(m => !isBothSeniorMale(m) && !hasFemale(m) && !isR5Eligible(m));

  fillGroup(seniorMales, ['R1', 'R2'],       RINGS_OPEN);  // seniors → R1 then R2
  fillGroup(females,     ['R5'],             ['R5']);       // females forced to R5
  fillGroup(juniorMales, ['R3', 'R4', 'R5'], RINGS_ALL);   // juniors prefer R3/R4/R5
  fillGroup(other,       ['R2', 'R3', 'R4'], RINGS_OPEN);  // youth/cross-age → R1-R4

  return queues;
}

// ── Bout duration (minutes) ───────────────────────────────────────────────────
// Senior MALE = 3×3min + 2×1min rest = 11 min. All others — youth/junior males AND
// all females (incl. senior-aged) — = 3×2min + 2×1min = 8 min. Round-robin groups of
// 3 run all three bouts in sequence: 3× single bout time.
// Uses isBothSeniorMale (gender-aware) — a senior-aged female bout is NOT 3×3.

function boutDuration(match) {
  const single = isBothSeniorMale(match) ? 11 : 8;
  return match.third ? single * 3 : single;
}

// ── Slot builder (shared) ────────────────────────────────────────────────────

function buildSlots(queues) {
  const activeRings = RINGS_ALL.filter(r => queues[r].length > 0);
  const head        = Object.fromEntries(activeRings.map(r => [r, 0])); // next unplaced index per ring
  const slots       = [];
  let remaining     = activeRings.reduce((n, r) => n + queues[r].length, 0);

  const boxerIds = m => [m.red, m.blue, m.third].filter(Boolean).map(b => b.id ?? b.name);

  // One bout per ring per slot. A boxer with sparsPerDay > 1 has multiple bouts, so a bout is
  // deferred to a later slot if either fighter is already busy in this slot — that ring simply
  // idles this slot and retries its head next slot. With all bouts having distinct fighters
  // (sparsPerDay=1) nothing ever collides, so every ring advances each slot — identical to the
  // old index-by-slot layout.
  while (remaining > 0) {
    const bouts = [];
    const busy  = new Set();
    for (const ring of activeRings) {
      const m = queues[ring][head[ring]];
      if (!m) continue;                                   // ring exhausted
      if (boxerIds(m).some(id => busy.has(id))) continue; // fighter already in this slot — defer
      boxerIds(m).forEach(id => busy.add(id));
      bouts.push({ ring, sparId: m.sparId, category: m.category,
                   duration: boutDuration(m),
                   red: m.red, blue: m.blue, third: m.third || null,
                   weightDiff: m.weightDiff });
      head[ring]++; remaining--;
    }
    slots.push({ slot: slots.length + 1, bouts });
  }

  return slots;
}

function makeSummary(label, matches, queues, slots) {
  return {
    strategy:         label,
    totalMatches:     matches.length,
    seniorMale:       matches.filter(isBothSeniorMale).length,
    female:           matches.filter(hasFemale).length,
    juniorMale:       matches.filter(m => isR5Eligible(m) && !hasFemale(m)).length,
    youthCrossAge:    matches.filter(m => !isBothSeniorMale(m) && !hasFemale(m) && !isR5Eligible(m)).length,
    totalSlots:       slots.length,
    matchesPerRing:   Object.fromEntries(RINGS_ALL.map(r => [r, queues[r].length]))
  };
}

// Flat allocation rows for allocations.json. Includes the round-robin `third` so a
// 3-person group isn't misrepresented as a 2-person bout (the boxer would be invisible).
function flattenAllocations(slots) {
  return slots.flatMap(s =>
    s.bouts.map(b => ({
      slot: s.slot, ring: b.ring, sparId: b.sparId, category: b.category,
      red:  `${b.red.name} (${b.red.club})`,
      blue: `${b.blue.name} (${b.blue.club})`,
      ...(b.third ? { third: `${b.third.name} (${b.third.club})` } : {}),
      weightDiff: b.weightDiff
    }))
  );
}

/* c8 ignore start */
function saveSchedule(filename, summary, slots) {
  fs.writeFileSync(
    path.join(OUT_DIR, filename),
    JSON.stringify({ summary, slots }, null, 2)
  );
}

function printSummary(s) {
  console.log(`\n── ${s.strategy} ──`);
  console.log(`  Slots needed : ${s.totalSlots}`);
  RINGS_ALL.forEach(r => {
    const ring = s.matchesPerRing[r];
    console.log(`  ${r}: ${String(ring).padStart(2)} bouts`);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

function run(day = 1) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    console.error(`Error reading ${DATA_FILE}: ${err.message}`);
    process.exit(1);
  }
  const matches = data.matches.map((m, i) => ({ sparId: `S${i + 1}`, ...m }));

  // Sort by average bout weight to maximise boxer rest between days.
  // Odd days (Mon/Wed/Fri/Sun) → heaviest first so heavy fighters start early.
  // Even days (Tue/Thu/Sat)   → lightest first so they finish late — maximising gap.
  const avgWeight = m => m.third
    ? (m.red.weight + m.blue.weight + m.third.weight) / 3
    : (m.red.weight + m.blue.weight) / 2;
  const isOddDay  = day % 2 === 1;
  matches.sort((a, b) => isOddDay
    ? avgWeight(b) - avgWeight(a)   // desc
    : avgWeight(a) - avgWeight(b)   // asc
  );
  console.log(`Day ${day} (${isOddDay ? 'odd' : 'even'}) — sorted by weight ${isOddDay ? 'descending' : 'ascending'}`);

  const balancedQueues = distributeBalanced(matches);
  const balancedSlots  = buildSlots(balancedQueues);
  const balancedSum    = makeSummary('BALANCED', matches, balancedQueues, balancedSlots);

  const groupedQueues  = distributeGrouped(matches);
  const groupedSlots   = buildSlots(groupedQueues);
  const groupedSum     = makeSummary('GROUPED', matches, groupedQueues, groupedSlots);

  saveSchedule('schedule.json',         balancedSum, balancedSlots);
  saveSchedule('schedule_grouped.json', groupedSum,  groupedSlots);

  const allocations = flattenAllocations(balancedSlots);
  fs.writeFileSync(path.join(OUT_DIR, 'allocations.json'), JSON.stringify(allocations, null, 2));

  console.log('\n=== Spar Ring Allocation ===');
  console.log(`Total: ${matches.length}  |  Senior male: ${balancedSum.seniorMale}  |  Junior male (R5-ok): ${balancedSum.juniorMale}  |  Female: ${balancedSum.female}  |  Youth/cross-age: ${balancedSum.youthCrossAge}`);
  printSummary(balancedSum);
  printSummary(groupedSum);
  console.log(`\nOutput → ${OUT_DIR}`);
  console.log('  schedule.json         (balanced strategy — reference export)');
  console.log('  schedule_grouped.json (grouped strategy — loaded by RingManager)');
  console.log('  allocations.json      (flat list, from balanced)');
}

if (require.main === module) {
  const dayArg = process.argv.find(a => a.startsWith('--day='));
  const day    = dayArg ? parseInt(dayArg.split('=')[1]) : 1;
  run(day);
}
/* c8 ignore stop */

module.exports = {
  run,
  // Exposed for tests — pure ring-allocation logic.
  RINGS_OPEN, RINGS_ALL,
  isBothSeniorMale, hasFemale, isR5Eligible,
  distributeBalanced, distributeGrouped,
  boutDuration, buildSlots, makeSummary, flattenAllocations,
};
