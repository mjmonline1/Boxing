// Copyright (c) 2026 ITLR Assets. All rights reserved.
const fs = require("fs");
const data = require("./Sparrings.json");

const ringPools = {
  open: ["R1", "R2", "R3", "R4"],
  youthFemale: ["R5"]
};

/**
 * Convert matches → spars
 */
function mapToSpars(data) {
  return data.matches.map((m, index) => ({
    id: `S${index + 1}`,
    category: m.category,
    gender: m.red.gender, // assume same for both in your dataset
    redId: m.red.id,
    blueId: m.blue.id
  }));
}

/**
 * Rule: Youth or Female goes to Ring 5
 */
function isYouthOrFemale(spar) {
  return (
    spar.category.includes("Junior") ||
    spar.category.includes("Youth") ||
    spar.category.includes("Female")
  );
}

/**
 * Simple round robin allocator
 */
function allocateToPool(spars, rings) {
  const allocations = [];
  let ringIndex = 0;

  for (const spar of spars) {
    allocations.push({
      sparId: spar.id,
      ringId: rings[ringIndex]
    });

    ringIndex = (ringIndex + 1) % rings.length;
  }

  return allocations;
}

/**
 * MAIN EXECUTION
 */
const spars = mapToSpars(data);

const youthFemaleSpars = [];
const openSpars = [];

for (const spar of spars) {
  if (isYouthOrFemale(spar)) {
    youthFemaleSpars.push(spar);
  } else {
    openSpars.push(spar);
  }
}

const allocations = [
  ...allocateToPool(openSpars, ringPools.open),
  ...allocateToPool(youthFemaleSpars, ringPools.youthFemale)
];

/**
 * OUTPUT
 */
console.log(allocations);

/**
 * SAVE TO FILE
 */
fs.writeFileSync(
  "./allocations.json",
  JSON.stringify(allocations, null, 2),
  "utf-8"
);

console.log("Saved allocations.json");