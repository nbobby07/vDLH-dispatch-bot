const fs = require('fs');
const path = require('path');

describe('Issue 109 - processingFlights memory leak prevention', () => {
    let indexCode;

    beforeAll(() => {
        indexCode = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    });

    test('approve workflow wraps logic in try...finally and deletes from processingFlights', () => {
        // Regex to match the structure in approve workflow
        const approveRegex = /processingFlights\.add\(interaction\.message\.id\);\s*try\s*\{[\s\S]*?\}\s*finally\s*\{\s*processingFlights\.delete\(interaction\.message\.id\);\s*\}/;
        expect(approveRegex.test(indexCode)).toBe(true);
    });

    test('deny workflow wraps logic in try...finally and deletes from processingFlights', () => {
        // Regex to match the structure in deny workflow
        const denyRegex = /processingFlights\.add\(msgId\);\s*try\s*\{[\s\S]*?\}\s*finally\s*\{\s*processingFlights\.delete\(msgId\);\s*\}/;
        expect(denyRegex.test(indexCode)).toBe(true);
    });
});
