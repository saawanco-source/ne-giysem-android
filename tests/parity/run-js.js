// Mirrors render(): live input, day plan when it leads, then plan(); writes the widget-relevant fields per case.
const fs = require("fs");
const E = require("./js-engine.js").load(process.argv[4] || require("path").join(__dirname, "..", "..", "web", "index.html"));
const cases = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const now = Date.now(), res = [];
for (const c of cases) {
  const r = { id: c.id };
  try {
    const rt = c.routine || { dayMode: true, places: [], routes: [], trips: [] };
    const ids = [];
    (rt.trips || []).forEach(t => [t.from, t.to].forEach(id => { if (ids.indexOf(id) < 0 && (rt.places || []).some(p => p.id === id)) ids.push(id); }));
    const byPlace = {};
    ids.forEach(id => { if (c.byPlace && c.byPlace[id] && c.byPlace[id].hourly) byPlace[id] = c.byPlace[id]; });
    const S = { places: rt.places || [], sel: "auto", hours: c.hours, feel: c.feel, act: c.act, manual: { temp: 17, sky: "partly", wind: "breezy" }, mode: "live",
      live: { placeKey: "auto", place: { name: "X", lat: 41, lon: 29 }, wx: c.wx, fetchedAt: now - (c.agoMin || 0) * 60000 },
      routes: rt.routes || [], trips: rt.trips || [], dayMode: rt.dayMode !== false, dayWx: ids.length ? { fetchedAt: now, byPlace } : null,
      choice: c.choice || { date: "", picks: {} }, fix: null };
    E.setS(S);
    const inp = E.liveInput();
    if (!inp) { r.err = "noinput"; } else {
      const day = E.dayPlan(), useDay = !!(day && day.inp && day.lead);
      const p = E.plan(useDay ? day.inp : inp, S);
      r.useDay = useDay; r.level = p.L; r.head = p.head;
      r.wear = p.wear.map(w => w.g + ":" + w.label); r.take = p.take.map(w => w.g + ":" + w.label); r.pills = p.pills;
      r.E = Math.round(p.E * 1000) / 1000;
      if (day) { r.dayOffset = day.offset; r.lead = !!day.lead; r.dayItems = day.items.length; }
    }
  } catch (e) { r.err = "EXC " + e.message; }
  res.push(r);
}
fs.writeFileSync(process.argv[3], JSON.stringify(res));
