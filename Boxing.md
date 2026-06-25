# Boxing — Architecture Refactor Log

Tracks iterative architecture cleanup. Each step: change → live-test → review → commit.

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

Everything still open (below) needs a **product/data decision**, not a mechanical
refactor — stopping per "approval required / verification unavailable":
- **Defect 7 (raw vs clean CSV schema)** — `/api/run/buckets` would crash passing the raw
  survey CSV into the clean-schema `parseCSV`. BUT that endpoint is not wired to any UI
  (index.html only calls `/api/run/spar-maker` + `/api/run/ring-assigner`; buckets are
  computed client-side in BucketAssigner.html). Latent, in an unused endpoint. Needs a
  decision: delete the endpoint, or make `runTSCBuckets` accept the raw schema.
- **WeightProximity.js** — orphan module (only its own test imports it) but has a design
  doc; keep or remove is the user's call.
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
