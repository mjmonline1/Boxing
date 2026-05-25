// Copyright (c) 2026 ITLR Assets. All rights reserved.
const fs = require('fs');
const path = require('path');

const WEIGHT_TOLERANCE = 2.0;
const SOURCE_FILE = path.join(__dirname, 'output', 'Buckets', 'tsc-2025-buckets.json');
const OUTPUT_FILE = path.join(__dirname, 'output', 'WeightProximity.csv');

function findProximityPairs(buckets) {
    const rows = [];

    for (const [category, boxers] of Object.entries(buckets)) {
        if (category === 'NotFit' || boxers.length === 0) continue;

        for (let i = 0; i < boxers.length; i++) {
            for (let j = i + 1; j < boxers.length; j++) {
                const a = boxers[i];
                const b = boxers[j];
                const diff = Math.abs(a.weight - b.weight);
                if (diff <= WEIGHT_TOLERANCE) {
                    rows.push({
                        category,
                        boxer_a: a.name,
                        club_a: a.club,
                        weight_a: a.weight,
                        boxer_b: b.name,
                        club_b: b.club,
                        weight_b: b.weight,
                        weight_diff: diff.toFixed(2),
                        same_club: a.club === b.club ? 'yes' : 'no',
                    });
                }
            }
        }

        rows.sort((x, y) =>
            x.category.localeCompare(y.category) || parseFloat(x.weight_diff) - parseFloat(y.weight_diff)
        );
    }

    return rows;
}

function toCSV(rows) {
    const header = 'category,boxer_a,club_a,weight_a,boxer_b,club_b,weight_b,weight_diff,same_club';
    const lines = rows.map(r =>
        [r.category, r.boxer_a, r.club_a, r.weight_a, r.boxer_b, r.club_b, r.weight_b, r.weight_diff, r.same_club]
            .map(v => (String(v).includes(',') ? `"${v}"` : v))
            .join(',')
    );
    return [header, ...lines].join('\n');
}

function main() {
    if (!fs.existsSync(SOURCE_FILE)) {
        console.error(`Error: ${SOURCE_FILE} not found. Run tsc-tournament-2025.js first.`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
    const rows = findProximityPairs(data.finalBuckets);

    fs.writeFileSync(OUTPUT_FILE, toCSV(rows));
    console.log(`${rows.length} pairs written to ${OUTPUT_FILE}`);
}

if (require.main === module) main();

module.exports = { findProximityPairs };
