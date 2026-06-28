const { Pool } = require('pg');

jest.mock('pg', () => {
    const mockQuery = jest.fn();
    return {
        Pool: jest.fn(() => ({
            query: mockQuery,
            on: jest.fn(),
        })),
    };
});

describe('Issue #101 logFlightResolution', () => {
    let db;
    let poolInstance;

    beforeAll(() => {
        db = require('./db');
        poolInstance = new Pool();
    });

    beforeEach(() => {
        poolInstance.query.mockClear();
    });

    it('should resolve only the specific flight by flightId', async () => {
        const userId = 'user_123';
        const flightId = '999';
        const resolutionParams = {
            status: 'LANDED_MANUAL',
            flightsAwarded: 2,
            proofUrl: 'http://example.com/image.png',
            reviewedBy: 'reviewer_456'
        };

        await db.logFlightResolution(userId, flightId, resolutionParams);

        const queryCalls = poolInstance.query.mock.calls;
        expect(queryCalls.length).toBeGreaterThan(0);
        
        // Find the specific call for logFlightResolution
        const updateCall = queryCalls.find(call => call[0].includes('UPDATE flight_log'));
        expect(updateCall).toBeDefined();

        const [queryString, params] = updateCall;
        
        expect(queryString).toContain("WHERE userId = $1 AND flightId = $8 AND status = 'DISPATCHED'");
        
        expect(params).toEqual([
            userId,
            resolutionParams.status,
            resolutionParams.flightsAwarded,
            resolutionParams.proofUrl,
            null,
            resolutionParams.reviewedBy,
            null,
            flightId
        ]);
    });
});
