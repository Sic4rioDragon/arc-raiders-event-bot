import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";

function unix(date) {
  return Math.floor(date.getTime() / 1000);
}

function durationText(minutes) {
  if (minutes <= 0) return "now";

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h <= 0) return `${m} minute${m === 1 ? "" : "s"}`;
  if (m <= 0) return `${h} hour${h === 1 ? "" : "s"}`;

  return `${h}h ${m}m`;
}

function colorForEvent(name) {
  const n = String(name || "").toLowerCase();

  if (n.includes("storm") || n.includes("hurricane") || n.includes("cold")) return 0xf5a400;
  if (n.includes("matriarch")) return 0x3498db;
  if (n.includes("lush")) return 0x57c785;
  if (n.includes("night")) return 0x8e44ad;
  if (n.includes("harvester")) return 0xe74c3c;

  return 0x5865f2;
}

export function buildBoardPayload(events) {
  const now = Date.now();

  const active = events
    .filter(e => e.startMs <= now && now < e.endMs)
    .sort((a, b) => a.endMs - b.endMs)
    .slice(0, 4);

  const future = events
    .filter(e => e.startMs > now)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 14);

  const embeds = [];

  for (const event of active) {
    const embed = new EmbedBuilder()
      .setColor(colorForEvent(event.name))
      .setTitle(`⚡ ${event.name}`)
      .setDescription(
        `**${event.map}**\n\n` +
        `Ends <t:${unix(event.end)}:R> · <t:${unix(event.end)}:t>`
      );

    if (event.icon && String(event.icon).startsWith("http")) {
      embed.setThumbnail(event.icon);
    }

    embeds.push(embed);
  }

  const futureLines = future.length
    ? future.map(event => {
        return `<t:${unix(event.start)}:t> (${durationText(event.minutesUntilStart)}) — **${event.map}**: ${event.name}`;
      })
    : ["No upcoming events found."];

  const futureEmbed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(active.length ? "Future Events" : "ARC Raiders Events")
    .setDescription(futureLines.join("\n"))
    .setFooter({
      text: `Auto-updated • Today at ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })} • Data: MetaForge`
    });

  embeds.push(futureEmbed);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Open Map Events")
      .setStyle(ButtonStyle.Link)
      .setURL("https://metaforge.app/arc-raiders/event-timers"),
    new ButtonBuilder()
      .setCustomId("arc_refresh")
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Primary)
  );

  return {
    embeds,
    components: [row]
  };
}

export function buildAlertPayload(event, watch) {
  const roleText = watch.roleId ? `<@&${watch.roleId}> ` : "";

  const isActive = event.active || event.startMs <= Date.now();

  const title = isActive
    ? `🔔 ${event.name} is active now`
    : `🔔 ${event.name} is coming up`;

  const embed = new EmbedBuilder()
    .setColor(colorForEvent(event.name))
    .setTitle(title)
    .setDescription(
      `**Map:** ${event.map}\n` +
      `**Starts:** <t:${unix(event.start)}:R> · <t:${unix(event.start)}:t>\n` +
      `**Ends:** <t:${unix(event.end)}:R> · <t:${unix(event.end)}:t>\n\n` +
      `Watch: \`${watch.event}\`${watch.map && watch.map !== "ANY" ? ` on \`${watch.map}\`` : ""}`
    )
    .setFooter({ text: "ARC Raiders Event Tracker • Data: MetaForge" });

  if (event.icon && String(event.icon).startsWith("http")) {
    embed.setThumbnail(event.icon);
  }

  return {
    content: `${roleText}${title}`,
    embeds: [embed],
    allowedMentions: watch.roleId
      ? { roles: [watch.roleId] }
      : { parse: [] }
  };
}