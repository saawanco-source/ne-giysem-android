// Hour by hour (each hour's outfit, what it adds), the person's own warnings, the month's summary, haptics and the
// shortcuts' ?go= pages.
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

const IST = 3 * 3600e3, istNow = () => new Date(Date.now() + IST);
const todayAt = (hh, mm = 0) => { const d = istNow(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - 3, mm); };
const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
function wx(t, edit) { const w = fc(t), h = w.hourly; h.precipitation = h.time.map(() => 0); h.wind_gusts_10m = h.time.map(() => 15); if (edit) edit(h); return w; }
const seed = (T, live, extra) => ({ [KEY]: JSON.stringify(Object.assign({ places: [BES], sel: "pbes", mode: "live", hours: 6,
  live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx: live, fetchedAt: T } }, extra || {})) });
async function at(t, T, sd, o) {
  const s = await t.open(Object.assign({ seed: sd }, o || {}));
  await s.page.clock.setFixedTime(new Date(T)); await s.goto(); await sleep(400); return s;
}
const pageOk = (s, label) => {
  const cons = s.consoleErr.filter((m) => !/Failed to load resource/.test(m));
  check(label + ": no page or console errors", !s.errors.length && !cons.length, s.errors.concat(cons));
};

H.run({
  // Dry now, rain from 14:00: the 14:00 hour shows an umbrella, and tapping it tells that hour's outfit.
  async hourByHour(t) {
    const T = todayAt(11);
    const live = wx(14, (h) => { for (let k = 14; k <= 17; k++) { h.weather_code[k] = 63; h.precipitation_probability[k] = 90; h.precipitation[k] = 2; } });
    const s = await at(t, T, seed(T, live));
    const cells = await s.page.$$eval("#hours .h", (l) => l.map((x) => ({ t: x.querySelector(".hh").textContent, n: x.querySelectorAll(".hx .art").length, sr: (x.querySelector(":scope > .sr") || {}).textContent || "" })));
    note("hours:", JSON.stringify(cells));
    const c14 = cells.find((c) => c.t === "14:00");
    check("hourly: the rainy hour carries an extra (umbrella)", c14 && c14.n >= 1 && /Şemsiye/.test(c14.sr), c14);
    check("hourly: a dry hour has no rain gear", !/Şemsiye|Yağmurluk/.test(cells[1].sr), cells[1]);
    await s.page.tap('#hours .h[data-hr="3"]'); await sleep(150);
    const more = await s.page.$eval("#hourMore", (e) => ({ hidden: e.hidden, text: e.innerText.replace(/\s+/g, " ") }));
    note("14:00:", more.text);
    check("hourly: tapping 14:00 shows that hour's outfit and what it adds", !more.hidden && /^14:00 · hissedilen/.test(more.text) && /Şu ankine ek olarak: .*şemsiye/.test(more.text), more);
    await s.page.tap('#hours .h[data-hr="3"]'); await sleep(100);
    check("hourly: tapping again closes it", await s.page.$eval("#hourMore", (e) => e.hidden));
    pageOk(s, "hourly");
    await s.close();
  },
  // A warning of their own with its reason: added in the sheet, shown when the forecast crosses it, dismissed for today.
  async myWarnings(t) {
    const T = todayAt(20);
    const live = wx(3); // cold night: feels below 0
    const s = await at(t, T, seed(T, live));
    await s.page.tap("#rulesBtn"); await sleep(200);
    await s.page.selectOption("#ruK", "cold"); await sleep(100);
    await s.page.fill("#ruV", "1");
    await s.page.tap("[data-rule-add]"); await sleep(100);
    check("warnings: a reason is required", !(await s.page.$eval("#ruErr", (e) => e.hidden)) && (await s.stored()).rules === undefined);
    await s.page.fill("#ruW", "Araba camı buzlanır, erken çık");
    await s.page.tap("[data-rule-add]"); await sleep(200);
    const st = await s.stored();
    check("warnings: added with its limit and reason", st.rules && st.rules.length === 1 && st.rules[0].k === "cold" && st.rules[0].v === 1 && /buzlanır/.test(st.rules[0].why), st.rules);
    await s.page.fill("#ruW", "Rüzgârlık al"); await s.page.selectOption("#ruK", "wind"); await sleep(100);
    await s.page.fill("#ruV", "5"); await s.page.tap("[data-rule-add]"); await sleep(100);
    check("warnings: a limit outside its range is refused", /arasında olmalı/.test(await s.page.$eval("#ruErr", (e) => e.textContent)));
    await s.page.click("#rulesSheet .tc-head .x"); await sleep(250);
    const a = await s.page.$eval("#myAlerts", (e) => ({ hidden: e.hidden, text: e.innerText.replace(/\s+/g, " ") }));
    note("my alerts:", a.text);
    check("warnings: shown with the time, the value, the limit and the reason", !a.hidden && /−?\d+° \(sınırın 1°\)/.test(a.text) && /Araba camı buzlanır, erken çık/.test(a.text), a);
    await s.page.tap("[data-rule-off]"); await sleep(150);
    check("warnings: dismissed for today", await s.page.$eval("#myAlerts", (e) => e.hidden) && !!(await s.stored()).ruleOff);
    pageOk(s, "warnings");
    await s.close();
  },
  // The month: a few logged days give the summary; today's line is added on its own.
  async monthSummary(t) {
    const T = todayAt(12), ym = new Date(T + IST).toISOString().slice(0, 7);
    const log = {}; for (let d = 1; d <= 3; d++) log[ym + "-0" + d] = { L: 3, lo: 4 + d, hi: 11, umb: d === 2, g: ["mont", "kazak", "semsiye"] };
    const s = await at(t, T, seed(T, wx(12), { log }));
    await s.page.tap("#monthBtn"); await sleep(200);
    const body = await s.page.$eval("#monthBody", (e) => e.innerText.replace(/\s+/g, " "));
    note("month:", body.slice(0, 260));
    check("month: summary from the days logged (today included)", /[34] gün baktın/.test(body) && /gün şemsiye ya da yağmurluk gerekti/.test(body) && /En çok giyilen dış katman: mont/.test(body), body.slice(0, 300));
    const st = await s.stored();
    check("month: today is logged", !!st.log && !!st.log[new Date(T + IST).toISOString().slice(0, 10)], st.log && Object.keys(st.log));
    pageOk(s, "month");
    await s.close();
  },
  // Haptics through the app's bridge, and off in settings.
  async haptics(t) {
    const T = todayAt(12);
    const s = await t.open({ seed: seed(T, wx(12)) });
    await s.context.addInitScript(() => { window.__h = []; window.NeGiysemAndroid = { saveState() {}, setTheme() {}, reset() {}, hasLocation: () => true, haptic: (k) => window.__h.push(k) }; });
    await s.goto(); await sleep(400);
    await s.page.tap('[data-key="feel"] [data-val="cold"]'); await sleep(100);
    const n1 = await s.page.evaluate(() => window.__h.length);
    check("haptics: a tick on a choice", n1 >= 1, n1);
    await s.page.tap('[data-key="haptics"] [data-val="false"]'); await sleep(100);
    const n2 = await s.page.evaluate(() => window.__h.length);
    await s.page.tap('[data-key="feel"] [data-val="normal"]'); await sleep(100);
    check("haptics: none once turned off", (await s.page.evaluate(() => window.__h.length)) === n2 && (await s.stored()).haptics === false);
    await s.close();
  },
  // ?go= from a shortcut: tomorrow opens its day, pack opens the sheet.
  async shortcuts(t) {
    const T = todayAt(12);
    const s = await t.open({ seed: seed(T, wx(12)) });
    await s.page.clock.setFixedTime(new Date(T));
    await s.page.goto(s.page.url() === "about:blank" ? (await s.goto(), s.page.url()) + "?go=pack" : s.page.url() + "?go=pack"); await sleep(500);
    check("go=pack: the packing sheet is open", !(await s.page.$eval("#packSheet", (e) => e.hidden)));
    await s.page.goto(s.page.url().replace("go=pack", "go=tomorrow")); await sleep(500);
    const open = await s.page.$$eval(".wk-row[aria-expanded=true]", (l) => l.length);
    check("go=tomorrow: tomorrow's day is opened", open === 1, open);
    pageOk(s, "shortcuts");
    await s.close();
  },
});
