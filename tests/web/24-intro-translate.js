// First-run pages (skippable, each part of the app explained, the widget offered in the Android app) and the
// translation into the phone's language in the Android app (a fake bridge stands in for ML Kit).
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
const seedLive = (extra) => ({ [KEY]: JSON.stringify(Object.assign({ places: [BES], sel: "pbes", mode: "live",
  live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx: fc(9), fetchedAt: Date.now() } }, extra || {})) });
const box = (s) => s.page.$eval("#intro", (e) => ({ hidden: e.hidden, text: e.innerText.replace(/\s+/g, " ").trim() }));
const pageOk = (s, label) => {
  const cons = s.consoleErr.filter((m) => !/Failed to load resource/.test(m));
  check(label + ": no page or console errors", !s.errors.length && !cons.length, s.errors.concat(cons));
};
// The Android app's bridge; xl: {state, calls} for the translation, widget: "can" / "has" / "".
function bridge(o) {
  return (o) => {
    window.__b = { saved: [], pins: 0, xl: [], prep: [] };
    window.NeGiysemAndroid = { setTheme() {}, reset() {}, hasLocation: () => true,
      saveState: (j) => window.__b.saved.push(JSON.parse(j)),
      widgetState: () => o.widget || "", pinWidget: () => { window.__b.pins++; },
      xlSupported: (l) => ["de", "es"].indexOf(l) >= 0, xlState: () => o.xl || "none",
      xlPrepare: (l) => { window.__b.prep.push(l); setTimeout(() => window.ngXlReady(l, true), 50); o.xl = "ready"; },
      translate: (id, l, json) => { const a = JSON.parse(json); window.__b.xl.push(a.length); setTimeout(() => window.ngTranslated(id, JSON.stringify(a.map((x) => "[" + l + "] " + x))), 20); } };
  };
}

H.run({
  async firstRunPages(t) {
    const s = await t.open({ intro: true });
    await s.goto(); await sleep(400);
    const a = await box(s);
    note("page 1:", a.text.slice(0, 120));
    check("intro: shown on the first open, page 1 of 8", !a.hidden && /^1 \/ 8 Atla Hoş geldin!/.test(a.text), a.text.slice(0, 80));
    await s.page.tap('[data-in="next"]'); await s.page.tap('[data-in="next"]'); await sleep(150);
    const c = await box(s);
    check("intro: 'Sana göre' page explains and lets you choose", /3 \/ 8/.test(c.text) && /Soğuğa karşı/.test(c.text) && /Çabuk üşürüm/.test(c.text), c.text.slice(0, 200));
    await s.page.tap('[data-in-set="feel"][data-val="cold"]'); await sleep(150);
    check("intro: the choice is saved", (await s.stored()).feel === "cold");
    await s.page.tap('[data-in="back"]'); await sleep(100);
    check("intro: back", /2 \/ 8 Atla Yerin/.test((await box(s)).text));
    await s.page.tap('[data-in="skip"]'); await sleep(150);
    check("intro: skip closes it and it isn't shown again", (await box(s)).hidden && (await s.stored()).intro === true);
    await s.page.reload(); await sleep(400);
    check("intro: not after a reload", (await box(s)).hidden);
    await s.page.tap("#introBtn"); await sleep(150);
    check("intro: 'Tanıtımı yeniden göster' opens it again", !(await box(s)).hidden && /^1 \/ 8/.test((await box(s)).text));
    await s.page.keyboard.press("Escape"); await sleep(100);
    check("intro: Escape closes it", (await box(s)).hidden);
    pageOk(s, "intro");
    await s.close();
    // A device that already has data (an older version) doesn't get it.
    const o = await t.open({ intro: true, seed: seedLive() });
    await o.goto(); await sleep(400);
    check("intro: not for someone who already uses the app", (await box(o)).hidden);
    await o.close();
  },
  async widgetPage(t) {
    const s = await t.open({ intro: true });
    await s.context.addInitScript(bridge({ widget: "can" }), { widget: "can" });
    await s.goto(); await sleep(400);
    for (let k = 0; k < 8; k++) { await s.page.tap('[data-in="next"]'); await sleep(60); }
    const a = await box(s);
    check("intro in the app: the last page offers the widget", /9 \/ 9 Ana ekran widget’ı/.test(a.text) && /Widget’ı ana ekrana ekle/.test(a.text), a.text.slice(0, 160));
    await s.page.tap('[data-in="pin"]'); await sleep(150);
    check("intro: 'Widget’ı ana ekrana ekle' asks the app to pin it", (await s.page.evaluate(() => window.__b.pins)) === 1 && (await box(s)).hidden);
    await s.close();
  },
  async translateOnPhone(t) {
    // A German phone, the model already on the phone: the page is English, translated.
    const s = await t.open({ liveLang: true, ctx: { locale: "de-DE" }, seed: seedLive() });
    await s.context.addInitScript(bridge({ xl: "ready" }), { xl: "ready" });
    await s.goto(); await sleep(900);
    const a = await s.page.evaluate(() => ({ head: document.getElementById("headline").textContent, feels: document.getElementById("nowFeels").textContent,
      auto: document.querySelector('[data-key="lang"] [aria-pressed="true"]').textContent, sent: window.__b.saved.slice(-1)[0] }));
    note("de:", a.head, "|", a.feels);
    check("translate: German phone → English translated on the phone", /^\[de\] /.test(a.head) && /\[de\] Feels like/.test(a.feels) && a.auto === "Deutsch · auto", a);
    check("translate: the widget is told the language", a.sent && a.sent.lang === "en" && a.sent.xl === "de", a.sent && { lang: a.sent.lang, xl: a.sent.xl });
    pageOk(s, "translate");
    await s.close();
    // Not downloaded yet: English with an offer; after "Translate" the model is fetched and the page translated.
    const n = await t.open({ liveLang: true, ctx: { locale: "es-ES" }, seed: seedLive() });
    await n.context.addInitScript(bridge({ xl: "none" }), { xl: "none" });
    await n.goto(); await sleep(400);
    const bar = await n.page.$eval("#xlBar", (e) => ({ hidden: e.hidden, text: e.innerText }));
    check("translate: offer shown before the download", !bar.hidden && /Translate into Español/.test(bar.text) && /^[A-Z]/.test(await n.page.$eval("#headline", (e) => e.textContent)), bar);
    await n.page.tap('[data-xl="go"]'); await sleep(700);
    const b = await n.page.evaluate(() => ({ prep: window.__b.prep, head: document.getElementById("headline").textContent, bar: document.getElementById("xlBar").hidden }));
    check("translate: download, then translated", b.prep[0] === "es" && /^\[es\] /.test(b.head) && b.bar, b);
    await n.close();
    // "Keep English" stays English.
    const k = await t.open({ liveLang: true, ctx: { locale: "de-DE" }, seed: seedLive() });
    await k.context.addInitScript(bridge({ xl: "none" }), { xl: "none" });
    await k.goto(); await sleep(400);
    await k.page.tap('[data-xl="en"]'); await sleep(200);
    check("translate: 'Keep English' stores English", (await k.stored()).lang === "en" && await k.page.$eval("#xlBar", (e) => e.hidden));
    await k.close();
    // On the website (no app) a German browser gets plain English.
    const w = await t.open({ liveLang: true, ctx: { locale: "de-DE" }, seed: seedLive() });
    await w.goto(); await sleep(400);
    check("translate: website → English, no offer", await w.page.evaluate(() => document.documentElement.lang) === "en" && await w.page.$eval("#xlBar", (e) => e.hidden) && await w.page.$eval("#langAuto", (e) => e.hidden));
    await w.close();
  },
});
