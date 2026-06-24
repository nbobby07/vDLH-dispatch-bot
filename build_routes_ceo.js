const fs = require('fs');

const PAIRINGS = [
    // Short Haul
    { type: 'Short Haul', dep: 'IRFD', arr: 'IPPH', wpts: 'JAMSI SILVA STRAX' },
    { type: 'Short Haul', dep: 'IRFD', arr: 'IMLR', wpts: 'LOGAN SAWPE' },
    { type: 'Short Haul', dep: 'IPPH', arr: 'IMLR', wpts: 'STRAX PROBE BUCFA' },
    { type: 'Short Haul', dep: 'IRFD', arr: 'ISAU', wpts: 'EXMOR SEEKS' },
    { type: 'Short Haul', dep: 'IPPH', arr: 'IZOL', wpts: 'TALIS DUNKS' },
    
    // Medium Haul
    { type: 'Medium Haul', dep: 'IRFD', arr: 'ILAR', wpts: 'LAZER GRASS' },
    { type: 'Medium Haul', dep: 'IPPH', arr: 'ILAR', wpts: 'CYRIL JUSTY' },
    { type: 'Medium Haul', dep: 'IPPH', arr: 'IKFL', wpts: 'DCT' },
    { type: 'Medium Haul', dep: 'IRFD', arr: 'IPAP', wpts: 'LAZER KINDLE' },
    
    // Long Haul
    { type: 'Long Haul', dep: 'IRFD', arr: 'ITKO', wpts: 'SETHR ALLRY HONDA' },
    { type: 'Long Haul', dep: 'IRFD', arr: 'IKFL', wpts: 'JAMSI SILVA STRAX' },
    { type: 'Long Haul', dep: 'IPPH', arr: 'IPAP', wpts: 'CYRIL JUSTY' },
    
    // Cargo
    { type: 'Cargo', dep: 'IRFD', arr: 'IKFL', wpts: 'JAMSI SILVA STRAX' },
    { type: 'Cargo', dep: 'IRFD', arr: 'ITKO', wpts: 'SETHR ALLRY HONDA' },
    { type: 'Cargo', dep: 'IPPH', arr: 'ITKO', wpts: 'TINDR HONDA' },
    { type: 'Cargo', dep: 'IRFD', arr: 'IZOL', wpts: 'JAMSI CAWZE TRE' },
    { type: 'Cargo', dep: 'IPPH', arr: 'IZOL', wpts: 'TALIS DUNKS' },
    { type: 'Cargo', dep: 'IRFD', arr: 'ILAR', wpts: 'LAZER GRASS' },
    { type: 'Cargo', dep: 'IPPH', arr: 'ILAR', wpts: 'CYRIL JUSTY' }
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
console.log("Successfully rebuilt routes.js for CEO with accurate PTFS waypoints");
