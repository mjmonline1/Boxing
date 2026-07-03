# Spar Group Architecture — Current State (as of 2026-07-03)

This document captures the codebase's current trio-only group model, gathered
by direct source inspection ahead of generalizing to N-member groups (see
`docs/superpowers/specs/2026-07-03-n-member-group-design.md` for that change).

## Data model

A "match" record is `{ sparId, red, blue, third?, weightDiff, category }`.
Pairs use `red`/`blue` only. Trios add `third` — same shape as `red`/`blue`
(a full boxer record).

Round-robin bouts for a trio (A=red, B=blue, C=third) are **implied by the
presence of `third`, never stored as separate records**: AvB, AvC, BvC
(`C(3,2)=3`). A group of 5 would generalize to `C(5,2)=10` bouts (AvB, AvC,
AvD, AvE, BvC, BvD, BvE, CvD, CvE, DvE) — every unique pair fights once.

The original trio design is documented in
`docs/superpowers/specs/2026-05-24-round-robin-group-design.md`: it replaced
an earlier approach that emitted three separate match records per group
(which broke RingAssigner's independent-bout scheduling and caused boxers to
appear multiple times in spar lists).

## SparManager.html (in-memory only — NOT SparMaker.html)

**Correction to a prior assumption**: the `sm_matches`/`sm_corners`
localStorage keys, `matchKey(a,b)` with the U+2016 separator, and
`data-row`/`data-col` DOM attributes described in this project's CLAUDE.md
belong to **SparMaker.html**, a separate matrix-based manual pairing tool —
not to SparManager.html. SparManager.html has zero localStorage usage; its
state lives entirely in `state.matches`/`state.unmatched` in memory and is
persisted via `DataClient.save('spars', output)` to the server.

Key functions (line numbers approximate, current file):
- `resetState()` ~128-138 — builds match records from `originalData.matches`.
- `findBoxer()` ~144-154 — locates a boxer by id; hardcodes the three named
  corners (`red`/`blue`/`third`).
- `setCorner()` ~156-160 — hardcodes the same three corners for writes.
- `swapBoxers()` ~190-244 — hardcoded to exactly 3 slots. Handles
  match↔match, match↔unmatched, and unmatched↔unmatched swap cases.
- `unmatchBoxer()` ~249-278 — current remove behavior: dragging `third` to
  the unmatched pool removes it and the pair remains; dragging `red`/`blue`
  out of a trio moves that boxer to the pool and slides `third` into the
  vacated corner, leaving a pair.
- `addThirdBoxer()` ~289-296 — guarded by `if (m.third) return`, which is
  exactly why groups cannot exceed 3 today.
- `makeBoxerTile()` ~333-406 — native HTML5 drag-and-drop. Dropping onto a
  tile calls `swapBoxers()`, except when Ctrl is held and the target is a
  pair without a `third`, which instead calls `addThirdBoxer()`. Dropping
  onto the card background (not a tile) with Ctrl held also calls
  `addThirdBoxer()`, guarded by the same `!m.third` check.
- `exportJSON()` ~679-712 — includes `third` when present; `phaseLog` and
  `matchRisks` are passed through unchanged from `originalData` and are
  **not regenerated** from edits made in the UI (a pre-existing gap,
  unrelated to group-size work).

## RingAssigner.js

- `boutDuration()` ~91-94: `match.third ? single * 3 : single` — hardcoded
  multiplier for exactly one extra member.
- `avgWeight` (inline in `run()`, ~191-193): `match.third ? (red+blue+third)/3
  : (red+blue)/2` — hardcoded divisor.
- Classifiers `isBothSeniorMale`/`hasFemale`/`isR5Eligible` (~lines 18-33)
  each conditionally check `match.third`.
- `buildSlots()` ~98-129: line 104 collects `[m.red, m.blue, m.third]
  .filter(Boolean)` for the busy-fighter id list; line 121 writes `third:
  m.third || null` onto the bout object; line 152 (`flattenAllocations`)
  conditionally spreads `third` into the exported row.

## RingManager.html

- `boutHTML()` ~95-119 — a fixed template, not a loop: the `if (bout.third)`
  branch renders exactly 3 pairwise weight diffs (red-blue, red-third,
  blue-third) and 3 name lines; the `else` branch renders a single
  red-vs-blue line.
- `boutFormat()` ~160-165 — hardcodes "3 × N min" display text describing
  rounds-per-bout (not bouts-per-group).
- `computeTimes()` ~167-184 — falls back to single-bout duration if
  `bout.duration` is missing; does not multiply for group size (relies on
  RingAssigner having already computed the correct duration upstream).
- `boutType()`/`canPlaceInR5()` ~87-93, ~122-125 — assume at most 3 named
  slots. **`canPlaceInR5()` has a latent bug**: it only checks `bout.red`
  and `bout.blue`, silently ignoring `bout.third` — a female-ineligible
  third boxer would not block an R5 placement today.
- **Pre-existing bug, found this session**: `saveToServer()` ~389-401 and
  `exportAllocation()` ~419-434 rebuild output rows using only `red`,
  `blue`, and `weightDiff` — they silently drop `third` when saving or
  exporting a schedule today.

## Full `.third` reference inventory (19 files, verified by repo-wide search)

| File | What it does with `.third` |
|---|---|
| `index.html:365` | Formats `g.third`/`g.thirdWeight` into export text |
| `netlify/functions/generate-spars.js:29` | `m.third ? 3 : 2` matched-count |
| `netlify/functions/generate-schedule.js:23` | `m.third ? (...)/3 : (...)/2` avg weight for scheduling |
| `RingAssigner.js` | Lines 20, 26, 32, 93, 104, 121, 152, 191-193 — classifiers, duration, avg weight, slot building |
| `RingManager.html` | Lines 89, 96-104 — female check, pairwise diff rendering |
| `SparManager.html` | Lines 149, 159, 171, 257, 262, 265-266, 285, 293-294, 368, 390, 447-448, 498, 545, 551, 562, 577, 586, 629, 690 — group mutation + UI |
| `SparManager.css:154` | `.third-corner` CSS class (styling only, not a data field) |
| `SparMaker.js` | Lines 187, 198, 225, 238-239, 243, 251, 291, 302 — Phase 3b group formation, risk checks, matched-count |
| `Utilities.html` | Lines 540, 565 — trio CSV/report columns (`overSpreadTrios`) |
| `tests/sparMaker.test.js` | Lines 209, 212, 222, 348, 371, 377-378, 404 — trio formation assertions |
| `tests/ringManager.test.js:36` | Test fixture builds a bout with optional third |
| `tests/ringAssigner.test.js:136,246` | Flat row output + id collection assertions |
| `tests/realistic.streak.test.js` | Weight avg, participant tracking, group assertions |
| `tests/realistic.scenarios.test.js:106` | Asserts persisted match has third |
| `tests/pipeline.e2e.test.js:58,130` | Matched-count calc, participant set |
| `tests/mongo.stages.test.js` | matchBoxers, matched-count, female/senior checks |
| `tests/helpers/mongo.js:64-65,108` | Schema-shape validation: `m.third == null \|\| typeof m.third === 'object'` |
| `docs/superpowers/specs/2026-05-24-round-robin-group-design.md` | Original trio design doc |
| `docs/SparMaker.md:100,155` | Describes Phase 3b `match.third = boxer` assignment |

Note: earlier project memory claimed 16 files referenced `.third`; an
exhaustive repo-wide search this session found 19. `SparMaker.html`,
`Server.js`, and `netlify/functions/db.js` do **not** reference `.third`,
contrary to that earlier assumption.

## Shared-module precedent (or lack of one)

This project has one existing shared-parser file, `boxer-csv.js`, used by
multiple Node consumers (`Server.js`, `netlify/functions/import-boxers.js`,
`importBoxersToMongo.js`, `PutAllFightersinBuckets.js`). It is **not**
isomorphic — it's a plain `module.exports`, Node-only, never `<script>`-
included by any HTML tool. `RingAssigner.js` and `SparMaker.js` are likewise
never `<script>`-included by `RingManager.html`/`SparManager.html`; each HTML
file hand-duplicates its own classification/scoring logic inline. There is
currently no file in this repo shared between Node and the browser — any
future shared group-logic module establishes that pattern rather than
following an existing one.
