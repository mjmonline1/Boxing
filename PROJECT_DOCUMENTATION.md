# Boxing Tournament Management System - Project Documentation

## Project Overview

This project is a comprehensive toolkit for managing boxing tournaments, specifically focusing on the hierarchical classification of boxers into mutually exclusive match brackets. It provides tools for data parsing, filtering logic, visualization (via Tree structures and Petri Nets), and a standalone diagram viewer.

The system is designed to handle complex tournament rules including age groups, weight classes, and experience levels, ensuring every boxer is assigned to exactly one match bucket.

## Project Structure

### 1. Core Filtering Engine

- **`hierarchical-filter.js`**: A reusable Node.js class that implements a tree-based filtering logic. It allows data to flow down a decision tree, ending in mutually exclusive leaf nodes (buckets).
- **`boxing-tournament-filter.js`**: An implementation of the core engine specifically for boxing tournament structures.
- **`csv-hierarchical-filter.js`**: Helper script for loading data from CSV files and applying the hierarchical filters.

### 2. TSC 2025 Tournament (Latest Implementation)

Located in the `Tree/` directory, this section handles the specific requirements for the 2025 TSC tournament.
- **`tsc-tournament-2025.js`**: The main script for the 2025 tournament, processing 137+ boxers.
- **`parse-tsc-data.js`**: Converts raw boxer data (extracted from PDFs) into structured CSV format.
- **`data/tsc-boxers-2025.csv`**: The primary dataset for the 2025 tournament.
- **`README-TSC-2025.md`**: Detailed documentation for the 2025 tournament implementation.

### 3. Visualization and Analysis

The project uses multiple formats to visualize the tournament structure and flow:

- **Petri Nets**:
  - `create-petri-net.js` (in `Tree/`) and `Analysis/create-petri-net-svg.js` generate Petri Net models of the tournament flow.
  - Outputs are available as `.svg` and `.pnml` files (e.g., `TSC_Boxing_PetriNet.svg`).
- **Mermaid & DOT**:
  - `boxing.mmd` and `boxing.dot` define the hierarchical structure in Mermaid and Graphviz formats.
- **Electron App**:
  - Located in `Analysis/`, a standalone application for displaying the Boxing Classification Diagram.

### 4. Sparring Management

Tools for generating and managing sparring matches, which follow a different logic than tournament brackets.

- **`SparMaker.js`**: Logic for pairing boxers for sparring sessions.
- **`RingManager.html`**: A web-based interface for managing ring allocations.
- **`Sparrings.json`**: Data storage for generated sparring matches.

### 5. Data and Output

- **`data/`**: Directory containing source CSV files.
- **`output/`**: Directory for generated results, including JSON data, tree visualizations (txt), and SVG diagrams.

## Key Features

- **Mutually Exclusive Buckets**: Ensures no boxer is double-booked or left out.
- **Flexible Hierarchy**: Easily adjustable weight class splits, age group definitions, and experience thresholds.
- **Validation**: Built-in verification to ensure total input matches total output.
- **Visual Audit Trail**: Multiple visualization formats (Tree, SVG, Petri Net) to verify the logic.

## Getting Started

### Process a Tournament

To run the tournament assignment for the TSC 2025 data:

```bash
cd Tree
node tsc-tournament-2025.js
```

### Create a Petri Net Visualization

To generate a Petri Net SVG from the tournament structure:

```bash
cd Tree
node create-petri-net.js
```

### View the Analysis Diagram

To run the standalone diagram viewer:

```bash
cd Analysis
npm install
npm start
```

## Data Format

Boxer data is typically managed in CSV files with the following headers:
`id, name, club, gender, yob, fit, weight, experience`

- **yob**: Year of Birth (determines Junior, Youth, Senior)
- **fit**: 'yes' or 'no'
- **weight**: Weight in kg
- **experience**: Number of previous bouts (determines Novice vs. Experienced)
