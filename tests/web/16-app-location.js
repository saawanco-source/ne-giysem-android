// Android app: the position comes from the phone's own location service through the app (A.locate), not from the
// WebView's geolocation; the phone's location being off or the permission refused each get a button to fix it.
const H = require("./lib");
const { check, note, sleep, GPS } = H;

// The app's bridge: hasLocation() and locate(id) answered through window.ngLocation, like MainActivity does.
function bridge(cfg) {
  window.__b = { cfg, granted: !!cfg.granted, locate: 0, openLoc: 0, openApp: 0, saved: [], fc: [] };
  window.NeGiysemAndroid = {
    saveState: (j) => window.__b.saved.push(JSON.parse(j)), setTheme() {}, reset() {},
    saveForecast: (j) => window.__b.fc.push(JSON.parse(j)),
    hasLocation: () => window.__b.granted,
    openLocationSettings: () => { window.__b.openLoc++; }, openAppSettings: () => { window.__b.openApp++; },
    locate(id) {
      const b = window.__b; b.locate++;
      setTimeout(() => {
        // Android's permission question first, when needed: the person allows or refuses.
        if (!b.granted) { if (b.cfg.allow) b.granted = true; else return window.ngLocation(id, { error: "geo_denied" }); }
        window.ngLocation(id, b.cfg.answer);
      }, 250);
    },
  };
}
async function open(t, cfg) {
  const s = await t.open({ geo: { state: "prompt", coords: GPS.moda } });
  await s.context.addInitScript(bridge, cfg);
  await s.goto(); await sleep(500);
  return s;
}
const B = (s) => s.page.evaluate(() => ({ locate: window.__b.locate, openLoc: window.__b.openLoc, openApp: window.__b.openApp, saved: window.__b.saved,
  fc: window.__b.fc.map((f) => ({ at: f.at, lat: f.lat, lon: f.lon, name: f.name, hours: f.main && f.main.hourly && f.main.hourly.time.length, tz: f.main && f.main.timezone })) }));
const pageOk = (s, label) => check(label + ": no page errors, WebView geolocation never used", !s.errors.length && s.geo.gets === 0, { errors: s.errors, gets: s.geo.gets });

H.run({
  async granted(t) {
    const s = await open(t, { granted: true, answer: { lat: GPS.etiler.lat, lon: GPS.etiler.lon, acc: 18 } });
    await sleep(700);
    const a = await s.snap(), b = await B(s);
    note("granted:", JSON.stringify(a));
    check("permission already there: starts by itself with the phone's position (Etiler 10°)", a.label === "Etiler" && a.temp === "10°", a);
    check("asked the app once", b.locate === 1, b.locate);
    const last = b.saved[b.saved.length - 1] || {};
    check("the widget gets the place", last.place && Math.abs(last.place.lat - GPS.etiler.lat) < 1e-6, last.place);
    check("the widget gets the forecast the page got, once", b.fc.length === 1 && Math.abs(b.fc[0].lat - GPS.etiler.lat) < 1e-6 && b.fc[0].hours > 100 && b.fc[0].name === "Etiler", b.fc);
    await s.page.reload(); await sleep(600);
    check("reopening the app hands the kept forecast over again (for a widget without weather)", (await B(s)).fc.length === 1, (await B(s)).fc);
    pageOk(s, "granted");
    await s.close();
  },
  async allowedOnRefresh(t) {
    const s = await open(t, { granted: false, allow: true, answer: { lat: GPS.etiler.lat, lon: GPS.etiler.lon, acc: 30 } });
    check("no permission yet: doesn't ask on its own", (await B(s)).locate === 0 && /Başlamak/.test(await s.status()), await s.status());
    await s.page.tap("#refresh"); await sleep(1200);
    const a = await s.snap();
    check("refresh: Android's question, then the position", a.label === "Etiler" && (await B(s)).locate === 1, a);
    pageOk(s, "allow");
    await s.close();
  },
  async locationOff(t) {
    const s = await open(t, { granted: true, answer: { error: "geo_off" } });
    await sleep(900);
    const a = await s.snap();
    note("off:", JSON.stringify(a));
    check("phone's location off: approximate location, and says why", a.label === "İstanbul" && /Telefonunun konumu kapalı; yaklaşık konum kullanıldı/.test(a.status), a);
    check("offers a button to turn it on", a.acts.includes("Konumu aç"), a.acts);
    await s.page.click("#status button"); await sleep(100);
    check("the button opens the phone's location settings", (await B(s)).openLoc === 1);
    // Back from the settings with the location on: it looks again by itself.
    await s.page.evaluate((c) => { window.__b.cfg.answer = c; }, { lat: GPS.etiler.lat, lon: GPS.etiler.lon, acc: 25 });
    await s.page.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await sleep(1200);
    const back = await s.snap();
    check("back from the settings: tries again and finds the position", back.label === "Etiler" && (await B(s)).locate === 2, back);
    await s.page.evaluate(() => { window.__b.cfg.answer = { error: "geo_off" }; });
    await s.openSearch(); await s.page.tap("#saveHere"); await sleep(700);
    const st = await s.status(), acts = await s.statusActs();
    check("'save my location' with location off: says to turn it on, with the button", /Telefonunun konumu kapalı; açıp tekrar dene/.test(st) && acts.includes("Konumu aç"), [st, acts]);
    pageOk(s, "off");
    await s.close();
  },
  async refused(t) {
    const s = await open(t, { granted: false, allow: false, answer: { lat: 1, lon: 1 } });
    await s.page.tap("#refresh"); await sleep(1200);
    const a = await s.snap();
    note("refused:", JSON.stringify(a));
    check("permission refused: approximate location with 'İzin ver'", a.label === "İstanbul" && /Konum izni olmadığı için yaklaşık konum/.test(a.status) && a.acts.includes("İzin ver"), a);
    await s.page.click("#status button"); await sleep(100);
    check("'İzin ver' opens the app's settings page", (await B(s)).openApp === 1);
    pageOk(s, "refused");
    await s.close();
  },
  async english(t) {
    const s = await t.open({ geo: { state: "prompt" }, ctx: { locale: "en-US" } });
    await s.context.addInitScript(bridge, { granted: true, answer: { error: "geo_off" } });
    await s.goto(); await sleep(1300);
    const a = await s.snap();
    check("English: location off wording and button", /Your phone's location is off; an approximate location was used/.test(a.status) && a.acts.includes("Turn on location"), a);
    await s.close();
  },
});
