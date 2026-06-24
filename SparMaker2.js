// Copyright (c) 2026 ITLR Assets. All rights reserved.
const fs = require('fs');
const path = require('path');

const SOURCE_FILE = path.join(__dirname, 'output', 'Buckets', 'tsc-2025-buckets.json');
const OUTPUT_FILE = path.join(__dirname, 'output', 'Spars', 'Spars2.json');
const WEIGHT_TOLERANCE        = 2.0;
const RESCUE_WEIGHT_TOLERANCE = 20.0;

/**
 * Pairs boxers within a bucket.
 *
 * Splits the weight-sorted list into consecutive "windows" where each adjacent
 * pair is within tolerance. Then:
 *   - Window of 1         → unmatched (no compatible neighbour)
 *   - Window of even size → greedy pairs with club-avoidance preference
 *   - Window of odd size  → round-robin: every boxer fights every other (C(N,2) pairs)
 *
 * This eliminates the need for a cross-category rescue in most odd-count brackets.
 */
function pairBoxers(boxers, categoryName, tolerance = WEIGHT_TOLERANCE) {
    const sorted = [...boxers].sort((a, b) => a.weight - b.weight);
    const matches = [];
    const unmatched = [];

    if (sorted.length === 0) return { matches, unmatched };

    // Build consecutive windows: each adjacent pair must be within tolerance
    const windows = [];
    let window = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].weight - sorted[i - 1].weight <= tolerance) {
            window.push(sorted[i]);
        } else {
            windows.push(window);
            window = [sorted[i]];
        }
    }
    windows.push(window);

    for (const group of windows) {
        if (group.length === 1) {
            // Single boxer with no compatible neighbour — needs rescue pass
            unmatched.push(group[0]);

        } else if (group.length % 2 === 0) {
            // Even count: greedy pairs with club-avoidance preference (same as SparMaker.js)
            const pool = [...group];
            while (pool.length > 0) {
                const current = pool.shift();
                let bestIdx = -1;
                let preferDiffClub = false;
                let minDiff = Infinity;

                for (let i = 0; i < pool.length; i++) {
                    const diff = Math.abs(current.weight - pool[i].weight);
                    if (diff > tolerance) break; // sorted — safe to stop early
                    const diffClub = current.club !== pool[i].club;
                    if (diffClub && !preferDiffClub) {
                        bestIdx = i; preferDiffClub = true; minDiff = diff;
                    } else if (diffClub === preferDiffClub && diff < minDiff) {
                        bestIdx = i; minDiff = diff;
                    }
                }

                if (bestIdx !== -1) {
                    const opp = pool.splice(bestIdx, 1)[0];
                    matches.push({
                        red:        current,
                        blue:       opp,
                        weightDiff: Math.abs(current.weight - opp.weight).toFixed(2),
                        category:   categoryName
                    });
                } else {
                    unmatched.push(current);
                }
            }

        } else {
            // Odd count: round-robin — every boxer fights every other boxer in the group.
            // Each pair becomes its own independent 1v1 bout in its own ring slot.
            // A boxer will appear in (group.length - 1) matches — this is correct.
            for (let a = 0; a < group.length; a++) {
                for (let b = a + 1; b < group.length; b++) {
                    matches.push({
                        red:        group[a],
                        blue:       group[b],
                        weightDiff: Math.abs(group[a].weight - group[b].weight).toFixed(2),
                        category:   categoryName
                    });
                }
            }
        }
    }

    return { matches, unmatched };
}

function main() {
    if (!fs.existsSync(SOURCE_FILE)) {
        console.error(`Error: ${SOURCE_FILE} not found. Run tsc-tournament-2025.js first.`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
    const buckets = data.finalBuckets;

    let allMatches   = [];
    let allUnmatched = [];

    // Pass 1 — Initial pairing within each bucket
    console.log('--- Initial Pairing Pass ---');
    for (const [category, boxers] of Object.entries(buckets)) {
        if (category === 'NotFit' || boxers.length === 0) continue;

        const { matches, unmatched } = pairBoxers(boxers, category);
        allMatches   = allMatches.concat(matches);
        allUnmatched = allUnmatched.concat(unmatched);

        if (matches.length > 0 || unmatched.length > 0) {
            console.log(`  ${category}: ${matches.length} bouts, ${unmatched.length} unmatched`);
        }
    }

    // Pass 2 — Rescue pass for genuine single-boxer edge cases (no compatible neighbour within ±2 kg)
    console.log('\n--- Rescue Pass (Cross-Bucket, ±20 kg) ---');
    const ageGroups = ['Schools', 'Junior', 'Youth', 'Senior', 'Female'];
    const rescuedMatches     = [];
    const remainingUnmatched = [];

    for (const group of ageGroups) {
        const groupUnmatched = allUnmatched.filter(b => {
            if (group === 'Female') return b.gender === 'female';
            return b.gender === 'male' && (
                (group === 'Schools' && b.yob >= 2012 && b.yob <= 2014) ||
                (group === 'Junior'  && b.yob >= 2010 && b.yob <= 2011) ||
                (group === 'Youth'   && b.yob >= 2008 && b.yob <= 2009) ||
                (group === 'Senior'  && b.yob <= 2007)
            );
        });

        if (groupUnmatched.length > 0) {
            const { matches, unmatched } = pairBoxers(groupUnmatched, `${group}_Rescue`, RESCUE_WEIGHT_TOLERANCE);
            allMatches = allMatches.concat(matches);
            rescuedMatches.push(...matches);
            remainingUnmatched.push(...unmatched);
        }
    }

    console.log(`  Rescued ${rescuedMatches.length} additional bouts.`);

    // Summary — count unique boxers who appear in at least one match
    const totalBoxers  = data.summary.totalDistributed;
    const matchedIds   = new Set(allMatches.flatMap(m => [m.red.id, m.blue.id]));
    const matchedCount = matchedIds.size;
    const unmatchedCount = remainingUnmatched.length;

    console.log('\n--- Final Summary ---');
    console.log(`Total Boxers:   ${totalBoxers}`);
    console.log(`Unique Matched: ${matchedCount} (${((matchedCount / totalBoxers) * 100).toFixed(1)}%)`);
    console.log(`Total Bouts:    ${allMatches.length}`);
    console.log(`Unmatched:      ${unmatchedCount}`);

    if (unmatchedCount > 0) {
        console.log('\nUnmatched Boxers:');
        remainingUnmatched
            .sort((a, b) => a.weight - b.weight)
            .forEach(b => console.log(`  - ${b.name} (${b.weight}kg, ${b.experience} bouts, ${b.club})`));
    }

    const results = {
        summary: {
            totalBoxers,
            matchedCount,
            unmatchedCount,
            boutCount:   allMatches.length,
            successRate: `${((matchedCount / totalBoxers) * 100).toFixed(1)}%`
        },
        matches:   allMatches,
        unmatched: remainingUnmatched
    };

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to ${OUTPUT_FILE}`);
}

if (require.main === module) main();

module.exports = { main };
