# Algorithm Choice (Optimal Matching) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second pairing algorithm — optimal maximum-weight matching via `edmonds-blossom` — selectable from a new dropdown in index.html, flowing through Server.js and the Netlify mirror into `SparMaker.pairAll`.

**Architecture:** `pairAll` gains an `algorithm` option (`'greedy'` default, byte-identical to today). `'optimal'` swaps the per-bucket pairing function for a new `pairBoxersOptimal` (one blossom solve per bucket at ±2.5 kg, no tight/loose two-pass) and tightens the trio-fold to require all three pairwise diffs in tolerance. Everything downstream consumes the same `{ matches, unmatched, manualMatch }` shape.

**Tech Stack:** Node (no build step), `edmonds-blossom` (new dep, MIT), `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-03-algorithm-choice-design.md`

## Global Constraints

- Greedy stays the default everywhere and must remain **byte-identical** — every existing test keeps passing unchanged.
- Commit messages: plain, no Co-Authored-By trailer (user preference).
- Any Server.js pipeline change must be mirrored to the matching `netlify/functions/` file.
- `package.json` patch version bump exactly once, in the first commit (`1.3.44` → `1.3.45`).
- Constants already in `SparMaker.js`: `WEIGHT_TOLERANCE = 2.0`, `PHASE2_TOLERANCE = 2.5`, `WEIGHT_EPS = 1e-9`. Reuse; do not redefine.
- Run tests with `node --test tests/<file>` (PowerShell-compatible commands).

---

### Task 1: Add edmonds-blossom dependency

**Files:**
- Modify: `package.json` (dependency + version bump)

**Interfaces:**
- Produces: `require('edmonds-blossom')` → `blossom(edges, maxCardinality)` where `edges = [[i, j, weight], ...]` (integer vertex ids, numeric weights) and return is `mate[]`: `mate[i]` = partner index or `-1` (may be `undefined` for vertices with no edges). `maxCardinality: true` maximises pair count first, total weight second.

- [ ] **Step 1: Install**

Run: `npm install edmonds-blossom --save`
Expected: `package.json` dependencies gains `"edmonds-blossom": "^1.0.0"`.

- [ ] **Step 2: Bump version**

In `package.json`: `"version": "1.3.44"` → `"version": "1.3.45"`.

- [ ] **Step 3: Smoke-check the API**

Run: `node -e "const b=require('edmonds-blossom'); console.log(b([[0,1,6],[0,2,10],[1,2,5]], true))"`
Expected: an array like `[ 1, 0, -1 ]` or `[ 2, -1, 0 ]` (a valid maximum matching; exact pairing depends on weights — with maxCardinality only one pair fits here).

- [ ] **Step 4: Run existing suite (nothing should change)**

Run: `node --test --test-concurrency=9`
Expected: 157 pass, 0 fail.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json
git commit -m "Add edmonds-blossom dependency for optimal matching (v1.3.45)"
```

---

### Task 2: `pairBoxersOptimal` in SparMaker.js

**Files:**
- Modify: `C:\Code\javascript\Boxing\SparMaker.js` (new function after `pairBoxers`, ~line 99; add to `module.exports` line 346)
- Test: `C:\Code\javascript\Boxing\tests\sparMakerOptimal.test.js` (new)

**Interfaces:**
- Consumes: `blossom = require('edmonds-blossom')` (Task 1); existing constants `PHASE2_TOLERANCE`, `WEIGHT_EPS`.
- Produces: `pairBoxersOptimal(boxers, categoryName, tolerance = PHASE2_TOLERANCE, sparCount, partneredWith)` → `{ matches, unmatched }` — the exact same contract as `pairBoxers` (matches are `{ red, blue, weightDiff, category, groupId: null }`; `sparCount`/`partneredWith` Maps are mutated when passed). Exported from SparMaker.

- [ ] **Step 1: Write failing tests**

Create `tests/sparMakerOptimal.test.js`:

```js
// Copyright (c) 2026 ITLR Assets. All rights reserved.
//
// Tests for the optimal (maximum-weight matching) pairing algorithm.
// Reproduces the two worked examples from docs/matching-optimality-design.md
// that the greedy matcher gets wrong.
//
// Run with:  node --test

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { pairBoxers, pairBoxersOptimal, pairAll, checkMatchingRisks } = require('../SparMaker');

let _id = 0;
function bx(weight, over = {}) {
    ++_id;
    return { id: _id, name: `B${_id}`, club: `Club${_id}`, gender: 'male',
             yob: 2000, fit: true, weight, experience: 0, ...over };
}

// --- pairBoxersOptimal (function level) --------------------------------------

test('optimal: seed-255 stranding case — all four boxers pair (greedy strands one)', () => {
    // docs/matching-optimality-design.md (A): 63.5, 65.7, 67.4, 67.4.
    // Greedy pairs 65.7-67.4 first, stranding 63.5 (its only ±2.5 partner is gone).
    // Optimal at ±2.5 finds 63.5-65.7 + 67.4-67.4 → everyone spars.
    const boxers = [bx(63.5), bx(65.7), bx(67.4), bx(67.4)];
    const { matches, unmatched } = pairBoxersOptimal(boxers, 'Female', 2.5);
    assert.equal(matches.length, 2, 'two pairs formed');
    assert.equal(unmatched.length, 0, 'nobody stranded');
    const pairKey = m => [m.red.weight, m.blue.weight].sort((a, b) => a - b).join('-');
    assert.deepEqual(matches.map(pairKey).sort(), ['63.5-65.7', '67.4-67.4']);
});

test('optimal: unambiguous case agrees with greedy exactly', () => {
    // One unique best pairing — both algorithms must produce it.
    const mk = () => [bx(70), bx(70.5), bx(80), bx(80.5)];
    const key = m => [m.red.weight, m.blue.weight].sort((a, b) => a - b).join('-');
    const g = pairBoxers(mk(), 'Cat', 2.5);
    const o = pairBoxersOptimal(mk(), 'Cat', 2.5);
    assert.deepEqual(o.matches.map(key).sort(), g.matches.map(key).sort());
    assert.equal(o.unmatched.length, 0);
    assert.equal(g.unmatched.length, 0);
});

test('optimal: prefers different-club when weight ties', () => {
    // 70(ClubX), 70(ClubX), 70(ClubY), 70(ClubY): all zero-diff. Optimal must
    // cross clubs (score +5 per cross-club edge → two cross pairs beat two same-club).
    const boxers = [bx(70, { club: 'X' }), bx(70, { club: 'X' }),
                    bx(70, { club: 'Y' }), bx(70, { club: 'Y' })];
    const { matches } = pairBoxersOptimal(boxers, 'Cat', 2.5);
    assert.equal(matches.length, 2);
    matches.forEach(m => assert.notEqual(m.red.club, m.blue.club, 'cross-club pairing preferred'));
});

test('optimal: non-finite weight boxer goes straight to unmatched, never poisons the solve', () => {
    const nan = bx(NaN);
    const boxers = [bx(70), nan, bx(71)];
    const { matches, unmatched } = pairBoxersOptimal(boxers, 'Cat', 2.5);
    assert.equal(matches.length, 1);
    assert.deepEqual(unmatched.map(b => b.id), [nan.id]);
});

test('optimal: no-rematch — a partneredWith pair is never re-paired', () => {
    const a = bx(70), b = bx(70.2), c = bx(70.4);
    const partnered = new Map([[a, new Set([b])], [b, new Set([a])]]);
    const { matches } = pairBoxersOptimal([a, b, c], 'Cat', 2.5, new Map(), partnered);
    assert.equal(matches.length, 1);
    const pair = matches[0];
    const ids = [pair.red.id, pair.blue.id].sort();
    assert.ok(!(ids[0] === Math.min(a.id, b.id) && ids[1] === Math.max(a.id, b.id)),
        'a-b must not re-pair; one of them pairs with c instead');
});

test('optimal: sparsPerDay=2 boxer gets two distinct opponents via rerun loop', () => {
    // Weights chosen so the first solve deterministically pairs multi-b
    // (0.2 diff beats b-c's 0.4 and multi-c's 0.6 — no score ties):
    // solve 1 → multi-b; solve 2 (multi under cap, c never matched) → multi-c.
    const multi = bx(70, { sparsPerDay: 2 });
    const boxers = [multi, bx(70.2), bx(70.6)];
    const { matches } = pairBoxersOptimal(boxers, 'Cat', 2.5);
    assert.equal(matches.length, 2, 'multi-spar boxer fights twice');
    const opponents = matches.map(m => (m.red === multi ? m.blue : m.red).id);
    assert.equal(new Set(opponents).size, 2, 'two different opponents, no rematch');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sparMakerOptimal.test.js`
Expected: FAIL — `pairBoxersOptimal is not a function`.

- [ ] **Step 3: Implement `pairBoxersOptimal`**

In `SparMaker.js`, add near the top (after the existing requires):

```js
const blossom = require('edmonds-blossom');
```

Insert after `pairBoxers` (after its closing brace, ~line 99):

```js
/**
 * Optimal per-bucket pairing: one maximum-weight matching solve (Edmonds
 * blossom, maxCardinality) over all in-tolerance pairs. Same contract as
 * pairBoxers. Unlike greedy there is no tight-then-loose two-pass — callers
 * pass the full combined tolerance (default PHASE2_TOLERANCE).
 * maxCardinality guarantees the most boxers spar; the edge score then picks
 * the closest-weight, different-club-preferring matching among those.
 */
function pairBoxersOptimal(boxers, categoryName, tolerance = PHASE2_TOLERANCE, sparCount, partneredWith) {
    const leftover = boxers.filter(b => !Number.isFinite(b.weight));
    const pool = boxers.filter(b => Number.isFinite(b.weight))
                       .sort((a, b) => a.weight - b.weight);
    const matches = [];

    const count    = sparCount     || new Map();
    const partners = partneredWith || new Map();
    const cap  = b => b.sparsPerDay || 1;
    const used = b => count.get(b) || 0;
    const hasMet = (a, b) => partners.get(a)?.has(b);
    const meet = (a, b) => {
        (partners.get(a) || partners.set(a, new Set()).get(a)).add(b);
        (partners.get(b) || partners.set(b, new Set()).get(b)).add(a);
    };

    // Loop-and-rerun for sparsPerDay > 1: after each solve, boxers still under
    // their daily cap re-enter (minus already-met partners) until no pair forms.
    // With everyone at sparsPerDay=1 (the real roster) this runs exactly once.
    while (true) {
        const eligible = pool.filter(b => used(b) < cap(b));
        const edges = [];
        for (let i = 0; i < eligible.length; i++) {
            for (let j = i + 1; j < eligible.length; j++) {
                const diff = Math.abs(eligible[i].weight - eligible[j].weight);
                if (diff > tolerance + WEIGHT_EPS) continue;
                if (hasMet(eligible[i], eligible[j])) continue;
                // Rank: closer weight better, different club a small bonus —
                // same preferences as greedy's tie-breaking. maxCardinality
                // makes pair COUNT dominate regardless of this score's scale.
                const score = 1000 - diff * 10 + (eligible[i].club !== eligible[j].club ? 5 : 0);
                edges.push([i, j, score]);
            }
        }
        if (edges.length === 0) break;

        const mate = blossom(edges, true);
        let formed = 0;
        for (let i = 0; i < eligible.length; i++) {
            const j = mate[i];
            if (j == null || j < 0 || j < i) continue; // unmatched, no-edge vertex, or already emitted
            const red = eligible[i], blue = eligible[j];
            count.set(red,  used(red)  + 1);
            count.set(blue, used(blue) + 1);
            meet(red, blue);
            matches.push({
                red, blue,
                weightDiff: Math.abs(red.weight - blue.weight).toFixed(2),
                category: categoryName,
                groupId: null
            });
            formed++;
        }
        if (formed === 0) break;
    }

    // Same leftover semantics as greedy: never-matched, or matched but still under cap.
    leftover.push(...pool.filter(b => used(b) < cap(b)));
    return { matches, unmatched: leftover };
}
```

Update the exports line (346):

```js
module.exports = { main, pairBoxers, pairBoxersOptimal, pairAll, buildPhaseLog, checkMatchingRisks };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sparMakerOptimal.test.js`
Expected: 6 pass, 0 fail.

- [ ] **Step 5: Run the full suite (greedy untouched)**

Run: `node --test --test-concurrency=9`
Expected: 163 pass, 0 fail.

- [ ] **Step 6: Commit**

```powershell
git add SparMaker.js tests/sparMakerOptimal.test.js
git commit -m "Add pairBoxersOptimal: maximum-weight matching per bucket"
```

---

### Task 3: `pairAll` algorithm dispatch + optimal trio-fold

**Files:**
- Modify: `C:\Code\javascript\Boxing\SparMaker.js` (`pairAll`, lines ~113-212)
- Test: `C:\Code\javascript\Boxing\tests\sparMakerOptimal.test.js` (append)

**Interfaces:**
- Consumes: `pairBoxersOptimal` (Task 2).
- Produces: `pairAll(buckets, { tol1, tol2, maxPhase, algorithm = 'greedy' })`. With `algorithm: 'optimal'`: one pairing pass per bucket at `tol2` reported as phase 1, `phase2Matches` stays empty, trio-fold requires **all three** pairwise diffs ≤ `tol2`. With `'greedy'` (or omitted): byte-identical to today.

- [ ] **Step 1: Write failing tests (append to tests/sparMakerOptimal.test.js)**

```js
// --- pairAll dispatch ---------------------------------------------------------

test('pairAll algorithm=optimal: seed-255 bucket fully paired; greedy control strands one', () => {
    const mk = () => ({ Female: [bx(63.5), bx(65.7), bx(67.4), bx(67.4)] });
    const opt = pairAll(mk(), { algorithm: 'optimal' });
    assert.equal(opt.unmatched.length, 0, 'optimal: nobody unmatched');
    assert.equal(opt.matches.length, 2);
    const greedy = pairAll(mk());
    assert.equal(greedy.unmatched.length, 1, 'greedy control: 63.5 stranded (or folded check)');
});

test('pairAll algorithm=optimal: over-spread trio never forms (doc case 70/72 + 73.9)', () => {
    // Greedy folds 73.9 onto the 70/72 pair → an internal 3.9 kg bout.
    // Optimal must not ship any trio with an internal diff above tol2.
    const r = pairAll({ Cat: [bx(70.0), bx(72.0), bx(73.9)] }, { algorithm: 'optimal' });
    const { overSpreadTrios } = checkMatchingRisks(r.matches, r.unmatched);
    assert.equal(overSpreadTrios.length, 0, 'no over-spread trio under optimal');
    // The trio is rejected (70↔73.9 = 3.9 > 2.5): one clean pair + one unmatched.
    assert.equal(r.matches.length, 1);
    assert.equal(r.unmatched.length, 1);
});

test('pairAll algorithm=optimal: trio-fold still forms valid trios (all three diffs in tolerance)', () => {
    // 70, 71, 72: optimal pairs two, the leftover is within 2.5 of BOTH members
    // and the pair diff is fine → a legal trio forms at maxPhase 3.
    const r = pairAll({ Cat: [bx(70), bx(71), bx(72)] }, { algorithm: 'optimal' });
    assert.equal(r.matches.length, 1);
    assert.ok(r.matches[0].third, 'leftover folded into a round-robin trio');
    assert.equal(r.unmatched.length, 0);
    const { overSpreadTrios } = checkMatchingRisks(r.matches, r.unmatched);
    assert.equal(overSpreadTrios.length, 0);
});

test('pairAll algorithm=optimal: maxPhase<3 skips the trio-fold', () => {
    const r = pairAll({ Cat: [bx(70), bx(71), bx(72)] }, { algorithm: 'optimal', maxPhase: 1 });
    assert.equal(r.matches.length, 1);
    assert.ok(!r.matches[0].third);
    assert.equal(r.unmatched.length, 1);
});

test('pairAll algorithm=optimal: phaseLog shape — combined pass under phase1, phase2 empty', () => {
    const r = pairAll({ Cat: [bx(70), bx(71)] }, { algorithm: 'optimal' });
    assert.equal(r.phases.phase1.matches.length, 1);
    assert.equal(r.phases.phase2.matches.length, 0, 'optimal never populates phase 2');
});

test('pairAll algorithm=optimal: manualMatch and NaN-weight behave identically to greedy', () => {
    const held = bx(70.2, { autoMatch: 'no' });
    const nan  = bx(NaN);
    const r = pairAll({ Cat: [bx(70), held, bx(70.4), nan] }, { algorithm: 'optimal' });
    assert.deepEqual(r.manualMatch.map(b => b.id), [held.id], 'autoMatch=no held out');
    assert.ok(r.unmatched.some(b => b.id === nan.id), 'NaN weight unmatched');
    assert.equal(r.matches.length, 1, 'remaining two pair normally');
});

test('pairAll: matched-count invariant — optimal never matches fewer boxers than greedy', () => {
    const fixtures = [
        () => ({ A: [bx(63.5), bx(65.7), bx(67.4), bx(67.4)] }),                  // stranding case
        () => ({ A: [bx(70), bx(71), bx(72)] }),                                   // trio case
        () => ({ A: [bx(50), bx(51.8), bx(53.6), bx(55.4)], B: [bx(90), bx(99)] }), // chain + hopeless
    ];
    const countMatched = r => r.matches.reduce((n, m) => n + (m.third ? 3 : 2), 0);
    for (const mk of fixtures) {
        const o = countMatched(pairAll(mk(), { algorithm: 'optimal' }));
        const g = countMatched(pairAll(mk()));
        assert.ok(o >= g, `optimal (${o}) must match at least as many boxers as greedy (${g})`);
    }
});

test('pairAll: omitted algorithm defaults to greedy (byte-identical baseline)', () => {
    const mk = () => ({ Cat: [bx(70), bx(71.5), bx(74), bx(76.6)] });
    const def = pairAll(mk());
    const g   = pairAll(mk(), { algorithm: 'greedy' });
    assert.deepEqual(
        def.matches.map(m => `${m.red.weight}-${m.blue.weight}`),
        g.matches.map(m => `${m.red.weight}-${m.blue.weight}`));
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/sparMakerOptimal.test.js`
Expected: the 6 Task-2 tests pass; the new `pairAll algorithm=optimal` tests FAIL (option ignored → greedy behavior).

- [ ] **Step 3: Implement the dispatch in `pairAll`**

Three surgical edits inside `pairAll` (SparMaker.js ~113-212). Greedy paths are byte-identical — every change is gated on `algorithm === 'optimal'`.

**3a. Signature (line 113):**

```js
function pairAll(buckets, { tol1 = WEIGHT_TOLERANCE, tol2 = PHASE2_TOLERANCE, maxPhase = 3, algorithm = 'greedy' } = {}) {
```

**3b. Phase 1 loop — dispatch the pairing function.** Replace the single `pairBoxers(...)` call line (~126):

```js
        const { matches, unmatched } = algorithm === 'optimal'
            // Optimal solves the whole bucket once at the combined tolerance —
            // no tight-then-loose two-pass (that exists only to unstick greedy).
            ? pairBoxersOptimal(boxers, category, tol2, sparCount, partnered)
            : pairBoxers(boxers, category, tol1, sparCount, partnered);
```

**3c. Phase 2 block — optimal skips it.** The current block is `if (maxPhase >= 2) { ... } else { ... }` (~lines 138-152). Change the structure to:

```js
    let allUnmatched = [];
    const phase2Matches = [];
    if (algorithm === 'optimal') {
        // Already solved at tol2 — there is no second pass. Never-matched
        // boxers (count 0) carry to the trio-fold, tagged with their bucket.
        allUnmatched = Object.entries(bucketUnmatched)
            .flatMap(([category, boxers]) => boxers
                .filter(b => (sparCount.get(b) || 0) === 0)
                .map(b => ({ ...b, _bucket: category })));
    } else if (maxPhase >= 2) {
        for (const [category, boxers] of Object.entries(bucketUnmatched)) {
            if (boxers.length === 0) continue;
            const { matches, unmatched } = pairBoxers(boxers, category, tol2, sparCount, partnered);
            allMatches = allMatches.concat(matches);
            phase2Matches.push(...matches);
            allUnmatched = allUnmatched.concat(
                unmatched.filter(b => (sparCount.get(b) || 0) === 0)
                         .map(b => ({ ...b, _bucket: category })));
        }
    } else {
        // Stopped after phase 1 — everyone still unmatched carries through untouched.
        allUnmatched = Object.entries(bucketUnmatched)
            .flatMap(([category, boxers]) => boxers.map(b => ({ ...b, _bucket: category })));
    }
    const phase2Unmatched = [...allUnmatched];
```

**3d. Phase 3b — tightened eligibility for optimal.** Inside the `for (const boxer of allUnmatched)` loop (~159), the candidate scan is currently a `for (const partner of [m.red, m.blue])` inner loop checking only the nearer member at `tol1`. Wrap the scan in an algorithm branch:

```js
            const bucket = boxer._bucket;
            let bestIdx = -1, bestDiff = Infinity, bestIsDiffClub = false;

            for (let i = 0; i < allMatches.length; i++) {
                const m = allMatches[i];
                if (m.groupId) continue;
                if (m.category !== bucket) continue;

                if (algorithm === 'optimal') {
                    // A trio means everyone fights everyone: require ALL THREE
                    // pairwise diffs in tolerance (fixes limitation (B) — greedy
                    // only checks the nearer member). Rank by worst internal diff.
                    const d1 = Math.abs(boxer.weight - m.red.weight);
                    const d2 = Math.abs(boxer.weight - m.blue.weight);
                    const d3 = Math.abs(m.red.weight - m.blue.weight);
                    if (d1 > tol2 + WEIGHT_EPS || d2 > tol2 + WEIGHT_EPS || d3 > tol2 + WEIGHT_EPS) continue;
                    const worst = Math.max(d1, d2, d3);
                    const isDiffClub = boxer.club !== m.red.club && boxer.club !== m.blue.club;
                    if (isDiffClub && !bestIsDiffClub) {
                        bestIdx = i; bestDiff = worst; bestIsDiffClub = true;
                    } else if (isDiffClub === bestIsDiffClub && worst < bestDiff) {
                        bestIdx = i; bestDiff = worst;
                    }
                    continue;
                }

                for (const partner of [m.red, m.blue]) {
                    const diff = Math.abs(boxer.weight - partner.weight);
                    if (diff > tol1 + WEIGHT_EPS) continue;
                    const isDiffClub = boxer.club !== partner.club;
                    if (isDiffClub && !bestIsDiffClub) {
                        bestIdx = i; bestDiff = diff; bestIsDiffClub = true;
                    } else if (isDiffClub === bestIsDiffClub && diff < bestDiff) {
                        bestIdx = i; bestDiff = diff;
                    }
                }
            }
```

(The greedy inner loop is moved verbatim, just now sitting after the `optimal` branch's `continue`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sparMakerOptimal.test.js`
Expected: 14 pass, 0 fail.

- [ ] **Step 5: Run the full suite (greedy byte-identical)**

Run: `node --test --test-concurrency=9`
Expected: 171 pass, 0 fail. Any failure in a pre-existing test means the greedy path changed — stop and fix before proceeding.

- [ ] **Step 6: Commit**

```powershell
git add SparMaker.js tests/sparMakerOptimal.test.js
git commit -m "pairAll: algorithm option dispatches greedy/optimal, all-diffs trio-fold for optimal"
```

---

### Task 4: Thread `algorithm` through Server.js, main(), and the Netlify mirror

**Files:**
- Modify: `C:\Code\javascript\Boxing\SparMaker.js` (`main`, ~line 271)
- Modify: `C:\Code\javascript\Boxing\Server.js` (~lines 80-82)
- Modify: `C:\Code\javascript\Boxing\netlify\functions\generate-spars.js` (~lines 15, 22-23)

**Interfaces:**
- Consumes: `pairAll(..., { maxPhase, algorithm })` (Task 3).
- Produces: `main(maxPhase = 3, algorithm = 'greedy')`; HTTP query param `algorithm=optimal|greedy` on `/api/run/spar-maker` and the Netlify `generate-spars` function. Any other value falls back to `'greedy'`.

- [ ] **Step 1: `SparMaker.main`**

Line ~271, change the signature and the `pairAll` call (~279-280):

```js
function main(maxPhase = 3, algorithm = 'greedy') {
```

```js
    const { matches: allMatches, unmatched: stillRemaining, manualMatch, groupCount, phases } =
        pairAll(data.finalBuckets, { maxPhase, algorithm });
```

- [ ] **Step 2: Server.js**

Replace lines 80-82:

```js
app.post("/api/run/spar-maker", (req, res) => {
  const maxPhase  = parseInt(req.query.maxPhase) || 3;
  const algorithm = req.query.algorithm === 'optimal' ? 'optimal' : 'greedy';
  res.json(runWithCapture(() => runSparMaker(maxPhase, algorithm)));
```

- [ ] **Step 3: Netlify mirror**

In `netlify/functions/generate-spars.js`, line ~15 area:

```js
    const maxPhase  = parseInt(event?.queryStringParameters?.maxPhase) || 3;
    const algorithm = event?.queryStringParameters?.algorithm === 'optimal' ? 'optimal' : 'greedy';
```

and the `pairAll` call (~22-23):

```js
    const { matches: allMatches, unmatched: stillRemaining, manualMatch, groupCount, phases } =
      pairAll(bucketsDoc.finalBuckets, { maxPhase, algorithm });
```

- [ ] **Step 4: Verify both load and the suite passes**

Run: `node -e "require('./Server.js')" ` — expected: EADDRINUSE if Docker is up (fine, proves it parses) or a clean listen; Ctrl-C/exit either way. Simpler parse check: `node --check Server.js` and `node --check netlify/functions/generate-spars.js` — expected: no output.
Run: `node --test --test-concurrency=9`
Expected: 171 pass, 0 fail (mongo stage tests exercise generate-spars without an algorithm param → default greedy → unchanged).

- [ ] **Step 5: Commit**

```powershell
git add SparMaker.js Server.js netlify/functions/generate-spars.js
git commit -m "Thread algorithm query param through Server.js, main(), Netlify mirror"
```

---

### Task 5: Algorithm dropdown in index.html

**Files:**
- Modify: `C:\Code\javascript\Boxing\index.html` (~lines 202-208 markup, ~351 URL builder)

**Interfaces:**
- Consumes: `?algorithm=` query param (Task 4).
- Produces: `<select id="algoInput">` with values `greedy` (selected) / `optimal`.

- [ ] **Step 1: Add the dropdown**

Immediately after the `maxPhaseInput` `</select>` (line ~207), same inline styling as its neighbours:

```html
  <label for="algoInput" style="white-space:nowrap;font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);margin-left:1rem;">Algorithm</label>
  <select id="algoInput" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:24px;cursor:pointer;">
    <option value="greedy" selected>Greedy (fast, current)</option>
    <option value="optimal">Optimal (maximum matching)</option>
  </select>
```

- [ ] **Step 2: Send it in the run URL**

Line ~351, extend the spar-maker/generate-spars branch:

```js
      : endpoint.includes('spar-maker') || endpoint.includes('generate-spars')
      ? `${endpoint}?maxPhase=${parseInt(document.getElementById('maxPhaseInput').value) || 3}&algorithm=${document.getElementById('algoInput').value === 'optimal' ? 'optimal' : 'greedy'}`
      : endpoint;
```

- [ ] **Step 3: Syntax-check the inline script**

Run:
```powershell
node -e "const m=[...require('fs').readFileSync('index.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)]; m.forEach((s,i)=>{ new Function(s[1]); console.log('script',i,'OK'); })"
```
Expected: `script 0 OK` (and any others OK).

- [ ] **Step 4: Commit**

```powershell
git add index.html
git commit -m "Add algorithm dropdown (greedy/optimal) to pipeline controls"
```

---

### Task 6: Update the parked design note + final verification

**Files:**
- Modify: `C:\Code\javascript\Boxing\docs\matching-optimality-design.md` (status header only)

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Update the status line**

Replace the header note (lines 3-7):

```markdown
> **STATUS: Option 1 IMPLEMENTED (2026-07-03) as a selectable algorithm — see
> `docs/superpowers/specs/2026-07-03-algorithm-choice-design.md`.**
> Greedy remains the default and is byte-identical. The limitations below
> still describe greedy's behaviour; the `optimal` algorithm fixes both (A)
> and (B) when selected.
```

- [ ] **Step 2: Full suite**

Run: `node --test --test-concurrency=9`
Expected: 171 pass, 0 fail.

- [ ] **Step 3: End-to-end sanity via Docker (optional if user defers)**

```powershell
.\Deploy.bat
```
Then from the home page (`http://localhost:6502`): select `Optimal (maximum matching)` + `All phases`, run Step 3 (Spar Maker), confirm the run modal reports a summary and the Phase-2 section is empty; run once more with `Greedy` and confirm identical-to-before output.

- [ ] **Step 4: Commit**

```powershell
git add docs/matching-optimality-design.md
git commit -m "Mark matching-optimality Option 1 as implemented (selectable optimal algorithm)"
```
