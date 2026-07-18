module.exports = {

    // Discord Channel/Category configurations
    LOGS_CHANNEL_ID: '1511388191809212478',
    LIVE_FLIGHTS_CHANNEL_ID: '1519081183286132857',
    DISPATCHER_ROLE_ID: '1506356705175404726',
    TRI_ROLE_ID: '1519081591761145896',

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
            flightsRequired: 60,
            rankName: "Senior First Officer",
            rankRoleId: "1506356832988303460",
            unlocks: ["A350", "A330", "B777F", "B787"],
            canPick: 1
        },
        {
            flightsRequired: 100,
            rankName: "SFO Checkpoint",
            rankRoleId: "NO ROLE FOR THIS RANK",
            unlocks: ["A350", "A330", "B777F", "B787"],
            canPick: 2
        },
        {
            flightsRequired: 150,
            rankName: "Captain",
            rankRoleId: "1506356784435040306",
            unlocks: ["B747-8", "A380"],
            canPick: 1
        },
        {
            flightsRequired: 200,
            rankName: "Captain Checkpoint",
            rankRoleId: "NO ROLE FOR THIS RANK",
            unlocks: ["B747-8", "A380"],
            canPick: 2
        }
    ],

    // Map each plane name to its corresponding Discord Role ID
    PLANE_ROLES: {
        "ATR72": "1507311760711876648",
        "A330": "1507311854160973894",
        "A320neo": "1507311824427814932",
        "A350": "1507311916144394270",
        "B747-8": "1507312037720752190",
        "A380": "1507312009669120101",
        "B777F": "1507311947362730085",
        "B787": "1520361475607232583"
    },

    // Map each haul type to its allowed aircraft
    HAUL_PLANES: {
        'Domestic': ['A320neo', 'ATR72'],
        'Short Haul': ['A320neo', 'ATR72'],
        'Medium Haul': ['A350', 'A330', 'B787'],
        'Long Haul': ['B747-8', 'A380', 'B787'],
        'Cargo': ['B777F']
    }
};
