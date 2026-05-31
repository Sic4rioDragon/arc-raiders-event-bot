# ARC Raiders Event Bot

A small Discord bot for ARC Raiders event alerts.

Pick the events you care about, like **Lush Blooms**, **Matriarch**, **Night Raid**, or **Electromagnetic Storm**, and get alerts before they start.

Made by **Sic4rioDragon**.

## Features

- Personal DM alerts with `/notify`
- Server event board
- Server alerts with optional role pings
- Event search/autocomplete
- Optional map filters
- Admin-only server setup
- User install support
- Local JSON storage
- No privileged Discord intents needed

## Commands

### For everyone

```txt
/help
/events
/map
/notify
/mynotifications
/arcnotify remove
/arcnotify clear
/arcnotify test
````

### For server admins

```txt
/arcsetup
/arcwatch add
/arcwatch list
/arcwatch remove
/arcrefresh
```

## Quick examples

Personal alert:

```txt
/notify event:Lush Blooms map:Any map minutes:15
```

View your alerts:

```txt
/mynotifications
```

Server event board:

```txt
/arcsetup channel:#arc-events
```

Server alert with a role ping:

```txt
/arcwatch add event:Matriarch map:Any map minutes:30 role:@ARC Raiders
```

## Setup

You need:

* Node.js 18 or newer
* A Discord bot token

Clone the repo:

```bash
git clone https://github.com/Sic4rioDragon/arc-raiders-event-bot.git
cd arc-raiders-event-bot
```

Install dependencies:

```bat
setup.bat
```

Copy:

```txt
.env.example
```

to:

```txt
.env
```

Then add your bot token:

```env
DISCORD_TOKEN=your_bot_token_here
```

Copy:

```txt
config.json.example
```

to:

```txt
config.json
```

Then add your Discord application client ID:

```json
{
  "clientId": "your_client_id_here",
  "developmentGuildId": ""
}
```

Leave `developmentGuildId` empty for the public/global bot.

For testing, you can put one server ID into `developmentGuildId` so slash commands update faster.

Start the bot:

```bat
start.bat
```

## Discord install settings

For server install, use:

```txt
bot
applications.commands
```

Recommended permissions:

```txt
View Channel
Send Messages
Embed Links
Read Message History
```

Permission integer:

```txt
84992
```

For user install, enable **User Install** in the Discord Developer Portal and use:

```txt
applications.commands
```

User install is for personal `/notify` alerts. It does not change server settings.

## Data storage

Settings, alerts, board message IDs, and sent alert history are stored in:

```txt
./data/state.json
```

Do not delete this file unless you want to reset the bot data.

## Support

Support server:

```txt
https://discord.gg/gaJzGPSkZu
```