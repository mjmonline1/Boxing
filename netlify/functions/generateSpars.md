# generate-spars.js (Netlify Function)

Reads bucket data from MongoDB, runs a 3-phase pairing algorithm, and writes the resulting spars back to MongoDB.

## Pipeline Position

```
MongoDB: buckets { _id: 'current', finalBuckets, summary }   ← written by BucketAssigner
        ↓
generate-spars (POST /api/generate-spars)
        ↓
MongoDB: spars { _id: 'current', summary, matches, unmatched }
```

## Trigger

```
POST /api/generate-spars
```

No request body required. Reads and writes MongoDB directly.

## Pairing Algorithm

Matching runs in 3 sequential phases. A boxer is promoted to the next phase only if unmatched in all prior phases.

### Phase 1 — Tight within-bucket (±2.0 kg)

For each bucket (category), sort boxers by weight ascending and greedily pair each boxer with the closest opponent within `W_TOL1 = 2.0 kg`, preferring different clubs.

### Phase 2 — Relaxed within-bucket (±2.5 kg)

Phase 1 remainders are re-run through the same algorithm with `W_TOL2 = 2.5 kg`, still within their original bucket category.

### Phase 3 — Rescue cross-bucket (±20.0 kg)

All still-unmatched boxers are pooled into sub-groups by **age group × experience tier** (males) or a single **Female_Rescue** pool, then re-paired with `W_TOL3 = 20.0 kg`.

**Age groups (male):**

| Group | YOB range |
|---|---|
| Schools | 2012–2014 |
| Junior | 2010–2011 |
| Youth | 2008–2009 |
| Senior | ≤ 2007 |

**Experience tiers:**

| Tier | Bouts range |
|---|---|
| Novice | 0–5 |
| Experienced | 6–10 |
| OpenClass | 11+ |

Rescue category label: `{AgeGroup}_{Tier}_Rescue` (e.g. `Senior_Novice_Rescue`) or `Female_Rescue`.

### `pairBoxers(boxers, category, tolerance)` — core function

1. Sort pool by weight ascending.
2. Pop lightest boxer (`cur`).
3. Scan remaining — stop when weight gap exceeds tolerance.
4. Among candidates: prefer a different club; among ties, take closest weight.
5. If a partner found: emit match `{ red: cur, blue: opp, weightDiff, category }`.
6. If no partner: `cur` moves to unmatched.
7. Repeat until pool is empty.

## MongoDB Collections

**Input** — `buckets`

```json
{
  "_id": "current",
  "finalBuckets": {
    "Senior Male WC1": [ { "name": "...", "club": "...", "weight": 72.5, "yob": 2003, "gender": "male", "experience": 8 } ],
    "NotFit": []
  },
  "summary": { "totalDistributed": 42 }
}
```

`NotFit` bucket is skipped entirely.

**Output** — `spars`

```json
{
  "_id": "current",
  "summary": {
    "totalBoxers": 42,
    "matchedCount": 38,
    "unmatchedCount": 4,
    "matchCount": 19,
    "successRate": "90.5%"
  },
  "matches": [
    {
      "red":  { "name": "Alice Smith", "club": "City BC", "weight": 72.0, "yob": 2003, "gender": "male", "experience": 8 },
      "blue": { "name": "Bob Jones",   "club": "East BC",  "weight": 73.2, "yob": 2004, "gender": "male", "experience": 7 },
      "weightDiff": "1.20",
      "category": "Senior Male WC1"
    }
  ],
  "unmatched": [ { "name": "...", ... } ]
}
```

`weightDiff` is a string formatted to 2 decimal places.

## Weight Tolerances

| Constant | Value | Used in |
|---|---|---|
| `W_TOL1` | 2.0 kg | Phase 1 |
| `W_TOL2` | 2.5 kg | Phase 2 |
| `W_TOL3` | 20.0 kg | Phase 3 rescue |

## Error Responses

| Condition | Status | Body |
|---|---|---|
| No bucket data in MongoDB | 400 | `{ "error": "No bucket data. Run BucketAssigner first." }` |
| Any runtime exception | 500 | `{ "error": "<message>" }` |
