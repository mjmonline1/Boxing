// Copyright (c) 2026 ITLR Assets. All rights reserved.
const fs = require('fs');
const path = require('path');
const GroupUtils = require('./group-utils');
const blossom = require('edmonds-blossom');

// Configuration
const _d          = new Date();
const TODAY       = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
const SOURCE_FILE = path.join(__dirname, 'output', 'Buckets', 'tsc-2026-buckets.json');
const OUTPUT_FILE = path.join(__dirname, 'output', 'Spars', TODAY, 'Spars.json');
const WEIGHT_TOLERANCE        = 2.0;
const PHASE2_TOLERANCE        = 2.5;
// Weights are one-decimal kg; two of them differing by exactly the tolerance can land just
// over it in IEEE-754 (e.g. 65.9-63.4 === 2.500000000000007). The tolerance is inclusive, so
// compare with a tiny epsilon to keep exact-boundary pairs from being silently dropped.
const WEIGHT_EPS              = 1e-9;

// Unordered stable-id pair key — used by Random Select to test/build the cross-day
// "already sparred earlier in the week" set (priorPairs). Order-independent so a
// bout stored as (a,b) on one day matches an (b,a) lookup on another.
function pairKey(a, b) {
    return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
}

function pairBoxers(boxers, categoryName, tolerance = WEIGHT_TOLERANCE, sparCount, partneredWith) {
    // A boxer with a non-finite weight (e.g. a blank CSV weight cell → NaN) can't be
    // matched by weight, and worse, a NaN sitting mid-list would break the ascending
    // scan early (NaN <= tolerance is false) and starve valid neighbours of opponents.
    // Set such boxers aside up front so they neither pair nor poison the scan.
    const leftover = boxers.filter(b => !Number.isFinite(b.weight));
    const pool = boxers.filter(b => Number.isFinite(b.weight))
                       .sort((a, b) => a.weight - b.weight);
    const matches = [];

    // Capacity tracking. `sparCount`/`partneredWith` are shared across phases when passed in
    // so a boxer's spars-per-day budget (and "already sparred" set) carry across the pipeline;
    // a standalone call gets locals so sparsPerDay still works within the one call.
    const count    = sparCount     || new Map(); // boxer → spars assigned so far
    const partners = partneredWith || new Map(); // boxer → Set of boxers already sparred (no rematch)
    const cap  = b => b.sparsPerDay || 1;
    const used = b => count.get(b) || 0;
    const hasMet = (a, b) => partners.get(a)?.has(b);
    const meet = (a, b) => {
        (partners.get(a) || partners.set(a, new Set()).get(a)).add(b);
        (partners.get(b) || partners.set(b, new Set()).get(b)).add(a);
    };

    // A boxer stays at pool[0] (as `current`) and keeps getting opponents until it reaches its
    // daily cap or runs out of eligible partners — then it leaves. Opponents leave when they hit
    // their own cap. With everyone at sparsPerDay=1 this is exactly the old shift/splice greedy.
    while (pool.length > 0) {
        const current = pool[0];
        let bestOpponentIndex = -1;
        let differentClub = false;
        let minWeightDiff = Infinity;

        for (let i = 1; i < pool.length; i++) {
            const opponent = pool[i];
            const weightDiff = Math.abs(current.weight - opponent.weight);

            if (weightDiff <= tolerance + WEIGHT_EPS) {
                if (used(opponent) >= cap(opponent)) continue;  // opponent at their daily cap
                if (hasMet(current, opponent)) continue;         // already sparred — no rematch

                const isDifferentClub = current.club !== opponent.club;

                if (isDifferentClub && !differentClub) {
                    bestOpponentIndex = i;
                    differentClub = true;
                    minWeightDiff = weightDiff;
                } else if (isDifferentClub === differentClub) {
                    if (weightDiff < minWeightDiff) {
                        bestOpponentIndex = i;
                        minWeightDiff = weightDiff;
                    }
                }
            } else {
                break;
            }
        }

        if (bestOpponentIndex !== -1) {
            const opponent = pool[bestOpponentIndex];
            count.set(current,  used(current)  + 1);
            count.set(opponent, used(opponent) + 1);
            meet(current, opponent);
            matches.push({
                red: current,
                blue: opponent,
                weightDiff: Math.abs(current.weight - opponent.weight).toFixed(2),
                category: categoryName,
                groupId: null
            });
            // Remove whoever reached their cap; keep under-cap boxers in the pool for more spars.
            // Splice the opponent (index ≥ 1) before shifting current (index 0) so indices stay valid.
            if (used(opponent) >= cap(opponent)) pool.splice(bestOpponentIndex, 1);
            if (used(current)  >= cap(current))  pool.shift();
        } else {
            // current can find no (further) opponent — it leaves. It's a leftover for the next
            // phase (never-matched, or matched but still under cap).
            leftover.push(pool.shift());
        }
    }

    return { matches, unmatched: leftover };
}

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

/**
 * Random Select per-bucket pairing: a clone of greedy `pairBoxers` (same setup,
 * caps, no-rematch, and NaN handling) that differs only in HOW it chooses among
 * eligible opponents. Instead of the single closest-weight, different-club-first
 * opponent, it gathers every in-tolerance eligible opponent and picks one at
 * RANDOM from the best non-empty priority tier:
 *   rank = (differentClub ? 0 : 2) + (fresh ? 0 : 1)
 * so different-club always beats same-club (club avoidance stays top priority,
 * identical to greedy), and within a club tier a "fresh" opponent (id-pair not in
 * `priorPairs` = not sparred on an earlier day) beats a repeat. `Math.random` —
 * fresh, non-reproducible each run. Greedy/optimal are left byte-identical.
 */
function pairBoxersRandom(boxers, categoryName, tolerance = WEIGHT_TOLERANCE, sparCount, partneredWith, priorPairs = null) {
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

    while (pool.length > 0) {
        const current = pool[0];

        // Gather every eligible opponent (same constraints as greedy), tagged with
        // its priority tier, then random-pick from the best tier present.
        let bestRank = Infinity;
        const candidates = []; // { index, rank }
        for (let i = 1; i < pool.length; i++) {
            const opponent = pool[i];
            const weightDiff = Math.abs(current.weight - opponent.weight);
            if (weightDiff > tolerance + WEIGHT_EPS) break; // pool is weight-sorted — nothing closer follows
            if (used(opponent) >= cap(opponent)) continue;  // opponent at their daily cap
            if (hasMet(current, opponent)) continue;         // already sparred this run — no rematch

            const sameClub = current.club === opponent.club;
            const repeat   = priorPairs ? priorPairs.has(pairKey(current, opponent)) : false;
            const rank = (sameClub ? 2 : 0) + (repeat ? 1 : 0);
            if (rank < bestRank) bestRank = rank;
            candidates.push({ index: i, rank });
        }

        const tier = candidates.filter(c => c.rank === bestRank);
        if (tier.length > 0) {
            const bestOpponentIndex = tier[Math.floor(Math.random() * tier.length)].index;
            const opponent = pool[bestOpponentIndex];
            count.set(current,  used(current)  + 1);
            count.set(opponent, used(opponent) + 1);
            meet(current, opponent);
            matches.push({
                red: current,
                blue: opponent,
                weightDiff: Math.abs(current.weight - opponent.weight).toFixed(2),
                category: categoryName,
                groupId: null
            });
            // Remove whoever reached their cap; keep under-cap boxers in the pool for more spars.
            // Splice the opponent (index ≥ 1) before shifting current (index 0) so indices stay valid.
            if (used(opponent) >= cap(opponent)) pool.splice(bestOpponentIndex, 1);
            if (used(current)  >= cap(current))  pool.shift();
        } else {
            // current can find no (further) opponent — it leaves as a leftover for the next phase.
            leftover.push(pool.shift());
        }
    }

    return { matches, unmatched: leftover };
}

/**
 * Phase 4 — human-style SALVAGE of the still-unmatched pool. Learned from how the human
 * hand-finished spars after the strict phases (see docs analysis): pair the leftovers by
 *   - crossing AGE group freely (a Youth may spar a Senior),
 *   - keeping EXPERIENCE tiers separate (Novice/OpenClass/Experienced never mix),
 *   - NO weight cap — always take the closest available opponent, however far,
 *   - keeping club-avoidance as a strong preference (not a hard rule),
 *   - crossing GENDER only as a last resort (all same-gender options tried first).
 * Optimal (max-cardinality) within each group so the most leftover boxers get a spar.
 * Self-contained capacity/no-rematch tracking: the pool is never-matched boxers, so a
 * local budget is correct and leaves the cross-phase Maps (keyed by original refs) clean.
 */
function pairBoxersSalvage(pool, { crossGender = 'lastResort', maxGap = Infinity, label = 'SALVAGE' } = {}) {
    const matches  = [];
    const used     = new Map();   // boxer → salvage spars used
    const partners = new Map();   // boxer → Set already paired within salvage
    const cap  = b => b.sparsPerDay || 1;
    const of   = b => used.get(b) || 0;
    const meet = (a, b) => {
        (partners.get(a) || partners.set(a, new Set()).get(a)).add(b);
        (partners.get(b) || partners.set(b, new Set()).get(b)).add(a);
    };
    // Experience tier from the source bucket name (…_Novice/_OpenClass/_Experienced).
    // The Female bucket carries no tier suffix → its own 'None' group.
    const tierOf = b => {
        const m = /_(Novice|OpenClass|Experienced)$/.exec(b._bucket || b.category || '');
        return m ? m[1] : 'None';
    };
    const eligible = () => pool.filter(b => Number.isFinite(b.weight) && of(b) < cap(b));

    // One optimal max-cardinality solve over a subset: pair the most boxers, then among
    // those matchings prefer different club (big bonus), closest weight, then closest age.
    const solve = subset => {
        if (subset.length < 2) return;
        const edges = [];
        for (let i = 0; i < subset.length; i++) for (let j = i + 1; j < subset.length; j++) {
            const a = subset[i], b = subset[j];
            if (partners.get(a)?.has(b)) continue;   // no rematch within this pass
            const diff      = Math.abs(a.weight - b.weight);
            if (diff > maxGap + WEIGHT_EPS) continue; // weight cap (Infinity for salvage, e.g. 1.0 for tight cross)
            const clubBonus = a.club !== b.club ? 100 : 0;
            const agePen    = Math.abs((a.yob || 0) - (b.yob || 0)) * 0.5;
            edges.push([i, j, Math.round(10000 + clubBonus - diff * 10 - agePen)]);
        }
        if (!edges.length) return;
        const mate = blossom(edges, true);
        for (let i = 0; i < subset.length; i++) {
            const j = mate[i];
            if (j == null || j < 0 || j < i) continue;
            const a = subset[i], b = subset[j];
            if (of(a) >= cap(a) || of(b) >= cap(b)) continue;
            used.set(a, of(a) + 1); used.set(b, of(b) + 1);
            meet(a, b);
            matches.push({ red: a, blue: b, weightDiff: Math.abs(a.weight - b.weight).toFixed(2),
                           category: label, groupId: null });
        }
    };

    // Round A — within (gender, experience tier): cross age, same gender, same tier.
    const groups = new Map();
    for (const b of eligible()) {
        const key = `${b.gender}||${tierOf(b)}`;
        (groups.get(key) || groups.set(key, []).get(key)).push(b);
    }
    for (const subset of groups.values()) solve(subset);

    // Round B — cross-gender LAST RESORT, still within tier: only whoever Round A left.
    if (crossGender !== 'never') {
        const byTier = new Map();
        for (const b of eligible()) (byTier.get(tierOf(b)) || byTier.set(tierOf(b), []).get(tierOf(b))).push(b);
        for (const subset of byTier.values()) solve(subset);
    }

    const remaining = pool.filter(b => of(b) < cap(b));
    return { matches, remaining };
}

/**
 * Run the full 3-phase pairing pipeline on a bucket map. Pure: no I/O, no logging.
 * Shared by SparMaker.main() (file mode) and netlify/functions/generate-spars.js (DB mode)
 * so the matching algorithm lives in exactly one place.
 *
 * Phase 1  — pair within bucket at ±tol1.
 * Phase 2  — pair the Phase-1 remainder within bucket at ±tol2.
 * Phase 3b — fold each still-unmatched boxer into an existing same-bucket 1v1 pair
 *            (±tol1) to form a 3-person round-robin group.
 *
 * Returns the final matches/unmatched plus per-phase breakdowns for reporting.
 */
function pairAll(buckets, { tol1 = WEIGHT_TOLERANCE, tol2 = PHASE2_TOLERANCE, maxPhase = 3, algorithm = 'greedy', trioTol = WEIGHT_TOLERANCE, priorPairs = null, salvageCrossGender = 'lastResort', tightCross = true, tightTol = 1.0 } = {}) {
    let allMatches = [];
    const sparCount = new Map(); // boxer → spars assigned (carries the daily-cap budget across phases)
    const partnered = new Map(); // boxer → Set already sparred (no rematch across phases)
    const manualMatch = []; // boxers with autoMatch='no' — held out, paired by hand later (e.g. SparMaker.html)

    // Phase 1 — within-bucket, ±tol1
    const bucketUnmatched = {};
    const phase1Matches = [];
    for (const [category, boxersRaw] of Object.entries(buckets)) {
        if (category === 'Notfit' || boxersRaw.length === 0) continue;
        manualMatch.push(...boxersRaw.filter(b => b.autoMatch === 'no').map(b => ({ ...b, category })));
        const boxers = boxersRaw.filter(b => b.autoMatch !== 'no');
        const { matches, unmatched } = algorithm === 'optimal'
            // Optimal solves the whole bucket once at the combined tolerance —
            // no tight-then-loose two-pass (that exists only to unstick greedy).
            ? pairBoxersOptimal(boxers, category, tol2, sparCount, partnered)
            : algorithm === 'randomSelect'
            ? pairBoxersRandom(boxers, category, tol1, sparCount, partnered, priorPairs)
            : pairBoxers(boxers, category, tol1, sparCount, partnered);
        allMatches = allMatches.concat(matches);
        phase1Matches.push(...matches);
        bucketUnmatched[category] = unmatched;
    }
    const phase1Unmatched = Object.values(bucketUnmatched).flat();

    // Phase 2 — within-bucket, ±tol2 — tag remainders with source bucket.
    // Only carry NEVER-matched boxers (count 0) into the group phase / unmatched list: a boxer
    // already matched but still under its daily cap has had its spar — it isn't "unmatched".
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
            const { matches, unmatched } = algorithm === 'randomSelect'
                ? pairBoxersRandom(boxers, category, tol2, sparCount, partnered, priorPairs)
                : pairBoxers(boxers, category, tol2, sparCount, partnered);
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

    // Phase 2c — tight (±tightTol, default 1 kg) CROSS-bucket pairing of the phase-2
    // leftovers: cross AGE group, keep experience tier + gender (reuses the salvage
    // matcher with a weight cap). Catches near-identical-weight leftovers the strict
    // within-bucket phases structurally can't reach; runs before the trio phase for all
    // algorithms. `remaining` (still unmatched) then flows into the trio phase as before.
    let crossMatches = [];
    if (tightCross && maxPhase >= 3) {
        const { matches: cMatches, remaining } = pairBoxersSalvage(allUnmatched, { crossGender: 'never', maxGap: tightTol, label: 'CROSS' });
        crossMatches = cMatches;
        allMatches = allMatches.concat(cMatches);
        allUnmatched = remaining;
    }
    const phaseCrossUnmatched = [...allUnmatched];

    // Phase 3b — round-robin: unmatched boxer joins existing 1v1 pair in same bucket (±tol1)
    let groupCounter = 0;
    let stillRemaining = [];
    if (maxPhase >= 3) {
        for (const boxer of allUnmatched) {
            // A non-finite weight can't be group-matched either: `NaN > tol1` is false, so
            // the tolerance guard below would NOT skip it and the boxer could be folded into
            // a group on a bogus comparison. Leave it unmatched.
            if (!Number.isFinite(boxer.weight)) { stillRemaining.push(boxer); continue; }

            const bucket = boxer._bucket;
            let bestIdx = -1, bestDiff = Infinity, bestIsDiffClub = false;
            // Random Select: collect all eligible anchor pairs, then random-pick from the
            // best (diffClub/fresh) tier — same greedy fold semantics, randomised choice.
            let randBestRank = Infinity;
            const randAnchors = []; // { index, rank }

            for (let i = 0; i < allMatches.length; i++) {
                const m = allMatches[i];
                if (m.groupId) continue;
                if (m.category !== bucket) continue;

                if (algorithm === 'randomSelect') {
                    // Mirror greedy's fold rule: at least one member within tol1.
                    const near = Math.min(Math.abs(boxer.weight - m.red.weight),
                                          Math.abs(boxer.weight - m.blue.weight));
                    if (near > tol1 + WEIGHT_EPS) continue;
                    const isDiffClub = boxer.club !== m.red.club && boxer.club !== m.blue.club;
                    const fresh = priorPairs
                        ? !priorPairs.has(pairKey(boxer, m.red)) && !priorPairs.has(pairKey(boxer, m.blue))
                        : true;
                    const rank = (isDiffClub ? 0 : 2) + (fresh ? 0 : 1);
                    if (rank < randBestRank) randBestRank = rank;
                    randAnchors.push({ index: i, rank });
                    continue;
                }

                if (algorithm === 'optimal') {
                    // A trio means everyone fights everyone: require ALL THREE
                    // pairwise diffs in tolerance (fixes limitation (B) — greedy
                    // only checks the nearer member). Rank by worst internal diff.
                    // Fold tolerance is the adjustable `trioTol` (default 2.0 —
                    // keeps the zero-over-spread-trio guarantee; settings above
                    // 2.0 will surface those trios in matchRisks by design).
                    const d1 = Math.abs(boxer.weight - m.red.weight);
                    const d2 = Math.abs(boxer.weight - m.blue.weight);
                    const d3 = Math.abs(m.red.weight - m.blue.weight);
                    if (d1 > trioTol + WEIGHT_EPS || d2 > trioTol + WEIGHT_EPS || d3 > trioTol + WEIGHT_EPS) continue;
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

            if (algorithm === 'randomSelect') {
                const tier = randAnchors.filter(a => a.rank === randBestRank);
                if (tier.length > 0) bestIdx = tier[Math.floor(Math.random() * tier.length)].index;
            }

            if (bestIdx !== -1) {
                const anchor = allMatches[bestIdx];
                anchor.groupId = `g${++groupCounter}`;
                anchor.third   = boxer;
            } else {
                stillRemaining.push(boxer);
            }
        }
    } else {
        // Stopped before phase 3b — leftovers stay unmatched rather than being folded into trios.
        stillRemaining.push(...allUnmatched);
    }

    // Snapshot the phase-3 leftovers before salvage so the phase log reports each stage.
    const phase3Unmatched = [...stillRemaining];

    // Phase 4 — human-style salvage of whoever's still unmatched (relaxed cross-bucket).
    let phase4Matches = [];
    if (algorithm === 'salvage') {
        const { matches: sMatches, remaining } = pairBoxersSalvage(stillRemaining, { crossGender: salvageCrossGender });
        phase4Matches = sMatches;
        allMatches.push(...sMatches);
        stillRemaining = remaining;
    }

    // Rename _bucket to category on unmatched, strip from matched boxer objects
    allMatches.forEach(m => GroupUtils.membersOf(m).forEach(b => delete b._bucket));
    stillRemaining.forEach(b => { b.category = b._bucket; delete b._bucket; });

    return {
        matches:    allMatches,
        unmatched:  stillRemaining,
        manualMatch,
        groupCount: groupCounter,
        phases: {
            phase1: { matches: phase1Matches, unmatched: phase1Unmatched },
            phase2: { matches: phase2Matches, unmatched: phase2Unmatched },
            phaseCross: { matches: crossMatches, unmatched: phaseCrossUnmatched },
            phase3: { groups: allMatches.filter(m => m.groupId), unmatched: phase3Unmatched },
            phase4: { matches: phase4Matches, unmatched: stillRemaining },
        },
    };
}

// Lean display/report view of `pairAll`'s phases — shared by the file-mode
// pipeline (SparMaker.main), Server.js's run response, and the Mongo-mode
// netlify function so there's exactly one place that builds this shape.
function buildPhaseLog(phases) {
    const unmatchedView = list => [...list].sort((a, b) => a.weight - b.weight)
        .map(b => ({ name: b.name, weight: b.weight, experience: b.experience, club: b.club }));
    const boutView = m => ({ red: m.red.name, redWeight: m.red.weight, blue: m.blue.name, blueWeight: m.blue.weight, weightDiff: m.weightDiff, category: m.category });
    return {
        phase1: unmatchedView(phases.phase1.unmatched), phase1Bouts: phases.phase1.matches.map(boutView),
        phase2: unmatchedView(phases.phase2.unmatched), phase2Bouts: phases.phase2.matches.map(boutView),
        // Phase 2c tight ±1kg cross-bucket bouts (empty when tightCross is off).
        phaseCrossBouts: ((phases.phaseCross || { matches: [] }).matches).map(boutView),
        phase3: unmatchedView(phases.phase3.unmatched),
        phase3Groups: phases.phase3.groups.map(m => ({ groupId: m.groupId, red: m.red.name, redWeight: m.red.weight, blue: m.blue.name, blueWeight: m.blue.weight, third: m.third.name, thirdWeight: m.third.weight, category: m.category })),
        // Phase 4 salvage (empty unless the 'salvage' algorithm ran) — final unmatched pool.
        phase4: unmatchedView((phases.phase4 || { unmatched: [] }).unmatched),
        phase4Bouts: ((phases.phase4 || { matches: [] }).matches).map(boutView),
    };
}

// Post-hoc audit of a finished pairAll() result against the two known, parked
// matcher limitations in docs/matching-optimality-design.md. Pure — reads the
// final matches/unmatched, no re-pairing, no I/O.
function checkMatchingRisks(matches, unmatched) {
    // (B) Over-spread trio — exact: a groupId trio's worst internal pairwise
    // diff exceeding tolerance is a certain fact about the saved result.
    const overSpreadTrios = matches.filter(m => m.groupId).map(m => {
        const pairs = GroupUtils.generateBouts(GroupUtils.membersOf(m))
            .map(([a, b]) => ({ a, b, diff: Math.abs(a.weight - b.weight) }));
        const worst = pairs.reduce((x, y) => y.diff > x.diff ? y : x);
        if (worst.diff <= WEIGHT_TOLERANCE + WEIGHT_EPS) return null;
        return { groupId: m.groupId, category: m.category, red: m.red.name, blue: m.blue.name, third: m.third.name,
                 worstPair: `${worst.a.name} vs ${worst.b.name}`, worstDiff: +worst.diff.toFixed(2) };
    }).filter(Boolean);

    // (A) Stranding candidate — heuristic: an unmatched boxer with a same-bucket
    // matched boxer within phase-2 tolerance had a partner taken by someone else.
    // Not proof a full re-pairing would rescue them (swapping could cascade), so
    // this flags a candidate, not a confirmed stranding.
    const matchedBoxers = matches.flatMap(m => GroupUtils.membersOf(m).map(b => ({ ...b, category: m.category })));
    const strandedCandidates = unmatched.filter(u => Number.isFinite(u.weight)).map(u => {
        const nearest = matchedBoxers
            .filter(m => m.category === u.category && Math.abs(m.weight - u.weight) <= PHASE2_TOLERANCE + WEIGHT_EPS)
            .sort((a, b) => Math.abs(a.weight - u.weight) - Math.abs(b.weight - u.weight))[0];
        return nearest ? { name: u.name, weight: u.weight, category: u.category,
                            nearestMatchedPartner: nearest.name, diff: +Math.abs(nearest.weight - u.weight).toFixed(2) } : null;
    }).filter(Boolean);

    return { overSpreadTrios, strandedCandidates };
}

/* c8 ignore start */
function logUnmatched(label, boxers) {
    if (boxers.length === 0) { console.log(`  No unmatched boxers after ${label}.`); return; }
    console.log(`  Unmatched (${boxers.length}):`);
    [...boxers].sort((a, b) => a.weight - b.weight)
        .forEach(b => console.log(`    - ${b.name} (${b.weight}kg, ${b.experience} bouts, ${b.club})`));
}

// Cross-day memory for Random Select: scan output/Spars/<date>/Spars.json for every
// dated folder strictly BEFORE currentDate and collect the unordered id-pair key of
// every bout already fought that week. Random Select prefers opponents NOT in this set.
// Pure-ish: reads the filesystem, never writes. Missing/unreadable files are skipped.
function loadPriorPairs(currentDate) {
    const prior = new Set();
    const sparsDir = path.dirname(path.dirname(OUTPUT_FILE)); // output/Spars
    if (!fs.existsSync(sparsDir)) return prior;
    for (const d of fs.readdirSync(sparsDir)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d >= currentDate) continue;
        const file = path.join(sparsDir, d, 'Spars.json');
        if (!fs.existsSync(file)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            for (const m of data.matches || []) {
                const members = GroupUtils.membersOf(m);
                for (const [a, b] of GroupUtils.generateBouts(members)) {
                    if (a?.id != null && b?.id != null) prior.add(pairKey(a, b));
                }
            }
        } catch { /* skip malformed day file */ }
    }
    return prior;
}

function main(maxPhase = 3, algorithm = 'greedy', trioTol, tightCross = true) {
    if (!fs.existsSync(SOURCE_FILE)) {
        console.error(`Error: ${SOURCE_FILE} not found. Run PutAllFightersinBuckets.js first.`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));

    // Random Select avoids opponents already sparred on earlier days this week.
    const priorPairs = algorithm === 'randomSelect' ? loadPriorPairs(TODAY) : null;

    const { matches: allMatches, unmatched: stillRemaining, manualMatch, groupCount, phases } =
        pairAll(data.finalBuckets, { maxPhase, algorithm, ...(trioTol != null ? { trioTol } : {}), priorPairs, tightCross });

    console.log(`--- Phase 1 — Within-bucket (±2 kg) ---`);
    logUnmatched('Phase 1', phases.phase1.unmatched);
    if (maxPhase >= 2) {
        console.log('\n--- Phase 2 — Within-bucket (±2.5 kg) ---');
        logUnmatched('Phase 2', phases.phase2.unmatched);
    }
    if (tightCross && phases.phaseCross.matches.length) {
        console.log('\n--- Phase 2c — Tight ±1kg cross-bucket (cross-age, tier/gender kept) ---');
        phases.phaseCross.matches.forEach(m => console.log(`  ${m.red.name} vs ${m.blue.name} (Δ${m.weightDiff}kg)`));
    }
    if (maxPhase >= 3) {
        console.log('\n--- Phase 3b — Group Round-Robin (±2 kg, within bucket) ---');
        phases.phase3.groups.forEach(m =>
            console.log(`  Group ${m.groupId}: ${m.red.name} / ${m.blue.name} / ${m.third.name}`));
    } else {
        console.log(`\n--- Stopped after phase ${maxPhase} — not run: ${maxPhase < 2 ? 'phase 2, phase 3b' : 'phase 3b'} ---`);
    }
    logUnmatched(maxPhase >= 3 ? 'Phase 3b' : `phase ${maxPhase} (stopped)`, phases.phase3.unmatched);
    if (algorithm === 'salvage' && phases.phase4.matches.length) {
        console.log(`\n--- Phase 4 — Salvage (cross-age, closest weight, club-avoid; tiers/gender kept) ---`);
        phases.phase4.matches.forEach(m => console.log(`  ${m.red.name} vs ${m.blue.name} (Δ${m.weightDiff}kg)`));
        logUnmatched('Phase 4 salvage', stillRemaining);
    }
    if (manualMatch.length) {
        console.log(`\n--- Held for manual match (autoMatch=no): ${manualMatch.length} ---`);
        manualMatch.forEach(b => console.log(`  - ${b.name} (${b.weight}kg, ${b.club})`));
    }

    const totalBoxers = data.summary.totalDistributed;
    const matchedCount = allMatches.reduce((n, m) => n + GroupUtils.membersOf(m).length, 0);
    const unmatchedCount = stillRemaining.length;

    console.log('\n--- Final Summary ---');
    console.log(`Total Boxers: ${totalBoxers}`);
    console.log(`Matched:      ${matchedCount} (${((matchedCount/totalBoxers)*100).toFixed(1)}%)`);
    console.log(`Groups:       ${groupCount}`);
    console.log(`Unmatched:    ${unmatchedCount}`);

    if (unmatchedCount > 0) {
        console.log('\nUnmatched Boxers:');
        stillRemaining.sort((a,b) => a.weight - b.weight).forEach(b => {
            console.log(`  - ${b.name} (${b.weight}kg, ${b.experience} bouts, ${b.club})`);
        });
    }

    const results = {
        summary: {
            totalBoxers,
            matchedCount,
            unmatchedCount,
            matchCount: allMatches.length,
            groupCount,
            maxPhase,
            successRate: `${((matchedCount/totalBoxers)*100).toFixed(1)}%`
        },
        matches: allMatches,
        unmatched: stillRemaining,
        manualMatch,
        phaseLog: buildPhaseLog(phases),
        matchRisks: checkMatchingRisks(allMatches, stillRemaining)
    };

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to ${OUTPUT_FILE}`);
    return results;
}

if (require.main === module) {
    const phaseArg = process.argv.find(a => a.startsWith('--max-phase='));
    const maxPhase = phaseArg ? parseInt(phaseArg.split('=')[1]) : 3;
    main(maxPhase);
}
/* c8 ignore stop */

module.exports = { main, pairBoxers, pairBoxersOptimal, pairBoxersRandom, pairBoxersSalvage, pairAll, loadPriorPairs, pairKey, buildPhaseLog, checkMatchingRisks };
