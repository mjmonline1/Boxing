// Copyright (c) 2026 ITLR Assets. All rights reserved.
/**
 * TSC 2026 Boxing Tournament Filter
 * Buckets: Gender → Age (YOB) → Experience
 * Weight matching is handled by SparMaker, not here.
 */

const HierarchicalFilter = require('./hierarchical-filter');
const fs = require('fs');

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
  return [
    {
      name: `${agePrefix}_Novice`,
      rule: (boxer) => boxer.experience <= 5,
      description: `${agePrefix} - Novice (0-5 bouts)`
    },
    {
      name: `${agePrefix}_Experienced`,
      rule: (boxer) => boxer.experience >= 6 && boxer.experience <= 10,
      description: `${agePrefix} - Experienced (6-10 bouts)`
    },
    {
      name: `${agePrefix}_OpenClass`,
      rule: (boxer) => boxer.experience >= 11,
      description: `${agePrefix} - Open Class (11+ bouts)`
    }
  ];
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
    children: [
      {
        name: 'MaleSchools',
        rule: (boxer) => boxer.yob >= 2012 && boxer.yob <= 2014,
        description: 'Male Schools (YOB 2012-2014)',
        children: makeExperienceBuckets('MaleSchools')
      },
      {
        name: 'MaleJunior',
        rule: (boxer) => boxer.yob >= 2010 && boxer.yob <= 2011,
        description: 'Male Junior (YOB 2010-2011)',
        children: makeExperienceBuckets('MaleJunior')
      },
      {
        name: 'MaleYouth',
        rule: (boxer) => boxer.yob >= 2008 && boxer.yob <= 2009,
        description: 'Male Youth (YOB 2008-2009)',
        children: makeExperienceBuckets('MaleYouth')
      },
      {
        name: 'MaleSenior',
        rule: (boxer) => boxer.yob <= 2007,
        description: 'Male Senior (YOB 2007 & older)',
        children: makeExperienceBuckets('MaleSenior')
      }
    ]
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
  console.log(`    - Schools (2012-2014): ${maleBoxers.filter(b => b.yob >= 2012 && b.yob <= 2014).length}`);
  console.log(`    - Junior  (2010-2011): ${maleBoxers.filter(b => b.yob >= 2010 && b.yob <= 2011).length}`);
  console.log(`    - Youth   (2008-2009): ${maleBoxers.filter(b => b.yob >= 2008 && b.yob <= 2009).length}`);
  console.log(`    - Senior  (≤2007):     ${maleBoxers.filter(b => b.yob <= 2007).length}`);
  console.log(`  Females: ${femaleBoxers.length}\n`);

  const filter = new HierarchicalFilter(boxers);

  filter
    .buildTree(tscTournamentStructure)
    .applyFilters()
    .displaySummary();

  console.log('\n=== Bucket Assignments ===');
  const buckets = filter.getFinalBuckets();

  ['Schools', 'Junior', 'Youth', 'Senior'].forEach(ageGroup => {
    const agePrefix  = `Male${ageGroup}`;
    const ageEntries = Object.entries(buckets).filter(([name]) => name.startsWith(agePrefix + '_'));

    if (ageEntries.length === 0) return;

    const totalInAge = ageEntries.reduce((sum, [, b]) => sum + b.length, 0);
    console.log(`\n=== MALE ${ageGroup.toUpperCase()} (${totalInAge} boxers) ===`);

    [
      { key: 'Novice',      label: 'Novice (0-5 bouts)' },
      { key: 'Experienced', label: 'Experienced (6-10 bouts)' },
      { key: 'OpenClass',   label: 'Open Class (11+ bouts)' }
    ].forEach(({ key, label }) => {
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
