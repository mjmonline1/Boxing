# Boxing Tournament Hierarchical Filter

Implementation of your boxing tournament bracket structure from `boxing.mmd`. Each boxer flows through the decision tree and ends up in exactly ONE final match bucket.

## Tournament Structure

Based on your mermaid diagram, the structure is:

```
All Boxers
├── Not Fit (1 bucket)
├── Fit Males
│   ├── Junior (YOB 2010-2013)
│   │   ├── Weight Class 1
│   │   │   ├── Novice (0-5 bouts) → Match 1, Match 2
│   │   │   └── Experienced (6+ bouts) → Match 3, Match 4
│   │   └── Weight Class 2
│   │       ├── Novice (0-5 bouts) → Match 1, Match 2
│   │       └── Experienced (6+ bouts) → Match 3, Match 4
│   ├── Youth (YOB 2008-2009)
│   │   ├── Weight Class 1
│   │   │   ├── Novice (0-5 bouts) → Match 1, Match 2
│   │   │   └── Experienced (6+ bouts) → Match 3, Match 4
│   │   └── Weight Class 2
│   │       ├── Novice (0-5 bouts) → Match 1, Match 2
│   │       └── Experienced (6+ bouts) → Match 3, Match 4
│   └── Senior (YOB 2007)
│       ├── Weight Class 1
│       │   ├── Novice (0-5 bouts) → Match 1, Match 2
│       │   └── Experienced (6+ bouts) → Match 3, Match 4
│       └── Weight Class 2
│           ├── Novice (0-5 bouts) → Match 1, Match 2
│           └── Experienced (6+ bouts) → Match 3, Match 4
└── Fit Females
    ├── Spar Match 1
    ├── Spar Match 2
    └── Spar Match 3
```

**Total Final Buckets: 28**
- 1 Not Fit
- 24 Male matches (3 age groups × 2 weight classes × 2 experience × 2 matches)
- 3 Female matches

## Quick Start

### Run with Sample Data
```bash
node boxing-tournament-filter.js
```

### Run with Your CSV Data
```bash
node boxing-csv-loader.js
```

## CSV Data Format

Your CSV file should have these columns:

```csv
id,name,gender,yob,fit,weightClass,experience
1,John Smith,male,2010,no,1,3
2,Mike Johnson,male,2010,yes,1,3
3,Sarah Jones,female,2008,yes,1,5
```

### Column Descriptions

- **id**: Unique identifier (number)
- **name**: Boxer's full name (text)
- **gender**: `male` or `female`
- **yob**: Year of birth (number)
  - Junior: 2010-2013
  - Youth: 2008-2009
  - Senior: 2007
- **fit**: `yes` or `no` (whether boxer is fit to compete)
- **weightClass**: `1` or `2` (or `A`/`B`)
- **experience**: Number of previous bouts (number)
  - Novice: 0-5 bouts
  - Experienced: 6+ bouts

## Filter Rules

The system applies these filters progressively:

### 1. Fitness Filter
- **Not Fit**: Boxers marked as not fit → separate bucket
- **Fit**: Continue to gender filtering

### 2. Gender Filter
- **Male**: Continue to age group filtering
- **Female**: Split into 3 matches (evenly distributed)

### 3. Male Age Group Filter (by YOB)
- **Junior**: 2010, 2011, 2012, 2013
- **Youth**: 2008, 2009
- **Senior**: 2007

### 4. Weight Class Filter
- **Class 1**: weightClass = 1 or 'A'
- **Class 2**: weightClass = 2 or 'B'

### 5. Experience Filter
- **Novice (EXC1)**: 0-5 bouts
- **Experienced (EXC2)**: 6+ bouts

### 6. Match Assignment
- Within each experience level, boxers are split into 2 matches
- Currently uses simple distribution (even/odd ID)
- Can be customized with your own logic

## Customizing Match Assignment

The final match assignment currently uses a simple even/odd split:

```javascript
{
  name: 'MaleJuniorWC1_EXC1_Match1',
  rule: (boxer) => (boxer.id % 2) === 0,  // Even IDs
  description: 'Male Junior WC1 EXC1 - Match 1'
}
```

You can customize this logic for better match-making:

```javascript
// Random assignment
rule: (boxer) => Math.random() < 0.5

// Based on weight
rule: (boxer) => boxer.weight < 65

// Based on name
rule: (boxer) => boxer.name.charCodeAt(0) % 2 === 0

// Sequential assignment (first come, first served)
rule: (boxer) => assignmentCounter++ % 2 === 0
```

## Files

### Core Files
- **hierarchical-filter.js** - Core tree filtering engine
- **boxing-tournament-filter.js** - Boxing tournament structure with sample data
- **boxing-csv-loader.js** - Load boxers from CSV file
- **boxing.mmd** - Your original Mermaid diagram (reference)

### Data Files
- **data/boxing-boxers.csv** - Sample boxer data template

### Output Files (generated)
- **output/boxing-tournament-results.json** - Full results in JSON
- **output/boxing-tournament-tree.txt** - Tree visualization
- **output/boxing-csv-results.json** - Results from CSV data
- **output/boxing-csv-tree.txt** - Tree from CSV data

## Usage Examples

### Example 1: Load Your Data

1. Prepare your CSV file with boxer data
2. Save it as `data/boxing-boxers.csv`
3. Run: `node boxing-csv-loader.js`
4. Check results in `output/boxing-csv-results.json`

### Example 2: Modify Rules

Edit `boxing-tournament-filter.js` to change the filtering logic:

```javascript
// Change experience threshold
{
  name: 'MaleJuniorWC1_EXC1',
  rule: (boxer) => boxer.experience <= 10,  // Changed from 5
  description: 'Male Junior WC1 - Novice (0-10 bouts)'
}

// Add weight sub-classes
{
  name: 'MaleJuniorWC1_Light',
  rule: (boxer) => boxer.weight < 60,
  description: 'Male Junior WC1 - Lightweight (<60kg)'
}
```

### Example 3: Export for Your System

The JSON output can be used in other systems:

```javascript
const results = require('./output/boxing-csv-results.json');

// Get all boxers in a specific match
const match1Boxers = results.results.MaleJuniorWC1_EXC1_Match1;

// Generate bracket
match1Boxers.forEach(boxer => {
  console.log(`${boxer.name} vs TBD`);
});
```

## Understanding the Output

### Summary Section
```
Total original dataset: 16
Total distributed: 16
Unassigned: 0

Final Bucket Distribution:
  NotFit: 1 (6.25%)
  MaleJuniorWC1_EXC1_Match1: 2 (12.5%)
  ...
```

### Match Assignments
```
=== MALE JUNIOR ===
Total: 8 boxers in 8 potential matches

  Weight Class 1:
    Novice (0-5 bouts):
      Match 1: 2 boxers
        - Mike Johnson (YOB 2010, Exp: 3)
        - Jake Wilson (YOB 2012, Exp: 2)
      Match 2: 1 boxer
        - Tom Brown (YOB 2011, Exp: 4)
```

### Verification
Always check that all boxers are accounted for:
```
✓ Total boxers loaded: 16
✓ Total boxers assigned: 16
✓ All boxers accounted for: YES
```

## Common Issues

### Issue: Some matches are empty
**Solution**: This is normal if you don't have enough boxers in that category. The structure creates all possible matches, but not all will have participants.

### Issue: Uneven match distribution
**Solution**: The current logic splits by even/odd ID. Implement custom logic for better balance:

```javascript
// Better distribution logic
let matchCounter = 0;
rule: (boxer) => {
  const match = matchCounter++ % 2;
  return match === 0;
}
```

### Issue: Boxer in wrong category
**Solution**: Check your CSV data:
- Verify `yob` is correct (determines age group)
- Verify `weightClass` is 1 or 2
- Verify `experience` is accurate
- Verify `fit` is `yes` or `no`

## Adding More Filters

To add additional filtering levels, extend the tree structure:

```javascript
{
  name: 'MaleJuniorWeightClass1',
  rule: (boxer) => boxer.weightClass === 1,
  children: [
    {
      name: 'MaleJuniorWC1_Lightweight',
      rule: (boxer) => boxer.weight < 60,
      description: 'Lightweight (<60kg)',
      children: [
        // Add experience levels here
      ]
    },
    {
      name: 'MaleJuniorWC1_Middleweight', 
      rule: (boxer) => boxer.weight >= 60,
      description: 'Middleweight (60kg+)',
      children: [
        // Add experience levels here
      ]
    }
  ]
}
```

## Tips

1. **Keep CSV data clean**: Ensure YOB, weight class, and experience are accurate
2. **Test with sample data first**: Use the provided sample data to verify structure
3. **Check empty buckets**: Review which categories have no boxers
4. **Verify totals**: Always check that input = output boxer count
5. **Export results**: Use JSON output for bracket generation or printing

## Next Steps

1. Replace sample data with your actual boxer roster
2. Adjust match assignment logic if needed
3. Add additional filters (weight, ranking, etc.) if needed
4. Generate brackets or match schedules from the output
5. Integrate with your tournament management system

## Support

The system automatically:
- ✅ Assigns each boxer to exactly ONE match
- ✅ Verifies all boxers are accounted for
- ✅ Shows complete tree structure
- ✅ Exports results in JSON format
- ✅ Handles empty categories gracefully
