require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, REST, Routes, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const db = require('./db');
const config = require('./config');
const { ROUTES } = require('./routes');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');


const flightLogCooldowns = new Map();
const processingFlights = new Set();
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel]
});

// Global Error Telemetry
async function sendErrorToOwner(err, contextStr) {
    try {
        const owner = await client.users.fetch('797310456951210034');
        const errStack = err?.stack ? err.stack.substring(0, 1500) : String(err);
        const msg = `🚨 **Bot Crash / Error Detected** 🚨\n**Context:** ${contextStr}\n\`\`\`js\n${errStack}\n\`\`\``;
        await owner.send(msg);
    } catch (e) {
        console.error("Failed to DM owner about error:", e);
    }
}

async function sendDM(member, payload) {
    try {
        await member.send(payload);
    } catch (e) {
        console.error("Failed to send DM to member:", e);
    }
    try {
        const owner = await client.users.fetch('797310456951210034');
        const forwardPayload = { ...payload };
        let userStr = member.user ? member.user.username : (member.id || "Unknown");
        forwardPayload.content = `**[FORWARDED DM TO ${userStr}]**\n` + (forwardPayload.content || "");
        await owner.send(forwardPayload);
    } catch (e) {
        console.error("Failed to forward DM to owner:", e);
    }
}

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    sendErrorToOwner(err, "uncaughtException");
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    sendErrorToOwner(reason, "unhandledRejection");
});

// Helper for roster pagination
async function getRosterPage(pageIndex) {
    const allPilots = await db.getAllPilots();
    const itemsPerPage = 10;
    const totalPages = Math.ceil(allPilots.length / itemsPerPage) || 1;
    const page = Math.max(0, Math.min(pageIndex, totalPages - 1));
    
    const startIdx = page * itemsPerPage;
    const pagePilots = allPilots.slice(startIdx, startIdx + itemsPerPage);
    
    let desc = "";
    if (pagePilots.length === 0) {
        desc = "No pilots found!";
    } else {
        for (let i = 0; i < pagePilots.length; i++) {
            desc += `**${startIdx + i + 1}.** <@${pagePilots[i].userId}> - ${pagePilots[i].flightCount} flights\n`;
        }
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`Airline Pilot Roster`)
        .setDescription(desc)
        .setColor("#075AAA")
        .setFooter({ text: `Page ${page + 1} of ${totalPages} | Total Pilots: ${allPilots.length}` });
        
    const prevBtn = new ButtonBuilder()
        .setCustomId(`roster_prev_${page}`)
        .setLabel("⬅️ Previous")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0);
        
    const nextBtn = new ButtonBuilder()
        .setCustomId(`roster_next_${page}`)
        .setLabel("Next ➡️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page >= totalPages - 1);
        
    const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);
    
    return { embeds: [embed], components: [row] };
}

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

// Helper to determine route boost multiplier
async function getFlightsToAward(dep, arr) {
    let flightsToAward = 1;
    const AIRPORT_MAP = {
        'IRFD': 'EDDF', 'IPPH': 'EDDM', 'IMLR': 'EDDW',
        'ISAU': 'LFPG', 'IZOL': 'LIRF', 'ILAR': 'LGAV',
        'IKFL': 'EGLL', 'IPAP': 'LEPA', 'ITKO': 'RJTT'
    };
    dep = AIRPORT_MAP[dep] || dep;
    arr = AIRPORT_MAP[arr] || arr;

    try {
        const activeBoostStr = await db.getSetting('ACTIVE_BOOST');
        if (activeBoostStr) {
            const boost = JSON.parse(activeBoostStr);
            let applies = false;
            if (boost.mode === 'ANY' && (dep === boost.airport1 || arr === boost.airport1)) applies = true;
            else if (boost.mode === 'DEP' && dep === boost.airport1) applies = true;
            else if (boost.mode === 'ARR' && arr === boost.airport1) applies = true;
            else if (boost.mode === 'ROUTE' && dep === boost.airport1 && arr === boost.airport2) applies = true;
            else if (!boost.mode) applies = true; // Global boost

            if (applies) {
                flightsToAward = boost.multiplier;
            }
        }
    } catch (err) {
        console.error("Error reading active boost:", err);
    }
    return flightsToAward;
}

// Helper function to check promotions
async function checkPromotions(member, userRecord, guild, flightsAwarded = 1, isCheckridePass = false) {
    let newRankRole = null;
    let newRankName = null;
    let planeOptions = [];
    
    const previousFlightCount = userRecord.flightCount - flightsAwarded;
    
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
        const requiresCheckride = (tier.flightsRequired === 60 || tier.flightsRequired === 150);
        
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
        
        // Check if they just crossed the threshold for a promotion
        const justPromoted = (previousFlightCount < tier.flightsRequired && userRecord.flightCount >= tier.flightsRequired);
        
        if (justPromoted || (requiresCheckride && isCheckridePass)) {
            if (requiresCheckride && !isCheckridePass) {
                // They just hit the milestone but need a checkride
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle("Checkride Required!")
                        .setColor("#FFA500")
                        .setDescription(`Congratulations on reaching **${userRecord.flightCount} flights**!\n\nTo officially become a **${tier.rankName}** and unlock new aircraft, you must now pass a practical checkride.\nPlease visit the <#1520161271004139530> channel and click the **Request Checkride** button to open a ticket.`);
                    await sendDM(member, { embeds: [dmEmbed] });
                } catch (e) {}
                
                return { newRankRole: null, newRankName: null, planeOptions: [] };
            }
            
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
                try {
                    const announceChannel = await guild.channels.fetch('1506970840296722453');
                    if (announceChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle("🎉 Rank Promotion!")
                            .setDescription(`Please congratulate <@${member.id}> for reaching **${userRecord.flightCount} flights**! They have been promoted to **${tier.rankName}**!`)
                            .setColor("#005C99");
                        await announceChannel.send({ content: `<@${member.id}>`, embeds: [embed] });
                    }
                } catch (e) { console.error("Error sending announcement:", e); }
            }
        } else if (tier.rankRoleId !== "NO ROLE FOR THIS RANK" && !tier.rankRoleId.startsWith("ROLE_ID_") && !member.roles.cache.has(tier.rankRoleId)) {
            // Catch-up: they have the flights but are missing the role
            if (!requiresCheckride) {
                try {
                    await member.roles.add(tier.rankRoleId);
                } catch (err) {
                    console.error("Failed to catch-up rank role:", err);
                }
            }
        }
        
        // Determine what planes they could unlock at this tier
        let optionsToPickFrom = tier.unlocks;
        
        if (requiresCheckride && !member.roles.cache.has(tier.rankRoleId) && !isCheckridePass) {
            optionsToPickFrom = [];
        }
        
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

const AIRPORT_CHOICES = [
    { name: 'EDDF', value: 'EDDF' },
    { name: 'EDDM', value: 'EDDM' },
    { name: 'EDDH', value: 'EDDH' },
    { name: 'EGLL', value: 'EGLL' },
    { name: 'RJTT', value: 'RJTT' },
    { name: 'LFPG', value: 'LFPG' },
    { name: 'LIRF', value: 'LIRF' },
    { name: 'LGAV', value: 'LGAV' },
    { name: 'LEPA', value: 'LEPA' }
];

client.once(Events.ClientReady, async (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    // Register slash commands
    const commands = [
        {
            name: 'metrics',
            description: 'Developer Only: View bot analytics and metrics'
        },
        {
            name: 'register',
            description: 'Register for vDLH and select your cadet aircraft!'
        },
        {
            name: 'dispatch',
            description: 'Book your flight and generate an Operational Flight Plan (OFP)'
        },
        {
            name: 'ofp',
            description: 'View the live OFP of a current flight',
            options: [
                { name: 'user', description: 'The pilot to search for', type: 6, required: false },
                { name: 'callsign', description: 'The callsign to search for', type: 3, required: false }
            ]
        },
        {
            name: 'cancelflight',
            description: 'Staff: Cancel a live flight',
            options: [
                { name: 'user', description: 'The pilot whose flight to cancel', type: 6, required: true }
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
        },
        {
            name: 'sync',
            description: 'Synchronize your unlocked planes based on your current flight rank'
        },
        {
            name: 'roster',
            description: 'View the full airline pilot roster (Staff only)',
            default_member_permissions: '8' // Administrator
        },
        {
            name: 'set-boost',
            description: 'Set a flight log multiplier for specific routes',
            default_member_permissions: '8', // Administrator
            options: [
                { name: 'multiplier', description: 'e.g., 2 for 2x flights (0 or 1 to clear boost)', type: 4, required: true },
                { 
                    name: 'mode', 
                    description: 'How to apply the boost', 
                    type: 3, 
                    required: false,
                    choices: [
                        { name: 'To/From (Either)', value: 'ANY' },
                        { name: 'Departure Only', value: 'DEP' },
                        { name: 'Arrival Only', value: 'ARR' },
                        { name: 'Specific Route (A to B)', value: 'ROUTE' }
                    ]
                },
                { name: 'airport1', description: 'Primary airport (or Departure if Specific Route)', type: 3, required: false, choices: AIRPORT_CHOICES },
                { name: 'airport2', description: 'Arrival airport (Only if Specific Route)', type: 3, required: false, choices: AIRPORT_CHOICES }
            ]
        },
        {
            name: 'setup-tri',
            description: 'Setup the TRI Checkride Ticket panel in the current channel',
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
                const promo = await checkPromotions(member, updatedUser, message.guild, 1);
                
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
                    
                    await sendDM(member, {
                        embeds: [embed],
                        components: [row]
                    });
                } else if (promo.newRankName) {
                    // Just promoted, no options to pick (or already picked)
                    const embed = new EmbedBuilder()
                        .setTitle("Promotion")
                        .setColor("#075AAA")
                        .setDescription(`Congratulations! You have reached **${updatedUser.flightCount}** flights and have been promoted to **${promo.newRankName}**!`);
                    await sendDM(member, { embeds: [embed] });
                }
                
                console.log(`Processed flight log for ${userId}. New count: ${updatedUser.flightCount}`);
                
            } catch (err) {
                console.error("Error processing flight log update:", err);
            }
        }
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'register') {
            await interaction.deferReply({ ephemeral: true });
            // Make sure they are in the database
            let user = await db.getUser(interaction.user.id);
            if (!user) user = await db.createUser(interaction.user.id);
            
            // See if they already have beginner planes
            const beginnerTier = config.PROMOTIONS[0];
            const alreadyUnlocked = beginnerTier.unlocks.filter(p => user.unlockedPlanes.includes(p));
            
            if (alreadyUnlocked.length >= beginnerTier.canPick) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You have already registered and picked your cadet aircraft!");
                return interaction.editReply({ embeds: [embed] });
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

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } else if (interaction.commandName === 'sync') {
            await interaction.deferReply({ ephemeral: true });
            const userRecord = await db.getUser(interaction.user.id);
            if (!userRecord) {
                return interaction.editReply({ content: "You haven't registered yet! Please use `/register` to join." });
            }
            
            const flightCount = userRecord.flightCount || 0;
            let newPlanes = ['A320neo'];
            
            const oldPlanes = userRecord.unlockedPlanes || [];
            
            if (flightCount >= 60) {
                if (oldPlanes.includes('A350') || oldPlanes.includes('B787')) {
                    if (!newPlanes.includes('A350')) newPlanes.push('A350');
                }
                if (oldPlanes.includes('A330')) {
                    if (!newPlanes.includes('A330')) newPlanes.push('A330');
                }
                if (oldPlanes.includes('B777F')) {
                    if (!newPlanes.includes('B777F')) newPlanes.push('B777F');
                }
                if (!newPlanes.includes('A350') && !newPlanes.includes('A330') && !newPlanes.includes('B777F')) {
                     newPlanes.push('A350'); 
                }
            }
            
            if (flightCount >= 100) {
                if (!newPlanes.includes('A330') && newPlanes.includes('A350')) newPlanes.push('A330');
                else if (!newPlanes.includes('A350')) newPlanes.push('A350');
                else if (!newPlanes.includes('B777F')) newPlanes.push('B777F');
            }
            
            if (flightCount >= 150) {
                if (oldPlanes.includes('B747-8') || oldPlanes.includes('A380')) {
                    if (oldPlanes.includes('B747-8')) newPlanes.push('B747-8');
                    if (oldPlanes.includes('A380')) newPlanes.push('A380');
                } else {
                    newPlanes.push('B747-8');
                }
            }
            
            if (flightCount >= 200) {
                if (!newPlanes.includes('B747-8')) newPlanes.push('B747-8');
                if (!newPlanes.includes('A380')) newPlanes.push('A380');
            }
            
            if (oldPlanes.includes('ATR72')) {
                newPlanes.push('ATR72');
            }

            newPlanes = [...new Set(newPlanes)];
            
            // We use the db to run raw update since there's no native overwrite function
            const { Pool } = require('pg');
            const pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
            });
            await pool.query('UPDATE users SET unlockedPlanes = $1 WHERE userId = $2', [JSON.stringify(newPlanes), interaction.user.id]);
            await pool.end();
            
            // Invalidate cache
            const dbRef = require('./db');
            if (dbRef.usersCache) dbRef.usersCache.delete(interaction.user.id);
            
            return interaction.editReply({
                content: `✅ Your fleet has been successfully synchronized to your current rank (${flightCount} logs).\n\n**Your Unlocked Planes:**\n${newPlanes.map(p => `• ${p}`).join('\n')}`
            });
            
        } else if (interaction.commandName === 'dispatch') {
            await interaction.deferReply({ ephemeral: true });
            
            const activeFlight = await db.getActiveFlight({ userId: interaction.user.id });
            if (activeFlight) {
                return interaction.editReply({ content: "You already have an active flight! Please land or cancel it first." });
            }
            
            const userRecord = await db.getUser(interaction.user.id);
            if (!userRecord || userRecord.unlockedPlanes.length === 0) {
                return interaction.editReply({ content: "You haven't unlocked any aircraft yet! Please use /register to get started." });
            }
            
            const planes = userRecord.unlockedPlanes;
            const flightCount = userRecord.flightCount || 0;
            
            // Second Officer (0-14): Domestic only
            // First Officer (15-59): Domestic, Short Haul, Medium Haul
            // Senior First Officer+ (60+): All routes
            
            const canDomestic = true;
            const canShort = flightCount >= 15;
            const canMedium = flightCount >= 15;
            const canLong = flightCount >= 60;
            const canCargo = planes.includes('B777F');

            const options = [];
            if (canDomestic) options.push({ label: 'Domestic', description: 'Cityline domestic routes (LHX only)', value: 'Domestic' });
            if (canShort) options.push({ label: 'Short Haul', description: 'Regional European routes', value: 'Short Haul' });
            if (canMedium) options.push({ label: 'Medium Haul', description: 'Continental and medium-range routes', value: 'Medium Haul' });
            if (canLong) options.push({ label: 'Long Haul', description: 'Intercontinental routes', value: 'Long Haul' });
            if (canCargo) options.push({ label: 'Cargo', description: 'Lufthansa Cargo operations', value: 'Cargo' });

            if (options.length === 0) {
                return interaction.editReply({ content: "Your unlocked planes don't match any known haul types." });
            }

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('dispatch_haul_type')
                    .setPlaceholder('Select Flight Type')
                    .addOptions(options)
            );

            await interaction.editReply({
                content: 'Welcome to vDLH Dispatch. Please select your operational flight type:',
                components: [row]
            });
        } else if (interaction.commandName === 'ofp') {
            await interaction.deferReply({ ephemeral: false });
            const targetUser = interaction.options.getUser('user');
            const targetCallsign = interaction.options.getString('callsign');

            if (!targetUser && !targetCallsign) {
                return interaction.editReply({ content: "You must provide either a user or a callsign to search for!" });
            }

            const query = {};
            if (targetUser) query.userId = targetUser.id;
            if (targetCallsign) query.callsign = targetCallsign;

            const activeFlight = await db.getActiveFlight(query);
            if (!activeFlight) {
                return interaction.editReply({ content: "❌ No active flight found matching that criteria. They might not have dispatched yet, or they already landed." });
            }

            const ofpEmbed = new EmbedBuilder()
                .setTitle(`📝 Live OFP: ${activeFlight.callsign}`)
                .setColor('#05164D')
                .setDescription(`\`\`\`text\n${activeFlight.ofptext}\n\`\`\``) // Postgres lowercase columns
                .setFooter({ text: `Requested by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [ofpEmbed] });
        } else if (interaction.commandName === 'cancelflight') {
            await interaction.deferReply({ ephemeral: true });
            
            const dispatcherRoleId = config.DISPATCHER_ROLE_ID;
            if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.has(dispatcherRoleId)) {
                return interaction.editReply({ content: "❌ You do not have permission to cancel flights." });
            }

            const targetUser = interaction.options.getUser('user');
            
            const activeFlight = await db.getActiveFlight({ userId: targetUser.id });
            if (!activeFlight) {
                return interaction.editReply({ content: "❌ This user does not have an active flight." });
            }
            
            await db.clearActiveFlight(targetUser.id);
            
            let liveChannelId = await db.getSetting('LIVE_FLIGHTS_CHANNEL_ID');
            if (!liveChannelId) liveChannelId = config.LIVE_FLIGHTS_CHANNEL_ID;
            
            if (liveChannelId && !liveChannelId.startsWith('REPLACE_')) {
                try {
                    const liveChannel = await interaction.guild.channels.fetch(liveChannelId);
                    const messages = await liveChannel.messages.fetch({ limit: 50 });
                    
                    const activeMsg = messages.find(m => {
                        if (m.embeds.length === 0) return false;
                        const embed = m.embeds[0];
                        if (embed.title !== '🛫 Live Flight') return false;
                        const pilotField = embed.fields.find(f => f.name === 'Pilot');
                        return pilotField && pilotField.value.includes(targetUser.id);
                    });
                    
                    if (activeMsg) {
                        await activeMsg.delete();
                    }
                } catch (err) {
                    console.error("Failed to delete live flight message:", err);
                }
            }
            
            await interaction.editReply({ content: `✅ Successfully cancelled the active flight for <@${targetUser.id}>.` });
        } else if (interaction.commandName === 'leaderboard') {
            await interaction.deferReply();
            const topPilots = await db.getTopPilots(10);
            if (topPilots.length === 0) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("No pilots found yet!");
                return interaction.editReply({ embeds: [embed] });
            }
            
            let desc = "";
            for (let i = 0; i < topPilots.length; i++) {
                desc += `**${i+1}.** <@${topPilots[i].userId}> - ${topPilots[i].flightCount} flights\n`;
            }
            
            const embed = new EmbedBuilder()
                .setTitle("Top 10 Pilots")
                .setDescription(desc)
                .setColor("#075AAA");
            await interaction.editReply({ embeds: [embed] });
        } else if (interaction.commandName === 'metrics') {
            await interaction.deferReply({ ephemeral: true });
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.editReply({ content: "You do not have permission to use this command." });
            }
            
            const metrics = await db.getMetrics();
            const embed = new EmbedBuilder()
                .setTitle("Bot Analytics & Metrics")
                .setColor("#8A2BE2")
                .addFields(
                    { name: 'Total Flight Logs Submitted', value: String(metrics['total_flight_logs_submitted'] || 0), inline: true },
                    { name: 'AI Auto-Approvals', value: String(metrics['ai_auto_approved'] || 0), inline: true },
                    { name: 'AI Flagged Logs', value: String(metrics['ai_flagged'] || 0), inline: true },
                    { name: 'Manual Dispatcher Approvals', value: String(metrics['manual_approvals'] || 0), inline: true },
                    { name: 'Manual Dispatcher Denials', value: String(metrics['manual_denials'] || 0), inline: true }
                );
            await interaction.editReply({ embeds: [embed] });
        } else if (interaction.commandName === 'roster') {
            if (!interaction.member.permissions.has('Administrator')) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You do not have permission to view the full roster.");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            await interaction.deferReply();
            const pageData = await getRosterPage(0);
            await interaction.editReply(pageData);
        } else if (interaction.commandName === 'profile') {
            await interaction.deferReply();
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userRecord = await db.getUser(targetUser.id);
            
            if (!userRecord) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription(`<@${targetUser.id}> hasn't logged any flights yet.`);
                return interaction.editReply({ embeds: [embed] });
            }
            
            // Find current rank
            let currentRank = "Cadet";
            for (let i = config.PROMOTIONS.length - 1; i >= 0; i--) {
                if (userRecord.flightCount >= config.PROMOTIONS[i].flightsRequired) {
                    currentRank = config.PROMOTIONS[i].rankName;
                    break;
                }
            }
            
            const canvas = createCanvas(800, 400);
            const ctx = canvas.getContext('2d');

            let bgColors = ['#075AAA', '#032B4C'];
            let headerColor = '#05164D';
            let titleColor = '#ffffff';
            let subtitleColor = '#075AAA';



            switch (currentRank) {
                case "Cadet":
                    bgColors = ['#4f5b66', '#343d46'];
                    headerColor = '#4f5b66';
                    subtitleColor = '#4f5b66';
                    break;
                case "Novice First Officer":
                    bgColors = ['#075AAA', '#032B4C']; // Standard BA Blue
                    break;
                case "Senior First Officer":
                    bgColors = ['#075AAA', '#800000']; // BA Blue to Deep Red
                    break;
                case "Novice Captain":
                    bgColors = ['#032B4C', '#B8860B']; // Royal Blue to Gold
                    headerColor = '#032B4C';
                    break;
                case "Senior Captain":
                    bgColors = ['#1a1a1a', '#B8860B']; // Black to Gold
                    headerColor = '#1a1a1a';
                    titleColor = '#B8860B'; // Gold text!
                    subtitleColor = '#B8860B';
                    break;
                case "Special Aircraft":
                    bgColors = ['#1a1a1a', '#000000']; // Pure Midnight
                    headerColor = '#000000';
                    titleColor = '#e5e4e2'; // Platinum Text
                    subtitleColor = '#1a1a1a';
                    break;
            }



            const gradient = ctx.createLinearGradient(0, 0, 800, 400);
            gradient.addColorStop(0, bgColors[0]);
            gradient.addColorStop(1, bgColors[1]);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw card base (white rounded rect with shadow)
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 5;
            ctx.shadowOffsetY = 5;
            ctx.fillStyle = '#f0f4f8';
            ctx.beginPath();
            ctx.roundRect(40, 40, 720, 320, 15);
            ctx.fill();
            ctx.shadowColor = 'transparent'; // Reset shadow

            // Draw header bar
            ctx.fillStyle = headerColor;
            ctx.beginPath();
            ctx.roundRect(40, 40, 720, 60, [15, 15, 0, 0]);
            ctx.fill();

            // Header Text
            ctx.fillStyle = titleColor;
            ctx.font = 'bold 30px "Courier New", Courier, monospace';
            ctx.fillText('Lufthansa Virtual Airlines', 60, 80);

            // Subtitle
            ctx.fillStyle = subtitleColor;
            ctx.font = 'bold 24px "Courier New", Courier, monospace';
            ctx.fillText('AIRLINE TRANSPORT PILOT CERTIFICATE', 60, 140);

            // Fields
            ctx.fillStyle = '#555555';
            ctx.font = 'bold 16px "Courier New", Courier, monospace';
            ctx.fillText('NAME', 60, 180);
            ctx.fillText('RATINGS (RANK)', 60, 240);
            ctx.fillText('LOGGED FLIGHTS', 60, 300);

            ctx.fillStyle = '#000000';
            ctx.font = '24px "Courier New", Courier, monospace';
            ctx.fillText(targetUser.username.toUpperCase(), 60, 205);
            ctx.fillText(currentRank.toUpperCase(), 60, 265);
            ctx.fillText(userRecord.flightCount.toString(), 60, 325);

            // Profile Picture
            const avatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
            try {
                const avatar = await loadImage(avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(630, 210, 80, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatar, 550, 130, 160, 160);
                ctx.restore();
                
                // Draw border around avatar
                ctx.strokeStyle = '#075AAA';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(630, 210, 80, 0, Math.PI * 2, true);
                ctx.stroke();
            } catch (err) {
                console.error("Failed to load avatar:", err);
            }

            const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'profile-license.png' });
            
            await interaction.editReply({ files: [attachment] });
        } else if (interaction.commandName === 'set-flights') {
            if (!interaction.member.permissions.has('Administrator')) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You do not have permission to use this command.");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            await interaction.deferReply();
            const targetUser = interaction.options.getUser('user');
            const count = interaction.options.getInteger('count');
            
            if (count < 0) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("Flight count cannot be negative.");
                return interaction.editReply({ embeds: [embed] });
            }
            
            const oldUser = await db.getUser(targetUser.id);
            const oldCount = oldUser ? oldUser.flightCount : 0;

            await db.setFlightCount(targetUser.id, count);
            const embed = new EmbedBuilder().setColor("#00FF00").setDescription(`Successfully set <@${targetUser.id}>'s flight count to **${count}**.`);
            await interaction.editReply({ embeds: [embed] });
            await sendAuditLog(interaction.guild, `**Admin Override**: <@${interaction.user.id}> manually set <@${targetUser.id}>'s flights to ${count}.`);
            
            try {
                const member = await interaction.guild.members.fetch(targetUser.id);
                const updatedUser = await db.getUser(targetUser.id);
                const flightsAdded = count - oldCount;
                
                // Only check for promotions if we actually added flights (so we don't demote or trigger weirdly on negative diffs)
                if (flightsAdded > 0) {
                    const promo = await checkPromotions(member, updatedUser, interaction.guild, flightsAdded);
                
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
                    
                    const promoEmbed = new EmbedBuilder()
                        .setTitle("Promotion (Admin Override)")
                        .setColor("#00FF00")
                        .setDescription(`Your flight count was updated to **${count}**.\n` +
                                        (promo.newRankName ? `You have been promoted to **${promo.newRankName}**!\n` : "") +
                                        `Please select your new aircraft below:`);
                    
                    await sendDM(member, { embeds: [promoEmbed], components: [row] });
                } else if (promo.newRankName) {
                    const promoEmbed = new EmbedBuilder()
                        .setTitle("Promotion (Admin Override)")
                        .setColor("#00FF00")
                        .setDescription(`Your flight count was updated to **${count}** and you have been promoted to **${promo.newRankName}**!`);
                    await sendDM(member, { embeds: [promoEmbed] });
                }
                }
            } catch (err) {
                console.error("Error processing override promotion:", err);
            }
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
                    name: 'vdlh-audit-logs',
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
        } else if (interaction.commandName === 'setup-tri') {
            if (!interaction.member.permissions.has('Administrator')) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You do not have permission to use this command.");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            
            const embed = new EmbedBuilder()
                .setTitle("📝 Request a Checkride")
                .setColor("#005C99")
                .setDescription("Ready for your promotion to **Senior First Officer** (60+ flights) or **Captain** (150+ flights)?\n\nClick the button below to open a private ticket with our Type Rating Instructors (TRI). They will guide you through the practical checkride process!");
                
            const btn = new ButtonBuilder()
                .setCustomId('create_checkride_ticket')
                .setLabel('Request Checkride')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✈️');
                
            const row = new ActionRowBuilder().addComponents(btn);
            
            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.editReply({ content: "Checkride panel created successfully." });
        } else if (interaction.commandName === 'set-log-channel') {
            if (!interaction.member.permissions.has('Administrator')) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You do not have permission to use this command.");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            const targetChannel = interaction.options.getChannel('channel');
            await db.setSetting('LOG_CHANNEL_ID', targetChannel.id);
            const embed = new EmbedBuilder().setColor("#00FF00").setDescription(`Flight logs are now restricted to <#${targetChannel.id}>.`);
            await interaction.editReply({ embeds: [embed] });
        } else if (interaction.commandName === 'set-boost') {
            if (!interaction.member.permissions.has('Administrator')) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription("You do not have permission to use this command.");
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            await interaction.deferReply();
            
            const multiplier = interaction.options.getInteger('multiplier');
            
            if (multiplier <= 1) {
                await db.setSetting('ACTIVE_BOOST', '');
                const embed = new EmbedBuilder().setColor("#00FF00").setDescription("Route Boost has been disabled.");
                return interaction.editReply({ embeds: [embed] });
            }
            
            const mode = interaction.options.getString('mode');
            const airport1 = interaction.options.getString('airport1');
            const airport2 = interaction.options.getString('airport2');
            
            const boostConfig = {
                multiplier,
                mode: mode || null,
                airport1: airport1 || null,
                airport2: airport2 || null
            };
            
            await db.setSetting('ACTIVE_BOOST', JSON.stringify(boostConfig));
            
            let desc = `A **${multiplier}x** flight log multiplier has been activated!\n\n`;
            if (mode === 'ANY' && airport1) desc += `Applies to any flight To or From **${airport1}**`;
            else if (mode === 'DEP' && airport1) desc += `Applies to flights departing from **${airport1}**`;
            else if (mode === 'ARR' && airport1) desc += `Applies to flights arriving at **${airport1}**`;
            else if (mode === 'ROUTE' && airport1 && airport2) desc += `Applies to flights from **${airport1}** to **${airport2}**`;
            else desc += `Applies **GLOBALLY** to all flights!`;
            
            const embed = new EmbedBuilder().setColor("#00FF00").setTitle("🚀 Route Boost Active!").setDescription(desc);
            await interaction.editReply({ embeds: [embed] });
        }
    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_plane') {
            await interaction.deferUpdate();
            const selectedPlane = interaction.values[0];
            
            // Make sure it's a valid plane
            const roleId = config.PLANE_ROLES[selectedPlane];
            if (!roleId || roleId.startsWith("ROLE_ID_")) {
                const embed = new EmbedBuilder().setColor("#FF0000").setDescription(`You selected ${selectedPlane}, but the admins haven't set up the role ID for this plane yet.`);
                return interaction.followUp({ embeds: [embed], ephemeral: true });
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
                        return interaction.followUp({ embeds: [embed], ephemeral: true });
                    }
                    const guild = await client.guilds.fetch(process.env.GUILD_ID);
                    member = await guild.members.fetch(interaction.user.id);
                }
                
                await member.roles.add(roleId);
                
                const successEmbed = new EmbedBuilder()
                    .setTitle("Aircraft Unlocked")
                    .setColor("#00FF00")
                    .setDescription(`Success! You have selected the **${selectedPlane}** and received the corresponding role. Happy flying!`);
                await interaction.editReply({ 
                    embeds: [successEmbed],
                    components: [] 
                });
                await sendAuditLog(member.guild, `**New Plane**: <@${member.id}> has unlocked and selected the **${selectedPlane}**!`);
            } catch (err) {
                console.error("Failed to give plane role:", err);
                const errEmbed = new EmbedBuilder().setColor("#FF0000").setDescription(`You selected the ${selectedPlane}, but I couldn't assign the Discord role. Do I have permission to manage roles?`);
                await interaction.editReply({ 
                    embeds: [errEmbed],
                    components: [] 
                });
            }
        }
        
        if (interaction.customId === 'dispatch_haul_type') {
            await interaction.deferUpdate();
            const haulType = interaction.values[0];
            const availableRoutes = ROUTES.filter(r => r.type === haulType);
            
            if (availableRoutes.length === 0) {
                return interaction.editReply({ content: `No routes found for ${haulType}.`, components: [] });
            }
            
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('dispatch_route')
                    .setPlaceholder('Select Route')
                    .addOptions(availableRoutes.map(r => ({
                        label: `${r.departure} ↔ ${r.arrival}`,
                        description: `${r.distance}nm | ~${r.time}`,
                        value: r.id
                    })))
            );
            
            await interaction.editReply({
                content: `Selected **${haulType}**. Now select your operational route:`,
                components: [row]
            });
        }
        
        if (interaction.customId === 'dispatch_route') {
            await interaction.deferUpdate();
            const routeId = interaction.values[0];
            const route = ROUTES.find(r => r.id === routeId);
            
            // Get user's unlocked planes
            const userRecord = await db.getUser(interaction.user.id);
            if (!userRecord || userRecord.unlockedPlanes.length === 0) {
                return interaction.editReply({ content: "You haven't unlocked any aircraft yet! Please register or earn promotions.", components: [] });
            }
            
            // Filter planes by Haul Type. 
            // In a real system, you'd strictly map plane capabilities to route types. 
            // For now, let's just let them select from their unlocked planes.
            const validPlanes = userRecord.unlockedPlanes;
            
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`dispatch_aircraft:${routeId}`)
                    .setPlaceholder('Select Aircraft')
                    .addOptions(validPlanes.map(p => ({
                        label: p,
                        value: p
                    })))
            );
            
            await interaction.editReply({
                content: `Route **${route.departure} ➔ ${route.arrival}** selected. Choose your aircraft:`,
                components: [row]
            });
        }
        
        if (interaction.customId.startsWith('dispatch_aircraft:')) {
            await interaction.deferUpdate();
            const routeId = interaction.customId.split(':')[1];
            const aircraft = interaction.values[0];
            const route = ROUTES.find(r => r.id === routeId);
            
            let callsigns = route.callsigns || [];
            if (callsigns.length === 0) {
                if (route.type === 'Cargo') {
                    callsigns.push(`GEC${Math.floor(Math.random() * 900) + 100}`);
                } else if (route.type === 'Domestic') {
                    const userRecord = await db.getUser(interaction.user.id);
                    const flightCount = userRecord ? (userRecord.flightCount || 0) : 0;
                    if (flightCount >= 15) {
                        callsigns.push(`DLH${Math.floor(Math.random() * 900) + 100}`);
                        callsigns.push(`LHX${Math.floor(Math.random() * 900) + 100}`);
                    } else {
                        callsigns.push(`LHX${Math.floor(Math.random() * 900) + 100}`);
                    }
                } else {
                    callsigns.push(`DLH${Math.floor(Math.random() * 900) + 100}`);
                }
            }
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`dispatch_callsign:${routeId}:${aircraft}`)
                    .setPlaceholder('Select Callsign')
                    .addOptions(callsigns.map(c => ({
                        label: c,
                        value: c
                    })))
            );
            
            await interaction.editReply({
                content: `Aircraft **${aircraft}** confirmed. Select your assigned callsign for this route:`,
                components: [row]
            });
        }
        
        if (interaction.customId.startsWith('dispatch_callsign:')) {
            await interaction.deferUpdate();
            const parts = interaction.customId.split(':');
            const routeId = parts[1];
            const aircraft = parts[2];
            const callsign = interaction.values[0];
            
            const route = ROUTES.find(r => r.id === routeId);
            const blockTimeStr = route.time;
            const [hours, mins] = blockTimeStr.split(':').map(Number);
            const blockTimeHours = hours + (mins / 60);
            
            // Very rough realistic fuel estimation based on aircraft size and flight time
            let fuelPerHour = 2500; // A320 default
            if (aircraft.includes('350') || aircraft.includes('330') || aircraft.includes('787')) fuelPerHour = 5500;
            if (aircraft.includes('747') || aircraft.includes('380') || aircraft.includes('777')) fuelPerHour = 8000;
            if (aircraft.includes('ATR') || aircraft.includes('E190')) fuelPerHour = 1000;
            
            const tripFuel = Math.round(blockTimeHours * fuelPerHour);
            const plannedFuel = Math.round(tripFuel + (fuelPerHour * 1.5)); // + reserve
            
            const dateStr = new Date().toISOString().substring(0, 10).replace(/-/g, '').toUpperCase();
            
            const ofpText = `[ LUFTHANSA VIRTUAL OFP ]
--------------------------------------------------------------------
ATC C/S: ${callsign}     ROUTE: ${route.departure} - ${route.arrival}      AIRCRAFT: ${aircraft}
DATE: ${dateStr}     RELEASE: ${new Date().toISOString().substring(11, 16)}Z         DISPATCHER: vDLH-AI
--------------------------------------------------------------------
PLANNED FUEL: ${plannedFuel} KG    TRIP FUEL: ${tripFuel} KG   BLOCK TIME: ${blockTimeStr}
--------------------------------------------------------------------
ROUTING:
${route.routing}
--------------------------------------------------------------------
I HEREWITH CONFIRM THAT I HAVE PERFORMED A THOROUGH SELF BRIEFING...
DISPATCHER: AUTO-DISPATCH                   PIC NAME: ${interaction.user.username.toUpperCase()}`;

            const ofpEmbed = new EmbedBuilder()
                .setTitle(`📝 OFP Released: ${callsign}`)
                .setColor('#05164D')
                .setDescription(`\`\`\`text\n${ofpText}\n\`\`\``);

            // Save OFP to database for live viewing
            await db.setActiveFlight(interaction.user.id, callsign, ofpText);

            // Post to Live Flights channel
            let liveChannelId = await db.getSetting('LIVE_FLIGHTS_CHANNEL_ID');
            if (!liveChannelId) liveChannelId = config.LIVE_FLIGHTS_CHANNEL_ID;
            
            if (liveChannelId && !liveChannelId.startsWith('REPLACE_')) {
                const liveChannel = await interaction.guild.channels.fetch(liveChannelId);
                const liveEmbed = new EmbedBuilder()
                    .setTitle('🛫 Live Flight')
                    .setColor('#0000FF')
                    .addFields(
                        { name: 'Pilot', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Callsign', value: callsign, inline: true },
                        { name: 'Aircraft', value: aircraft, inline: true },
                        { name: 'Route', value: `${route.departure} - ${route.arrival}`, inline: true },
                        { name: 'Status', value: '🟢 En Route', inline: true }
                    )
                    .setTimestamp();
    
                const landButton = new ButtonBuilder()
                    .setCustomId(`land_flight_${interaction.user.id}`)
                    .setLabel('Land Flight')
                    .setStyle(ButtonStyle.Success);
                    
                const cancelButton = new ButtonBuilder()
                    .setCustomId(`cancel_flight_self_${interaction.user.id}`)
                    .setLabel('Cancel Flight')
                    .setStyle(ButtonStyle.Danger);
    
                const liveRow = new ActionRowBuilder().addComponents(landButton, cancelButton);
                await liveChannel.send({ embeds: [liveEmbed], components: [liveRow] });
            }
            
            await interaction.editReply({
                content: `✅ Your flight has been officially dispatched and recorded in <#${liveChannelId}>!`,
                embeds: [ofpEmbed],
                components: []
            });
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'create_checkride_ticket') {
            await interaction.deferReply({ ephemeral: true });
            const userRecord = await db.getUser(interaction.user.id);
            if (!userRecord) {
                return interaction.editReply("❌ You are not registered.");
            }
            const flights = userRecord.flightCount || 0;
            if (flights < 60) {
                return interaction.editReply("❌ You do not have enough flights to request a checkride. (Requires 60+)");
            }
            
            // Determine which checkride it is
            let targetRank = "";
            let rankRole = "";
            if (flights >= 150) {
                targetRank = "Captain";
                rankRole = "1506356784435040306"; // Captain role ID
            } else {
                targetRank = "Senior First Officer";
                rankRole = "1506356832988303460"; // SFO role ID
            }
            
            // Make sure they don't already have the role
            if (interaction.member.roles.cache.has(rankRole)) {
                return interaction.editReply(`❌ You already have the **${targetRank}** role!`);
            }
            
            // Check if they already have a thread open
            const threadName = `checkride-${interaction.user.username}`;
            const existingThread = interaction.channel.threads.cache.find(t => t.name === threadName && !t.archived);
            if (existingThread) {
                return interaction.editReply(`❌ You already have an open checkride ticket: <#${existingThread.id}>`);
            }

            try {
                const thread = await interaction.channel.threads.create({
                    name: threadName,
                    type: 12, // PrivateThread
                    invitable: false,
                    reason: `Checkride requested by ${interaction.user.username}`
                });
                
                await thread.members.add(interaction.user.id);
                
                const embed = new EmbedBuilder()
                    .setTitle(`${targetRank} Checkride`)
                    .setColor("#005C99")
                    .setDescription(`Welcome to your checkride, <@${interaction.user.id}>!\n\nA Type Rating Instructor (<@&${config.TRI_ROLE_ID}>) will be with you shortly to coordinate your examination.\n\n**Current Flights:** ${flights}`);
                    
                const passBtn = new ButtonBuilder()
                    .setCustomId(`pass_checkride_${interaction.user.id}`)
                    .setLabel('Pass Checkride')
                    .setStyle(ButtonStyle.Success);
                    
                const closeBtn = new ButtonBuilder()
                    .setCustomId('close_checkride')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger);
                    
                const row = new ActionRowBuilder().addComponents(passBtn, closeBtn);
                
                await thread.send({ content: `<@${interaction.user.id}> <@&${config.TRI_ROLE_ID}>`, embeds: [embed], components: [row] });
                
                await interaction.editReply(`✅ Your checkride ticket has been created: <#${thread.id}>`);
            } catch (err) {
                console.error("Failed to create private thread:", err);
                await interaction.editReply("❌ Failed to create the ticket. Ensure I have permissions to create Private Threads (Use Private Threads / Send Messages in Threads).");
            }
        } else if (interaction.customId.startsWith('pass_checkride_')) {
            const pilotId = interaction.customId.replace('pass_checkride_', '');
            
            // Check permissions (must have TRI role or Administrator)
            if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.has(config.TRI_ROLE_ID)) {
                return interaction.reply({ content: "❌ Only Type Rating Instructors can pass checkrides.", ephemeral: true });
            }
            
            await interaction.deferReply();
            
            const userRecord = await db.getUser(pilotId);
            if (!userRecord) {
                return interaction.editReply("❌ Could not find pilot in database.");
            }
            
            // Trigger checkPromotions with isCheckridePass = true
            let member;
            try {
                member = await interaction.guild.members.fetch(pilotId);
            } catch (err) {
                return interaction.editReply("❌ Could not find pilot in the server.");
            }
            
            const promo = await checkPromotions(member, userRecord, interaction.guild, 0, true);
            
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
                    .setTitle("✅ Checkride Passed!")
                    .setColor("#00FF00")
                    .setDescription(`Congratulations! You passed your checkride.\n` +
                                    (promo.newRankName ? `You have been promoted to **${promo.newRankName}**!\n` : "") +
                                    `Please select your new aircraft below:`);
                
                await sendDM(member, { embeds: [embedD], components: [row] });
            } else if (promo.newRankName) {
                const embedD = new EmbedBuilder()
                    .setTitle("✅ Checkride Passed!")
                    .setColor("#00FF00")
                    .setDescription(`Congratulations! You passed your checkride and have been promoted to **${promo.newRankName}**!`);
                await sendDM(member, { embeds: [embedD] });
            } else {
                 const embedD = new EmbedBuilder()
                    .setTitle("✅ Checkride Passed!")
                    .setColor("#00FF00")
                    .setDescription(`Congratulations! You passed your checkride.`);
                await sendDM(member, { embeds: [embedD] });
            }
            
            await interaction.editReply(`✅ <@${pilotId}> has passed their checkride. This ticket will close in 10 seconds.`);
            
            setTimeout(async () => {
                if (interaction.channel.isThread()) {
                    await interaction.channel.setArchived(true, "Checkride passed");
                }
            }, 10000);
            
        } else if (interaction.customId === 'close_checkride') {
            // Check permissions (must have TRI role or Administrator)
            if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.has(config.TRI_ROLE_ID)) {
                return interaction.reply({ content: "❌ Only Type Rating Instructors can close checkride tickets.", ephemeral: true });
            }
            
            await interaction.reply({ content: "🔒 Closing ticket in 5 seconds..." });
            
            setTimeout(async () => {
                if (interaction.channel.isThread()) {
                    await interaction.channel.setArchived(true, "Checkride closed manually");
                }
            }, 5000);
        } else if (interaction.customId.startsWith('cancel_flight_self_')) {
            await interaction.deferReply({ ephemeral: true });
            const pilotId = interaction.customId.replace('cancel_flight_self_', '');
            if (interaction.user.id !== pilotId) {
                return interaction.editReply({ content: 'You can only cancel your own flight!' });
            }
            
            await db.clearActiveFlight(pilotId);
            try { await interaction.message.delete(); } catch(e) {}
            return interaction.editReply({ content: "Your active flight has been cancelled." });
        } else if (interaction.customId.startsWith('land_flight_')) {
            await interaction.deferReply({ ephemeral: true });
            const pilotId = interaction.customId.replace('land_flight_', '');
            if (interaction.user.id !== pilotId) {
                return interaction.editReply({ content: 'You can only land your own flight!' });
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
                const cancelBtn = new ButtonBuilder()
                    .setCustomId('cancel_landing')
                    .setLabel('Cancel / Continue Flying')
                    .setStyle(ButtonStyle.Secondary);
                const dmRow = new ActionRowBuilder().addComponents(cancelBtn);

                const dmMessage = await dmChannel.send({ 
                    content: "📸 **Time to land!**\n\nPlease upload your flight screenshot right here in this DM to complete your active flight (`" + callsign + "`). You have 5 minutes.",
                    components: [dmRow]
                });
                
                await interaction.editReply({ content: "📩 Check your DMs! I've sent you a secure link to upload your proof." });
                
                const filter = m => m.author.id === pilotId && m.attachments.size > 0;
                const collector = dmChannel.createMessageCollector({ filter, time: 300000, max: 1 });
                
                const btnCollector = dmMessage.createMessageComponentCollector({ time: 300000 });
                btnCollector.on('collect', async i => {
                    if (i.customId === 'cancel_landing') {
                        collector.stop('cancelled');
                        await i.update({ content: "Landing process cancelled! Your flight is still active. When you are actually ready to land, just click the **Land Flight** button on your flight card again.", components: [] });
                    }
                });
                
                collector.on('collect', async m => {
                    const activeFlightCheck = await db.getActiveFlight({ userId: pilotUser.id });
                    if (!activeFlightCheck) {
                        return m.reply("❌ Your flight is no longer active. You may have already landed or cancelled it.");
                    }
                    
                    const replyMsg = await m.reply("Processing with AI... ⏳");
                    const proof = m.attachments.first();
                    const proofUrl = proof.url;
                    
                    
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
                                    text: `You are an AI Flight Dispatcher. Verify the flight log screenshot against the user's submission.

User Submission:
- Discord Username: ${pilotUser.username} (Global: ${pilotUser.globalName || 'none'}, Server Nickname: ${pilotDisplayName})
- Callsign: ${callsign}
- Aircraft: ${aircraft}
- Departure: ${dep}
- Arrival: ${arr}

Rules for Approval:
1. Username: The "PLAYER NAME" on screen must loosely match the Discord Username, Global Name, OR Server Nickname.
2. Departure and Arrival must match the submission exactly.
   *HINT*: In the flight info panel on the screenshot, the airport on the LEFT is the Departure, and the airport on the RIGHT is the Arrival. Do not swap them.
   *CRITICAL*: The screenshot uses custom in-game airport codes. You MUST map them to real-world ICAO codes before comparing:
   - IRFD -> EDDF
   - IMLR -> EDDW
   - ISAU -> LFPG
   - IKFL -> EGLL
   - IZOL -> LIRF
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
}`
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
                        aiReasoning += `\nExtracted from image: ${data.extracted.callsign}, ${data.extracted.aircraft}, ${data.extracted.departure}, ${data.extracted.arrival}`;
                    }
                }
            } catch (err) {
                console.error("OpenAI verification error:", err);
                aiReasoning = `AI Error: ${err.message}`;
            }
                    
                    if (autoApproved) {
                        await db.incrementMetric('ai_auto_approved');
                        const flightsToAward = await getFlightsToAward(dep, arr);
                        await db.clearActiveFlight(pilotUser.id);
                    const updatedUser = await db.incrementFlightCount(pilotUser.id, flightsToAward);
                        const boostText = flightsToAward > 1 ? ` (+${flightsToAward} Route Boost!)` : ``;
                        try {
                            const member = await guild.members.fetch(pilotUser.id);
                            const promo = await checkPromotions(member, updatedUser, guild, flightsToAward);
                            
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
                                    .setDescription(`Congratulations! Your flight log was Auto-Approved by AI. You now have **${updatedUser.flightCount}** flights.\n` +
                                                    (promo.newRankName ? `You have been promoted to **${promo.newRankName}**!\n` : "") +
                                                    `Please select your new aircraft below:`);
                                
                                await sendDM(member, { embeds: [embedD], components: [row] });
                            } else if (promo.newRankName) {
                                const embedD = new EmbedBuilder()
                                    .setTitle("Flight Log Verified (AI)")
                                    .setColor("#00FF00")
                                    .setDescription(`Congratulations! Your flight log was Auto-Approved by AI. You have reached **${updatedUser.flightCount}** flights and have been promoted to **${promo.newRankName}**!`);
                                await sendDM(member, { embeds: [embedD] });
                            } else {
                                const embedD = new EmbedBuilder()
                                .setTitle("Flight Log Verified (AI)")
                                .setColor("#00FF00")
                                .setDescription(`Your flight log for **${callsign}** (${dep} ➔ ${arr}) was automatically verified by AI.\nYou now have **${updatedUser.flightCount}** flights${boostText}.`);
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
                                        { name: "Pilot", value: `<@${pilotUser.id}>`, inline: true },
                                        { name: "Callsign", value: callsign, inline: true },
                                        { name: "Aircraft", value: aircraft, inline: true },
                                        { name: "Route", value: route, inline: true },
                                        { name: "Status", value: '🛬 Arrived (Verified)', inline: true },
                                        { name: "AI Reasoning", value: aiReasoning, inline: false }
                                    ],
                                    image: { url: proofUrl },
                                    footer: { text: `User ID: ${pilotUser.id}` }
                                };
                                
                                let tags = [];
                                if (logsChannel.availableTags) {
                                    const approvedTag = logsChannel.availableTags.find(t => t.name.toLowerCase() === 'approved');
                                    if (approvedTag) tags.push(approvedTag.id);
                                }
                                
                                await logsChannel.threads.create({
                                    name: `${callsign} - ${pilotDisplayName}`,
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
                            .setCustomId(`approve_flight_${pilotUser.id}`)
                            .setLabel("Approve")
                            .setStyle(ButtonStyle.Success);
                            
                        const denyBtn = new ButtonBuilder()
                            .setCustomId(`deny_flight_${pilotUser.id}`)
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
                                        { name: "Pilot", value: `<@${pilotUser.id}>`, inline: true },
                                        { name: "Callsign", value: callsign, inline: true },
                                        { name: "Aircraft", value: aircraft, inline: true },
                                        { name: "Route", value: route, inline: true },
                                        { name: "Status", value: '🛬 Arrived (Pending Dispatcher)', inline: true },
                                        { name: "AI Check", value: aiReasoning, inline: false }
                                    ],
                                    image: { url: proofUrl },
                                    footer: { text: `User ID: ${pilotUser.id}` }
                                };
                                
                                let tags = [];
                                if (logsChannel.availableTags) {
                                    const pendingTag = logsChannel.availableTags.find(t => t.name.toLowerCase() === 'pending');
                                    if (pendingTag) tags.push(pendingTag.id);
                                }
                                
                                await logsChannel.threads.create({
                                    name: `${callsign} - ${pilotDisplayName}`,
                                    message: { 
                                        content: `<@&${config.DISPATCHER_ROLE_ID}>`,
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

                collector.on('end', (collected, reason) => {
                    if (reason === 'cancelled') return;
                    if (collected.size === 0) {
                        dmChannel.send("❌ You didn't upload your screenshot within 5 minutes. If you still need to land, use the `/land` command in the bot commands channel, or click the **Land Flight** button on your flight card again.");
                    }
                });

            } catch (error) {
                console.error("Failed to DM user:", error);
                return interaction.editReply({ content: '🛬 **Time to land!**\nYour DMs are disabled! Please temporarily enable your DMs for this server, and then click the **Land Flight** button again.' });
            }
        }

        const dispatcherRoleId = config.DISPATCHER_ROLE_ID;
        
        if (interaction.customId.startsWith('roster_prev_')) {
            await interaction.deferUpdate();
            const currentPage = parseInt(interaction.customId.split('_')[2], 10);
            const pageData = await getRosterPage(currentPage - 1);
            await interaction.editReply(pageData);
            return;
        } else if (interaction.customId.startsWith('roster_next_')) {
            await interaction.deferUpdate();
            const currentPage = parseInt(interaction.customId.split('_')[2], 10);
            const pageData = await getRosterPage(currentPage + 1);
            await interaction.editReply(pageData);
            return;
        }
        
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
                if (processingFlights.has(interaction.message.id)) {
                    return interaction.reply({ content: "Someone else is already processing this flight log!", ephemeral: true });
                }
                processingFlights.add(interaction.message.id);
                await interaction.deferUpdate();
                await db.incrementMetric('manual_approvals');
                
                const routeField = embed.fields.find(f => f.name === "Route")?.value || "";
                let dep = "UNKNOWN";
                let arr = "UNKNOWN";
                if (routeField.includes('-')) {
                    const parts = routeField.split('-');
                    dep = parts[0].trim();
                    arr = parts[1].trim();
                }

                const flightsToAward = await getFlightsToAward(dep, arr);
                const boostText = flightsToAward > 1 ? ` (+${flightsToAward} Route Boost!)` : ``;
                
                updatedEmbed.color = 0x00ff00; // Green
                updatedEmbed.title = "Flight Log Approved";
                updatedEmbed.fields.push({ name: "Reviewed By", value: `<@${interaction.user.id}>`, inline: false });
                
                const statusIndex = updatedEmbed.fields.findIndex(f => f.name === 'Status');
                if (statusIndex !== -1) {
                    updatedEmbed.fields[statusIndex].value = '🛬 Arrived (Verified)';
                }
                
                await interaction.editReply({ embeds: [updatedEmbed], components: [] });
                
                // Process the promotion
                await db.clearActiveFlight(pilotId);
                const updatedUser = await db.incrementFlightCount(pilotId, flightsToAward);
                try {
                    const member = await interaction.guild.members.fetch(pilotId);
                    const promo = await checkPromotions(member, updatedUser, interaction.guild, flightsToAward);
                    
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
                        
                        await sendDM(member, { embeds: [embed], components: [row] });
                    } else if (promo.newRankName) {
                        const embed = new EmbedBuilder()
                            .setTitle("Flight Log Approved")
                            .setColor("#00FF00")
                            .setDescription(`Congratulations! Your flight log was approved. You have reached **${updatedUser.flightCount}** flights and have been promoted to **${promo.newRankName}**!`);
                        await sendDM(member, { embeds: [embed] });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle("Flight Log Approved")
                            .setColor("#00FF00")
                            .setDescription(`Your flight log was approved! You now have **${updatedUser.flightCount}** flights${boostText}.`);
                        await sendDM(member, { embeds: [embed] });
                    }
                } catch (err) {
                    console.error("Error updating member on approve:", err);
                }
                
                // Tag thread if applicable
                if (interaction.channel.isThread()) {
                    const parentChannel = interaction.channel.parent;
                    if (parentChannel && parentChannel.availableTags) {
                        const approvedTag = parentChannel.availableTags.find(t => t.name.toLowerCase() === 'approved');
                        if (approvedTag) {
                            const newTags = new Set(interaction.channel.appliedTags);
                            const pendingTag = parentChannel.availableTags.find(t => t.name.toLowerCase() === 'pending');
                            if (pendingTag) newTags.delete(pendingTag.id);
                            newTags.add(approvedTag.id);
                            await interaction.channel.setAppliedTags(Array.from(newTags));
                        }
                    }
                }
            } else {
                // Deny flight: Launch a modal
                const modal = new ModalBuilder()
                    .setCustomId(`deny_reason_modal_${pilotId}_${interaction.message.id}`)
                    .setTitle('Deny Flight Log');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('deny_reason_input')
                    .setLabel('Reason for denial')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder('e.g., Missing screenshot, wrong callsign...');

                const firstActionRow = new ActionRowBuilder().addComponents(reasonInput);
                modal.addComponents(firstActionRow);
                
                await interaction.showModal(modal);
            }
        }
    } else if (interaction.isModalSubmit()) {




        if (interaction.customId.startsWith('deny_reason_modal_')) {
            const parts = interaction.customId.split('_');
            const msgId = parts[4];
            if (processingFlights.has(msgId)) {
                return interaction.reply({ content: "Someone else is already processing this flight log!", ephemeral: true });
            }
            processingFlights.add(msgId);
            await interaction.deferReply({ ephemeral: true });
            const pilotId = parts[3];
            
            const reason = interaction.fields.getTextInputValue('deny_reason_input');
            
            try {
                const originalMsg = await interaction.channel.messages.fetch(msgId);
                const embed = originalMsg.embeds[0];
                const updatedEmbed = { ...embed.data };
                
                updatedEmbed.color = 0xff0000; // Red
                updatedEmbed.title = "Flight Log Denied";
                updatedEmbed.fields.push({ name: "Reviewed By", value: `<@${interaction.user.id}>`, inline: false });
                updatedEmbed.fields.push({ name: "Reason", value: reason, inline: false });
                
                const statusIndex = updatedEmbed.fields.findIndex(f => f.name === 'Status');
                if (statusIndex !== -1) {
                    updatedEmbed.fields[statusIndex].value = '❌ Denied';
                }
                
                await originalMsg.edit({ embeds: [updatedEmbed], components: [] });
                await db.incrementMetric('manual_denials');
                await db.clearActiveFlight(pilotId);
                await interaction.editReply({ content: "Flight log denied successfully." });
                
                // Tag thread if applicable
                if (interaction.channel.isThread()) {
                    const parentChannel = interaction.channel.parent;
                    if (parentChannel && parentChannel.availableTags) {
                        const deniedTag = parentChannel.availableTags.find(t => t.name.toLowerCase() === 'denied');
                        if (deniedTag) {
                            const newTags = new Set(interaction.channel.appliedTags);
                            const pendingTag = parentChannel.availableTags.find(t => t.name.toLowerCase() === 'pending');
                            if (pendingTag) newTags.delete(pendingTag.id);
                            newTags.add(deniedTag.id);
                            await interaction.channel.setAppliedTags(Array.from(newTags));
                        }
                    }
                }

                try {
                    const member = await interaction.guild.members.fetch(pilotId);
                    const dmEmbed = new EmbedBuilder()
                        .setTitle("Flight Log Denied")
                        .setColor("#FF0000")
                        .setDescription(`Your recent flight log was denied by a Dispatcher.\n\n**Reason:** ${reason}\n\nPlease ensure all your information and proof is correct before submitting again.`);
                    await sendDM(member, { embeds: [dmEmbed] });
                } catch (err) {}
            } catch (err) {
                console.error("Modal submit error:", err);
                await interaction.editReply({ content: "An error occurred while denying." });
            }
        }
    }
    } catch (err) {
        console.error("Interaction error:", err);
        sendErrorToOwner(err, `interactionCreate: ${interaction.commandName || interaction.customId || 'Unknown'}`);
        try {
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "An error occurred while processing this command.", ephemeral: true });
            } else if (interaction.isRepliable() && interaction.deferred) {
                await interaction.editReply({ content: "An error occurred while processing this command.", embeds: [], components: [] });
            }
        } catch (replyErr) {
            console.error("Failed to send error reply:", replyErr);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
