# vBA Flight Log Bot

This is a Discord bot designed for Virtual Roblox Airlines (vBA) to automatically keep track of flight logs, handle promotions, and give users plane roles via DMs.

## Setup Instructions

1. **Install Node.js**: Ensure you have Node.js installed on your machine (v16.9.0 or higher is required for discord.js v14).
2. **Install Dependencies**: Run `npm install` in this folder if you haven't already.
3. **Configure the Bot**:
   - Rename `.env.example` to `.env`.
   - Open `.env` and fill in your `DISCORD_TOKEN` (from the [Discord Developer Portal](https://discord.com/developers/applications)) and your `GUILD_ID` (your server ID).
   - Open `config.js` and fill in all the `ROLE_ID_...` placeholders with your actual Discord role IDs for ranks and planes.
4. **Start the Bot**:
   - Run `node index.js` to start the bot. 
   - It will automatically create a `vba.sqlite` file to store the user data.

## Features

- **Automatic Flight Logging**: Listens to the `vBA Assistant` bot. When a user runs `/flight-log` and the assistant replies, this bot automatically increments their flight count.
- **Promotions**: Once they reach a specific threshold (e.g., 15 flights for Novice First Officer), they will automatically get the new Discord role.
- **Plane Selection via DM**: When a user unlocks a plane, the bot DMs them an interactive dropdown to select their aircraft.
- **Starter Aircraft**: Users can run `/register` in the server to select between the CRJ200LR and ATR72 to start.

## Note on Permissions
Make sure your bot has the following permissions in your server:
- `Manage Roles` (to assign rank and plane roles)
- The bot's role must be HIGHER in the server role list than the plane/rank roles it is trying to give.
