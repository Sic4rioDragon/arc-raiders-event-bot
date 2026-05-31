# ARC Raiders Event Bot

A small Discord bot for ARC Raiders event tracking.

It posts an ARCTracker-style event board in a Discord channel and lets server administrators configure alerts for specific events like **Lush Blooms**, **Matriarch**, **Night Raid**, or **Electromagnetic Storm**.

The bot is made for servers that only want pings for the events they care about, instead of every event.

## Features

- Live ARC Raiders event board
- Configurable event alerts
- Event name autocomplete in slash commands
- Optional map filter per alert
- Optional role ping per alert
- Admin-only commands
- Public-bot friendly setup
- No privileged Discord gateway intents needed
- Local JSON storage

## Commands

### `/arcsetup`

Sets the Discord channel where the event board and alerts will be posted.

Example:

```txt
/arcsetup channel:#arc-events
````

### `/arcwatch add`

Adds a watched event.

Example:

```txt
/arcwatch add event:Lush Blooms map:Any map minutes:15 role:@ARC Raiders
```

The `event` option supports autocomplete. Start typing and pick the event from the dropdown.

Options:

* `event` - event to watch
* `map` - optional map filter
* `minutes` - when to notify before the event starts
* `role` - optional role to ping

### `/arcwatch list`

Shows all configured watches for the server.

### `/arcwatch remove`

Removes a watch by ID.

Example:

```txt
/arcwatch remove id:1
```

### `/arcevents`

Shows current and upcoming events.

Optional filters:

* `event`
* `map`
* `private`

### `/arcrefresh`

Forces the event board to refresh.

## Requirements

* Node.js 18 or newer
* A Discord bot application
* A Discord bot token

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/Sic4rioDragon/arc-raiders-event-bot.git
cd arc-raiders-event-bot
```

### 2. Install dependencies

Windows:

```bat
setup.bat
```

Or manually:

```bash
npm install
```

### 3. Create `.env`

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

### 4. Create `config.json`

Copy:

```txt
config.json.example
```

to:

```txt
config.json
```

Fill in your Discord application client ID:

```json
{
  "clientId": "your_client_id_here"
}
```

### 5. Invite the bot

Use these scopes:

```txt
bot
applications.commands
```

Recommended bot permissions:

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

### 6. Start the bot

Windows:

```bat
start.bat
```

Or manually:

```bash
npm start
```

### 7. Configure it in Discord

Run:

```txt
/arcsetup channel:#arc-events
```

Then add watches:

```txt
/arcwatch add event:Lush Blooms map:Any map minutes:15 role:@ARC Raiders
/arcwatch add event:Matriarch map:Any map minutes:30 role:@ARC Raiders
/arcwatch add event:Electromagnetic Storm map:Dam Battlegrounds minutes:10 role:@ARC Raiders
```

## Public hosting notes

For a public bot, leave this empty in `config.json`:

```json
"developmentGuildId": ""
```

The bot does not need Message Content intent or Server Members intent.

Commands are admin-only by default and also checked in code.

## Data storage

Server setup, board message IDs, watch rules, and sent alert history are stored locally in:

```txt
./data/state.json
```

Do not delete this file unless you want to reset all server configurations.
