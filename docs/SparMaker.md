# SparMaker.js — Documentation & Review

## Purpose

Auto-generates boxing sparring pairs from pre-classified bucket data. Produces 1v1 matches and 3-person round-robin groups, maximising match coverage while respecting weight tolerances and club-diversity rules.

Run after `PutAllFightersinBuckets.js` has produced the bucket file.

```bash
node SparMaker.js
```

---

## I/O

| | Path |
|---|---|
| **Input** | `output/Buckets/tsc-2025-buckets.json` |
| **Output** | `output/Spars/{YYYY-MM-DD}/Spars.json` |

### Input schema (`tsc-2025-buckets.json`)

```json
{
  "finalBuckets": {
    "<category>": [
      { "name": "...", "weight": 72.5, "club": "...", "experience": 12, "sparsPerDay": 1 }
    ]
  },
  "summary": { "totalDistributed": 48 }
}
```

- `category` — e.g. `"SeniorMale_70-75"`, `"JuniorFemale"`. The key `"NotFit"` is always skipped.
- `sparsPerDay` — optional integer; defaults to `1` if absent. Caps how many spars a boxer can receive across all phases.

### Output schema (`Spars.json`)

```json
{
  "summary": {
    "totalBoxers": 48,
    "matchedCount": 44,
    "unmatchedCount": 2,
    "matchCount": 20,
    "groupCount": 1,
    "successRate": "91.7%"
  },
  "matches": [
    {
      "red":       { "name": "...", "weight": 70.0, "club": "...", "experience": 8 },
      "blue":      { "name": "...", "weight": 71.5, "club": "...", "experience": 10 },
      "weightDiff": "1.50",
      "category":  "SeniorMale_70-75",
      "groupId":   null,
      "third":     { "name": "...", ... }
    }
  ],
  "unmatched": [
    { "name": "...", "weight": 90.0, "club": "...", "experience": 3, "category": "SeniorMale_90+" }
  ]
}
```

**`matchedCount`** counts boxers, not bouts: `2 × (pure pairs) + 3 × (groups)`.  
**`groupId`** is `null` for pure 1v1 pairs; `"g1"`, `"g2"`, … for groups.  
**`third`** field is only present on group matches.

---

## Configuration

| Constant | Value | Used in |
|---|---|---|
| `WEIGHT_TOLERANCE` | `2.0 kg` | Phase 1, Phase 3b |
| `PHASE2_TOLERANCE` | `2.5 kg` | Phase 2 |
| `TODAY` | Local date YYYY-MM-DD | Output path |
| `SOURCE_FILE` | `output/Buckets/tsc-2025-buckets.json` | Input path |

---

## Three-Phase Algorithm

### Phase 1 — Within-bucket ±2 kg

Calls `pairBoxers()` on every category with `WEIGHT_TOLERANCE = 2.0`. Boxers that cannot be paired become `bucketUnmatched[category]` and feed Phase 2.

### Phase 2 — Within-bucket ±2.5 kg

Re-runs `pairBoxers()` on Phase 1 remainders using the relaxed `PHASE2_TOLERANCE = 2.5`. Still within the same bucket — no cross-category relaxation. Remaining unmatched boxers are tagged with a temporary `_bucket` field and collected into `allUnmatched`.

### Phase 3b — Group round-robin

For each boxer in `allUnmatched`:

1. Scan every existing 1v1 match (`groupId === null`) in the **same source bucket**.
2. For each candidate pair, check whether the unmatched boxer is within `WEIGHT_TOLERANCE (2.0 kg)` of **either** partner (red or blue).
3. Apply the same club-preference logic as `pairBoxers` (different club preferred, then smallest weight diff).
4. If a candidate is found: set `match.groupId = "g{n}"` and `match.third = boxer`. The pair becomes a round-robin group.
5. If no candidate: boxer remains in the final `unmatched` list.

**Constraint:** Only within original bucket. A boxer cannot join a pair from a different category even if weights are compatible.

---

## `pairBoxers(boxers, categoryName, tolerance, sparCount)`

Exported function. Also used internally by all three phases.

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `boxers` | `Boxer[]` | Pool to pair (not mutated — spread-copied before sort) |
| `categoryName` | `string` | Attached to each match object as `category` |
| `tolerance` | `number` | Max allowed `|weightDiff|` in kg |
| `sparCount` | `Map<Boxer, number>` \| `undefined` | Tracks usage; boxer skipped when count ≥ `sparsPerDay` |

**Algorithm:**

1. Sort a copy of `boxers` ascending by weight.
2. Pop the lightest boxer (`current`) from the front.
3. Scan the remaining sorted list left-to-right:
   - Stop scanning as soon as `weightDiff > tolerance` (sorted order guarantees no further match).
   - Skip any opponent that has reached their `sparsPerDay` limit in `sparCount`.
   - Track the best opponent: **different club always preferred** over same club; within same-club preference, **smallest weight diff** wins.
4. If a best opponent was found: splice it out, increment both in `sparCount`, push a match.
5. Else: push `current` to unmatched.
6. Repeat until the sorted list is empty.

**Returns:** `{ matches: [...], unmatched: [...] }`

**Opponent selection priority (strict order):**

| Priority | Rule |
|---|---|
| 1 | Different club AND within tolerance → always beats a same-club option |
| 2 | Among same-club candidates → smallest weight diff wins |

---

## Review Findings

### Senior YOB cutoff

`SparMaker.js` does not perform YOB classification — bucket categories come from `PutAllFightersinBuckets.js` (via `constants.js`). Verify those cutoffs are the correct 2026 values: Schools 2012–2014, Juniors 2010–2011, Youths 2008–2009, Seniors ≤ 2007.

### Greedy sort biases heaviest boxers toward unmatched

Boxers are sorted ascending. The lightest are always popped first and matched against the next lightest within tolerance. Heavier boxers at the tail of a category have fewer potential partners below them and are more likely to be left unmatched. A better heuristic (e.g. match from both ends, or try mid-weight first) could improve coverage for outlier weights.

### Boxer objects mutated in place

Phase 2 spreads boxers (`{ ...b, _bucket: category }`) before tagging, so originals are safe. However, Phase 3b assigns `match.groupId` and `match.third` directly on the match objects in `allMatches`. Cleanup (`delete m.red._bucket`) also mutates the originals. Not a correctness bug, but makes the data flow harder to reason about.

### `sparCount` limit is silent

When a boxer is at their `sparsPerDay` limit, they are silently skipped with no console warning. A boxer could appear in the unmatched list for this reason with no obvious diagnostic output.

### No cross-bucket fallback

After Phase 2 and Phase 3b, a boxer who could theoretically be matched to someone in an adjacent bucket (e.g. 70 kg boxer in a 65–70 bucket and a 70–75 bucket remainder) is left unmatched. This is intentional to avoid cross-category mismatches, but it is not documented as a deliberate constraint in the code.

### Missing SOURCE_FILE exits with error code 1

Missing input file prints a clear error and calls `process.exit(1)` so callers can detect the failure.

### `matchCount` vs `matchedCount` naming

`summary.matchCount` = number of match objects (pairs + groups).  
`summary.matchedCount` = number of individual boxers in matches.  
The naming is easy to confuse; a comment or rename would clarify.
