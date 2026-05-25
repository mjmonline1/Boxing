# Round-Robin Group Design

**Date:** 2026-05-24
**Status:** Implemented

---

## Problem

Phase 3b of the spar-pairing algorithm attaches an unmatched boxer to an existing pair, creating a 3-person round-robin (A vs B, A vs C, B vs C). The old implementation emitted **three separate match records** sharing a `groupId`. This meant:

- RingAssigner could schedule each bout independently, breaking the session.
- SparManager showed three unlinked cards — no visual cue that the boxers were a group.
- A boxer (e.g. Tyson Fury) appeared multiple times in the spar list, misleading organisers.

---

## Solution: Single Record per Group

A round-robin group is now one match record with three boxer fields: `red`, `blue`, `third`.

```json
{
  "sparId": "S12",
  "groupId": "g7",
  "red":   { "name": "David Haye",   "club": "...", "weight": 91.2, ... },
  "blue":  { "name": "Carl Froch",   "club": "...", "weight": 90.5, ... },
  "third": { "name": "Tyson Fury",   "club": "...", "weight": 90.0, ... },
  "category": "MaleSenior_OpenClass",
  "weightDiff": "0.70"
}
```

The three individual bouts (A↔B, A↔C, B↔C) are implied by the presence of `third` and do not need to be stored separately.

---

## SparMaker.js — Phase 3b

**Before:** tagged anchor with `groupId`, pushed 2 extra records.  
**After:** sets `anchor.third = boxer` on the anchor record only. No extra records.

```js
anchor.groupId = gid;
anchor.third   = boxer;
```

`matchedCount` now counts correctly:
```js
const matchedCount = allMatches.reduce((n, m) => n + (m.third ? 3 : 2), 0);
```

`_bucket` cleanup covers the third boxer:
```js
allMatches.forEach(m => {
    delete m.red._bucket; delete m.blue._bucket;
    if (m.third) delete m.third._bucket;
});
```

---

## RingAssigner.js

All helpers updated to account for `match.third` when present.

### Classifiers
- `isBothSeniorMale` — all three must be senior male (YOB ≤ 2006).
- `hasFemale` — any of the three is female.
- `isR5Eligible` — all three must qualify (female or male junior YOB ≥ 2009).

### Bout duration
A round-robin session occupies the ring for 3× a single bout:
- Senior group: 3 × 11 min = **33 min**
- Youth/Junior group: 3 × 8 min = **24 min**

```js
function boutDuration(match) {
  const single = match.category?.includes('Senior') ? 11 : 8;
  return match.third ? single * 3 : single;
}
```

### Weight sort
Average weight uses all three boxers when `third` is present.

### buildSlots output
`third` is passed through to the schedule slot so downstream tools (RingManager) can display all three names.

---

## SparManager.html

### Group card header
When `m.third` is set the normal weight-diff badge is replaced by a prominent Round Robin label:

```
⬡ Round Robin · 3× bout   [S12]   MaleSenior_OpenClass
```

CSS class `.rr-badge` — purple (`#6a1b9a`) on light purple background (`#f3e5f5`).

### Third boxer tile
A `⚪ Third` corner tile with a purple top border is rendered alongside Red and Blue:

```
[🔴 Red corner]  vs  [🔵 Blue corner]  vs  [⚪ Third]
```

### Ctrl+drop — manual group creation
An organiser can manually create a group of 3 in SparManager by holding **Ctrl** while dropping an unmatched boxer onto an existing pair (onto either boxer tile or the card background). The same `third` field is used, so the card renders identically to an auto-generated group.

Without Ctrl, the drop performs the original swap behaviour.

### Drag-to-remove from group
- **Drag the third** to the unmatched pool → third removed, pair of 2 remains.
- **Drag red or blue** from a group of 3 → that boxer goes to pool, third slides into the vacated corner, pair of 2 remains.
- **Delete (✕)** a group → all three boxers go to unmatched pool.

### Stats bar
Shows groups and pairs separately:  
`12 pairs · 2 groups of 3 · 4 unmatched`

---

## Test Suite (pairBoxers)

`tests/sparMaker.test.js` — 15 tests covering Phase 1/2 pairing using `node:test` + `node:assert/strict`. Run with:

```
node --test tests/sparMaker.test.js
```

Key cases covered: weight tolerance, club avoidance, `sparsPerDay` limit, object-reference keyed `sparCount` (prevents same-name collision), `groupId: null` on non-group matches, `weightDiff` as 2-decimal string.

---

## Files Changed

| File | Change |
|---|---|
| `SparMaker.js` | Phase 3b emits single group record; `matchedCount` fix; `_bucket` cleanup |
| `RingAssigner.js` | Classifiers, `boutDuration` (3×), `avgWeight`, `buildSlots` — all group-aware |
| `SparManager.html` | `rr-badge` CSS; group card header; third corner tile; Ctrl+drop; group mutations |
| `tests/sparMaker.test.js` | New — 15 pairBoxers tests |
| `WeightProximity.js` | New — finds all within-bucket pairs ≤ 2kg, outputs CSV |
