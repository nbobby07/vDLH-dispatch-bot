require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const { rows } = await pool.query('SELECT userId, flightCount, unlockedPlanes FROM users');
    console.log(`Found ${rows.length} users. Migrating...`);

    let migrated = 0;
    for (const row of rows) {
        const flightCount = row.flightcount;
        let newPlanes = [];
        
        let oldPlanes = [];
        try { oldPlanes = JSON.parse(row.unlockedplanes) || []; } catch(e){}
        
        newPlanes.push('A320neo');
        newPlanes.push('E190');
        
        if (flightCount >= 60) {
            if (oldPlanes.includes('A350') || oldPlanes.includes('B787')) {
                if (!newPlanes.includes('A350')) newPlanes.push('A350');
            }
            if (oldPlanes.includes('A330')) {
                if (!newPlanes.includes('A330')) newPlanes.push('A330');
            }
            if (oldPlanes.includes('B777F')) {
                if (!newPlanes.includes('B777F')) newPlanes.push('B777F');
            }
            if (!newPlanes.includes('A350') && !newPlanes.includes('A330') && !newPlanes.includes('B777F')) {
                 newPlanes.push('A350'); 
            }
        }
        
        if (flightCount >= 100) {
            if (!newPlanes.includes('A330') && newPlanes.includes('A350')) newPlanes.push('A330');
            else if (!newPlanes.includes('A350')) newPlanes.push('A350');
            else if (!newPlanes.includes('B777F')) newPlanes.push('B777F');
        }
        
        if (flightCount >= 150) {
            if (oldPlanes.includes('B747-8') || oldPlanes.includes('A380')) {
                if (oldPlanes.includes('B747-8')) newPlanes.push('B747-8');
                if (oldPlanes.includes('A380')) newPlanes.push('A380');
            } else {
                newPlanes.push('B747-8');
            }
        }
        
        if (flightCount >= 200) {
            if (!newPlanes.includes('B747-8')) newPlanes.push('B747-8');
            if (!newPlanes.includes('A380')) newPlanes.push('A380');
        }
        
        if (oldPlanes.includes('ATR72')) {
            newPlanes.push('ATR72');
        }

        newPlanes = [...new Set(newPlanes)];
        
        await pool.query('UPDATE users SET unlockedPlanes = $1 WHERE userId = $2', [JSON.stringify(newPlanes), row.userid]);
        migrated++;
    }
    
    console.log(`Migrated ${migrated} users.`);
    process.exit(0);
}

run();
