require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { parseRawBoxers } = require('./boxer-csv');

const BOXERS_CSV = path.join(__dirname, 'data', 'Registered Boxer2026.csv');

function parseBoxers() {
  return parseRawBoxers(fs.readFileSync(BOXERS_CSV, 'utf8'));
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set in .env');
    process.exit(1);
  }

  const boxers = parseBoxers();
  console.log(`Parsed ${boxers.length} boxers from CSV`);

  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const col = client.db('boxing').collection('boxers');
    await col.deleteMany({});
    await col.insertMany(boxers);
    console.log(`Inserted ${boxers.length} boxers into MongoDB`);
  } finally {
    await client.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
