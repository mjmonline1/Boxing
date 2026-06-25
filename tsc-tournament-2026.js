// Copyright (c) 2026 ITLR Assets. All rights reserved.
/**
 * TSC 2026 Boxing Tournament Filter
 * Buckets: Gender → Age (YOB) → Experience
 * Weight matching is handled by SparMaker, not here.
 */

const HierarchicalFilter = require('./hierarchical-filter');
const fs = require('fs');
const { AGE_GROUPS, EXPERIENCE_TIERS } = require('./constants');

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    const values = line.split(regex).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};

    headers.forEach((header, index) => {
      const value = values[index];
      if (header === 'id' || header === 'yob' || header === 'experience') {
        obj[header] = parseInt(value);
      } else if (header === 'weight') {
        obj[header] = parseFloat(value);
      } else if (header === 'fit') {
        obj[header] = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
      } else {
        obj[header] = value;
      }
    });

    return obj;
  });
}

function makeExperienceBuckets(agePrefix) {
  return EXPERIENCE_TIERS.map(t => ({
    name: `${agePrefix}_${t.key}`,
    rule: (boxer) => boxer.experience >= t.min && boxer.experience <= t.max,
    description: `${agePrefix} - ${t.key} (${t.display} bouts)`,
  }));
}

const tscTournamentStructure = [
  {
    name: 'NotFit',
    rule: (boxer) => boxer.fit === false || boxer.fit === 'no',
    description: 'Boxers who are not fit to compete'
  },

  {
    name: 'FitMales',
    rule: (boxer) => (boxer.fit === true || boxer.fit === 'yes') &&
                     (boxer.gender === 'male' || boxer.gender === 'M'),
    description: 'Fit male boxers',
    children: AGE_GROUPS.map(ag => ({
      name: ag.key,
      rule: ag.yobMin !== null
        ? (boxer) => boxer.yob >= ag.yobMin && boxer.yob <= ag.yobMax
        : (boxer) => boxer.yob <= ag.yobMax,
      description: `Male ${ag.label} (YOB ${ag.yobMin !== null ? `${ag.yobMin}-${ag.yobMax}` : `≤${ag.yobMax}`})`,
      children: makeExperienceBuckets(ag.key),
    }))
  },

  {
    name: 'FitFemales',
    rule: (boxer) => (boxer.fit === true || boxer.fit === 'yes') &&
                     (boxer.gender === 'female' || boxer.gender === 'F'),
    description: 'Fit female boxers'
  }
];

function runTSCTournament(csvPath) {
  console.log('=== TSC 2026 Boxing Tournament ===\n');
  console.log(`Loading data from: ${csvPath}`);

  const boxers = parseCSV(csvPath);
  console.log(`✓ Loaded ${boxers.length} boxers\n`);

  const maleBoxers   = boxers.filter(b => b.gender === 'male');
  const femaleBoxers = boxers.filter(b => b.gender === 'female');

  console.log('Boxer Statistics:');
  console.log(`  Males: ${maleBoxers.length}`);
  AGE_GROUPS.forEach(ag => {
    const count = ag.yobMin !== null
      ? maleBoxers.filter(b => b.yob >= ag.yobMin && b.yob <= ag.yobMax).length
      : maleBoxers.filter(b => b.yob <= ag.yobMax).length;
    const range = ag.yobMin !== null ? `${ag.yobMin}-${ag.yobMax}` : `≤${ag.yobMax}`;
    console.log(`    - ${ag.label.padEnd(8)} (${range}): ${count}`);
  });
  console.log(`  Females: ${femaleBoxers.length}\n`);

  const filter = new HierarchicalFilter(boxers);

  filter
    .buildTree(tscTournamentStructure)
    .applyFilters()
    .displaySummary();

  console.log('\n=== Bucket Assignments ===');
  const buckets = filter.getFinalBuckets();

  AGE_GROUPS.forEach(ag => {
    const agePrefix  = ag.key;
    const ageEntries = Object.entries(buckets).filter(([name]) => name.startsWith(agePrefix + '_'));

    if (ageEntries.length === 0) return;

    const totalInAge = ageEntries.reduce((sum, [, b]) => sum + b.length, 0);
    console.log(`\n=== MALE ${ag.label.toUpperCase()} (${totalInAge} boxers) ===`);

    EXPERIENCE_TIERS.map(t => ({ key: t.key, label: `${t.key} (${t.display} bouts)` }))
    .forEach(({ key, label }) => {
      const entry = ageEntries.find(([name]) => name === `${agePrefix}_${key}`);
      if (!entry) return;
      const [, expBoxers] = entry;
      console.log(`\n  ${label} - ${expBoxers.length} boxers:`);
      expBoxers.forEach(b => {
        console.log(`    - ${b.name} (${b.club}, ${b.weight}kg, ${b.experience} bouts)`);
      });
    });
  });

  const femaleEntry = Object.entries(buckets).find(([name]) => name === 'FitFemales');
  if (femaleEntry) {
    const [, females] = femaleEntry;
    console.log(`\n=== FEMALE (${females.length} boxers) ===`);
    females.forEach(b => {
      console.log(`  - ${b.name} (${b.club}, ${b.weight}kg, ${b.experience} bouts)`);
    });
  }

  if (!fs.existsSync('Tree/output')) {
    fs.mkdirSync('Tree/output');
  }
  filter.exportToFile('Tree/output/tsc-2025-tournament-results.json');
  filter.exportTreeVisualization('Tree/output/tsc-2025-tournament-tree.txt');

  console.log('\n=== Files Created ===');
  console.log('✓ Tree/output/tsc-2025-tournament-results.json');
  console.log('✓ Tree/output/tsc-2025-tournament-tree.txt');

  console.log('\n=== Verification ===');
  const totalAssigned = Object.values(buckets).reduce((sum, b) => sum + b.length, 0);
  console.log(`✓ Total boxers loaded:      ${boxers.length}`);
  console.log(`✓ Total boxers assigned:    ${totalAssigned}`);
  console.log(`✓ All boxers accounted for: ${totalAssigned === boxers.length ? 'YES' : 'NO'}`);

  return filter;
}

if (require.main === module) {
  const csvPath = 'Tree/data/RegisteredBoxers2025.csv';

  if (fs.existsSync(csvPath)) {
    runTSCTournament(csvPath);
  } else {
    console.log(`CSV file not found at ${csvPath}`);
    console.log('Please run: node parse-tsc-data.js first');
  }
}

module.exports = { runTSCTournament, parseCSV, tscTournamentStructure };
