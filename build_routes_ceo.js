const fs = require('fs');

const AIRPORT_MAP = {
    'IRFD': 'EDDF',
    'IPPH': 'EDDM',
    'IMLR': 'EDDW',
    'ISAU': 'LFPG',
    'IZOL': 'LIRF',
    'ILAR': 'LGAV',
    'IKFL': 'EGLL',
    'IPAP': 'LEPA',
    'ITKO': 'RJTT'
};

const PAIRINGS = [
    // Domestic (~250nm, 01:00 time) - LHX Cityline only
    { type: 'Domestic', dep: 'IRFD', arr: 'IPPH', wpts: 'EXMOR SEEKS', distance: 160, time: '01:00' },
    { type: 'Domestic', dep: 'IRFD', arr: 'IMLR', wpts: 'LOGAN SAWPE', distance: 180, time: '01:00' },
    { type: 'Domestic', dep: 'IPPH', arr: 'IMLR', wpts: 'JAMSIA SETHR', distance: 250, time: '01:00' },
    
    // Short Haul (~500nm, 01:45 time)
    { type: 'Short Haul', dep: 'IRFD', arr: 'ISAU', wpts: 'LOGAN SAU GOLDEN', distance: 260, time: '01:15' },
    { type: 'Short Haul', dep: 'IPPH', arr: 'IZOL', wpts: 'EXMOR ALDER', distance: 380, time: '01:30' },
    
    // Medium Haul (~1200nm, 02:45 time)
    { type: 'Medium Haul', dep: 'IRFD', arr: 'ILAR', wpts: 'LAZER GRASS', distance: 1000, time: '02:45' },
    { type: 'Medium Haul', dep: 'IPPH', arr: 'ILAR', wpts: 'JAMSI CAWZE TRE', distance: 800, time: '02:15' },
    { type: 'Medium Haul', dep: 'IPPH', arr: 'IKFL', wpts: 'LAZER GRASS', distance: 500, time: '01:45' },
    { type: 'Medium Haul', dep: 'IRFD', arr: 'IPAP', wpts: 'JAMSI CAWZE TRE', distance: 680, time: '02:00' },
    
    // Long Haul (~4500nm, 10:30 time)
    { type: 'Long Haul', dep: 'IRFD', arr: 'ITKO', wpts: 'SETHR ALLRY HONDA', distance: 5100, time: '11:15' },
    { type: 'Long Haul', dep: 'IRFD', arr: 'IKFL', wpts: 'JAMSI SILVA STRAX', distance: 350, time: '01:30' },
    { type: 'Long Haul', dep: 'IPPH', arr: 'IPAP', wpts: 'JAMSI SILVA STRAX', distance: 630, time: '02:00' },
    
    // Cargo (~3000nm, 05:30 time)
    { type: 'Cargo', dep: 'IRFD', arr: 'IKFL', wpts: 'JAMSI SILVA STRAX', distance: 350, time: '01:30' },
    { type: 'Cargo', dep: 'IRFD', arr: 'ITKO', wpts: 'TINDR HONDA', distance: 5100, time: '11:15' },
    { type: 'Cargo', dep: 'IPPH', arr: 'ITKO', wpts: 'TINDR HONDA', distance: 5050, time: '11:10' },
    { type: 'Cargo', dep: 'IRFD', arr: 'IZOL', wpts: 'JAMSI SILVA STRAX', distance: 520, time: '01:45' },
    { type: 'Cargo', dep: 'IPPH', arr: 'IZOL', wpts: 'JAMSI SILVA STRAX', distance: 380, time: '01:30' },
    { type: 'Cargo', dep: 'IRFD', arr: 'ILAR', wpts: 'LAZER GRASS', distance: 1000, time: '02:45' },
    { type: 'Cargo', dep: 'IPPH', arr: 'ILAR', wpts: 'LAZER GRASS', distance: 800, time: '02:15' }
];

let routesOutput = "const ROUTES = [\n";
let idCounter = 1;

for (const pair of PAIRINGS) {
    const irlDep = AIRPORT_MAP[pair.dep] || pair.dep;
    const irlArr = AIRPORT_MAP[pair.arr] || pair.arr;
    
    // Forward route
    const routingFwd = `${pair.dep} RDV/DCT/Active SID ${pair.wpts} RDV/DCT/Active STAR ${pair.arr}`;
    routesOutput += `    { id: '${idCounter++}', type: '${pair.type}', departure: '${irlDep}', arrival: '${irlArr}', routing: '${routingFwd}', time: '${pair.time}', distance: ${pair.distance} },\n`;
    
    // Return route (reverse waypoints)
    const revWpts = pair.wpts.split(' ').reverse().join(' ');
    const routingRev = `${pair.arr} RDV/DCT/Active SID ${revWpts} RDV/DCT/Active STAR ${pair.dep}`;
    routesOutput += `    { id: '${idCounter++}', type: '${pair.type}', departure: '${irlArr}', arrival: '${irlDep}', routing: '${routingRev}', time: '${pair.time}', distance: ${pair.distance} },\n`;
}

routesOutput += "];\n\nmodule.exports = { ROUTES };\n";

fs.writeFileSync('C:\\Users\\Noel\\Desktop\\vBA bot\\routes.js', routesOutput);
console.log("Successfully rebuilt routes.js for CEO with accurate PTFS waypoints and IRL codes");
