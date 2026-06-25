# How Spar Matches Are Created

## Pipeline Position

```
RegisteredBoxers2025.csv
        ↓
PutAllFightersinBuckets.js  →  output/Buckets/tsc-2026-buckets.json
        ↓
SparMaker.js                →  output/Spars/Spars.json
        ↓
RingAssigner.js             →  output/Spars/schedule_grouped.json
```

---

## Input

`output/Buckets/tsc-2026-buckets.json` — produced by `PutAllFightersinBuckets.js`.

Each boxer has already been placed into a bucket based on gender, age group, and experience level:

| Dimension | Values |
|---|---|
| Gender | Male / Female |
| Age group (male) | Schools (YOB 2012–2014) · Junior (YOB 2010–2011) · Youth (YOB 2008–2009) · Senior (YOB ≤ 2007) |
| Experience (male) | Novice (0–5 bouts) · Experienced (6–10 bouts) · Open Class (11+ bouts) |
| Female | Single flat bucket — no age or experience sub-division |

This gives 12 male buckets (4 age groups × 3 experience tiers) plus `FitFemales` and `NotFit`. Weight matching is handled entirely by SparMaker — there are no weight-class buckets.

Boxers flagged `fit=no` are in the `NotFit` bucket and are skipped entirely.

---

## Matching Algorithm

The same core `pairBoxers` function is used in all three phases. It:

1. Sorts boxers by weight (lightest first).
2. Takes the lightest unpaired boxer and scans for the **best opponent** within the current tolerance:
   - Prefers a boxer from a **different club** (safety/fairness).
   - Among equal club-status candidates, picks the **closest weight**.
   - Stops scanning early once the weight gap exceeds tolerance (list is sorted).
3. On a match: records `{ red, blue, weightDiff, category }` and removes both from the pool.
4. On no match: boxer moves to the next phase.

### Phase 1 — Within-bucket (±2 kg)

Runs `pairBoxers` on each bucket with `WEIGHT_TOLERANCE = 2.0 kg`. Any boxer with no opponent within 2 kg is held back for Phase 2.

### Phase 2 — Within-bucket (±2.5 kg)

Reruns `pairBoxers` on each bucket's Phase 1 leftovers with `PHASE2_TOLERANCE = 2.5 kg`. Still confined to the same bucket — no cross-bucket mixing yet. Any boxer still unmatched moves to Phase 3.

### Phase 3 — Rescue pass (tolerance: 20 kg)
<!-- 📌 REVIEW NEEDED: This section does NOT match the current SparMaker.js implementation.
     Code does Phase 3b (unmatched boxer joins existing pair as `third` field on the match).
     Doc describes cross-bucket age×experience rescue pools — these do NOT exist in SparMaker.js.
     Needs owner decision before updating. -->

After all buckets are processed, leftover unmatched boxers are grouped by **age group AND experience tier** (12 male combinations) and run through the same `pairBoxers` algorithm with `RESCUE_WEIGHT_TOLERANCE = 20.0 kg`:

- `Schools_Novice` · `Schools_Experienced` · `Schools_OpenClass` (YOB 2012–2014)
- `Junior_Novice` · `Junior_Experienced` · `Junior_OpenClass` (YOB 2010–2011)
- `Youth_Novice` · `Youth_Experienced` · `Youth_OpenClass` (YOB 2008–2009)
- `Senior_Novice` · `Senior_Experienced` · `Senior_OpenClass` (YOB ≤ 2007)
- `Female` (single pool)

This catches near-misses where two boxers of similar weight had no partner in their own bucket.

Boxers still unmatched after the rescue pass are reported as genuinely unpaired — typically extreme weight outliers with no realistic opponent in the tournament.

---

## Output — `Spars.json`

```json
{
  "summary": {
    "totalBoxers": 138,
    "matchedCount": 110,
    "unmatchedCount": 5,
    "matchCount": 55,
    "successRate": "79.7%"
  },
  "matches": [
    {
      "red":        { "id": 12, "name": "...", "club": "...", "weight": 68.5, ... },
      "blue":       { "id": 27, "name": "...", "club": "...", "weight": 69.8, ... },
      "weightDiff": "1.30",
      "category":   "MaleSenior_Novice"
    },
    ...
  ],
  "unmatched": [
    { "red": { "id": 3, "name": "...", "weight": 33.2, ... } },
    ...
  ]
}
```

`matches` is consumed directly by `RingAssigner.js`. `unmatched` is displayed in `SparManager.html`'s unmatched pool, where it can be manually paired by drag-and-drop.

---

## Tuning

| Constant | Default | Effect |
|---|---|---|
| `WEIGHT_TOLERANCE` | `2.0 kg` | Phase 1 — maximum weight gap for within-bucket pairing |
| `PHASE2_TOLERANCE` | `2.5 kg` | Phase 2 — retry tolerance for within-bucket leftovers |
| `RESCUE_WEIGHT_TOLERANCE` | `20.0 kg` | Phase 3 — maximum weight gap for cross-bucket rescue |

Lowering `WEIGHT_TOLERANCE` produces safer matches but more unmatched boxers. Raising `RESCUE_WEIGHT_TOLERANCE` rescues more near-misses at the cost of larger cross-category weight gaps.

---

## Running

```bash
node SparMaker.js
```

Or via the server (triggers automatically and refreshes `RingManager.html`):

```
POST http://localhost:5500/api/run/spar-maker
```
