/**
 * Generate SVG diagram from the Petri Net
 */

const fs = require('fs');

function createPetriNetSVG() {
  const width = 1400;
  const height = 2000;
  
  let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Gradient for places -->
    <linearGradient id="placeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#e0f7fa;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#b2ebf2;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="finalGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#c8e6c9;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a5d6a7;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="initialGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#fff9c4;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#fff59d;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Title -->
  <text x="${width/2}" y="30" font-family="Arial, sans-serif" font-size="24" font-weight="bold" text-anchor="middle">
    TSC 2025 Boxing Tournament - Petri Net
  </text>
  
  <!-- Legend -->
  <g transform="translate(20, 60)">
    <text x="0" y="0" font-family="Arial" font-size="14" font-weight="bold">Legend:</text>
    <circle cx="10" cy="20" r="15" fill="url(#initialGradient)" stroke="#f57f17" stroke-width="2"/>
    <text x="35" y="25" font-family="Arial" font-size="12">Initial State</text>
    
    <circle cx="10" cy="50" r="15" fill="url(#placeGradient)" stroke="#0277bd" stroke-width="2"/>
    <text x="35" y="55" font-family="Arial" font-size="12">Intermediate State</text>
    
    <circle cx="10" cy="80" r="15" fill="url(#finalGradient)" stroke="#2e7d32" stroke-width="2"/>
    <text x="35" y="85" font-family="Arial" font-size="12">Final Bucket</text>
    
    <rect x="-5" y="100" width="30" height="20" fill="#ffffff" stroke="#333" stroke-width="2"/>
    <text x="35" y="115" font-family="Arial" font-size="12">Transition (Filter)</text>
  </g>
`;

  // Define places with positions
  const places = [
    // Level 0 - Initial
    { id: 'AllBoxers', name: 'All Boxers', tokens: 137, x: 700, y: 180, type: 'initial' },
    
    // Level 1 - Fitness
    { id: 'NotFit', name: 'Not Fit', tokens: 1, x: 150, y: 300, type: 'final' },
    { id: 'Fit', name: 'Fit', tokens: 136, x: 1200, y: 300, type: 'intermediate' },
    
    // Level 2 - Gender
    { id: 'FitMales', name: 'Fit Males', tokens: 126, x: 700, y: 420, type: 'intermediate' },
    { id: 'FitFemales', name: 'Fit Females', tokens: 11, x: 1250, y: 420, type: 'intermediate' },
    
    // Level 3 - Age Groups (Males)
    { id: 'MaleJunior', name: 'Male Junior', tokens: 51, x: 250, y: 580, type: 'intermediate' },
    { id: 'MaleYouth', name: 'Male Youth', tokens: 28, x: 700, y: 580, type: 'intermediate' },
    { id: 'MaleSenior', name: 'Male Senior', tokens: 47, x: 1150, y: 580, type: 'intermediate' },
    
    // Level 3 - Age Groups (Females - Final)
    { id: 'FemaleJunior', name: 'Female Junior', tokens: 2, x: 1100, y: 700, type: 'final' },
    { id: 'FemaleYouth', name: 'Female Youth', tokens: 3, x: 1250, y: 700, type: 'final' },
    { id: 'FemaleSenior', name: 'Female Senior', tokens: 6, x: 1400, y: 700, type: 'final' },
    
    // Level 4 - Weight Classes
    { id: 'JuniorWC1', name: 'Jr WC1', tokens: 27, x: 150, y: 840, type: 'intermediate' },
    { id: 'JuniorWC2', name: 'Jr WC2', tokens: 24, x: 350, y: 840, type: 'intermediate' },
    { id: 'YouthWC1', name: 'Yt WC1', tokens: 13, x: 600, y: 840, type: 'intermediate' },
    { id: 'YouthWC2', name: 'Yt WC2', tokens: 15, x: 800, y: 840, type: 'intermediate' },
    { id: 'SeniorWC1', name: 'Sr WC1', tokens: 20, x: 1050, y: 840, type: 'intermediate' },
    { id: 'SeniorWC2', name: 'Sr WC2', tokens: 27, x: 1250, y: 840, type: 'intermediate' },
    
    // Level 5 - Final Buckets (Experience)
    // Junior WC1
    { id: 'JrWC1Nov', name: 'Jr WC1 Nov', tokens: 7, x: 100, y: 1100, type: 'final' },
    { id: 'JrWC1Exp', name: 'Jr WC1 Exp', tokens: 19, x: 200, y: 1100, type: 'final' },
    // Junior WC2
    { id: 'JrWC2Nov', name: 'Jr WC2 Nov', tokens: 12, x: 300, y: 1100, type: 'final' },
    { id: 'JrWC2Exp', name: 'Jr WC2 Exp', tokens: 12, x: 400, y: 1100, type: 'final' },
    // Youth WC1
    { id: 'YtWC1Nov', name: 'Yt WC1 Nov', tokens: 7, x: 550, y: 1100, type: 'final' },
    { id: 'YtWC1Exp', name: 'Yt WC1 Exp', tokens: 6, x: 650, y: 1100, type: 'final' },
    // Youth WC2
    { id: 'YtWC2Nov', name: 'Yt WC2 Nov', tokens: 7, x: 750, y: 1100, type: 'final' },
    { id: 'YtWC2Exp', name: 'Yt WC2 Exp', tokens: 8, x: 850, y: 1100, type: 'final' },
    // Senior WC1
    { id: 'SrWC1Nov', name: 'Sr WC1 Nov', tokens: 5, x: 1000, y: 1100, type: 'final' },
    { id: 'SrWC1Exp', name: 'Sr WC1 Exp', tokens: 15, x: 1100, y: 1100, type: 'final' },
    // Senior WC2
    { id: 'SrWC2Nov', name: 'Sr WC2 Nov', tokens: 12, x: 1200, y: 1100, type: 'final' },
    { id: 'SrWC2Exp', name: 'Sr WC2 Exp', tokens: 15, x: 1300, y: 1100, type: 'final' },
  ];

  // Define transitions
  const transitions = [
    // Fitness
    { id: 'T_NotFit', name: 'Not Fit', x: 150, y: 240, from: 'AllBoxers', to: 'NotFit' },
    { id: 'T_Fit', name: 'Is Fit', x: 1200, y: 240, from: 'AllBoxers', to: 'Fit' },
    
    // Gender
    { id: 'T_Male', name: 'Male', x: 700, y: 360, from: 'Fit', to: 'FitMales' },
    { id: 'T_Female', name: 'Female', x: 1250, y: 360, from: 'Fit', to: 'FitFemales' },
    
    // Male Age
    { id: 'T_Junior', name: '2009+', x: 250, y: 500, from: 'FitMales', to: 'MaleJunior' },
    { id: 'T_Youth', name: '2007-08', x: 700, y: 500, from: 'FitMales', to: 'MaleYouth' },
    { id: 'T_Senior', name: '≤2006', x: 1150, y: 500, from: 'FitMales', to: 'MaleSenior' },
    
    // Female Age (to final)
    { id: 'T_FJr', name: 'F Jr', x: 1100, y: 560, from: 'FitFemales', to: 'FemaleJunior' },
    { id: 'T_FYt', name: 'F Yt', x: 1250, y: 560, from: 'FitFemales', to: 'FemaleYouth' },
    { id: 'T_FSr', name: 'F Sr', x: 1400, y: 560, from: 'FitFemales', to: 'FemaleSenior' },
    
    // Weight Classes
    { id: 'T_JrWC1', name: '<60kg', x: 150, y: 710, from: 'MaleJunior', to: 'JuniorWC1' },
    { id: 'T_JrWC2', name: '≥60kg', x: 350, y: 710, from: 'MaleJunior', to: 'JuniorWC2' },
    { id: 'T_YtWC1', name: '<70kg', x: 600, y: 710, from: 'MaleYouth', to: 'YouthWC1' },
    { id: 'T_YtWC2', name: '≥70kg', x: 800, y: 710, from: 'MaleYouth', to: 'YouthWC2' },
    { id: 'T_SrWC1', name: '<70kg', x: 1050, y: 710, from: 'MaleSenior', to: 'SeniorWC1' },
    { id: 'T_SrWC2', name: '≥70kg', x: 1250, y: 710, from: 'MaleSenior', to: 'SeniorWC2' },
    
    // Experience (to final)
    { id: 'T_JrWC1N', name: '≤5', x: 100, y: 970, from: 'JuniorWC1', to: 'JrWC1Nov' },
    { id: 'T_JrWC1E', name: '>5', x: 200, y: 970, from: 'JuniorWC1', to: 'JrWC1Exp' },
    { id: 'T_JrWC2N', name: '≤5', x: 300, y: 970, from: 'JuniorWC2', to: 'JrWC2Nov' },
    { id: 'T_JrWC2E', name: '>5', x: 400, y: 970, from: 'JuniorWC2', to: 'JrWC2Exp' },
    { id: 'T_YtWC1N', name: '≤5', x: 550, y: 970, from: 'YouthWC1', to: 'YtWC1Nov' },
    { id: 'T_YtWC1E', name: '>5', x: 650, y: 970, from: 'YouthWC1', to: 'YtWC1Exp' },
    { id: 'T_YtWC2N', name: '≤5', x: 750, y: 970, from: 'YouthWC2', to: 'YtWC2Nov' },
    { id: 'T_YtWC2E', name: '>5', x: 850, y: 970, from: 'YouthWC2', to: 'YtWC2Exp' },
    { id: 'T_SrWC1N', name: '≤5', x: 1000, y: 970, from: 'SeniorWC1', to: 'SrWC1Nov' },
    { id: 'T_SrWC1E', name: '>5', x: 1100, y: 970, from: 'SeniorWC1', to: 'SrWC1Exp' },
    { id: 'T_SrWC2N', name: '≤5', x: 1200, y: 970, from: 'SeniorWC2', to: 'SrWC2Nov' },
    { id: 'T_SrWC2E', name: '>5', x: 1300, y: 970, from: 'SeniorWC2', to: 'SrWC2Exp' },
  ];

  // Draw arcs first (so they're behind)
  svg += '\n  <!-- Arcs -->\n  <g id="arcs">\n';
  
  transitions.forEach(trans => {
    const fromPlace = places.find(p => p.id === trans.from);
    const toPlace = places.find(p => p.id === trans.to);
    
    if (fromPlace) {
      // Arc from place to transition
      svg += `    <line x1="${fromPlace.x}" y1="${fromPlace.y}" x2="${trans.x}" y2="${trans.y}" 
        stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>\n`;
    }
    
    if (toPlace) {
      // Arc from transition to place
      svg += `    <line x1="${trans.x}" y1="${trans.y}" x2="${toPlace.x}" y2="${toPlace.y}" 
        stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>\n`;
    }
  });
  
  svg += '  </g>\n';

  // Draw places
  svg += '\n  <!-- Places -->\n  <g id="places">\n';
  
  places.forEach(place => {
    let fill, stroke;
    if (place.type === 'initial') {
      fill = 'url(#initialGradient)';
      stroke = '#f57f17';
    } else if (place.type === 'final') {
      fill = 'url(#finalGradient)';
      stroke = '#2e7d32';
    } else {
      fill = 'url(#placeGradient)';
      stroke = '#0277bd';
    }
    
    const radius = place.type === 'initial' ? 40 : 30;
    
    // Circle for place
    svg += `    <circle cx="${place.x}" cy="${place.y}" r="${radius}" 
      fill="${fill}" stroke="${stroke}" stroke-width="3"/>\n`;
    
    // Token count inside circle
    if (place.tokens > 0) {
      svg += `    <text x="${place.x}" y="${place.y + 5}" 
        font-family="Arial" font-size="16" font-weight="bold" 
        text-anchor="middle" fill="#000">${place.tokens}</text>\n`;
    }
    
    // Label below circle
    svg += `    <text x="${place.x}" y="${place.y + radius + 15}" 
      font-family="Arial" font-size="11" text-anchor="middle" fill="#000">${place.name}</text>\n`;
  });
  
  svg += '  </g>\n';

  // Draw transitions
  svg += '\n  <!-- Transitions -->\n  <g id="transitions">\n';
  
  transitions.forEach(trans => {
    // Rectangle for transition
    svg += `    <rect x="${trans.x - 20}" y="${trans.y - 10}" width="40" height="20" 
      fill="#ffffff" stroke="#333" stroke-width="2"/>\n`;
    
    // Label
    svg += `    <text x="${trans.x}" y="${trans.y + 4}" 
      font-family="Arial" font-size="9" text-anchor="middle" fill="#000">${trans.name}</text>\n`;
  });
  
  svg += '  </g>\n';

  // Add arrowhead marker
  svg = svg.replace('</defs>', `
    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#666" />
    </marker>
  </defs>`);

  // Summary box
  svg += `
  <!-- Summary -->
  <g transform="translate(20, 1200)">
    <rect x="0" y="0" width="350" height="180" fill="#f5f5f5" stroke="#333" stroke-width="2" rx="5"/>
    <text x="175" y="25" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">Summary</text>
    
    <text x="10" y="50" font-family="Arial" font-size="12">Total Boxers: 137</text>
    <text x="10" y="70" font-family="Arial" font-size="12">Not Fit: 1</text>
    <text x="10" y="90" font-family="Arial" font-size="12">Fit: 136 (126 M, 11 F)</text>
    
    <text x="10" y="115" font-family="Arial" font-size="12" font-weight="bold">Final Buckets: 16</text>
    <text x="10" y="135" font-family="Arial" font-size="11">• 1 Not Fit</text>
    <text x="10" y="150" font-family="Arial" font-size="11">• 3 Female (by age)</text>
    <text x="10" y="165" font-family="Arial" font-size="11">• 12 Male (age × weight × exp)</text>
  </g>
  
  <!-- Levels annotation -->
  <g transform="translate(400, 1200)">
    <rect x="0" y="0" width="300" height="180" fill="#fff9c4" stroke="#f57f17" stroke-width="2" rx="5"/>
    <text x="150" y="25" font-family="Arial" font-size="16" font-weight="bold" text-anchor="middle">Filter Levels</text>
    
    <text x="10" y="50" font-family="Arial" font-size="12">Level 1: Fitness Check</text>
    <text x="10" y="70" font-family="Arial" font-size="12">Level 2: Gender Split</text>
    <text x="10" y="90" font-family="Arial" font-size="12">Level 3: Age Groups</text>
    <text x="10" y="110" font-family="Arial" font-size="12">Level 4: Weight Classes</text>
    <text x="10" y="130" font-family="Arial" font-size="12">Level 5: Experience</text>
    
    <text x="10" y="155" font-family="Arial" font-size="11" font-style="italic">Each boxer flows down</text>
    <text x="10" y="170" font-family="Arial" font-size="11" font-style="italic">exactly one path</text>
  </g>
`;

  svg += '\n</svg>';
  
  return svg;
}

// Generate and save
const svg = createPetriNetSVG();
fs.writeFileSync('output/TSC_Boxing_PetriNet.svg', svg);

console.log('✓ SVG Petri Net created: output/TSC_Boxing_PetriNet.svg');
console.log('\nVisualization includes:');
console.log('- 33 Places (states)');
console.log('- 32 Transitions (filters)');
console.log('- Color-coded by type:');
console.log('  • Gold: Initial state (All Boxers)');
console.log('  • Light Blue: Intermediate states');
console.log('  • Light Green: Final buckets');
console.log('- Token counts shown in each place');
console.log('- Complete flow from 137 boxers to 16 final buckets');
console.log('\nYou can:');
console.log('- Open in any web browser');
console.log('- Edit in Inkscape, Adobe Illustrator, or any SVG editor');
console.log('- Include in documents/presentations');
