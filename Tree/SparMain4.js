'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'output', 'Spars', 'Spars.json');
const OUT_DIR   = path.join(__dirname, 'output', 'Spars');

const RINGS_OPEN = ['R1', 'R2', 'R3', 'R4'];
const RINGS_ALL  = ['R1', 'R2', 'R3', 'R4', 'R5'];

// ── Classifiers ──────────────────────────────────────────────────────────────

// Both boxers are male seniors (YOB ≤ 2006)
function isBothSeniorMale(match) {
  const sm = b => b.gender === 'male' && b.yob <= 2006;
  return sm(match.red) && sm(match.blue);
}

// Either boxer is female
function hasFemale(match) {
  return match.red.gender === 'female' || match.blue.gender === 'female';
}

// R5-eligible: every boxer must be female OR male junior (YOB ≥ 2009).
// Cross-age pairs with a senior/youth male are excluded even if the other boxer qualifies.
function isR5Eligible(match) {
  const ok = b => b.gender === 'female' || (b.gender === 'male' && b.yob >= 2009);
  return ok(match.red) && ok(match.blue);
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

// ── Slot builder (shared) ────────────────────────────────────────────────────

function buildSlots(queues) {
  const activeRings = RINGS_ALL.filter(r => queues[r].length > 0);
  const maxSlots    = Math.max(...activeRings.map(r => queues[r].length));
  const slots       = [];

  for (let i = 0; i < maxSlots; i++) {
    const bouts = [];
    for (const ring of activeRings) {
      const m = queues[ring][i];
      if (m) bouts.push({ ring, sparId: m.sparId, category: m.category,
                          red: m.red, blue: m.blue, weightDiff: m.weightDiff });
    }
    slots.push({ slot: i + 1, bouts });
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

const data    = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
const matches = data.matches.map((m, i) => ({ sparId: `S${i + 1}`, ...m }));

// Run both strategies
const balancedQueues = distributeBalanced(matches);
const balancedSlots  = buildSlots(balancedQueues);
const balancedSum    = makeSummary('BALANCED', matches, balancedQueues, balancedSlots);

const groupedQueues  = distributeGrouped(matches);
const groupedSlots   = buildSlots(groupedQueues);
const groupedSum     = makeSummary('GROUPED', matches, groupedQueues, groupedSlots);

// Write outputs
saveSchedule('schedule.json',         balancedSum, balancedSlots);
saveSchedule('schedule_grouped.json', groupedSum,  groupedSlots);

// Flat allocations (balanced — consumed by SparManager)
const allocations = balancedSlots.flatMap(s =>
  s.bouts.map(b => ({
    slot: s.slot, ring: b.ring, sparId: b.sparId, category: b.category,
    red:  `${b.red.name} (${b.red.club})`,
    blue: `${b.blue.name} (${b.blue.club})`,
    weightDiff: b.weightDiff
  }))
);
fs.writeFileSync(path.join(OUT_DIR, 'allocations.json'), JSON.stringify(allocations, null, 2));

// ── Console output ────────────────────────────────────────────────────────────

console.log('\n=== Spar Ring Allocation ===');
console.log(`Total: ${matches.length}  |  Senior male: ${balancedSum.seniorMale}  |  Junior male (R5-ok): ${balancedSum.juniorMale}  |  Female: ${balancedSum.female}  |  Youth/cross-age: ${balancedSum.youthCrossAge}`);
printSummary(balancedSum);
printSummary(groupedSum);
console.log(`\nOutput → ${OUT_DIR}`);
console.log('  schedule.json         (balanced — loaded by SparManager)');
console.log('  schedule_grouped.json (grouped by category)');
console.log('  allocations.json      (flat list)');
