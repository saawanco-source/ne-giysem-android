// The outfit engine on its own (loaded from index.html, no browser): findings of the second beta test (Oct 2026).
// Each check states the expected behaviour; exit code = number of failures.
const path = require("path");
const E = require("../parity/js-engine.js").load(path.join(__dirname, "..", "..", "web", "index.html"));
const { fc } = require("../web/lib.js");

const NOW = Date.now();
const keyOf = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 13);
// A forecast at feels-like t; edit(h, i) changes the hourly arrays from the current hour i on.
function wx(t, edit) {
  const w = fc(t), h = w.hourly, i = h.time.findIndex((x) => x.slice(0, 13) === keyOf(NOW));
  h.precipitation = h.time.map(() => 0); h.wind_gusts_10m = h.time.map(() => 12);
  if (edit) edit(h, i, w);
  return w;
}
function state(w, extra) {
  return Object.assign({ lang: "tr", places: [], sel: "auto", hours: 12, feel: "normal", act: "city", mode: "live",
    manual: { temp: 17, sky: "partly", wind: "breezy" }, live: { placeKey: "auto", place: { name: "X", lat: 41, lon: 29 }, wx: w, fetchedAt: NOW },
    routes: [], trips: [], dayMode: false, dayWx: null, choice: { date: "", picks: {} }, fix: null }, extra || {});
}
function run(w, prefs, extra) {
  E.setS(state(w, extra));
  const day = E.dayPlan(), useDay = !!(day && day.inp && day.lead);
  const p = E.plan(useDay ? day.inp : E.liveInput(), Object.assign({ feel: "normal", act: "city", who: "me", missing: [], lang: "tr" }, prefs || {}));
  return { head: p.head, wear: p.wear.map((x) => x.label), take: p.take.map((x) => x.label), pills: p.pills, E: p.E, off: p.off, useDay };
}
const storm = (h, i, w) => { for (let k = 0; k < 14; k++) { h.wind_speed_10m[i + k] = 60; h.wind_gusts_10m[i + k] = 110; } Object.assign(w.current, { wind_speed_10m: 60, wind_gusts_10m: 110 }); };

let fails = 0;
function check(name, r, ok) { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n     got: " + JSON.stringify(r))); }

// Storm (gusts 110) with a coat already on, in the heat, and for sport: the headline speaks of the wind.
let r = run(wx(10, storm));
check("storm, coat on (10°): the headline is about the wind", r, /Rüzgâr çok sert: \{/.test(r.head));
r = run(wx(31, storm));
check("storm in the heat (31°): stay out as little as you can", r, /dışarıda az kal/.test(r.head));
r = run(wx(14, storm), { act: "sport" });
check("storm, sport: a windbreaker is worn", r, r.wear.includes("Rüzgârlık") && /Rüzgâr çok sert/.test(r.head));

// The day plan: a 30-minute walk in a storm counts the gusts as forecast (not reduced for the street).
const now = new Date(NOW + 20 * 60000), hh = String(now.getHours()).padStart(2, "0"), mm = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, "0");
const PL = [{ id: "P1", name: "Ev", lat: 41.0, lon: 28.7 }, { id: "P2", name: "Okul", lat: 41.17, lon: 28.99 }];
const walk = { id: "R1", from: "P1", to: "P2", name: "Yürüyüş", steps: [{ m: "walk", min: 30, slope: "flat" }] };
const dayState = (w) => ({ places: PL, routes: [walk], trips: [{ id: "T1", from: "P1", to: "P2", time: hh + ":" + mm, days: [now.getDay()] }],
  dayMode: true, dayWx: { fetchedAt: NOW, byPlace: { P1: w, P2: w } } });
const sw = wx(20, storm);
r = run(sw, {}, dayState(sw));
check("day plan: walking in a storm → windproof layer worn", r, r.useDay && r.wear.some((x) => ["Rüzgârlık", "İnce ceket", "Mont"].includes(x)) && /Rüzgâr çok sert/.test(r.head));

// Wardrobe: no kaban → the evening coat to take along is the mont, not a sweater.
const drop = (from, to) => wx(from, (h, i) => { for (let k = 0; k <= 12; k++) { const v = from + (to - from) * Math.min(1, k / 10); h.apparent_temperature[i + k] = v; h.temperature_2m[i + k] = v; } });
r = run(drop(14, 2), { missing: ["kaban"] });
check("no kaban: a coat the person has is carried for the cold evening", r, r.take.some((x) => ["Mont", "Şişme mont", "Parka"].includes(x)));
// Freezing later: gloves come along.
r = run(drop(12, -2));
check("12° → −2°: gloves to take along", r, r.take.includes("Eldiven"));
// Older people: no milder "sana göre" in the heat.
r = run(wx(36), { who: "elder" });
check("elder at 36°: no milder \"sana göre\" in the heat", r, r.off === 0);
// A day of heavy rain: no sunglasses.
r = run(wx(30, (h, i) => { for (let k = 0; k < 12; k++) if (k !== 3) { h.precipitation[i + k] = 4; h.weather_code[i + k] = 63; h.precipitation_probability[i + k] = 90; } }), {}, {});
check("heavy rain day: no sunglasses", r, !r.take.includes("Güneş gözlüğü"));

// Long steady rain: 2.5 mm an hour for a day is a warning, and its card gives the total.
const long = wx(14, (h, i) => { for (let k = 0; k < 24; k++) { h.precipitation[i + k] = 2.5; h.weather_code[i + k] = 63; h.precipitation_probability[i + k] = 90; } });
const al = E.severe(long, NOW).filter((a) => a.k === "rain")[0];
const info = al && E.severeInfo(long, al, NOW);
check("24 h of 2.5 mm/h: heavy-rain warning with the total", { al, when: info && info.when }, !!al && /toplam \d+ mm/.test(info.when));

console.log(fails ? fails + " failed" : "all engine checks pass");
process.exit(fails);
