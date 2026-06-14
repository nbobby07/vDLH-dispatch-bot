module.exports = {
    // The ID of the vBA Assistant bot that posts the flight logs
    FLIGHT_LOG_BOT_ID: '1506378385021075657',

    // Discord Channel/Category configurations (Optional depending on how you structure your server)
    // Replace these with actual IDs in your server
    LOGS_CHANNEL_ID: '1506743218354524251',
    DISPATCHER_ROLE_ID: '1506356705175404726',

    // Define the promotion tiers and the planes unlocked at each step
    PROMOTIONS: [
        {
            flightsRequired: 0,
            rankName: "Cadet",
            rankRoleId: "1506356938823303178",
            unlocks: ["CRJ200LR", "ATR72"],
            canPick: 1
        },
        {
            flightsRequired: 15,
            rankName: "Novice First Officer",
            rankRoleId: "1506356891800961137",
            unlocks: ["E190", "A320", "B737"], // B737 is for booster/supporter
            canPick: 1
        },
        {
            flightsRequired: 35,
            rankName: "Novice First Officer",
            rankRoleId: "1506356891800961137", // They already have this, but unlocking options
            unlocks: ["E190", "A320", "B737"],
            canPick: 2 // Can pick the other option now
        },
        {
            flightsRequired: 65,
            rankName: "Senior First Officer",
            rankRoleId: "1506356832988303460",
            unlocks: ["B757", "B767"],
            canPick: 1
        },
        {
            flightsRequired: 75,
            rankName: "Senior First Officer",
            rankRoleId: "1506356832988303460",
            unlocks: ["B757", "B767"],
            canPick: 2
        },
        {
            flightsRequired: 90,
            rankName: "Novice Captain",
            rankRoleId: "1506356784435040306",
            unlocks: ["B787"],
            canPick: 1
        },
        {
            flightsRequired: 130,
            rankName: "Novice Captain",
            rankRoleId: "1506356784435040306",
            unlocks: ["B777", "A350"],
            canPick: 1
        },
        {
            flightsRequired: 150,
            rankName: "Novice Captain",
            rankRoleId: "1506356784435040306",
            unlocks: ["B777", "A350"],
            canPick: 2
        },
        {
            flightsRequired: 180,
            rankName: "Senior Captain",
            rankRoleId: "1506356741590351964",
            unlocks: ["B747", "A380"],
            canPick: 1
        },
        {
            flightsRequired: 200,
            rankName: "Senior Captain",
            rankRoleId: "1506356741590351964",
            unlocks: ["B747", "A380"],
            canPick: 2
        },
        {
            flightsRequired: 250,
            rankName: "Special Aircraft",
            rankRoleId: "NO ROLE FOR THIS RANK",
            unlocks: ["Concorde"],
            canPick: 1
        }
    ],

    // Map each plane name to its corresponding Discord Role ID
    PLANE_ROLES: {
        "CRJ200LR": "1507311722229403668",
        "ATR72": "1507311760711876648",
        "E190": "1507311793175924776",
        "A320": "1507311824427814932",
        "B737": "1515479431387414681", // For supporter or booster
        "B757": "1507311854160973894",
        "B767": "1507311885647609967",
        "B787": "1507311916144394270",
        "B777": "1507311947362730085",
        "A350": "1507311977226174555",
        "B747": "1507312037720752190",
        "A380": "1507312009669120101",
        "Concorde": "1507312079453945927"
    }
};
