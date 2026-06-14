const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle database client', err);
});

// Create tables on startup
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                userId VARCHAR(255) PRIMARY KEY,
                flightCount INTEGER DEFAULT 0,
                unlockedPlanes TEXT DEFAULT '[]'
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(255) PRIMARY KEY,
                value TEXT
            )
        `);
    } catch (err) {
        console.error("Failed to initialize database:", err);
    }
})();

const LINKED_ACCOUNTS = ['1031613511677251594', '1498411117150605373'];

function getLinkedIds(userId) {
    if (LINKED_ACCOUNTS.includes(userId)) {
        return LINKED_ACCOUNTS.filter(id => id !== userId);
    }
    return [];
}

module.exports = {
    getUser: async (userId) => {
        const { rows } = await pool.query('SELECT * FROM users WHERE userId = $1', [userId]);
        if (rows.length > 0) {
            const user = rows[0];
            return {
                userId: user.userid,
                flightCount: user.flightcount,
                unlockedPlanes: JSON.parse(user.unlockedplanes)
            };
        }
        return null;
    },
    createUser: async (userId) => {
        await pool.query(
            'INSERT INTO users (userId, flightCount, unlockedPlanes) VALUES ($1, 0, $2) ON CONFLICT (userId) DO NOTHING',
            [userId, JSON.stringify([])]
        );
        return { userId, flightCount: 0, unlockedPlanes: [] };
    },
    incrementFlightCount: async (userId, count = 1) => {
        const { rows } = await pool.query(
            'INSERT INTO users (userId, flightCount, unlockedPlanes) VALUES ($1, $2, $3) ON CONFLICT (userId) DO UPDATE SET flightCount = users.flightCount + $2 RETURNING flightCount',
            [userId, count, JSON.stringify([])]
        );
        for (const id of getLinkedIds(userId)) {
            await pool.query(
                'INSERT INTO users (userId, flightCount, unlockedPlanes) VALUES ($1, $2, $3) ON CONFLICT (userId) DO UPDATE SET flightCount = users.flightCount + $2',
                [id, count, JSON.stringify([])]
            );
        }
        return { flightCount: rows[0].flightcount };
    },
    addUnlockedPlane: async (userId, plane) => {
        const targetIds = [userId, ...getLinkedIds(userId)];
        for (const id of targetIds) {
            let user = await module.exports.getUser(id);
            if (!user) {
                user = await module.exports.createUser(id);
            }
            if (!user.unlockedPlanes.includes(plane)) {
                user.unlockedPlanes.push(plane);
                await pool.query('UPDATE users SET unlockedPlanes = $1 WHERE userId = $2', [JSON.stringify(user.unlockedPlanes), id]);
            }
        }
    },
    getTopPilots: async (limit) => {
        const { rows } = await pool.query('SELECT userId, flightCount FROM users ORDER BY flightCount DESC LIMIT $1', [limit]);
        return rows.map(r => ({ userId: r.userid, flightCount: r.flightcount }));
    },
    getAllPilots: async () => {
        const { rows } = await pool.query('SELECT userId, flightCount FROM users ORDER BY flightCount DESC');
        return rows.map(r => ({ userId: r.userid, flightCount: r.flightcount }));
    },
    setFlightCount: async (userId, count) => {
        await pool.query(
            'INSERT INTO users (userId, flightCount, unlockedPlanes) VALUES ($1, $2, $3) ON CONFLICT (userId) DO UPDATE SET flightCount = $2',
            [userId, count, JSON.stringify([])]
        );
        for (const id of getLinkedIds(userId)) {
            await pool.query(
                'INSERT INTO users (userId, flightCount, unlockedPlanes) VALUES ($1, $2, $3) ON CONFLICT (userId) DO UPDATE SET flightCount = $2',
                [id, count, JSON.stringify([])]
            );
        }
    },
    getSetting: async (key) => {
        const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
        return rows.length > 0 ? rows[0].value : null;
    },
    setSetting: async (key, value) => {
        await pool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [key, value]
        );
    }
};
