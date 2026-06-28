const fs = require('fs');
const path = require('path');

describe('Flight operations ordering in index.js', () => {
    let indexCode;

    beforeAll(() => {
        indexCode = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
    });

    test('manual approve path: incrementFlightCount must execute before clearActiveFlight', () => {
        // Find the manual approve section
        const manualApproveIndex = indexCode.indexOf('status: \'LANDED_MANUAL\'');
        expect(manualApproveIndex).toBeGreaterThan(-1);

        const afterManualApprove = indexCode.substring(manualApproveIndex, manualApproveIndex + 500);
        
        const incrementIdx = afterManualApprove.indexOf('incrementFlightCount');
        const clearIdx = afterManualApprove.indexOf('clearActiveFlight');

        expect(incrementIdx).toBeGreaterThan(-1);
        expect(clearIdx).toBeGreaterThan(-1);
        
        // incrementFlightCount should come before clearActiveFlight
        expect(incrementIdx).toBeLessThan(clearIdx);
    });

    test('AI approve path: incrementFlightCount must execute before clearActiveFlight', () => {
        // Find the AI approve section
        const aiApproveIndex = indexCode.indexOf('status: \'LANDED_AI\'');
        expect(aiApproveIndex).toBeGreaterThan(-1);

        const afterAiApprove = indexCode.substring(aiApproveIndex, aiApproveIndex + 500);
        
        const incrementIdx = afterAiApprove.indexOf('incrementFlightCount');
        const clearIdx = afterAiApprove.indexOf('clearActiveFlight');

        expect(incrementIdx).toBeGreaterThan(-1);
        expect(clearIdx).toBeGreaterThan(-1);
        
        // incrementFlightCount should come before clearActiveFlight
        expect(incrementIdx).toBeLessThan(clearIdx);
    });
});
