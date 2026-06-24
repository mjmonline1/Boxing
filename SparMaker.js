// Copyright (c) 2026 ITLR Assets. All rights reserved.
const fs = require('fs');
const path = require('path');

// Configuration
const _d          = new Date();
const TODAY       = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
const SOURCE_FILE = path.join(__dirname, 'output', 'Buckets', 'tsc-2025-buckets.json');
const OUTPUT_FILE = path.join(__dirname, 'output', 'Spars', TODAY, 'Spars.json');
const WEIGHT_TOLERANCE        = 2.0;
const PHASE2_TOLERANCE        = 2.5;

function pairBoxers(boxers, categoryName, tolerance = WEIGHT_TOLERANCE, sparCount) {
    const sorted = [...boxers].sort((a, b) => a.weight - b.weight);
    const matches = [];
    const unmatched = [];

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

/* c8 ignore start */
function main() {
    if (!fs.existsSync(SOURCE_FILE)) {
        console.error(`Error: ${SOURCE_FILE} not found. Run tsc-tournament-2025.js first.`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
    const buckets = data.finalBuckets;

    let allMatches = [];
    let allUnmatched = [];

    // sparCount tracks 1v1 usage across all phases
    const sparCount = new Map();

    // Phase 1 — within-bucket, ±2 kg
    console.log('--- Phase 1 — Within-bucket (±2 kg) ---');
    const bucketUnmatched = {};
    for (const [category, boxers] of Object.entries(buckets)) {
        if (category === 'Notfit' || boxers.length === 0) continue;

        const { matches, unmatched } = pairBoxers(boxers, category, WEIGHT_TOLERANCE, sparCount);
        allMatches = allMatches.concat(matches);
        bucketUnmatched[category] = unmatched;

        if (matches.length > 0) {
            console.log(`  ${category}: ${matches.length} matches, ${unmatched.length} unmatched.`);
            matches.forEach(m => console.log(`    ${m.red.name} (${m.red.weight}kg) vs ${m.blue.name} (${m.blue.weight}kg)`));
        }
    }
    const phase1Unmatched = Object.values(bucketUnmatched).flat();
    if (phase1Unmatched.length > 0) {
        console.log(`  Unmatched (${phase1Unmatched.length}):`);
        phase1Unmatched.sort((a, b) => a.weight - b.weight)
            .forEach(b => console.log(`    - ${b.name} (${b.weight}kg, ${b.experience} bouts, ${b.club})`));
    } else {
        console.log('  No unmatched boxers after Phase 1.');
    }

    // Phase 2 — within-bucket, ±2.5 kg — tag remainders with source bucket
    console.log('\n--- Phase 2 — Within-bucket (±2.5 kg) ---');
    for (const [category, boxers] of Object.entries(bucketUnmatched)) {
        if (boxers.length === 0) continue;
        const { matches, unmatched } = pairBoxers(boxers, category, PHASE2_TOLERANCE, sparCount);
        allMatches = allMatches.concat(matches);
        allUnmatched = allUnmatched.concat(unmatched.map(b => ({ ...b, _bucket: category })));
        if (matches.length > 0) {
            console.log(`  ${category}: ${matches.length} matches, ${unmatched.length} unmatched.`);
            matches.forEach(m => console.log(`    ${m.red.name} (${m.red.weight}kg) vs ${m.blue.name} (${m.blue.weight}kg)`));
        }
    }
    if (allUnmatched.length > 0) {
        console.log(`  Unmatched (${allUnmatched.length}):`);
        [...allUnmatched].sort((a, b) => a.weight - b.weight)
            .forEach(b => console.log(`    - ${b.name} (${b.weight}kg, ${b.experience} bouts, ${b.club})`));
    } else {
        console.log('  No unmatched boxers after Phase 2.');
    }

    // Phase 3b — group round-robin: unmatched boxer joins existing 1v1 pair in same bucket (±2 kg)
    console.log('\n--- Phase 3b — Group Round-Robin (±2 kg, within bucket) ---');
    let groupCounter = 0;
    const stillRemaining = [];

    for (const boxer of allUnmatched) {
        const bucket = boxer._bucket;
        let bestIdx = -1, bestDiff = Infinity, bestIsDiffClub = false;

        for (let i = 0; i < allMatches.length; i++) {
            const m = allMatches[i];
            if (m.groupId) continue;
            if (m.category !== bucket) continue;

            for (const partner of [m.red, m.blue]) {
                const diff = Math.abs(boxer.weight - partner.weight);
                if (diff > WEIGHT_TOLERANCE) continue;
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
            const gid = `g${++groupCounter}`;
            anchor.groupId = gid;
            anchor.third   = boxer;
            console.log(`  Group ${gid}: ${anchor.red.name} / ${anchor.blue.name} / ${boxer.name}`);
        } else {
            stillRemaining.push(boxer);
        }
    }
    if (stillRemaining.length > 0) {
        console.log(`  Unmatched (${stillRemaining.length}):`);
        [...stillRemaining].sort((a, b) => a.weight - b.weight)
            .forEach(b => console.log(`    - ${b.name} (${b.weight}kg, ${b.experience} bouts, ${b.club})`));
    } else {
        console.log('  No unmatched boxers after Phase 3b — all boxers matched!');
    }

    // Rename _bucket to category on unmatched, strip from matched boxer objects
    allMatches.forEach(m => { delete m.red._bucket; delete m.blue._bucket; if (m.third) delete m.third._bucket; });
    stillRemaining.forEach(b => { b.category = b._bucket; delete b._bucket; });

    const groupCount = groupCounter;
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

module.exports = { main, pairBoxers };
