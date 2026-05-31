// src/store.js
import fs from "node:fs";
import path from "node:path";
import { CFG } from "./config.js";

const DATA_FILE = CFG.dataFile || "./data/state.json";

const DEFAULT_STATE = {
  guilds: {},
  users: {}
};

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadState() {
  ensureDir(DATA_FILE);

  if (!fs.existsSync(DATA_FILE)) {
    saveState(DEFAULT_STATE);
    return structuredClone(DEFAULT_STATE);
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      ...DEFAULT_STATE,
      ...parsed,
      guilds: parsed.guilds || {},
      users: parsed.users || {}
    };
  } catch {
    const backup = `${DATA_FILE}.broken-${Date.now()}`;
    fs.copyFileSync(DATA_FILE, backup);
    saveState(DEFAULT_STATE);
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState(state) {
  ensureDir(DATA_FILE);
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
}

export function getGuildState(state, guildId) {
  const id = String(guildId);

  if (!state.guilds[id]) {
    state.guilds[id] = {
      channelId: null,
      boardMessageId: null,
      watches: [],
      sentAlerts: {},
      nextWatchId: 1
    };
  }

  if (!state.guilds[id].sentAlerts) state.guilds[id].sentAlerts = {};
  if (!state.guilds[id].watches) state.guilds[id].watches = [];
  if (!state.guilds[id].nextWatchId) state.guilds[id].nextWatchId = 1;

  return state.guilds[id];
}

export function getUserState(state, userId) {
  const id = String(userId);

  if (!state.users[id]) {
    state.users[id] = {
      watches: [],
      sentAlerts: {},
      nextWatchId: 1,
      dmFailures: 0,
      lastDmFailureAt: null
    };
  }

  if (!state.users[id].sentAlerts) state.users[id].sentAlerts = {};
  if (!state.users[id].watches) state.users[id].watches = [];
  if (!state.users[id].nextWatchId) state.users[id].nextWatchId = 1;
  if (!Number.isFinite(state.users[id].dmFailures)) state.users[id].dmFailures = 0;
  if (!state.users[id].lastDmFailureAt) state.users[id].lastDmFailureAt = null;

  return state.users[id];
}

export function cleanupOldAlerts(targetState) {
  const now = Date.now();
  const maxAge = 72 * 60 * 60 * 1000;

  for (const [key, sentAt] of Object.entries(targetState.sentAlerts || {})) {
    if (!sentAt || now - Number(sentAt) > maxAge) {
      delete targetState.sentAlerts[key];
    }
  }
}