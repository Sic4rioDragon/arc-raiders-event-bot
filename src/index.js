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
  getUserState,
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
  buildBoardPayload,
  buildHelpPayload
} from "./embeds.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = CFG.clientId;
const DEVELOPMENT_GUILD_ID = CFG.developmentGuildId || null;
const POLL_SECONDS = Math.max(30, Number(CFG.pollSeconds || 60));
const DEFAULT_ALERT_MINUTES = Number(CFG.defaultAlertMinutes ?? 15);

const IntegrationType = {
  GuildInstall: 0,
  UserInstall: 1
};

const ContextType = {
  Guild: 0,
  BotDM: 1,
  PrivateChannel: 2
};

const DEFAULT_MAPS = [
  "Dam Battlegrounds",
  "Spaceport",
  "Buried City",
  "Blue Gate",
  "Stella Montis",
  "Riven Tides"
];

const DEFAULT_EVENTS = [
  "Lush Blooms",
  "Electromagnetic Storm",
  "Hurricane",
  "Night Raid",
  "Matriarch",
  "Harvester",
  "Uncovered Caches",
  "Husk Graveyard",
  "Beachcombing",
  "Close Scrutiny"
];

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
  const maps = Array.isArray(CFG.maps) && CFG.maps.length ? CFG.maps : DEFAULT_MAPS;

  const choices = [
    { name: "Any map", value: "ANY" }
  ];

  for (const map of maps) {
    choices.push({
      name: String(map).slice(0, 100),
      value: String(map).slice(0, 100)
    });
  }

  return choices.slice(0, 25);
}

function allKnownEventNames() {
  const names = new Set(DEFAULT_EVENTS);

  if (Array.isArray(CFG.events)) {
    for (const event of CFG.events) {
      if (event) names.add(String(event));
    }
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

function minuteChoices() {
  return [
    { name: "Active now", value: 0 },
    { name: "5 minutes before", value: 5 },
    { name: "10 minutes before", value: 10 },
    { name: "15 minutes before", value: 15 },
    { name: "30 minutes before", value: 30 },
    { name: "60 minutes before", value: 60 }
  ];
}

function addEventOption(command) {
  return command.addStringOption(opt =>
    opt
      .setName("event")
      .setDescription("Start typing to search events, for example Lush Blooms.")
      .setRequired(true)
      .setAutocomplete(true)
  );
}

function addMapOption(command, description = "Limit this alert to one map.") {
  return command.addStringOption(opt =>
    opt
      .setName("map")
      .setDescription(description)
      .setRequired(false)
      .addChoices(...mapChoices())
  );
}

function addMinutesOption(command) {
  return command.addIntegerOption(opt =>
    opt
      .setName("minutes")
      .setDescription("Notify this many minutes before start. Use 0 for active-now alerts.")
      .setRequired(false)
      .addChoices(...minuteChoices())
  );
}

function guildOnlyAdmin(command) {
  return command
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setIntegrationTypes(IntegrationType.GuildInstall)
    .setContexts(ContextType.Guild);
}

function personalCommand(command) {
  return command
    .setIntegrationTypes(IntegrationType.GuildInstall, IntegrationType.UserInstall)
    .setContexts(ContextType.Guild, ContextType.BotDM, ContextType.PrivateChannel);
}

function commandsJson() {
  return [
    guildOnlyAdmin(
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

    guildOnlyAdmin(
      new SlashCommandBuilder()
        .setName("arcwatch")
        .setDescription("Configure server ARC Raiders event alerts.")
        .addSubcommand(sub => {
          let cmd = sub
            .setName("add")
            .setDescription("Add a server event watch.");

          cmd = addEventOption(cmd);
          cmd = addMapOption(cmd, "Limit this watch to one map.");
          cmd = addMinutesOption(cmd);

          return cmd.addRoleOption(opt =>
            opt
              .setName("role")
              .setDescription("Optional role to ping.")
              .setRequired(false)
          );
        })
        .addSubcommand(sub =>
          sub
            .setName("remove")
            .setDescription("Remove a server watch by ID.")
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
            .setDescription("List configured server watches.")
        )
    ),

    personalCommand(
      new SlashCommandBuilder()
        .setName("notify")
        .setDescription("Add a personal ARC Raiders DM alert.")
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
            .setDescription("Optional map filter.")
            .setRequired(false)
            .addChoices(...mapChoices())
        )
        .addIntegerOption(opt =>
          opt
            .setName("minutes")
            .setDescription("Notify this many minutes before start. Use 0 for active-now alerts.")
            .setRequired(false)
            .addChoices(...minuteChoices())
        )
    ),

    personalCommand(
      new SlashCommandBuilder()
        .setName("mynotifications")
        .setDescription("View your personal ARC Raiders DM alerts.")
    ),

    personalCommand(
      new SlashCommandBuilder()
        .setName("events")
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
            .setDescription("Only show the result to you. Server-only option.")
            .setRequired(false)
        )
    ),

    personalCommand(
      new SlashCommandBuilder()
        .setName("map")
        .setDescription("Show ARC Raiders events for a specific map.")
        .addStringOption(opt =>
          opt
            .setName("map")
            .setDescription("Map to show.")
            .setRequired(true)
            .addChoices(...mapChoices().filter(choice => choice.value !== "ANY"))
        )
        .addBooleanOption(opt =>
          opt
            .setName("private")
            .setDescription("Only show the result to you. Server-only option.")
            .setRequired(false)
        )
    ),

    personalCommand(
      new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show ARC Raiders Event Bot commands.")
    ),

    personalCommand(
      new SlashCommandBuilder()
        .setName("arcnotify")
        .setDescription("Manage your personal ARC Raiders DM alerts.")
        .addSubcommand(sub => {
          let cmd = sub
            .setName("add")
            .setDescription("Add a personal DM alert.");

          cmd = addEventOption(cmd);
          cmd = addMapOption(cmd);
          return addMinutesOption(cmd);
        })
        .addSubcommand(sub =>
          sub
            .setName("remove")
            .setDescription("Remove one of your personal alerts by ID.")
            .addIntegerOption(opt =>
              opt
                .setName("id")
                .setDescription("Alert ID from /arcnotify list")
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("clear")
            .setDescription("Remove all of your personal alerts.")
        )
        .addSubcommand(sub =>
          sub
            .setName("list")
            .setDescription("List your personal DM alerts.")
        )
        .addSubcommand(sub =>
          sub
            .setName("test")
            .setDescription("Send yourself a test DM.")
        )
    ),

    personalCommand(
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
            .setDescription("Only show the result to you. Server-only option.")
            .setRequired(false)
        )
    ),

    guildOnlyAdmin(
      new SlashCommandBuilder()
        .setName("arcrefresh")
        .setDescription("Force refresh the server ARC Raiders event board.")
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

function isAdminCommandName(commandName) {
  return ["arcsetup", "arcwatch", "arcrefresh"].includes(commandName);
}

function interactionIsAdmin(interaction) {
  return Boolean(
    interaction.inGuild() &&
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

async function requireAdmin(interaction) {
  if (interactionIsAdmin(interaction)) return true;

  const content = "Only server administrators can use this command.";

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

function privateReplyPayload(interaction, payload) {
  if (!interaction.inGuild()) return payload;
  return { ...payload, ephemeral: true };
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

function shouldSendForWatch(watch, event) {
  const minutes = Number(watch.minutes || 0);
  const now = Date.now();

  if (minutes === 0) {
    return event.startMs <= now && now < event.endMs;
  }

  return event.startMs > now && event.startMs - now <= minutes * 60_000;
}

async function checkServerAlerts(guildId, events) {
  const guildState = getGuildState(state, guildId);
  const channel = await getConfiguredChannel(guildId);
  if (!channel) return;

  cleanupOldAlerts(guildState);

  for (const watch of guildState.watches) {
    const matches = events.filter(event => eventMatchesWatch(event, watch));

    for (const event of matches) {
      const alertKey = makeAlertKey(watch, event);
      if (guildState.sentAlerts[alertKey]) continue;
      if (!shouldSendForWatch(watch, event)) continue;

      await channel.send(buildAlertPayload(event, watch));
      guildState.sentAlerts[alertKey] = Date.now();
      saveState(state);
    }
  }
}

async function checkPersonalAlerts(events) {
  for (const [userId, userState] of Object.entries(state.users || {})) {
    cleanupOldAlerts(userState);

    for (const watch of userState.watches || []) {
      const matches = events.filter(event => eventMatchesWatch(event, watch));

      for (const event of matches) {
        const alertKey = makeAlertKey(watch, event);
        if (userState.sentAlerts[alertKey]) continue;
        if (!shouldSendForWatch(watch, event)) continue;

        try {
          const user = await client.users.fetch(userId);
          await user.send(buildAlertPayload(event, { ...watch, roleId: null }));
          userState.dmFailures = 0;
          userState.lastDmFailureAt = null;
        } catch (err) {
          userState.dmFailures = Number(userState.dmFailures || 0) + 1;
          userState.lastDmFailureAt = Date.now();
          console.log(`[dm] Failed to send alert to ${userId}: ${err.message}`);
        }

        userState.sentAlerts[alertKey] = Date.now();
        saveState(state);
      }
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

  for (const guildId of Object.keys(state.guilds || {})) {
    try {
      await updateBoard(guildId, events);
      await checkServerAlerts(guildId, events);
    } catch (err) {
      console.log(`[poll:${reason}] Guild ${guildId} failed:`, err.message);
    }
  }

  try {
    await checkPersonalAlerts(events);
  } catch (err) {
    console.log(`[poll:${reason}] Personal alerts failed:`, err.message);
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

function formatServerWatchList(guildState) {
  if (!guildState.watches.length) {
    return "No server event watches configured yet.";
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

function formatPersonalWatchList(userState) {
  if (!userState.watches.length) {
    return "You do not have any personal ARC Raiders DM alerts yet. Use `/notify` to add one.";
  }

  return userState.watches
    .map(watch => {
      const map = watch.map && watch.map !== "ANY"
        ? ` on **${watch.map}**`
        : " on **Any map**";

      const mins = Number(watch.minutes || 0);
      const timing = mins === 0 ? "active-now" : `${mins} min before`;

      return `**#${watch.id}** — **${watch.event}**${map} · ${timing}`;
    })
    .join("\n");
}

function addPersonalWatch(interaction, userState) {
  const event = interaction.options.getString("event", true).trim();
  const map = interaction.options.getString("map") || "ANY";
  const minutes = interaction.options.getInteger("minutes") ?? DEFAULT_ALERT_MINUTES;

  const watch = {
    id: userState.nextWatchId++,
    event,
    map,
    minutes,
    createdAt: Date.now()
  };

  userState.watches.push(watch);
  saveState(state);

  return watch;
}

async function replyPersonalWatchAdded(interaction, watch) {
  await interaction.reply(privateReplyPayload(interaction, {
    content:
      `Added personal DM alert **#${watch.id}** for **${watch.event}**` +
      `${watch.map !== "ANY" ? ` on **${watch.map}**` : " on **Any map**"} ` +
      `(${watch.minutes === 0 ? "active-now" : `${watch.minutes} min before`}).\n\n` +
      "Run `/arcnotify test` once to make sure I can DM you."
  }));
}

async function handleArcNotify(interaction) {
  const sub = interaction.options.getSubcommand();
  const userState = getUserState(state, interaction.user.id);

  if (sub === "add") {
    const watch = addPersonalWatch(interaction, userState);
    await replyPersonalWatchAdded(interaction, watch);
    return;
  }

  if (sub === "remove") {
    const id = interaction.options.getInteger("id", true);
    const before = userState.watches.length;

    userState.watches = userState.watches.filter(w => w.id !== id);
    saveState(state);

    await interaction.reply(privateReplyPayload(interaction, {
      content: before === userState.watches.length
        ? `No personal alert found with ID **#${id}**.`
        : `Removed personal alert **#${id}**.`
    }));

    return;
  }

  if (sub === "clear") {
    const count = userState.watches.length;
    userState.watches = [];
    userState.sentAlerts = {};
    saveState(state);

    await interaction.reply(privateReplyPayload(interaction, {
      content: count
        ? `Removed **${count}** personal alert${count === 1 ? "" : "s"}.`
        : "You had no personal alerts to remove."
    }));

    return;
  }

  if (sub === "list") {
    await interaction.reply(privateReplyPayload(interaction, {
      content: formatPersonalWatchList(userState)
    }));

    return;
  }

  if (sub === "test") {
    try {
      await interaction.user.send("ARC Raiders Event Bot test DM. If you got this, personal alerts should work.");
      userState.dmFailures = 0;
      userState.lastDmFailureAt = null;
      saveState(state);

      await interaction.reply(privateReplyPayload(interaction, {
        content: "Test DM sent. Personal alerts should work."
      }));
    } catch {
      userState.dmFailures = Number(userState.dmFailures || 0) + 1;
      userState.lastDmFailureAt = Date.now();
      saveState(state);

      await interaction.reply(privateReplyPayload(interaction, {
        content:
          "I could not DM you. Check your Discord privacy settings, or use the bot in a shared server/DM where Discord allows bot messages."
      }));
    }
  }
}

async function showEvents(interaction, mapOverride = null) {
  const privateReply = interaction.inGuild()
    ? interaction.options.getBoolean("private") ?? false
    : false;

  const eventFilter = interaction.options.getString("event") || null;
  const mapFilter = mapOverride || interaction.options.getString("map") || null;

  await interaction.deferReply({ ephemeral: privateReply });

  const events = filterEvents(await getEvents(), eventFilter, mapFilter);
  await interaction.editReply(buildBoardPayload(events));
}

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      if (isAdminCommandName(interaction.commandName) && !await requireAdmin(interaction)) return;

      const focused = interaction.options.getFocused(true);

      if (focused.name === "event") {
        await interaction.respond(eventAutocompleteChoices(focused.value));
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId !== "arc_refresh") return;

      const events = await getEvents();

      const isServerBoard = Boolean(
        interaction.guildId &&
        getGuildState(state, interaction.guildId).boardMessageId === interaction.message?.id
      );

      if (isServerBoard) {
        if (!await requireAdmin(interaction)) return;

        await interaction.deferReply({ ephemeral: true });
        await updateBoard(interaction.guildId, events);
        await interaction.editReply("Refreshed the ARC Raiders event board.");
        return;
      }

      await interaction.update(buildBoardPayload(events));
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (isAdminCommandName(interaction.commandName) && !await requireAdmin(interaction)) {
      return;
    }

    if (interaction.commandName === "help") {
      await interaction.reply(privateReplyPayload(interaction, buildHelpPayload()));
      return;
    }

    if (interaction.commandName === "notify") {
      const userState = getUserState(state, interaction.user.id);
      const watch = addPersonalWatch(interaction, userState);
      await replyPersonalWatchAdded(interaction, watch);
      return;
    }

    if (interaction.commandName === "mynotifications") {
      const userState = getUserState(state, interaction.user.id);
      await interaction.reply(privateReplyPayload(interaction, {
        content: formatPersonalWatchList(userState)
      }));
      return;
    }

    if (interaction.commandName === "events" || interaction.commandName === "arcevents") {
      await showEvents(interaction);
      return;
    }

    if (interaction.commandName === "map") {
      const map = interaction.options.getString("map", true);
      await showEvents(interaction, map);
      return;
    }

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
            `Added server watch **#${watch.id}** for **${event}**` +
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
            ? `No server watch found with ID **#${id}**.`
            : `Removed server watch **#${id}**.`
        });

        return;
      }

      if (sub === "list") {
        await interaction.reply({
          ephemeral: true,
          content: formatServerWatchList(guildState)
        });

        return;
      }
    }

    if (interaction.commandName === "arcnotify") {
      await handleArcNotify(interaction);
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