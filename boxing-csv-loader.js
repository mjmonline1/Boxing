/**
 * Boxing Tournament CSV Loader
 * Load boxer data from CSV and apply tournament structure
 */

const fs = require('fs');
const HierarchicalFilter = require('./hierarchical-filter');
const { boxingTreeStructure } = require('./boxing-tournament-filter');

/**
 * Parse CSV file
 */
function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const data = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    
    headers.forEach((header, index) => {
      const value = values[index];
      
      // Special handling for different fields
      if (header === 'id' || header === 'yob' || header === 'experience') {
        obj[header] = parseInt(value);
      } else if (header === 'weightClass') {
        obj[header] = isNaN(value) ? value : parseInt(value);
      } else if (header === 'fit') {
        obj[header] = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
      } else {
        obj[header] = value;
      }
    });
    
    return obj;
  });
  
  return data;
}

/**
 * Load boxing CSV and apply tournament filtering
 */
function loadBoxingTournament(csvPath) {
  console.log('=== Loading Boxing Tournament from CSV ===\n');
  console.log(`Reading data from: ${csvPath}`);
  
  // Load data
  const boxers = parseCSV(csvPath);
  console.log(`Loaded ${boxers.length} boxers\n`);
  
  // Show data preview
  console.log('Sample boxer data:');
  boxers.slice(0, 3).forEach(b => {
    console.log(`  - ${b.name}: ${b.gender}, YOB ${b.yob}, Fit: ${b.fit}, WC: ${b.weightClass}, Exp: ${b.experience}`);
  });
  console.log();
  
  // Apply tournament structure
  const filter = new HierarchicalFilter(boxers);
  
  filter
    .buildTree(boxingTreeStructure)
    .applyFilters()
    .displaySummary();
  
  // Show match assignments by category
  console.log('\n--- Match Assignments by Category ---');
  const buckets = filter.getFinalBuckets();
  
  // Not Fit
  console.log('\n=== NOT FIT ===');
  if (buckets.NotFit && buckets.NotFit.length > 0) {
    console.log(`Total: ${buckets.NotFit.length} boxers`);
    buckets.NotFit.forEach(b => {
      console.log(`  - ${b.name} (${b.gender}, YOB ${b.yob})`);
    });
  } else {
    console.log('No boxers marked as not fit');
  }
  
  // Male matches by age group
  ['Junior', 'Youth', 'Senior'].forEach(ageGroup => {
    const ageMatches = Object.entries(buckets)
      .filter(([name]) => name.includes(ageGroup));
    
    const totalInAge = ageMatches.reduce((sum, [, boxers]) => sum + boxers.length, 0);
    
    console.log(`\n=== MALE ${ageGroup.toUpperCase()} ===`);
    console.log(`Total: ${totalInAge} boxers in ${ageMatches.length} potential matches`);
    
    ['WC1', 'WC2'].forEach(wc => {
      const wcMatches = ageMatches.filter(([name]) => name.includes(wc));
      console.log(`\n  Weight Class ${wc === 'WC1' ? '1' : '2'}:`);
      
      ['EXC1', 'EXC2'].forEach(exc => {
        const excMatches = wcMatches.filter(([name]) => name.includes(exc));
        const expLevel = exc === 'EXC1' ? 'Novice (0-5 bouts)' : 'Experienced (6+ bouts)';
        console.log(`    ${expLevel}:`);
        
        excMatches.forEach(([name, boxers]) => {
          const matchNum = name.includes('Match1') ? '1' : 
                          name.includes('Match2') ? '2' :
                          name.includes('Match3') ? '3' : '4';
          console.log(`      Match ${matchNum}: ${boxers.length} boxers`);
          boxers.forEach(b => {
            console.log(`        - ${b.name} (YOB ${b.yob}, Exp: ${b.experience})`);
          });
        });
      });
    });
  });
  
  // Female matches
  console.log('\n=== FEMALE MATCHES ===');
  const femaleMatches = Object.entries(buckets)
    .filter(([name]) => name.startsWith('Female'));
  
  const totalFemales = femaleMatches.reduce((sum, [, boxers]) => sum + boxers.length, 0);
  console.log(`Total: ${totalFemales} boxers in ${femaleMatches.length} matches`);
  
  femaleMatches.forEach(([name, boxers]) => {
    const matchNum = name.includes('Match1') ? '1' :
                    name.includes('Match2') ? '2' : '3';
    console.log(`\n  Match ${matchNum}: ${boxers.length} boxers`);
    boxers.forEach(b => {
      console.log(`    - ${b.name} (YOB ${b.yob})`);
    });
  });
  
  // Export results
  if (!fs.existsSync('output')) {
    fs.mkdirSync('output');
  }
  filter.exportToFile('output/boxing-csv-results.json');
  filter.exportTreeVisualization('output/boxing-csv-tree.txt');
  
  // Verification
  console.log('\n--- Verification ---');
  const totalAssigned = Object.values(buckets).reduce((sum, b) => sum + b.length, 0);
  console.log(`✓ Total boxers loaded: ${boxers.length}`);
  console.log(`✓ Total boxers assigned: ${totalAssigned}`);
  console.log(`✓ All boxers accounted for: ${totalAssigned === boxers.length ? 'YES' : 'NO'}`);
  
  return filter;
}

// Run if executed directly
if (require.main === module) {
  const csvPath = 'data/boxing-boxers.csv';
  
  if (fs.existsSync(csvPath)) {
    loadBoxingTournament(csvPath);
  } else {
    console.log(`CSV file not found at ${csvPath}`);
    console.log('Please create the CSV file with the following columns:');
    console.log('id,name,gender,yob,fit,weightClass,experience');
  }
}

module.exports = { parseCSV, loadBoxingTournament };
