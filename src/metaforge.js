const CURRENT_ENDPOINT = "https://metaforge.app/api/arc-raiders/events-schedule";
const FALLBACK_ENDPOINT = "https://metaforge.app/api/arc-raiders/event-timers";

let lastGoodEvents = [];
let lastFetchAt = 0;

function parseDateValue(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 10_000_000_000 ? num * 1000 : num;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return null;
}

function normalizeOne(obj, inherited = {}) {
  const name =
    pick(obj, ["name", "eventName", "event_name", "title", "event"]) ||
    inherited.name;

  const map =
    pick(obj, ["map", "mapName", "map_name", "location", "zone"]) ||
    inherited.map;

  const icon =
    pick(obj, ["icon", "iconUrl", "icon_url", "image", "imageUrl", "image_url"]) ||
    inherited.icon ||
    null;

  const startRaw =
    pick(obj, ["startTime", "start_time", "startsAt", "starts_at", "start", "from"]) ||
    inherited.startRaw;

  const endRaw =
    pick(obj, ["endTime", "end_time", "endsAt", "ends_at", "end", "to"]) ||
    inherited.endRaw;

  const start = parseDateValue(startRaw);
  const end = parseDateValue(endRaw);

  if (!name || !map || !start || !end) return null;

  const now = Date.now();
  const startMs = start.getTime();
  const endMs = end.getTime();

  return {
    name: String(name),
    map: String(map),
    icon,
    start,
    end,
    startMs,
    endMs,
    active: startMs <= now && now < endMs,
    upcoming: startMs > now,
    minutesUntilStart: Math.ceil((startMs - now) / 60_000),
    minutesUntilEnd: Math.ceil((endMs - now) / 60_000)
  };
}

function walkEventData(input, out = [], inherited = {}) {
  if (!input) return out;

  if (Array.isArray(input)) {
    for (const item of input) walkEventData(item, out, inherited);
    return out;
  }

  if (typeof input !== "object") return out;

  const nextInherited = {
    name:
      pick(input, ["name", "eventName", "event_name", "title", "event"]) ||
      inherited.name,
    map:
      pick(input, ["map", "mapName", "map_name", "location", "zone"]) ||
      inherited.map,
    icon:
      pick(input, ["icon", "iconUrl", "icon_url", "image", "imageUrl", "image_url"]) ||
      inherited.icon
  };

  const direct = normalizeOne(input, inherited);
  if (direct) out.push(direct);

  for (const value of Object.values(input)) {
    if (value && typeof value === "object") {
      walkEventData(value, out, nextInherited);
    }
  }

  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "arc-raiders-event-bot/0.0.1"
    }
  });

  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }

  return res.json();
}

export function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function eventMatchesWatch(event, watch) {
  const eventName = normalizeKey(event.name);
  const wantedName = normalizeKey(watch.event);

  if (!eventName || !wantedName) return false;

  const nameMatches =
    eventName === wantedName ||
    eventName.includes(wantedName) ||
    wantedName.includes(eventName);

  if (!nameMatches) return false;

  if (!watch.map || watch.map === "ANY") return true;

  return normalizeKey(event.map) === normalizeKey(watch.map);
}

export async function getEvents() {
  const now = Date.now();

  try {
    let payload;

    try {
      payload = await fetchJson(CURRENT_ENDPOINT);
    } catch {
      payload = await fetchJson(FALLBACK_ENDPOINT);
    }

    const events = walkEventData(payload)
      .filter(e => e.endMs > now - 5 * 60_000)
      .sort((a, b) => a.startMs - b.startMs);

    if (events.length) {
      lastGoodEvents = events;
      lastFetchAt = now;
      return events;
    }

    throw new Error("No events found in API response.");
  } catch (err) {
    if (lastGoodEvents.length) return lastGoodEvents;
    throw err;
  }
}

export function getKnownEventNames() {
  return [...new Set(lastGoodEvents.map(event => event.name).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export function getLastFetchAt() {
  return lastFetchAt;
}