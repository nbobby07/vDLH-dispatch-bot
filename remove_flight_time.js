const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

// 1. Remove from slash command
content = content.replace(`                { name: 'flight_time', description: 'Actual Flight Time (e.g. 1h 15m)', type: 3, required: true },`, '');

// 2. Remove const flightTime
content = content.replace(`            const flightTime = interaction.options.getString('flight_time');`, '');

// 3. Remove from embed updates
content = content.replace(`.addFields({ name: 'Flight Time', value: flightTime, inline: true });`, '');
content = content.replace(`{ name: "Flight Time", value: flightTime, inline: true },`, '');
content = content.replace(`{ name: 'Flight Time', value: flightTime, inline: true },`, '');

fs.writeFileSync('index.js', content);
console.log('Removed flight time');
