module.exports = {
    // The ID of the vDLH Assistant bot that posts the flight logs
    FLIGHT_LOG_BOT_ID: '1506378385021075657',

    // Discord Channel/Category configurations
    LOGS_CHANNEL_ID: '1506743218354524251',
    LIVE_FLIGHTS_CHANNEL_ID: '1519081183286132857',
    DISPATCHER_ROLE_ID: '1506356705175404726',

    // Define the promotion tiers and the planes unlocked at each step
    PROMOTIONS: [
        {
            flightsRequired: 0,
            rankName: "Second Officer",
            rankRoleId: "1506356938823303178",
            unlocks: ["E190", "A320neo"],
            canPick: 2
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
            unlocks: ["B787"],
            canPick: 1
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
        "E190": "1507311793175924776",
        "A320neo": "1507311824427814932",
        "B787": "1507311916144394270",
        "B747-8": "1507312037720752190",
        "A380": "1507312009669120101",
        "B777F": "1507311947362730085"
    }
};
