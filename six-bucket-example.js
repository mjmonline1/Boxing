/**
 * Simple 6-Bucket Hierarchical Filter Example
 */

const HierarchicalFilter = require('./hierarchical-filter');
const fs = require('fs');

// Sample dataset
const dataset = [
  { id: 1, name: 'Alice', age: 28, gender: 'female', score: 85, department: 'Engineering' },
  { id: 2, name: 'Bob', age: 35, gender: 'male', score: 72, department: 'Sales' },
  { id: 3, name: 'Charlie', age: 42, gender: 'male', score: 91, department: 'Engineering' },
  { id: 4, name: 'Diana', age: 31, gender: 'female', score: 68, department: 'Marketing' },
  { id: 5, name: 'Eve', age: 26, gender: 'female', score: 95, department: 'Engineering' },
  { id: 6, name: 'Frank', age: 39, gender: 'male', score: 78, department: 'Sales' },
  { id: 7, name: 'Grace', age: 29, gender: 'female', score: 88, department: 'Marketing' },
  { id: 8, name: 'Henry', age: 45, gender: 'male', score: 65, department: 'Sales' },
  { id: 9, name: 'Iris', age: 33, gender: 'female', score: 92, department: 'Engineering' },
  { id: 10, name: 'Jack', age: 27, gender: 'male', score: 81, department: 'Marketing' },
  { id: 11, name: 'Karen', age: 50, gender: 'female', score: 70, department: 'Sales' },
  { id: 12, name: 'Leo', age: 24, gender: 'male', score: 88, department: 'Engineering' },
];

/**
 * Tree Structure with 6 Final Buckets:
 * 
 * Root
 * ├── High Performers (score >= 80)
 * │   ├── Engineering -> BUCKET 1
 * │   ├── Sales -> BUCKET 2
 * │   └── Marketing -> BUCKET 3
 * └── Standard Performers (score < 80)
 *     ├── Engineering -> BUCKET 4
 *     ├── Sales -> BUCKET 5
 *     └── Marketing -> BUCKET 6
 */

const sixBucketStructure = [
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

console.log('=== 6-Bucket Hierarchical Filter Example ===\n');
console.log('Tree Structure:');
console.log('Root (all employees)');
console.log('├── High Performers (score >= 80)');
console.log('│   ├── Bucket 1: High Engineering');
console.log('│   ├── Bucket 2: High Sales');
console.log('│   └── Bucket 3: High Marketing');
console.log('└── Standard Performers (score < 80)');
console.log('    ├── Bucket 4: Standard Engineering');
console.log('    ├── Bucket 5: Standard Sales');
console.log('    └── Bucket 6: Standard Marketing');

const filter = new HierarchicalFilter(dataset);

filter
  .buildTree(sixBucketStructure)
  .applyFilters()
  .displaySummary()
  .displayTree();

// Show detailed contents
console.log('\n--- Detailed Bucket Contents ---');
const buckets = filter.getFinalBuckets();

Object.entries(buckets).forEach(([bucketName, items]) => {
  console.log(`\n${bucketName} (${items.length} items):`);
  items.forEach(item => {
    console.log(`  - ${item.name} (age: ${item.age}, score: ${item.score}, dept: ${item.department})`);
  });
});

// Export
if (!fs.existsSync('output')) {
  fs.mkdirSync('output');
}
filter.exportToFile('output/six-bucket-results.json');
filter.exportTreeVisualization('output/six-bucket-tree.txt');

// Verify
console.log('\n--- Verification ---');
const allBuckets = filter.getFinalBuckets();
const totalInBuckets = Object.values(allBuckets).reduce((sum, bucket) => sum + bucket.length, 0);
console.log(`✓ Original dataset: ${dataset.length} items`);
console.log(`✓ Items in final buckets: ${totalInBuckets} items`);
console.log(`✓ Number of final buckets: ${Object.keys(allBuckets).length}`);
console.log(`✓ All items accounted for: ${totalInBuckets === dataset.length ? 'YES' : 'NO'}`);
