const fs = require('fs');
let content = fs.readFileSync('index.js', 'utf8');

// The logic we want to extract is from `let autoApproved = false;` to the end of the `if (autoApproved)` block.
// Wait, the logic is very large. I'll just write a custom script to inject the button collector logic and carefully copy the AI logic from the source.

const buttonTarget = `        if (interaction.customId.startsWith('land_flight_')) {
            const pilotId = interaction.customId.replace('land_flight_', '');
            if (interaction.user.id !== pilotId) {
                return interaction.reply({ content: 'You can only land your own flight!', ephemeral: true });
            }
            return interaction.reply({ content: '🛬 **Time to land!**\\nPlease use the \`/land\` command in this channel. It will ask for your Flight Time and let you attach your screenshot directly!', ephemeral: true });
        }`;

const aiVerificationBlock = `
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
    "callsign": "string",
    "aircraft": "string",
    "departure": "string",
    "arrival": "string",
    "username": "string"
  }
}\`
                                }
                            ]
                        }
                    ],
                    config: { responseMimeType: "application/json" }
                });

                let aiOutput = response.text;
                aiOutput = aiOutput.replace(/\\\`\\\`\\\`json/g, "").replace(/\\\`\\\`\\\`/g, "").trim();
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
            }`;

const buttonReplacement = `        if (interaction.customId.startsWith('land_flight_')) {
            const pilotId = interaction.customId.replace('land_flight_', '');
            if (interaction.user.id !== pilotId) {
                return interaction.reply({ content: 'You can only land your own flight!', ephemeral: true });
            }
            
            const msgId = interaction.message.id;
            const liveChannelId = interaction.channelId;
            const guild = interaction.guild;
            const pilotUser = interaction.user;
            
            const originalMsg = interaction.message;
            const embedFields = originalMsg.embeds[0].fields;
            const callsignField = embedFields.find(f => f.name === 'Callsign');
            const aircraftField = embedFields.find(f => f.name === 'Aircraft');
            const routeField = embedFields.find(f => f.name === 'Route');

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
            try { pilotMember = await guild.members.fetch(pilotUser.id); } catch (err) {}
            const pilotDisplayName = pilotMember ? pilotMember.displayName : pilotUser.username;

            try {
                const dmChannel = await interaction.user.createDM();
                await dmChannel.send("📸 **Time to land!**\\n\\nPlease upload your flight screenshot right here in this DM to complete your active flight (\`" + callsign + "\`). You have 5 minutes.");
                await interaction.reply({ content: "📩 Check your DMs! I've sent you a secure link to upload your proof.", ephemeral: true });
                
                const filter = m => m.author.id === pilotId && m.attachments.size > 0;
                const collector = dmChannel.createMessageCollector({ filter, time: 300000, max: 1 });
                
                collector.on('collect', async m => {
                    const replyMsg = await m.reply("Processing with AI... ⏳");
                    const proof = m.attachments.first();
                    const proofUrl = proof.url;
                    
                    ${aiVerificationBlock}
                    
                    if (autoApproved) {
                        await db.incrementMetric('ai_auto_approved');
                        const flightsToAward = await getFlightsToAward(dep, arr);
                        const updatedUser = await db.incrementFlightCount(pilotUser.id, flightsToAward);
                        const boostText = flightsToAward > 1 ? \` (+\${flightsToAward} Route Boost!)\` : \`\`;
                        try {
                            const member = await guild.members.fetch(pilotUser.id);
                            const promo = await checkPromotions(member, updatedUser, guild);
                            
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

                        // Delete the original message from live flights
                        try { 
                            const liveChannel = await guild.channels.fetch(liveChannelId);
                            const msgToDelete = await liveChannel.messages.fetch(msgId);
                            await msgToDelete.delete(); 
                        } catch(e) { console.error("Failed to delete live flight msg", e); }
                        
                        let logsChannelId = await db.getSetting('LOG_CHANNEL_ID');
                        if (!logsChannelId) logsChannelId = config.LOGS_CHANNEL_ID;
                        if (logsChannelId) {
                            try {
                                const logsChannel = await guild.channels.fetch(logsChannelId);
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
                                
                                await logsChannel.threads.create({
                                    name: \`\${callsign} - \${pilotDisplayName}\`,
                                    message: { embeds: [embedFinal] },
                                    appliedTags: tags
                                });
                            } catch (e) {
                                console.error("Failed to post to forum channel:", e);
                            }
                        }

                        await replyMsg.edit({ content: "✅ Flight successfully landed and verified by AI! Check <#" + logsChannelId + "> for your record." });
                    } else {
                        await db.incrementMetric('ai_flagged');
                        
                        // Delete the original message from live flights
                        try { 
                            const liveChannel = await guild.channels.fetch(liveChannelId);
                            const msgToDelete = await liveChannel.messages.fetch(msgId);
                            await msgToDelete.delete(); 
                        } catch(e) { console.error("Failed to delete live flight msg", e); }
                        
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
                                const logsChannel = await guild.channels.fetch(logsChannelId);
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
                        
                        await replyMsg.edit({ content: "⚠️ Flight landed, but AI flagged the proof. It has been sent to Dispatch for manual review." });
                    }
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        dmChannel.send("❌ You didn't upload your screenshot within 5 minutes. If you still need to land, use the \`/land\` command in the bot commands channel.");
                    }
                });

            } catch (error) {
                console.error("Failed to DM user:", error);
                return interaction.reply({ content: '🛬 **Time to land!**\\nYour DMs are disabled! Please use the \`/land\` command in the bot channel to attach your screenshot directly.', ephemeral: true });
            }
        }`;

content = content.replace(buttonTarget, buttonReplacement);
fs.writeFileSync('index.js', content);
console.log('Injected DM Collector successfully');
