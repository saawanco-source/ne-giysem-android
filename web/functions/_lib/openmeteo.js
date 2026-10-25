// Turns a normalized MET series into the Open-Meteo /v1/forecast shape the web app and the Android widget already read
// (current=..., hourly=..., daily=uv_index_max,sunset, timezone=auto, forecast_days=7).
//
// Time handling follows Open-Meteo exactly: utc_offset_seconds is the place's offset *now*, and every local time in
// the answer (hourly.time, daily.time, sunset) uses that one fixed offset, so the 168 hours are evenly spaced with no
// gap or repeat. Both clients turn an instant into an hour key with that same fixed offset, so lookups stay right
// across a DST change; only the labels after the change are an hour off the wall clock (as on Open-Meteo).
// Turkey (Europe/Istanbul) has no DST, so there it is always the true local time.
//
// MET steps are hourly for roughly the first 2-3 days, then 6-hourly. Every output hour gets:
//   - instant values (temperature, humidity, wind, gust, cloud, UV) interpolated linearly between the MET instants
//     around it (wind direction along the shorter arc); hours before the first instant take the first values, hours
//     after the last one keep the last values;
//   - symbol, precipitation and probability from the MET block covering the middle of the hour: next_1_hours, else
//     the latest next_6_hours (its precipitation spread evenly, 1/6 per hour), else next_12_hours. Hours that no block
//     covers take the nearest covered hour (back-fill at the start of today, extend at the end).
import { placeZone, offsetAbbreviation } from "./tz.js";
import { sun, solarElevation, isDayAt, sunsetAfterNoon, clearSkyUvEstimate } from "./solar.js";
import { wmoFromSymbol, wmoFromCloud, precipProbability } from "./wmo.js";
import { round } from "./http.js";

const HOUR = 3600000, DAY = 86400000, DAYS = 7, HOURS = DAYS * 24, KMH = 3.6;

/** Australian BoM (Steadman 1994) apparent temperature, °C: Ta + 0.33·e − 0.70·ws − 4.00, ws in m/s, e in hPa. */
export function apparentTemperature(ta, rh, ws) {
  if (ta == null) return null;
  if (rh == null) return ta;
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * ta) / (237.7 + ta));
  return ta + 0.33 * e - 0.7 * (ws || 0) - 4.0;
}

/** Cloud cover reduction of clear-sky UV: uv·(1 − 0.75·(cloud/100)^3.4) (Kasten–Czeplak type, as in many UV services). */
export const cloudyUv = (uvClear, cloud) => uvClear * (1 - 0.75 * Math.pow(Math.max(0, Math.min(100, cloud || 0)) / 100, 3.4));

const r1 = (v) => (v == null || !Number.isFinite(v) ? null : round(v, 1));
const int = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v) || 0);

function points(steps, field) {
  const pts = [];
  for (const s of steps) if (s[field] != null) pts.push([s.t, s[field]]);
  return pts;
}

/** Index i with pts[i][0] <= t < pts[i+1][0] (pts sorted, t strictly inside the range). */
function bracket(pts, t) {
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= t) lo = mid; else hi = mid;
  }
  return lo;
}

/** Linear interpolation that keeps the end values outside the data (back-fill / extend). */
function lerp(pts, t, circular) {
  if (!pts.length) return null;
  if (t <= pts[0][0]) return pts[0][1];
  if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  const i = bracket(pts, t), [t0, a] = pts[i], [t1, b] = pts[i + 1], f = (t - t0) / (t1 - t0);
  if (!circular) return a + (b - a) * f;
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * f) % 360) + 360) % 360;
}

/** Interpolation only between two neighbouring MET steps that both have the value (gusts and UV stop after ~60 h). */
function lerpStrict(steps, field, t) {
  if (!steps.length || t < steps[0].t || t > steps[steps.length - 1].t) return null;
  let lo = 0, hi = steps.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (steps[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = steps[lo], b = steps[hi];
  if (t === a.t) return a[field];
  if (t === b.t) return b[field];
  if (a[field] == null || b[field] == null) return null;
  return a[field] + (b[field] - a[field]) * ((t - a.t) / (b.t - a.t));
}

function blocks(steps, key, hours) {
  const out = [];
  for (const s of steps) if (s[key]) out.push({ t0: s.t, t1: s.t + hours * HOUR, hours, ...s[key] });
  return out;
}

/** The covering block for an instant: 1-hour first, then the latest-starting 6-hour, then 12-hour. */
function coverAt(lists, t) {
  for (const list of lists) {
    let best = null;
    for (const b of list) {
      if (b.t0 > t) break;
      if (t < b.t1) best = b;
    }
    if (best) return best;
  }
  return null;
}

/**
 * series: normalizeMet() output; lat/lon: the rounded coordinate; now: ms.
 * Returns the Open-Meteo-shaped object for one place.
 */
export function buildForecast(series, lat, lon, now = Date.now()) {
  const started = Date.now();
  const steps = (series && series.steps) || [];
  if (!steps.length) throw new Error("empty series");
  const { timezone, offset } = placeZone(lat, lon, now);
  const off = offset * 1000;
  const local = (ms) => new Date(ms + off).toISOString();
  const start = Math.floor((now + off) / DAY) * DAY - off; // local midnight today (UTC ms)

  const P = {
    T: points(steps, "T"), rh: points(steps, "rh"), ws: points(steps, "ws"), wd: points(steps, "wd"), c: points(steps, "c"),
  };
  const instant = (t) => ({
    T: lerp(P.T, t), rh: lerp(P.rh, t), ws: lerp(P.ws, t), wd: lerp(P.wd, t, true), c: lerp(P.c, t),
  });
  const lists = [blocks(steps, "h1", 1), blocks(steps, "h6", 6), blocks(steps, "h12", 12)];
  // The sun's declination and equation of time once per local day (they barely move within a day).
  const sunDays = [];
  for (let d = 0; d <= DAYS; d++) sunDays.push(sun(start + d * DAY + DAY / 2));
  const sunOf = (t) => sunDays[Math.max(0, Math.min(DAYS, Math.floor((t - start) / DAY)))];

  // Period data per output hour, then fill the hours no block covers from the nearest covered hour.
  const per = new Array(HOURS);
  for (let k = 0; k < HOURS; k++) per[k] = coverAt(lists, start + k * HOUR + HOUR / 2);
  const firstKnown = per.findIndex(Boolean);
  if (firstKnown >= 0) {
    for (let k = 0; k < firstKnown; k++) per[k] = per[firstKnown];
    for (let k = firstKnown + 1; k < HOURS; k++) if (!per[k]) per[k] = per[k - 1];
  }
  const hourAmount = (b) => (b && b.p != null ? b.p / b.hours : null);
  const codeOf = (b, w) => (b && wmoFromSymbol(b.s, w.T)) ?? wmoFromCloud(w.c, hourAmount(b), w.T);

  // Local dates of the 7 days; with one fixed offset, output hour k is local hour k % 24 of day k / 24.
  const dates = [];
  for (let d = 0; d < DAYS; d++) dates.push(local(start + d * DAY).slice(0, 10));

  const hourly = {
    time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [],
    wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], is_day: [],
  };
  for (let k = 0; k < HOURS; k++) {
    const t = start + k * HOUR, w = instant(t), b = per[k];
    hourly.time.push(`${dates[(k / 24) | 0]}T${String(k % 24).padStart(2, "0")}:00`);
    hourly.temperature_2m.push(r1(w.T));
    hourly.apparent_temperature.push(r1(apparentTemperature(w.T, w.rh, w.ws)));
    hourly.precipitation_probability.push(precipProbability(b && b.pop, b && b.p, b && b.s));
    // mm in this hour (a 6- or 12-hour block's amount spread evenly); used for heavy-rain warnings.
    hourly.precipitation.push(r1(hourAmount(b)));
    hourly.weather_code.push(codeOf(b, w));
    hourly.wind_speed_10m.push(r1(w.ws == null ? null : w.ws * KMH));
    // Only where MET gives a gust (no guessing from the mean wind): storm warnings fall back to the mean wind.
    const g = lerpStrict(steps, "g", t + HOUR / 2);
    hourly.wind_gusts_10m.push(r1(g == null ? null : g * KMH));
    hourly.wind_direction_10m.push(int(w.wd));
    hourly.is_day.push(isDayAt(t + HOUR / 2, lat, lon, sunOf(t + HOUR / 2)));
  }

  // Current conditions: instants interpolated at `now`, symbol and precipitation of the hour containing now.
  const k0 = Math.max(0, Math.min(HOURS - 1, Math.floor((now - start) / HOUR)));
  const w0 = instant(now), b0 = per[k0];
  const gust = lerpStrict(steps, "g", now) ?? (w0.ws == null ? null : w0.ws * 1.5);
  const amount0 = hourAmount(b0);
  const current = {
    time: local(Math.floor(now / 900000) * 900000).slice(0, 16),
    interval: 900,
    temperature_2m: r1(w0.T),
    apparent_temperature: r1(apparentTemperature(w0.T, w0.rh, w0.ws)),
    relative_humidity_2m: int(w0.rh),
    precipitation: amount0 == null ? null : r1(amount0),
    weather_code: codeOf(b0, w0),
    wind_speed_10m: r1(w0.ws == null ? null : w0.ws * KMH),
    wind_gusts_10m: r1(gust == null ? null : gust * KMH),
    wind_direction_10m: int(w0.wd),
    is_day: isDayAt(now, lat, lon, sunOf(now)),
  };

  // Daily: UV maximum (MET clear-sky UV, or the solar-elevation estimate where MET has none, reduced by cloud cover)
  // sampled every 30 minutes over the local day; sunset from the NOAA equations.
  const daily = { time: [], uv_index_max: [], sunset: [] };
  for (let d = 0; d < DAYS; d++) {
    const d0 = start + d * DAY;
    let uvMax = 0;
    for (let t = d0; t < d0 + DAY; t += HOUR / 2) {
      const clear = lerpStrict(steps, "uv", t) ?? clearSkyUvEstimate(solarElevation(t, lat, lon, sunOf(t)));
      uvMax = Math.max(uvMax, cloudyUv(clear, lerp(P.c, t)));
    }
    const sunset = sunsetAfterNoon(d0 + DAY / 2, lat, lon);
    daily.time.push(dates[d]);
    daily.uv_index_max.push(r1(uvMax));
    daily.sunset.push(sunset == null ? null : local(sunset).slice(0, 16));
  }

  return {
    latitude: lat,
    longitude: lon,
    generationtime_ms: Date.now() - started,
    utc_offset_seconds: offset,
    timezone,
    timezone_abbreviation: offsetAbbreviation(offset),
    elevation: series.elevation ?? null,
    current_units: {
      time: "iso8601", interval: "seconds", temperature_2m: "°C", apparent_temperature: "°C", relative_humidity_2m: "%",
      precipitation: "mm", weather_code: "wmo code", wind_speed_10m: "km/h", wind_gusts_10m: "km/h",
      wind_direction_10m: "°", is_day: "",
    },
    current,
    hourly_units: {
      time: "iso8601", temperature_2m: "°C", apparent_temperature: "°C", precipitation_probability: "%", precipitation: "mm",
      weather_code: "wmo code", wind_speed_10m: "km/h", wind_gusts_10m: "km/h", wind_direction_10m: "°", is_day: "",
    },
    hourly,
    daily_units: { time: "iso8601", uv_index_max: "", sunset: "iso8601" },
    daily,
  };
}
