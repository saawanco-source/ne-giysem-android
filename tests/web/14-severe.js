// Severe weather: the app's own forecast-based warnings with what to do, in Turkish and English; nothing when calm.
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
const IST = 3 * 3600e3;
const hourIdx = (wx, ms) => wx.hourly.time.indexOf(new Date(ms + IST).toISOString().slice(0, 13) + ":00");

// A forecast with a storm (gusts 98 km/h) in 2-4 hours, thunder with hail at +3, then heavy rain at +5..+7.
function stormy() {
  const wx = fc(14), h = wx.hourly, now = Date.now(), i = hourIdx(wx, now);
  h.wind_gusts_10m = h.time.map(() => null);
  h.precipitation = h.time.map(() => 0);
  for (let k = 2; k <= 4; k++) { h.wind_speed_10m[i + k] = 58; h.wind_gusts_10m[i + k] = k === 3 ? 98 : 80; }
  h.weather_code[i + 3] = 96;
  for (let k = 5; k <= 7; k++) { h.weather_code[i + k] = 63; h.precipitation[i + k] = 9; h.precipitation_probability[i + k] = 90; }
  return { wx, at: (k) => h.time[i + k].slice(11, 16) };
}
const seed = (wx, extra = {}) => ({ [KEY]: JSON.stringify(Object.assign({ places: [BES], sel: "pbes", mode: "live",
  live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx, fetchedAt: Date.now() } }, extra)) });

async function cards(s) {
  return s.page.evaluate(() => {
    const el = document.getElementById("severe");
    return { hidden: el.hidden, items: [...el.querySelectorAll(".sv")].map((sv) => ({
      k: sv.dataset.sv, title: sv.querySelector(".sv-top b").textContent, lv: sv.querySelector(".sv-lv").textContent,
      when: sv.querySelector(".sv-when").textContent, open: sv.querySelector("details").open,
      tips: [...sv.querySelectorAll("li")].map((li) => li.textContent), what: sv.querySelector("summary").textContent })),
      note: (el.querySelector(".sv-note") || {}).textContent || "", mgm: !!el.querySelector('.sv-note a[href*="mgm.gov.tr"]') };
  });
}
const pageOk = (s, label) => {
  const cons = s.consoleErr.filter((m) => !/Failed to load resource/.test(m));
  check(label + ": no page or console errors", !s.errors.length && !cons.length, s.errors.concat(cons));
};

// In the Android app: the "Hava uyarıları" switch and the card's link turn notifications on through the app.
const BRIDGE = () => {
  window.__alerts = { state: "off", calls: [] };
  window.NeGiysemAndroid = { saveState() {}, setTheme() {}, reset() {}, hasLocation: () => true,
    alertsState: () => window.__alerts.state,
    setAlerts: (on) => { window.__alerts.calls.push(on); window.__alerts.state = on ? "on" : "off"; } };
};

H.run({
  async dictionary() {
    // Two English entries for the same Turkish text would silently change one of them (it happened to "Buzlanma").
    const src = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "web", "index.html"), "utf8");
    const a = src.indexOf("var EN = {"); let d = 0, j = src.indexOf("{", a);
    for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}" && !--d) break; }
    const re = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g, seen = {}, dup = []; let m;
    const body = src.slice(src.indexOf("{", a), j + 1);
    while ((m = re.exec(body))) { if (m[1] in seen && seen[m[1]] !== m[2]) dup.push(m[1]); seen[m[1]] = m[2]; }
    check("English dictionary: no Turkish text with two different translations", !dup.length && Object.keys(seen).length > 300, dup);
  },
  async inApp(t) {
    const { wx } = stormy();
    const s = await t.open({ seed: seed(wx) });
    await s.context.addInitScript(BRIDGE);
    await s.goto(); await sleep(400);
    const row = () => s.page.evaluate(() => ({ hidden: document.getElementById("alertsRow").hidden, btn: document.getElementById("alertsBtn").textContent,
      pressed: document.getElementById("alertsBtn").getAttribute("aria-pressed"), hint: document.getElementById("alertsHint").textContent,
      link: !!document.querySelector("#severe [data-alerts-on]"), calls: window.__alerts.calls }));
    let r = await row();
    check("in the app: the switch is shown, off", !r.hidden && r.pressed === "false" && r.btn === "Telefonuma bildir" && /uygulama kapalıyken/.test(r.hint), r);
    check("in the app: the warning card offers notifications", r.link, r);
    await s.page.click("#severe [data-alerts-on]"); await sleep(150);
    r = await row();
    check("the card's link turns them on through the app, then goes away", r.calls.join() === "true" && r.pressed === "true" && r.btn === "Bildirimler açık" && !r.link, r);
    await s.page.click("#alertsBtn"); await sleep(150);
    r = await row();
    check("the switch turns them off again", r.calls.join() === "true,false" && r.pressed === "false" && r.link, r);
    await s.page.evaluate(() => { window.__alerts.state = "blocked"; window.ngAlertsChanged(); });
    r = await row();
    check("blocked by Android: says so and points to the settings", /Android’de bu uygulamanın bildirimleri kapalı/.test(r.hint) && !r.link, r);
    pageOk(s, "inApp");
    await s.close();
  },
  async webOnly(t) {
    const { wx } = stormy();
    const s = await t.open({ seed: seed(wx) });
    await s.goto(); await sleep(300);
    const r = await s.page.evaluate(() => ({ hidden: document.getElementById("alertsRow").hidden, link: !!document.querySelector("#severe [data-alerts-on]") }));
    check("on the web: no notification switch or link", r.hidden && !r.link, r);
    await s.close();
  },
  async turkish(t) {
    const { wx, at } = stormy();
    const s = await t.open({ seed: seed(wx) });
    await s.goto(); await sleep(400);
    const c = await cards(s);
    note(JSON.stringify(c.items.map((x) => [x.k, x.lv, x.when])));
    check("cards shown, most dangerous first", !c.hidden && c.items[0].k === "storm" && c.items[0].lv === "Tehlikeli", c.items.map((x) => x.k + ":" + x.lv));
    // Late in the evening the hours ahead are tomorrow's: "yarın 02:00–05:00".
    const starts = (when, k) => when.replace(/^yarın /, "").startsWith(at(k) + "–");
    check("storm: time span and peak gust", starts(c.items[0].when, 2) && /saatte 98 km'ye kadar/.test(c.items[0].when), c.items[0].when);
    check("hail thunderstorm is dangerous and adds the hail tip", c.items.some((x) => x.k === "thunder" && x.lv === "Tehlikeli" && x.tips.some((tp) => /Dolu/.test(tp))), c.items);
    check("heavy rain from its first wet hour", c.items.some((x) => x.k === "rain" && starts(x.when, 5)), c.items.find((x) => x.k === "rain"));
    check("first dangerous card opens its tips", c.items[0].open && c.items[0].tips.length >= 3 && c.items[0].what === "Ne yapmalı?", c.items[0]);
    check("says it isn't official, links MGM and 112", /resmî uyarı değildir/.test(c.note) && c.mgm && /112/.test(c.note), c.note);
    await s.shot("14-severe-tr");
    pageOk(s, "tr");
    await s.close();
  },
  async english(t) {
    const { wx } = stormy();
    const s = await t.open({ seed: seed(wx, { lang: "en" }) });
    await s.goto(); await sleep(400);
    const c = await cards(s);
    check("English titles and level", c.items[0].title === "Storm" && c.items[0].lv === "Danger" && c.items[0].what === "What to do", c.items[0]);
    check("English peak and note", /wind up to 98 km\/h/.test(c.items[0].when) && /not an official one/.test(c.note), [c.items[0].when, c.note]);
    const turkish = /[çğışöüÇĞİŞÖÜ]|Ne yapmal|resmî/.test(c.items.map((x) => x.title + x.lv + x.when + x.tips.join("")).join("") + c.note.replace("MGM", ""));
    check("no Turkish left in the English cards", !turkish, c);
    await s.shot("14-severe-en");
    pageOk(s, "en");
    await s.close();
  },
  async calm(t) {
    const wx = fc(18);
    const s = await t.open({ seed: seed(wx) });
    await s.goto(); await sleep(400);
    const c = await cards(s);
    check("calm weather: no warning card", c.hidden && !c.items.length, c);
    pageOk(s, "calm");
    await s.close();
  },
  // MET Norway labels 1 mm an hour "heavy rain" (code 65/82 here): an ordinary rainy day is no warning; 6 mm an hour is.
  async ordinaryRain(t) {
    const wx = fc(14), h = wx.hourly, i = hourIdx(wx, Date.now());
    h.precipitation = h.time.map(() => 0);
    for (let k = 1; k <= 8; k++) { h.weather_code[i + k] = k % 2 ? 65 : 82; h.precipitation[i + k] = 1.4; h.precipitation_probability[i + k] = 95; }
    let s = await t.open({ seed: seed(wx) });
    await s.goto(); await sleep(400);
    let c = await cards(s);
    check("1.4 mm an hour marked heavy by the symbol: no heavy-rain warning", !c.items.some((x) => x.k === "rain"), c.items.map((x) => x.k));
    await s.close();
    h.precipitation[i + 3] = 7;
    s = await t.open({ seed: seed(wx) });
    await s.goto(); await sleep(400);
    c = await cards(s);
    check("7 mm in an hour: heavy-rain warning with its amount", c.items.some((x) => x.k === "rain" && x.lv === "Dikkat" && /saatte 7 mm'ye kadar/.test(x.when)), c.items);
    pageOk(s, "ordinary rain");
    await s.close();
  },
  async heatAndDesktop(t) {
    const wx = fc(36), h = wx.hourly, i = hourIdx(wx, Date.now());
    for (let k = 0; k < 24; k++) h.apparent_temperature[i + k] = Math.max(h.apparent_temperature[i + k], k >= 1 && k <= 4 ? 41 : 30);
    const s = await t.open({ seed: seed(wx), ctx: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false } });
    await s.goto(); await sleep(400);
    const c = await cards(s);
    check("extreme heat: dangerous, feels-like peak", c.items.length && c.items[0].k === "heat" && c.items[0].lv === "Tehlikeli" && /hissedilen 41°'ye kadar/.test(c.items[0].when), c.items[0]);
    await s.shot("14-severe-desktop");
    pageOk(s, "heat");
    await s.close();
  },
});
