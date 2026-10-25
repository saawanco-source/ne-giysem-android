// /api/forecast: Open-Meteo shape from MET Norway fixtures, units, symbol mapping, DST, errors and caching.
import test from "node:test";
import assert from "node:assert/strict";
import * as forecast from "../../web/functions/api/forecast.js";
import { apparentTemperature } from "../../web/functions/_lib/openmeteo.js";
import { installCache, installFetch, jsonResponse, call, atTime, ORIGIN } from "./helpers.mjs";
import { istanbul, berlin, H, iso } from "./fixtures.mjs";

const NOW = Date.parse("2026-10-24T09:20:00Z"); // 12:20 in İstanbul, 11:20 CEST in Berlin
const EXPIRES = "Sat, 24 Oct 2026 09:51:12 GMT";
const LAST_MOD = "Sat, 24 Oct 2026 08:41:12 GMT";
const KNOWN = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const URL1 = `${ORIGIN}/api/forecast?latitude=41.01&longitude=28.98`;
const OM_QUERY = "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m," +
  "wind_gusts_10m,wind_direction_10m,is_day&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code," +
  "wind_speed_10m,wind_direction_10m,is_day&daily=uv_index_max,sunset&timezone=auto&forecast_days=7";

function metServer(byLat = { "41.01": istanbul, "52.52": berlin }) {
  return installFetch((url) => {
    const lat = new URL(url).searchParams.get("lat");
    const fx = byLat[lat];
    if (!fx) return jsonResponse({ error: "no fixture" }, 404);
    return jsonResponse(fx(), 200, { expires: EXPIRES, "last-modified": LAST_MOD });
  });
}

/** Value of a fixture step's instant detail at an exact step time. */
function stepAt(fx, ms) {
  const s = fx.properties.timeseries.find((x) => x.time === iso(ms));
  assert.ok(s, "fixture step " + iso(ms));
  return s.data;
}
/** Index of a UTC instant in hourly.time the way both clients look it up (fixed utc_offset_seconds). */
function clientIndex(body, ms) {
  const key = new Date(ms + body.utc_offset_seconds * 1000).toISOString().slice(0, 13);
  return body.hourly.time.findIndex((t) => t.slice(0, 13) === key);
}

test("İstanbul: one coordinate gives one Open-Meteo-shaped object", async () => {
  installCache(); metServer();
  const { res, body } = await atTime(NOW, () => call(forecast, URL1 + OM_QUERY));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("cache-control"), "public, max-age=600");
  assert.ok(!Array.isArray(body));
  assert.equal(body.latitude, 41.01);
  assert.equal(body.longitude, 28.98);
  assert.equal(body.timezone, "Europe/Istanbul");
  assert.equal(body.utc_offset_seconds, 10800);
  assert.equal(body.elevation, 39);

  const h = body.hourly;
  const keys = ["time", "temperature_2m", "apparent_temperature", "precipitation_probability", "weather_code", "wind_speed_10m", "wind_direction_10m", "is_day"];
  for (const k of keys) assert.equal(h[k].length, 168, k);
  assert.equal(h.time[0], "2026-10-24T00:00");
  assert.equal(h.time[23], "2026-10-24T23:00");
  assert.equal(h.time[167], "2026-10-30T23:00");
  for (let k = 1; k < 168; k++) {
    assert.equal(Date.parse(h.time[k] + "Z") - Date.parse(h.time[k - 1] + "Z"), H, "evenly spaced at " + h.time[k]);
  }
  for (let k = 0; k < 168; k++) {
    assert.match(h.time[k], /^\d{4}-\d\d-\d\dT\d\d:00$/);
    assert.equal(typeof h.temperature_2m[k], "number");
    assert.equal(typeof h.apparent_temperature[k], "number");
    assert.ok(Number.isInteger(h.precipitation_probability[k]) && h.precipitation_probability[k] >= 0 && h.precipitation_probability[k] <= 100);
    assert.ok(KNOWN.has(h.weather_code[k]), "code " + h.weather_code[k]);
    assert.ok(h.is_day[k] === 0 || h.is_day[k] === 1);
    assert.ok(Number.isInteger(h.wind_direction_10m[k]) && h.wind_direction_10m[k] >= 0 && h.wind_direction_10m[k] <= 360);
  }
  // Night at 03:00, day at 12:00 local, every day.
  for (let d = 0; d < 7; d++) { assert.equal(h.is_day[d * 24 + 3], 0); assert.equal(h.is_day[d * 24 + 12], 1); }

  const D = body.daily;
  assert.deepEqual(D.time, ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
  assert.equal(D.uv_index_max.length, 7);
  for (const uv of D.uv_index_max) assert.ok(typeof uv === "number" && uv > 1 && uv < 5, "uv " + uv);
  for (let d = 0; d < 7; d++) assert.match(D.sunset[d], new RegExp(`^${D.time[d]}T1[78]:\\d\\d$`));
  // NOAA: İstanbul sunset on 24 Oct 2026 is about 18:10 (UTC+3).
  const [hh, mm] = D.sunset[0].slice(11).split(":").map(Number);
  assert.ok(Math.abs(hh * 60 + mm - (18 * 60 + 10)) <= 4, D.sunset[0]);

  const c = body.current;
  for (const k of ["temperature_2m", "apparent_temperature", "relative_humidity_2m", "precipitation", "weather_code", "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "is_day"]) {
    assert.equal(typeof c[k], "number", "current." + k);
  }
  assert.equal(c.time, "2026-10-24T12:15");
  assert.equal(c.is_day, 1);
});

test("units, apparent temperature, gusts and back-fill follow the MET values", async () => {
  installCache(); metServer();
  const fx = istanbul();
  const { body } = await atTime(NOW, () => call(forecast, URL1));
  const h = body.hourly;
  const at = Date.parse("2026-10-24T12:00:00Z"); // 15:00 local, an hourly MET step
  const k = clientIndex(body, at);
  assert.equal(h.time[k], "2026-10-24T15:00");
  const d = stepAt(fx, at).instant.details;
  assert.equal(h.temperature_2m[k], d.air_temperature);
  assert.equal(h.wind_speed_10m[k], Math.round(d.wind_speed * 3.6 * 10) / 10, "m/s -> km/h");
  assert.equal(h.wind_direction_10m[k], Math.round(d.wind_from_direction));
  const e = (d.relative_humidity / 100) * 6.105 * Math.exp((17.27 * d.air_temperature) / (237.7 + d.air_temperature));
  const at_ = d.air_temperature + 0.33 * e - 0.7 * d.wind_speed - 4;
  assert.equal(h.apparent_temperature[k], Math.round(at_ * 10) / 10, "BoM apparent temperature");
  assert.equal(apparentTemperature(20, 50, 0).toFixed(3), (20 + 0.33 * (0.5 * 6.105 * Math.exp((17.27 * 20) / 257.7)) - 4).toFixed(3));

  // Hours of today before the first MET step (09:00Z = 12:00 local) take the first step's values.
  const first = fx.properties.timeseries[0].data.instant.details;
  for (let i = 0; i < 12; i++) assert.equal(h.temperature_2m[i], first.air_temperature);

  // Halfway between two hourly steps the current values are interpolated; gusts come from MET (×3.6).
  const a = stepAt(fx, Date.parse("2026-10-24T09:00:00Z")).instant.details, b = stepAt(fx, Date.parse("2026-10-24T10:00:00Z")).instant.details;
  const f = 20 / 60;
  assert.equal(body.current.temperature_2m, Math.round((a.air_temperature + (b.air_temperature - a.air_temperature) * f) * 10) / 10);
  const gust = a.wind_speed_of_gust + (b.wind_speed_of_gust - a.wind_speed_of_gust) * f;
  assert.equal(body.current.wind_gusts_10m, Math.round(gust * 3.6 * 10) / 10);

  // Hourly gusts (for storm warnings): MET's gust at the middle of the hour, km/h; none is invented after MET stops giving one.
  const g15 = (a.wind_speed_of_gust + b.wind_speed_of_gust) / 2; // 09:30Z, the middle of local 12:00
  assert.equal(h.wind_gusts_10m[clientIndex(body, Date.parse("2026-10-24T09:00:00Z"))], Math.round(g15 * 3.6 * 10) / 10);
  assert.ok(h.wind_gusts_10m.length === h.time.length && h.wind_gusts_10m.some((v) => v === null), "gusts end with MET's");
  // Hourly precipitation (for heavy-rain warnings): the hour's own amount, a 6-hour block's spread evenly.
  const p1 = stepAt(fx, Date.parse("2026-10-24T10:00:00Z")).next_1_hours;
  if (p1) assert.equal(h.precipitation[clientIndex(body, Date.parse("2026-10-24T10:00:00Z"))], Math.round(p1.details.precipitation_amount * 10) / 10);
  assert.equal(h.precipitation.length, h.time.length);
  assert.equal(body.hourly_units.precipitation, "mm");
  assert.equal(body.hourly_units.wind_gusts_10m, "km/h");
});

test("İstanbul symbols and the derived precipitation probability (no probability_of_precipitation)", async () => {
  installCache(); metServer();
  const { body } = await atTime(NOW, () => call(forecast, URL1));
  const h = body.hourly;
  const at = (utc) => clientIndex(body, Date.parse(utc));
  const expect = [
    ["2026-10-24T12:00:00Z", 2, 0], // partlycloudy_day, 0 mm
    ["2026-10-24T13:00:00Z", 61, 60], // lightrain 0.3 mm -> > 0 mm
    ["2026-10-24T14:00:00Z", 63, 80], // rain 1.2 mm -> >= 0.5 mm
    ["2026-10-24T15:00:00Z", 61, 40], // lightrain with 0 mm -> rain symbol, 40
    ["2026-10-25T12:00:00Z", 95, 80], // rainshowersandthunder_day 2 mm
    ["2026-10-26T06:00:00Z", 45, 0], // fog
  ];
  for (const [utc, code, pop] of expect) {
    const k = at(utc);
    assert.ok(k >= 0, utc);
    assert.equal(h.weather_code[k], code, "code at " + utc);
    assert.equal(h.precipitation_probability[k], pop, "probability at " + utc);
  }
  // Transition: the 20:00Z step has no next_1_hours (next step 00:00Z); its next_6_hours (lightrain 0.6 mm) covers 20-23Z.
  for (const utc of ["2026-10-26T20:00:00Z", "2026-10-26T21:00:00Z", "2026-10-26T22:00:00Z", "2026-10-26T23:00:00Z"]) {
    assert.equal(h.weather_code[at(utc)], 61, utc);
    assert.equal(h.precipitation_probability[at(utc)], 80, utc);
  }
  assert.equal(h.weather_code[at("2026-10-26T19:00:00Z")], 2, "last 1-hour block");
  // 6-hourly part: heavyrainshowers 6 mm in 12-18Z -> 82 for each of the 6 hours, then the next block.
  for (let i = 0; i < 6; i++) assert.equal(h.weather_code[at("2026-10-27T12:00:00Z") + i], 82);
  assert.equal(h.weather_code[at("2026-10-27T18:00:00Z")], 2);
  assert.equal(h.weather_code[at("2026-10-28T00:00:00Z")], 0, "clearsky_night");
  // Wind direction swinging between 350° and 10° is interpolated across north, never through south.
  for (let k = at("2026-10-27T00:00:00Z"); k < 168; k++) {
    const dir = h.wind_direction_10m[k];
    assert.ok(dir <= 10 || dir >= 350, "direction " + dir + " at " + h.time[k]);
  }
  // Data continue to the end of day 7 without gaps.
  assert.equal(h.temperature_2m.filter((v) => v == null).length, 0);
});

test("current precipitation is the current hour's amount; 6-hour amounts are spread evenly", async () => {
  installCache(); metServer();
  const rainNow = Date.parse("2026-10-24T14:40:00Z"); // inside the rain 1.2 mm hour
  const { body } = await atTime(rainNow, () => call(forecast, URL1));
  assert.equal(body.current.precipitation, 1.2);
  assert.equal(body.current.weather_code, 63);
  installCache();
  const later = Date.parse("2026-10-27T13:10:00Z"); // inside the 6 mm / 6 h block
  const r2 = await atTime(later, () => call(forecast, URL1));
  assert.equal(r2.body.current.precipitation, 1);
  assert.equal(r2.body.current.weather_code, 82);
  assert.equal(r2.body.hourly.time[0], "2026-10-27T00:00", "starts at local midnight of the new day");
});

test("Berlin: MET probabilities, no gusts, sleet/snow/thunder mapping", async () => {
  installCache(); metServer();
  const { body } = await atTime(NOW, () => call(forecast, `${ORIGIN}/api/forecast?latitude=52.52&longitude=13.41`));
  assert.equal(body.timezone, "Europe/Berlin");
  const h = body.hourly, at = (utc) => clientIndex(body, Date.parse(utc));
  const expect = [
    ["2026-10-24T12:00:00Z", 66, 62], // sleet at 0.3 °C -> freezing rain
    ["2026-10-24T13:00:00Z", 65, 88], // heavy sleet at 2 °C -> heavy rain
    ["2026-10-24T14:00:00Z", 67, 90], // heavy sleet at 0 °C -> heavy freezing rain
    ["2026-10-24T15:00:00Z", 85, 35], // light snow showers
    ["2026-10-25T10:00:00Z", 96, 70], // snow and thunder
    ["2026-10-25T11:00:00Z", 96, 50], // lightssleetshowersandthunder (MET's spelling)
    ["2026-10-24T16:00:00Z", 3, 5], // cloudy, MET probability 4.6 % -> 5
  ];
  for (const [utc, code, pop] of expect) {
    assert.equal(h.weather_code[at(utc)], code, "code at " + utc);
    assert.equal(h.precipitation_probability[at(utc)], pop, "probability at " + utc);
  }
  for (let i = 0; i < 6; i++) {
    assert.equal(h.weather_code[at("2026-10-27T06:00:00Z") + i], 75, "heavy snow block");
    assert.equal(h.precipitation_probability[at("2026-10-27T06:00:00Z") + i], 96);
  }
  assert.equal(h.precipitation_probability[at("2026-10-28T12:00:00Z")], 12, "6-hour MET probability");
  // No wind_speed_of_gust in this fixture: gusts are 1.5 × the wind speed.
  assert.equal(body.current.wind_gusts_10m, Math.round(body.current.wind_speed_10m * 1.5 * 10) / 10);
  // NOAA: Berlin sunset on 24 Oct 2026 is about 17:52 CEST.
  const [hh, mm] = body.daily.sunset[0].slice(11).split(":").map(Number);
  assert.ok(Math.abs(hh * 60 + mm - (17 * 60 + 52)) <= 4, body.daily.sunset[0]);
});

test("Berlin across the DST change keeps one fixed offset like Open-Meteo, and client lookups hit the right hour", async () => {
  installCache(); metServer();
  const fx = berlin();
  const before = await atTime(NOW, () => call(forecast, `${ORIGIN}/api/forecast?latitude=52.52&longitude=13.41`));
  const b = before.body;
  assert.equal(b.utc_offset_seconds, 7200, "CEST now");
  assert.equal(b.hourly.time[0], "2026-10-24T00:00");
  assert.equal(new Set(b.hourly.time).size, 168, "no repeated hour on 25 Oct");
  // After the change (25 Oct 01:00Z) the labels stay on +2, so both clients' key (ms + utc_offset) finds the right data.
  const ms = Date.parse("2026-10-26T10:00:00Z");
  const k = clientIndex(b, ms);
  assert.equal(b.hourly.time[k], "2026-10-26T12:00");
  assert.equal(b.hourly.temperature_2m[k], stepAt(fx, ms).instant.details.air_temperature);

  installCache();
  const after = await atTime(Date.parse("2026-10-25T12:00:00Z"), () => call(forecast, `${ORIGIN}/api/forecast?latitude=52.52&longitude=13.41`));
  const a = after.body;
  assert.equal(a.utc_offset_seconds, 3600, "CET after the change");
  assert.equal(a.hourly.time[0], "2026-10-25T00:00");
  assert.equal(a.daily.time[0], "2026-10-25");
  assert.equal(a.hourly.time[clientIndex(a, Date.parse("2026-10-25T12:00:00Z"))], "2026-10-25T13:00");
  const [hh, mm] = a.daily.sunset[0].slice(11).split(":").map(Number);
  assert.ok(Math.abs(hh * 60 + mm - (16 * 60 + 50)) <= 4, "sunset in CET " + a.daily.sunset[0]);
});

test("several coordinates give an array in the same order", async () => {
  installCache(); const calls = metServer();
  const { body } = await atTime(NOW, () => call(forecast, `${ORIGIN}/api/forecast?latitude=52.52,41.01,52.521&longitude=13.41,28.98,13.409` + OM_QUERY));
  assert.ok(Array.isArray(body));
  assert.deepEqual(body.map((b) => b.timezone), ["Europe/Berlin", "Europe/Istanbul", "Europe/Berlin"]);
  assert.equal(calls.length, 2, "the same ~1 km cell is fetched once");
  for (const b of body) assert.equal(b.hourly.time.length, 168);
});

test("bad input -> 400 JSON; OPTIONS -> 204 with CORS; POST -> 405", async () => {
  installCache(); const calls = metServer();
  const bad = [
    "/api/forecast",
    "/api/forecast?latitude=41.01",
    "/api/forecast?latitude=41.01,40&longitude=28.98",
    "/api/forecast?latitude=91&longitude=28.98",
    "/api/forecast?latitude=41&longitude=181",
    "/api/forecast?latitude=abc&longitude=28.98",
    "/api/forecast?latitude=41,&longitude=28,29",
    "/api/forecast?latitude=" + Array(9).fill(41).join(",") + "&longitude=" + Array(9).fill(29).join(","),
  ];
  for (const path of bad) {
    const { res, body } = await call(forecast, ORIGIN + path);
    assert.equal(res.status, 400, path);
    assert.equal(typeof body.error, "string", path);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  }
  assert.equal(calls.length, 0);
  const eight = await atTime(NOW, () => call(forecast, ORIGIN + "/api/forecast?latitude=" + Array(8).fill("41.01").join(",") + "&longitude=" + Array(8).fill("28.98").join(",")));
  assert.equal(eight.res.status, 200);
  assert.equal(eight.body.length, 8);

  const opt = await call(forecast, URL1, { method: "OPTIONS" });
  assert.equal(opt.res.status, 204);
  assert.equal(opt.res.headers.get("access-control-allow-origin"), "*");
  assert.match(opt.res.headers.get("access-control-allow-methods"), /GET/);
  const post = await call(forecast, URL1, { method: "POST" });
  assert.equal(post.res.status, 405);
});

test("MET request: 2-decimal coordinates, identifying User-Agent (env override), no browser UA", async () => {
  installCache(); const calls = metServer();
  await atTime(NOW, () => call(forecast, `${ORIGIN}/api/forecast?latitude=41.0123&longitude=28.9789`));
  assert.equal(calls[0].url, "https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=41.01&lon=28.98");
  assert.equal(calls[0].headers.get("user-agent"), "NeGiysem/1.0 (+https://ne-giysem.pages.dev)");
  installCache();
  await atTime(NOW, () => call(forecast, URL1, { env: { MET_USER_AGENT: "NeGiysem/1.0 (+https://negiysem.com.tr)" } }));
  assert.equal(calls[1].headers.get("user-agent"), "NeGiysem/1.0 (+https://negiysem.com.tr)");
  assert.doesNotMatch(calls[1].headers.get("user-agent"), /Mozilla/);
});

test("cache: served until MET's Expires, then revalidated with If-Modified-Since (304 keeps the copy)", async () => {
  const cache = installCache();
  let mode = "200";
  const calls = installFetch(() => {
    if (mode === "304") return new Response(null, { status: 304, headers: { expires: "Sat, 24 Oct 2026 10:40:00 GMT" } });
    if (mode === "500") return jsonResponse({ error: "x" }, 500);
    return jsonResponse(istanbul(), 200, { expires: EXPIRES, "last-modified": LAST_MOD });
  });
  await atTime(NOW, async (clock) => {
    const r1 = await call(forecast, URL1);
    assert.equal(r1.res.headers.get("x-ng-cache"), "miss");
    assert.equal(cache.puts, 1);
    const key = [...cache.store.keys()][0];
    assert.equal(key, `${ORIGIN}/__ng-cache/met-v1/${encodeURIComponent("41.01,28.98")}`);

    clock.now = Date.parse("2026-10-24T09:50:00Z"); // before Expires (09:51:12)
    const r2 = await call(forecast, `${ORIGIN}/api/forecast?latitude=41.012&longitude=28.981`);
    assert.equal(r2.res.headers.get("x-ng-cache"), "hit");
    assert.equal(calls.length, 1, "no MET call while fresh");
    assert.equal(r2.body.current.time, "2026-10-24T12:45", "current is rebuilt per request from the cached series");

    clock.now = Date.parse("2026-10-24T09:52:00Z"); // expired
    mode = "304";
    const r3 = await call(forecast, URL1);
    assert.equal(r3.res.headers.get("x-ng-cache"), "revalidated");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].headers.get("if-modified-since"), LAST_MOD);
    assert.deepEqual(r3.body.hourly.temperature_2m, r1.body.hourly.temperature_2m);

    clock.now = Date.parse("2026-10-24T10:30:00Z"); // still fresh thanks to the 304's new Expires (10:40)
    const r4 = await call(forecast, URL1);
    assert.equal(r4.res.headers.get("x-ng-cache"), "hit");
    assert.equal(calls.length, 2);

    clock.now = Date.parse("2026-10-24T11:00:00Z"); // expired, MET failing -> the stale copy
    mode = "500";
    const r5 = await call(forecast, URL1);
    assert.equal(r5.res.status, 200);
    assert.equal(r5.res.headers.get("x-ng-cache"), "stale");
  });
});

test("MET failures without a cached copy -> 502 JSON", async () => {
  installCache();
  installFetch(() => jsonResponse("Too Many Requests", 429));
  const r1 = await atTime(NOW, () => call(forecast, URL1));
  assert.equal(r1.res.status, 502);
  assert.equal(r1.body.error, "met_status_429");
  assert.equal(r1.body.upstreamStatus, 429);
  installFetch(() => { throw new TypeError("fetch failed"); });
  const r2 = await atTime(NOW, () => call(forecast, URL1));
  assert.equal(r2.res.status, 502);
  assert.equal(r2.body.error, "met_unreachable");
  installFetch(() => jsonResponse("<html>oops</html>", 200));
  const r3 = await atTime(NOW, () => call(forecast, URL1));
  assert.equal(r3.res.status, 502);
  assert.equal(r3.body.error, "met_bad_response");
  assert.equal(r3.res.headers.get("access-control-allow-origin"), "*");
});

test("works without caches.default (local dev) and answers HEAD", async () => {
  delete globalThis.caches;
  metServer();
  const r = await atTime(NOW, () => call(forecast, URL1));
  assert.equal(r.res.status, 200);
  assert.equal(r.res.headers.get("x-ng-cache"), "miss");
  const head = await atTime(NOW, () => call(forecast, URL1, { method: "HEAD" }));
  assert.equal(head.res.status, 200);
  assert.equal(head.text, "");
});
