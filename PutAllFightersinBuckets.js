// Copyright (c) 2026 ITLR Assets. All rights reserved.
/**
 * TSC 2026 Boxing Tournament - Bucket Assignment
 * Structure: Gender → Age (YOB) → Experience
 * Weight matching is handled by SparMaker, not here.
 */

const HierarchicalFilter = require('./hierarchical-filter');
const fs   = require('fs');
const path = require('path');
const { AGE_GROUPS, EXPERIENCE_TIERS } = require('./constants');

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines   = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const regex  = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    const values = line.split(regex).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj    = {};

    headers.forEach((header, index) => {
      const value = values[index];
      if (header === 'id' || header === 'yob') {
        obj[header] = parseInt(value);
      } else if (header === 'experience') {
        // Blank/non-numeric experience defaults to 0 bouts (Novice). Without this a
        // valid competitor whose bout count is missing fails every experience-tier
        // rule (NaN <= 5 etc. are all false) and silently vanishes from all buckets.
        const n = parseInt(value);
        obj[header] = Number.isNaN(n) ? 0 : n;
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

const tscBucketStructure = [
  {
    name: 'Notfit',
    rule: (boxer) => boxer.fit === false || boxer.fit === 'no',
    description: 'Boxers who are not fit to compete'
  },

  {
    name: 'Male',
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
    name: 'Female',
    rule: (boxer) => (boxer.fit === true || boxer.fit === 'yes') &&
                     (boxer.gender === 'female' || boxer.gender === 'F'),
    description: 'Fit female boxers'
  }
];

/**
 * Explain why a boxer matched no final bucket. The structure is Gender → Age
 * (YOB) → Experience; the only intended catch-alls are Notfit (unfit) and
 * Female (any fit female). Everyone else must land in a Male age/experience
 * bucket. A boxer reaching this function has fallen through a GAP — name the gap.
 */
function explainUnassigned(boxer) {
  const fit = boxer.fit === true || boxer.fit === 'yes';
  if (!fit) return 'BUG: not-fit boxer should have landed in Notfit';

  const isMale   = boxer.gender === 'male'   || boxer.gender === 'M';
  const isFemale = boxer.gender === 'female' || boxer.gender === 'F';
  if (isFemale) return 'BUG: fit female should have landed in Female';
  if (!isMale)  return `unrecognised gender "${boxer.gender}" (expected male/female)`;

  // Male age groups span YOB 2007 (and older) up to 2014. The only gap is the
  // young end: nothing covers boxers born 2015 or later (younger than Schools).
  const schoolsFloor = AGE_GROUPS.find(ag => ag.label === 'Schools').yobMin;
  if (boxer.yob > AGE_GROUPS[0].yobMax) {
    return `YOB ${boxer.yob} is younger than the Schools floor (${schoolsFloor}) — ` +
           `no male age bucket covers under-Schools boxers`;
  }
  const ranges = AGE_GROUPS.map(ag =>
    ag.yobMin !== null ? `${ag.label} ${ag.yobMin}-${ag.yobMax}` : `${ag.label} <=${ag.yobMax}`
  ).join(', ');
  return `YOB ${boxer.yob} matched no male age bucket (${ranges})`;
}

/* c8 ignore start */
function runTSCBuckets(csvPath) {
  console.log('=== TSC 2026 Boxing Tournament - Bucket Assignment ===\n');
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
    .buildTree(tscBucketStructure)
    .applyFilters()
    .displaySummary();

  console.log('\n=== Bucket Assignments ===');
  const buckets = filter.getFinalBuckets();

  if (buckets.Notfit && buckets.Notfit.length > 0) {
    console.log(`\n=== NOT FIT (${buckets.Notfit.length} boxers) ===`);
    buckets.Notfit.forEach(b => {
      console.log(`  - ${b.name} (${b.club}, ${b.weight}kg, ${b.experience} bouts)`);
    });
  }

  ['Schools', 'Junior', 'Youth', 'Senior'].forEach(ageGroup => {
    const agePrefix  = `Male${ageGroup}`;
    const ageEntries = Object.entries(buckets).filter(([name]) => name.startsWith(agePrefix + '_'));

    if (ageEntries.length === 0) return;

    const totalInAge = ageEntries.reduce((sum, [, b]) => sum + b.length, 0);
    console.log(`\n=== MALE ${ageGroup.toUpperCase()} (${totalInAge} boxers) ===`);

    EXPERIENCE_TIERS.map(t => ({ key: t.key, label: `${t.key} (${t.display} bouts)` }))
    .forEach(({ key, label }) => {
      const entry = ageEntries.find(([name]) => name === `${agePrefix}_${key}`);
      if (!entry) return;
      const [, expBoxers] = entry;
      if (expBoxers.length === 0) return;
      console.log(`\n  ${label} - ${expBoxers.length} boxers:`);
      expBoxers.forEach(b => {
        console.log(`    - ${b.name} (${b.club}, ${b.weight}kg, ${b.experience} bouts)`);
      });
    });
  });

  const femaleEntry = Object.entries(buckets).find(([name]) => name === 'Female');
  if (femaleEntry) {
    const [, females] = femaleEntry;
    if (females.length > 0) {
      console.log(`\n=== FEMALES (${females.length} boxers) ===`);
      females.forEach(b => {
        console.log(`  - ${b.name} (${b.club}, ${b.weight}kg, ${b.experience} bouts)`);
      });
    }
  }

  // Export CSV per bucket
  fs.mkdirSync(path.join(__dirname, 'output/Buckets'), { recursive: true });

  console.log('\n=== Exporting CSV Files ===');
  Object.entries(buckets).forEach(([bucketName, bxrs]) => {
    if (bxrs.length === 0) return;
    const csvFilename = `output/Buckets/${bucketName}.csv`;
    let csvContent = 'id,name,club,gender,yob,fit,weight,experience\n';
    bxrs.forEach(boxer => {
      const fit  = boxer.fit ? 'yes' : 'no';
      const name = boxer.name.includes(',') ? `"${boxer.name}"` : boxer.name;
      const club = boxer.club.includes(',') ? `"${boxer.club}"` : boxer.club;
      csvContent += `${boxer.id},${name},${club},${boxer.gender},${boxer.yob},${fit},${boxer.weight},${boxer.experience}\n`;
    });
    fs.writeFileSync(csvFilename, csvContent);
    console.log(`✓ ${csvFilename} (${bxrs.length} boxers)`);
  });

  filter.exportToFile('output/Buckets/tsc-2026-buckets.json');
  filter.exportTreeVisualization('output/Buckets/tsc-2025-tree.txt');

  console.log('\n=== Summary Files ===');
  console.log('✓ output/Buckets/tsc-2026-buckets.json');
  console.log('✓ output/Buckets/tsc-2025-tree.txt');

  console.log('\n=== Verification ===');
  const totalAssigned = Object.values(buckets).reduce((sum, b) => sum + b.length, 0);
  console.log(`✓ Total boxers loaded:      ${boxers.length}`);
  console.log(`✓ Total boxers assigned:    ${totalAssigned}`);
  console.log(`✓ All boxers accounted for: ${totalAssigned === boxers.length ? 'YES' : 'NO'}`);
  console.log(`✓ Total final buckets:      ${Object.keys(buckets).length}`);

  // Guard: no boxer may silently vanish. Find anyone in no bucket and explain
  // exactly which gap swallowed them, so a coverage hole is never invisible.
  const assigned   = new Set(Object.values(buckets).flat());
  const unassigned = boxers.filter(b => !assigned.has(b));

  if (unassigned.length > 0) {
    console.error(`\n!!! GAP: ${unassigned.length} boxer(s) matched NO bucket and were dropped:`);
    unassigned.forEach(b => {
      console.error(`  - ${b.name} (${b.club}, ${b.gender}, YOB ${b.yob}) — ${explainUnassigned(b)}`);
    });
    console.error('Fix the data or add a bucket so every boxer is covered.\n');
  } else {
    console.log('✓ No gaps: every boxer is in a bucket.');
  }

  return filter;
}

if (require.main === module) {
  // parseCSV here expects the CLEAN schema (id,name,club,gender,yob,fit,weight,experience).
  // The raw survey export (data/Registered Boxer2026.csv) uses a different schema and is
  // mapped by Server.js readBoxersCSV — see Boxing.md "raw vs clean CSV schema".
  const csvPath = 'data/RegisteredBoxers2025.csv';

  if (fs.existsSync(csvPath)) {
    runTSCBuckets(csvPath);
  } else {
    console.log(`CSV file not found at ${csvPath}`);
  }
}
/* c8 ignore stop */

module.exports = { runTSCBuckets, parseCSV, tscBucketStructure, explainUnassigned };
