// Findings from the second beta test (October 2026), checked the way a person would meet them on the phone.
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };   // 19°
const USK = { id: "pusk", name: "Üsküdar", sub: "İstanbul", lat: 41.026, lon: 29.015 };    // 20°
const live = (p, t, ago = 0, wx) => ({ placeKey: p.id, place: { name: p.name, sub: p.sub, lat: p.lat, lon: p.lon }, wx: wx || fc(t), fetchedAt: Date.now() - ago });
const seed = (o) => ({ [KEY]: JSON.stringify(Object.assign({ places: [BES, USK], sel: "pbes", mode: "live", live: live(BES, 19) }, o)) });
// A forecast fetched [days] ago: its hours end before now.
function old(t, days) {
  const w = fc(t), shift = (s) => { const d = new Date(String(s).slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10) + String(s).slice(10); };
  w.hourly.time = w.hourly.time.map(shift); if (w.daily) { w.daily.time = w.daily.time.map(shift); if (w.daily.sunset) w.daily.sunset = w.daily.sunset.map(shift); }
  if (w.current && w.current.time) w.current.time = shift(w.current.time);
  return w;
}
const pageOk = (s, label) => {
  const cons = s.consoleErr.filter((m) => !/Failed to load resource/.test(m));
  check(label + ": no page or console errors", !s.errors.length && !cons.length, s.errors.concat(cons));
};

H.run({
  // A forecast a week old can't be shown: the app gets a new one by itself instead of staying on "Elle ayar".
  async outdatedForecastRefreshes(t) {
    const s = await t.open({ seed: seed({ live: live(BES, 19, 8 * 864e5, old(19, 8)) }) });
    await s.goto(); await sleep(1200);
    const a = await s.snap();
    note("8 days later:", JSON.stringify(a));
    check("outdated: a new forecast is fetched on open", s.net.calls.forecast.length >= 1, s.net.calls.forecast.length);
    check("outdated: the place's weather is shown again, not 'Elle ayar'", a.label === "Beşiktaş" && a.temp === "19°", { label: a.label, temp: a.temp });
    pageOk(s, "outdated");
    await s.close();
  },
  // Typing a place's name while the weather refreshes in the background: what's typed is kept.
  async typingSurvivesRefresh(t) {
    const s = await t.open({ seed: seed({ live: live(BES, 19, 30 * 60000) }), net: { delay: { forecast: 400 } } });
    await s.goto(); await sleep(900); // the opening refresh of a 30-minute-old forecast
    await s.page.evaluate(() => document.querySelector("[data-open-routine]").click()); await sleep(200);
    const sel = 'input[data-place="pbes"][data-k="name"]';
    await s.page.focus(sel);
    await s.page.evaluate((q) => { const i = document.querySelector(q); i.setSelectionRange(i.value.length, i.value.length); }, sel);
    await s.page.keyboard.type("Ok");
    await s.page.evaluate(() => { const st = JSON.parse(localStorage.getItem("negiysem:v2")); return st; });
    await s.page.evaluate(() => document.getElementById("refresh").click()); await sleep(900); // a refresh lands mid-word
    await s.page.focus(sel); await s.page.keyboard.press("End");
    await s.page.keyboard.type("ul");
    const v = await s.page.$eval(sel, (e) => e.value);
    check("typing: the name typed during a refresh is kept", v === "BeşiktaşOkul", v);
    pageOk(s, "typing");
    await s.close();
  },
  // A renamed place that is then deleted: the header keeps the new name; undo puts focus back on the place.
  async renameThenDelete(t) {
    const s = await t.open({ seed: seed({ trips: [{ id: "T1", from: "pbes", to: "pusk", time: "08:00", days: [1, 2, 3, 4, 5] }] }) });
    await s.goto(); await sleep(300);
    await s.page.evaluate(() => document.querySelector("[data-open-routine]").click()); await sleep(200);
    await s.page.evaluate(() => { const i = document.querySelector('input[data-place="pbes"][data-k="name"]'); i.value = "Ev"; i.dispatchEvent(new Event("change", { bubbles: true })); });
    await sleep(200);
    const trips = await s.page.evaluate(() => [...document.querySelectorAll('#routine option[value="pbes"]')].map((o) => o.textContent));
    // (a place used by a trip can't be deleted: the trip goes first)
    await s.page.evaluate(() => document.querySelector('[data-act="deltrip"]').click()); await sleep(150);
    await s.page.evaluate(() => document.querySelector('button[aria-label="Ev kaydını sil"]').click()); await sleep(200);
    const label = await s.label(), status = await s.status();
    check("rename then delete: the header still says the new name", label === "Ev" && /^Ev silindi/.test(status), { label, status });
    await s.page.click("#status button"); await sleep(300);
    const focus = await s.page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.getAttribute("data-place")));
    check("undo: focus goes back to the place, not the page", focus === "placeBtn" || focus === "pbes", focus);
    check("rename: trip lists in the editor use the new name", trips.length > 0 && trips.every((x) => x === "Ev"), trips);
    pageOk(s, "rename+delete");
    await s.close();
  },
  // The packing list gets another place's forecast without moving the main screen there.
  async packingOwnForecast(t) {
    const s = await t.open({ seed: seed({}) });
    await s.goto(); await sleep(300);
    await s.page.evaluate(() => document.querySelector("#weekCard [data-open-pack]").click()); await sleep(200);
    await s.page.evaluate(() => document.querySelector('[data-pk="place"][data-v="pusk"]').click()); await sleep(150);
    const calls = s.net.calls.forecast.length;
    await s.page.evaluate(() => document.querySelector("[data-pk-fetch]").click()); await sleep(700);
    const sum = await s.page.$eval(".pk-sum", (e) => e.textContent).catch(() => "");
    const label = await s.label();
    check("packing: Üsküdar's list is there after its forecast came", s.net.calls.forecast.length === calls + 1 && /Üsküdar · 3 gün/.test(sum), { sum, calls: s.net.calls.forecast.length - calls });
    check("packing: the main screen stays on Beşiktaş", label === "Beşiktaş", label);
    pageOk(s, "packing");
    await s.close();
  },
});
