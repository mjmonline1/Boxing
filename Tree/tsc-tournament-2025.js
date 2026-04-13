/**
 * TSC 2025 Boxing Tournament Filter
 * Uses real weight-based classifications
 */

const HierarchicalFilter = require('./hierarchical-filter');
const fs = require('fs');

/**
 * Weight class assignment based on actual weight
 * This creates two roughly equal groups per age category
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
 * Helper function to check if YOB matches a list
 */
function matchesYOB(yob, years) {
  return years.includes(yob);
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
 * TSC Tournament Tree Structure
 */
const tscTournamentStructure = [
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
            name: 'MaleJuniorWeightClass1',
            rule: (boxer) => boxer.weightClass === 1,
            description: 'Male Junior Weight Class 1 (Lighter division)',
            children: [
              {
                name: 'MaleJuniorWC1_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Junior WC1 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleJuniorWC1_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 1'
                  },
                  {
                    name: 'MaleJuniorWC1_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 2'
                  }
                ]
              },
              {
                name: 'MaleJuniorWC1_EXC2',
                rule: (boxer) => boxer.experience > 5,
                description: 'Male Junior WC1 - Experienced (6+ bouts)',
                children: [
                  {
                    name: 'MaleJuniorWC1_EXC2_Match3',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 3'
                  },
                  {
                    name: 'MaleJuniorWC1_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 4'
                  }
                ]
              }
            ]
          },
          // Junior Weight Class 2 (Heavier)
          {
            name: 'MaleJuniorWeightClass2',
            rule: (boxer) => boxer.weightClass === 2,
            description: 'Male Junior Weight Class 2 (Heavier division)',
            children: [
              {
                name: 'MaleJuniorWC2_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Junior WC2 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleJuniorWC2_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 1'
                  },
                  {
                    name: 'MaleJuniorWC2_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 2'
                  }
                ]
              },
              {
                name: 'MaleJuniorWC2_EXC2',
                rule: (boxer) => boxer.experience > 5,
                description: 'Male Junior WC2 - Experienced (6+ bouts)',
                children: [
                  {
                    name: 'MaleJuniorWC2_EXC2_Match3',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 3'
                  },
                  {
                    name: 'MaleJuniorWC2_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 4'
                  }
                ]
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
            name: 'MaleYouthWeightClass1',
            rule: (boxer) => boxer.weightClass === 1,
            description: 'Male Youth Weight Class 1 (Lighter division)',
            children: [
              {
                name: 'MaleYouthWC1_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Youth WC1 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleYouthWC1_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 1'
                  },
                  {
                    name: 'MaleYouthWC1_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 2'
                  }
                ]
              },
              {
                name: 'MaleYouthWC1_EXC2',
                rule: (boxer) => boxer.experience > 5,
                description: 'Male Youth WC1 - Experienced (6+ bouts)',
                children: [
                  {
                    name: 'MaleYouthWC1_EXC2_Match3',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 3'
                  },
                  {
                    name: 'MaleYouthWC1_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 4'
                  }
                ]
              }
            ]
          },
          {
            name: 'MaleYouthWeightClass2',
            rule: (boxer) => boxer.weightClass === 2,
            description: 'Male Youth Weight Class 2 (Heavier division)',
            children: [
              {
                name: 'MaleYouthWC2_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Youth WC2 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleYouthWC2_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 1'
                  },
                  {
                    name: 'MaleYouthWC2_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 2'
                  }
                ]
              },
              {
                name: 'MaleYouthWC2_EXC2',
                rule: (boxer) => boxer.experience > 5,
                description: 'Male Youth WC2 - Experienced (6+ bouts)',
                children: [
                  {
                    name: 'MaleYouthWC2_EXC2_Match3',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 3'
                  },
                  {
                    name: 'MaleYouthWC2_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 4'
                  }
                ]
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
            name: 'MaleSeniorWeightClass1',
            rule: (boxer) => boxer.weightClass === 1,
            description: 'Male Senior Weight Class 1 (Lighter division)',
            children: [
              {
                name: 'MaleSeniorWC1_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Senior WC1 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleSeniorWC1_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 1'
                  },
                  {
                    name: 'MaleSeniorWC1_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 2'
                  }
                ]
              },
              {
                name: 'MaleSeniorWC1_EXC2',
                rule: (boxer) => boxer.experience > 5,
                description: 'Male Senior WC1 - Experienced (6+ bouts)',
                children: [
                  {
                    name: 'MaleSeniorWC1_EXC2_Match3',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 3'
                  },
                  {
                    name: 'MaleSeniorWC1_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 4'
                  }
                ]
              }
            ]
          },
          {
            name: 'MaleSeniorWeightClass2',
            rule: (boxer) => boxer.weightClass === 2,
            description: 'Male Senior Weight Class 2 (Heavier division)',
            children: [
              {
                name: 'MaleSeniorWC2_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Senior WC2 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleSeniorWC2_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 1'
                  },
                  {
                    name: 'MaleSeniorWC2_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 2'
                  }
                ]
              },
              {
                name: 'MaleSeniorWC2_EXC2',
                rule: (boxer) => boxer.experience > 5,
                description: 'Male Senior WC2 - Experienced (6+ bouts)',
                children: [
                  {
                    name: 'MaleSeniorWC2_EXC2_Match3',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Match 3'
                  },
                  {
                    name: 'MaleSeniorWC2_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Match 4'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  
  // Fit Females - simpler structure due to smaller numbers
  {
    name: 'FitFemales',
    rule: (boxer) => (boxer.fit === true || boxer.fit === 'yes') && 
                     (boxer.gender === 'female' || boxer.gender === 'F'),
    description: 'Fit female boxers',
    children: [
      {
        name: 'FemaleSparMatch1',
        rule: (boxer) => (boxer.id % 3) === 0,
        description: 'Female Spar Match 1'
      },
      {
        name: 'FemaleSparMatch2',
        rule: (boxer) => (boxer.id % 3) === 1,
        description: 'Female Spar Match 2'
      },
      {
        name: 'FemaleSparMatch3',
        rule: (boxer) => (boxer.id % 3) === 2,
        description: 'Female Spar Match 3'
      }
    ]
  }
];

/**
 * Load and process TSC tournament data
 */
function runTSCTournament(csvPath) {
  console.log('=== TSC 2025 Boxing Tournament ===\n');
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
    .buildTree(tscTournamentStructure)
    .applyFilters()
    .displaySummary();
  
  // Show detailed match assignments
  console.log('\n=== Match Assignments ===');
  const buckets = filter.getFinalBuckets();
  
  // Group by category
  ['Junior', 'Youth', 'Senior'].forEach(ageGroup => {
    const ageMatches = Object.entries(buckets)
      .filter(([name]) => name.includes(ageGroup) && name.includes('Male'));
    
    if (ageMatches.length === 0) return;
    
    const totalInAge = ageMatches.reduce((sum, [, boxers]) => sum + boxers.length, 0);
    
    console.log(`\n=== MALE ${ageGroup.toUpperCase()} (${totalInAge} boxers) ===`);
    
    ['WC1', 'WC2'].forEach(wc => {
      const wcMatches = ageMatches.filter(([name]) => name.includes(wc));
      const wcTotal = wcMatches.reduce((sum, [, boxers]) => sum + boxers.length, 0);
      
      console.log(`\n  Weight Class ${wc === 'WC1' ? '1 (Lighter)' : '2 (Heavier)'} - ${wcTotal} boxers:`);
      
      ['EXC1', 'EXC2'].forEach(exc => {
        const excMatches = wcMatches.filter(([name]) => name.includes(exc));
        const expLevel = exc === 'EXC1' ? 'Novice (0-5 bouts)' : 'Experienced (6+ bouts)';
        
        const excTotal = excMatches.reduce((sum, [, boxers]) => sum + boxers.length, 0);
        console.log(`    ${expLevel} - ${excTotal} boxers:`);
        
        excMatches.forEach(([name, boxers]) => {
          const matchNum = name.includes('Match1') ? '1' : 
                          name.includes('Match2') ? '2' :
                          name.includes('Match3') ? '3' : '4';
          
          if (boxers.length > 0) {
            console.log(`      Match ${matchNum}: ${boxers.length} boxers`);
            boxers.forEach(b => {
              console.log(`        - ${b.name} (${b.club}, ${b.weight}kg, ${b.experience} bouts)`);
            });
          }
        });
      });
    });
  });
  
  // Female matches
  const femaleMatches = Object.entries(buckets)
    .filter(([name]) => name.startsWith('Female'));
  
  if (femaleMatches.length > 0) {
    const totalFemales = femaleMatches.reduce((sum, [, boxers]) => sum + boxers.length, 0);
    console.log(`\n=== FEMALE MATCHES (${totalFemales} boxers) ===`);
    
    femaleMatches.forEach(([name, boxers]) => {
      const matchNum = name.includes('Match1') ? '1' :
                      name.includes('Match2') ? '2' : '3';
      
      if (boxers.length > 0) {
        console.log(`\n  Match ${matchNum}: ${boxers.length} boxers`);
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
  filter.exportToFile('output/tsc-2025-tournament-results.json');
  filter.exportTreeVisualization('output/tsc-2025-tournament-tree.txt');
  
  console.log('\n=== Files Created ===');
  console.log('✓ output/tsc-2025-tournament-results.json');
  console.log('✓ output/tsc-2025-tournament-tree.txt');
  
  // Verification
  console.log('\n=== Verification ===');
  const totalAssigned = Object.values(buckets).reduce((sum, b) => sum + b.length, 0);
  console.log(`✓ Total boxers loaded: ${boxers.length}`);
  console.log(`✓ Total boxers assigned: ${totalAssigned}`);
  console.log(`✓ All boxers accounted for: ${totalAssigned === boxers.length ? 'YES' : 'NO'}`);
  
  return filter;
}

// Run if executed directly
if (require.main === module) {
  const csvPath = 'data/tsc-boxers-2025.csv';
  
  if (fs.existsSync(csvPath)) {
    runTSCTournament(csvPath);
  } else {
    console.log(`CSV file not found at ${csvPath}`);
    console.log('Please run: node parse-tsc-data.js first');
  }
}

module.exports = { runTSCTournament, parseCSV, tscTournamentStructure };
