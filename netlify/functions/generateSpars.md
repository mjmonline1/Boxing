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

---

## New Group Changes

### Overview

Two additions to the pairing pipeline:

1. **`sparsPerDay` support (1v1 only)** — a boxer with `sparsPerDay > 1` can appear in multiple 1v1 matches. A `sparCount` map (keyed by boxer name) tracks usage across phases. Only enforced in 1v1 pairing — not used in group formation.

2. **Phase 3b: group round-robin** — after phase 3a rescue, any still-unmatched boxer tries to join an existing 1v1 pair **within the same bucket**. When a pair is found, the three boxers form a round-robin group: the existing A-B match is kept, and two new matches (A-C and B-C) are created. All three matches are tagged with a shared `groupId`. This automates what coaches previously did manually at the camp.

---

### Phase 3b — Group Formation

**Position in pipeline:**

```
Phase 1 (±2.0 kg, within bucket)
Phase 2 (±2.5 kg, within bucket)
Phase 3a (±20 kg rescue, cross-bucket, age×experience groups)  ← unchanged
Phase 3b (group round-robin, within bucket)                    ← NEW
```

**Algorithm:**

1. Each unmatched boxer (from phase 3a remainder) carries a `_bucket` tag from phase 2 identifying their original bucket.
2. Scan existing 1v1 matches for one in the same bucket that hasn't been grouped yet (`!m.groupId`).
3. Prefer different club; among ties take closest weight. Weight tolerance: `W_TOL3 = 20 kg`.
4. On match found, assign a `groupId` (e.g. `g1`, `g2`, …) to the anchor match and push two new round-robin records.
5. `_bucket` is stripped from all boxer objects before saving to MongoDB.

**Round-robin output for group [A, B, C]:**

| Match | Record |
|---|---|
| A vs B | existing match — `groupId` added |
| A vs C | new match — same `category` and `groupId` |
| B vs C | new match — same `category` and `groupId` |

A pair can only be grouped once — once `groupId` is set it is skipped in subsequent searches.

---

### Match Record Shape

Normal 1v1 (unchanged):
```json
{
  "red":  { "name": "…", "club": "…", "weight": 72.0, … },
  "blue": { "name": "…", "club": "…", "weight": 73.2, … },
  "weightDiff": "1.20",
  "category": "Senior Male WC1"
}
```

Group match (all three share the same `groupId`):
```json
{ "red": A, "blue": B, "weightDiff": "1.20", "category": "Senior Male WC1", "groupId": "g1" }
{ "red": A, "blue": C, "weightDiff": "2.10", "category": "Senior Male WC1", "groupId": "g1" }
{ "red": B, "blue": C, "weightDiff": "0.90", "category": "Senior Male WC1", "groupId": "g1" }
```

---

### Updated Summary Fields

| Field | Description |
|---|---|
| `matchCount` | Total match records (includes group round-robins) |
| `groupCount` | Number of groups formed in phase 3b |
| `unmatchedCount` | Boxers with no match and no group after all phases |
| `successRate` | `(total - unmatched) / total × 100` |

---

### `sparsPerDay` — 1v1 Only

| Value | Behaviour |
|---|---|
| absent / `1` | Boxer matched at most once across all 1v1 phases |
| `2` | Boxer eligible to be paired in a second 1v1 match |
| `n` | Boxer eligible for up to `n` 1v1 matches |

`sparsPerDay` has **no effect** on group formation — any 1v1 pair in the same bucket may absorb a third boxer regardless of `sparsPerDay`.
