let data = null;

// ---- LOAD DATA ----
async function loadData() {
  const res = await fetch("./Sparrings.json");
  data = await res.json();

  const spars = mapToSpars(data);

  const rings = ["R1", "R2", "R3", "R4", "R5"];

  const allocated = allocate(spars, rings);

  render(rings, allocated);
}

// ---- MAP RAW DATA ----
function mapToSpars(data) {
  return data.matches.map((m, i) => ({
    id: `S${i + 1}`,
    red: m.red,
    blue: m.blue,
    category: m.category
  }));
}

// ---- SIMPLE ROUND ROBIN ----
function allocate(spars, rings) {
  const result = [];
  let ringIndex = 0;

  for (const spar of spars) {
    result.push({
      ...spar,
      ringId: rings[ringIndex]
    });

    ringIndex = (ringIndex + 1) % rings.length;
  }

  return result;
}

// ---- RENDER BOARD ----
function render(rings, allocations) {
  const board = document.getElementById("board");
  board.innerHTML = "";

  rings.forEach(ringId => {
    const ringDiv = document.createElement("div");
    ringDiv.className = "ring";
    ringDiv.dataset.ring = ringId;

    const title = document.createElement("h2");
    title.innerText = ringId;
    ringDiv.appendChild(title);

    allocations
      .filter(a => a.ringId === ringId)
      .forEach(a => {
        const bout = document.createElement("div");
        bout.className = "bout";

        // category styling hook
        if (a.red.gender === "female") bout.classList.add("female");
        if (a.red.gender === "male") bout.classList.add("male");
          if (a.red.yob < 2008) bout.classList.add("junior");
          if ((a.red.yob > 2008) && (a.red.yob<2010)) bout.classList.add("youth");
          if (a.red.yob > 2010) bout.classList.add("senior");


        //if (a.red.yob > 2010) bout.classList.add("youth");

        bout.innerHTML = `
          <b>${a.red.name}</b> vs <b>${a.blue.name}</b><br/>
          ${a.category}<br/>
          ${a.red.weight}kg
        `;

        ringDiv.appendChild(bout);
      });

    board.appendChild(ringDiv);
  });
}

loadData();