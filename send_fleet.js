require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const channelId = '1506357669903077386'; // Replace with actual fleet channel ID
    
    try {
        const channel = await client.channels.fetch(channelId);
        
        // Purge old messages
        const fetched = await channel.messages.fetch({ limit: 10 });
        for (const msg of fetched.values()) {
            await msg.delete().catch(()=>console.log("Could not delete message"));
        }
        
        const lufthansaBlue = '#05164D';
        
        const bannerFile = new AttachmentBuilder('C:\\\\Users\\\\Noel\\\\.gemini\\\\antigravity\\\\brain\\\\5bbce9ee-64d9-4a64-9202-a5a91579124d\\\\lufthansa_fleet_banner_1782280310375.png');

        const embedWelcome = new EmbedBuilder()
            .setTitle("Lufthansa Virtual Fleet")
            .setDescription("This is a list of all the aircraft currently operated by Lufthansa Virtual across our fleet. From short-haul regional operations to long-haul international routes, our aircraft are used by pilots to provide realistic operations throughout the network.")
            .setColor(lufthansaBlue)
            .setImage('attachment://lufthansa_fleet_banner_1782280310375.png');
            
        const embedFleet = new EmbedBuilder()
            .setTitle("Lufthansa Virtual Fleet")
            .setColor(lufthansaBlue)
            .addFields(
                { name: "SHORT-HAUL FLEET", value: "• A320neo", inline: false },
                { name: "MEDIUM-HAUL FLEET", value: "• A330\n• A350", inline: false },
                { name: "HEAVY & LONG-HAUL FLEET", value: "• B747-8\n• A380", inline: false },
                { name: "LUFTHANSA CARGO", value: "• B777F", inline: false },
                { name: "SPECIAL OPERATIONS", value: "• ATR72 - **Booster / Supporter Exclusive**", inline: false }
            );

        await channel.send({ embeds: [embedWelcome, embedFleet], files: [bannerFile] });
        console.log("Sent fleet info!");
        
    } catch (e) {
        console.error("Error:", e);
    }
    
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
