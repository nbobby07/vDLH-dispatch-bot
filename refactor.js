const fs = require('fs');

let content = fs.readFileSync('index.js', 'utf8');

// The logic inside `flight-log` starts at line 453 and ends at 713 (where `} else if (interaction.commandName === 'leaderboard') {` begins).
// We will replace this entire chunk with the new `file` command logic.

const flightLogStartStr = "} else if (interaction.commandName === 'flight-log') {";
const leaderboardStartStr = "} else if (interaction.commandName === 'leaderboard') {";

const startIndex = content.indexOf(flightLogStartStr);
const endIndex = content.indexOf(leaderboardStartStr);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find start or end index.");
    process.exit(1);
}

const fileCommandLogic = `} else if (interaction.commandName === 'file') {
            const modal = new ModalBuilder()
                .setCustomId('file_flight_modal')
                .setTitle('Pre-Flight Dispatch');

            const callsignInput = new TextInputBuilder()
                .setCustomId('callsign')
                .setLabel('Callsign (e.g., DLH123)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const aircraftInput = new TextInputBuilder()
                .setCustomId('aircraft')
                .setLabel('Aircraft (e.g., A320neo)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const routeInput = new TextInputBuilder()
                .setCustomId('route')
                .setLabel('Route (e.g., EDDF - EGLL)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const depTimeInput = new TextInputBuilder()
                .setCustomId('depTime')
                .setLabel('Departure Time (Zulu)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(callsignInput),
                new ActionRowBuilder().addComponents(aircraftInput),
                new ActionRowBuilder().addComponents(routeInput),
                new ActionRowBuilder().addComponents(depTimeInput)
            );

            await interaction.showModal(modal);
        `;

content = content.substring(0, startIndex) + fileCommandLogic + content.substring(endIndex);


// Now we inject the modal handlers. We'll find `} else if (interaction.isModalSubmit()) {`
// and inject our `file_flight_modal` and `land_modal_` handlers.

const modalSubmitStartStr = "} else if (interaction.isModalSubmit()) {";
const modalSubmitIndex = content.indexOf(modalSubmitStartStr);

if (modalSubmitIndex === -1) {
    console.error("Could not find modal submit index.");
    process.exit(1);
}

const modalHandlers = `
        if (interaction.customId === 'file_flight_modal') {
            const callsign = interaction.fields.getTextInputValue('callsign');
            const aircraft = interaction.fields.getTextInputValue('aircraft');
            const route = interaction.fields.getTextInputValue('route');
            const depTime = interaction.fields.getTextInputValue('depTime');

            let liveChannelId = await db.getSetting('LIVE_FLIGHTS_CHANNEL_ID');
            if (!liveChannelId) liveChannelId = config.LIVE_FLIGHTS_CHANNEL_ID;
            
            if (!liveChannelId || liveChannelId.startsWith('REPLACE_')) {
                return interaction.reply({ content: 'LIVE_FLIGHTS_CHANNEL_ID is not configured.', ephemeral: true });
            }
            
            const liveChannel = await interaction.guild.channels.fetch(liveChannelId);

            const embed = new EmbedBuilder()
                .setTitle('🛫 Live Flight')
                .setColor('#0000FF') // Blue
                .addFields(
                    { name: 'Pilot', value: \`<@\${interaction.user.id}>\`, inline: true },
                    { name: 'Callsign', value: callsign, inline: true },
                    { name: 'Aircraft', value: aircraft, inline: true },
                    { name: 'Route', value: route, inline: true },
                    { name: 'Status', value: '🟢 En Route', inline: true }
                )
                .setFooter({ text: \`Departure: \${depTime || 'N/A'}\` })
                .setTimestamp();

            const landButton = new ButtonBuilder()
                .setCustomId(\`land_flight_\${interaction.user.id}\`)
                .setLabel('Land Flight')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(landButton);

            await liveChannel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: \`Your flight plan has been filed in <#\${liveChannelId}>!\`, ephemeral: true });
        }

        if (interaction.customId.startsWith('land_modal_')) {
            await interaction.deferReply({ ephemeral: true });
            const messageId = interaction.customId.replace('land_modal_', '');
            const flightTime = interaction.fields.getTextInputValue('flightTime');
            const proofUrl = interaction.fields.getTextInputValue('proof');

            let liveChannelId = await db.getSetting('LIVE_FLIGHTS_CHANNEL_ID');
            if (!liveChannelId) liveChannelId = config.LIVE_FLIGHTS_CHANNEL_ID;
            const liveChannel = await interaction.guild.channels.fetch(liveChannelId);
            const originalMsg = await liveChannel.messages.fetch(messageId);
            
            const embedFields = originalMsg.embeds[0].fields;
            const pilotField = embedFields.find(f => f.name === 'Pilot');
            const callsignField = embedFields.find(f => f.name === 'Callsign');
            const aircraftField = embedFields.find(f => f.name === 'Aircraft');
            const routeField = embedFields.find(f => f.name === 'Route');

            const pilotIdMatches = pilotField.value.match(/<@!?(\\d+)>/);
            const pilotId = pilotIdMatches ? pilotIdMatches[1] : interaction.user.id;
            const pilotUser = await client.users.fetch(pilotId);

            const callsign = callsignField.value;
            const aircraft = aircraftField.value;
            const route = routeField.value;
            
            let dep = "UNKNOWN";
            let arr = "UNKNOWN";
            if (route.includes('-')) {
                const parts = route.split('-');
                dep = parts[0].trim();
                arr = parts[1].trim();
            }

            let pilotMember = null;
            try { pilotMember = await interaction.guild.members.fetch(pilotUser.id); } catch (err) {}
            const pilotDisplayName = pilotMember ? pilotMember.displayName : pilotUser.username;

            let autoApproved = false;
            let aiReasoning = "AI verification failed or was not completely confident.";
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
                
                let imageResp;
                try { imageResp = await fetch(proofUrl, { signal: controller.signal }); } finally { clearTimeout(timeoutId); }
                
                const arrayBuffer = await imageResp.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { inlineData: { data: buffer.toString("base64"), mimeType: 'image/png' } },
                                {
                                    text: \`You are an AI Flight Dispatcher. Verify the flight log screenshot against the user's submission.

User Submission:
- Discord Username: \${pilotUser.username} (Global: \${pilotUser.globalName || 'none'}, Server Nickname: \${pilotDisplayName})
- Callsign: \${callsign}
- Aircraft: \${aircraft}
- Departure: \${dep}
- Arrival: \${arr}

Rules for Approval:
1. Username: The "PLAYER NAME" on screen must loosely match the Discord Username, Global Name, OR Server Nickname.
2. Departure and Arrival must match the submission exactly.
   *HINT*: In the flight info panel on the screenshot, the airport on the LEFT is the Departure, and the airport on the RIGHT is the Arrival. Do not swap them.
   *CRITICAL*: The screenshot uses custom in-game airport codes. You MUST map them to real-world ICAO codes before comparing:
   - IRFD -> EDDF
   - IMLR -> EDDH
   - ISOU -> LFPG
   - IKFL -> EGLL
   - IIZO -> LIRF
   - ILAR -> LGAV
   - IPAP -> LEPA
   - ITKO -> RJTT
   - IPPH -> EDDM
3. Aircraft: The aircraft name on screen can have slight variations compared to the submission. Allow fuzzy matching.
4. Callsign: The callsign on screen can have extra characters, dashes, or missing digits. Allow fuzzy matching.

Return a valid JSON object ONLY:
{
  "approved": boolean,
  "reasoning": "Short string explaining why it was approved or what mismatched.",
  "extracted": {
    "username": "...",
    "callsign": "...",
    "aircraft": "...",
    "departure": "...",
    "arrival": "..."
  }
}\`
                                }
                            ]
                        }
                    ],
                    config: { responseMimeType: "application/json" }
                });

                let aiOutput = response.text;
                aiOutput = aiOutput.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
                const data = JSON.parse(aiOutput);

                if (data.approved) {
                    autoApproved = true;
                    aiReasoning = data.reasoning || "AI perfectly matched and verified the log.";
                } else {
                    aiReasoning = data.reasoning || "AI mismatch detected.";
                    if (data.extracted) {
                        aiReasoning += \`\\nExtracted from image: \${data.extracted.callsign}, \${data.extracted.aircraft}, \${data.extracted.departure}, \${data.extracted.arrival}\`;
                    }
                }
            } catch (err) {
                console.error("OpenAI verification error:", err);
            }

            if (autoApproved) {
                await db.incrementMetric('ai_auto_approved');
                const flightsToAward = await getFlightsToAward(dep, arr);
                const updatedUser = await db.incrementFlightCount(pilotUser.id, flightsToAward);
                const boostText = flightsToAward > 1 ? \` (+\${flightsToAward} Route Boost!)\` : \`\`;
                try {
                    const member = await interaction.guild.members.fetch(pilotUser.id);
                    const promo = await checkPromotions(member, updatedUser, interaction.guild);
                    
                    if (promo.planeOptions.length > 0) {
                        const selectMenu = new StringSelectMenuBuilder()
                            .setCustomId('select_plane')
                            .setPlaceholder('Select your aircraft')
                            .addOptions(
                                promo.planeOptions.map(plane => 
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(plane)
                                        .setValue(plane)
                                )
                            );
                        const row = new ActionRowBuilder().addComponents(selectMenu);
                        
                        const embedD = new EmbedBuilder()
                            .setTitle("Flight Log Verified (AI)")
                            .setColor("#00FF00")
                            .setDescription(\`Congratulations! Your flight log was Auto-Approved by AI. You now have **\${updatedUser.flightCount}** flights.\\n\` +
                                            (promo.newRankName ? \`You have been promoted to **\${promo.newRankName}**!\\n\` : "") +
                                            \`Please select your new aircraft below:\`);
                        
                        await sendDM(member, { embeds: [embedD], components: [row] });
                    } else if (promo.newRankName) {
                        const embedD = new EmbedBuilder()
                            .setTitle("Flight Log Verified (AI)")
                            .setColor("#00FF00")
                            .setDescription(\`Congratulations! Your flight log was Auto-Approved by AI. You have reached **\${updatedUser.flightCount}** flights and have been promoted to **\${promo.newRankName}**!\`);
                        await sendDM(member, { embeds: [embedD] });
                    } else {
                        const embedD = new EmbedBuilder()
                        .setTitle("Flight Log Verified (AI)")
                        .setColor("#00FF00")
                        .setDescription(\`Your flight log for **\${callsign}** (\${dep} ➔ \${arr}) was automatically verified by AI.\\nYou now have **\${updatedUser.flightCount}** flights\${boostText}.\`);
                        await sendDM(member, { embeds: [embedD] });
                    }
                } catch (err) {
                    console.error("Error updating member on auto-approve:", err);
                }

                // Update the original live flights embed to Arrived
                const updatedEmbed = EmbedBuilder.from(originalMsg.embeds[0])
                    .setColor('#00FF00') // Green for arrived
                    .spliceFields(4, 1, { name: 'Status', value: '🛬 Arrived (Verified)', inline: true })
                    .addFields({ name: 'Flight Time', value: flightTime, inline: true });
                
                await originalMsg.edit({ embeds: [updatedEmbed], components: [] });
                
                let logsChannelId = await db.getSetting('LOG_CHANNEL_ID');
                if (!logsChannelId) logsChannelId = config.LOGS_CHANNEL_ID;
                if (logsChannelId) {
                    try {
                        const logsChannel = await interaction.guild.channels.fetch(logsChannelId);
                        const embedFinal = {
                            title: "Flight Log Auto-Approved (AI)",
                            color: 0x00ff00,
                            fields: [
                                { name: "Pilot", value: \`<@\${pilotUser.id}>\`, inline: true },
                                { name: "Callsign", value: callsign, inline: true },
                                { name: "Aircraft", value: aircraft, inline: true },
                                { name: "Route", value: route, inline: true },
                                { name: "Flight Time", value: flightTime, inline: true },
                                { name: "AI Reasoning", value: aiReasoning, inline: false }
                            ],
                            image: { url: proofUrl },
                            footer: { text: \`User ID: \${pilotUser.id}\` }
                        };
                        await logsChannel.send({ embeds: [embedFinal] });
                    } catch (e) {
                        console.error("Failed to post to logs channel:", e);
                    }
                }

                await interaction.editReply({ content: "Flight successfully logged and verified by AI!" });
            } else {
                await db.incrementMetric('ai_flagged');
                
                // Update the original live flights embed to Flagged
                const updatedEmbed = EmbedBuilder.from(originalMsg.embeds[0])
                    .setColor('#FFA500') // Orange for pending dispatcher
                    .spliceFields(4, 1, { name: 'Status', value: '🛬 Arrived (Pending Dispatcher)', inline: true })
                    .addFields(
                        { name: 'Flight Time', value: flightTime, inline: true },
                        { name: 'AI Check', value: aiReasoning, inline: false }
                    );

                const approveBtn = new ButtonBuilder()
                    .setCustomId(\`approve_flight_\${pilotUser.id}\`)
                    .setLabel("Approve")
                    .setStyle(ButtonStyle.Success);
                    
                const denyBtn = new ButtonBuilder()
                    .setCustomId(\`deny_flight_\${pilotUser.id}\`)
                    .setLabel("Deny")
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(approveBtn, denyBtn);
                
                await originalMsg.edit({ embeds: [updatedEmbed], components: [row] });
                await interaction.editReply({ content: "Flight landed, but AI flagged the proof for Dispatcher review." });
            }
        }
`;

content = content.substring(0, modalSubmitIndex + modalSubmitStartStr.length) + modalHandlers + content.substring(modalSubmitIndex + modalSubmitStartStr.length);


// Next, we need to add the land_flight button handler
const buttonStartStr = "} else if (interaction.isButton()) {";
const buttonIndex = content.indexOf(buttonStartStr);

const buttonHandlers = `
        if (interaction.customId.startsWith('land_flight_')) {
            const pilotId = interaction.customId.replace('land_flight_', '');
            if (interaction.user.id !== pilotId) {
                return interaction.reply({ content: 'You can only land your own flight!', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId(\`land_modal_\${interaction.message.id}\`)
                .setTitle('Flight Arrival');

            const flightTimeInput = new TextInputBuilder()
                .setCustomId('flightTime')
                .setLabel('Actual Flight Time (e.g. 1h 15m)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const proofInput = new TextInputBuilder()
                .setCustomId('proof')
                .setLabel('Screenshot Proof URL')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(flightTimeInput),
                new ActionRowBuilder().addComponents(proofInput)
            );

            await interaction.showModal(modal);
            return;
        }
`;

content = content.substring(0, buttonIndex + buttonStartStr.length) + buttonHandlers + content.substring(buttonIndex + buttonStartStr.length);

fs.writeFileSync('index.js', content);
console.log("Refactoring complete.");
