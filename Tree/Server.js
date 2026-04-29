const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5500;

app.use(cors()); // 👈 THIS fixes cross-origin issues
app.use(express.json());
const FILE = path.join(__dirname, "Sparrings.json");

// ---- API ----
app.get("/api/sparrings", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  res.json(data);
});

app.post("/api/sparrings", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  data.push(req.body);
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

app.put("/api/sparrings/:id", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  data[req.params.id] = req.body;
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

app.delete("/api/sparrings/:id", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  data.splice(req.params.id, 1);
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

// ---- FRONTEND ----
app.use(express.static("public"));

app.listen(PORT, () => console.log("http://localhost:5500"));