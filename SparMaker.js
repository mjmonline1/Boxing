// Copyright (c) 2026 ITLR Assets. All rights reserved.
const fs = require('fs');
const path = require('path');

// Configuration
const _d          = new Date();
const TODAY       = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
const SOURCE_FILE = path.join(__dirname, 'output', 'Buckets', 'tsc-2026-buckets.json');
const OUTPUT_FILE = path.join(__dirname, 'output', 'Spars', TODAY, 'Spars.json');
const WEIGHT_TOLERANCE        = 2.0;
const PHASE2_TOLERANCE        = 2.5;

function pairBoxers(boxers, categoryName, tolerance = WEIGHT_TOLERANCE, sparCount) {
    // A boxer with a non-finite weight (e.g. a blank CSV weight cell → NaN) can't be
    // matched by weight, and worse, a NaN sitting mid-list would break the ascending
    // scan early (NaN <= tolerance is false) and starve valid neighbours of opponents.
    // Set such boxers aside as unmatched up front so they neither pair nor poison the scan.
    const unmatched = boxers.filter(b => !Number.isFinite(b.weight));
    const sorted = boxers.filter(b => Number.isFinite(b.weight))
                         .sort((a, b) => a.weight - b.weight);
    const matches = [];

    while (sorted.length > 0) {
        const current = sorted.shift();
        let bestOpponentIndex = -1;
        let differentClub = false;
        let minWeightDiff = Infinity;

        for (let i = 0; i < sorted.length; i++) {
            const opponent = sorted[i];
            const weightDiff = Math.abs(current.weight - opponent.weight);

            if (weightDiff <= tolerance) {
                // Skip if opponent has reached their sparsPerDay limit
                if (sparCount && (sparCount.get(opponent) || 0) >= (opponent.sparsPerDay || 1)) continue;

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
            const opponent = sorted.splice(bestOpponentIndex, 1)[0];
            if (sparCount) {
                sparCount.set(current,  (sparCount.get(current)  || 0) + 1);
                sparCount.set(opponent, (sparCount.get(opponent) || 0) + 1);
            }
            matches.push({
                red: current,
                blue: opponent,
                weightDiff: Math.abs(current.weight - opponent.weight).toFixed(2),
                category: categoryName,
                groupId: null
            });
        } else {
            unmatched.push(current);
        }
    }

    return { matches, unmatched };
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
function pairAll(buckets, { tol1 = WEIGHT_TOLERANCE, tol2 = PHASE2_TOLERANCE } = {}) {
    let allMatches = [];
    const sparCount = new Map(); // tracks 1v1 usage across all phases

    // Phase 1 — within-bucket, ±tol1
    const bucketUnmatched = {};
    const phase1Matches = [];
    for (const [category, boxers] of Object.entries(buckets)) {
        if (category === 'Notfit' || boxers.length === 0) continue;
        const { matches, unmatched } = pairBoxers(boxers, category, tol1, sparCount);
        allMatches = allMatches.concat(matches);
        phase1Matches.push(...matches);
        bucketUnmatched[category] = unmatched;
    }
    const phase1Unmatched = Object.values(bucketUnmatched).flat();

    // Phase 2 — within-bucket, ±tol2 — tag remainders with source bucket
    let allUnmatched = [];
    const phase2Matches = [];
    for (const [category, boxers] of Object.entries(bucketUnmatched)) {
        if (boxers.length === 0) continue;
        const { matches, unmatched } = pairBoxers(boxers, category, tol2, sparCount);
        allMatches = allMatches.concat(matches);
        phase2Matches.push(...matches);
        allUnmatched = allUnmatched.concat(unmatched.map(b => ({ ...b, _bucket: category })));
    }
    const phase2Unmatched = [...allUnmatched];

    // Phase 3b — round-robin: unmatched boxer joins existing 1v1 pair in same bucket (±tol1)
    let groupCounter = 0;
    const stillRemaining = [];
    for (const boxer of allUnmatched) {
        // A non-finite weight can't be group-matched either: `NaN > tol1` is false, so
        // the tolerance guard below would NOT skip it and the boxer could be folded into
        // a group on a bogus comparison. Leave it unmatched.
        if (!Number.isFinite(boxer.weight)) { stillRemaining.push(boxer); continue; }

        const bucket = boxer._bucket;
        let bestIdx = -1, bestDiff = Infinity, bestIsDiffClub = false;

        for (let i = 0; i < allMatches.length; i++) {
            const m = allMatches[i];
            if (m.groupId) continue;
            if (m.category !== bucket) continue;

            for (const partner of [m.red, m.blue]) {
                const diff = Math.abs(boxer.weight - partner.weight);
                if (diff > tol1) continue;
                const isDiffClub = boxer.club !== partner.club;
                if (isDiffClub && !bestIsDiffClub) {
                    bestIdx = i; bestDiff = diff; bestIsDiffClub = true;
                } else if (isDiffClub === bestIsDiffClub && diff < bestDiff) {
                    bestIdx = i; bestDiff = diff;
                }
            }
        }

        if (bestIdx !== -1) {
            const anchor = allMatches[bestIdx];
            anchor.groupId = `g${++groupCounter}`;
            anchor.third   = boxer;
        } else {
            stillRemaining.push(boxer);
        }
    }

    // Rename _bucket to category on unmatched, strip from matched boxer objects
    allMatches.forEach(m => { delete m.red._bucket; delete m.blue._bucket; if (m.third) delete m.third._bucket; });
    stillRemaining.forEach(b => { b.category = b._bucket; delete b._bucket; });

    return {
        matches:    allMatches,
        unmatched:  stillRemaining,
        groupCount: groupCounter,
        phases: {
            phase1: { matches: phase1Matches, unmatched: phase1Unmatched },
            phase2: { matches: phase2Matches, unmatched: phase2Unmatched },
            phase3: { groups: allMatches.filter(m => m.groupId), unmatched: stillRemaining },
        },
    };
}

/* c8 ignore start */
function logUnmatched(label, boxers) {
    if (boxers.length === 0) { console.log(`  No unmatched boxers after ${label}.`); return; }
    console.log(`  Unmatched (${boxers.length}):`);
    [...boxers].sort((a, b) => a.weight - b.weight)
        .forEach(b => console.log(`    - ${b.name} (${b.weight}kg, ${b.experience} bouts, ${b.club})`));
}

function main() {
    if (!fs.existsSync(SOURCE_FILE)) {
        console.error(`Error: ${SOURCE_FILE} not found. Run PutAllFightersinBuckets.js first.`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));

    const { matches: allMatches, unmatched: stillRemaining, groupCount, phases } =
        pairAll(data.finalBuckets);

    console.log('--- Phase 1 — Within-bucket (±2 kg) ---');
    logUnmatched('Phase 1', phases.phase1.unmatched);
    console.log('\n--- Phase 2 — Within-bucket (±2.5 kg) ---');
    logUnmatched('Phase 2', phases.phase2.unmatched);
    console.log('\n--- Phase 3b — Group Round-Robin (±2 kg, within bucket) ---');
    phases.phase3.groups.forEach(m =>
        console.log(`  Group ${m.groupId}: ${m.red.name} / ${m.blue.name} / ${m.third.name}`));
    logUnmatched('Phase 3b', stillRemaining);

    const totalBoxers = data.summary.totalDistributed;
    const matchedCount = allMatches.reduce((n, m) => n + (m.third ? 3 : 2), 0);
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
            successRate: `${((matchedCount/totalBoxers)*100).toFixed(1)}%`
        },
        matches: allMatches,
        unmatched: stillRemaining
    };

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to ${OUTPUT_FILE}`);
}

if (require.main === module) main();
/* c8 ignore stop */

module.exports = { main, pairBoxers, pairAll };
