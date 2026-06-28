require('dotenv').config();
const db = require('./db');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

describe('Database Concurrency Test for addUnlockedPlane', () => {

    beforeAll(async () => {
        // Allow time for db.js initialization (table creation IIFE)
        await new Promise(resolve => setTimeout(resolve, 3000));
    });

    afterAll(async () => {
        // Clean up test users
        await pool.query('DELETE FROM users WHERE userId LIKE $1', ['test_user_%']);
        await pool.end();
    });

    it('should prevent concurrent updates from overriding each other', async () => {
        const userId = 'test_user_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        
        // Pre-create the user to ensure row exists and can be locked via FOR UPDATE
        await db.createUser(userId);
        
        const planes = Array.from({ length: 10 }, (_, i) => `Plane${i + 1}`);
        
        // Fire all additions concurrently
        await Promise.all(planes.map(plane => db.addUnlockedPlane(userId, plane)));
        
        // Fetch the user to verify
        const user = await db.getUser(userId);
        expect(user).not.toBeNull();
        
        // Check that all 10 planes were added successfully
        // Without FOR UPDATE, some planes would overwrite others because
        // multiple transactions would read the same array simultaneously.
        expect(user.unlockedPlanes.length).toBe(10);
        planes.forEach(plane => {
            expect(user.unlockedPlanes).toContain(plane);
        });
    }, 30000);
});
