// Generates a seeded grid of Open-Meteo-shaped forecasts + preferences + routines, relative to the current time.
// usage: node gen.js out.json N seed
const fs = require("fs");
const N = +(process.argv[3] || 3000), seed0 = +(process.argv[4] || 1);
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = mulberry32(seed0);
const U = (a, b) => a + (b - a) * R(), I = (a, b) => Math.floor(U(a, b + 1)), P = arr => arr[Math.floor(R() * arr.length)], C = p => R() < p;
const r1 = v => Math.round(v * 10) / 10;
const NOW = Date.now();

function genWx(opts) {
  const off = opts.offset, days = opts.days || 8;
  const placeNow = NOW + off * 1000, mid = Math.floor(placeNow / 864e5) * 864e5;
  const base = opts.base != null ? opts.base : U(-15, 35), amp = U(0, 8), trend = U(-6, 6), regime = P(["dry", "dry", "maybe", "wet", "wet"]), windR = P(["calm", "breezy", "windy"]);
  const H = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], weather_code: [], wind_speed_10m: [], wind_direction_10m: [], is_day: [] };
  for (let h = 0; h < days * 24; h++) {
    const hod = h % 24;
    const app = r1(base + amp * Math.cos(2 * Math.PI * (hod - 15) / 24) + trend * h / 24 + U(-1, 1));
    const t = r1(app + U(0, 3));
    let p, code;
    if (regime === "dry") { p = I(0, 20); code = C(0.05) ? P([45, 48]) : P([0, 1, 2, 3]); }
    else if (regime === "maybe") { p = I(15, 50); code = C(0.15) ? P([51, 61, 80]) : P([2, 3]); }
    else { p = I(35, 100); code = C(0.7) ? (app < 1 ? P([71, 73, 75, 77, 85, 86]) : P([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 56, 66])) : P([3, 45]); }
    const wind = r1(windR === "calm" ? U(0, 15) : windR === "breezy" ? U(10, 27) : U(22, 55));
    H.time.push(new Date(mid + h * 36e5).toISOString().slice(0, 16));
    H.temperature_2m.push(t); H.apparent_temperature.push(app); H.precipitation_probability.push(p); H.weather_code.push(code);
    H.wind_speed_10m.push(wind); H.wind_direction_10m.push(I(0, 359)); H.is_day.push(hod >= 7 && hod <= 18 ? 1 : 0);
  }
  const ci = Math.floor((placeNow - mid) / 36e5);
  const cur = { time: new Date(mid + ci * 36e5).toISOString().slice(0, 16), interval: 900,
    temperature_2m: r1(H.temperature_2m[ci] + U(-1, 1)), apparent_temperature: r1(H.apparent_temperature[ci] + U(-1.5, 1.5)),
    relative_humidity_2m: I(20, 100), precipitation: C(regime === "wet" ? 0.5 : 0.05) ? r1(U(0, 2)) : 0,
    weather_code: C(0.1) ? P([0, 3, 61, 63, 73, 95]) : H.weather_code[ci], wind_speed_10m: r1(H.wind_speed_10m[ci] + U(-3, 3)),
    wind_gusts_10m: r1(H.wind_speed_10m[ci] * U(1.2, 2.2)), wind_direction_10m: C(0.1) ? null : I(0, 359), is_day: H.is_day[ci] };
  const D = { time: [], uv_index_max: [], sunset: [] };
  for (let d = 0; d < days; d++) { const ds = new Date(mid + d * 864e5).toISOString().slice(0, 10); D.time.push(ds); D.uv_index_max.push(C(0.05) ? null : r1(U(0, 9.5))); D.sunset.push(ds + "T18:10"); }
  const wx = { latitude: 41, longitude: 29, generationtime_ms: 0.1, utc_offset_seconds: off, timezone: "X", timezone_abbreviation: "X", elevation: 10,
    current: cur, hourly: H, daily: D };
  // Edge shapes: nulls in hourly arrays, no current block, no daily block, short arrays.
  if (opts.edge) {
    const e = opts.edge;
    if (e.includes("nullApp")) for (let k = 0; k < 6; k++) H.apparent_temperature[ci + I(0, 12)] = null;
    if (e.includes("nullProb")) for (let k = 0; k < 6; k++) H.precipitation_probability[ci + I(0, 12)] = null;
    if (e.includes("nullWind")) for (let k = 0; k < 6; k++) H.wind_speed_10m[ci + I(0, 12)] = null;
    if (e.includes("noCurrent")) delete wx.current;
    if (e.includes("noDaily")) delete wx.daily;
    if (e.includes("noProbArr")) delete H.precipitation_probability;
    if (e.includes("shortApp")) H.apparent_temperature = H.apparent_temperature.slice(0, ci + 2);
    if (e.includes("curNullApp") && wx.current) wx.current.apparent_temperature = null;
    if (e.includes("noIsDay")) delete H.is_day;
  }
  return wx;
}

const pad = n => ("0" + n).slice(-2);
function genRoutine() {
  const places = [{ id: "P1", name: "Ev", lat: 41.0, lon: 28.7 }, { id: "P2", name: "Okul", lat: 41.17, lon: 28.99 }];
  if (C(0.5)) places.push({ id: "P3", name: "Spor salonu", lat: 41.05, lon: 29.0 });
  const ids = places.map(p => p.id).concat(C(0.05) ? ["P9"] : []);
  const trips = [], routes = [];
  const nT = I(1, 3), today = new Date().getDay();
  for (let k = 0; k < nT; k++) {
    let from = P(ids), to = P(ids); if (to === from) to = ids[(ids.indexOf(from) + 1) % ids.length];
    let time;
    if (C(0.6)) { const d = new Date(NOW + I(-300, 900) * 60000); time = pad(d.getHours()) + ":" + pad(Math.floor(d.getMinutes() / 5) * 5); }
    else time = P(["07:30", "08:00", "12:15", "17:30", "22:45", "00:05"]);
    const dk = R();
    const days = dk < 0.25 ? [0, 1, 2, 3, 4, 5, 6] : dk < 0.45 ? [today] : dk < 0.6 ? [(today + 1) % 7] : dk < 0.65 ? [] : dk < 0.75 ? [(today + I(2, 6)) % 7] : [1, 2, 3, 4, 5].filter(() => C(0.7));
    trips.push({ id: "T" + k, from, to, time, days });
    if (!routes.some(r => r.from === from && r.to === to)) {
      const nR = C(0.1) ? 0 : I(1, 3);
      for (let q = 0; q < nR; q++) {
        const steps = [];
        const nS = C(0.05) ? 0 : I(1, 5);
        for (let s = 0; s < nS; s++) { const m = P(["walk", "walk", "wait", "bus", "metrobus", "metro", "ferry", "car", "marmaray", "tram"]); const st = { m, min: I(1, 40) }; if (m === "walk") st.slope = P(["flat", "up", "steep"]); steps.push(st); }
        routes.push({ id: "R" + k + "_" + q, from, to, name: "Rota " + (q + 1), steps });
      }
    }
  }
  return { dayMode: !C(0.05), places, routes, trips };
}

const EDGES = ["nullApp", "nullProb", "nullWind", "noCurrent", "noDaily", "noProbArr", "shortApp", "curNullApp", "noIsDay"];
const cases = [];
for (let i = 0; i < N; i++) {
  const offset = C(0.85) ? 10800 : P([0, 3600, 19800, -18000, 32400]);
  const edge = C(0.08) ? [P(EDGES)] : null;
  const c = { id: "c" + i, hours: P([3, 6, 12]), feel: P(["cold", "normal", "warm"]), act: P(["city", "field", "sport"]), agoMin: C(0.8) ? 0 : P([30, 50, 120]),
    wx: genWx({ offset, edge, days: 8 }) };
  if (edge) c.edge = edge[0];
  if (C(0.45)) {
    c.routine = genRoutine();
    c.byPlace = {};
    c.routine.places.forEach(p => { c.byPlace[p.id] = genWx({ offset, days: 8, base: c.wx.hourly.apparent_temperature[0] + U(-4, 4) }); });
  }
  cases.push(c);
}
fs.writeFileSync(process.argv[2], JSON.stringify(cases));
console.log("cases", cases.length, "routine", cases.filter(c => c.routine).length, "edge", cases.filter(c => c.edge).length);
