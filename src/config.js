// src/config.js
import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.join(process.cwd(), "config.json");

const DEFAULT_CONFIG = {
  clientId: "",
  developmentGuildId: "",
  pollSeconds: 60,
  dataFile: "./data/state.json",
  defaultAlertMinutes: 15,
  links: {
    mapEvents: "https://metaforge.app/arc-raiders/event-timers"
  },
  maps: [
    "Dam Battlegrounds",
    "Spaceport",
    "Buried City",
    "Blue Gate",
    "Stella Montis",
    "Riven Tides"
  ],
  events: [
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
  ]
};

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
    return structuredClone(DEFAULT_CONFIG);
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw);

  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    developmentGuildId: parsed.developmentGuildId || "",
    links: {
      ...DEFAULT_CONFIG.links,
      ...(parsed.links || {})
    },
    maps: Array.isArray(parsed.maps) && parsed.maps.length
      ? parsed.maps
      : DEFAULT_CONFIG.maps,
    events: Array.isArray(parsed.events) && parsed.events.length
      ? parsed.events
      : DEFAULT_CONFIG.events
  };
}

export const CFG = readConfig();

export function requireConfigValue(name, value) {
  if (!value || !String(value).trim()) {
    console.error(`Missing config value: ${name}`);
    console.error("Edit config.json and fill it in.");
    process.exit(1);
  }
}