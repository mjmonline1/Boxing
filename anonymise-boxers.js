// Copyright (c) 2026 ITLR Assets. All rights reserved.
/**
 * Replaces male boxer names with famous male boxer names for privacy.
 * Female boxers are left unchanged.
 * Outputs anonymised CSV alongside the original.
 */

const fs   = require('fs');
const path = require('path');

const FAMOUS_FEMALE_BOXERS = [
  'Laila Ali', 'Claressa Shields', 'Katie Taylor', 'Amanda Serrano', 'Ann Wolfe',
  'Cecilia Braekhus', 'Nicola Adams', 'Mary Kom', 'Lucia Rijker', 'Regina Halmich',
  'Holly Holm', 'Mikaela Mayer', 'Chantelle Cameron', 'Savannah Marshall', 'Terri Harper',
  'Sandy Ryan', 'Franchon Crews-Dezurn', 'Shannon Courtenay', 'Rachel Ball', 'Shadasia Green',
];

const FAMOUS_MALE_BOXERS = [
  'Muhammad Ali', 'Joe Louis', 'Sugar Ray Robinson', 'Rocky Marciano', 'Joe Frazier',
  'George Foreman', 'Floyd Mayweather', 'Manny Pacquiao', 'Mike Tyson', 'Lennox Lewis',
  'Evander Holyfield', 'Oscar De La Hoya', 'Roy Jones', 'Bernard Hopkins', 'Thomas Hearns',
  'Marvin Hagler', 'Sugar Ray Leonard', 'Roberto Duran', 'Julio Chavez', 'Carlos Monzon',
  'Alexis Arguello', 'Sandy Saddler', 'Archie Moore', 'Ezzard Charles', 'Jersey Joe Walcott',
  'Tony Canzoneri', 'Barney Ross', 'Mickey Walker', 'Jack Dempsey', 'Gene Tunney',
  'Harry Greb', 'Joe Gans', 'Stanley Ketchel', 'Bob Fitzsimmons', 'James Corbett',
  'Jack Johnson', 'Gennady Golovkin', 'Canelo Alvarez', 'Andre Ward', 'Wladimir Klitschko',
  'Vitali Klitschko', 'David Haye', 'Carl Froch', 'Joe Calzaghe', 'Ricky Hatton',
  'Amir Khan', 'Anthony Joshua', 'Tyson Fury', 'Deontay Wilder', 'Andy Ruiz',
  'Oleksandr Usyk', 'Naoya Inoue', 'Vasyl Lomachenko', 'Terence Crawford', 'Errol Spence',
  'Demetrius Andrade', 'Billy Saunders', 'Callum Smith', 'Joe Joyce', 'Daniel Dubois',
  'Lawrence Okolie', 'Johnny Nelson', 'Nigel Benn', 'Chris Eubank', 'Michael Watson',
  'Riddick Bowe', 'Larry Holmes', 'Ken Norton', 'Sonny Liston', 'Floyd Patterson',
  'Max Baer', 'Max Schmeling', 'Jack Sharkey', 'James Braddock', 'Erik Morales',
  'Marco Barrera', 'Juan Marquez', 'Jeff Fenech', 'Kostya Tszyu', 'Arturo Gatti',
  'Micky Ward', 'Diego Corrales', 'Jose Castillo', 'Danny Garcia', 'Keith Thurman',
  'Shawn Porter', 'Jermell Charlo', 'Jermall Charlo', 'Dmitry Bivol', 'Artur Beterbiev',
  'Gilberto Ramirez', 'Sergey Kovalev', 'Nathan Cleverly', 'Tony Bellew', 'Adonis Stevenson',
  'Badou Jack', 'Edgar Berlanga', 'David Benavidez', 'Caleb Plant', 'Ryan Garcia',
  'Gervonta Davis', 'Shakur Stevenson', 'Devin Haney', 'Jose Ramirez', 'Josh Taylor',
  'Jack Catterall', 'Regis Prograis', 'Ivan Baranchyk', 'Jorge Linares', 'Mikey Garcia',
  'Hector Camacho', 'Pernell Whitaker', 'Aaron Pryor', 'Edwin Rosario', 'Carlos Ortiz',
  'Flash Elorde', 'Carlos Zarate', 'Roman Gonzalez', 'Juan Estrada', 'Isaac Cruz',
  'William Zepeda', 'Ray Beltran', 'Chris Colbert', 'Masayoshi Nakatani', 'Jose Pedraza',
  'Liam Smith', 'Liam Williams', 'Chris Kongo', 'Conor Benn', 'Chris Eubank Jr',
];

function splitCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const records = [];
  let current   = '';
  let inQuotes  = false;
  for (const c of content) {
    if (c === '"') {
      inQuotes = !inQuotes;
      current += c;
    } else if (c === '\n' && !inQuotes) {
      const rec = current.replace(/\r$/, '').trim();
      if (rec) records.push(rec);
      current = '';
    } else {
      current += c;
    }
  }
  const rec = current.trim();
  if (rec) records.push(rec);

  const headers = splitCSVLine(records[0]);
  return { headers, rows: records.slice(1) };
}

function findHeader(headers, term) {
  return headers.findIndex(h => h.toLowerCase().includes(term.toLowerCase()));
}

function anonymise(inputPath, outputPath) {
  const { headers, rows } = parseCSV(inputPath);

  const nameIdx   = findHeader(headers, 'name');
  const genderIdx = findHeader(headers, 'gender');
  const emailIdx  = findHeader(headers, 'email');

  if (nameIdx === -1 || genderIdx === -1) {
    throw new Error('CSV must have "name" and "gender" columns');
  }

  let maleIndex   = 0;
  let femaleIndex = 0;
  const nameMap   = {};

  const anonymisedRows = rows.map(line => {
    const values = splitCSVLine(line);
    const gender = (values[genderIdx] || '').toLowerCase();

    let nameReplaced = false;

    if (gender === 'male' || gender === 'm') {
      const original = values[nameIdx];
      if (!nameMap[original]) {
        if (maleIndex >= FAMOUS_MALE_BOXERS.length) {
          throw new Error(`Ran out of male famous names at index ${maleIndex} — add more to the list`);
        }
        nameMap[original] = FAMOUS_MALE_BOXERS[maleIndex++];
      }
      values[nameIdx] = nameMap[original];
      nameReplaced = true;
    } else if (gender === 'female' || gender === 'f') {
      const original = values[nameIdx];
      if (!nameMap[original]) {
        if (femaleIndex >= FAMOUS_FEMALE_BOXERS.length) {
          throw new Error(`Ran out of female famous names at index ${femaleIndex} — add more to the list`);
        }
        nameMap[original] = FAMOUS_FEMALE_BOXERS[femaleIndex++];
      }
      values[nameIdx] = nameMap[original];
      nameReplaced = true;
    }

    if (emailIdx !== -1 && nameReplaced) {
      const parts = values[nameIdx].toLowerCase().split(' ');
      values[emailIdx] = `${parts[0]}.${parts[parts.length - 1]}@example.com`;
    }

    return values.map(v => (v.includes(',') || v.includes('\n') || v.includes('"') ? `"${v}"` : v)).join(',');
  });

  const headerLine = headers.map(h => (h.includes(',') ? `"${h}"` : h)).join(',');
  const output = [headerLine, ...anonymisedRows].join('\n') + '\n';
  fs.writeFileSync(outputPath, output, 'utf-8');

  return nameMap;
}

const inputPath  = path.join(__dirname, 'data', 'Registered Boxer2026.csv');
const outputPath = path.join(__dirname, 'data', 'Registered Boxer2026-anonymised.csv');

const nameMap = anonymise(inputPath, outputPath);

const maleCount   = Object.keys(nameMap).filter(k => FAMOUS_MALE_BOXERS.includes(nameMap[k])).length;
const femaleCount = Object.keys(nameMap).filter(k => FAMOUS_FEMALE_BOXERS.includes(nameMap[k])).length;
console.log(`✓ Anonymised ${maleCount} male boxers → ${outputPath}`);
console.log(`✓ Anonymised ${femaleCount} female boxers → ${outputPath}`);
