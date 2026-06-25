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

const settingsCache = new Map();
const usersCache = new Map();

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
        await pool.query(`
            CREATE TABLE IF NOT EXISTS metrics (
                key VARCHAR(255) PRIMARY KEY,
                count INTEGER DEFAULT 0
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS active_flights (
                userId VARCHAR(255) PRIMARY KEY,
                callsign VARCHAR(50),
                ofpText TEXT
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
        if (usersCache.has(userId)) return usersCache.get(userId);
        const { rows } = await pool.query('SELECT * FROM users WHERE userId = $1', [userId]);
        if (rows.length > 0) {
            const user = rows[0];
            const parsed = {
                userId: user.userid,
                flightCount: user.flightcount,
                unlockedPlanes: JSON.parse(user.unlockedplanes)
            };
            usersCache.set(userId, parsed);
            return parsed;
        }
        return null;
    },
    createUser: async (userId) => {
        await pool.query(
            'INSERT INTO users (userId, flightCount, unlockedPlanes) VALUES ($1, 0, $2) ON CONFLICT (userId) DO NOTHING',
            [userId, JSON.stringify([])]
        );
        const newUser = { userId, flightCount: 0, unlockedPlanes: [] };
        usersCache.set(userId, newUser);
        return newUser;
    },
    incrementFlightCount: async (userId, count = 1) => {
        usersCache.delete(userId);
        const { rows } = await pool.query(
            'INSERT INTO users (userId, flightCount, unlockedPlanes) VALUES ($1, $2, $3) ON CONFLICT (userId) DO UPDATE SET flightCount = users.flightCount + $2 RETURNING flightCount',
            [userId, count, JSON.stringify([])]
        );
        for (const id of getLinkedIds(userId)) {
            usersCache.delete(id);
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
            usersCache.delete(id);
            let user = await module.exports.getUser(id);
            if (!user) {
                user = await module.exports.createUser(id);
            }
            if (!user.unlockedPlanes.includes(plane)) {
                user.unlockedPlanes.push(plane);
                await pool.query('UPDATE users SET unlockedPlanes = $1 WHERE userId = $2', [JSON.stringify(user.unlockedPlanes), id]);
                usersCache.set(id, user);
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
        usersCache.delete(userId);
        await pool.query(
            'INSERT INTO users (userId, flightCount, unlockedPlanes) VALUES ($1, $2, $3) ON CONFLICT (userId) DO UPDATE SET flightCount = $2',
            [userId, count, JSON.stringify([])]
        );
        for (const id of getLinkedIds(userId)) {
            usersCache.delete(id);
            await pool.query(
                'INSERT INTO users (userId, flightCount, unlockedPlanes) VALUES ($1, $2, $3) ON CONFLICT (userId) DO UPDATE SET flightCount = $2',
                [id, count, JSON.stringify([])]
            );
        }
    },
    getSetting: async (key) => {
        if (settingsCache.has(key)) return settingsCache.get(key);
        const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
        const val = rows.length > 0 ? rows[0].value : null;
        settingsCache.set(key, val);
        return val;
    },
    setSetting: async (key, value) => {
        await pool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [key, value]
        );
        settingsCache.set(key, value);
    },
    incrementMetric: async (key) => {
        await pool.query(
            'INSERT INTO metrics (key, count) VALUES ($1, 1) ON CONFLICT (key) DO UPDATE SET count = metrics.count + 1',
            [key]
        );
    },
    getMetrics: async () => {
        const { rows } = await pool.query('SELECT * FROM metrics');
        const metrics = {};
        for (const r of rows) {
            metrics[r.key] = r.count;
        }
        return metrics;
    },
    setActiveFlight: async (userId, callsign, ofpText) => {
        await pool.query(
            'INSERT INTO active_flights (userId, callsign, ofpText) VALUES ($1, $2, $3) ON CONFLICT (userId) DO UPDATE SET callsign = $2, ofpText = $3',
            [userId, callsign, ofpText]
        );
    },
    getActiveFlight: async (query) => {
        let res;
        if (query.userId) {
            res = await pool.query('SELECT * FROM active_flights WHERE userId = $1', [query.userId]);
        } else if (query.callsign) {
            res = await pool.query('SELECT * FROM active_flights WHERE LOWER(callsign) = LOWER($1)', [query.callsign]);
        }
        return res && res.rows.length > 0 ? res.rows[0] : null;
    },
    clearActiveFlight: async (userId) => {
        await pool.query('DELETE FROM active_flights WHERE userId = $1', [userId]);
    }
};
