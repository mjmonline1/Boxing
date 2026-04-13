const fs = require('fs');
const path = require('path');

// Configuration
const SOURCE_FILE = path.join(__dirname, 'output', 'tsc-2025-tournament-results.json');
const OUTPUT_FILE = path.join(__dirname, 'output', 'tsc-sparring-matches.json');
const WEIGHT_TOLERANCE = 2.0;

/**
 * Pairs boxers within a bucket based on weight and club avoidance.
 */
function pairBoxers(boxers, categoryName) {
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
            if (weightDiff <= WEIGHT_TOLERANCE) {
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

    // 1. Initial Pairing within each bucket
    console.log('--- Initial Pairing Pass ---');
    for (const [category, boxers] of Object.entries(buckets)) {
        if (boxers.length === 0) continue;
        
        const { matches, unmatched } = pairBoxers(boxers, category);
        allMatches = allMatches.concat(matches);
        allUnmatched = allUnmatched.concat(unmatched);
        
        if (matches.length > 0) {
            console.log(`  ${category}: Created ${matches.length} matches, ${unmatched.length} left unmatched.`);
        }
    }

    // 2. Rescue Pass - Try to pair unmatched boxers within the same Age/Gender group
    console.log('\n--- Rescue Pass (Cross-Bucket) ---');
    const ageGroups = ['Junior', 'Youth', 'Senior', 'Female'];
    const rescuedMatches = [];
    const remainingUnmatched = [];

    for (const group of ageGroups) {
        const groupUnmatched = allUnmatched.filter(b => {
            if (group === 'Female') return b.gender === 'female';
            // For males, check the category name string or infer from YOB
            return b.gender === 'male' && (
                (group === 'Junior' && b.yob >= 2009) ||
                (group === 'Youth' && b.yob >= 2007 && b.yob <= 2008) ||
                (group === 'Senior' && b.yob <= 2006)
            );
        });

        if (groupUnmatched.length > 0) {
            const { matches, unmatched } = pairBoxers(groupUnmatched, `${group}_Rescue`);
            allMatches = allMatches.concat(matches);
            rescuedMatches.push(...matches);
            remainingUnmatched.push(...unmatched);
        }
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

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to ${OUTPUT_FILE}`);
}

main();
