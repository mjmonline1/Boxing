# Boxing — Architecture Refactor Log

Tracks iterative architecture cleanup. Each step: change → live-test → review → commit.

## Realistic-scenario testing (v1.3.17)

Drove realistic tournament rosters through the real pipeline (buckets → `pairAll`
3-phase → both ring strategies) asserting system invariants. Two failures found:

1. **Blank-experience vanish (product bug).** A fit male whose CSV `experience` cell is
   empty parsed as `NaN`, failed every experience-tier rule (`NaN <= 5` is false), and
   dropped out of **all** buckets — silently lost. `Server.readBoxersCSV` already
   defaulted this to 0; `PutAllFightersinBuckets.parseCSV` did not.
   - **Fix:** `parseCSV` now coerces blank/non-numeric experience to `0` (Novice).
   - **Regression:** `putAllFightersInBuckets.test.js` — blank-experience CSV row → Novice,
     none lost.
   - **Benchmark:** `realistic.streak.test.js` — full mixed CSV roster incl. a dirty row,
     end-to-end "no fit boxer vanishes" invariant.
2. **Test-harness over-strictness (not a product bug).** The bucket-membership invariant
   compared the group `third` by object identity, but `pairAll` emits phase-2/3b leftover
   boxers as detached spread-copies (same boxer, different object). Benign for the app
   (identical JSON). **Fix:** invariant now checks membership by boxer `id`.

After the fixes: realistic scenarios + benchmark pass consecutively.

### Second hunt (v1.3.18)

3. **Blank-weight sabotage (product bug).** A boxer with a non-finite weight (blank CSV
   weight cell → `NaN`) sorted mid-bucket and tripped the ascending-scan `break` in
   `pairBoxers` (`NaN <= tolerance` is false), starving valid neighbours of opponents —
   e.g. boxers at 60 kg and 61 kg produced **0 matches** instead of 1. The phase-3b group
   loop had the same flaw (`NaN > tol` is false, so the boxer could be folded into a group
   on a bogus comparison).
   - **Fix:** `pairBoxers` sidelines non-finite-weight boxers up front (reported unmatched,
     kept out of the scan); `pairAll` phase-3b skips them too. Weight is deliberately NOT
     defaulted to 0 — a phantom 0 kg boxer would mis-pair.
   - **Regression:** `sparMaker.test.js` — blank-weight boxer unmatched, neighbours still pair.
   - **Benchmark:** `realistic.streak.test.js` streak 6 — blank-weight boxer sidelined
     end-to-end, never grouped, never lost.
   - Verified behavior-preserving on real data: `Spars.json` still byte-identical to baseline.

### Third hunt (v1.3.19)

4. **parseCSV crash on blank/short rows (product bug).** A blank line mid-file, or a row
   truncated before the `fit` column, threw `undefined.toLowerCase()` and took down the
   whole bucket load. `Server.readBoxersCSV` already guarded this; the clean-schema parser
   did not.
   - **Fix:** `parseCSV` skips blank lines (`filter(line => line.trim() !== '')`) and
     defaults missing trailing cells to `''` (`values[index] ?? ''`).
   - **Regression:** `putAllFightersInBuckets.test.js` — blank line skipped, short row
     parses to empty/Notfit defaults, no throw.
   - **Benchmark:** `realistic.streak.test.js` streak 7 — messy CSV runs end-to-end; the
     truncated (no-weight) boxer surfaces unmatched, never lost.

### Fourth hunt (v1.3.20)

5. **Gender case-sensitivity (product bug).** Human-typed `"Male"`/`"Female"`/`"MALE"` (and
   the `M`/`F` shorthand in some casings) matched no bucket rule and the boxer was dropped.
   `Server.readBoxersCSV` lowercases gender; the clean-schema parser didn't.
   - **Fix:** `parseCSV` canonicalises gender to lowercase `male`/`female` and expands the
     `m`/`f` shorthand, without breaking the `M`/`F` the rules still accept for direct callers.
   - **Regression:** `putAllFightersInBuckets.test.js` — five casings all classify, none dropped.
   - **Benchmark:** `realistic.streak.test.js` streak 8 — mixed-case CSV runs end-to-end;
     females still route to R5.

Streak scenarios (`tests/realistic.streak.test.js`): full divisional roster; female cohort
→ R5 only; youth/cross-age never R5; odd bucket → group of 3 with 3× duration; phase-2
rescue at 2.4 kg; blank-weight boxer sidelined; messy CSV survives; mixed-case genders
classify. **115 tests, 0 fail, 100% coverage.**

> Pattern: every bug found in this hunt is the **clean-schema `parseCSV` lacking a guard
> that `Server.readBoxersCSV` already has** (experience default, weight, blank/short rows,
> gender case). The two parsers should arguably converge — candidate future refactor.

### Fifth hunt (v1.3.21) — SPEC violation, not a parser bug

6. **Senior-female bout duration (product bug).** SPEC: "Senior **male** = 3×3 min; all
   others = 3×2 min." But `boutDuration` used `isSeniorBout`, which checked only `yob`,
   not gender — so a senior-aged **female** bout read 11 min instead of 8.
   - **Fix:** `boutDuration` now uses the existing gender-aware `isBothSeniorMale`; the
     redundant, buggy `isSeniorBout` was deleted (it duplicated `isBothSeniorMale`'s intent).
   - **Regression:** `ringAssigner.test.js` — senior-female bout = 8 min, female group = 24.
   - **Benchmark:** `realistic.streak.test.js` streak 9 — durations gender-aware in the
     actual schedule slots (female 8, senior male 11).

**117 tests, 0 fail, 100% coverage.** Spars.json still byte-identical to baseline.

### Sixth hunt (v1.3.22) — output data loss

7. **Round-robin third dropped from `allocations.json` (product bug).** The flat allocation
   export built each row from `{red, blue}` only, so a 3-person group was written as a
   2-person bout — the third boxer's ring/slot assignment was invisible. (`allocations.json`
   is a write-only artifact — no route/UI reads it — so low severity, but real data loss.)
   - **Fix:** extracted a pure `flattenAllocations(slots)` that includes `third` when present;
     `run()` uses it.
   - **Regression:** `ringAssigner.test.js` — group row carries `third`, 1v1 row has no `third`.

**118 tests, 0 fail, 100% coverage.**

## OPEN — product decision (not a code bug)

**Round-robin group internal spread.** A 3-person group can contain an internal bout that
exceeds weight tolerance. Reproduced: red 70 / blue 72.0 (a ±2.0 phase-1 pair) + third 73.9
joins on its 1.9 kg gap to blue → but **red-vs-third = 3.9 kg**. SPEC says the join is
"±2.0 kg to the pair"; the code requires proximity to the *nearer* member only, so the third
fights its far partner at a larger gap. Tightening to "±tol to BOTH members" is safer but
forms fewer groups (more unmatched). **Needs a call** before any change — left as-is.

## Architecture (as-found)

Pipeline (file mode, via `Server.js`):
```
data/Registered Boxer2026.csv
  → PutAllFightersinBuckets.runTSCBuckets()  → output/Buckets/tsc-2026-buckets.json
  → SparMaker.main()                          → output/Spars/<date>/Spars.json
  → RingAssigner.run(day)                     → output/Spars/<date>/{schedule,schedule_grouped,allocations}.json
```
Cloud mode (Netlify + MongoDB) mirrors this with `netlify/functions/*` reusing
`pairBoxers` (SparMaker) and the ring classifiers (RingAssigner).

Shared rules live in `constants.js` (AGE_GROUPS, EXPERIENCE_TIERS, YOB cutoffs).
`hierarchical-filter.js` is the generic bucket-tree engine.

## Defects found

1. **Dead duplicate** `tsc-tournament-2026.js` — near-copy of `PutAllFightersinBuckets.js`,
   writes to stale `Tree/output/` paths, reads a 2025 CSV. Nothing imports it. [STEP 1]
2. **Stale references** — SparMaker.js / WeightProximity.js error strings + docs point at
   `tsc-tournament-2026.js` instead of the real buckets step. [STEP 1]
3. **Duplicated 3-phase pairing orchestration** — `SparMaker.main()` and
   `netlify/functions/generate-spars.js` reimplement Phase 1/2/3b identically; only
   `pairBoxers` is shared. [STEP 2 — DONE]
4. **Generated dirs not ignored** — `coverage/`, `graphify-out/`. [STEP 1]
5. `WeightProximity.js` — orphan module (only its own test imports it). Has tests + design
   doc. Left in place (uncertain / documented alternative). DEFERRED.
6. `create-petri-net.js` — reads `output/tsc-2025-tournament-results.json` which nothing
   generates. Likely dead viz tool. DEFERRED (uncertain).
7. **Raw vs clean CSV schema mismatch** — `PutAllFightersinBuckets.parseCSV` expects the
   clean schema (`id,name,club,gender,yob,fit,weight,experience`); the only data file
   (`data/Registered Boxer2026.csv`) is the raw survey export. `Server.js` has a *second*
   parser (`readBoxersCSV` + `mapHeader2026`) that maps raw→clean, but `/api/run/buckets`
   passes the raw path straight into `runTSCBuckets` → `parseCSV`, which crashes on raw
   data. Two CSV parsers, inconsistent wiring. DEFERRED — needs decision on intended
   source-of-truth before refactor.

## Steps

### Step 1 — remove dead duplicate + stale refs + gitignore generated  [DONE]
Baseline: 100/100 tests.
- Deleted `tsc-tournament-2026.js` (dead near-copy of PutAllFightersinBuckets, stale paths).
- Fixed stale "Run tsc-tournament-2026.js first" strings → PutAllFightersinBuckets.js
  (SparMaker.js, WeightProximity.js, docs/SparMaker.md).
- Removed its c8 exclude entry; gitignored `coverage/` + `graphify-out/`.
- Updated CLAUDE.md Key Files (also fixed stale SparMaker source path + dropped `app.js`).
- Left PutAllFightersinBuckets CLI default at the clean-schema path (graceful not-found
  guard); annotated the raw/clean split. v1.3.14.

## Status

Stopped after Step 2. The two genuine structural defects (dead duplicate pipeline;
copy-pasted pairing algorithm) are fixed. The codebase now has one bucket pipeline,
one pairing algorithm shared by file + cloud modes, centralized `constants.js`, and
102 tests at 100% coverage.

Remaining open items need a **product/data decision**, not a mechanical refactor:
- **WeightProximity.js** — orphan module (only its own test imports it) but has a design
  doc; intentional standalone CLI (`node WeightProximity.js`). KEEP per user.
- **create-petri-net.js** — reads `output/tsc-2025-tournament-results.json`, which nothing
  produces. Likely-dead viz tool; confirm before removing.

### Step 2 — single source of truth for the 3-phase pairing algorithm  [DONE]
Extracted the Phase 1/2/3b orchestration into a pure `pairAll(buckets, {tol1,tol2})`
in `SparMaker.js`, returning `{ matches, unmatched, groupCount, phases }`.
- `SparMaker.main()` now calls `pairAll` for the algorithm and only does I/O + logging.
- `netlify/functions/generate-spars.js` calls the same `pairAll`, building its `phaseLog`
  from the returned per-phase breakdowns. Kills the copy-pasted phase loops (the
  documented "netlify sync" hazard) — one matching algorithm now.
- Added 2 `pairAll` tests (full pipeline + custom tol). 102 tests, 100% coverage.
- Verified behavior-preserving: regenerated `Spars.json` is byte-identical to pre-refactor
  baseline (file mode); mongo in-memory round-trip green (DB mode). v1.3.15.

### Step 3 — remove dead `/api/run/buckets` route  [DONE]
Confirmed unreachable: no HTML/JS calls it (index.html wires only spar-maker + ring-assigner);
`BucketAssigner.html` assigns buckets client-side and persists via `PUT /api/data/buckets`.
The route would also crash (raw CSV -> clean-schema `parseCSV`).
- Removed the route + its now-orphaned `runTSCBuckets` import from `Server.js`.
- Fixed the stale `SVG/index-data-flow.dot` Step-2 flow to the real `PUT /api/data/buckets`.
- No netlify counterpart exists, so nothing to sync.
- Live boot test: server starts, `/api/data/buckets` -> 200, `/api/run/buckets` -> 404.
  102 tests pass. v1.3.16.
