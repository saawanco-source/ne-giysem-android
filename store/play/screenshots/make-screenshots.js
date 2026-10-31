// Ne Giysem? — Google Play phone screenshots.
//
// Serves ../../../web on localhost, mocks every network request (weather, place search, fonts, ads),
// seeds the app's localStorage ("negiysem:v2") with generic places and a fixed forecast, freezes the clock,
// and saves one PNG per scene to ./out/ (./out/<lang>/ for other languages).
//
//   node store/play/screenshots/make-screenshots.js            # all scenes
//   node store/play/screenshots/make-screenshots.js 03-gunum   # only some scenes
//   SHOT_LANG=en node store/play/screenshots/make-screenshots.js   # English UI → ./out/en/
//
// Size: 412×733 CSS px at device scale 2.625 → 1082×1924 px PNG (RGB, no alpha).
// Google Play phone screenshots: JPEG or 24-bit PNG, each side 320–3840 px, long side at most twice the short side;
// for promotion, at least 4 portrait shots of 9:16 and at least 1080×1920. 1082×1924 is 9:16 and meets both.
// Source: https://support.google.com/googleplay/android-developer/answer/9866151
//
// Playwright and Chromium are installed globally (require("playwright"), chromium.launch() with no options).
// A scene whose feature is missing or unfinished in the app (e.g. the weekly view or packing list while they were being
// built) is skipped and listed at the end instead of producing a misleading picture.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const WEB = process.env.APP_DIR || path.join(ROOT, "web");
const FONTS = path.join(__dirname, "..", "fonts");
const LANG = (process.env.SHOT_LANG || "tr").toLowerCase();
const OUT = path.join(__dirname, "out", LANG === "tr" ? "" : LANG);
const KEY = "negiysem:v2";
const VIEW = { width: +process.env.SHOT_W || 412, height: +process.env.SHOT_H || 733 };
const DPR = +process.env.SHOT_DPR || 2.625;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- language switch ----------------
   TODO(en): when the English UI lands, fill in how to turn it on, e.g. a stored setting
   (state => { state.lang = "en"; }) or a click on the language toggle. Until then SHOT_LANG=en skips every scene. */
const LANGS = {
  tr: { locale: "tr-TR", seed: null },
  en: { locale: "en-US", seed: (state) => { state.lang = "en"; } },
};

/* ---------------- time: everything happens on Tuesday 27 Oct 2026, Europe/Istanbul (UTC+3) ---------------- */
const DAY0 = { y: 2026, m: 10, d: 27 };
const pad = (n) => String(n).padStart(2, "0");
function ymd(off) { const t = new Date(Date.UTC(DAY0.y, DAY0.m - 1, DAY0.d + off)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function at(hhmm, off = 0) { const [h, m] = hhmm.split(":").map(Number); return new Date(Date.UTC(DAY0.y, DAY0.m - 1, DAY0.d + off, h - 3, m)); }

/* ---------------- forecast fixture (Open-Meteo shape, same idea as tests/web/lib.js fc()) ----------------
   w(day, hour) -> {t, app?, code?, p?, wind?, dir?}; 7 days × 24 h from local midnight of DAY0. */
const AUTUMN = [14, 13.5, 13, 12.5, 12.5, 12.5, 13, 14, 16, 18, 19.5, 20.5, 21.5, 22, 22, 21.5, 20.5, 19, 17.5, 16.5, 16, 15.5, 15, 14.5];
const WEEK_SHIFT = [0, -1.5, -4, -5.5, -3, 0.5, 1.5]; // a cooler mid-week for the weekly view
function fair(day, h) {
  const t = AUTUMN[h] + WEEK_SHIFT[day];
  const rainy = day === 2 && h >= 9 && h <= 19;
  return { t, app: t - (h >= 18 || h < 7 ? 2 : 1), code: rainy ? 63 : day === 3 ? 3 : h >= 8 && h <= 17 ? 1 : 2, p: rainy ? 80 : day === 3 ? 25 : 5, wind: h >= 18 ? 16 : 11, dir: 40 };
}
function makeWx(w, nowDate, lat, lon, extra = {}) {
  const H = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], weather_code: [], wind_speed_10m: [], wind_direction_10m: [], is_day: [] };
  const D = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], apparent_temperature_max: [], apparent_temperature_min: [], precipitation_probability_max: [], uv_index_max: [], sunrise: [], sunset: [] };
  for (let d = 0; d < 7; d++) {
    const day = ymd(d); D.time.push(day);
    let tmax = -99, tmin = 99, amax = -99, amin = 99, pmax = 0, worst = 0;
    for (let h = 0; h < 24; h++) {
      const s = w(d, h), app = s.app != null ? s.app : s.t - 1, code = s.code != null ? s.code : 2;
      H.time.push(`${day}T${pad(h)}:00`); H.temperature_2m.push(+s.t.toFixed(1)); H.apparent_temperature.push(+app.toFixed(1));
      H.precipitation_probability.push(s.p || 0); H.weather_code.push(code); H.wind_speed_10m.push(s.wind || 10);
      H.wind_direction_10m.push(s.dir == null ? 40 : s.dir); H.is_day.push(h >= 8 && h < 18 ? 1 : 0);
      tmax = Math.max(tmax, s.t); tmin = Math.min(tmin, s.t); amax = Math.max(amax, app); amin = Math.min(amin, app);
      pmax = Math.max(pmax, s.p || 0); if (h >= 8 && h <= 20) worst = Math.max(worst, code);
    }
    D.weather_code.push(worst); D.temperature_2m_max.push(+tmax.toFixed(1)); D.temperature_2m_min.push(+tmin.toFixed(1));
    D.apparent_temperature_max.push(+amax.toFixed(1)); D.apparent_temperature_min.push(+amin.toFixed(1));
    D.precipitation_probability_max.push(pmax); D.uv_index_max.push(worst >= 51 ? 1.5 : 4.2);
    D.sunrise.push(`${day}T07:34`); D.sunset.push(`${day}T18:08`);
  }
  const ist = new Date(nowDate.getTime() + 3 * 3600e3), dOff = Math.round((Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - Date.UTC(DAY0.y, DAY0.m - 1, DAY0.d)) / 864e5);
  const h = ist.getUTCHours(), frac = ist.getUTCMinutes() / 60, a = w(dOff, h), b = w(dOff, Math.min(23, h + 1));
  const t = a.t + (b.t - a.t) * frac, app = (a.app != null ? a.app : a.t - 1) + ((b.app != null ? b.app : b.t - 1) - (a.app != null ? a.app : a.t - 1)) * frac;
  const code = a.code != null ? a.code : 2;
  return Object.assign({
    latitude: lat, longitude: lon, utc_offset_seconds: 10800, timezone: "Europe/Istanbul",
    current: { temperature_2m: +t.toFixed(1), apparent_temperature: +app.toFixed(1), weather_code: code, is_day: h >= 8 && h < 18 ? 1 : 0,
      wind_speed_10m: a.wind || 10, wind_gusts_10m: Math.round((a.wind || 10) * 1.8), wind_direction_10m: a.dir == null ? 40 : a.dir,
      relative_humidity_2m: code >= 51 ? 88 : 64, precipitation: code >= 51 && code <= 67 ? 0.8 : 0 },
    hourly: H, daily: D,
  }, extra);
}

/* ---------------- generic places (no real personal data) ---------------- */
const P = {
  ev: { id: "pev", name: "Ev", sub: "Kadıköy, İstanbul", lat: 40.9890, lon: 29.0300 },
  okul: { id: "pokul", name: "Okul", sub: "Beşiktaş, İstanbul", lat: 41.0430, lon: 29.0070 },
  is: { id: "pis", name: "İş", sub: "Şişli, İstanbul", lat: 41.0600, lon: 28.9870 },
  ankara: { id: "pank", name: "Ankara", sub: "Çankaya, Ankara", lat: 39.9200, lon: 32.8540 }, // a trip destination for the packing list
};
const COLD_TRIP = (day, h) => { const s = fair(day, h); s.t -= 8; s.app = s.t - 2; if (day === 2 && h >= 10 && h <= 18) { s.code = 71; s.p = 70; } return s; };
const SEARCH_PLACES = [
  { name: "Kadıköy", key: "place", val: "town", state: "İstanbul", lat: 40.9903, lon: 29.0277 },
  { name: "Kadıköy İskelesi", key: "amenity", val: "ferry_terminal", district: "Rasimpaşa", city: "Kadıköy", state: "İstanbul", lat: 40.9925, lon: 29.0230 },
  { name: "Kadıköy Halk Kütüphanesi", key: "amenity", val: "library", district: "Osmanağa", city: "Kadıköy", state: "İstanbul", lat: 40.9897, lon: 29.0262 },
  { name: "Kadıköy Rıhtım", key: "highway", val: "bus_stop", district: "Caferağa", city: "Kadıköy", state: "İstanbul", lat: 40.9916, lon: 29.0245 },
  { name: "Kadıköy Belediyesi", key: "amenity", val: "townhall", district: "Hasanpaşa", city: "Kadıköy", state: "İstanbul", lat: 40.9870, lon: 29.0370 },
  { name: "Kadıköy Lisesi", key: "amenity", val: "school", district: "Caferağa", city: "Kadıköy", state: "İstanbul", lat: 40.9850, lon: 29.0300 },
  { name: "Kadıköy", key: "place", val: "village", city: "Gölcük", state: "Kocaeli", lat: 40.70, lon: 29.85 },
];
function baseState(o) {
  return Object.assign({
    places: [P.ev, P.okul, P.is], sel: P.ev.id, hours: 12, feel: "normal", act: "city",
    manual: { temp: 17, sky: "partly", wind: "breezy" }, mode: "live", live: null,
    routes: [], trips: [], dayMode: true, dayWx: null, choice: { date: "", picks: {} }, fix: null,
  }, o);
}
function liveFor(place, wx, now) { return { placeKey: place.id, place: { name: place.name, sub: place.sub, lat: place.lat, lon: place.lon }, wx, fetchedAt: now.getTime() - 6 * 60000 }; }

/* ---------------- scenes ---------------- */
// state(now) seeds localStorage; weather(day, hour) (or weatherAt(lat, lon) -> such a function) answers any forecast
// request that still reaches the network mock. requires(page) -> truthy or null: null skips the scene (and lists it);
// frame(page) scrolls/taps into position and may return a string to skip the shot with that reason.
const RAINY = (day, h) => {
  const t = [9, 9, 8.5, 8.5, 8, 8, 8.5, 9, 10, 10.5, 11, 11.5, 12, 12, 12, 11.5, 11, 10.5, 10, 10, 9.5, 9.5, 9, 9][h] + WEEK_SHIFT[day] * 0.3;
  const wet = day === 0 ? h >= 6 && h <= 21 : day === 1 && h <= 10;
  return { t, app: t - 2.5, code: wet ? (h >= 9 && h <= 13 ? 63 : 61) : 3, p: wet ? (h >= 9 && h <= 13 ? 90 : 75) : 30, wind: 22, dir: 225 };
};
const ROUTINE = (day, h) => {
  const s = fair(day, h);
  if (day === 0) { s.t -= 3; s.app = s.t - (h >= 17 || h < 8 ? 2.5 : 1.5); if (h >= 17 && h <= 21) { s.code = 61; s.p = 75; } else if (h === 16) s.p = 40; }
  return s;
};
const SCENES = [
  {
    name: "01-bugun", note: "today's suggestion (light)", time: "09:40", weather: fair,
    state: (now) => baseState({ live: liveFor(P.ev, makeWx(fair, now, P.ev.lat, P.ev.lon), now) }),
    frame: async (page) => { await page.evaluate(() => window.scrollTo(0, 0)); },
  },
  {
    name: "02-yagmur", note: "rainy day", time: "08:20", weather: RAINY,
    state: (now) => baseState({ sel: P.okul.id, hours: 6, live: liveFor(P.okul, makeWx(RAINY, now, P.okul.lat, P.okul.lon), now) }),
    frame: async (page) => { await page.evaluate(() => window.scrollTo(0, 0)); },
  },
  {
    name: "03-gunum", note: "Günüm routine card", time: "07:50", weather: ROUTINE,
    state: (now) => {
      const wxEv = makeWx(ROUTINE, now, P.ev.lat, P.ev.lon), wxOkul = makeWx((d, h) => { const s = ROUTINE(d, h); s.t -= 0.5; s.app -= 0.5; return s; }, now, P.okul.lat, P.okul.lon);
      const wk = [1, 2, 3, 4, 5];
      return baseState({
        live: liveFor(P.ev, wxEv, now), hours: 12,
        routes: [
          { id: "r1", from: P.ev.id, to: P.okul.id, name: "Vapur", steps: [{ m: "walk", min: 9, slope: "flat" }, { m: "wait", min: 4 }, { m: "ferry", min: 20, a: "Kadıköy", b: "Beşiktaş" }, { m: "walk", min: 7, slope: "up" }] },
          { id: "r2", from: P.ev.id, to: P.okul.id, name: "Otobüs", steps: [{ m: "walk", min: 4, slope: "flat" }, { m: "wait", min: 8 }, { m: "bus", min: 38 }, { m: "walk", min: 3, slope: "flat" }] },
          { id: "r3", from: P.okul.id, to: P.ev.id, name: "Vapur", steps: [{ m: "walk", min: 7, slope: "flat" }, { m: "wait", min: 6 }, { m: "ferry", min: 20, a: "Beşiktaş", b: "Kadıköy" }, { m: "walk", min: 9, slope: "flat" }] },
          { id: "r4", from: P.okul.id, to: P.ev.id, name: "Otobüs", steps: [{ m: "walk", min: 3, slope: "flat" }, { m: "wait", min: 5 }, { m: "bus", min: 40 }, { m: "walk", min: 4, slope: "flat" }] },
        ],
        trips: [
          { id: "t1", from: P.ev.id, to: P.okul.id, time: "08:30", days: wk },
          { id: "t2", from: P.okul.id, to: P.ev.id, time: "17:40", days: wk },
        ],
        dayWx: { fetchedAt: now.getTime() - 6 * 60000, byPlace: { [P.ev.id]: wxEv, [P.okul.id]: wxOkul } },
      });
    },
    frame: async (page) => scrollTo(page, "#tripCard", 12),
    requires: (page) => visible(page, "#tripCard"),
  },
  {
    name: "04-bilgi-karti", note: "sticker info card open", time: "09:40", weather: fair,
    state: (now) => baseState({ live: liveFor(P.ev, makeWx(fair, now, P.ev.lat, P.ev.lon), now) }),
    frame: async (page) => {
      await scrollTo(page, ".board", 70);
      const t = (await page.$('#take .mini[data-k^="t:"]')) || (await page.$('#wear .stk[data-k="w:0"]'));
      if (!t) return "no sticker to tap";
      await t.tap(); await sleep(300);
      if (!(await visible(page, "#tipCard"))) return "info card did not open";
      // keep the open card inside the screenshot
      const box = await (await page.$("#tipCard")).boundingBox();
      if (box && box.y + box.height > VIEW.height - 8) return "info card is cut off at the bottom";
    },
  },
  {
    name: "05-haftalik", note: "weekly view", time: "09:40", weather: fair,
    state: (now) => baseState({ live: liveFor(P.ev, makeWx(fair, now, P.ev.lat, P.ev.lon), now) }),
    requires: async (page) => (await visible(page, "#weekCard")) && (await page.$$eval("#week > *", (l) => l.length)) >= 3 ? true : null,
    frame: async (page) => scrollTo(page, "#weekCard", 12),
  },
  {
    name: "06-valiz", note: "packing list", time: "09:40", weather: fair,
    state: (now) => baseState({
      places: [P.ev, P.okul, P.is, P.ankara], live: liveFor(P.ev, makeWx(fair, now, P.ev.lat, P.ev.lon), now),
      dayWx: { fetchedAt: now.getTime() - 6 * 60000, byPlace: { [P.ankara.id]: makeWx(COLD_TRIP, now, P.ankara.lat, P.ankara.lon) } },
      pack: { place: P.ankara.id, days: 3, start: 1, ticks: {} },
    }),
    weatherAt: (lat) => (lat < 40.5 ? COLD_TRIP : fair),
    requires: (page) => packingButton(page),
    frame: async (page) => {
      const b = await packingButton(page); await b.scrollIntoViewIfNeeded(); await b.tap(); await sleep(700);
      // the list must really be there: an open sheet/dialog with several items, not just a button that did nothing
      const sheet = await page.$('#packSheet:not([hidden]), [role="dialog"]:not([hidden])');
      if (!sheet || !(await sheet.isVisible())) return "packing sheet did not open";
      const items = await sheet.$$eval("li, label, [role=checkbox], input[type=checkbox]", (l) => l.length);
      if (items < 3) return "packing list is empty (not finished yet?)";
    },
  },
  {
    name: "07-gece", note: "night / dark mode", time: "21:10", colorScheme: "dark", weather: fair,
    state: (now) => baseState({ hours: 6, live: liveFor(P.ev, makeWx(fair, now, P.ev.lat, P.ev.lon), now) }),
    frame: async (page) => { await page.evaluate(() => window.scrollTo(0, 0)); },
  },
  {
    name: "08-yer-arama", note: "place search", time: "09:40", weather: fair,
    state: (now) => baseState({ live: liveFor(P.ev, makeWx(fair, now, P.ev.lat, P.ev.lon), now) }),
    frame: async (page) => {
      await page.tap("#placeBtn"); await sleep(150);
      const add = await page.$("#addPlaceChip"); if (!add) return "no “+ Yer ekle” chip";
      await add.tap(); await page.waitForSelector("#q", { state: "visible", timeout: 3000 });
      await page.type("#q", "kadık", { delay: 40 });
      try { await page.waitForSelector("#results button", { timeout: 4000 }); } catch (e) { return "no search results (search API changed? adapt apiMock)"; }
      await sleep(250); await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => { const q = document.getElementById("q"); if (q) q.blur(); }); // no text caret in the shot
    },
  },
];

/* ---------------- helpers ---------------- */
async function visible(page, sel) { const h = await page.$(sel); return h && (await h.isVisible()) ? h : null; }
async function scrollTo(page, sel, gap) {
  await page.evaluate(([s, g]) => { const el = document.querySelector(s); if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - g)); }, [sel, gap]);
  await sleep(120);
}
async function packingButton(page) {
  for (const sel of ["[data-packing]", "#packBtn", "#packingBtn", "#valizBtn"]) { const h = await visible(page, sel); if (h) return h; }
  for (const h of await page.$$("button, [role=button], summary")) {
    const t = ((await h.textContent()) || "").trim();
    if (/valiz|bavul|paketle|packing|pack list/i.test(t) && (await h.isVisible())) return h;
  }
  return null;
}
function pngInfo(file) { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colorType: b[25] }; }
function playCheck(i) {
  const lo = Math.min(i.w, i.h), hi = Math.max(i.w, i.h), problems = [];
  if (lo < 320 || hi > 3840) problems.push("side outside 320–3840 px");
  if (hi > 2 * lo) problems.push("long side more than 2× short side");
  if (!(i.depth === 8 && i.colorType === 2)) problems.push("not a 24-bit RGB PNG (has alpha or palette)");
  const promo = lo >= 1080 && Math.abs(hi / lo - 16 / 9) < 0.01;
  return { ok: !problems.length, problems, promo };
}

/* ---------------- static server + network mock ---------------- */
function serve(dir) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css", ".woff2": "font/woff2" };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
    const f = path.join(dir, path.normalize(p));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ url: `http://localhost:${srv.address().port}/`, close: () => srv.close() })));
}
const RANGE = {
  "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
};
// The page loads its own fonts (web/fonts); these serve any request that still goes to Google Fonts (SIL OFL 1.1).
const FONT_FILES = [
  { fam: "Instrument Serif", style: "normal", weight: "400", file: "InstrumentSerif-Regular.ttf" },
  { fam: "Instrument Serif", style: "italic", weight: "400", file: "InstrumentSerif-Italic.ttf" },
  { fam: "Figtree", style: "normal", weight: "300 900", file: "figtree-latin-ext-wght-normal.woff2", range: RANGE["latin-ext"] },
  { fam: "Figtree", style: "normal", weight: "300 900", file: "figtree-latin-wght-normal.woff2", range: RANGE.latin },
];
function fontCSS(base) {
  return FONT_FILES.map((f) => `@font-face{font-family:"${f.fam}";font-style:${f.style};font-weight:${f.weight};font-display:block;` +
    `src:url(${base}__fonts/${f.file}) format("${f.file.endsWith(".ttf") ? "truetype" : "woff2"}")${f.range ? ";unicode-range:" + f.range : ""};}\n`).join("");
}
function fold(s) { return String(s || "").toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u").trim(); }
function searchHits(q) { const f = fold(q); return SEARCH_PLACES.filter((p) => fold([p.name, p.district, p.city, p.state].join(" ")).split(/\s+/).some((w) => w.startsWith(f.split(" ")[0]))); }
function photon(q) {
  return { type: "FeatureCollection", features: searchHits(q).map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    properties: { name: p.name, district: p.district, city: p.city, state: p.state, country: "Türkiye", countrycode: "TR", osm_key: p.key, osm_value: p.val } })) };
}
async function route(scene, now, base, log, r) {
  const req = r.request(), url = req.url(), u = new URL(url);
  const json = (body) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  const wxFor = (lat, lon) => makeWx(scene.weatherAt ? scene.weatherAt(lat, lon) : scene.weather || fair, now, lat, lon);
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
    if (u.pathname.startsWith("/__fonts/")) {
      const f = path.join(FONTS, path.basename(u.pathname));
      return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: f.endsWith(".ttf") ? "font/ttf" : "font/woff2", body: fs.readFileSync(f) }) : r.abort();
    }
    if (u.pathname.startsWith("/api/")) {
      // The app's own Cloudflare Pages Functions (web/functions/api): forecast is Open-Meteo-shaped, search passes Photon
      // GeoJSON through, reverse and ip answer in BigDataCloud field names. Adapt here if those formats change.
      log.push("api " + u.pathname);
      const name = u.pathname.replace(/\/+$/, "").split("/").pop();
      if (name === "forecast") {
        const la = (u.searchParams.get("latitude") || "").split(",").map(Number), lo = (u.searchParams.get("longitude") || "").split(",").map(Number);
        const arr = la.map((x, i) => wxFor(x, lo[i]));
        return json(arr.length > 1 ? arr : arr[0]);
      }
      if (name === "search") return json(photon(u.searchParams.get("q") || ""));
      if (name === "reverse") return json({ locality: "Kadıköy", city: "İstanbul", principalSubdivision: "İstanbul" });
      if (name === "ip") return json({ latitude: 41.0082, longitude: 28.9784, city: "İstanbul", locality: "İstanbul", principalSubdivision: "İstanbul", countryCode: "TR" });
      return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "mock: unknown api " + name }) });
    }
    return r.continue();
  }
  if (u.hostname === "fonts.googleapis.com") return r.fulfill({ status: 200, contentType: "text/css", body: fontCSS(base) });
  if (u.hostname === "api.open-meteo.com") {
    const la = (u.searchParams.get("latitude") || "").split(",").map(Number), lo = (u.searchParams.get("longitude") || "").split(",").map(Number);
    const arr = la.map((x, i) => wxFor(x, lo[i])); log.push("forecast ×" + arr.length);
    return json(arr.length > 1 ? arr : arr[0]);
  }
  if (u.hostname === "photon.komoot.io") return json(photon(u.searchParams.get("q") || ""));
  if (u.hostname === "geocoding-api.open-meteo.com") return json({ generationtime_ms: 0.1 });
  if (u.hostname === "api.bigdatacloud.net") return json(u.searchParams.has("latitude") ? { locality: "Kadıköy", city: "İstanbul", principalSubdivision: "İstanbul" } : { city: "İstanbul", latitude: 41.0082, longitude: 28.9784 });
  log.push("blocked " + u.hostname); // ads, analytics and anything else: never leaves the machine
  return r.abort("blockedbyclient");
}

/* ---------------- run ---------------- */
async function shoot(browser, srv, scene, lang) {
  const now = at(scene.time);
  const state = scene.state(now);
  if (lang.seed) lang.seed(state);
  const context = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: lang.locale, timezoneId: "Europe/Istanbul",
    colorScheme: scene.colorScheme || "light", reducedMotion: "reduce", serviceWorkers: "block",
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  });
  await context.clock.setFixedTime(now);
  const log = [];
  await context.route("**/*", (r) => route(scene, now, srv.url, log, r));
  // As published: the app talks to its own server (web/functions/api), so credits read "MET Norway".
  await context.addInitScript((origin) => { window.NG_API = origin; }, new URL(srv.url).origin);
  await context.addInitScript(([k, v]) => {
    try { if (!sessionStorage.getItem("__seeded")) { sessionStorage.setItem("__seeded", "1"); localStorage.clear(); localStorage.setItem(k, v); } } catch (e) {}
  }, [KEY, JSON.stringify(state)]);
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e && e.message || e)));
  try {
    await page.goto(srv.url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await sleep(700);
    if (scene.requires && !(await scene.requires(page))) return { skipped: "element not in the app yet" };
    const why = scene.frame ? await scene.frame(page) : null;
    if (typeof why === "string") return { skipped: why };
    await sleep(300);
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, scene.name + ".png");
    await page.screenshot({ path: file });
    const status = await page.$eval("#status", (e) => e.textContent.trim()).catch(() => "");
    return { file, errors, status, log };
  } finally { await context.close(); }
}

(async () => {
  const only = process.argv.slice(2);
  const lang = LANGS[LANG];
  const scenes = SCENES.filter((s) => !only.length || only.includes(s.name));
  if (!lang) {
    console.log(`SKIP all: no ${LANG} UI yet — fill in LANGS.${LANG} (TODO) when the language switch exists.`);
    return;
  }
  const srv = await serve(WEB);
  const browser = await chromium.launch();
  const done = [], skipped = [];
  try {
    for (const s of scenes) {
      const r = await shoot(browser, srv, s, lang);
      if (r.skipped) { skipped.push(`${s.name} (${s.note}): ${r.skipped}`); console.log(`SKIP ${s.name} — ${r.skipped}`); continue; }
      const i = pngInfo(r.file), c = playCheck(i);
      done.push(s.name);
      console.log(`OK   ${s.name}  ${i.w}×${i.h}  ${c.ok ? "Play: ok" : "Play: " + c.problems.join(", ")}${c.promo ? ", 9:16 ≥1080 (promo-ready)" : ""}` +
        (r.status ? `  status: “${r.status}”` : "") + (r.errors.length ? `  PAGE ERRORS: ${r.errors.join(" | ")}` : ""));
      const blocked = r.log.filter((x) => x.startsWith("blocked") || x.startsWith("api") || x.startsWith("forecast"));
      if (blocked.length) console.log("     network: " + [...new Set(blocked)].join(", "));
    }
  } finally { await browser.close(); srv.close(); }
  console.log(`\n${done.length} screenshot(s) in ${path.relative(ROOT, OUT) || OUT}` + (skipped.length ? `\nSkipped:\n  - ${skipped.join("\n  - ")}` : ""));
})().catch((e) => { console.error(e); process.exit(1); });
