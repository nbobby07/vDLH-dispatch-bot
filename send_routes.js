require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const channelId = '1506357722692583663';
    
    try {
        const channel = await client.channels.fetch(channelId);
        
        // Purge old messages
        const fetched = await channel.messages.fetch({ limit: 10 });
        for (const msg of fetched.values()) {
            await msg.delete().catch(()=>console.log("Could not delete message"));
        }
        
        const lufthansaBlue = '#05164D';
        const lufthansaYellow = '#FFCC00';
        
        const bannerFile = new AttachmentBuilder('C:\\\\Users\\\\Noel\\\\.gemini\\\\antigravity\\\\brain\\\\5bbce9ee-64d9-4a64-9202-a5a91579124d\\\\lufthansa_routes_banner_1782279719951.png');

        const embedWelcome = new EmbedBuilder()
            .setTitle("Lufthansa Virtual Routes")
            .setDescription("Welcome to the **Lufthansa Virtual** routes page! Here you will find all the approved dispatch routes you need to fly for our virtual airline. Make sure to file your logs correctly according to these pairs.")
            .setColor(lufthansaBlue)
            .setImage('attachment://lufthansa_routes_banner_1782279719951.png');
            
        const embedShort = new EmbedBuilder()
            .setTitle("SHORT-HAUL FLEET: [A320neo / ATR72]")
            .setDescription(
                "• Frankfurt [IRFD/EDDF] ↔ Munich [IPPH/EDDM]\n" +
                "• Frankfurt [IRFD/EDDF] ↔ Bremen [IMLR/EDDW]\n" +
                "• Munich [IPPH/EDDM] ↔ Bremen [IMLR/EDDW]\n\n" +
                "• Frankfurt [IRFD/EDDF] ➔ Paris [ISAU/LFPG]\n" +
                "• Munich [IPPH/EDDM] ➔ Rome [IZOL/LIRF]"
            )
            .setColor(lufthansaBlue);

        const embedMedium = new EmbedBuilder()
            .setTitle("MEDIUM-HAUL FLEET: [A350 / A330 / B787]")
            .setDescription(
                "• Frankfurt [IRFD/EDDF] ➔ Athens [ILAR/LGAV]\n" +
                "• Munich [IPPH/EDDM] ➔ Athens [ILAR/LGAV]\n" +
                "• Munich [IPPH/EDDM] ➔ London [IKFL/EGLL]\n" +
                "• Frankfurt [IRFD/EDDF] ➔ Mallorca [IPAP/LEPA]"
            )
            .setColor(lufthansaBlue);
            
        const embedLong = new EmbedBuilder()
            .setTitle("HEAVY & LONG-HAUL FLEET: [B747-8 / A380]")
            .setDescription(
                "• Frankfurt [IRFD/EDDF] ➔ Tokyo [ITKO/RJTT] *(Our main long haul)*\n" +
                "• Frankfurt [IRFD/EDDF] ➔ London [IKFL/EGLL]\n" +
                "• Munich [IPPH/EDDM] ➔ Mallorca [IPAP/LEPA]"
            )
            .setColor(lufthansaBlue);
            
        const embedCargo = new EmbedBuilder()
            .setTitle("LUFTHANSA CARGO: [B777F]")
            .setDescription(
                "• Frankfurt [IRFD/EDDF] ➔ London [IKFL/EGLL]\n" +
                "• Frankfurt [IRFD/EDDF] ➔ Tokyo [ITKO/RJTT]\n" +
                "• Munich [IPPH/EDDM] ➔ Tokyo [ITKO/RJTT]\n" +
                "• Frankfurt [IRFD/EDDF] ➔ Rome [IZOL/LIRF]\n" +
                "• Munich [IPPH/EDDM] ➔ Rome [IZOL/LIRF]\n" +
                "• Frankfurt [IRFD/EDDF] ➔ Athens [ILAR/LGAV]\n" +
                "• Munich [IPPH/EDDM] ➔ Athens [ILAR/LGAV]"
            )
            .setColor(lufthansaYellow);

        await channel.send({ embeds: [embedWelcome, embedShort, embedMedium, embedLong, embedCargo], files: [bannerFile] });
        console.log("Sent routes!");
        
    } catch (e) {
        console.error("Error:", e);
    }
    
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
