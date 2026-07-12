const fs = require('fs');
const path = require('path');
const config = require('../config');

describe('HAUL_PLANES config', () => {
  it('should be properly exported in config.js', () => {
    expect(config).toHaveProperty('HAUL_PLANES');
    expect(typeof config.HAUL_PLANES).toBe('object');
    
    // Check for some expected haul types
    const expectedHaulTypes = ['Domestic', 'Short Haul', 'Medium Haul', 'Long Haul', 'Cargo'];
    expectedHaulTypes.forEach(haulType => {
      expect(config.HAUL_PLANES).toHaveProperty(haulType);
      expect(Array.isArray(config.HAUL_PLANES[haulType])).toBe(true);
      expect(config.HAUL_PLANES[haulType].length).toBeGreaterThan(0);
    });
  });

  it('should be correctly accessed by index.js during route haul type filtering', () => {
    // We read the file content instead of requiring it to avoid triggering the bot initialization
    const indexPath = path.join(__dirname, '../index.js');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Ensure index.js requires the config
    expect(indexContent).toMatch(/(?:const|let|var)\s+config\s*=\s*require\(\s*['"]\.\/config['"]\s*\)/);
    
    // Ensure it accesses HAUL_PLANES using the route type
    expect(indexContent).toMatch(/config\.HAUL_PLANES\[.*route\.type.*\]/);
  });
});
