/**
 * Hierarchical Tree-Based Dataset Filter
 * Progressively splits dataset into mutually exclusive subsets
 * Each element ends up in exactly ONE final bucket
 */

const fs = require('fs');

class TreeNode {
  constructor(name, rule = null, description = '') {
    this.name = name;
    this.rule = rule;
    this.description = description;
    this.children = [];
    this.data = [];
    this.isFinalBucket = true; // Will be set to false if children are added
  }

  addChild(childNode) {
    this.children.push(childNode);
    this.isFinalBucket = false;
    return childNode;
  }
}

class HierarchicalFilter {
  constructor(dataset) {
    this.dataset = dataset;
    this.root = new TreeNode('root', null, 'Full dataset');
    this.root.data = [...dataset];
    this.finalBuckets = {};
  }

  /**
   * Build the tree structure by adding filter nodes
   */
  buildTree(treeStructure) {
    this._buildTreeRecursive(this.root, treeStructure);
    return this;
  }

  _buildTreeRecursive(parentNode, structure) {
    if (!structure || structure.length === 0) {
      return;
    }

    structure.forEach(config => {
      const childNode = new TreeNode(
        config.name,
        config.rule,
        config.description || ''
      );
      parentNode.addChild(childNode);

      // Recursively add children if they exist
      if (config.children && config.children.length > 0) {
        this._buildTreeRecursive(childNode, config.children);
      }
    });
  }

  /**
   * Apply filters progressively down the tree
   * Each element flows to exactly one final bucket
   */
  applyFilters() {
    console.log('\n=== Applying Hierarchical Filters ===\n');
    this._filterRecursive(this.root, 0);
    this._collectFinalBuckets(this.root);
    console.log('\n=== Filtering Complete ===\n');
    return this;
  }

  _filterRecursive(node, level) {
    const indent = '  '.repeat(level);
    
    if (node.children.length === 0) {
      // Leaf node - this is a final bucket
      console.log(`${indent}✓ ${node.name}: ${node.data.length} items (final bucket)`);
      return;
    }

    console.log(`${indent}▼ ${node.name}: ${node.data.length} items`);
    if (node.description && level > 0) {
      console.log(`${indent}  ${node.description}`);
    }

    // Split parent data among children based on their rules
    node.children.forEach(child => {
      if (child.rule) {
        child.data = node.data.filter(child.rule);
        console.log(`${indent}  → ${child.description || child.name}: ${child.data.length} items`);
      } else {
        // If no rule, this child gets all data (pass-through)
        child.data = [...node.data];
      }

      // Recursively process children
      this._filterRecursive(child, level + 1);
    });

    // After splitting to children, clear parent data (it's distributed)
    if (level > 0) {
      node.data = [];
    }
  }

  _collectFinalBuckets(node) {
    if (node.isFinalBucket && node.name !== 'root') {
      this.finalBuckets[node.name] = node.data;
    }

    node.children.forEach(child => {
      this._collectFinalBuckets(child);
    });
  }

  /**
   * Get all final buckets (leaf nodes only)
   */
  getFinalBuckets() {
    return this.finalBuckets;
  }

  /**
   * Get a specific bucket
   */
  getBucket(bucketName) {
    return this.finalBuckets[bucketName] || [];
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const summary = {
      totalOriginal: this.dataset.length,
      totalDistributed: 0,
      finalBuckets: {}
    };

    Object.entries(this.finalBuckets).forEach(([name, data]) => {
      summary.finalBuckets[name] = data.length;
      summary.totalDistributed += data.length;
    });

    return summary;
  }

  /**
   * Display summary
   */
  displaySummary() {
    const summary = this.getSummary();
    
    console.log('\n--- Summary ---');
    console.log(`Total original dataset: ${summary.totalOriginal}`);
    console.log(`Total distributed: ${summary.totalDistributed}`);
    console.log(`Unassigned: ${summary.totalOriginal - summary.totalDistributed}`);
    console.log('\nFinal Bucket Distribution:');
    
    Object.entries(summary.finalBuckets).forEach(([name, count]) => {
      const percentage = ((count / summary.totalOriginal) * 100).toFixed(2);
      console.log(`  ${name}: ${count} (${percentage}%)`);
    });
    
    return this;
  }

  /**
   * Display tree structure
   */
  displayTree() {
    console.log('\n--- Tree Structure ---\n');
    this._displayTreeRecursive(this.root, 0);
  }

  _displayTreeRecursive(node, level) {
    const indent = '  '.repeat(level);
    const marker = node.isFinalBucket ? '📦' : '📁';
    const count = node.data.length;
    
    console.log(`${indent}${marker} ${node.name} (${count} items)`);
    
    node.children.forEach(child => {
      this._displayTreeRecursive(child, level + 1);
    });
  }

  /**
   * Display detailed results
   */
  displayDetails() {
    console.log('\n--- Detailed Bucket Contents ---');
    
    Object.entries(this.finalBuckets).forEach(([bucketName, items]) => {
      console.log(`\n${bucketName} (${items.length} items):`);
      items.forEach(item => {
        console.log(`  - ${JSON.stringify(item)}`);
      });
    });
  }

  /**
   * Export to JSON
   */
  exportToFile(filename = 'hierarchical-results.json') {
    const output = {
      summary: this.getSummary(),
      finalBuckets: this.finalBuckets
    };
    
    fs.writeFileSync(filename, JSON.stringify(output, null, 2));
    console.log(`\nResults exported to ${filename}`);
  }

  /**
   * Export tree visualization to text file
   */
  exportTreeVisualization(filename = 'tree-structure.txt') {
    let output = 'Dataset Filter Tree Structure\n';
    output += '================================\n\n';
    output += this._getTreeVisualizationRecursive(this.root, 0, true);
    
    fs.writeFileSync(filename, output);
    console.log(`Tree visualization exported to ${filename}`);
  }

  _getTreeVisualizationRecursive(node, level, isLast) {
    const prefix = '  '.repeat(level);
    const marker = node.isFinalBucket ? '[BUCKET]' : '[FILTER]';
    let output = `${prefix}${marker} ${node.name} (${node.data.length} items)\n`;
    
    if (node.description && level > 0) {
      output += `${prefix}         ${node.description}\n`;
    }
    
    node.children.forEach((child, index) => {
      const isLastChild = index === node.children.length - 1;
      output += this._getTreeVisualizationRecursive(child, level + 1, isLastChild);
    });
    
    return output;
  }
}

// ============================================
// Example Usage: 6-Bucket Tree Structure
// ============================================

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
];

/**
 * Tree Structure Example:
 * 
 * Root (all data)
 * ├── Male
 * │   ├── High Performers (score >= 80)
 * │   └── Standard Performers (score < 80)
 * └── Female
 *     ├── Engineering
 *     │   ├── Senior (age >= 30)
 *     │   └── Junior (age < 30)
 *     └── Non-Engineering
 */

const treeStructure = [
  {
    name: 'males',
    rule: (item) => item.gender === 'male',
    description: 'Male employees',
    children: [
      {
        name: 'males_highPerformers',
        rule: (item) => item.score >= 80,
        description: 'Male high performers (score >= 80)'
      },
      {
        name: 'males_standard',
        rule: (item) => item.score < 80,
        description: 'Male standard performers (score < 80)'
      }
    ]
  },
  {
    name: 'females',
    rule: (item) => item.gender === 'female',
    description: 'Female employees',
    children: [
      {
        name: 'females_engineering',
        rule: (item) => item.department === 'Engineering',
        description: 'Female engineers',
        children: [
          {
            name: 'females_engineering_senior',
            rule: (item) => item.age >= 30,
            description: 'Senior female engineers (age >= 30)'
          },
          {
            name: 'females_engineering_junior',
            rule: (item) => item.age < 30,
            description: 'Junior female engineers (age < 30)'
          }
        ]
      },
      {
        name: 'females_nonEngineering',
        rule: (item) => item.department !== 'Engineering',
        description: 'Female non-engineers'
      }
    ]
  }
];

// Create and run filter
const filter = new HierarchicalFilter(dataset);

filter
  .buildTree(treeStructure)
  .applyFilters()
  .displaySummary()
  .displayTree();

// Show detailed contents
filter.displayDetails();

// Export results
if (!fs.existsSync('output')) {
  fs.mkdirSync('output');
}
filter.exportToFile('output/hierarchical-results.json');
filter.exportTreeVisualization('output/tree-structure.txt');

// Verify no overlap
console.log('\n--- Verification: No Overlapping Items ---');
const allFinalBuckets = filter.getFinalBuckets();
const seenIds = new Set();
let hasOverlap = false;

Object.entries(allFinalBuckets).forEach(([bucketName, items]) => {
  items.forEach(item => {
    if (seenIds.has(item.id)) {
      console.log(`❌ ERROR: Item ${item.id} appears in multiple buckets!`);
      hasOverlap = true;
    }
    seenIds.add(item.id);
  });
});

if (!hasOverlap) {
  console.log('✓ Verified: All items appear in exactly one final bucket');
}

module.exports = HierarchicalFilter;
