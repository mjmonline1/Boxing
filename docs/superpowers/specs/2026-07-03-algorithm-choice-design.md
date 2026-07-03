# Algorithm Choice — Optimal (Maximum-Weight) Matching Design

**Date:** 2026-07-03
**Status:** Approved — not yet implemented

---

## Problem

The spar pairer has exactly one algorithm: the 3-phase greedy in
`SparMaker.js` (`pairBoxers` per bucket, called by `pairAll`). Greedy is
locally maximal but not globally optimal, with two documented, linked
limitations (`docs/matching-optimality-design.md`):

- **(A)** A pairable boxer can be stranded — greedy commits a partner early
  and never revisits (worked example: `63.5, 65.7, 67.4, 67.4` leaves 63.5
  unmatched though a full pairing exists).
- **(B)** A round-robin trio can hold an internal bout above tolerance —
  the phase-3b fold only checks the joiner against the *nearer* pair member
  (worked example: pair 70.0/72.0 + third 73.9 → a 3.9 kg internal bout).

Now that the pipeline is parameterised by phase (`maxPhase`), the organiser
should also be able to choose the *algorithm*: keep greedy (fast, current,
byte-identical baseline) or run optimal maximum-weight matching, which
fixes both (A) and (B). Unpaired boxers still land in the unmatched pool,
and `autoMatch='no'` boxers are still held out as `manualMatch` — the
output contract is identical for both algorithms.

This implements **Option 1** from `docs/matching-optimality-design.md`, on
explicit user instruction (2026-07-03), satisfying that doc's "do not start
without an explicit instruction naming which option" gate.

---

## Decisions (confirmed with user)

1. **Algorithm = Option 1**, maximum-weight matching via the
   `edmonds-blossom` npm package (MIT, ~one file, O(n³); API verified:
   `blossom(edges, maxCardinality)` where `edges = [[i, j, weight], ...]`
   and `maxCardinality: true` maximises boxers paired first, weight second).
   Hand-rolling a bespoke matcher was considered and rejected — for a
   fairness-critical feature, a battle-tested library beats derived code.
2. **Phase structure**: optimal runs as **one combined pairing pass at
   ±2.5 kg** (`PHASE2_TOLERANCE`) plus a separate trio-fold pass. Greedy
   needs tight-then-loose passes because it commits early; optimal doesn't,
   so it solves each bucket once against the full tolerance.
3. **Same output contract**: `{ matches, unmatched, manualMatch }` regardless
   of algorithm. `manualMatch` filtering happens in `pairAll` *before*
   algorithm dispatch (it's a pre-filter, not matching logic). Unmatched =
   whoever the solver couldn't pair within tolerance.

---

## UI (index.html)

New dropdown next to the existing `Match Phase` select, same markup/styling:

```html
<label for="algoInput">Algorithm</label>
<select id="algoInput">
  <option value="greedy" selected>Greedy (fast, current)</option>
  <option value="optimal">Optimal (maximum matching)</option>
</select>
```

`runScript()` appends `&algorithm=${...}` to the spar-maker /
generate-spars URLs alongside the existing `?maxPhase=`. `Match Phase`
remains visible and functional for both algorithms: for optimal,
`maxPhase 1` and `2` both mean "pairing pass only, no trio-fold" (there is
no separate phase 2), `maxPhase 3` adds the trio-fold.

## Plumbing (same shape as maxPhase)

- `Server.js` `/api/run/spar-maker`: read `req.query.algorithm` (default
  `'greedy'`), pass to `SparMaker.main(maxPhase, algorithm)`.
- `netlify/functions/generate-spars.js`: mirror per Netlify-sync convention
  — read `event.queryStringParameters.algorithm`, pass to `pairAll`.
- `SparMaker.js` `pairAll(buckets, { tol1, tol2, maxPhase, algorithm = 'greedy' })`:
  dispatch per-bucket pairing to `pairBoxers` (greedy) or the new
  `pairBoxersOptimal`. Bucket iteration, manualMatch filtering, trio-fold
  orchestration, phaseLog/summary building stay shared and untouched.
- Nothing downstream (RingAssigner, RingManager, SparManager, tests helpers)
  knows which algorithm ran.

## `pairBoxersOptimal(boxers, categoryName, tolerance, sparCount, partneredWith)`

New function in `SparMaker.js`, beside `pairBoxers`:

1. Set aside non-finite-weight boxers up front (same guard as greedy) —
   straight to unmatched, never enter the graph.
2. Build edges: every pair `(i, j)` with `|wᵢ - wⱼ| ≤ tolerance + WEIGHT_EPS`
   gets `[i, j, score]` where `score = 1000 - weightDiff * 10 +
   (differentClub ? 5 : 0)`. The formula only needs to rank closer-weight
   and different-club the way greedy's tie-breaks do; `maxCardinality: true`
   guarantees max-boxers-paired dominates regardless of score scale.
   Skip edges where `hasMet(a, b)` (no-rematch, shared `partneredWith` map).
3. `blossom(edges, true)` → `mate[]` array (index → partner index or -1).
4. Convert mated pairs to the existing match shape
   `{ red, blue, weightDiff, category, groupId: null }`; update the shared
   `sparCount`/`partneredWith` maps; unmatched indices → leftover.
5. **sparsPerDay > 1**: loop-and-rerun — after converting a solve's pairs,
   boxers still under cap re-enter the pool (minus `hasMet` partners) and
   blossom runs again until no new pair forms. Mirrors greedy's while-loop
   semantics. Real 2026 roster is all sparsPerDay=1, so the common path is
   a single solve per bucket.

## Trio-fold pass (optimal, maxPhase ≥ 3)

Per-leftover scan over existing same-bucket 1v1 pairs (not a second blossom
call — a one-sided assignment, small n). **Eligibility: all three pairwise
diffs ≤ tolerance** — joiner↔red, joiner↔blue, and the pair's own diff.
This is the fix for limitation (B): greedy's fold only checks the nearer
member. Among eligible pairs, choose the one minimising the trio's worst
internal diff; same-club tie-break as today. Leftovers with no eligible
pair stay unmatched.

## Output contract & phaseLog

`phaseLog` keeps its four-key shape so no consumer branches on algorithm:
optimal reports the combined pass under `phase1Bouts`, leaves `phase2Bouts`
= `[]`, reports trio-folds under `phase3Groups` as today. The run modal
shows an empty Phase-2 section when optimal ran — accepted cosmetic quirk.

`checkMatchingRisks()` runs unchanged on either output. Expected: optimal
reports **zero** stranded candidates and **zero** over-spread trios on the
cases where greedy reports them — this is the key regression assertion.

## Testing

- New `tests/sparMakerOptimal.test.js`:
  - Seed-255 stranding case (`63.5, 65.7, 67.4, 67.4`): optimal pairs all
    four; greedy (control) strands 63.5.
  - Over-spread trio case (70.0/72.0 pair + 73.9 leftover): optimal's fold
    rejects it (70.0↔73.9 = 3.9 > tolerance) — no over-spread trio forms.
  - Matched-count invariant: on realistic fixtures, optimal's matchedCount
    ≥ greedy's, always.
  - Unambiguous-case agreement: a bucket with one unique best pairing —
    optimal and greedy produce identical matches (wiring sanity check).
  - manualMatch and non-finite-weight boxers behave identically under both.
- Existing suites untouched: greedy stays the default everywhere, so all
  current tests keep passing byte-identically.
- `package.json`: add `edmonds-blossom` dependency; patch version bump.

## Files to change

| File | Change |
|---|---|
| `package.json` | Add `edmonds-blossom`; version bump |
| `SparMaker.js` | `pairBoxersOptimal`; `pairAll` gains `algorithm` option + dispatch; optimal trio-fold |
| `Server.js` | Pass `req.query.algorithm` through |
| `netlify/functions/generate-spars.js` | Mirror: pass `algorithm` through |
| `index.html` | Algorithm dropdown; `runScript()` URL param |
| `tests/sparMakerOptimal.test.js` | New — cases above |

## Amendment (2026-07-03, post final review): adjustable trio-fold tolerance

The final review found the original text self-contradictory: the trio-fold
accepted diffs up to tol2 (2.5) while also promising zero over-spread trios
(flagged above 2.0 by checkMatchingRisks). Resolution (user decision):
`pairAll` gains `trioTol` (default `WEIGHT_TOLERANCE` = 2.0, UI/server
clamped to [2.0, 2.5]) controlling the optimal fold's all-three-diffs check.
At the default the zero-over-spread promise holds; deliberately loosening
the knob admits 2.0–2.5 trios, which checkMatchingRisks still reports —
that is visibility, not a bug. Exposed as a number input in index.html and
a `trioTol` query param on spar-maker/generate-spars. Greedy is unaffected.

## Out of scope

- Changing greedy in any way (byte-identical baseline preserved).
- Making optimal the default.
- Removing the parked-status note from `docs/matching-optimality-design.md`
  beyond updating its status line to point here.
