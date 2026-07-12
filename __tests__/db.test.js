jest.mock('pg', () => {
    const mPool = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        on: jest.fn(),
    };
    return { Pool: jest.fn(() => mPool) };
});

const { Pool } = require('pg');
const db = require('../db');

describe('db.js', () => {
    let pool;
    
    beforeAll(() => {
        pool = new Pool();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getAllPilots', () => {
        it('should query with default limit and offset', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ userid: '1', flightcount: 10 }] });
            const result = await db.getAllPilots();
            
            expect(pool.query).toHaveBeenCalledWith(
                'SELECT userId, flightCount FROM users ORDER BY flightCount DESC LIMIT $1 OFFSET $2',
                [10, 0]
            );
            expect(result).toEqual([{ userId: '1', flightCount: 10 }]);
        });

        it('should query with provided limit and offset', async () => {
            pool.query.mockResolvedValueOnce({ rows: [] });
            await db.getAllPilots(5, 15);
            
            expect(pool.query).toHaveBeenCalledWith(
                'SELECT userId, flightCount FROM users ORDER BY flightCount DESC LIMIT $1 OFFSET $2',
                [5, 15]
            );
        });
    });

    describe('getTotalPilotsCount', () => {
        it('should return the total count of users parsed as integer', async () => {
            pool.query.mockResolvedValueOnce({ rows: [{ count: '42' }] });
            const result = await db.getTotalPilotsCount();
            
            expect(pool.query).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM users');
            expect(result).toBe(42);
        });
    });
});
