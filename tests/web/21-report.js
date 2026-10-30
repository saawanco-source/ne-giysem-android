// "Sorun bildir": an e-mail with technical details that never carries the location, places or routine.
const H = require("./lib");
const { check, sleep, KEY, fc } = H;

const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
const seed = (o) => ({ [KEY]: JSON.stringify(Object.assign({ places: [BES], sel: "pbes", mode: "live",
  live: { placeKey: "pbes", place: { name: BES.name, sub: BES.sub, lat: BES.lat, lon: BES.lon }, wx: fc(19), fetchedAt: Date.now() - 5 * 60000 },
  trips: [{ id: "T1", from: "pbes", to: "pbes", time: "08:00", days: [1] }] }, o)) });
const BRIDGE = () => {
  window.NeGiysemAndroid = { saveState() {}, setTheme() {}, reset() {}, hasLocation: () => true, alertsState: () => "off",
    diagnostics: () => JSON.stringify({ app: "2.0 (57)", model: "SM-A566B", android: "15", lastFail: "IOException: server 503", lastFailAt: Date.now() - 3600e3,
      crashes: ["2026-10-30 09:12 IllegalStateException: … @ Updater.fetch:120"] }) };
};
async function report(s) {
  return s.page.evaluate(() => new Promise((res) => { window.__ngMail = (u) => res(u); document.getElementById("reportBtn").click(); }));
}
const bodyOf = (url) => decodeURIComponent(url.split("&body=")[1] || "");

H.run({
  async web(t) {
    const s = await t.open({ seed: seed({}) });
    await s.goto(); await sleep(300);
    await s.page.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { message: "boom near 41.0431,29.0071", filename: "https://x/index.html", lineno: 77 })));
    const url = await report(s), body = bodyOf(url);
    check("web: mail to the contact address with a subject", /^mailto:saawanco@gmail\.com\?subject=Ne%20Giysem%3F%20sorun%20bildirimi&body=/.test(url), url.slice(0, 90));
    check("web: the error is in it, its coordinates aren't", /boom near …,… \(index\.html:77\)/.test(body) && !/41\.043|29\.007/.test(body), body);
    check("web: no place names, routine or coordinates", !/Beşiktaş|İstanbul|08:00 /.test(body) && /trips 1/.test(body), body);
    check("web: says it's the website and how old the forecast is", /^Web · /m.test(body) && /forecast 5 min ago/.test(body), body);
    await s.close();
  },
  async inApp(t) {
    const s = await t.open({ seed: seed({}) });
    await s.context.addInitScript(BRIDGE);
    await s.goto(); await sleep(300);
    const body = bodyOf(await report(s));
    check("app: version, model, Android, the widget's problem and crashes", /Android 2\.0 \(57\) · SM-A566B · Android 15/.test(body) && /Widget'ın son sorunu: IOException: server 503/.test(body) && /Çökme kayıtları:\n  2026-10-30 09:12 IllegalStateException/.test(body), body);
    await s.close();
  },
  async english(t) {
    const s = await t.open({ seed: seed({ lang: "en" }) });
    await s.goto(); await sleep(300);
    const chip = await s.page.$eval("#reportBtn", (e) => e.textContent);
    const url = await report(s), body = bodyOf(url);
    check("en: button and mail in English", chip === "Report by e-mail" && /subject=Ne%20Giysem%3F%20problem%20report/.test(url) && /^What happened\?/.test(body) && /Latest errors: none/.test(body), { chip, body });
    await s.close();
  },
  async resetClears(t) {
    const s = await t.open({ seed: seed({}) });
    await s.goto(); await sleep(300);
    await s.page.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { message: "boom" })));
    const before = await s.page.evaluate((k) => localStorage.getItem(k + ":errlog"), KEY);
    await s.page.evaluate(() => { const b = document.getElementById("resetBtn"); b.click(); b.click(); }); await sleep(300);
    const after = await s.page.evaluate((k) => localStorage.getItem(k + ":errlog"), KEY);
    check("reset: the error records go too", !!before && after === null, { before, after });
    await s.close();
  },
});
