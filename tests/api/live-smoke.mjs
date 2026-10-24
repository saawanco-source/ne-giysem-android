// Live check against the real MET Norway and Photon services, through the same function code Pages runs.
// CI only (needs the internet): node tests/api/live-smoke.mjs   (optional env MET_USER_AGENT)
// Node 22 already has fetch/Request/Response; caches.default and the Pages context are shimmed here.
import * as forecast from "../../web/functions/api/forecast.js";
import * as search from "../../web/functions/api/search.js";
import * as reverse from "../../web/functions/api/reverse.js";

const ORIGIN = "https://ne-giysem.pages.dev";
const env = process.env.MET_USER_AGENT ? { MET_USER_AGENT: process.env.MET_USER_AGENT } : {};
const KNOWN = new Set([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);

const store = new Map();
globalThis.caches = {
  default: {
    async match(k) { const e = store.get(k); return e ? new Response(e.body, { headers: e.headers }) : undefined; },
    async put(k, res) { store.set(k, { body: await res.text(), headers: Object.fromEntries(res.headers) }); },
  },
};

// Watch the upstream answers to report what MET actually sends for each place.
const realFetch = globalThis.fetch;
const seen = [];
globalThis.fetch = async (url, init) => {
  let res;
  try {
    res = await realFetch(url, init);
  } catch (e) {
    console.error(`network error for ${String(url).split("?")[0]}: ${e.message}${e.cause ? " (" + (e.cause.code || e.cause.message) + ")" : ""}`);
    throw e;
  }
  if (String(url).includes("api.met.no")) {
    const copy = res.clone();
    seen.push({ url: String(url), status: res.status, expires: res.headers.get("expires"), body: copy.status === 200 ? await copy.json() : null });
  }
  return res;
};

async function get(mod, path) {
  const pending = [];
  const context = { request: new Request(ORIGIN + path), env, params: {}, waitUntil: (p) => pending.push(p), data: {} };
  const res = await mod.onRequest(context);
  await Promise.all(pending);
  return { res, body: await res.json() };
}

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.error("FAIL", msg); } };

function checkForecast(name, b, offsets) {
  const h = b.hourly, d = b.daily, c = b.current;
  check(offsets.includes(b.utc_offset_seconds), `${name}: utc_offset_seconds ${b.utc_offset_seconds}`);
  for (const k of ["time", "temperature_2m", "apparent_temperature", "precipitation_probability", "weather_code", "wind_speed_10m", "wind_direction_10m", "is_day"]) {
    check(Array.isArray(h[k]) && h[k].length === 168, `${name}: hourly.${k} has 168 entries`);
  }
  check(/T00:00$/.test(h.time[0]), `${name}: starts at local midnight (${h.time[0]})`);
  check(h.temperature_2m.every((v) => typeof v === "number"), `${name}: no missing temperatures`);
  check(h.apparent_temperature.every((v) => typeof v === "number"), `${name}: no missing apparent temperatures`);
  check(h.weather_code.every((v) => KNOWN.has(v)), `${name}: known weather codes`);
  check(h.precipitation_probability.every((v) => Number.isInteger(v) && v >= 0 && v <= 100), `${name}: probabilities 0-100`);
  check(d.time.length === 7 && d.uv_index_max.length === 7 && d.sunset.length === 7, `${name}: 7 daily entries`);
  for (const k of ["temperature_2m", "apparent_temperature", "wind_speed_10m", "wind_gusts_10m", "weather_code", "is_day"]) {
    check(typeof c[k] === "number", `${name}: current.${k} is a number`);
  }
  console.log(`${name}: ${b.timezone} UTC${b.utc_offset_seconds >= 0 ? "+" : ""}${b.utc_offset_seconds / 3600}, now ${c.temperature_2m}°C ` +
    `(feels ${c.apparent_temperature}), code ${c.weather_code}, wind ${c.wind_speed_10m} km/h, gusts ${c.wind_gusts_10m}, ` +
    `UV today ${d.uv_index_max[0]}, sunset ${d.sunset[0]}`);
}

try {
  const one = await get(forecast, "/api/forecast?latitude=41.01&longitude=28.98");
  check(one.res.status === 200, "İstanbul status " + one.res.status + " " + JSON.stringify(one.body).slice(0, 200));
  if (one.res.status === 200) checkForecast("İstanbul", one.body, [10800]);

  const two = await get(forecast, "/api/forecast?latitude=41.01,52.52&longitude=28.98,13.41");
  check(two.res.status === 200 && Array.isArray(two.body) && two.body.length === 2, "array answer for two places");
  check((two.res.headers.get("x-ng-cache") || "").startsWith("hit"), "second İstanbul request served from the cache");
  if (Array.isArray(two.body)) checkForecast("Berlin", two.body[1], [3600, 7200]);

  for (const s of seen) {
    const ts = s.body ? s.body.properties.timeseries : [];
    const has = (f) => ts.filter(f).length;
    console.log(`MET ${s.url.split("?")[1]}: HTTP ${s.status}, Expires ${s.expires}, ${ts.length} steps, ` +
      `${has((x) => x.data.next_1_hours)} with next_1_hours, ` +
      `probability_of_precipitation in 1h/6h blocks: ${has((x) => x.data.next_1_hours && x.data.next_1_hours.details.probability_of_precipitation != null)}/` +
      `${has((x) => x.data.next_6_hours && x.data.next_6_hours.details.probability_of_precipitation != null)}, ` +
      `UV in ${has((x) => x.data.instant.details.ultraviolet_index_clear_sky != null)}, gusts in ${has((x) => x.data.instant.details.wind_speed_of_gust != null)}`);
  }

  const s = await get(search, "/api/search?q=Kad%C4%B1k%C3%B6y&lat=41.01&lon=28.97");
  check(s.res.status === 200 && Array.isArray(s.body.features) && s.body.features.length > 0, "Photon search finds Kadıköy " + JSON.stringify(s.body).slice(0, 120));
  if (s.body.features) console.log("Photon search:", s.body.features.slice(0, 3).map((f) => f.properties.name + " (" + (f.properties.county || f.properties.city || "") + ")").join(", "));

  const r = await get(reverse, "/api/reverse?lat=41.176&lon=28.989");
  check(r.res.status === 200 && (r.body.locality || r.body.city), "Photon reverse names Bahçeköy " + JSON.stringify(r.body).slice(0, 120));
  console.log("Photon reverse:", JSON.stringify(r.body));
} catch (e) {
  failures++;
  console.error("FAIL", e && e.stack ? e.stack : e);
}

if (failures) {
  console.error(`${failures} live check(s) failed`);
  process.exit(1);
}
console.log("live smoke OK");
