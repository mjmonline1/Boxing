const fs = require("fs");
const data = require("./Sparrings.json");

const rings = ["R1", "R2", "R3", "R4", "R5"];

/**
 * Convert matches → simplified spars
 */
function mapToSpars(data) {
  return data.matches.map((m, index) => ({
    id: `S${index + 1}`,
    category: m.category,
    redId: m.red.id,
    blueId: m.blue.id
  }));
}

/**
 * Group by category
 */
function groupByCategory(spars) {
  return spars.reduce((acc, spar) => {
    if (!acc[spar.category]) acc[spar.category] = [];
    acc[spar.category].push(spar);
    return acc;
  }, {});
}

/**
 * Allocation engine
 */
function allocateSpars(spars, rings, strategy = "ROUND_ROBIN_RINGS") {
  const allocations = [];

  if (strategy === "ROUND_ROBIN_RINGS") {
    let ringIndex = 0;

    for (const spar of spars) {
      allocations.push({
        sparId: spar.id,
        ringId: rings[ringIndex]
      });

      ringIndex = (ringIndex + 1) % rings.length;
    }
  }

  else if (strategy === "FILL_RINGS") {
    const perRing = Math.ceil(spars.length / rings.length);
    let ringIndex = 0;
    let count = 0;

    for (const spar of spars) {
      allocations.push({
        sparId: spar.id,
        ringId: rings[ringIndex]
      });

      count++;

      if (count >= perRing) {
        ringIndex++;
        count = 0;
      }
    }
  }

  else if (strategy === "ROUND_ROBIN_CATEGORY") {
    const grouped = groupByCategory(spars);
    let ringIndex = 0;

    for (const category of Object.keys(grouped)) {
      for (const spar of grouped[category]) {
        allocations.push({
          sparId: spar.id,
          ringId: rings[ringIndex],
          category
        });

        ringIndex = (ringIndex + 1) % rings.length;
      }
    }
  }

  return allocations;
}

/**
 * RUN
 */
const spars = mapToSpars(data);

const allocations = allocateSpars(
  spars,
  rings,
  "ROUND_ROBIN_CATEGORY"
);

console.log(allocations);

/**
 * ✅ SAVE OUTPUT TO FILE (THIS WAS MISSING)
 */
fs.writeFileSync(
  "./Tree/allocations.json",
  JSON.stringify(allocations, null, 2),
  "utf-8"
);

console.log("Saved allocations.json");