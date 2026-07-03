# N-Member Round-Robin Group Design

**Date:** 2026-07-03
**Status:** Implemented

---

## Problem

Round-robin groups were hardcoded to exactly 3 members (`red`, `blue`, `third`).
Organisers building spar assignments in SparManager needed to grow a group
past 3, still with full round-robin (every pair fights once — `C(n,2)`
bouts), and have that flow all the way through ring/time scheduling
(`RingAssigner.js`, `RingManager.html`), not just the pairing UI.

See `docs/superpowers/specs/2026-05-24-round-robin-group-design.md` for the
original trio-only design this generalizes.

---

## Solution: `red`/`blue`/`third` unchanged, `extra: []` for members 4+

```json
{
  "sparId": "S12",
  "red":   { "name": "David Haye",   "weight": 91.2 },
  "blue":  { "name": "Carl Froch",   "weight": 90.5 },
  "third": { "name": "Tyson Fury",   "weight": 90.0 },
  "extra": [
    { "name": "Anthony Joshua",     "weight": 91.8 },
    { "name": "Dillian Whyte",      "weight": 89.6 }
  ],
  "category": "MaleSenior_OpenClass"
}
```

Pairs and trios are byte-identical to before — `extra` is only ever present
when a group exceeds 3 members. This kept the migration additive: no
existing stored `Spars.json`/schedule file, and no trio-only code path,
needed to change to keep working.

---

## `group-utils.js` — shared N-member helpers

New file, repo root. This is the first module in the codebase shared between
Node and the browser — `boxer-csv.js` (the existing "shared parser") is
Node-only, and `RingAssigner.js`/`SparMaker.js` were never `<script>`-included
by the HTML tools before now.

```js
(function (global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.GroupUtils = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return { membersOf, setMembers, generateBouts, boutCount, avgWeight, memberCount, isGroup };
});
```

API:
- `membersOf(match)` — ordered `[red, blue, third, ...extra].filter(Boolean)`.
- `setMembers(match, arr)` — writes back, preserving the additive format.
- `generateBouts(members)` — all `C(n,2)` pairs.
- `boutCount(members)` — `n*(n-1)/2` closed form.
- `avgWeight(members)`, `memberCount(match)`, `isGroup(match)` (`memberCount > 2`).

Consumers: `require('./group-utils')` in Node (`RingAssigner.js`,
`SparMaker.js`, both Netlify functions); `<script src="group-utils.js">` in
the browser (`SparManager.html`, `RingManager.html`).

---

## SparMaker.js

Phase 3b (the automated pairer) intentionally stays trio-only — N-member
growth is a manual SparManager action, not something the algorithm produces.
Touched only defensively, so a manually-grown group fed back through these
functions on a re-save doesn't crash: `_bucket` cleanup,
`checkMatchingRisks()`'s pairwise-diff generation, and `matchedCount` now all
go through `GroupUtils.membersOf()`/`generateBouts()` instead of a hardcoded
3-slot shape.

---

## RingAssigner.js

- Classifiers (`isBothSeniorMale`, `hasFemale`, `isR5Eligible`) now do
  `GroupUtils.membersOf(match).every(...)`/`.some(...)` instead of a
  `red && blue && (!third || ...)` chain.
- `boutDuration()` = `single * GroupUtils.boutCount(members)` — was
  `match.third ? single*3 : single`. `C(3,2)===3`, so trio behavior is
  unchanged; a 5-member group now correctly runs 10 bouts, not 3.
- `avgWeight`, `buildSlots`, `flattenAllocations` all read/write `extra`
  conditionally, so plain pairs/trios get zero JSON diff.

---

## RingManager.html

- `boutHTML()` now loops over `GroupUtils.generateBouts(members)` to render
  every pairwise name-line and weight-diff, instead of a fixed 3-line
  template. Plain pairs are untouched.
- `boutFormat()` appends a bout-count/total-time note for groups so a
  4-member group (6 bouts) doesn't read as "3× bout".
- `computeTimes()`'s duration fallback now accounts for group size.
- **Bug fix, found while generalizing**: `canPlaceInR5()` only ever checked
  `red`/`blue`, silently ignoring `third` — a female-ineligible third boxer
  wouldn't have blocked an R5 placement. Now scans all members via
  `GroupUtils.membersOf(bout).every(ok)`.
- **Bug fix, found while generalizing**: `saveToServer()`/`exportAllocation()`
  rebuilt bout rows from only `red`/`blue`/`weightDiff`, silently dropping
  `third` (and would have dropped `extra`) on every save/export. Both now
  conditionally include `third`/`extra`.

---

## SparManager.html

- **Drag-onto-a-tile is now unconditional swap.** The old Ctrl+drop-onto-tile
  "add a third" special case is removed — it conflicted with the rule "drop
  onto a tile always swaps." Ctrl+drop-on-the-card-**background** remains the
  add/grow gesture (already wired, users already trained on it), with the
  `!m.third` size cap removed entirely — no size limit.
- `findBoxer()`/`setMemberAt()` (replacing `setCorner()`) operate on
  `GroupUtils.membersOf()`/`setMembers()` instead of three named fields.
- `unmatchBoxer()` collapsed three hand-written branches (remove-third,
  remove-red-or-blue-from-a-trio, dissolve-a-plain-pair) into one
  generic remove-and-repack — a genuine LOC reduction, not just a
  generalization.
- Tile rendering loops over `GroupUtils.membersOf(m)` instead of a fixed
  red/blue/third DOM block; a new `.extra-corner` CSS class styles members
  beyond the third identically to `.third-corner`.
- `updateStats()`'s "X group of 3" label is now generic "X groups" since
  sizes vary.

---

## netlify/functions/generate-spars.js, generate-schedule.js

Mirrored per this project's Netlify-sync convention: `matchedCount` and the
scheduling `avg` weight closure now go through `GroupUtils.membersOf()`/
`avgWeight()` instead of a hardcoded `third ? 3 : 2` / `/3 : /2` ternary.

---

## Test Suite

New N=4/5-member cases added alongside existing trio assertions (none
weakened — `C(3,2)=3` already coincidentally matched the old hardcoded `×3`,
so no existing assertion value changed, only the code path producing it):

| File | What was added |
|---|---|
| `tests/ringAssigner.test.js` | `boutDuration` for 4/5-member groups; classifiers scanning `extra[]`; `flattenAllocations` byte-identical-for-pairs regression guard |
| `tests/ringManager.test.js` | `boutType`/`canPlaceInR5` scanning `extra[]` (incl. the R5 bug-fix regression test); `boutHTML` rendering all `C(5,2)=10` pairwise bouts |
| `tests/sparMaker.test.js` | `checkMatchingRisks` on a manually-grown 5-member group; `matchedCount` reducer over `extra[]` |
| `tests/pipeline.e2e.test.js` | A manually-grown 5-member group pushed through `buildSlots`/`distributeBalanced`, confirming `extra` survives and duration is `single × C(5,2)` |
| `tests/helpers/mongo.js` | `assertMatch`/`assertScheduleDoc` now accept `extra` as null/absent or an array of valid boxer docs, mirroring the existing `third` null\|object pattern |

---

## Files Changed

| File | Change |
|---|---|
| `group-utils.js` | New — shared N-member helpers (first Node+browser dual-export module in this repo) |
| `RingAssigner.js` | Classifiers, `boutDuration`, `avgWeight`, `buildSlots`/`flattenAllocations` generalized |
| `RingManager.html` | `boutHTML`/`boutType`/`canPlaceInR5`/`boutFormat`/`computeTimes` generalized; `canPlaceInR5` R5-eligibility bug fixed; `saveToServer`/`exportAllocation` third+extra-dropping bug fixed |
| `SparManager.html` | Tile-drop is now unconditional swap; background-drop is the add/grow gesture with no cap; `unmatchBoxer` generalized; tile render loop; `.extra-corner` CSS |
| `SparManager.css` | New `.extra-corner` rule |
| `SparMaker.js` | Defensive generalization of `checkMatchingRisks`/`matchedCount`/`_bucket` cleanup |
| `netlify/functions/generate-spars.js` | `matchedCount` generalized |
| `netlify/functions/generate-schedule.js` | avg weight generalized |
| `tests/ringAssigner.test.js`, `ringManager.test.js`, `sparMaker.test.js`, `pipeline.e2e.test.js`, `helpers/mongo.js` | New N=4/5 cases |
| `package.json` | `1.3.43` → `1.3.44` |
| `docs/spar-group-architecture.md` | New — current-state architecture reference gathered ahead of this change |
