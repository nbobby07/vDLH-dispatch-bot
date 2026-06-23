const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

const targetStart = `                // Update the original live flights embed to Arrived`;
const targetEnd = `await interaction.editReply({ content: "Flight landed, but AI flagged the proof for Dispatcher review." });
            }`;

const startIndex = content.indexOf(targetStart);
const endIndex = content.indexOf(targetEnd) + targetEnd.length;

if (startIndex === -1 || content.indexOf(targetEnd) === -1) {
    console.error("Could not find replacement block!");
    process.exit(1);
}

const newLogic = `
                // Delete the original message from live flights
                try { await originalMsg.delete(); } catch(e) { console.error("Failed to delete live flight msg", e); }
                
                let logsChannelId = await db.getSetting('LOG_CHANNEL_ID');
                if (!logsChannelId) logsChannelId = config.LOGS_CHANNEL_ID;
                if (logsChannelId) {
                    try {
                        const logsChannel = await interaction.guild.channels.fetch(logsChannelId);
                        const embedFinal = {
                            title: "Flight Log Verified (AI)",
                            color: 0x00ff00,
                            fields: [
                                { name: "Pilot", value: \`<@\${pilotUser.id}>\`, inline: true },
                                { name: "Callsign", value: callsign, inline: true },
                                { name: "Aircraft", value: aircraft, inline: true },
                                { name: "Route", value: route, inline: true },
                                { name: "Status", value: '🛬 Arrived (Verified)', inline: true },
                                { name: "AI Reasoning", value: aiReasoning, inline: false }
                            ],
                            image: { url: proofUrl },
                            footer: { text: \`User ID: \${pilotUser.id}\` }
                        };
                        
                        let tags = [];
                        if (logsChannel.availableTags) {
                            const approvedTag = logsChannel.availableTags.find(t => t.name.toLowerCase() === 'approved');
                            if (approvedTag) tags.push(approvedTag.id);
                        }
                        
                        const pilotDisplayName = interaction.member ? interaction.member.displayName : pilotUser.username;
                        
                        await logsChannel.threads.create({
                            name: \`\${callsign} - \${pilotDisplayName}\`,
                            message: { embeds: [embedFinal] },
                            appliedTags: tags
                        });
                    } catch (e) {
                        console.error("Failed to post to forum channel:", e);
                    }
                }

                await interaction.editReply({ content: "✅ Flight successfully landed and verified by AI! Check <#" + logsChannelId + "> for your record." });
            } else {
                await db.incrementMetric('ai_flagged');
                
                // Delete the original message from live flights
                try { await originalMsg.delete(); } catch(e) { console.error("Failed to delete live flight msg", e); }
                
                const approveBtn = new ButtonBuilder()
                    .setCustomId(\`approve_flight_\${pilotUser.id}\`)
                    .setLabel("Approve")
                    .setStyle(ButtonStyle.Success);
                    
                const denyBtn = new ButtonBuilder()
                    .setCustomId(\`deny_flight_\${pilotUser.id}\`)
                    .setLabel("Deny")
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(approveBtn, denyBtn);
                
                let logsChannelId = await db.getSetting('LOG_CHANNEL_ID');
                if (!logsChannelId) logsChannelId = config.LOGS_CHANNEL_ID;
                if (logsChannelId) {
                    try {
                        const logsChannel = await interaction.guild.channels.fetch(logsChannelId);
                        const embedFinal = {
                            title: "Pending Dispatcher Review",
                            color: 0xffa500, // Orange
                            fields: [
                                { name: "Pilot", value: \`<@\${pilotUser.id}>\`, inline: true },
                                { name: "Callsign", value: callsign, inline: true },
                                { name: "Aircraft", value: aircraft, inline: true },
                                { name: "Route", value: route, inline: true },
                                { name: "Status", value: '🛬 Arrived (Pending Dispatcher)', inline: true },
                                { name: "AI Check", value: aiReasoning, inline: false }
                            ],
                            image: { url: proofUrl },
                            footer: { text: \`User ID: \${pilotUser.id}\` }
                        };
                        
                        let tags = [];
                        if (logsChannel.availableTags) {
                            const pendingTag = logsChannel.availableTags.find(t => t.name.toLowerCase() === 'pending');
                            if (pendingTag) tags.push(pendingTag.id);
                        }
                        
                        const pilotDisplayName = interaction.member ? interaction.member.displayName : pilotUser.username;
                        
                        await logsChannel.threads.create({
                            name: \`\${callsign} - \${pilotDisplayName}\`,
                            message: { 
                                content: \`<@&\${config.DISPATCHER_ROLE_ID}>\`,
                                embeds: [embedFinal],
                                components: [row]
                            },
                            appliedTags: tags
                        });
                    } catch (e) {
                        console.error("Failed to post to forum channel:", e);
                    }
                }
                
                await interaction.editReply({ content: "Flight landed, but AI flagged the proof. It has been sent to Dispatch for manual review." });
            }`;

content = content.substring(0, startIndex) + newLogic + content.substring(endIndex);

// Add logic to remove pending tag if present in approve handler
content = content.replace(
`                            const newTags = new Set(interaction.channel.appliedTags);
                            newTags.add(approvedTag.id);`,
`                            const newTags = new Set(interaction.channel.appliedTags);
                            const pendingTag = parentChannel.availableTags.find(t => t.name.toLowerCase() === 'pending');
                            if (pendingTag) newTags.delete(pendingTag.id);
                            newTags.add(approvedTag.id);`
);

// Add logic to remove pending tag if present in deny handler
content = content.replace(
`                            const newTags = new Set(interaction.channel.appliedTags);
                            newTags.add(deniedTag.id);`,
`                            const newTags = new Set(interaction.channel.appliedTags);
                            const pendingTag = parentChannel.availableTags.find(t => t.name.toLowerCase() === 'pending');
                            if (pendingTag) newTags.delete(pendingTag.id);
                            newTags.add(deniedTag.id);`
);

fs.writeFileSync('index.js', content);
console.log('Updated index.js successfully');
