// Copyright (c) 2026 ITLR Assets. All rights reserved.
const fs = require("fs");
const path = require("path");

/**
 * Callback (replace with DB / API later)
 */
function Allocated(sparId, ringId) {
    console.log(`Allocated ${sparId} -> ${ringId}`);
}

/**
 * Load JSON file
 */
/* c8 ignore start */
function loadData(filePath) {
    const fullPath = path.resolve(filePath);
    const raw = fs.readFileSync(fullPath, "utf-8");
    return JSON.parse(raw);
}
/* c8 ignore stop */

/**
 * MAIN ALLOCATOR (ROUND ROBIN ONLY)
 */
function allocate(data, rings, ringCapacity) {
    if (!data.matches || !Array.isArray(data.matches)) {
        throw new Error("Invalid JSON: expected { matches: [] }");
    }

    const matches = data.matches;

    const ringLoad = {};
    for (const r of rings) {
        ringLoad[r] = 0;
    }

    let ringIndex = 0;

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];

        const ringId = getNextAvailableRing(
            rings,
            ringLoad,
            ringCapacity,
            ringIndex
        );

        if (!ringId) {
            console.warn("⚠️ All rings full — stopping allocation");
            break;
        }

        Allocated(match.id || i, ringId);

        ringLoad[ringId]++;
        ringIndex = (rings.indexOf(ringId) + 1) % rings.length;
    }
}

/**
 * Find next ring that still has capacity
 */
function getNextAvailableRing(rings, ringLoad, ringCapacity, startIndex) {
    let attempts = 0;
    let index = startIndex;

    while (attempts < rings.length) {
        const ringId = rings[index];

        if (ringLoad[ringId] < ringCapacity[ringId]) {
            return ringId;
        }

        index = (index + 1) % rings.length;
        attempts++;
    }

    return null; // all full
}

/**
 * RUN EXAMPLE
 */
/* c8 ignore start */
if (require.main === module) {
    const fileName = path.join(__dirname, "Sparrings.json");

    const rings = ["R1", "R2", "R3", "R4", "R5"];

    const ringCapacity = {
        R1: 23,
        R2: 23,
        R3: 23,
        R4: 22,
        R5: 24
    };

    const data = loadData(fileName);

    allocate(data, rings, ringCapacity);
}
/* c8 ignore stop */

module.exports = {
    allocate
};