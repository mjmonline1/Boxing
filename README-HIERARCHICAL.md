# Hierarchical Tree-Based Dataset Filter

A Node.js application for filtering datasets into **mutually exclusive buckets** using a tree-based hierarchical structure. Each element flows down the tree and ends up in exactly **ONE** final bucket.

## Key Features

✅ **Tree-based filtering** - Elements flow down decision tree
✅ **Mutually exclusive buckets** - Each item appears in exactly one final bucket
✅ **Progressive splitting** - Data splits at each level of the tree
✅ **Any depth** - Support for deep tree structures
✅ **CSV support** - Load data from CSV files
✅ **Visual tree display** - See the complete structure
✅ **Verification** - Automatic checks to ensure no duplicates
✅ **Export results** - JSON output and tree visualization

## Concept

This is different from traditional filtering where items can appear in multiple buckets. Here, items flow down a decision tree:

```
                    Root (all data)
                         |
            ┌────────────┴────────────┐
            │                         │
     High Performers           Standard Performers
      (score >= 80)               (score < 80)
            |                         |
    ┌───────┴────────┐        ┌──────┴──────┐
    │       │        │        │      │       │
  Eng.   Sales   Mkt.       Eng.  Sales   Mkt.
 [BKT1] [BKT2] [BKT3]     [BKT4] [BKT5] [BKT6]
```

Each element follows one path and ends in one bucket.

## Installation

No external dependencies required!

```bash
mkdir dataset-filter-app
cd dataset-filter-app
# Copy all files here
```

## Quick Start

### 1. Basic Example (5 buckets)
```bash
node hierarchical-filter.js
```

### 2. Six-Bucket Example
```bash
node six-bucket-example.js
```

### 3. CSV Data Example
```bash
node csv-hierarchical-filter.js
```

## How It Works

### Define Your Tree Structure

```javascript
const treeStructure = [
  {
    name: 'highPerformers',
    rule: (item) => item.score >= 80,
    description: 'High performers',
    children: [
      {
        name: 'bucket1_high_engineering',
        rule: (item) => item.department === 'Engineering',
        description: 'High performers in Engineering'
      },
      {
        name: 'bucket2_high_marketing',
        rule: (item) => item.department === 'Marketing',
        description: 'High performers in Marketing'
      }
    ]
  },
  {
    name: 'standardPerformers',
    rule: (item) => item.score < 80,
    description: 'Standard performers',
    children: [
      {
        name: 'bucket3_standard_engineering',
        rule: (item) => item.department === 'Engineering',
        description: 'Standard performers in Engineering'
      },
      {
        name: 'bucket4_standard_marketing',
        rule: (item) => item.department === 'Marketing',
        description: 'Standard performers in Marketing'
      }
    ]
  }
];
```

### Apply the Filter

```javascript
const HierarchicalFilter = require('./hierarchical-filter');

const dataset = [
  { id: 1, name: 'Alice', score: 85, department: 'Engineering' },
  { id: 2, name: 'Bob', score: 72, department: 'Marketing' },
  // ... more data
];

const filter = new HierarchicalFilter(dataset);

filter
  .buildTree(treeStructure)
  .applyFilters()
  .displaySummary()
  .displayTree();

// Get results
const buckets = filter.getFinalBuckets();
console.log(buckets.bucket1_high_engineering); // Items in this bucket

// Export
filter.exportToFile('output/results.json');
filter.exportTreeVisualization('output/tree.txt');
```

## Tree Structure Rules

### Node Types

1. **Root Node** - Contains all data initially
2. **Filter Nodes** - Have rules and children, split data
3. **Leaf Nodes (Buckets)** - Have no children, hold final results

### Creating Nodes

```javascript
{
  name: 'nodeName',              // Required: unique identifier
  rule: (item) => boolean,       // Required for non-root: filter function
  description: 'What this is',   // Optional: human-readable description
  children: [...]                // Optional: child nodes (omit for leaf/bucket)
}
```

### Rules

Rules are functions that return `true` or `false`:

```javascript
// Simple comparison
rule: (item) => item.age >= 30

// Multiple conditions (AND)
rule: (item) => item.age >= 30 && item.score > 80

// Multiple conditions (OR)
rule: (item) => item.dept === 'Sales' || item.dept === 'Marketing'

// Complex logic
rule: (item) => {
  if (item.category === 'A') return item.score >= 80;
  if (item.category === 'B') return item.score >= 70;
  return item.score >= 60;
}

// String operations
rule: (item) => item.email.endsWith('@company.com')

// Array checks
rule: (item) => ['admin', 'manager'].includes(item.role)
```

## Complete Example: 6 Buckets

```javascript
const HierarchicalFilter = require('./hierarchical-filter');

const dataset = [
  { id: 1, name: 'Alice', score: 85, department: 'Engineering' },
  { id: 2, name: 'Bob', score: 72, department: 'Sales' },
  { id: 3, name: 'Charlie', score: 91, department: 'Engineering' },
  { id: 4, name: 'Diana', score: 68, department: 'Marketing' },
  { id: 5, name: 'Eve', score: 95, department: 'Engineering' },
  { id: 6, name: 'Frank', score: 78, department: 'Sales' },
];

// Tree with 6 final buckets
const tree = [
  {
    name: 'highPerformers',
    rule: (item) => item.score >= 80,
    children: [
      { name: 'bucket1', rule: (item) => item.department === 'Engineering' },
      { name: 'bucket2', rule: (item) => item.department === 'Sales' },
      { name: 'bucket3', rule: (item) => item.department === 'Marketing' }
    ]
  },
  {
    name: 'standardPerformers',
    rule: (item) => item.score < 80,
    children: [
      { name: 'bucket4', rule: (item) => item.department === 'Engineering' },
      { name: 'bucket5', rule: (item) => item.department === 'Sales' },
      { name: 'bucket6', rule: (item) => item.department === 'Marketing' }
    ]
  }
];

const filter = new HierarchicalFilter(dataset);
filter.buildTree(tree).applyFilters();

// Results show each item in exactly one bucket
const buckets = filter.getFinalBuckets();
// bucket1: [Alice, Charlie, Eve] - High perf. Engineering
// bucket2: [] - High perf. Sales
// bucket3: [] - High perf. Marketing  
// bucket4: [] - Standard Engineering
// bucket5: [Bob, Frank] - Standard Sales
// bucket6: [Diana] - Standard Marketing
```

## API Reference

### HierarchicalFilter Class

#### Constructor
```javascript
new HierarchicalFilter(dataset)
```
- `dataset`: Array of objects to filter

#### Methods

**buildTree(treeStructure)**
- Define the tree structure
- Returns `this` for chaining

**applyFilters()**
- Execute filtering down the tree
- Returns `this` for chaining

**getFinalBuckets()**
- Get all leaf node buckets
- Returns object with bucket names as keys

**getBucket(bucketName)**
- Get specific bucket contents
- Returns array of items

**getSummary()**
- Get statistics
- Returns object with totals and distributions

**displaySummary()**
- Print summary to console
- Returns `this` for chaining

**displayTree()**
- Print tree structure to console
- Returns `this` for chaining

**displayDetails()**
- Print all bucket contents

**exportToFile(filename)**
- Export results to JSON
- Default: 'hierarchical-results.json'

**exportTreeVisualization(filename)**
- Export tree structure to text file
- Default: 'tree-structure.txt'

## Loading Data from CSV

```javascript
const HierarchicalFilter = require('./hierarchical-filter');
const fs = require('fs');

// Simple CSV parser
function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((header, index) => {
      const value = values[index];
      obj[header] = isNaN(value) ? value : parseFloat(value);
    });
    return obj;
  });
}

// Use it
const dataset = parseCSV('data/mydata.csv');
const filter = new HierarchicalFilter(dataset);
// ... continue as normal
```

Or use the provided helper:

```javascript
const { filterCSVHierarchically } = require('./csv-hierarchical-filter');

const filter = filterCSVHierarchically('data/mydata.csv', treeStructure);
```

## Example Output

```
=== Applying Hierarchical Filters ===

▼ root: 12 items
  → High performers (score >= 80): 7 items
  ▼ highPerformers: 7 items
    → High performers in Engineering: 5 items
    ✓ bucket1_high_engineering: 5 items (final bucket)
    → High performers in Sales: 0 items
    ✓ bucket2_high_sales: 0 items (final bucket)
    → High performers in Marketing: 2 items
    ✓ bucket3_high_marketing: 2 items (final bucket)
  → Standard performers (score < 80): 5 items
  ▼ standardPerformers: 5 items
    → Standard performers in Engineering: 0 items
    ✓ bucket4_standard_engineering: 0 items (final bucket)
    → Standard performers in Sales: 4 items
    ✓ bucket5_standard_sales: 4 items (final bucket)
    → Standard performers in Marketing: 1 items
    ✓ bucket6_standard_marketing: 1 items (final bucket)

--- Summary ---
Total original dataset: 12
Total distributed: 12
Unassigned: 0

Final Bucket Distribution:
  bucket1_high_engineering: 5 (41.67%)
  bucket2_high_sales: 0 (0.00%)
  bucket3_high_marketing: 2 (16.67%)
  bucket4_standard_engineering: 0 (0.00%)
  bucket5_standard_sales: 4 (33.33%)
  bucket6_standard_marketing: 1 (8.33%)

--- Tree Structure ---

📁 root (12 items)
  📁 highPerformers (0 items)
    📦 bucket1_high_engineering (5 items)
    📦 bucket2_high_sales (0 items)
    📦 bucket3_high_marketing (2 items)
  📁 standardPerformers (0 items)
    📦 bucket4_standard_engineering (0 items)
    📦 bucket5_standard_sales (4 items)
    📦 bucket6_standard_marketing (1 items)

✓ Verified: All items appear in exactly one final bucket
```

## Tips and Best Practices

1. **Exhaustive Rules**: Make sure your rules at each level cover all cases
   - If filtering by score, use `>= 80` and `< 80` to cover everything
   - Otherwise some items may not reach any bucket

2. **Bucket Naming**: Use descriptive names that reflect the path
   - Good: `males_engineering_senior`
   - Avoid: `bucket1`, `bucket2` (unclear what they contain)

3. **Tree Depth**: You can go as deep as needed
   - 2 levels: Gender → Department (6 buckets)
   - 3 levels: Gender → Department → Seniority (12 buckets)
   - 4+ levels: Keep going!

4. **Verification**: Always check that all items are accounted for
   ```javascript
   const summary = filter.getSummary();
   console.log(`Total: ${summary.totalOriginal}`);
   console.log(`Distributed: ${summary.totalDistributed}`);
   ```

5. **Empty Buckets**: Some buckets may be empty (0 items)
   - This is normal and okay
   - Indicates no items matched that combination of rules

## Differences from Non-Hierarchical Filtering

| Aspect | This App (Hierarchical) | Traditional Filtering |
|--------|------------------------|----------------------|
| Item appearance | Exactly ONE bucket | Can be in MULTIPLE buckets |
| Structure | Tree-based | Flat/parallel |
| Rules | Applied sequentially down tree | Applied independently |
| Use case | Segmentation, categorization | Tagging, multi-criteria search |
| Example | Customer segments | Search filters |

## Files Included

- `hierarchical-filter.js` - Main library and 5-bucket example
- `six-bucket-example.js` - Simple 6-bucket example
- `csv-hierarchical-filter.js` - CSV loading example
- `data/sample-data.csv` - Sample CSV data
- `package.json` - NPM package configuration
- `README-HIERARCHICAL.md` - This file

## License

MIT
