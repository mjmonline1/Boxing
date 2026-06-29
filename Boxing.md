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

## Parser convergence (v1.3.23)

There were **four** boxer-CSV parsers (bugs 1–4 above all came from them drifting apart),
incl. a buggy 4th copy in `importBoxersToMongo.js` whose `mapHeader` was missing the
`sparsPerDay` mapping. Converged into one shared module `boxer-csv.js`:
- `splitRecords` / `splitLine` — quoted-comma/newline-aware tokenizer.
- `normalizeGender` — lowercase + M/F expansion.
- `mapRawHeader` + `parseRawBoxers` — the raw survey-export → boxer transform.

Rewired:
- `Server.js` `readBoxersCSV` → `parseRawBoxers` (deleted local `mapHeader2026`,
  `splitCSV`, `splitCSVRecords` — ~60 lines).
- `netlify/functions/import-boxers.js` `parseBoxers` → `parseRawBoxers` (deleted its
  identical copies — ~70 lines). **Kills the netlify-sync hazard for the roster parser.**
- `PutAllFightersinBuckets.js` `parseCSV` → shared tokenizer + `normalizeGender` (clean
  schema still has its own field coercions, but gender/tokenizing is now defined once).
- `importBoxersToMongo.js` (standalone migration script, 4th copy) → `parseRawBoxers`;
  this also fixes its missing `sparsPerDay` mapping.

New `tests/boxerCsv.test.js` covers the module to 100%. Verified: 130 tests, 0 fail,
100% coverage; `Spars.json` byte-identical; server serves 137 boxers; e2e + mongo green.

### Seventh hunt (v1.3.24) — ring/schedule layer

Probed the ring-allocation + scheduling + client-ring logic. No clear functional bug:
- Client `canPlaceInR5` is **identical** to `RingAssigner.isR5Eligible` (both via
  `R5_ELIGIBLE_YOB_MIN`) — consistent.
- Even-day scheduling sorts lightest-first (odd = heaviest-first) — verified correct;
  added lock test `streak 10`.
- Local vs cloud schedule agree: both serve the **grouped** strategy to RingManager
  (`Server.js` → schedule_grouped.json; netlify `generate-schedule.js` → distributeGrouped).

Fixed: a **misleading RingAssigner console comment** that claimed `schedule.json` (balanced)
is "loaded by RingManager" — RingManager actually loads the grouped schedule.

**131 tests, 0 fail, 100% coverage.**

### Eighth hunt (v1.3.26) — float boundary drops exact-tolerance pairs  [FIXED]

**Bug #7.** Property-fuzzed 20k random rosters with a *missed-pair* invariant (two
finite-weight unmatched boxers in the same bucket within tolerance ⇒ a match was left on
the table). Found pairs **exactly 2.5 kg apart** never pairing, e.g. `63.4 vs 65.9`:
`Math.abs(63.4-65.9) === 2.500000000000007` in IEEE-754, so `weightDiff <= 2.5` is **false**
and the pair is dropped. 2.5 is the *outermost* (phase-2) tolerance — no later phase rescues
it. The phase-1 (2.0) boundary has the same float error but is masked by phase-2's looser
tolerance, so only the 2.5 edge leaks. Data-dependent: `70.0 vs 72.5` (clean float 2.5) pairs;
`63.4 vs 65.9` does not.

Fix: epsilon-inclusive tolerance compare. `pairBoxers` weight-match + scan-break and `pairAll`
phase-3b group join now use `<= tolerance + WEIGHT_EPS` (`WEIGHT_EPS = 1e-9`). Makes the
inclusive tolerance actually inclusive at the boundary. Real-data `Spars.json` re-verified
byte-identical (no real adjacent pair sat on a broken 2.5 edge — latent, not yet triggered in
production). Regression: `sparMaker.test.js`; benchmark: `realistic.streak.test.js` streak 11.

### Ninth change (v1.3.27) — `sparsPerDay > 1` now implemented  [DONE]

Was a documented-but-inert feature (the old matcher `shift`/`splice`-removed matched boxers,
so everyone got ≤1 bout regardless of `sparsPerDay`). Now wired across both modules:

- **`SparMaker.pairBoxers`** — boxer pool is no longer destructively shifted. `current` stays
  at `pool[0]` and keeps drawing opponents until it hits its `sparsPerDay` cap or runs out of
  eligible partners; opponents leave only when *they* hit their cap. Two shared Maps thread the
  budget across phases: `sparCount` (spars assigned) and `partneredWith` (boxer → Set already
  sparred, so **no rematch** between the same two). With everyone at `sparsPerDay=1` this is
  byte-for-byte the old shift/splice greedy (verified: real 51-match output identical).
- **`pairAll`** — passes both Maps through phases 1→2; only NEVER-matched boxers (`count===0`)
  flow to the group phase / unmatched list (a boxer who already sparred but is under cap isn't
  "unmatched"). Phase-3b round-robin groups remain **exempt** from the cap by design (a group of
  3 = everyone fights everyone = a bonus spar; this was always true for `sparsPerDay=1` too).
- **`RingAssigner.buildSlots`** — was index-by-slot, which would double-book a 2-bout boxer in
  one time slot. Now greedy per-slot: a ring's head bout is deferred to a later slot if either
  fighter is already busy in the current slot. ≥1 bout always places per slot ⇒ no deadlock.
  With all distinct fighters (`sparsPerDay=1`) every ring advances each slot — same layout as before.

Verified: 40k fuzzed rosters with ~25% `sparsPerDay=2` hold every invariant (no-vanish by
distinct id, tolerance, no slot double-booking, ring eligibility). Live demo on real data: a
63–66 kg Junior-Novice cluster bumped to 2 each gives every boxer exactly 2 bouts vs 2 distinct
opponents. Tests: `sparMaker.test.js` #22–24, `ringAssigner.test.js` slot-deferral. 139 tests,
100% coverage. **Note:** `buildSlots` deferral is the only thing stopping a real double-book —
if multi-spar ships, keep that invariant covered.

### Tenth hunt (v1.3.27) — multi-spar invariant hardening  [no system bug]

Property-fuzzed 40k clustered rosters (caps 1–3, tight weight bands) with new invariants:
no-rematch (no two boxers fight twice across 1v1 + group internals), 1v1-cap (standalone bouts
≤ sparsPerDay; groups exempt), local maximality (no two same-bucket boxers both under cap, in
tolerance, never matched). **All clean.** An early harness false-positive ("missed spar" in the
Female bucket) was a *test* bug — it counted standalone 1v1s only, ignoring that a cap-1 boxer
already sparred *in a group* and is done; fixed to count total opponents met.

Hardened the permanent suite: `assertInvariants` (realistic.streak.test.js) now enforces all
three on every scenario; added `streak 12` (multi-spar cohort). 140 tests, 100% coverage.

Known limitation (NOT fixed — pre-existing, greedy by design; full write-up in
`docs/matching-optimality-design.md`, marked DO NOT IMPLEMENT): the phased greedy matcher is
*locally* maximal but not *globally* optimal. A boxer whose only in-tolerance partner sits in
the (2.0, 2.5] band can be stranded if that partner is consumed by a ≤2.0 phase-1 pair first
(repro: seed 255, a Female cluster — pairing 9-10 + 0-2 was achievable, greedy made a 9-0-2
group and stranded 10). Real 137-boxer roster has **0** such strandings. A true fix is maximum-
weight matching (blossom) replacing the 3-phase greedy — a large change that would break the
byte-identical baseline. Logged for a product call; left as-is.

## OPEN — product decisions (not code bugs)

**(a) Females can be dragged out of R5 in RingManager.** The auto-allocator *forces* every
female bout into R5 (`hasFemale → ['R5']`), but the UI only blocks ineligible bouts from
*entering* R5 — it doesn't stop a female bout being moved *out* to R1–R4. If females-only-R5
is a hard rule, the UI should prevent that move; if it's just the auto-default, this is fine.

**(b) `schedule.json` (balanced) is written but read by nobody** — RingManager loads the
grouped schedule; `allocations.json` already carries the balanced view. Harmless reference
export; could be dropped if balanced is truly unused.

**(c) `sparsPerDay > 1` — IMPLEMENTED v1.3.27** (see "Ninth change" above). Was inert; now
a boxer stays matchable until they hit their daily cap, no rematches, and the scheduler keeps a
multi-bout boxer out of two rings in one slot. All real boxers are still `sparsPerDay=1` so live
output is unchanged. Group round-robins remain cap-exempt by design.


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
