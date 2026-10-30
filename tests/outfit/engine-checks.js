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
  return { head: p.head, wear: p.wear.map((x) => x.label), take: p.take.map((x) => x.label), pills: p.pills, notes: p.notes, E: p.E, off: p.off, useDay };
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

// ---------- Autumn beta (Istanbul, late Oct–Nov 2026) ----------
// A trip [min] minutes from now, on the clock the day plan reads (5-minute steps).
const at = (min) => { const d = new Date(NOW + min * 60000); return String(d.getHours()).padStart(2, "0") + ":" + String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, "0"); };
const dow = (min) => new Date(NOW + min * 60000).getDay();
const commute = { id: "R2", from: "P1", to: "P2", name: "Metrobüs", steps: [{ m: "walk", min: 8, slope: "flat" }, { m: "wait", min: 5 }, { m: "metrobus", min: 30 }, { m: "walk", min: 6, slope: "flat" }] };
const back = { id: "R3", from: "P2", to: "P1", name: "Dönüş", steps: [{ m: "walk", min: 10, slope: "flat" }] };
const routine = (w, trips, routes) => ({ places: PL, routes, trips, dayMode: true, dayWx: { fetchedAt: NOW, byPlace: { P1: w, P2: w } } });
const flat = (t, more) => wx(t, (h, i, w) => { for (let k = 0; k < h.time.length; k++) { h.apparent_temperature[k] = t; h.temperature_2m[k] = t + 1; } if (more) more(h, i, w); });

// The commuter at the bus stop: the outfit is for the coldest moment of the first trip, not the warm walk to the stop.
let cw = flat(11);
r = run(cw, {}, routine(cw, [{ id: "T1", from: "P1", to: "P2", time: at(20), days: [dow(20)] }], [commute]));
check("day plan: no coat 'for the morning' when the stop is the coldest moment", r, r.useDay && !/yanına al|serinliyor|soğuyor/.test(r.head) && !r.take.some((x) => ["Mont", "Ceket", "Kaban", "İnce ceket"].includes(x)));
// A warmer trip back in the evening isn't "it warms up, pick a layer you can take off".
cw = wx(8, (h, i) => { for (let k = 0; k < h.time.length; k++) { const v = k - i <= 3 ? 8 : 16; h.apparent_temperature[k] = v; h.temperature_2m[k] = v + 1; } });
r = run(cw, {}, routine(cw, [{ id: "T1", from: "P1", to: "P2", time: at(20), days: [dow(20)] }, { id: "T2", from: "P2", to: "P1", time: at(480), days: [dow(480)] }], [commute, back]));
check("day plan: no 'ısınıyor' pill or note for a warmer trip back", r, !r.pills.some((x) => /1[6-9]°/.test(x)) && !(r.notes || []).some((x) => /ısınıyor/.test(x)));
// The wind keeps its name in the day plan (lodos from the south-west).
cw = flat(14, (h) => { for (let k = 0; k < h.time.length; k++) { h.wind_speed_10m[k] = 35; h.wind_direction_10m[k] = 225; } });
r = run(cw, {}, routine(cw, [{ id: "T1", from: "P1", to: "P2", time: at(20), days: [dow(20)] }], [commute]));
check("day plan: the wind's name (Lodos), not just 'Rüzgâr'", r, r.useDay && r.pills.some((x) => /^Lodos 35 km\/sa/.test(x)));

// Warning cards: separate episodes stay separate; one hour of fog is no warning.
const ep = wx(14, (h, i) => {
  [4, 5, 6, 18, 19, 20].forEach((k) => { h.weather_code[i + k] = 45; });
  [2, 9].forEach((k) => { h.precipitation[i + k] = 16; h.weather_code[i + k] = 82; h.precipitation_probability[i + k] = 90; });
});
const eps = E.severe(ep, NOW), fog = eps.filter((a) => a.k === "fog")[0], rn = eps.filter((a) => a.k === "rain")[0];
const i0 = ep.hourly.time.findIndex((x) => x.slice(0, 13) === keyOf(NOW));
check("warnings: morning fog and the next night's are two episodes (the first shown)", fog, fog && fog.from === ep.hourly.time[i0 + 4].slice(0, 16) && fog.to === ep.hourly.time[i0 + 6].slice(0, 16));
check("warnings: two separate 16 mm showers aren't one 7-hour warning", rn, rn && rn.lv === 2 && rn.from === rn.to);
const one = wx(14, (h, i) => { h.weather_code[i + 5] = 45; });
check("warnings: one hour of fog is no warning", E.severe(one, NOW), !E.severe(one, NOW).some((a) => a.k === "fog"));
const gaps = wx(14, (h, i) => { h.weather_code[i + 5] = 45; h.weather_code[i + 7] = 45; });
check("warnings: two separate hours of fog are no warning", E.severe(gaps, NOW), !E.severe(gaps, NOW).some((a) => a.k === "fog"));
const lastHour = wx(14, (h, i) => { h.weather_code[i - 1] = 45; h.weather_code[i] = 48; });
check("warnings: fog in its last hour (it began an hour ago) is still shown", E.severe(lastHour, NOW), E.severe(lastHour, NOW).some((a) => a.k === "fog"));
// A storm blowing now (Dikkat) and a worse one tonight (Tehlikeli): both cards, the worse first.
const twoStorms = wx(14, (h, i) => { for (let k = 0; k <= 2; k++) h.wind_gusts_10m[i + k] = 75; for (let k = 10; k <= 11; k++) h.wind_gusts_10m[i + k] = 100; });
const st2 = E.severe(twoStorms, NOW).filter((a) => a.k === "storm");
check("warnings: the storm under way now isn't hidden by tonight's worse one", st2, st2.length === 2 && st2[0].lv === 2 && st2[1].lv === 1 && st2[1].from < st2[0].from);

// Field work in the rain: rain gear with a hood, never an umbrella.
const wetDay = (mm, code) => wx(12, (h, i) => { for (let k = 0; k < 12; k++) { h.precipitation[i + k] = mm; h.weather_code[i + k] = code; h.precipitation_probability[i + k] = 85; } });
for (const [name, w] of [["1.5 mm/h", wetDay(1.5, 61)], ["4 mm/h front", wetDay(4, 63)], ["drizzle", wetDay(0.2, 51)], ["30% chance", wx(12, (h, i) => { for (let k = 0; k < 12; k++) h.precipitation_probability[i + k] = 35; })]]) {
  r = run(w, { act: "field" });
  check("field, " + name + ": no umbrella", r, !r.take.some((x) => /Şemsiye/.test(x)) && (name === "drizzle" || name === "30% chance" || /^Arazide yağmur: /.test(r.head)));
}
r = run(wetDay(1.5, 61));
check("city, 1.5 mm/h: the umbrella stays", r, r.take.some((x) => /Şemsiye/.test(x)));
r = run(wetDay(1.5, 61), { act: "field", lang: "en" });
check("field (English): the hood headline is translated", r, /^Rain in the field: /.test(r.head));

// Fog all day: no sunglasses.
r = run(flat(17, (h, i) => { for (let k = 0; k < h.time.length; k++) h.weather_code[k] = 45; }));
check("fog all day: no sunglasses", r, !r.take.includes("Güneş gözlüğü"));

// A storm while exercising: shorten it; no umbrella-or-hood tip for a runner, nor in the field.
r = run(wx(14, storm), { act: "sport" });
check("storm, sport: keep it short or move it", r, (r.notes || []).some((x) => /sporu kısa tut/.test(x)) && !(r.notes || []).some((x) => /şemsiye yerine kapüşon/.test(x)));
// Poyraz drizzle with a kaban (seldom hooded): a beanie does as well.
r = run(flat(3, (h, i) => { for (let k = 0; k < 14; k++) { h.precipitation[i + k] = 0.2; h.weather_code[i + k] = 51; h.precipitation_probability[i + k] = 70; h.wind_speed_10m[i + k] = 35; h.wind_direction_10m[i + k] = 45; } }));
check("poyraz drizzle: 'bere ya da kapüşon' when the outfit has a kaban or beanie", r,
  (r.notes || []).some((x) => /^Hafif çiseleme; (bere ya da )?kapüşon yeter\.$/.test(x)) && (!(r.wear.includes("Kaban") || r.wear.includes("Bere") || r.take.includes("Bere")) || r.notes.some((x) => /bere ya da kapüşon/.test(x))));

console.log(fails ? fails + " failed" : "all engine checks pass");
process.exit(fails);
