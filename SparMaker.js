// Copyright (c) 2026 ITLR Assets. All rights reserved.
const fs = require('fs');
const path = require('path');

// Configuration
const TODAY       = new Date().toISOString().split('T')[0];
const SOURCE_FILE = path.join(__dirname, 'output', 'Buckets', 'tsc-2025-buckets.json');
const OUTPUT_FILE = path.join(__dirname, 'output', 'Spars', TODAY, 'Spars.json');
const WEIGHT_TOLERANCE        = 2.0;
const PHASE2_TOLERANCE        = 2.5;
const RESCUE_WEIGHT_TOLERANCE = 20.0;

/**
 * Pairs boxers within a bucket based on weight and club avoidance.
 */
function pairBoxers(boxers, categoryName, tolerance = WEIGHT_TOLERANCE) {
    // Sort by weight
    const sorted = [...boxers].sort((a, b) => a.weight - b.weight);
    const matches = [];
    const unmatched = [];
    
    while (sorted.length > 0) {
        const current = sorted.shift();
        let bestOpponentIndex = -1;
        let differentClub = false;
        let minWeightDiff = Infinity;

        // Search for the best opponent within WEIGHT_TOLERANCE
        for (let i = 0; i < sorted.length; i++) {
            const opponent = sorted[i];
            const weightDiff = Math.abs(current.weight - opponent.weight);

            // Must be within tolerance
            if (weightDiff <= tolerance) {
                const isDifferentClub = current.club !== opponent.club;
                
                // Prioritize different club
                if (isDifferentClub && !differentClub) {
                    bestOpponentIndex = i;
                    differentClub = true;
                    minWeightDiff = weightDiff;
                } 
                // If same club status, pick the closest weight
                else if (isDifferentClub === differentClub) {
                    if (weightDiff < minWeightDiff) {
                        bestOpponentIndex = i;
                        minWeightDiff = weightDiff;
                    }
                }
            } else {
                // Since it's sorted, we can break early if we exceed the tolerance
                // (Though a small list makes this optimization minor)
                break;
            }
        }

        if (bestOpponentIndex !== -1) {
            const opponent = sorted.splice(bestOpponentIndex, 1)[0];
            matches.push({
                red: current,
                blue: opponent,
                weightDiff: Math.abs(current.weight - opponent.weight).toFixed(2),
                category: categoryName
            });
        } else {
            unmatched.push(current);
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
    
    let allMatches = [];
    let allUnmatched = [];

    // Phase 1 — within-bucket, ±2 kg
    console.log('--- Phase 1 — Within-bucket (±2 kg) ---');
    const bucketUnmatched = {};
    for (const [category, boxers] of Object.entries(buckets)) {
        if (category === 'NotFit' || boxers.length === 0) continue;

        const { matches, unmatched } = pairBoxers(boxers, category, WEIGHT_TOLERANCE);
        allMatches = allMatches.concat(matches);
        bucketUnmatched[category] = unmatched;

        if (matches.length > 0) {
            console.log(`  ${category}: ${matches.length} matches, ${unmatched.length} unmatched.`);
        }
    }

    // Phase 2 — within-bucket, ±2.5 kg
    console.log('\n--- Phase 2 — Within-bucket (±2.5 kg) ---');
    for (const [category, boxers] of Object.entries(bucketUnmatched)) {
        if (boxers.length === 0) continue;
        const { matches, unmatched } = pairBoxers(boxers, category, PHASE2_TOLERANCE);
        allMatches = allMatches.concat(matches);
        allUnmatched = allUnmatched.concat(unmatched);
        if (matches.length > 0) {
            console.log(`  ${category}: ${matches.length} matches, ${unmatched.length} unmatched.`);
        }
    }

    // Phase 3 — rescue pass, cross-bucket, ±20 kg
    console.log('\n--- Phase 3 — Rescue Pass (Cross-Bucket, ±20 kg) ---');

/*

2026 Year of Birth Classifications
• Schools: 2012, 2013, 2014
• Juniors: 2010, 2011
• Youths: 2008, 2009
• Seniors: 2007 and older

In each of the 4 age categories, boxers are further separated into experience-based buckets:
0-5 bouts = NOVICE
6-10 bouts = EXPERIENCED
11 bouts or more = OPEN CLASS

Matching phases
Spar manager matches boxers in each bucket across 3 phases.
Phase 1: If the weight is within +/- 2 kg, it's a match, otherwise, move to Phase 2
Phase 2: If the weight is within  +/- 2.5 kg, it's a match, otherwise move to phase 3
In Phase 3, add the boxer to an existing spar (round robin with 3 boxers). If no match is found, the boxer remains on the bench to be matched manually by Sam.

Boxers doing 2 spars.
I will add a section to the Google Form asking whether each boxer can do 1 or 2 spars per session.
 A new column will be added to the boxer details spreadsheet. The boxer manager will know whether a boxer can re-enter the pool for another match. 
 The system will then repeat the phases to find a second match. The opponent must be different. 
 The ring manager must know that these boxers require a minimum of 30 minutes between the first and second spar for recovery.
*/

    
    const ageGroups = ['Schools', 'Junior', 'Youth', 'Senior'];
    const experienceTiers = [
        { name: 'Novice',      min: 0,  max: 5  },
        { name: 'Experienced', min: 6,  max: 10 },
        { name: 'OpenClass',   min: 11, max: Infinity }
    ];
    const rescuedMatches = [];
    const remainingUnmatched = [];

    // Male: rescue within same age group AND same experience tier
    for (const group of ageGroups) {
        for (const tier of experienceTiers) {
            const groupUnmatched = allUnmatched.filter(b =>
                b.gender === 'male' &&
                b.experience >= tier.min && b.experience <= tier.max &&
                (
                    (group === 'Schools' && b.yob >= 2012 && b.yob <= 2014) ||
                    (group === 'Junior'  && b.yob >= 2010 && b.yob <= 2011) ||
                    (group === 'Youth'   && b.yob >= 2008 && b.yob <= 2009) ||
                    (group === 'Senior'  && b.yob <= 2007)
                )
            );

            if (groupUnmatched.length > 0) {
                const label = `${group}_${tier.name}_Rescue`;
                const { matches, unmatched } = pairBoxers(groupUnmatched, label, RESCUE_WEIGHT_TOLERANCE);
                allMatches = allMatches.concat(matches);
                rescuedMatches.push(...matches);
                remainingUnmatched.push(...unmatched);
            }
        }
    }

    // Female: single pool, no age/experience split
    const femaleUnmatched = allUnmatched.filter(b => b.gender === 'female');
    if (femaleUnmatched.length > 0) {
        const { matches, unmatched } = pairBoxers(femaleUnmatched, 'Female_Rescue', RESCUE_WEIGHT_TOLERANCE);
        allMatches = allMatches.concat(matches);
        rescuedMatches.push(...matches);
        remainingUnmatched.push(...unmatched);
    }

    console.log(`  Rescued ${rescuedMatches.length} additional matches.`);

    // 3. Final Summary
    const totalBoxers = data.summary.totalDistributed;
    const matchedCount = allMatches.length * 2;
    const unmatchedCount = remainingUnmatched.length;

    console.log('\n--- Final Summary ---');
    console.log(`Total Boxers: ${totalBoxers}`);
    console.log(`Matched:      ${matchedCount} (${((matchedCount/totalBoxers)*100).toFixed(1)}%)`);
    console.log(`Unmatched:    ${unmatchedCount}`);

    if (unmatchedCount > 0) {
        console.log('\nUnmatched Boxers (Outside 2kg safety margin):');
        remainingUnmatched.sort((a,b) => a.weight - b.weight).forEach(b => {
            console.log(`  - ${b.name} (${b.weight}kg, ${b.experience} bouts, ${b.club})`);
        });
    }

    // Export results
    const results = {
        summary: {
            totalBoxers,
            matchedCount,
            unmatchedCount,
            matchCount: allMatches.length,
            successRate: `${((matchedCount/totalBoxers)*100).toFixed(1)}%`
        },
        matches: allMatches,
        unmatched: remainingUnmatched
    };

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to ${OUTPUT_FILE}`);
}

if (require.main === module) main();

module.exports = { main };
