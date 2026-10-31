// Shared harness for the "first-time user / location / place search" tests of Ne Giysem?
// - serves the app folder over http://localhost (secure context, so geolocation works)
// - mocks every external host (Open-Meteo forecast + geocoding, Photon, BigDataCloud, MET Norway); the page's own
//   Content-Security-Policy and the site's headers (web/_headers) apply, as on the site
// - fakes navigator.permissions / navigator.geolocation through a Node-side controller (counts permission prompts)
// - phone context = Galaxy A56 (412x915, dpr 2.625, touch), tr-TR, Europe/Istanbul
// Usage: const H = require('./lib'); const t = await H.start(); const s = await t.open({...}); ... await t.close();
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const APP_DIR = process.env.APP_DIR || path.join(__dirname, "..", "..", "web");
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, "..", "out", "shots");
const KEY = "negiysem:v2";
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Turkish folding (same idea as the app) ---------- */
function fold(s) {
  return String(s || "").toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g")
    .replace(/ö/g, "o").replace(/ü/g, "u").replace(/\s+/g, " ").trim();
}

/* ---------- place dataset: every place has its own temperature so a wrong place/weather pairing is visible ---------- */
const PLACES = [
  { name: "Kadıköy", key: "place", val: "town", state: "İstanbul", lat: 40.9903, lon: 29.0277, t: 16 },
  { name: "Kadıköy İskelesi", key: "amenity", val: "ferry_terminal", district: "Rasimpaşa", city: "Kadıköy", state: "İstanbul", lat: 40.9925, lon: 29.0230, t: 17 },
  { name: "Kadıköy", key: "place", val: "village", city: "Gölcük", state: "Kocaeli", lat: 40.70, lon: 29.85, t: 9 },
  { name: "İstanbul", key: "place", val: "city", state: "İstanbul", lat: 41.0082, lon: 28.9784, t: 14 },
  { name: "Boğaziçi Üniversitesi Güney Kampüsü", key: "amenity", val: "university", district: "Etiler", city: "Sarıyer", state: "İstanbul", lat: 41.1757, lon: 28.9900, t: 11 },
  { name: "Etiler", key: "place", val: "quarter", district: "Etiler Merkez", city: "Sarıyer", state: "İstanbul", lat: 41.1746, lon: 28.9910, t: 10 },
  { name: "Bakırköy", key: "place", val: "town", state: "İstanbul", lat: 40.9800, lon: 28.7200, t: 13 },
  { name: "Şişli", key: "place", val: "town", state: "İstanbul", lat: 41.0600, lon: 28.9870, t: 15 },
  { name: "Çağlayan", key: "place", val: "quarter", city: "Kağıthane", state: "İstanbul", lat: 41.0700, lon: 28.9800, t: 18 },
  { name: "Beşiktaş", key: "place", val: "town", state: "İstanbul", lat: 41.0430, lon: 29.0070, t: 19 },
  { name: "Üsküdar", key: "place", val: "town", state: "İstanbul", lat: 41.0260, lon: 29.0150, t: 20 },
  { name: "Göztepe", key: "place", val: "quarter", city: "Kadıköy", state: "İstanbul", lat: 40.9770, lon: 29.0600, t: 21 },
  { name: "Moda", key: "place", val: "quarter", city: "Kadıköy", state: "İstanbul", lat: 40.9810, lon: 29.0260, t: 22 },
  { name: "Kızılay", key: "place", val: "quarter", city: "Çankaya", state: "Ankara", lat: 39.9200, lon: 32.8540, t: 5 },
  { name: "Alsancak", key: "place", val: "quarter", city: "Konak", state: "İzmir", lat: 38.4370, lon: 27.1430, t: 24 },
  { name: "Trabzon", key: "place", val: "city", state: "Trabzon", lat: 42.0260, lon: 35.1510, t: 7 },
  { name: "Ağva", key: "place", val: "village", city: "Şile", state: "İstanbul", lat: 41.1370, lon: 29.8500, t: 12 },
  { name: "Çınarcık", key: "place", val: "town", state: "Yalova", lat: 40.6430, lon: 29.1200, t: 23 },
  { name: "Iğdır", key: "place", val: "city", state: "Iğdır", lat: 39.9200, lon: 44.0450, t: 3 },
];
// device positions used by the fake GPS
const GPS = {
  moda: { lat: 40.9812, lon: 29.0262 },       // Moda, Kadıköy  -> 22°
  etiler: { lat: 41.1748, lon: 28.9908 },   // campus        -> 10°
  trabzon: { lat: 42.0262, lon: 35.1512 },      // Trabzon         -> 7°
};
const IP_GUESS = { city: "İstanbul", latitude: 41.0082, longitude: 28.9784 }; // -> 14°

function kmBetween(a, b) {
  const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function nearest(lat, lon, maxKm = 1.5) {
  let best = null, bd = Infinity;
  for (const p of PLACES) { const d = kmBetween(p, { lat, lon }); if (d < bd) { bd = d; best = p; } }
  return bd <= maxKm ? best : null;
}
function tempFor(lat, lon) { const p = nearest(lat, lon); return p ? p.t : 30; }

/* ---------- Open-Meteo forecast fixture, times in Europe/Istanbul ---------- */
const pad = (n) => String(n).padStart(2, "0");
function fc(t0) {
  const H = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], weather_code: [], wind_speed_10m: [], wind_direction_10m: [], is_day: [] };
  const off = 3 * 3600e3, nowIst = new Date(Date.now() + off);
  const d0 = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
  const days = [];
  for (let i = 0; i < 168; i++) {
    const d = new Date(d0 + i * 3600e3), h = d.getUTCHours();
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    if (h === 0) days.push(day);
    H.time.push(`${day}T${pad(h)}:00`);
    const t = t0 + 3 * Math.sin(((h - 9) / 24) * 2 * Math.PI);
    H.temperature_2m.push(+t.toFixed(1)); H.apparent_temperature.push(+(t - 1).toFixed(1));
    H.precipitation_probability.push(5); H.weather_code.push(2); H.wind_speed_10m.push(10); H.wind_direction_10m.push(40); H.is_day.push(h >= 7 && h < 18 ? 1 : 0);
  }
  return {
    utc_offset_seconds: 10800, timezone: "Europe/Istanbul",
    current: { temperature_2m: t0, apparent_temperature: t0 - 1, weather_code: 2, is_day: 1, wind_speed_10m: 10, wind_gusts_10m: 18, wind_direction_10m: 40, relative_humidity_2m: 65, precipitation: 0 },
    hourly: H, daily: { time: days, uv_index_max: days.map(() => 3), sunset: days.map((x) => x + "T18:10") },
  };
}

/* ---------- place search fixtures ---------- */
function matches(p, q) {
  const fq = fold(q); if (!fq) return false;
  const hay = fold([p.name, p.district, p.city, p.state].filter(Boolean).join(" "));
  return fq.split(" ").every((tok) => hay.split(" ").some((w) => w.startsWith(tok)) || hay.includes(tok));
}
function photonJSON(q) {
  return { type: "FeatureCollection", features: PLACES.filter((p) => matches(p, q)).map((p) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    properties: { name: p.name, district: p.district, city: p.city, state: p.state, country: "Türkiye", countrycode: "TR", osm_key: p.key, osm_value: p.val },
  })) };
}
function omGeoJSON(q) {
  const r = PLACES.filter((p) => p.key === "place" && matches(p, q)).map((p) => ({ name: p.name, latitude: p.lat, longitude: p.lon, admin1: p.state, admin2: p.city, country_code: "TR", country: "Türkiye" }));
  return r.length ? { results: r } : { generationtime_ms: 0.1 };
}

/* ---------- the page under its own Content-Security-Policy (see page-csp.js) ---------- */
const { checkHash, pageBody } = require("./page-csp.js");
checkHash(APP_DIR);
// The site's own headers (web/_headers, the "/*" block), sent with every file as Cloudflare Pages does.
const SITE_HEADERS = (() => {
  const out = {};
  let on = false;
  for (const line of fs.readFileSync(path.join(APP_DIR, "_headers"), "utf8").split("\n")) {
    if (/^\S/.test(line) && !line.startsWith("#")) on = line.trim() === "/*";
    else if (on && /^\s+\S/.test(line)) { const i = line.indexOf(":"); out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); }
  }
  return out;
})();

/* ---------- static server ---------- */
function serve(dir = APP_DIR) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
    const f = path.join(dir, path.normalize(p));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { ...SITE_HEADERS, "content-type": types[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(pageBody(f));
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ url: `http://localhost:${srv.address().port}/`, close: () => srv.close() })));
}

/* ---------- network mock ---------- */
function makeNet() {
  return {
    offline: false,
    delay: { forecast: 0, photon: 0, omgeo: 0, bdc: 0, route: 0, met: 0 },        // ms or fn(url) -> ms
    fail: { forecast: null, photon: null, omgeo: null, bdc: null, route: null, met: null }, // null | http status | "abort" | fn(url)->same
    calls: { forecast: [], photon: [], omgeo: [], bdc: [], fonts: [], route: [], met: [] },
    // /api/route (Google transit routes through the app's server): on or off, and the answer for a URL.
    routeOn: false, route: () => ({ routes: [], agencies: [], source: "Google Maps" }),
    log: [],
  };
}
// The app's own server in "API mode" (window.NG_API) answers on these paths; they count as the same kinds of calls.
const API_ORIGIN = "https://api.test";
function kindOf(url) {
  if (url.startsWith(API_ORIGIN + "/api/forecast")) return "forecast";
  if (url.startsWith(API_ORIGIN + "/api/search")) return "photon";
  if (url.startsWith(API_ORIGIN + "/api/reverse") || url.startsWith(API_ORIGIN + "/api/ip")) return "bdc";
  if (url.startsWith(API_ORIGIN + "/api/route")) return "route";
  if (url.includes("api.open-meteo.com/v1/forecast")) return "forecast";
  if (url.startsWith("https://api.met.no/weatherapi/locationforecast/2.0/")) return "met";
  if (url.includes("photon.komoot.io")) return "photon";
  if (url.includes("geocoding-api.open-meteo.com")) return "omgeo";
  if (url.includes("api.bigdatacloud.net")) return "bdc";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return "fonts";
  return null;
}
// MET Norway's own answer (the app goes there itself when its server can't be reached): a steady temperature of
// tempFor(place) for the next days, from the API tests' MET fixture builder.
async function metJSON(lat, lon) {
  const { metComplete } = await import(require("url").pathToFileURL(path.join(__dirname, "..", "api", "fixtures.mjs")).href);
  const H = 3600e3, first = Math.floor(Date.now() / H) * H - 2 * H, T = tempFor(lat, lon);
  return metComplete({ lat, lon, alt: 30, first, hourlyUntil: first + 60 * H, last: first + 9 * 24 * H,
    temp: () => T, rh: () => 60, wind: () => 3, dir: () => 40, cloud: () => 20, uv: () => 2, gust: true,
    sym: (t) => (new Date(t).getUTCHours() + 3) % 24 >= 7 && (new Date(t).getUTCHours() + 3) % 24 < 18 ? "fair_day" : "fair_night",
    precip: () => 0, pop: { h1: true, h6: true, h12: false } });
}
async function handleRoute(net, route) {
  const url = route.request().url(), k = kindOf(url);
  if (!k) {
    if (/^https?:\/\/localhost/.test(url)) {
      // like a service-worker cache: the app shell still loads when the device is offline
      if (net.offline) {
        let p = new URL(url).pathname; if (p.endsWith("/")) p += "index.html";
        const f = path.join(APP_DIR, path.normalize(p));
        if (f.startsWith(APP_DIR) && fs.existsSync(f)) return route.fulfill({ status: 200, contentType: p.endsWith(".html") ? "text/html; charset=utf-8" : undefined, body: pageBody(f) });
        return route.abort("internetdisconnected");
      }
      return route.continue();
    }
    return route.abort("blockedbyclient");
  }
  net.calls[k].push(url); net.log.push({ k, url, at: Date.now() });
  if (k === "fonts") return route.fulfill({ status: 200, contentType: "text/css", body: "" });
  if (net.offline) return route.abort("internetdisconnected");
  const dl = typeof net.delay[k] === "function" ? net.delay[k](url) : net.delay[k];
  if (dl) await sleep(dl);
  if (net.offline) return route.abort("internetdisconnected");
  const fl = typeof net.fail[k] === "function" ? net.fail[k](url) : net.fail[k];
  if (fl === "abort") return route.abort("failed");
  if (fl) return route.fulfill({ status: fl, contentType: "application/json", body: JSON.stringify({ error: true, reason: "mock " + fl }) });
  const u = new URL(url), cors = { "access-control-allow-origin": "*" };
  let body;
  if (k === "forecast") {
    const la = u.searchParams.get("latitude").split(",").map(Number), lo = u.searchParams.get("longitude").split(",").map(Number);
    const arr = la.map((x, i) => Object.assign(fc(tempFor(x, lo[i])), { latitude: x, longitude: lo[i] }));
    body = arr.length > 1 ? arr : arr[0];
  } else if (k === "route") {
    if (u.searchParams.get("probe") === "1") body = { on: !!net.routeOn };
    else if (!net.routeOn) return route.fulfill({ status: 503, contentType: "application/json", headers: cors, body: JSON.stringify({ error: "routes_off" }) });
    else body = net.route(u);
  } else if (k === "met") body = await metJSON(+u.searchParams.get("lat"), +u.searchParams.get("lon"));
  else if (k === "photon") body = photonJSON(u.searchParams.get("q") || "");
  else if (k === "omgeo") body = omGeoJSON(u.searchParams.get("name") || "");
  else if (k === "bdc") {
    const la = u.searchParams.get("latitude") || u.searchParams.get("lat"), lo = u.searchParams.get("longitude") || u.searchParams.get("lon");
    if (la != null) {
      const p = nearest(+la, +lo, 3);
      body = p ? { locality: p.name, city: p.city || p.name, principalSubdivision: p.state } : { locality: "", city: "Bilinmeyen", principalSubdivision: "" };
    } else body = IP_GUESS;
  }
  return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
}

/* ---------- fake geolocation / permissions ---------- */
function makeGeo(o = {}) {
  return Object.assign({
    state: "prompt",      // what permissions.query says: granted | prompt | denied
    answer: "allow",      // what the person does at a prompt: allow | deny | dismiss | hang (never answers)
    remembers: false,     // answering "allow" turns the state into "granted" (Chrome on https)
    denyPersists: true,   // answering "deny" turns the state into "denied"
    pos: "ok",            // ok | timeout | unavailable  (once permission is there)
    coords: GPS.moda, delay: 60,
    asked: 0, gets: 0, queries: 0, hung: 0,
  }, o);
}
async function geoHandler(geo, op, opts) {
  if (op === "state") { geo.queries++; return geo.state; }
  geo.gets++;
  if (geo.state === "denied") return { err: 1, delay: 5 };
  if (geo.state !== "granted") {
    geo.asked++;
    if (geo.answer === "hang") { geo.hung++; return { hang: true }; }
    if (geo.answer === "deny") { if (geo.denyPersists) geo.state = "denied"; return { err: 1, delay: geo.delay }; }
    if (geo.answer === "dismiss") return { err: 1, delay: geo.delay };
    if (geo.remembers) geo.state = "granted";
  }
  if (geo.pos === "timeout") return { err: 3, delay: (opts && opts.timeout) || 100 };
  if (geo.pos === "unavailable") return { err: 2, delay: geo.delay };
  return { lat: geo.coords.lat, lon: geo.coords.lon, delay: geo.delay };
}
const GEO_INIT = () => {
  const q0 = navigator.permissions && navigator.permissions.query ? navigator.permissions.query.bind(navigator.permissions) : null;
  const perm = { query: async (d) => {
    if (d && d.name === "geolocation") { const s = await window.__geo("state"); return { state: s, name: "geolocation", onchange: null, addEventListener() {}, removeEventListener() {} }; }
    return q0 ? q0(d) : { state: "prompt" };
  } };
  Object.defineProperty(Navigator.prototype, "permissions", { get() { return perm; }, configurable: true });
  const g = {
    getCurrentPosition(ok, bad, opts) {
      window.__geo("get", opts ? { timeout: opts.timeout } : null).then((r) => {
        if (r.hang) return;
        setTimeout(() => { if (r.err) bad && bad({ code: r.err, message: "mock", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); else ok({ coords: { latitude: r.lat, longitude: r.lon, accuracy: 25 }, timestamp: Date.now() }); }, r.delay || 0);
      });
    },
    watchPosition() { return 1; }, clearWatch() {},
  };
  Object.defineProperty(Navigator.prototype, "geolocation", { get() { return g; }, configurable: true });
};
// seeds localStorage once per tab (sessionStorage flag survives reloads)
const SEED_INIT = (seed) => {
  try {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    for (const k of Object.keys(seed)) { if (seed[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, seed[k]); }
  } catch (e) {}
};

const PHONE = {
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  locale: "tr-TR", timezoneId: "Europe/Istanbul", serviceWorkers: "block",
};

async function start() {
  const srv = await serve();
  const browser = await chromium.launch();
  const sessions = [];
  async function open(o = {}) {
    // o: {seed: {key: string|null}, geo: makeGeo opts | "real", net: overrides, realGeo: {grant: bool, coords}}
    const ctxOpts = Object.assign({}, PHONE, o.ctx || {});
    if (o.realGeo) { ctxOpts.geolocation = { latitude: o.realGeo.coords.lat, longitude: o.realGeo.coords.lon, accuracy: 20 }; if (o.realGeo.grant) ctxOpts.permissions = ["geolocation"]; }
    const context = await browser.newContext(ctxOpts);
    const net = Object.assign(makeNet(), o.net || {});
    const geo = makeGeo(o.geo || {});
    await context.route("**/*", (r) => handleRoute(net, r));
    if (!o.realGeo) {
      await context.exposeFunction("__geo", (op, opts) => geoHandler(geo, op, opts));
      await context.addInitScript(GEO_INIT);
    }
    if (o.seed) await context.addInitScript(SEED_INIT, o.seed);
    // API mode talks to the fake server; otherwise force the legacy direct services even though CONFIG.api is set.
    await context.addInitScript((a) => { window.NG_API = a; }, o.api ? API_ORIGIN : "");
    const page = await context.newPage();
    const errors = [], consoleErr = [];
    page.on("pageerror", (e) => errors.push(String(e && e.stack || e)));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErr.push(m.text());
      if (/Content Security Policy|Content-Security-Policy/.test(m.text())) cspViolations.push(m.text().slice(0, 300));
    });
    const s = {
      context, page, net, geo, errors, consoleErr,
      async goto() { await page.goto(srv.url, { waitUntil: "load" }); await sleep(150); },
      async reload() { await page.reload({ waitUntil: "load" }); await sleep(150); },
      status: () => page.$eval("#status", (e) => e.textContent.trim()),
      statusActs: () => page.$$eval("#status button", (b) => b.map((x) => x.textContent.trim())),
      label: () => page.$eval("#placeLabel", (e) => e.textContent.trim()),
      temp: () => page.$eval("#bigTemp", (e) => e.textContent.trim()),
      head: () => page.$eval("#headline", (e) => e.textContent.trim()),
      busy: () => page.$eval("#refresh", (e) => e.classList.contains("busy")),
      chips: () => page.$$eval("#chips .chip", (b) => b.map((x) => (x.getAttribute("aria-pressed") === "true" ? "[*]" : "") + x.textContent.trim())),
      results: () => page.$$eval("#results button", (b) => b.map((x) => x.textContent.replace(/\s+/g, " ").trim())),
      stored: () => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return "INVALID"; } }, KEY),
      async snap() { return { label: await s.label(), temp: await s.temp(), status: await s.status(), acts: await s.statusActs(), chips: await s.chips(), busy: await s.busy() }; },
      async openPanel() { if (await page.$eval("#placePanel", (e) => e.hidden)) await page.tap("#placeBtn"); },
      async chip(textStart) {
        await s.openPanel();
        const h = await page.$$("#chips .chip");
        for (const b of h) { const t = (await b.textContent()).trim(); if (t.startsWith(textStart)) { await b.tap(); return true; } }
        throw new Error("chip not found: " + textStart);
      },
      async openSearch() { await s.chip("+ Yer ekle"); await page.waitForSelector("#q", { state: "visible" }); },
      async type(text, delay = 60) { await page.fill("#q", ""); await page.type("#q", text, { delay }); },
      async shot(name) { const f = path.join(SHOTS, name + ".png"); await page.screenshot({ path: f }); return f; },
      async close() { await context.close(); },
    };
    sessions.push(s);
    return s;
  }
  return { url: srv.url, open, browser, async close() { await browser.close(); srv.close(); } };
}

// Requests or scripts the page's policy blocked, in any session (each one is a failed check at the end of the run).
const cspViolations = [];

/* ---------- tiny reporting helpers ---------- */
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS " : "FAIL ") + name + (detail !== undefined ? "  :: " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : "")); return ok; }
function note(...a) { console.log("     ", ...a); }
function summary() { const f = results.filter((r) => !r.ok); console.log(`\n${results.length - f.length}/${results.length} checks passed` + (f.length ? "; failed: " + f.map((x) => x.name).join(" | ") : "")); return f.length; }
// Runs named scenarios; pass names on the command line to run only some.
async function run(scenarios) {
  const only = process.argv.slice(2);
  const t = await start();
  try {
    for (const [name, fn] of Object.entries(scenarios)) {
      if (only.length && !only.includes(name)) continue;
      console.log(`\n=== ${name} ===`);
      try { await fn(t); } catch (e) { check(name + " (no exception)", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" / ")); }
    }
  } finally { await t.close(); }
  check("the page's Content-Security-Policy blocked nothing", !cspViolations.length, [...new Set(cspViolations)].slice(0, 5));
  process.exitCode = summary() ? 1 : 0;
}

module.exports = { start, run, check, note, sleep, fc, fold, PLACES, GPS, IP_GUESS, tempFor, KEY, SHOTS, kmBetween, API_ORIGIN };
