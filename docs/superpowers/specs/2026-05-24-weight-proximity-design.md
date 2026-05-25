# Weight Proximity Report — Design Spec

**Date:** 2026-05-24
**Status:** Approved

## Purpose

Find every pair of boxers within a bucket whose weight difference is ≤ 2kg. Output is a CSV for manual review — helps organisers see the full matchup landscape before running the greedy pairing algorithm.

## Input

`output/Buckets/tsc-2025-buckets.json` — same source file used by `SparMaker.js`.

## Algorithm

For each bucket (excluding `NotFit`):
- Compare every boxer pair (all combinations, not just adjacent).
- If `|weight_a - weight_b| <= 2.0`, include the pair in output.
- Sort output rows within each bucket by `weight_diff` ascending.

O(n²) per bucket — trivial given bucket sizes (≤ 30 boxers).

## Output

File: `output/WeightProximity.csv`

Columns:
```
category, boxer_a, club_a, weight_a, boxer_b, club_b, weight_b, weight_diff, same_club
```

- `weight_diff` — 2-decimal string (e.g. `"1.50"`)
- `same_club` — `"yes"` / `"no"`

## Script

New file: `WeightProximity.js` — standalone Node script, no dependencies beyond `fs`/`path`.

Run with: `node WeightProximity.js`

## Constants

- `WEIGHT_TOLERANCE = 2.0` — matches the value in `SparMaker.js`
- `SOURCE_FILE` — `output/Buckets/tsc-2025-buckets.json`
- `OUTPUT_FILE` — `output/WeightProximity.csv`
