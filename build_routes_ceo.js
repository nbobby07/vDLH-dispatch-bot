const fs = require('fs');

const AIRPORT_MAP = {
    'IRFD': 'EDDF',
    'ISAU': 'EDDW',
    'IMLR': 'EDDH',
    'IBTH': 'EDDK',
    'IGRV': 'EGCC',
    'ISKP': 'EGHI',
    'IPAP': 'LEPA',
    'IZOL': 'LIRF',
    'ILAR': 'LGAV',
    'ITKO': 'RJTT',
    'IPPH': 'YPPH',
    'ILKL': 'EGLL'
};

const PAIRINGS = [
    // Domestic (~250nm, 01:00 time)
    { type: 'Domestic', dep: 'IRFD', arr: 'ISAU', wpts: 'EXMOR SEEKS', distance: 250, time: '01:00' },
    { type: 'Domestic', dep: 'IRFD', arr: 'IMLR', wpts: 'LOGAN SAWPE', distance: 260, time: '01:00' },
    { type: 'Domestic', dep: 'IRFD', arr: 'IBTH', wpts: 'JAMSIA SETHR', distance: 240, time: '01:00' },
    
    // Short Haul (~500nm, 01:45 time)
    { type: 'Short Haul', dep: 'IRFD', arr: 'IGRV', wpts: 'LOGAN SAU GOLDEN', distance: 510, time: '01:45' },
    { type: 'Short Haul', dep: 'IRFD', arr: 'ISKP', wpts: 'EXMOR ALDER', distance: 480, time: '01:45' },
    
    // Medium Haul (~1200nm, 02:45 time)
    { type: 'Medium Haul', dep: 'IRFD', arr: 'IPAP', wpts: 'LAZER KINDLE', distance: 1100, time: '02:45' },
    { type: 'Medium Haul', dep: 'IRFD', arr: 'IZOL', wpts: 'JAMSI CAWZE TRE', distance: 1250, time: '02:45' },
    { type: 'Medium Haul', dep: 'IRFD', arr: 'ILAR', wpts: 'LAZER GRASS', distance: 1350, time: '03:15' },
    
    // Long Haul (~4500nm, 10:30 time)
    { type: 'Long Haul', dep: 'IRFD', arr: 'ITKO', wpts: 'SETHR ALLRY HONDA', distance: 5200, time: '11:30' },
    { type: 'Long Haul', dep: 'IRFD', arr: 'IPPH', wpts: 'JAMSI SILVA STRAX', distance: 7500, time: '16:00' },
    
    // Cargo (~3000nm, 05:30 time)
    { type: 'Cargo', dep: 'IRFD', arr: 'ILKL', wpts: 'JAMSI SILVA STRAX', distance: 400, time: '01:30' },
    { type: 'Cargo', dep: 'IRFD', arr: 'IPPH', wpts: 'TINDR HONDA', distance: 4800, time: '12:00' }
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
