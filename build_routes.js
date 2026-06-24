const fs = require('fs');

const AIRPORTS = {
    'IRFD': { SIDs: ['LOGAN', 'OSHNN', 'ROCKFORD', 'KENED'], STARs: ['MATRX', 'MELLOR', 'SUNST', 'GORDO'] },
    'IPPH': { SIDs: ['PERTH', 'CAMEL', 'DINER'], STARs: ['SISTA', 'TALIS', 'HONDA'] },
    'IMLR': { SIDs: ['MELLOR', 'SAWPE', 'BEANS'], STARs: ['BUCFA', 'URMOM', 'BIGDY'] },
    'ISAU': { SIDs: ['SAUTHEMPTONA', 'BORDER'], STARs: ['ALDER', 'GEORG'] },
    'IZOL': { SIDs: ['IZOL'], STARs: ['IZOL'] }, // Missing in aeronav
    'ILAR': { SIDs: ['LARNACA', 'ODOKU', 'GRASS'], STARs: ['LUBAN', 'SOUTHERN', 'WESTERN'] },
    'IKFL': { SIDs: ['IKFL'], STARs: ['IKFL'] }, // Missing in aeronav
    'IPAP': { SIDs: ['PAPHOS', 'KINDLE'], STARs: ['JAMSI', 'JUSTY'] },
    'ITKO': { SIDs: ['TOKYO', 'ASTRO', 'ONDER'], STARs: ['GULEG', 'PIPER', 'KNIFE'] }
};

const PAIRINGS = [
    // Short Haul
    { type: 'Short Haul', dep: 'IRFD', arr: 'IPPH' },
    { type: 'Short Haul', dep: 'IRFD', arr: 'IMLR' },
    { type: 'Short Haul', dep: 'IPPH', arr: 'IMLR' },
    { type: 'Short Haul', dep: 'IRFD', arr: 'ISAU' },
    { type: 'Short Haul', dep: 'IPPH', arr: 'IZOL' },
    
    // Medium Haul
    { type: 'Medium Haul', dep: 'IRFD', arr: 'ILAR' },
    { type: 'Medium Haul', dep: 'IPPH', arr: 'ILAR' },
    { type: 'Medium Haul', dep: 'IPPH', arr: 'IKFL' },
    { type: 'Medium Haul', dep: 'IRFD', arr: 'IPAP' },
    
    // Long Haul
    { type: 'Long Haul', dep: 'IRFD', arr: 'ITKO' },
    { type: 'Long Haul', dep: 'IRFD', arr: 'IKFL' },
    { type: 'Long Haul', dep: 'IPPH', arr: 'IPAP' },
    
    // Cargo
    { type: 'Cargo', dep: 'IRFD', arr: 'IKFL' },
    { type: 'Cargo', dep: 'IRFD', arr: 'ITKO' },
    { type: 'Cargo', dep: 'IPPH', arr: 'ITKO' },
    { type: 'Cargo', dep: 'IRFD', arr: 'IZOL' },
    { type: 'Cargo', dep: 'IPPH', arr: 'IZOL' },
    { type: 'Cargo', dep: 'IRFD', arr: 'ILAR' },
    { type: 'Cargo', dep: 'IPPH', arr: 'ILAR' }
];

let routesOutput = "const ROUTES = [\n";
let idCounter = 1;

for (const pair of PAIRINGS) {
    // Forward route
    const sidFwd = AIRPORTS[pair.dep]?.SIDs[0] || pair.dep;
    const starFwd = AIRPORTS[pair.arr]?.STARs[0] || pair.arr;
    const routingFwd = `${pair.dep} ${sidFwd}1 ${sidFwd} DCT ${starFwd} ${starFwd}1 ${pair.arr}`;
    
    routesOutput += `    { id: '${idCounter++}', type: '${pair.type}', departure: '${pair.dep}', arrival: '${pair.arr}', routing: '${routingFwd}' },\n`;
    
    // Return route
    const sidRev = AIRPORTS[pair.arr]?.SIDs[0] || pair.arr;
    const starRev = AIRPORTS[pair.dep]?.STARs[0] || pair.dep;
    const routingRev = `${pair.arr} ${sidRev}1 ${sidRev} DCT ${starRev} ${starRev}1 ${pair.dep}`;
    
    routesOutput += `    { id: '${idCounter++}', type: '${pair.type}', departure: '${pair.arr}', arrival: '${pair.dep}', routing: '${routingRev}' },\n`;
}

routesOutput += "];\n\nmodule.exports = { ROUTES };\n";

fs.writeFileSync('C:\\Users\\Noel\\Desktop\\vBA bot\\routes.js', routesOutput);
console.log("Successfully rebuilt routes.js");
