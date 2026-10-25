// Compares JS (web) and Kotlin (widget) outputs case by case.
const fs = require("fs");
const js = JSON.parse(fs.readFileSync(process.argv[2], "utf8")), kt = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const cases = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], "utf8")) : null;
const byId = {}; kt.forEach(r => byId[r.id] = r);
// next: the widget's "next trip" line (day names, "Tomorrow", "outside N min") in the case's language
const F = ["err", "useDay", "level", "head", "wear", "take", "pills", "next", "alerts"];
let mism = 0, n = 0; const kinds = {}, ex = {};
js.forEach((a, i) => {
  const b = byId[a.id]; n++;
  const diffs = F.filter(f => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
  if (diffs.length) {
    mism++;
    const c = cases && cases[i];
    const k = diffs.join("+") + (c && c.edge ? " [edge " + c.edge + "]" : c && c.routine ? " [routine]" : "") + (c && c.lang ? " [" + c.lang + "]" : "");
    kinds[k] = (kinds[k] || 0) + 1;
    (ex[k] = ex[k] || []).push({ id: a.id, js: Object.fromEntries(diffs.map(f => [f, a[f]])), kt: Object.fromEntries(diffs.map(f => [f, b[f]])), jsE: a.E, ktE: b.E, extra: { off: a.dayOffset, lead: a.lead, items: a.dayItems } });
  }
});
console.log("cases", n, "mismatches", mism);
Object.keys(kinds).sort((x, y) => kinds[y] - kinds[x]).forEach(k => { console.log("\n==", k, kinds[k]); ex[k].slice(0, 3).forEach(e => console.log(JSON.stringify(e))); });
// How many cases had warnings at all, so a generator change that stops producing them is noticed.
const withAlerts = js.filter(r => Array.isArray(r.alerts) && r.alerts.length).length;
console.log("cases with warnings", withAlerts, "kinds", JSON.stringify(js.reduce((m, r) => { (Array.isArray(r.alerts) ? r.alerts : []).forEach(a => { const k = a.split(" ~ ").slice(0, 2).join(":"); m[k] = (m[k] || 0) + 1; }); return m; }, {})));
const errs = kt.filter(r => (r.err && r.err.startsWith("EXC")) || (typeof r.alerts === "string")); console.log("\nKotlin exceptions:", errs.length); errs.slice(0, 5).forEach(e => console.log(e.id, e.err || e.alerts));
