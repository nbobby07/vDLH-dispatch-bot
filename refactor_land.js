const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

// 1. Add /land command to commands array
const fileCommandStr = `        {
            name: 'file',
            description: 'File a new flight plan and begin your journey'
        },`;
const landCommandStr = `        {
            name: 'file',
            description: 'File a new flight plan and begin your journey'
        },
        {
            name: 'land',
            description: 'Log your arrival and attach your proof',
            options: [
                { name: 'flight_time', description: 'Actual Flight Time (e.g. 1h 15m)', type: 3, required: true },
                { name: 'proof', description: 'Screenshot of the flight summary', type: 11, required: true }
            ]
        },`;
content = content.replace(fileCommandStr, landCommandStr);

// 2. Modify the land_flight_ button handler
const buttonStartStr = `        if (interaction.customId.startsWith('land_flight_')) {`;
const buttonEndStr = `            return;
        }`;

const btnStartIndex = content.indexOf(buttonStartStr);
const nextStr = content.indexOf(`if (interaction.customId.startsWith('approve_flight_')`, btnStartIndex);
// let's just replace the whole block by finding the bounds
if (btnStartIndex !== -1) {
    const btnEndIndex = content.indexOf(buttonEndStr, btnStartIndex) + buttonEndStr.length;
    
    const newBtnLogic = `        if (interaction.customId.startsWith('land_flight_')) {
            const pilotId = interaction.customId.replace('land_flight_', '');
            if (interaction.user.id !== pilotId) {
                return interaction.reply({ content: 'You can only land your own flight!', ephemeral: true });
            }
            return interaction.reply({ content: '🛬 **Time to land!**\\nPlease use the \`/land\` command in this channel. It will ask for your Flight Time and let you attach your screenshot directly!', ephemeral: true });
        }`;
        
    content = content.substring(0, btnStartIndex) + newBtnLogic + content.substring(btnEndIndex);
}

// 3. Move the land_modal_ logic to /land command
// First, extract the logic
const modalStartStr = `        if (interaction.customId.startsWith('land_modal_')) {`;
const modalStartIndex = content.indexOf(modalStartStr);
// The modal block ends before the end of the file or next modal. 
// It's the last block in `isModalSubmit()`, but wait, there is `deny_reason_modal_` above it?
// Let's just find `} else if (interaction.customId.startsWith('deny_reason_modal_')) {` or something.
// We can just use a regex or string extraction to pull the block out.

// Actually, it's easier to append the `land` command handler to `if (interaction.commandName === 'file') { ... }`
const fileCmdLogicStr = `            await interaction.showModal(modal);
        }`;
const fileCmdLogicIndex = content.indexOf(fileCmdLogicStr);

const landCommandLogic = `        } else if (interaction.commandName === 'land') {
            await interaction.deferReply({ ephemeral: false }); // Needs to be visible maybe? Or ephemeral. Let's do ephemeral so it doesn't clog.
            
            const flightTime = interaction.options.getString('flight_time');
            const proof = interaction.options.getAttachment('proof');
            const pilotUser = interaction.user;

            let liveChannelId = await db.getSetting('LIVE_FLIGHTS_CHANNEL_ID');
            if (!liveChannelId) liveChannelId = config.LIVE_FLIGHTS_CHANNEL_ID;
            
            const liveChannel = await interaction.guild.channels.fetch(liveChannelId);
            
            // Find the active flight embed
            const messages = await liveChannel.messages.fetch({ limit: 50 });
            const activeMsg = messages.find(m => {
                if (!m.embeds || m.embeds.length === 0) return false;
                const embed = m.embeds[0];
                const pilotField = embed.fields.find(f => f.name === 'Pilot');
                const statusField = embed.fields.find(f => f.name === 'Status');
                if (!pilotField || !statusField) return false;
                return pilotField.value.includes(pilotUser.id) && statusField.value.includes('En Route');
            });

            if (!activeMsg) {
                return interaction.editReply({ content: "❌ You don't have an active flight En Route. Please use \`/file\` first!" });
            }

            const originalMsg = activeMsg;
            const embedFields = originalMsg.embeds[0].fields;
            const callsignField = embedFields.find(f => f.name === 'Callsign');
            const aircraftField = embedFields.find(f => f.name === 'Aircraft');
            const routeField = embedFields.find(f => f.name === 'Route');

            const callsign = callsignField.value;
            const aircraft = aircraftField.value;
            const route = routeField.value;
            const proofUrl = proof.url;
            
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
                                { inlineData: { data: buffer.toString("base64"), mimeType: proof.contentType || 'image/png' } },
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
`;

content = content.substring(0, fileCmdLogicIndex + fileCmdLogicStr.length) + landCommandLogic + content.substring(fileCmdLogicIndex + fileCmdLogicStr.length);

// 4. Delete the old land_modal_ logic
const modalStartStr2 = `        if (interaction.customId.startsWith('land_modal_')) {`;
const modalStart2 = content.indexOf(modalStartStr2);
if (modalStart2 !== -1) {
    // We need to find the end of this block. It's at the end of the file or before another top level event.
    // Let's just find the closing bracket by counting `{` and `}` or using regex.
    // It's the last block in the file right now.
    // Let's just do a string slice.
    // The previous block was `        if (interaction.customId === 'file_flight_modal') { ... }`
    // Wait, the easiest way is to just replace it with empty string.
    const sliceEnd = content.indexOf(`});`, modalStart2); // client.on(Events.MessageCreate, ...) is before. 
    // Wait, `interactionCreate` ends with `});`
    let bracketCount = 0;
    let endIndex = modalStart2;
    for (let i = modalStart2; i < content.length; i++) {
        if (content[i] === '{') bracketCount++;
        if (content[i] === '}') {
            bracketCount--;
            if (bracketCount === 0) {
                endIndex = i + 1;
                break;
            }
        }
    }
    content = content.substring(0, modalStart2) + content.substring(endIndex);
}

fs.writeFileSync('index.js', content);
console.log('Done refactoring to /land');
