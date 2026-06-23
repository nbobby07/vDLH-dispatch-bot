module.exports = {
    // The ID of the vDLH Assistant bot that posts the flight logs
    FLIGHT_LOG_BOT_ID: '1506378385021075657',

    // Discord Channel/Category configurations
    LOGS_CHANNEL_ID: '1506743218354524251',
    LIVE_FLIGHTS_CHANNEL_ID: 'REPLACE_ME_LIVE_FLIGHTS',
    DISPATCHER_ROLE_ID: '1506356705175404726',

    // Define the promotion tiers and the planes unlocked at each step
    PROMOTIONS: [
        {
            flightsRequired: 0,
            rankName: "Second Officer",
            rankRoleId: "ROLE_ID_SO",
            unlocks: ["E190", "A320neo"],
            canPick: 2
        },
        {
            flightsRequired: 15,
            rankName: "First Officer",
            rankRoleId: "ROLE_ID_FO",
            unlocks: [], // Just route unlocks, handled by ATC/Pilots
            canPick: 0
        },
        {
            flightsRequired: 35,
            rankName: "Senior First Officer",
            rankRoleId: "ROLE_ID_SFO",
            unlocks: ["B787"],
            canPick: 1
        },
        {
            flightsRequired: 75,
            rankName: "Captain",
            rankRoleId: "ROLE_ID_CPT",
            unlocks: ["B747-8", "A380", "B777F"],
            canPick: 3
        }
    ],

    // Map each plane name to its corresponding Discord Role ID
    PLANE_ROLES: {
        "E190": "ROLE_ID_E190",
        "A320neo": "ROLE_ID_A320neo",
        "B787": "ROLE_ID_B787",
        "B747-8": "ROLE_ID_B747_8",
        "A380": "ROLE_ID_A380",
        "B777F": "ROLE_ID_B777F"
    }
};
