const { getLogsChannelId } = require('./index');
const db = require('./db');
const config = require('./config');

jest.mock('./db', () => ({
    getSetting: jest.fn()
}));

jest.mock('./config', () => ({
    LOGS_CHANNEL_ID: 'default-config-id'
}));

describe('getLogsChannelId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return LOG_CHANNEL_ID from db if it exists', async () => {
        db.getSetting.mockResolvedValueOnce('db-channel-id');
        const channelId = await getLogsChannelId();
        expect(channelId).toBe('db-channel-id');
        expect(db.getSetting).toHaveBeenCalledWith('LOG_CHANNEL_ID');
    });

    it('should return LOGS_CHANNEL_ID from config if db setting does not exist', async () => {
        db.getSetting.mockResolvedValueOnce(null);
        const channelId = await getLogsChannelId();
        expect(channelId).toBe('default-config-id');
        expect(db.getSetting).toHaveBeenCalledWith('LOG_CHANNEL_ID');
    });

    it('should return LOGS_CHANNEL_ID from config if db setting is an empty string', async () => {
        db.getSetting.mockResolvedValueOnce('');
        const channelId = await getLogsChannelId();
        expect(channelId).toBe('default-config-id');
        expect(db.getSetting).toHaveBeenCalledWith('LOG_CHANNEL_ID');
    });
});
