// On an Android browser the install button offers the Android app (it has the widget); the web app is a second choice.
// Inside the Android app and on other systems nothing changes.
const H = require("./lib");
const { check, sleep } = H;
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

H.run({
  async androidBrowser(t) {
    const s = await t.open({ ctx: { userAgent: ANDROID_UA } });
    await s.goto(); await sleep(400);
    const btn = await s.page.$eval("#installBtn", (e) => !e.hidden);
    check("Android browser: the install button is there without waiting for the browser", btn);
    check("the hint isn't shown by itself in the browser", await s.page.$eval("#apkHint", (e) => e.hidden));
    await s.page.click("#installBtn"); await sleep(150);
    const h = await s.page.evaluate(() => ({ hidden: document.getElementById("apkHint").hidden, href: document.getElementById("apkLink").href,
      text: document.getElementById("apkHint").innerText, pwa: !document.getElementById("pwaBtn").hidden }));
    check("tapping it offers the Android app download (newest release)", !h.hidden && /releases\/latest\/download\/NeGiysem\.apk$/.test(h.href) && /widget/i.test(h.text), h);
    check("no web-app button when the browser can't install one", !h.pwa, h);
    await s.page.evaluate(() => { const e = new Event("beforeinstallprompt"); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: "accepted" }); window.dispatchEvent(e); });
    await sleep(100);
    check("when the browser can install the web app, it's offered as a second choice", await s.page.$eval("#pwaBtn", (e) => !e.hidden));
    await s.page.click("#pwaBtn"); await sleep(150);
    check("the second choice installs the web app", await s.page.evaluate(() => window.__prompted === true));
    await s.page.click("#apkHintClose"); await sleep(100);
    check("closes", await s.page.$eval("#apkHint", (e) => e.hidden));
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },
  async installedWebApp(t) {
    const s = await t.open({ ctx: { userAgent: ANDROID_UA } });
    await s.context.addInitScript(() => { const m = window.matchMedia.bind(window); window.matchMedia = (q) => (/standalone/.test(q) ? { matches: true, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : m(q)); });
    await s.goto(); await sleep(400);
    check("opened as an installed web app on Android: says once that the widget is in the Android app", await s.page.$eval("#apkHint", (e) => !e.hidden));
    await s.page.click("#apkHintClose"); await s.page.reload(); await sleep(400);
    check("…and not again after it was closed", await s.page.$eval("#apkHint", (e) => e.hidden));
    await s.close();
  },
  async elsewhere(t) {
    const a = await t.open({ ctx: { userAgent: ANDROID_UA } });
    await a.context.addInitScript(() => { window.NeGiysemAndroid = { saveState() {}, setTheme() {}, reset() {}, hasLocation: () => false }; });
    await a.goto(); await sleep(300);
    check("inside the Android app: no download offer", await a.page.$eval("#installBtn", (e) => e.hidden) && await a.page.$eval("#apkHint", (e) => e.hidden));
    await a.close();
    const d = await t.open({ ctx: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" } });
    await d.goto(); await sleep(300);
    check("not Android: the install button waits for the browser, as before", await d.page.$eval("#installBtn", (e) => e.hidden));
    await d.close();
  },
});
