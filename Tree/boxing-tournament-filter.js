/**
 * Boxing Tournament Hierarchical Filter
 * Based on boxing.mmd structure
 * 
 * Structure:
 * - First filter: Fitness (Not Fit vs Fit boxers)
 * - Second filter: Gender (Male vs Female)
 * - For Males: Age groups (Junior/Youth/Senior based on YOB)
 * - For Males: Weight classes (2 per age group)
 * - For Males: Experience levels (2 per weight class) 
 * - Final: Spar matches (2 per experience level for males, 3 for females)
 * 
 * Total Final Buckets: 15
 * - 1 Not Fit
 * - 3 Female matches
 * - 12 Male matches (4 Junior + 4 Youth + 4 Senior)
 */

const HierarchicalFilter = require('./hierarchical-filter');
const fs = require('fs');

/**
 * Helper function to check if YOB matches a list
 */
function matchesYOB(yob, years) {
  return years.includes(yob);
}

/**
 * Boxing Tournament Tree Structure
 * 15 final buckets total
 */
const boxingTreeStructure = [
  // First branch: Not Fit boxers (final bucket)
  {
    name: 'NotFit',
    rule: (boxer) => boxer.fit === false || boxer.fit === 'no',
    description: 'Boxers who are not fit to compete'
  },
  
  // Second branch: Fit Males
  {
    name: 'FitMales',
    rule: (boxer) => (boxer.fit === true || boxer.fit === 'yes') && 
                     (boxer.gender === 'male' || boxer.gender === 'M'),
    description: 'Fit male boxers',
    children: [
      // Male Junior (YOB 2010-2013)
      {
        name: 'MaleJunior',
        rule: (boxer) => matchesYOB(boxer.yob, [2010, 2011, 2012, 2013]),
        description: 'Male Junior (YOB 2010-2013)',
        children: [
          // Junior Weight Classes
          {
            name: 'MaleJuniorWeightClass1',
            rule: (boxer) => boxer.weightClass === 1 || boxer.weightClass === 'A',
            description: 'Male Junior Weight Class 1',
            children: [
              // Junior WC1 Experience Levels
              {
                name: 'MaleJuniorWC1_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Junior WC1 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleJuniorWC1_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0, // Even distribution
                    description: 'Male Junior WC1 EXC1 - Match 1'
                  },
                  {
                    name: 'MaleJuniorWC1_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Junior WC1 EXC1 - Match 2'
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
                    description: 'Male Junior WC1 EXC2 - Match 3'
                  },
                  {
                    name: 'MaleJuniorWC1_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Junior WC1 EXC2 - Match 4'
                  }
                ]
              }
            ]
          },
          {
            name: 'MaleJuniorWeightClass2',
            rule: (boxer) => boxer.weightClass === 2 || boxer.weightClass === 'B',
            description: 'Male Junior Weight Class 2',
            children: [
              // Junior WC2 Experience Levels
              {
                name: 'MaleJuniorWC2_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Junior WC2 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleJuniorWC2_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Male Junior WC2 EXC1 - Match 1'
                  },
                  {
                    name: 'MaleJuniorWC2_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Junior WC2 EXC1 - Match 2'
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
                    description: 'Male Junior WC2 EXC2 - Match 3'
                  },
                  {
                    name: 'MaleJuniorWC2_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Junior WC2 EXC2 - Match 4'
                  }
                ]
              }
            ]
          }
        ]
      },
      
      // Male Youth (YOB 2008-2009)
      {
        name: 'MaleYouth',
        rule: (boxer) => matchesYOB(boxer.yob, [2008, 2009]),
        description: 'Male Youth (YOB 2008-2009)',
        children: [
          {
            name: 'MaleYouthWeightClass1',
            rule: (boxer) => boxer.weightClass === 1 || boxer.weightClass === 'A',
            description: 'Male Youth Weight Class 1',
            children: [
              {
                name: 'MaleYouthWC1_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Youth WC1 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleYouthWC1_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Male Youth WC1 EXC1 - Match 1'
                  },
                  {
                    name: 'MaleYouthWC1_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Youth WC1 EXC1 - Match 2'
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
                    description: 'Male Youth WC1 EXC2 - Match 3'
                  },
                  {
                    name: 'MaleYouthWC1_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Youth WC1 EXC2 - Match 4'
                  }
                ]
              }
            ]
          },
          {
            name: 'MaleYouthWeightClass2',
            rule: (boxer) => boxer.weightClass === 2 || boxer.weightClass === 'B',
            description: 'Male Youth Weight Class 2',
            children: [
              {
                name: 'MaleYouthWC2_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Youth WC2 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleYouthWC2_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Male Youth WC2 EXC1 - Match 1'
                  },
                  {
                    name: 'MaleYouthWC2_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Youth WC2 EXC1 - Match 2'
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
                    description: 'Male Youth WC2 EXC2 - Match 3'
                  },
                  {
                    name: 'MaleYouthWC2_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Youth WC2 EXC2 - Match 4'
                  }
                ]
              }
            ]
          }
        ]
      },
      
      // Male Senior (YOB 2007)
      {
        name: 'MaleSenior',
        rule: (boxer) => boxer.yob === 2007,
        description: 'Male Senior (YOB 2007)',
        children: [
          {
            name: 'MaleSeniorWeightClass1',
            rule: (boxer) => boxer.weightClass === 1 || boxer.weightClass === 'A',
            description: 'Male Senior Weight Class 1',
            children: [
              {
                name: 'MaleSeniorWC1_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Senior WC1 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleSeniorWC1_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Male Senior WC1 EXC1 - Match 1'
                  },
                  {
                    name: 'MaleSeniorWC1_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Senior WC1 EXC1 - Match 2'
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
                    description: 'Male Senior WC1 EXC2 - Match 3'
                  },
                  {
                    name: 'MaleSeniorWC1_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Senior WC1 EXC2 - Match 4'
                  }
                ]
              }
            ]
          },
          {
            name: 'MaleSeniorWeightClass2',
            rule: (boxer) => boxer.weightClass === 2 || boxer.weightClass === 'B',
            description: 'Male Senior Weight Class 2',
            children: [
              {
                name: 'MaleSeniorWC2_EXC1',
                rule: (boxer) => boxer.experience <= 5,
                description: 'Male Senior WC2 - Novice (0-5 bouts)',
                children: [
                  {
                    name: 'MaleSeniorWC2_EXC1_Match1',
                    rule: (boxer) => (boxer.id % 2) === 0,
                    description: 'Male Senior WC2 EXC1 - Match 1'
                  },
                  {
                    name: 'MaleSeniorWC2_EXC1_Match2',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Senior WC2 EXC1 - Match 2'
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
                    description: 'Male Senior WC2 EXC2 - Match 3'
                  },
                  {
                    name: 'MaleSeniorWC2_EXC2_Match4',
                    rule: (boxer) => (boxer.id % 2) === 1,
                    description: 'Male Senior WC2 EXC2 - Match 4'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  
  // Third branch: Fit Females (3 matches)
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

// Sample boxing dataset
const boxers = [
  // Not Fit boxers
  { id: 1, name: 'John Smith', gender: 'male', yob: 2010, fit: false, weightClass: 1, experience: 3 },
  
  // Male Junior (YOB 2010-2013)
  { id: 2, name: 'Mike Johnson', gender: 'male', yob: 2010, fit: true, weightClass: 1, experience: 3 },
  { id: 3, name: 'Tom Brown', gender: 'male', yob: 2011, fit: true, weightClass: 1, experience: 7 },
  { id: 4, name: 'Jake Wilson', gender: 'male', yob: 2012, fit: true, weightClass: 2, experience: 2 },
  { id: 5, name: 'Sam Davis', gender: 'male', yob: 2013, fit: true, weightClass: 2, experience: 8 },
  
  // Male Youth (YOB 2008-2009)
  { id: 6, name: 'Chris Taylor', gender: 'male', yob: 2008, fit: true, weightClass: 1, experience: 4 },
  { id: 7, name: 'Ryan Miller', gender: 'male', yob: 2009, fit: true, weightClass: 1, experience: 10 },
  { id: 8, name: 'Alex Garcia', gender: 'male', yob: 2008, fit: true, weightClass: 2, experience: 5 },
  { id: 9, name: 'Ben Martinez', gender: 'male', yob: 2009, fit: true, weightClass: 2, experience: 12 },
  
  // Male Senior (YOB 2007)
  { id: 10, name: 'David Lee', gender: 'male', yob: 2007, fit: true, weightClass: 1, experience: 3 },
  { id: 11, name: 'Kevin White', gender: 'male', yob: 2007, fit: true, weightClass: 1, experience: 9 },
  { id: 12, name: 'Mark Harris', gender: 'male', yob: 2007, fit: true, weightClass: 2, experience: 4 },
  { id: 13, name: 'Paul Clark', gender: 'male', yob: 2007, fit: true, weightClass: 2, experience: 15 },
  
  // Females
  { id: 14, name: 'Sarah Jones', gender: 'female', yob: 2008, fit: true, weightClass: 1, experience: 5 },
  { id: 15, name: 'Emily Davis', gender: 'female', yob: 2010, fit: true, weightClass: 1, experience: 3 },
  { id: 16, name: 'Lisa Wilson', gender: 'female', yob: 2007, fit: true, weightClass: 2, experience: 8 },
];

console.log('=== Boxing Tournament Hierarchical Filter ===\n');
console.log('Tournament Structure:');
console.log('├── Not Fit (1 bucket)');
console.log('├── Males (12 buckets)');
console.log('│   ├── Junior (YOB 2010-2013) - 4 matches');
console.log('│   ├── Youth (YOB 2008-2009) - 4 matches');
console.log('│   └── Senior (YOB 2007) - 4 matches');
console.log('└── Females (3 buckets)');
console.log('\nTotal Final Buckets: 16 (1 NotFit + 12 Male + 3 Female)\n');

const filter = new HierarchicalFilter(boxers);

filter
  .buildTree(boxingTreeStructure)
  .applyFilters()
  .displaySummary()
  .displayTree();

// Show detailed match assignments
console.log('\n--- Detailed Match Assignments ---');
const buckets = filter.getFinalBuckets();

// Group by category for better display
const notFit = {};
const maleMatches = {};
const femaleMatches = {};

Object.entries(buckets).forEach(([name, boxers]) => {
  if (name === 'NotFit') {
    notFit[name] = boxers;
  } else if (name.startsWith('Female')) {
    femaleMatches[name] = boxers;
  } else {
    maleMatches[name] = boxers;
  }
});

console.log('\n=== NOT FIT ===');
Object.entries(notFit).forEach(([name, boxers]) => {
  console.log(`\n${name} (${boxers.length} boxers):`);
  boxers.forEach(b => {
    console.log(`  - ${b.name} (YOB: ${b.yob}, Gender: ${b.gender})`);
  });
});

console.log('\n=== MALE MATCHES ===');
['Junior', 'Youth', 'Senior'].forEach(ageGroup => {
  console.log(`\n${ageGroup}:`);
  Object.entries(maleMatches)
    .filter(([name]) => name.includes(ageGroup))
    .forEach(([name, boxers]) => {
      console.log(`  ${name} (${boxers.length} boxers):`);
      boxers.forEach(b => {
        console.log(`    - ${b.name} (YOB: ${b.yob}, WC: ${b.weightClass}, Exp: ${b.experience})`);
      });
    });
});

console.log('\n=== FEMALE MATCHES ===');
Object.entries(femaleMatches).forEach(([name, boxers]) => {
  console.log(`\n${name} (${boxers.length} boxers):`);
  boxers.forEach(b => {
    console.log(`  - ${b.name} (YOB: ${b.yob})`);
  });
});

// Export results
if (!fs.existsSync('output')) {
  fs.mkdirSync('output');
}
filter.exportToFile('output/boxing-tournament-results.json');
filter.exportTreeVisualization('output/boxing-tournament-tree.txt');

// Verification
console.log('\n--- Verification ---');
const totalFinal = Object.values(buckets).reduce((sum, b) => sum + b.length, 0);
console.log(`✓ Total boxers: ${boxers.length}`);
console.log(`✓ Boxers in matches: ${totalFinal}`);
console.log(`✓ Number of final buckets: ${Object.keys(buckets).length}`);
console.log(`✓ All boxers assigned: ${totalFinal === boxers.length ? 'YES' : 'NO'}`);

module.exports = { boxingTreeStructure };
