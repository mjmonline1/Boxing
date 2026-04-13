/**
 * TSC 2025 Boxing Tournament Filter - Bucket Assignment Only
 * Assigns boxers to categories WITHOUT spar matching
 */

const HierarchicalFilter = require('./hierarchical-filter');
const fs = require('fs');

/**
 * Weight class assignment based on actual weight
 */
function getWeightClass(boxer) {
  const weight = boxer.weight;
  
  // Different weight divisions for different age groups
  if (boxer.yob >= 2009) {
    // Male Juniors - split around median weight
    return weight < 60 ? 1 : 2;
  } else if (boxer.yob === 2007 || boxer.yob === 2008) {
    // Male Youth - split around median weight
    return weight < 70 ? 1 : 2;
  } else {
    // Male Seniors - split around median weight
    return weight < 70 ? 1 : 2;
  }
}

/**
 * Parse CSV file
 */
function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const data = lines.slice(1).map(line => {
    // Handle quoted fields (names/clubs with commas)
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
    
    // Assign weight class dynamically
    obj.weightClass = getWeightClass(obj);
    
    return obj;
  });
  
  return data;
}

/**
 * TSC Tournament Tree Structure - STOPS AT EXPERIENCE BUCKETS
 * No match assignments, just categorization
 */
const tscBucketStructure = [
  // Not Fit boxers
  {
    name: 'NotFit',
    rule: (boxer) => boxer.fit === false || boxer.fit === 'no',
    description: 'Boxers who are not fit to compete'
  },
  
  // Fit Males
  {
    name: 'FitMales',
    rule: (boxer) => (boxer.fit === true || boxer.fit === 'yes') && 
                     (boxer.gender === 'male' || boxer.gender === 'M'),
    description: 'Fit male boxers',
    children: [
      // Male Junior (YOB 2009+)
      {
        name: 'MaleJunior',
        rule: (boxer) => boxer.yob >= 2009,
        description: 'Male Junior (YOB 2009 & younger)',
        children: [
          // Junior Weight Class 1 (Lighter)
          {
            name: 'MaleJunior_WC1',
            rule: (boxer) => boxer.weightClass === 1,
            description: 'Male Junior Weight Class 1 (Lighter)',
            children: [
              {
                name: 'MaleJunior_WC1_Novice',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Novice (0-5 bouts)'
              },
              {
                name: 'MaleJunior_WC1_Experienced',
                rule: (boxer) => boxer.experience > 5,
                description: 'Experienced (6+ bouts)'
              }
            ]
          },
          // Junior Weight Class 2 (Heavier)
          {
            name: 'MaleJunior_WC2',
            rule: (boxer) => boxer.weightClass === 2,
            description: 'Male Junior Weight Class 2 (Heavier)',
            children: [
              {
                name: 'MaleJunior_WC2_Novice',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Novice (0-5 bouts)'
              },
              {
                name: 'MaleJunior_WC2_Experienced',
                rule: (boxer) => boxer.experience > 5,
                description: 'Experienced (6+ bouts)'
              }
            ]
          }
        ]
      },
      
      // Male Youth (YOB 2007-2008)
      {
        name: 'MaleYouth',
        rule: (boxer) => boxer.yob === 2007 || boxer.yob === 2008,
        description: 'Male Youth (YOB 2007 & 2008)',
        children: [
          {
            name: 'MaleYouth_WC1',
            rule: (boxer) => boxer.weightClass === 1,
            description: 'Male Youth Weight Class 1 (Lighter)',
            children: [
              {
                name: 'MaleYouth_WC1_Novice',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Novice (0-5 bouts)'
              },
              {
                name: 'MaleYouth_WC1_Experienced',
                rule: (boxer) => boxer.experience > 5,
                description: 'Experienced (6+ bouts)'
              }
            ]
          },
          {
            name: 'MaleYouth_WC2',
            rule: (boxer) => boxer.weightClass === 2,
            description: 'Male Youth Weight Class 2 (Heavier)',
            children: [
              {
                name: 'MaleYouth_WC2_Novice',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Novice (0-5 bouts)'
              },
              {
                name: 'MaleYouth_WC2_Experienced',
                rule: (boxer) => boxer.experience > 5,
                description: 'Experienced (6+ bouts)'
              }
            ]
          }
        ]
      },
      
      // Male Senior (YOB 2006 & older)
      {
        name: 'MaleSenior',
        rule: (boxer) => boxer.yob <= 2006,
        description: 'Male Senior (YOB 2006 & older)',
        children: [
          {
            name: 'MaleSenior_WC1',
            rule: (boxer) => boxer.weightClass === 1,
            description: 'Male Senior Weight Class 1 (Lighter)',
            children: [
              {
                name: 'MaleSenior_WC1_Novice',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Novice (0-5 bouts)'
              },
              {
                name: 'MaleSenior_WC1_Experienced',
                rule: (boxer) => boxer.experience > 5,
                description: 'Experienced (6+ bouts)'
              }
            ]
          },
          {
            name: 'MaleSenior_WC2',
            rule: (boxer) => boxer.weightClass === 2,
            description: 'Male Senior Weight Class 2 (Heavier)',
            children: [
              {
                name: 'MaleSenior_WC2_Novice',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Novice (0-5 bouts)'
              },
              {
                name: 'MaleSenior_WC2_Experienced',
                rule: (boxer) => boxer.experience > 5,
                description: 'Experienced (6+ bouts)'
              }
            ]
          }
        ]
      }
    ]
  },
  
  // Fit Females - simple grouping by age
  {
    name: 'FitFemales',
    rule: (boxer) => (boxer.fit === true || boxer.fit === 'yes') && 
                     (boxer.gender === 'female' || boxer.gender === 'F'),
    description: 'Fit female boxers',
    children: [
      {
        name: 'Female_Junior',
        rule: (boxer) => boxer.yob >= 2009,
        description: 'Female Junior (2009 & younger)'
      },
      {
        name: 'Female_Youth',
        rule: (boxer) => boxer.yob === 2007 || boxer.yob === 2008,
        description: 'Female Youth (2007 & 2008)'
      },
      {
        name: 'Female_Senior',
        rule: (boxer) => boxer.yob <= 2006,
        description: 'Female Senior (2006 & older)'
      }
    ]
  }
];

/**
 * Load and process TSC tournament data
 */
function runTSCBuckets(csvPath) {
  console.log('=== TSC 2025 Boxing Tournament - Bucket Assignment ===\n');
  console.log(`Loading data from: ${csvPath}`);
  
  // Load data
  const boxers = parseCSV(csvPath);
  console.log(`✓ Loaded ${boxers.length} boxers\n`);
  
  // Show statistics
  const maleBoxers = boxers.filter(b => b.gender === 'male');
  const femaleBoxers = boxers.filter(b => b.gender === 'female');
  
  console.log('Boxer Statistics:');
  console.log(`  Males: ${maleBoxers.length}`);
  console.log(`    - Juniors (2009+): ${maleBoxers.filter(b => b.yob >= 2009).length}`);
  console.log(`    - Youth (2007-2008): ${maleBoxers.filter(b => b.yob === 2007 || b.yob === 2008).length}`);
  console.log(`    - Seniors (2006-): ${maleBoxers.filter(b => b.yob <= 2006).length}`);
  console.log(`  Females: ${femaleBoxers.length}\n`);
  
  // Apply tournament structure
  const filter = new HierarchicalFilter(boxers);
  
  filter
    .buildTree(tscBucketStructure)
    .applyFilters()
    .displaySummary();
  
  // Show detailed bucket assignments
  console.log('\n=== Bucket Assignments ===');
  const buckets = filter.getFinalBuckets();
  
  // Not Fit boxers
  if (buckets.NotFit && buckets.NotFit.length > 0) {
    console.log(`\n=== NOT FIT (${buckets.NotFit.length} boxers) ===\n`);
    buckets.NotFit.forEach(b => {
      console.log(`  - ${b.name} (${b.club}, ${b.weight}kg, ${b.experience} bouts)`);
    });
  }
  
  // Male categories
  ['Junior', 'Youth', 'Senior'].forEach(ageGroup => {
    const ageBuckets = Object.entries(buckets)
      .filter(([name]) => name.includes(ageGroup) && name.startsWith('Male'));
    
    if (ageBuckets.length === 0) return;
    
    const totalInAge = ageBuckets.reduce((sum, [, boxers]) => sum + boxers.length, 0);
    
    console.log(`\n=== MALE ${ageGroup.toUpperCase()} (${totalInAge} boxers) ===`);
    
    ['WC1', 'WC2'].forEach(wc => {
      const wcBuckets = ageBuckets.filter(([name]) => name.includes(wc));
      const wcTotal = wcBuckets.reduce((sum, [, boxers]) => sum + boxers.length, 0);
      
      if (wcTotal === 0) return;
      
      console.log(`\n  Weight Class ${wc === 'WC1' ? '1 (Lighter)' : '2 (Heavier)'} - ${wcTotal} boxers:`);
      
      wcBuckets.forEach(([name, boxers]) => {
        const isNovice = name.includes('Novice');
        const expLevel = isNovice ? 'Novice (0-5 bouts)' : 'Experienced (6+ bouts)';
        
        console.log(`\n    ${expLevel} - ${boxers.length} boxers:`);
        boxers.forEach(b => {
          console.log(`      - ${b.name} (${b.club}, ${b.weight}kg, ${b.experience} bouts)`);
        });
      });
    });
  });
  
  // Female categories
  const femaleBuckets = Object.entries(buckets)
    .filter(([name]) => name.startsWith('Female'));
  
  if (femaleBuckets.length > 0) {
    const totalFemales = femaleBuckets.reduce((sum, [, boxers]) => sum + boxers.length, 0);
    console.log(`\n=== FEMALES (${totalFemales} boxers) ===`);
    
    femaleBuckets.forEach(([name, boxers]) => {
      const ageGroup = name.includes('Junior') ? 'Junior' :
                       name.includes('Youth') ? 'Youth' : 'Senior';
      
      if (boxers.length > 0) {
        console.log(`\n  ${ageGroup} - ${boxers.length} boxers:`);
        boxers.forEach(b => {
          console.log(`    - ${b.name} (${b.club}, ${b.weight}kg, ${b.experience} bouts)`);
        });
      }
    });
  }
  
  // Export results
  if (!fs.existsSync('output')) {
    fs.mkdirSync('output');
  }
  
  // Export each bucket as a separate CSV file
  console.log('\n=== Exporting CSV Files ===');
  Object.entries(buckets).forEach(([bucketName, boxers]) => {
    if (boxers.length > 0) {
      const csvFilename = `output/${bucketName}.csv`;
      
      // Create CSV content
      let csvContent = 'id,name,club,gender,yob,fit,weight,experience,weightClass\n';
      boxers.forEach(boxer => {
        const fit = boxer.fit ? 'yes' : 'no';
        const name = boxer.name.includes(',') ? `"${boxer.name}"` : boxer.name;
        const club = boxer.club.includes(',') ? `"${boxer.club}"` : boxer.club;
        
        csvContent += `${boxer.id},${name},${club},${boxer.gender},${boxer.yob},${fit},${boxer.weight},${boxer.experience},${boxer.weightClass}\n`;
      });
      
      fs.writeFileSync(csvFilename, csvContent);
      console.log(`✓ ${csvFilename} (${boxers.length} boxers)`);
    }
  });
  
  filter.exportToFile('output/tsc-2025-buckets.json');
  filter.exportTreeVisualization('output/tsc-2025-tree.txt');
  
  console.log('\n=== Summary Files ===');
  console.log('✓ output/tsc-2025-buckets.json');
  console.log('✓ output/tsc-2025-tree.txt');
  
  // Verification
  console.log('\n=== Verification ===');
  const totalAssigned = Object.values(buckets).reduce((sum, b) => sum + b.length, 0);
  console.log(`✓ Total boxers loaded: ${boxers.length}`);
  console.log(`✓ Total boxers assigned: ${totalAssigned}`);
  console.log(`✓ All boxers accounted for: ${totalAssigned === boxers.length ? 'YES' : 'NO'}`);
  
  console.log(`\n✓ Total final buckets: ${Object.keys(buckets).length}`);
  console.log('  (12 male buckets + 3 female buckets = 15 total)');
  
  return filter;
}

// Run if executed directly
if (require.main === module) {
  const csvPath = 'data/tsc-boxers-2025.csv';
  
  if (fs.existsSync(csvPath)) {
    runTSCBuckets(csvPath);
  } else {
    console.log(`CSV file not found at ${csvPath}`);
    console.log('Please run: node parse-tsc-data.js first');
  }
}

module.exports = { runTSCBuckets, parseCSV, tscBucketStructure };
