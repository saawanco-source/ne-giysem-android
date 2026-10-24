// Time zone of a coordinate (vendored tz-lookup) and its UTC offset at an instant (Intl, which knows DST rules).
// Turkey is Europe/Istanbul: UTC+3 all year, no DST.
import tzlookup from "./tz-lookup.js";

// Zones with one fixed offset need no Intl call (Intl's first use costs several ms of CPU on a cold isolate, and the
// free plan allows 10 ms per request). Turkey has kept UTC+3 all year since September 2016.
const FIXED = { "Europe/Istanbul": 10800, "Asia/Istanbul": 10800, "Etc/UTC": 0, "Etc/GMT": 0, UTC: 0, GMT: 0 };

const formatters = new Map();
function formatter(zone) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
    formatters.set(zone, f);
  }
  return f;
}

/** Offset of `zone` from UTC at instant ms, in seconds (e.g. 10800 for Europe/Istanbul). Throws for an unknown zone. */
export function zoneOffsetSeconds(zone, ms) {
  if (Object.prototype.hasOwnProperty.call(FIXED, zone)) return FIXED[zone];
  const etc = /^Etc\/GMT([+-])(\d{1,2})$/.exec(zone); // POSIX sign: Etc/GMT-3 is UTC+3
  if (etc) return (etc[1] === "-" ? 1 : -1) * +etc[2] * 3600;
  const p = {};
  for (const part of formatter(zone).formatToParts(ms)) p[part.type] = part.value;
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  const offset = Math.round((wall - Math.floor(ms / 1000) * 1000) / 60000) * 60;
  if (!Number.isFinite(offset)) throw new Error("bad offset");
  return offset;
}

/** "GMT+3", "GMT+5:45", "GMT" (Open-Meteo style abbreviation from the offset). */
export function offsetAbbreviation(seconds) {
  if (!seconds) return "GMT";
  const sign = seconds < 0 ? "-" : "+", a = Math.abs(seconds), h = Math.floor(a / 3600), m = Math.round((a % 3600) / 60);
  return `GMT${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

/**
 * {timezone, offset} for a coordinate at instant ms. Falls back to the nautical zone round(lon/15) hours
 * only if the lookup or Intl fails.
 */
export function placeZone(lat, lon, ms) {
  try {
    const zone = tzlookup(lat, lon);
    if (zone) return { timezone: zone, offset: zoneOffsetSeconds(zone, ms) };
  } catch (e) {
    /* fall through */
  }
  const h = Math.max(-12, Math.min(12, Math.round(lon / 15)));
  return { timezone: h === 0 ? "GMT" : `Etc/GMT${h > 0 ? "-" : "+"}${Math.abs(h)}`, offset: h * 3600 };
}
