const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

// 1. Add Set to top
content = content.replace('const flightLogCooldowns = new Map();', 'const flightLogCooldowns = new Map();\nconst processingFlights = new Set();');

// 2. Add to approve handler
const approveTarget = `            if (isApprove) {
                await interaction.deferUpdate();`;
const approveReplacement = `            if (isApprove) {
                if (processingFlights.has(interaction.message.id)) {
                    return interaction.reply({ content: "Someone else is already processing this flight log!", ephemeral: true });
                }
                processingFlights.add(interaction.message.id);
                await interaction.deferUpdate();`;
content = content.replace(approveTarget, approveReplacement);

// 3. Add to deny_reason_modal_
const denyTarget = `        if (interaction.customId.startsWith('deny_reason_modal_')) {
            await interaction.deferReply({ ephemeral: true });
            const parts = interaction.customId.split('_');
            const pilotId = parts[3];
            const msgId = parts[4];`;
const denyReplacement = `        if (interaction.customId.startsWith('deny_reason_modal_')) {
            const parts = interaction.customId.split('_');
            const msgId = parts[4];
            if (processingFlights.has(msgId)) {
                return interaction.reply({ content: "Someone else is already processing this flight log!", ephemeral: true });
            }
            processingFlights.add(msgId);
            await interaction.deferReply({ ephemeral: true });
            const pilotId = parts[3];`;
content = content.replace(denyTarget, denyReplacement);

fs.writeFileSync('index.js', content);
console.log('Fixed race conditions');
