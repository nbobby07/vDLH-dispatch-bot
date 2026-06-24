const fs = require('fs');

const PAIRINGS = [
    // Short Haul
    { type: 'Short Haul', dep: 'IRFD', arr: 'IPPH', wpts: 'TOBAK KEMAD' },
    { type: 'Short Haul', dep: 'IRFD', arr: 'IMLR', wpts: 'ROBUX MUONE' },
    { type: 'Short Haul', dep: 'IPPH', arr: 'IMLR', wpts: 'TINDR ONDER' },
    { type: 'Short Haul', dep: 'IRFD', arr: 'ISAU', wpts: 'STACK HOGGS' },
    { type: 'Short Haul', dep: 'IPPH', arr: 'IZOL', wpts: 'DOGGO MORRD' },
    
    // Medium Haul
    { type: 'Medium Haul', dep: 'IRFD', arr: 'ILAR', wpts: 'LAZER IHEN' },
    { type: 'Medium Haul', dep: 'IPPH', arr: 'ILAR', wpts: 'SISTA JACKI' },
    { type: 'Medium Haul', dep: 'IPPH', arr: 'IKFL', wpts: 'WELLS SQUID' },
    { type: 'Medium Haul', dep: 'IRFD', arr: 'IPAP', wpts: 'PEPUL IBAR' },
    
    // Long Haul
    { type: 'Long Haul', dep: 'IRFD', arr: 'ITKO', wpts: 'TUDEP ASTRO' },
    { type: 'Long Haul', dep: 'IRFD', arr: 'IKFL', wpts: 'BLANK FROOT' },
    { type: 'Long Haul', dep: 'IPPH', arr: 'IPAP', wpts: 'DUNKS IPAP' },
    
    // Cargo
    { type: 'Cargo', dep: 'IRFD', arr: 'IKFL', wpts: 'BLANK FROOT' },
    { type: 'Cargo', dep: 'IRFD', arr: 'ITKO', wpts: 'TUDEP ASTRO' },
    { type: 'Cargo', dep: 'IPPH', arr: 'ITKO', wpts: 'LETSE SHIBA' },
    { type: 'Cargo', dep: 'IRFD', arr: 'IZOL', wpts: 'OCEEN TRESIN' },
    { type: 'Cargo', dep: 'IPPH', arr: 'IZOL', wpts: 'DOGGO MORRD' },
    { type: 'Cargo', dep: 'IRFD', arr: 'ILAR', wpts: 'LAZER IHEN' },
    { type: 'Cargo', dep: 'IPPH', arr: 'ILAR', wpts: 'SISTA JACKI' }
];

let routesOutput = "const ROUTES = [\n";
let idCounter = 1;

for (const pair of PAIRINGS) {
    // Forward route
    const routingFwd = `${pair.dep} RDV/DCT/Active SID ${pair.wpts} RDV/DCT/Active STAR ${pair.arr}`;
    routesOutput += `    { id: '${idCounter++}', type: '${pair.type}', departure: '${pair.dep}', arrival: '${pair.arr}', routing: '${routingFwd}' },\n`;
    
    // Return route (reverse waypoints)
    const revWpts = pair.wpts.split(' ').reverse().join(' ');
    const routingRev = `${pair.arr} RDV/DCT/Active SID ${revWpts} RDV/DCT/Active STAR ${pair.dep}`;
    routesOutput += `    { id: '${idCounter++}', type: '${pair.type}', departure: '${pair.arr}', arrival: '${pair.dep}', routing: '${routingRev}' },\n`;
}

routesOutput += "];\n\nmodule.exports = { ROUTES };\n";

fs.writeFileSync('C:\\Users\\Noel\\Desktop\\vBA bot\\routes.js', routesOutput);
console.log("Successfully rebuilt routes.js for CEO");
