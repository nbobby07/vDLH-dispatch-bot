require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, REST, Routes, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('./db');
const config = require('./config');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');


const flightLogCooldowns = new Map();
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel]
});

// Helper to send audit log
async function sendAuditLog(guild, message) {
    const channelId = await db.getSetting('AUDIT_CHANNEL_ID');
    if (!channelId) return;
    try {
        const channel = await guild.channels.fetch(channelId);
        if (channel) await channel.send(message);
    } catch (err) {
        console.error("Failed to send audit log:", err);
    }
}

// Helper function to check promotions
async function checkPromotions(member, userRecord, guild) {
    let newRankRole = null;
    let newRankName = null;
    let planeOptions = [];
    
    // Find the highest promotion tier the user qualifies for
    let currentTierIndex = -1;
    for (let i = config.PROMOTIONS.length - 1; i >= 0; i--) {
        if (userRecord.flightCount >= config.PROMOTIONS[i].flightsRequired) {
            currentTierIndex = i;
            break;
        }
    }
    
    if (currentTierIndex !== -1) {
        const tier = config.PROMOTIONS[currentTierIndex];
        
        // Remove previous rank roles
        for (let j = 0; j < currentTierIndex; j++) {
            const oldTier = config.PROMOTIONS[j];
            if (oldTier.rankRoleId !== "NO ROLE FOR THIS RANK" && 
                !oldTier.rankRoleId.startsWith("ROLE_ID_") && 
                oldTier.rankRoleId !== tier.rankRoleId && 
                member.roles.cache.has(oldTier.rankRoleId)) {
                try {
                    await member.roles.remove(oldTier.rankRoleId);
                } catch (err) {
                    console.error("Failed to remove old rank role:", err);
                }
            }
        }
        
        // Check if they just hit the exact flight requirement for a promotion
        if (userRecord.flightCount === tier.flightsRequired) {
            newRankName = tier.rankName;
            
            if (tier.rankRoleId !== "NO ROLE FOR THIS RANK" && !tier.rankRoleId.startsWith("ROLE_ID_")) {
                try {
                    await member.roles.add(tier.rankRoleId);
                    newRankRole = tier.rankRoleId;
                } catch (err) {
                    console.error("Failed to add rank role:", err);
                }
            }
            
            if (tier.flightsRequired > 0) { // Don't announce cadet rank
                await sendAuditLog(guild, `**Promotion**: <@${member.id}> has been promoted to **${tier.rankName}**! (Flights: ${userRecord.flightCount})`);
            }
        } else if (tier.rankRoleId !== "NO ROLE FOR THIS RANK" && !tier.rankRoleId.startsWith("ROLE_ID_") && !member.roles.cache.has(tier.rankRoleId)) {
            // Catch-up: they have the flights but are missing the role
            try {
                await member.roles.add(tier.rankRoleId);
            } catch (err) {
                console.error("Failed to catch-up rank role:", err);
            }
        }
        
        // Determine what planes they could unlock at this tier
        let optionsToPickFrom = tier.unlocks;
        
        // Let's check what they already unlocked from these options
        const alreadyUnlockedFromThisTier = optionsToPickFrom.filter(p => userRecord.unlockedPlanes.includes(p));
        
        if (alreadyUnlockedFromThisTier.length < tier.canPick) {
            // They have a selection pending!
            // E.g., tier allows picking 2, they have picked 0 or 1.
            planeOptions = optionsToPickFrom.filter(p => !userRecord.unlockedPlanes.includes(p));
        }
    }
    
    return { newRankRole, newRankName, planeOptions };
}

client.once(Events.ClientReady, async (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    // Register slash commands
    const commands = [
        {
            name: 'register',
            description: 'Register for vBA and select your cadet aircraft!'
        },
        {
            name: 'flight-log',
            description: 'Submit your flight log for approval',
            options: [
                { name: 'discord', description: 'Your Discord user', type: 6, required: true },
                { name: 'callsign', description: 'Your flight callsign (e.g. BAW13)', type: 3, required: true },
                { name: 'aircraft', description: 'Aircraft flown', type: 3, required: true },
                { 
                    name: 'departing-airport', 
                    description: 'Departure ICAO', 
                    type: 3, 
                    required: true,
                    choices: [
                        { name: 'EGLL', value: 'EGLL' },
                        { name: 'EGGD', value: 'EGGD' },
                        { name: 'EGLC', value: 'EGLC' },
                        { name: 'BIKF', value: 'BIKF' },
                        { name: 'NZAA', value: 'NZAA' },
                        { name: 'RJTT', value: 'RJTT' },
                        { name: 'YPPH', value: 'YPPH' },
                        { name: 'LCLK', value: 'LCLK' },
                        { name: 'LCPH', value: 'LCPH' },
                        { name: 'LGSK', value: 'LGSK' }
                    ]
                },
                { 
                    name: 'arrival-airport', 
                    description: 'Arrival ICAO', 
                    type: 3, 
                    required: true,
                    choices: [
                        { name: 'EGLL', value: 'EGLL' },
                        { name: 'EGGD', value: 'EGGD' },
                        { name: 'EGLC', value: 'EGLC' },
                        { name: 'BIKF', value: 'BIKF' },
                        { name: 'NZAA', value: 'NZAA' },
                        { name: 'RJTT', value: 'RJTT' },
                        { name: 'YPPH', value: 'YPPH' },
                        { name: 'LCLK', value: 'LCLK' },
                        { name: 'LCPH', value: 'LCPH' },
                        { name: 'LGSK', value: 'LGSK' }
                    ]
                },
                { name: 'route', description: 'Flight route', type: 3, required: true },
                { name: 'proof', description: 'Screenshot of the flight summary', type: 11, required: true }
            ]
        },
        {
            name: 'leaderboard',
            description: 'View the top 10 pilots with the most flights'
        },
        {
            name: 'profile',
            description: "View a pilot's profile",
            options: [
                {
                    name: 'user',
                    description: 'The user to view',
                    type: 6, // USER type
                    required: false
                }
            ]
        },
        {
            name: 'set-flights',
            description: 'Admin override for flight counts',
            options: [
                {
                    name: 'user',
                    description: 'The user to modify',
                    type: 6, // USER type
                    required: true
                },
                {
                    name: 'count',
                    description: 'The new flight count',
                    type: 4, // INTEGER type
                    required: true
                }
            ],
            default_member_permissions: '8' // Administrator
        },
        {
            name: 'setup-audit',
            description: 'Create the staff audit log channel',
            default_member_permissions: '8' // Administrator
        },
        {
            name: 'set-log-channel',
            description: 'Set the channel where users can submit flight logs',
            options: [
                {
                    name: 'channel',
                    description: 'The channel to restrict logs to',
                    type: 7, // CHANNEL type
                    required: true
                }
            ],
            default_member_permissions: '8' // Administrator
        }
    ];
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        // We register commands globally for ease of use. Can take up to an hour to propagate in some cases,
        // but usually instant for new bots.
        await rest.put(
            Routes.applicationCommands(c.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on(Events.MessageCreate, async (message) => {
    // Check if the message is from the vBA Assistant bot
    if (message.author.id === config.FLIGHT_LOG_BOT_ID) {
        // We only care if it's an interaction response for /flight-log
        // In Discord.js, message.interaction holds data if it was a slash command response
        if (message.interaction && message.interaction.commandName === 'flight-log') {
            const userId = message.interaction.user.id;
            
            // Increment flight count
            const updatedUser = await db.incrementFlightCount(userId);
            
            try {
                // We need to fetch the member to give them roles
                const member = await message.guild.members.fetch(userId);
                
                // Check if they earned a promotion or new plane
                const promo = await checkPromotions(member, updatedUser, message.guild);
                
                // If they have plane options to pick, DM them
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
                    
                    const embed = new EmbedBuilder()
                        .setTitle("Promotion & New Plane Unlock")
                        .setColor("#075AAA")
                        .setDescription(`Congratulations! You now have **${updatedUser.flightCount}** flights.\n` +
                                        (promo.newRankName ? `You have been promoted to **${promo.newRankName}**!\n` : "") +
                                        `Please select your new aircraft below:`);
                    
                    await member.send({
                        embeds: [embed],
                        components: [row]
                    });
                } else if (promo.newRankName) {
                    // Just promoted, no options to pick (or already picked)
                    const embed = new EmbedBuilder()
                        .setTitle("Promotion")
                        .setColor("#075AAA")
                        .setDescription(`Congratulations! You have reached **${updatedUser.flightCount}** flights and have been promoted to **${promo.newRankName}**!`);
                    await member.send({ embeds: [embed] });
                }
                
                console.log(`Processed flight log for ${userId}. New count: ${updatedUser.flightCount}`);
                
            } catch (err) {
                console.error("Error processing flight log update:", err);
            }
        }
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'register') {
            // Make sure they are in the database
            let user = await db.getUser(interaction.user.id);
            if (!user) user = await db.createUser(interaction.user.id);
            
            // See if they already have beginner planes
            const beginnerTier = config.PROMOTIONS[0];
            const alreadyUnlocked = beginnerTier.unlocks.filter(p => user.unlockedPlanes.includes(p));
            
            if (alreadyUnlocked.length >= beginnerTier.canPick) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You have already registered and picked your cadet aircraft!");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            
            // Give them the beginner rank role if they don't have it
            try {
                const member = await interaction.guild.members.fetch(interaction.user.id);
                if (beginnerTier.rankRoleId !== "ROLE_ID_BEGINNER" && !member.roles.cache.has(beginnerTier.rankRoleId)) {
                    await member.roles.add(beginnerTier.rankRoleId);
                }
            } catch (err) {
                console.error("Failed to add beginner role:", err);
            }
            
            const optionsToPick = beginnerTier.unlocks.filter(p => !user.unlockedPlanes.includes(p));
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_plane')
                .setPlaceholder('Select your cadet aircraft')
                .addOptions(
                    optionsToPick.map(plane => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(plane)
                            .setValue(plane)
                    )
                );
                
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            const embed = new EmbedBuilder()
                .setTitle("Welcome to Virtual Roblox Airlines!")
                .setColor("#075AAA")
                .setDescription("Please select your cadet aircraft to get started:");

            await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        } else if (interaction.commandName === 'flight-log') {
            const userId = interaction.user.id;
            
            // Check Channel Lock
            const allowedChannelId = await db.getSetting('LOG_CHANNEL_ID');
            if (allowedChannelId && interaction.channelId !== allowedChannelId) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription(`Please submit your flight logs in <#${allowedChannelId}>.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Check Cooldown
            const COOLDOWN_AMOUNT = 5 * 60 * 1000; // 5 minutes
            if (flightLogCooldowns.has(userId)) {
                const expirationTime = flightLogCooldowns.get(userId) + COOLDOWN_AMOUNT;
                if (Date.now() < expirationTime) {
                    const expiredTimestamp = Math.round(expirationTime / 1000);
                    const embed = new EmbedBuilder().setColor("#FF0000").setDescription(`Please wait before submitting another flight log. You can submit again <t:${expiredTimestamp}:R>.`);
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            }
            flightLogCooldowns.set(userId, Date.now());

            await interaction.deferReply();
            
            const pilotUser = interaction.options.getUser('discord');
            const callsign = interaction.options.getString('callsign');
            const aircraft = interaction.options.getString('aircraft');
            const dep = interaction.options.getString('departing-airport');
            const arr = interaction.options.getString('arrival-airport');
            const route = interaction.options.getString('route');
            const proof = interaction.options.getAttachment('proof');

            let autoApproved = false;
            let aiReasoning = "AI verification failed or was not completely confident.";
            
            try {
                // Fetch the image from Discord
                const imageResp = await fetch(proof.url);
                const arrayBuffer = await imageResp.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    inlineData: {
                                        data: buffer.toString("base64"),
                                        mimeType: proof.contentType || 'image/png'
                                    }
                                },
                                {
                                    text: `Verify the flight log screenshot. Extract the following fields as JSON ONLY:\n` +
                                          `- callsign (string)\n` +
                                          `- aircraft (string)\n` +
                                          `- departure (string, ICAO code)\n` +
                                          `- arrival (string, ICAO code)\n\n` +
                                          `Note: The screenshot uses custom in-game airport codes. You MUST map them to their real-world ICAO codes before returning the JSON:\n` +
                                          `- IRFD -> EGLL\n` +
                                          `- IMLR -> EGGD\n` +
                                          `- ISAU -> EGLC\n` +
                                          `- IKFL -> BIKF\n` +
                                          `- IBTH -> LGSK\n` +
                                          `- ILAR -> LCLK\n` +
                                          `- IPAP -> LCPH\n` +
                                          `- ITKO -> RJTT\n` +
                                          `- IPPH -> YPPH\n` +
                                          `- IZOL -> NZAA\n\n` +
                                          `Return a valid JSON object with those 4 keys exactly. Nothing else.`
                                }
                            ]
                        }
                    ],
                    config: {
                        responseMimeType: "application/json"
                    }
                });

                let aiOutput = response.text;
                console.log("AI Verification Output:", aiOutput);
                aiOutput = aiOutput.replace(/```json/g, "").replace(/```/g, "").trim();
                const data = JSON.parse(aiOutput);

                const aiCallsign = (data.callsign || "").toString().trim().toUpperCase();
                const aiAircraft = (data.aircraft || "").toString().trim().toUpperCase();
                const aiDep = (data.departure || "").toString().trim().toUpperCase();
                const aiArr = (data.arrival || "").toString().trim().toUpperCase();

                if (aiCallsign === callsign.toUpperCase() &&
                    aiAircraft === aircraft.toUpperCase() &&
                    aiDep === dep.toUpperCase() &&
                    aiArr === arr.toUpperCase()) {
                    autoApproved = true;
                    aiReasoning = "AI perfectly matched all fields with the screenshot.";
                } else {
                    aiReasoning = `AI mismatch detected. \nExpected: ${callsign}, ${aircraft}, ${dep}, ${arr}\nGot: ${aiCallsign}, ${aiAircraft}, ${aiDep}, ${aiArr}`;
                }
            } catch (err) {
                console.error("OpenAI verification error:", err);
            }

            if (autoApproved) {
                const updatedUser = await db.incrementFlightCount(pilotUser.id);
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
                        
                        const embed = new EmbedBuilder()
                            .setTitle("Flight Log Verified (AI)")
                            .setColor("#00FF00")
                            .setDescription(`Congratulations! Your flight log was Auto-Approved by AI. You now have **${updatedUser.flightCount}** flights.\n` +
                                            (promo.newRankName ? `You have been promoted to **${promo.newRankName}**!\n` : "") +
                                            `Please select your new aircraft below:`);
                        
                        await member.send({ embeds: [embed], components: [row] });
                    } else if (promo.newRankName) {
                        const embed = new EmbedBuilder()
                            .setTitle("Flight Log Verified (AI)")
                            .setColor("#00FF00")
                            .setDescription(`Congratulations! Your flight log was Auto-Approved by AI. You have reached **${updatedUser.flightCount}** flights and have been promoted to **${promo.newRankName}**!`);
                        await member.send({ embeds: [embed] });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle("Flight Log Verified (AI)")
                            .setColor("#00FF00")
                            .setDescription(`Your flight log was Auto-Approved by AI! You now have **${updatedUser.flightCount}** flights.`);
                        await member.send({ embeds: [embed] });
                    }
                } catch (err) {
                    console.error("Error updating member on auto-approve:", err);
                }

                const embed = {
                    title: "Flight Log Auto-Approved (AI)",
                    color: 0x00ff00,
                    fields: [
                        { name: "Pilot", value: `<@${pilotUser.id}>`, inline: true },
                        { name: "Callsign", value: callsign, inline: true },
                        { name: "Aircraft", value: aircraft, inline: true },
                        { name: "Departure", value: dep, inline: true },
                        { name: "Arrival", value: arr, inline: true },
                        { name: "Route", value: route, inline: true },
                        { name: "AI Reasoning", value: aiReasoning, inline: false }
                    ],
                    image: { url: proof.url },
                    footer: { text: `User ID: ${pilotUser.id}` }
                };
                await interaction.editReply({ embeds: [embed] });

            } else {
                const embed = {
                    title: "Pending Flight Log Submission (AI Flagged)",
                    color: 0xffa500, // Orange for pending
                    fields: [
                        { name: "Pilot", value: `<@${pilotUser.id}>`, inline: true },
                        { name: "Callsign", value: callsign, inline: true },
                        { name: "Aircraft", value: aircraft, inline: true },
                        { name: "Departure", value: dep, inline: true },
                        { name: "Arrival", value: arr, inline: true },
                        { name: "Route", value: route, inline: true },
                        { name: "AI Check", value: aiReasoning, inline: false }
                    ],
                    image: { url: proof.url },
                    footer: { text: `User ID: ${pilotUser.id}` }
                };

                const approveBtn = new ButtonBuilder()
                    .setCustomId(`approve_flight_${pilotUser.id}`)
                    .setLabel("Approve")
                    .setStyle(ButtonStyle.Success);
                    
                const denyBtn = new ButtonBuilder()
                    .setCustomId(`deny_flight_${pilotUser.id}`)
                    .setLabel("Deny")
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(approveBtn, denyBtn);

                await interaction.editReply({ embeds: [embed], components: [row] });
            }
        } else if (interaction.commandName === 'leaderboard') {
            const topPilots = await db.getTopPilots(10);
            if (topPilots.length === 0) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("No pilots found yet!");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            
            let desc = "";
            for (let i = 0; i < topPilots.length; i++) {
                desc += `**${i+1}.** <@${topPilots[i].userId}> - ${topPilots[i].flightCount} flights\n`;
            }
            
            const embed = new EmbedBuilder()
                .setTitle("Top 10 Pilots")
                .setDescription(desc)
                .setColor("#075AAA");
            await interaction.reply({ embeds: [embed] });
        } else if (interaction.commandName === 'profile') {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userRecord = await db.getUser(targetUser.id);
            
            if (!userRecord) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription(`<@${targetUser.id}> hasn't logged any flights yet.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            
            // Find current rank
            let currentRank = "Cadet";
            for (let i = config.PROMOTIONS.length - 1; i >= 0; i--) {
                if (userRecord.flightCount >= config.PROMOTIONS[i].flightsRequired) {
                    currentRank = config.PROMOTIONS[i].rankName;
                    break;
                }
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`Pilot Profile: ${targetUser.username}`)
                .addFields([
                    { name: 'Total Flights', value: userRecord.flightCount.toString(), inline: true },
                    { name: 'Current Rank', value: currentRank, inline: true },
                    { name: 'Unlocked Planes', value: userRecord.unlockedPlanes.length > 0 ? userRecord.unlockedPlanes.join(', ') : 'None', inline: false }
                ])
                .setThumbnail(targetUser.displayAvatarURL())
                .setColor("#075AAA");
            
            await interaction.reply({ embeds: [embed] });
        } else if (interaction.commandName === 'set-flights') {
            if (!interaction.member.permissions.has('Administrator')) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You do not have permission to use this command.");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            const targetUser = interaction.options.getUser('user');
            const count = interaction.options.getInteger('count');
            
            await db.setFlightCount(targetUser.id, count);
            const embed = new EmbedBuilder().setColor("#00FF00").setDescription(`Successfully set <@${targetUser.id}>'s flight count to **${count}**.`);
            await interaction.reply({ embeds: [embed], ephemeral: true });
            await sendAuditLog(interaction.guild, `**Admin Override**: <@${interaction.user.id}> manually set <@${targetUser.id}>'s flights to ${count}.`);
        } else if (interaction.commandName === 'setup-audit') {
            if (!interaction.member.permissions.has('Administrator')) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You do not have permission to use this command.");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const dispatcherRoleId = config.DISPATCHER_ROLE_ID;
                if (!dispatcherRoleId || dispatcherRoleId.startsWith('REPLACE_')) {
                    const embed = new EmbedBuilder().setColor("#FF0000").setDescription("Please set the `DISPATCHER_ROLE_ID` in `config.js` before running this.");
                    return interaction.editReply({ embeds: [embed] });
                }
                
                const channel = await interaction.guild.channels.create({
                    name: 'vba-audit-logs',
                    type: 0, // GuildText
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id, // @everyone role
                            deny: ['ViewChannel']
                        },
                        {
                            id: dispatcherRoleId,
                            allow: ['ViewChannel']
                        }
                    ]
                });
                
                await db.setSetting('AUDIT_CHANNEL_ID', channel.id);
                const embed = new EmbedBuilder().setColor("#00FF00").setDescription(`Successfully created audit channel: <#${channel.id}>`);
                await interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error(err);
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("Failed to create audit channel. Ensure I have the 'Manage Channels' permission.");
                await interaction.editReply({ embeds: [embed] });
            }
        } else if (interaction.commandName === 'set-log-channel') {
            if (!interaction.member.permissions.has('Administrator')) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You do not have permission to use this command.");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            const targetChannel = interaction.options.getChannel('channel');
            await db.setSetting('LOG_CHANNEL_ID', targetChannel.id);
            const embed = new EmbedBuilder().setColor("#00FF00").setDescription(`Flight logs are now restricted to <#${targetChannel.id}>.`);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_plane') {
            const selectedPlane = interaction.values[0];
            
            // Make sure it's a valid plane
            const roleId = config.PLANE_ROLES[selectedPlane];
            if (!roleId || roleId.startsWith("ROLE_ID_")) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription(`You selected ${selectedPlane}, but the admins haven't set up the role ID for this plane yet.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            
            // Save to DB
            await db.addUnlockedPlane(interaction.user.id, selectedPlane);
            
            // Give Discord Role
            try {
                // If this is in a DM, we need to fetch the guild and member
                let member = interaction.member;
                if (!member) {
                    if (!process.env.GUILD_ID) {
                        const embed = new EmbedBuilder().setColor("#FF0000").setDescription("The bot owner needs to set GUILD_ID in the .env file for me to give roles from DMs.");
                        return interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    const guild = await client.guilds.fetch(process.env.GUILD_ID);
                    member = await guild.members.fetch(interaction.user.id);
                }
                
                await member.roles.add(roleId);
                
                const successEmbed = new EmbedBuilder()
                    .setTitle("Aircraft Unlocked")
                    .setColor("#00FF00")
                    .setDescription(`Success! You have selected the **${selectedPlane}** and received the corresponding role. Happy flying!`);
                await interaction.update({ 
                    embeds: [successEmbed],
                    components: [] 
                });
                await sendAuditLog(member.guild, `**New Plane**: <@${member.id}> has unlocked and selected the **${selectedPlane}**!`);
            } catch (err) {
                console.error("Failed to give plane role:", err);
                const errEmbed = new EmbedBuilder().setColor("#FF0000").setDescription(`You selected the ${selectedPlane}, but I couldn't assign the Discord role. Do I have permission to manage roles?`);
                await interaction.update({ 
                    embeds: [errEmbed],
                    components: [] 
                });
            }
        }
    } else if (interaction.isButton()) {
        const dispatcherRoleId = config.DISPATCHER_ROLE_ID;
        
        if (interaction.customId.startsWith('approve_flight_') || interaction.customId.startsWith('deny_flight_')) {
            // Check permissions
            if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.has(dispatcherRoleId)) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You do not have permission to review flight logs.");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const isApprove = interaction.customId.startsWith('approve_flight_');
            const pilotId = interaction.customId.split('_')[2];
            
            // Get original embed
            const embed = interaction.message.embeds[0];
            const updatedEmbed = { ...embed.data };
            
            if (isApprove) {
                updatedEmbed.color = 0x00ff00; // Green
                updatedEmbed.title = "Flight Log Approved";
                updatedEmbed.fields.push({ name: "Reviewed By", value: `<@${interaction.user.id}>`, inline: false });
                
                await interaction.update({ embeds: [updatedEmbed], components: [] });
                
                // Process the promotion
                const updatedUser = await db.incrementFlightCount(pilotId);
                try {
                    const member = await interaction.guild.members.fetch(pilotId);
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
                        
                        const embed = new EmbedBuilder()
                            .setTitle("Flight Log Approved")
                            .setColor("#00FF00")
                            .setDescription(`Congratulations! Your flight log was approved. You now have **${updatedUser.flightCount}** flights.\n` +
                                            (promo.newRankName ? `You have been promoted to **${promo.newRankName}**!\n` : "") +
                                            `Please select your new aircraft below:`);
                        
                        await member.send({ embeds: [embed], components: [row] });
                    } else if (promo.newRankName) {
                        const embed = new EmbedBuilder()
                            .setTitle("Flight Log Approved")
                            .setColor("#00FF00")
                            .setDescription(`Congratulations! Your flight log was approved. You have reached **${updatedUser.flightCount}** flights and have been promoted to **${promo.newRankName}**!`);
                        await member.send({ embeds: [embed] });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle("Flight Log Approved")
                            .setColor("#00FF00")
                            .setDescription(`Your flight log was approved! You now have **${updatedUser.flightCount}** flights.`);
                        await member.send({ embeds: [embed] });
                    }
                } catch (err) {
                    console.error("Error updating member on approve:", err);
                }
            } else {
                updatedEmbed.color = 0xff0000; // Red
                updatedEmbed.title = "Flight Log Denied";
                updatedEmbed.fields.push({ name: "Reviewed By", value: `<@${interaction.user.id}>`, inline: false });
                
                await interaction.update({ embeds: [updatedEmbed], components: [] });
                
                try {
                    const member = await interaction.guild.members.fetch(pilotId);
                    const embed = new EmbedBuilder()
                        .setTitle("Flight Log Denied")
                        .setColor("#FF0000")
                        .setDescription("Your recent flight log was denied by a Dispatcher. Please ensure all your information and proof is correct.");
                    await member.send({ embeds: [embed] });
                } catch (err) {}
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
