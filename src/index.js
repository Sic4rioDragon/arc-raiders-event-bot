// src/index.js
import "dotenv/config";
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

import { CFG, requireConfigValue } from "./config.js";

import {
  cleanupOldAlerts,
  getGuildState,
  loadState,
  saveState
} from "./store.js";

import {
  eventMatchesWatch,
  getEvents,
  getKnownEventNames,
  normalizeKey
} from "./metaforge.js";

import {
  buildAlertPayload,
  buildBoardPayload
} from "./embeds.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = CFG.clientId;
const DEVELOPMENT_GUILD_ID = CFG.developmentGuildId || CFG.guildId || null;
const POLL_SECONDS = Math.max(30, Number(CFG.pollSeconds || 60));
const DEFAULT_ALERT_MINUTES = Number(CFG.defaultAlertMinutes ?? 15);

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

requireConfigValue("clientId", CLIENT_ID);

const state = loadState();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

function mapChoices() {
  const choices = [
    { name: "Any map", value: "ANY" }
  ];

  for (const map of CFG.maps || []) {
    choices.push({
      name: String(map).slice(0, 100),
      value: String(map).slice(0, 100)
    });
  }

  return choices.slice(0, 25);
}

function allKnownEventNames() {
  const names = new Set();

  for (const event of CFG.events || []) {
    if (event) names.add(String(event));
  }

  for (const event of getKnownEventNames()) {
    if (event) names.add(String(event));
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function eventAutocompleteChoices(searchText) {
  const query = normalizeKey(searchText || "");

  const all = allKnownEventNames();
  const filtered = query
    ? all.filter(name => normalizeKey(name).includes(query))
    : all;

  return filtered.slice(0, 25).map(name => ({
    name: name.slice(0, 100),
    value: name.slice(0, 100)
  }));
}

function adminOnly(command) {
  return command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
}

function commandsJson() {
  return [
    adminOnly(
      new SlashCommandBuilder()
        .setName("arcsetup")
        .setDescription("Set the channel where the ARC Raiders event board and alerts go.")
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("Event board / alert channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    ),

    adminOnly(
      new SlashCommandBuilder()
        .setName("arcwatch")
        .setDescription("Configure specific ARC Raiders event alerts.")
        .addSubcommand(sub =>
          sub
            .setName("add")
            .setDescription("Add a specific event watch.")
            .addStringOption(opt =>
              opt
                .setName("event")
                .setDescription("Start typing to search events, for example Lush Blooms.")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption(opt =>
              opt
                .setName("map")
                .setDescription("Limit this watch to one map.")
                .setRequired(false)
                .addChoices(...mapChoices())
            )
            .addIntegerOption(opt =>
              opt
                .setName("minutes")
                .setDescription("Notify this many minutes before start. Use 0 for active-now alerts.")
                .setRequired(false)
                .addChoices(
                  { name: "Active now", value: 0 },
                  { name: "5 minutes before", value: 5 },
                  { name: "10 minutes before", value: 10 },
                  { name: "15 minutes before", value: 15 },
                  { name: "30 minutes before", value: 30 },
                  { name: "60 minutes before", value: 60 }
                )
            )
            .addRoleOption(opt =>
              opt
                .setName("role")
                .setDescription("Optional role to ping.")
                .setRequired(false)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("remove")
            .setDescription("Remove a watch by ID.")
            .addIntegerOption(opt =>
              opt
                .setName("id")
                .setDescription("Watch ID from /arcwatch list")
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("list")
            .setDescription("List configured watches.")
        )
    ),

    adminOnly(
      new SlashCommandBuilder()
        .setName("arcevents")
        .setDescription("Show current and upcoming ARC Raiders events.")
        .addStringOption(opt =>
          opt
            .setName("event")
            .setDescription("Optional event filter.")
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt
            .setName("map")
            .setDescription("Optional map filter.")
            .setRequired(false)
            .addChoices(...mapChoices())
        )
        .addBooleanOption(opt =>
          opt
            .setName("private")
            .setDescription("Only show the result to you.")
            .setRequired(false)
        )
    ),

    adminOnly(
      new SlashCommandBuilder()
        .setName("arcrefresh")
        .setDescription("Force refresh the ARC Raiders event board.")
    )
  ].map(cmd => cmd.toJSON());
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  if (DEVELOPMENT_GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, DEVELOPMENT_GUILD_ID),
      { body: commandsJson() }
    );

    console.log(`Registered guild commands for ${DEVELOPMENT_GUILD_ID}`);
    return;
  }

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commandsJson() }
  );

  console.log("Registered global commands");
}

function interactionIsAdmin(interaction) {
  return Boolean(
    interaction.inGuild() &&
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

async function requireAdmin(interaction) {
  if (interactionIsAdmin(interaction)) return true;

  const content = "Only server administrators can use this bot.";

  if (interaction.isAutocomplete()) {
    await interaction.respond([]).catch(() => {});
    return false;
  }

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content }).catch(() => {});
  } else {
    await interaction.reply({ ephemeral: true, content }).catch(() => {});
  }

  return false;
}

async function getConfiguredChannel(guildId) {
  const guildState = getGuildState(state, guildId);
  if (!guildState.channelId) return null;

  const channel = await client.channels.fetch(guildState.channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;

  return channel;
}

async function updateBoard(guildId, events) {
  const guildState = getGuildState(state, guildId);
  const channel = await getConfiguredChannel(guildId);
  if (!channel) return;

  const payload = buildBoardPayload(events);

  if (guildState.boardMessageId) {
    const oldMessage = await channel.messages
      .fetch(guildState.boardMessageId)
      .catch(() => null);

    if (oldMessage) {
      await oldMessage.edit(payload);
      return;
    }
  }

  const sent = await channel.send(payload);
  guildState.boardMessageId = sent.id;
  saveState(state);
}

function makeAlertKey(watch, event) {
  return [
    watch.id,
    normalizeKey(watch.event),
    normalizeKey(watch.map || "ANY"),
    normalizeKey(event.name),
    normalizeKey(event.map),
    event.startMs,
    watch.minutes
  ].join("|");
}

async function checkAlerts(guildId, events) {
  const guildState = getGuildState(state, guildId);
  const channel = await getConfiguredChannel(guildId);
  if (!channel) return;

  cleanupOldAlerts(guildState);

  for (const watch of guildState.watches) {
    const matches = events.filter(event => eventMatchesWatch(event, watch));

    for (const event of matches) {
      const alertKey = makeAlertKey(watch, event);
      if (guildState.sentAlerts[alertKey]) continue;

      const minutes = Number(watch.minutes || 0);
      const now = Date.now();

      const shouldSend =
        minutes === 0
          ? event.startMs <= now && now < event.endMs
          : event.startMs > now && event.startMs - now <= minutes * 60_000;

      if (!shouldSend) continue;

      await channel.send(buildAlertPayload(event, watch));
      guildState.sentAlerts[alertKey] = Date.now();
      saveState(state);
    }
  }
}

async function pollOnce(reason = "timer") {
  let events;

  try {
    events = await getEvents();
  } catch (err) {
    console.log(`[poll:${reason}] Failed to fetch events:`, err.message);
    return;
  }

  for (const guildId of Object.keys(state.guilds)) {
    try {
      await updateBoard(guildId, events);
      await checkAlerts(guildId, events);
    } catch (err) {
      console.log(`[poll:${reason}] Guild ${guildId} failed:`, err.message);
    }
  }
}

function filterEvents(events, eventName, mapName) {
  return events.filter(event => {
    if (eventName && !eventMatchesWatch(event, { event: eventName, map: "ANY" })) {
      return false;
    }

    if (mapName && mapName !== "ANY" && normalizeKey(event.map) !== normalizeKey(mapName)) {
      return false;
    }

    return true;
  });
}

function formatWatchList(guildState) {
  if (!guildState.watches.length) {
    return "No event watches configured yet.";
  }

  return guildState.watches
    .map(watch => {
      const map = watch.map && watch.map !== "ANY"
        ? ` on **${watch.map}**`
        : " on **Any map**";

      const mins = Number(watch.minutes || 0);
      const timing = mins === 0 ? "active-now" : `${mins} min before`;
      const role = watch.roleId ? ` · ping <@&${watch.roleId}>` : "";

      return `**#${watch.id}** — **${watch.event}**${map} · ${timing}${role}`;
    })
    .join("\n");
}

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      if (!await requireAdmin(interaction)) return;

      const focused = interaction.options.getFocused(true);

      if (focused.name === "event") {
        await interaction.respond(eventAutocompleteChoices(focused.value));
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId !== "arc_refresh") return;
      if (!await requireAdmin(interaction)) return;

      await interaction.deferReply({ ephemeral: true });

      const events = await getEvents();
      await updateBoard(interaction.guildId, events);

      await interaction.editReply("Refreshed the ARC Raiders event board.");
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    if (!await requireAdmin(interaction)) return;

    if (interaction.commandName === "arcsetup") {
      const channel = interaction.options.getChannel("channel", true);
      const guildState = getGuildState(state, interaction.guildId);

      guildState.channelId = channel.id;
      guildState.boardMessageId = null;
      saveState(state);

      await interaction.reply({
        ephemeral: true,
        content: `ARC Raiders event board channel set to ${channel}.`
      });

      const events = await getEvents();
      await updateBoard(interaction.guildId, events);
      return;
    }

    if (interaction.commandName === "arcwatch") {
      const sub = interaction.options.getSubcommand();
      const guildState = getGuildState(state, interaction.guildId);

      if (sub === "add") {
        const event = interaction.options.getString("event", true).trim();
        const map = interaction.options.getString("map") || "ANY";
        const minutes = interaction.options.getInteger("minutes") ?? DEFAULT_ALERT_MINUTES;
        const role = interaction.options.getRole("role");

        const watch = {
          id: guildState.nextWatchId++,
          event,
          map,
          minutes,
          roleId: role?.id || null,
          createdBy: interaction.user.id,
          createdAt: Date.now()
        };

        guildState.watches.push(watch);
        saveState(state);

        await interaction.reply({
          ephemeral: true,
          content:
            `Added watch **#${watch.id}** for **${event}**` +
            `${map !== "ANY" ? ` on **${map}**` : " on **Any map**"} ` +
            `(${minutes === 0 ? "active-now" : `${minutes} min before`}).`
        });

        return;
      }

      if (sub === "remove") {
        const id = interaction.options.getInteger("id", true);
        const before = guildState.watches.length;

        guildState.watches = guildState.watches.filter(w => w.id !== id);
        saveState(state);

        await interaction.reply({
          ephemeral: true,
          content: before === guildState.watches.length
            ? `No watch found with ID **#${id}**.`
            : `Removed watch **#${id}**.`
        });

        return;
      }

      if (sub === "list") {
        await interaction.reply({
          ephemeral: true,
          content: formatWatchList(guildState)
        });

        return;
      }
    }

    if (interaction.commandName === "arcevents") {
      const privateReply = interaction.options.getBoolean("private") ?? false;
      const eventFilter = interaction.options.getString("event") || null;
      const mapFilter = interaction.options.getString("map") || null;

      await interaction.deferReply({ ephemeral: privateReply });

      const events = filterEvents(await getEvents(), eventFilter, mapFilter);
      await interaction.editReply(buildBoardPayload(events));
      return;
    }

    if (interaction.commandName === "arcrefresh") {
      await interaction.deferReply({ ephemeral: true });

      const events = await getEvents();
      await updateBoard(interaction.guildId, events);

      await interaction.editReply("Refreshed the ARC Raiders event board.");
      return;
    }
  } catch (err) {
    console.log("[interaction error]", err);

    const msg = `Something went wrong: ${err.message || err}`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => {});
    } else if (!interaction.isAutocomplete()) {
      await interaction.reply({ ephemeral: true, content: msg }).catch(() => {});
    }
  }
});

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Polling every ${POLL_SECONDS} seconds`);

  if (DEVELOPMENT_GUILD_ID) {
    console.log("Command mode: development guild");
  } else {
    console.log("Command mode: global/public");
  }

  await registerCommands();

  await pollOnce("startup");

  setInterval(() => {
    pollOnce("interval").catch(err => {
      console.log("[poll interval error]", err);
    });
  }, POLL_SECONDS * 1000);
});

client.login(TOKEN);