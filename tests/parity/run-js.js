// Mirrors render(): live input, day plan when it leads, then plan(); writes the widget-relevant fields per case.
// The case's language goes into S (the page's setting) and into the prefs given to plan(), like prefs() on the page.
const fs = require("fs");
const E = require("./js-engine.js").load(process.argv[4] || require("path").join(__dirname, "..", "..", "web", "index.html"));
const cases = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const now = Date.now(), res = [];
// The widget's "next trip" line (Day.kt → Result.next), from the page's own day plan and words.
function nextLine(day, S) {
  if (!day || day.none || !day.items || !day.items.length) return undefined;
  const it = day.items[0], name = (id) => { const p = S.places.find((q) => q.id === id); return p ? E.nm(p.name) : ""; };
  let s = (day.offset ? day.dayName + " " : "") + it.trip.time + " " + name(it.trip.from) + " → " + name(it.trip.to);
  if (it.chosen) s += " · " + it.chosen.route.name + " · " + E.tx("dışarıda {0} dk", it.chosen.ex.outMin);
  return s;
}
for (const c of cases) {
  const r = { id: c.id };
  try {
    const lang = c.lang || "tr";
    const rt = c.routine || { dayMode: true, places: [], routes: [], trips: [] };
    const ids = [];
    (rt.trips || []).forEach(t => [t.from, t.to].forEach(id => { if (ids.indexOf(id) < 0 && (rt.places || []).some(p => p.id === id)) ids.push(id); }));
    const byPlace = {};
    ids.forEach(id => { if (c.byPlace && c.byPlace[id] && c.byPlace[id].hourly) byPlace[id] = c.byPlace[id]; });
    const S = { lang, places: rt.places || [], sel: "auto", hours: c.hours, feel: c.feel, act: c.act, manual: { temp: 17, sky: "partly", wind: "breezy" }, mode: "live",
      live: { placeKey: "auto", place: { name: "X", lat: 41, lon: 29 }, wx: c.wx, fetchedAt: now - (c.agoMin || 0) * 60000 },
      routes: rt.routes || [], trips: rt.trips || [], dayMode: rt.dayMode !== false, dayWx: ids.length ? { fetchedAt: now, byPlace } : null,
      choice: c.choice || { date: "", picks: {} }, fix: null };
    E.setS(S);
    const inp = E.liveInput();
    if (!inp) { r.err = "noinput"; } else {
      const day = E.dayPlan(), useDay = !!(day && day.inp && day.lead);
      const p = E.plan(useDay ? day.inp : inp, { feel: S.feel, act: S.act, who: c.who || "me", missing: c.missing || [], lang });
      r.useDay = useDay; r.level = p.L; r.head = p.head;
      r.wear = p.wear.map(w => w.g + ":" + w.label); r.take = p.take.map(w => w.g + ":" + w.label); r.pills = p.pills;
      r.E = Math.round(p.E * 1000) / 1000;
      if (day) { r.dayOffset = day.offset; r.lead = !!day.lead; r.dayItems = day.items.length; }
      // Only when the widget gets a routine (Updater: dayMode on and trips; the page has no day plan otherwise either)
      if (c.routine && rt.dayMode !== false && (rt.trips || []).length) r.next = nextLine(day, S);
    }
  } catch (e) { r.err = "EXC " + e.message; }
  // Severe-weather warnings (the widget's strip and the notification): kinds, hours, peaks and their words, on the case's clock.
  try {
    r.alerts = E.severe(c.wx, c.at).map(a => { const f = E.severeInfo(c.wx, a, c.at);
      return [a.k, a.lv, a.from, a.to, a.peak, f.title, f.level, f.when, f.tips.join(" | ")].join(" ~ "); });
  } catch (e) { r.alerts = "EXC " + e.message; }
  res.push(r);
}
fs.writeFileSync(process.argv[3], JSON.stringify(res));
