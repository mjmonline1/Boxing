/**
 * Hierarchical CSV Filter
 * Load CSV data and apply tree-based filtering
 */

const fs = require('fs');
const HierarchicalFilter = require('./hierarchical-filter');

/**
 * Simple CSV parser
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
      // Try to parse as number, otherwise keep as string
      obj[header] = isNaN(value) ? value : parseFloat(value);
    });
    
    return obj;
  });
  
  return data;
}

/**
 * Load CSV and apply hierarchical filtering
 */
function filterCSVHierarchically(csvPath, treeStructure) {
  console.log(`Loading data from ${csvPath}...`);
  
  const dataset = parseCSV(csvPath);
  console.log(`Loaded ${dataset.length} records\n`);
  
  const filter = new HierarchicalFilter(dataset);
  
  filter
    .buildTree(treeStructure)
    .applyFilters()
    .displaySummary()
    .displayTree();
  
  return filter;
}

// Example usage
if (require.main === module) {
  // Define tree structure for CSV data
  const treeStructure = [
    {
      name: 'highPerformers',
      rule: (item) => item.score >= 80,
      description: 'High performers (score >= 80)',
      children: [
        {
          name: 'bucket1_high_engineering',
          rule: (item) => item.department === 'Engineering',
          description: 'High performers in Engineering'
        },
        {
          name: 'bucket2_high_sales',
          rule: (item) => item.department === 'Sales',
          description: 'High performers in Sales'
        },
        {
          name: 'bucket3_high_marketing',
          rule: (item) => item.department === 'Marketing',
          description: 'High performers in Marketing'
        }
      ]
    },
    {
      name: 'standardPerformers',
      rule: (item) => item.score < 80,
      description: 'Standard performers (score < 80)',
      children: [
        {
          name: 'bucket4_standard_engineering',
          rule: (item) => item.department === 'Engineering',
          description: 'Standard performers in Engineering'
        },
        {
          name: 'bucket5_standard_sales',
          rule: (item) => item.department === 'Sales',
          description: 'Standard performers in Sales'
        },
        {
          name: 'bucket6_standard_marketing',
          rule: (item) => item.department === 'Marketing',
          description: 'Standard performers in Marketing'
        }
      ]
    }
  ];

  const csvPath = 'data/sample-data.csv';
  
  if (fs.existsSync(csvPath)) {
    const filter = filterCSVHierarchically(csvPath, treeStructure);
    
    // Show details
    console.log('\n--- Detailed Results ---');
    const buckets = filter.getFinalBuckets();
    Object.entries(buckets).forEach(([name, items]) => {
      console.log(`\n${name} (${items.length} items):`);
      items.forEach(item => {
        console.log(`  - ${item.name} (score: ${item.score}, dept: ${item.department})`);
      });
    });
    
    // Export
    if (!fs.existsSync('output')) {
      fs.mkdirSync('output');
    }
    filter.exportToFile('output/csv-hierarchical-results.json');
    filter.exportTreeVisualization('output/csv-tree-structure.txt');
  } else {
    console.log(`CSV file not found at ${csvPath}`);
    console.log('Please ensure the CSV file exists');
  }
}

module.exports = { parseCSV, filterCSVHierarchically };
