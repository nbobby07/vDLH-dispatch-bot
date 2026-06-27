require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const channelId = '1506552264674906164'; 
    
    try {
        const channel = await client.channels.fetch(channelId);
        
        // Purge old messages
        const fetched = await channel.messages.fetch({ limit: 10 });
        for (const msg of fetched.values()) {
            await msg.delete().catch(()=>console.log("Could not delete message"));
        }
        
        const lufthansaBlue = '#05164D';
        
        const bannerFile = new AttachmentBuilder('C:\\\\Users\\\\Noel\\\\.gemini\\\\antigravity\\\\brain\\\\5bbce9ee-64d9-4a64-9202-a5a91579124d\\\\lufthansa_promotion_banner_1782282012620.png');

        const embedWelcome = new EmbedBuilder()
            .setTitle("Lufthansa Virtual Promotion System")
            .setDescription("Our promotion system is through activity within the airline. The more flights a pilot logs, the higher they climb in the ranks. Pilots can progress from smaller regional aircraft to our flagship long-haul fleet, providing a realistic career path throughout your time at Lufthansa Virtual.")
            .setColor(lufthansaBlue)
            .setImage('attachment://lufthansa_promotion_banner_1782282012620.png');
            
        const embedProgression = new EmbedBuilder()
            .setTitle("Promotion System")
            .setColor(lufthansaBlue)
            .setDescription(
                "Before you start flying, you will be assigned to **Lufthansa City (LHX)** operations.\n\n" +
                
                "<@&1506356938823303178>\n" +
                "• **0 Flight Logs:** Restricted to Lufthansa City (LHX) operations (e.g., EDDM-LIRF, EDDF-LFPG, and Domestic).\n" +
                "• Authorized to fly the **A320neo**.\n\n" +

                "<@&1506356891800961137>\n" +
                "• **15 Flight Logs:** Promoted to mainline operations.\n" +
                "• Authorized to fly all Short-Haul flights using the main Lufthansa (DLH) callsign, alongside your LHX routes.\n\n" +

                "<@&1506356832988303460> / <@&1512873928639381504>\n" +
                "• **60 Flight Logs:** Choose your path! Pick your first Type Rating for Medium Haul (`A350`, `A330`, `B787`) **OR** transition to Cargo (`B777F`).\n" +
                "• **100 Flight Logs:** *Checkpoint!* Unlock an additional Type Rating from the Medium Haul / Cargo pool.\n\n" +

                "<@&1506356784435040306>\n" +
                "• **150 Flight Logs:** Reach the peak. Unlocks our heavy & long-haul fleet. Pick your first rating (`B747-8`, `A380`).\n" +
                "• **200 Flight Logs:** *Checkpoint!* Unlock your final heavy/long-haul rating.\n\n" +

                "**SPECIAL AIRCRAFT**\n" +
                "• **ATR72:** Exclusive to Server Boosters / Supporters."
            );

        await channel.send({ embeds: [embedWelcome, embedProgression], files: [bannerFile] });
        console.log("Sent promotions info!");
        
    } catch (e) {
        console.error("Error:", e);
    }
    
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
