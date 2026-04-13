/**
 * Petri Net Representation of TSC 2025 Boxing Tournament
 * 
 * Places (circles) = States where boxers can be
 * Transitions (rectangles) = Filtering rules that move boxers between places
 * Tokens = Individual boxers
 * 
 * This generates a .pnml file (Petri Net Markup Language) that can be 
 * imported into tools like PIPE, CPN Tools, or Yasper
 */

const fs = require('fs');

/**
 * Create Petri Net in PNML format
 */
function createPetriNet() {
  let pnml = `<?xml version="1.0" encoding="UTF-8"?>
<pnml xmlns="http://www.pnml.org/version-2009/grammar/pnml">
  <net id="TSC_Boxing_Tournament" type="http://www.pnml.org/version-2009/grammar/ptnet">
    <name>
      <text>TSC 2025 Boxing Tournament - Hierarchical Filter</text>
    </name>
    <page id="main">
`;

  // Define Places (States)
  const places = [
    // Initial state
    { id: 'P_AllBoxers', name: 'All Boxers (137)', x: 400, y: 50 },
    
    // First split - Fitness
    { id: 'P_NotFit', name: 'Not Fit', x: 100, y: 150 },
    { id: 'P_Fit', name: 'Fit Boxers', x: 700, y: 150 },
    
    // Gender split
    { id: 'P_FitMales', name: 'Fit Males (126)', x: 500, y: 250 },
    { id: 'P_FitFemales', name: 'Fit Females (11)', x: 900, y: 250 },
    
    // Male age groups
    { id: 'P_MaleJunior', name: 'Male Junior (51)', x: 250, y: 350 },
    { id: 'P_MaleYouth', name: 'Male Youth (28)', x: 500, y: 350 },
    { id: 'P_MaleSenior', name: 'Male Senior (47)', x: 750, y: 350 },
    
    // Female age groups (final buckets)
    { id: 'P_FemaleJunior', name: 'Female Junior (2)', x: 850, y: 350, isFinal: true },
    { id: 'P_FemaleYouth', name: 'Female Youth (3)', x: 950, y: 350, isFinal: true },
    { id: 'P_FemaleSenior', name: 'Female Senior (6)', x: 1050, y: 350, isFinal: true },
    
    // Junior weight classes
    { id: 'P_JuniorWC1', name: 'Junior WC1 (27)', x: 150, y: 450 },
    { id: 'P_JuniorWC2', name: 'Junior WC2 (24)', x: 350, y: 450 },
    
    // Youth weight classes
    { id: 'P_YouthWC1', name: 'Youth WC1 (13)', x: 400, y: 450 },
    { id: 'P_YouthWC2', name: 'Youth WC2 (15)', x: 600, y: 450 },
    
    // Senior weight classes
    { id: 'P_SeniorWC1', name: 'Senior WC1 (20)', x: 650, y: 450 },
    { id: 'P_SeniorWC2', name: 'Senior WC2 (27)', x: 850, y: 450 },
    
    // Junior WC1 experience levels (final buckets)
    { id: 'P_JuniorWC1_Novice', name: 'Jr WC1 Novice (7)', x: 100, y: 550, isFinal: true },
    { id: 'P_JuniorWC1_Exp', name: 'Jr WC1 Exp (19)', x: 200, y: 550, isFinal: true },
    
    // Junior WC2 experience levels (final buckets)
    { id: 'P_JuniorWC2_Novice', name: 'Jr WC2 Novice (12)', x: 300, y: 550, isFinal: true },
    { id: 'P_JuniorWC2_Exp', name: 'Jr WC2 Exp (12)', x: 400, y: 550, isFinal: true },
    
    // Youth WC1 experience levels (final buckets)
    { id: 'P_YouthWC1_Novice', name: 'Yt WC1 Novice (7)', x: 350, y: 550, isFinal: true },
    { id: 'P_YouthWC1_Exp', name: 'Yt WC1 Exp (6)', x: 450, y: 550, isFinal: true },
    
    // Youth WC2 experience levels (final buckets)
    { id: 'P_YouthWC2_Novice', name: 'Yt WC2 Novice (7)', x: 550, y: 550, isFinal: true },
    { id: 'P_YouthWC2_Exp', name: 'Yt WC2 Exp (8)', x: 650, y: 550, isFinal: true },
    
    // Senior WC1 experience levels (final buckets)
    { id: 'P_SeniorWC1_Novice', name: 'Sr WC1 Novice (5)', x: 600, y: 550, isFinal: true },
    { id: 'P_SeniorWC1_Exp', name: 'Sr WC1 Exp (15)', x: 700, y: 550, isFinal: true },
    
    // Senior WC2 experience levels (final buckets)
    { id: 'P_SeniorWC2_Novice', name: 'Sr WC2 Novice (12)', x: 800, y: 550, isFinal: true },
    { id: 'P_SeniorWC2_Exp', name: 'Sr WC2 Exp (15)', x: 900, y: 550, isFinal: true },
  ];

  // Add places to PNML
  places.forEach(place => {
    const color = place.isFinal ? '#90EE90' : place.id === 'P_AllBoxers' ? '#FFD700' : '#87CEEB';
    pnml += `
      <place id="${place.id}">
        <name>
          <text>${place.name}</text>
          <graphics>
            <offset x="${place.x}" y="${place.y - 30}"/>
          </graphics>
        </name>
        <graphics>
          <position x="${place.x}" y="${place.y}"/>
          <dimension x="60" y="60"/>
          <fill>
            <color value="${color}"/>
          </fill>
        </graphics>
      </place>`;
  });

  // Define Transitions (Filtering Rules)
  const transitions = [
    // Fitness check
    { id: 'T_CheckFit', name: 'Check Fit', x: 100, y: 100 },
    { id: 'T_IsFit', name: 'Is Fit', x: 700, y: 100 },
    
    // Gender split
    { id: 'T_IsMale', name: 'Is Male', x: 500, y: 200 },
    { id: 'T_IsFemale', name: 'Is Female', x: 900, y: 200 },
    
    // Male age splits
    { id: 'T_IsJunior', name: 'YOB >= 2009', x: 250, y: 300 },
    { id: 'T_IsYouth', name: 'YOB 2007-2008', x: 500, y: 300 },
    { id: 'T_IsSenior', name: 'YOB <= 2006', x: 750, y: 300 },
    
    // Female age splits
    { id: 'T_FemaleJunior', name: 'F Junior', x: 850, y: 300 },
    { id: 'T_FemaleYouth', name: 'F Youth', x: 950, y: 300 },
    { id: 'T_FemaleSenior', name: 'F Senior', x: 1050, y: 300 },
    
    // Weight class splits
    { id: 'T_JuniorWC1', name: 'Weight < 60kg', x: 150, y: 400 },
    { id: 'T_JuniorWC2', name: 'Weight >= 60kg', x: 350, y: 400 },
    { id: 'T_YouthWC1', name: 'Weight < 70kg', x: 400, y: 400 },
    { id: 'T_YouthWC2', name: 'Weight >= 70kg', x: 600, y: 400 },
    { id: 'T_SeniorWC1', name: 'Weight < 70kg', x: 650, y: 400 },
    { id: 'T_SeniorWC2', name: 'Weight >= 70kg', x: 850, y: 400 },
    
    // Experience splits
    { id: 'T_JuniorWC1_Nov', name: 'Exp <= 5', x: 100, y: 500 },
    { id: 'T_JuniorWC1_Exp', name: 'Exp > 5', x: 200, y: 500 },
    { id: 'T_JuniorWC2_Nov', name: 'Exp <= 5', x: 300, y: 500 },
    { id: 'T_JuniorWC2_Exp', name: 'Exp > 5', x: 400, y: 500 },
    { id: 'T_YouthWC1_Nov', name: 'Exp <= 5', x: 350, y: 500 },
    { id: 'T_YouthWC1_Exp', name: 'Exp > 5', x: 450, y: 500 },
    { id: 'T_YouthWC2_Nov', name: 'Exp <= 5', x: 550, y: 500 },
    { id: 'T_YouthWC2_Exp', name: 'Exp > 5', x: 650, y: 500 },
    { id: 'T_SeniorWC1_Nov', name: 'Exp <= 5', x: 600, y: 500 },
    { id: 'T_SeniorWC1_Exp', name: 'Exp > 5', x: 700, y: 500 },
    { id: 'T_SeniorWC2_Nov', name: 'Exp <= 5', x: 800, y: 500 },
    { id: 'T_SeniorWC2_Exp', name: 'Exp > 5', x: 900, y: 500 },
  ];

  // Add transitions to PNML
  transitions.forEach(trans => {
    pnml += `
      <transition id="${trans.id}">
        <name>
          <text>${trans.name}</text>
          <graphics>
            <offset x="${trans.x}" y="${trans.y - 30}"/>
          </graphics>
        </name>
        <graphics>
          <position x="${trans.x}" y="${trans.y}"/>
          <dimension x="40" y="40"/>
          <fill>
            <color value="#FFFFFF"/>
          </fill>
        </graphics>
      </transition>`;
  });

  // Define Arcs (Connections)
  const arcs = [
    // From AllBoxers
    { from: 'P_AllBoxers', to: 'T_CheckFit' },
    { from: 'P_AllBoxers', to: 'T_IsFit' },
    
    // Fitness paths
    { from: 'T_CheckFit', to: 'P_NotFit' },
    { from: 'T_IsFit', to: 'P_Fit' },
    
    // Gender split
    { from: 'P_Fit', to: 'T_IsMale' },
    { from: 'P_Fit', to: 'T_IsFemale' },
    { from: 'T_IsMale', to: 'P_FitMales' },
    { from: 'T_IsFemale', to: 'P_FitFemales' },
    
    // Male age splits
    { from: 'P_FitMales', to: 'T_IsJunior' },
    { from: 'P_FitMales', to: 'T_IsYouth' },
    { from: 'P_FitMales', to: 'T_IsSenior' },
    { from: 'T_IsJunior', to: 'P_MaleJunior' },
    { from: 'T_IsYouth', to: 'P_MaleYouth' },
    { from: 'T_IsSenior', to: 'P_MaleSenior' },
    
    // Female age splits (to final buckets)
    { from: 'P_FitFemales', to: 'T_FemaleJunior' },
    { from: 'P_FitFemales', to: 'T_FemaleYouth' },
    { from: 'P_FitFemales', to: 'T_FemaleSenior' },
    { from: 'T_FemaleJunior', to: 'P_FemaleJunior' },
    { from: 'T_FemaleYouth', to: 'P_FemaleYouth' },
    { from: 'T_FemaleSenior', to: 'P_FemaleSenior' },
    
    // Junior weight splits
    { from: 'P_MaleJunior', to: 'T_JuniorWC1' },
    { from: 'P_MaleJunior', to: 'T_JuniorWC2' },
    { from: 'T_JuniorWC1', to: 'P_JuniorWC1' },
    { from: 'T_JuniorWC2', to: 'P_JuniorWC2' },
    
    // Youth weight splits
    { from: 'P_MaleYouth', to: 'T_YouthWC1' },
    { from: 'P_MaleYouth', to: 'T_YouthWC2' },
    { from: 'T_YouthWC1', to: 'P_YouthWC1' },
    { from: 'T_YouthWC2', to: 'P_YouthWC2' },
    
    // Senior weight splits
    { from: 'P_MaleSenior', to: 'T_SeniorWC1' },
    { from: 'P_MaleSenior', to: 'T_SeniorWC2' },
    { from: 'T_SeniorWC1', to: 'P_SeniorWC1' },
    { from: 'T_SeniorWC2', to: 'P_SeniorWC2' },
    
    // Junior WC1 experience splits
    { from: 'P_JuniorWC1', to: 'T_JuniorWC1_Nov' },
    { from: 'P_JuniorWC1', to: 'T_JuniorWC1_Exp' },
    { from: 'T_JuniorWC1_Nov', to: 'P_JuniorWC1_Novice' },
    { from: 'T_JuniorWC1_Exp', to: 'P_JuniorWC1_Exp' },
    
    // Junior WC2 experience splits
    { from: 'P_JuniorWC2', to: 'T_JuniorWC2_Nov' },
    { from: 'P_JuniorWC2', to: 'T_JuniorWC2_Exp' },
    { from: 'T_JuniorWC2_Nov', to: 'P_JuniorWC2_Novice' },
    { from: 'T_JuniorWC2_Exp', to: 'P_JuniorWC2_Exp' },
    
    // Youth WC1 experience splits
    { from: 'P_YouthWC1', to: 'T_YouthWC1_Nov' },
    { from: 'P_YouthWC1', to: 'T_YouthWC1_Exp' },
    { from: 'T_YouthWC1_Nov', to: 'P_YouthWC1_Novice' },
    { from: 'T_YouthWC1_Exp', to: 'P_YouthWC1_Exp' },
    
    // Youth WC2 experience splits
    { from: 'P_YouthWC2', to: 'T_YouthWC2_Nov' },
    { from: 'P_YouthWC2', to: 'T_YouthWC2_Exp' },
    { from: 'T_YouthWC2_Nov', to: 'P_YouthWC2_Novice' },
    { from: 'T_YouthWC2_Exp', to: 'P_YouthWC2_Exp' },
    
    // Senior WC1 experience splits
    { from: 'P_SeniorWC1', to: 'T_SeniorWC1_Nov' },
    { from: 'P_SeniorWC1', to: 'T_SeniorWC1_Exp' },
    { from: 'T_SeniorWC1_Nov', to: 'P_SeniorWC1_Novice' },
    { from: 'T_SeniorWC1_Exp', to: 'P_SeniorWC1_Exp' },
    
    // Senior WC2 experience splits
    { from: 'P_SeniorWC2', to: 'T_SeniorWC2_Nov' },
    { from: 'P_SeniorWC2', to: 'T_SeniorWC2_Exp' },
    { from: 'T_SeniorWC2_Nov', to: 'P_SeniorWC2_Novice' },
    { from: 'T_SeniorWC2_Exp', to: 'P_SeniorWC2_Exp' },
  ];

  // Add arcs to PNML
  let arcId = 1;
  arcs.forEach(arc => {
    pnml += `
      <arc id="A${arcId}" source="${arc.from}" target="${arc.to}">
        <inscription>
          <text>1</text>
        </inscription>
      </arc>`;
    arcId++;
  });

  pnml += `
    </page>
  </net>
</pnml>`;

  return pnml;
}

// Generate the Petri net
const pnml = createPetriNet();
fs.writeFileSync('output/TSC_Boxing_Tournament_PetriNet.pnml', pnml);

console.log('✓ Petri Net created: output/TSC_Boxing_Tournament_PetriNet.pnml');
console.log('\nPetri Net Structure:');
console.log('- Places (circles): States where boxers can be');
console.log('- Transitions (rectangles): Filtering rules');
console.log('- Arcs (arrows): Flow of boxers through the system');
console.log('\nColors:');
console.log('- Gold: Initial state (All Boxers)');
console.log('- Light Blue: Intermediate states');
console.log('- Light Green: Final buckets (16 total)');
console.log('\nYou can open this .pnml file in:');
console.log('- PIPE (Platform Independent Petri net Editor)');
console.log('- CPN Tools');
console.log('- Yasper');
console.log('- Or any Petri net visualization tool that supports PNML format');
