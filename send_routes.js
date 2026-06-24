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
                "• Frankfurt [IRFD] ↔ Munich [IPPH]\n" +
                "• Frankfurt [IRFD] ↔ Bremen [IMLR]\n" +
                "• Munich [IPPH] ↔ Bremen [IMLR]\n\n" +
                "• Frankfurt [IRFD] ➔ Paris [ISOU]\n" +
                "• Munich [IPPH] ➔ Rome [IIZO]"
            )
            .setColor(lufthansaBlue);

        const embedMedium = new EmbedBuilder()
            .setTitle("MEDIUM-HAUL FLEET: [A350 / A330]")
            .setDescription(
                "• Frankfurt [IRFD] ➔ Athens [ILAR]\n" +
                "• Munich [IPPH] ➔ Athens [ILAR]\n" +
                "• Munich [IPPH] ➔ London [IKFL]\n" +
                "• Frankfurt [IRFD] ➔ Mallorca [IPAP]"
            )
            .setColor(lufthansaBlue);
            
        const embedLong = new EmbedBuilder()
            .setTitle("HEAVY & LONG-HAUL FLEET: [B747-8 / A380]")
            .setDescription(
                "• Frankfurt [IRFD] ➔ Tokyo [ITKO] *(Our main long haul)*\n" +
                "• Frankfurt [IRFD] ➔ London [IKFL]\n" +
                "• Munich [IPPH] ➔ Mallorca [IPAP]"
            )
            .setColor(lufthansaBlue);
            
        const embedCargo = new EmbedBuilder()
            .setTitle("LUFTHANSA CARGO: [B777F]")
            .setDescription(
                "• Frankfurt [IRFD] ➔ London [IKFL]\n" +
                "• Frankfurt [IRFD] ➔ Tokyo [ITKO]"
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
