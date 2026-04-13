# Boxing Tournament Match Assignment System

This project is a match-making automation system designed to take a large list of boxers and safely categorize them into fair, competitive brackets based on official tournament rules (Age, Gender, Weight, and Experience).

## 🧩 Core Logic & Engine

*   **`hierarchical-filter.js`**: The foundational engine. It processes a list of items through a hierarchical rule set to distribute them into mutually exclusive "buckets."
*   **`boxing-tournament-filter.js`**: Defines the specific boxing tournament logic (Age, Gender, Weight, Experience). Used as a template and for testing with sample data.
*   **`boxing-csv-loader.js`**: A utility script that applies the hierarchical filter to boxers specifically loaded from a CSV file.

## 🥊 TSC 2025 Specific Scripts

*   **`tsc-tournament-2025.js`**: The primary script for the 2025 tournament. It loads the 137-boxer roster and generates final match assignments.
*   **`parse-tsc-data.js`**: Transforms raw data (from PDF or CSV) into the standardized format required by the filtering engine.
*   **`tsc-buckets-only.js`**: A specialized version of the tournament script focused on outputting bucket structures rather than individual boxer details.
*   **`create-petri-net.js`**: Generates a Petri Net representation (SVG) to visualize the flow of boxers through the decision tree.

## 📊 Data Files

### Input Data
*   **`tsc-boxers-2025.csv`**: The master roster (137 boxers) including club, gender, YOB, weight, and experience.
*   **`boxing-boxers.csv`**: A smaller sample dataset used for testing the generic filter logic.

### Filtered Category Outputs
These files contain boxers partitioned into their specific tournament categories:
*   **`Female_Junior.csv`**
*   **`MaleJunior_WC1_Experienced.csv`**
*   **`MaleJunior_WC1_Novice.csv`**
*   **`NotFit.csv`**: Contains boxers who failed the initial fitness check.

## 📂 Output Directory

*   **`tsc-2025-tournament-results.json`**: Machine-readable JSON containing the complete match assignment results.
*   **`tsc-2025-tournament-tree.txt`**: A text-based tree visualization of the hierarchical distribution.
*   **`OutputBuckets.zip`**: A compressed archive of the individual category CSV files.

## 🖼️ Documentation & Diagrams

*   **`README-BOXING.md`**: General documentation for the hierarchical filtering system.
*   **`README-TSC-2025.md`**: Detailed documentation for the 2025 tournament results and configuration.
*   **`filter.mmd`**: Mermaid diagram source file defining the logic flow.
*   **`TSC_Boxing_PetriNet.svg`**: A visual Petri Net diagram of the tournament logic.
