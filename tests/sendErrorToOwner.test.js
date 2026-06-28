const mockSend = jest.fn();
const mockFetch = jest.fn().mockResolvedValue({ send: mockSend });

// Mock discord.js
jest.mock('discord.js', () => {
    return {
        Client: jest.fn().mockImplementation(() => ({
            users: { fetch: mockFetch },
            login: jest.fn(),
            on: jest.fn(),
            once: jest.fn()
        })),
        GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 3, DirectMessages: 4 },
        Partials: { Message: 1, Channel: 2 },
        Events: { ClientReady: 'ready', InteractionCreate: 'interactionCreate', MessageCreate: 'messageCreate' },
        StringSelectMenuBuilder: jest.fn(),
        StringSelectMenuOptionBuilder: jest.fn(),
        ActionRowBuilder: jest.fn(),
        REST: jest.fn().mockImplementation(() => ({ setToken: jest.fn() })),
        Routes: { applicationCommands: jest.fn() },
        ButtonBuilder: jest.fn(),
        ButtonStyle: { Primary: 1 },
        EmbedBuilder: jest.fn(),
        AttachmentBuilder: jest.fn(),
        ModalBuilder: jest.fn(),
        TextInputBuilder: jest.fn(),
        TextInputStyle: { Short: 1 }
    };
});

// Mock other imports
jest.mock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('../db', () => ({
    getSetting: jest.fn(),
    setSetting: jest.fn()
}));

jest.mock('../config', () => ({}));
jest.mock('../routes', () => ({ ROUTES: [] }));

// Need to mock canvas since it contains native modules that might fail
jest.mock('@napi-rs/canvas', () => ({
    createCanvas: jest.fn(),
    loadImage: jest.fn(),
    GlobalFonts: { registerFromPath: jest.fn() }
}));

process.env.NODE_ENV = 'test';

const { sendErrorToOwner } = require('../index.js');

describe('sendErrorToOwner', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        delete process.env.BOT_OWNER_ID;
    });

    it('should send error to BOT_OWNER_ID when defined', async () => {
        process.env.BOT_OWNER_ID = '1234567890';
        const err = new Error('Test error');
        err.stack = 'Error: Test error at Object.<anonymous> (/path/to/file.js:1:1)';
        
        await sendErrorToOwner(err, 'Test context');
        
        expect(mockFetch).toHaveBeenCalledWith('1234567890');
        expect(mockSend).toHaveBeenCalled();
        
        const sentMsg = mockSend.mock.calls[0][0];
        expect(sentMsg).toContain('🚨 **Bot Crash / Error Detected** 🚨');
        expect(sentMsg).toContain('Test context');
        expect(sentMsg).toContain('Test error');
    });

    it('should fall back to default ID if BOT_OWNER_ID is not defined', async () => {
        const err = new Error('Another error');
        
        await sendErrorToOwner(err, 'Another context');
        
        expect(mockFetch).toHaveBeenCalledWith('797310456951210034');
        expect(mockSend).toHaveBeenCalled();
    });

    it('should not crash if owner fetch fails', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Fetch failed'));
        const err = new Error('Test error');
        
        // Suppress console.error for this test
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        await expect(sendErrorToOwner(err, 'Test context')).resolves.toBeUndefined();
        
        expect(consoleSpy).toHaveBeenCalledWith('Failed to DM owner about error:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    it('should not crash if owner.send fails', async () => {
        mockSend.mockRejectedValueOnce(new Error('Send failed'));
        const err = new Error('Test error');
        
        // Suppress console.error for this test
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        await expect(sendErrorToOwner(err, 'Test context')).resolves.toBeUndefined();
        
        expect(consoleSpy).toHaveBeenCalledWith('Failed to DM owner about error:', expect.any(Error));
        consoleSpy.mockRestore();
    });
});
