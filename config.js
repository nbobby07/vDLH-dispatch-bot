module.exports = {
    // The ID of the vDLH Assistant bot that posts the flight logs
    FLIGHT_LOG_BOT_ID: '1506378385021075657',

    // Discord Channel/Category configurations
    LOGS_CHANNEL_ID: '1511388191809212478',
    LIVE_FLIGHTS_CHANNEL_ID: '1519081183286132857',
    DISPATCHER_ROLE_ID: '1506356705175404726',

    // Define the promotion tiers and the planes unlocked at each step
    PROMOTIONS: [
        {
            flightsRequired: 0,
            rankName: "Second Officer",
            rankRoleId: "1506356938823303178",
            unlocks: ["A320neo"],
            canPick: 1
        },
        {
            flightsRequired: 15,
            rankName: "First Officer",
            rankRoleId: "1506356891800961137",
            unlocks: [], // Just route unlocks, handled by ATC/Pilots
            canPick: 0
        },
        {
            flightsRequired: 35,
            rankName: "Senior First Officer",
            rankRoleId: "1506356832988303460",
            unlocks: ["A350", "A330"],
            canPick: 2
        },
        {
            flightsRequired: 75,
            rankName: "Captain",
            rankRoleId: "1506356784435040306",
            unlocks: ["B747-8", "A380", "B777F"],
            canPick: 3
        }
    ],

    // Map each plane name to its corresponding Discord Role ID
    PLANE_ROLES: {
        "ATR72": "1507311793175924776", // Reused E190 role ID for now
        "A330": "REPLACE_ME_A330_ROLE_ID",
        "A320neo": "1507311824427814932",
        "A350": "1507311916144394270", // Reused B787 role ID for now
        "B747-8": "1507312037720752190",
        "A380": "1507312009669120101",
        "B777F": "1507311947362730085"
    }
};
