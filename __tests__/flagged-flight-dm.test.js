jest.mock('dotenv', () => ({ config: jest.fn() }));

const mockDb = {
    getActiveFlight: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    incrementMetric: jest.fn().mockResolvedValue(),
    getSetting: jest.fn().mockResolvedValue('12345'),
    logFlightResolution: jest.fn().mockResolvedValue(),
    clearActiveFlight: jest.fn().mockResolvedValue(),
    getUser: jest.fn().mockResolvedValue({ flightCount: 1, unlockedPlanes: [] }),
    createUser: jest.fn().mockResolvedValue({ flightCount: 1, unlockedPlanes: [] })
};
jest.mock('../db', () => mockDb);

jest.mock('@google/genai', () => {
    return {
        GoogleGenAI: jest.fn().mockImplementation(() => {
            return {
                models: {
                    generateContent: jest.fn().mockResolvedValue({
                        text: JSON.stringify({
                            approved: false,
                            reasoning: "Mismatched aircraft.",
                            extracted: { callsign: 'AAL1', aircraft: 'B737', departure: 'JFK', arrival: 'LAX', username: 'pilot' }
                        })
                    })
                }
            };
        })
    };
});

jest.mock('@napi-rs/canvas', () => ({
    createCanvas: jest.fn().mockReturnValue({ 
        getContext: () => ({ fillStyle: '', fillRect: jest.fn(), font: '', fillText: jest.fn(), createLinearGradient: jest.fn().mockReturnValue({ addColorStop: jest.fn() }), roundRect: jest.fn(), fill: jest.fn(), save: jest.fn(), beginPath: jest.fn(), arc: jest.fn(), closePath: jest.fn(), clip: jest.fn(), drawImage: jest.fn(), restore: jest.fn(), stroke: jest.fn() }), 
        toBuffer: jest.fn().mockReturnValue(Buffer.from('')),
        encode: jest.fn().mockResolvedValue(Buffer.from(''))
    }),
    loadImage: jest.fn().mockResolvedValue({ width: 100, height: 100 }),
    GlobalFonts: { registerFromPath: jest.fn() }
}));

const mockClientOn = jest.fn();
const mockDiscord = {
    Client: jest.fn().mockImplementation(() => ({
        on: mockClientOn,
        once: jest.fn(),
        login: jest.fn(),
        users: { fetch: jest.fn().mockResolvedValue({ send: jest.fn() }) }
    })),
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 3, DirectMessages: 4 },
    Partials: { Message: 1, Channel: 2 },
    Events: { ClientReady: 'ready', InteractionCreate: 'interactionCreate' },
    StringSelectMenuBuilder: jest.fn(),
    StringSelectMenuOptionBuilder: jest.fn(),
    ActionRowBuilder: jest.fn().mockImplementation(() => ({ addComponents: jest.fn().mockReturnThis() })),
    REST: jest.fn().mockImplementation(() => ({ setToken: jest.fn().mockReturnThis(), put: jest.fn() })),
    Routes: { applicationCommands: jest.fn() },
    ButtonBuilder: jest.fn().mockImplementation(() => ({
        setCustomId: jest.fn().mockReturnThis(),
        setLabel: jest.fn().mockReturnThis(),
        setStyle: jest.fn().mockReturnThis(),
        setDisabled: jest.fn().mockReturnThis()
    })),
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
    EmbedBuilder: jest.fn().mockImplementation(() => ({
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setColor: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
        addFields: jest.fn().mockReturnThis()
    })),
    AttachmentBuilder: jest.fn()
};
jest.mock('discord.js', () => mockDiscord);

require('../index');

describe('Flagged Flight DM', () => {
    it('sends a DM when a flight is flagged', async () => {
        // Find the interactionCreate handler
        const interactionCreateCall = mockClientOn.mock.calls.find(call => call[0] === 'interactionCreate');
        expect(interactionCreateCall).toBeDefined();
        const interactionCreateHandler = interactionCreateCall[1];

        const mockCollectorOn = jest.fn();
        const mockDmMessage = {
            createMessageComponentCollector: jest.fn().mockReturnValue({ on: jest.fn() })
        };
        const mockDmChannel = {
            send: jest.fn().mockResolvedValue(mockDmMessage),
            createMessageCollector: jest.fn().mockReturnValue({ on: mockCollectorOn, stop: jest.fn() })
        };
        const mockReplyMsg = { edit: jest.fn() };

        const interaction = {
            isCommand: () => false,
            isButton: () => true,
            isChatInputCommand: () => false,
            isStringSelectMenu: () => false,
            isModalSubmit: () => false,
            isRepliable: () => true,
            customId: 'land_flight_pilot123',
            user: { id: 'pilot123', createDM: jest.fn().mockResolvedValue(mockDmChannel) },
            guild: {
                members: { fetch: jest.fn().mockResolvedValue({ displayName: 'Pilot Bob', user: { username: 'Pilot Bob' } }) },
                channels: {
                    fetch: jest.fn().mockResolvedValue({
                        messages: { fetch: jest.fn().mockResolvedValue({ delete: jest.fn() }) },
                        threads: { create: jest.fn() }
                    })
                }
            },
            message: {
                id: 'msg123',
                embeds: [
                    {
                        fields: [
                            { name: 'Callsign', value: 'AAL1' },
                            { name: 'Aircraft', value: 'B737' },
                            { name: 'Route', value: 'JFK-LAX' }
                        ]
                    }
                ]
            },
            deferReply: jest.fn(),
            editReply: jest.fn().mockResolvedValue(mockReplyMsg),
            channelId: 'live_channel_id',
            member: { roles: { cache: { has: jest.fn() } }, permissions: { has: jest.fn() } }
        };

        await interactionCreateHandler(interaction);

        // Advance past immediate code to let collector setup
        await new Promise(resolve => setTimeout(resolve, 0));

        // Trigger collector collect event
        const collectCall = mockCollectorOn.mock.calls.find(call => call[0] === 'collect');
        expect(collectCall).toBeDefined();
        const collectHandler = collectCall[1];

        const m = {
            attachments: { size: 1, first: () => ({ url: 'http://proof.com/img.png' }) },
            author: { id: 'pilot123' },
            channel: mockDmChannel,
            reply: jest.fn().mockResolvedValue({ edit: jest.fn() })
        };

        await collectHandler(m);

        // Advance to let async tasks finish
        await new Promise(resolve => setTimeout(resolve, 50));

        // Check if the DM was sent
        const dmCalls = mockDmChannel.send.mock.calls;
        const flagDMs = dmCalls.filter(call => typeof call[0] === 'string' && call[0].includes('flagged by AI'));
        
        expect(flagDMs.length).toBeGreaterThan(0);
        expect(flagDMs[0][0]).toContain('⚠️ **Your flight was flagged by AI.**');
    });
});
