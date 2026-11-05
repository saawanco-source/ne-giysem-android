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
// Goes through the tour as a person would: "İleri" where there is one, otherwise a tap on the lit part (once it has
// stopped moving, never on the bubble). Returns the step titles seen.
async function walk(s, max, stopAt) {
  const titles = [];
  for (let k = 0; k < max; k++) {
    const b = await s.page.$eval("#tourBox", (e) => ({ hidden: e.closest(".tour").hidden, title: (e.querySelector("h2") || {}).textContent, next: !!e.querySelector("[data-tour=next]") }));
    if (b.hidden || (stopAt && await s.page.$(stopAt))) break;
    titles.push(b.title);
    if (b.next) { await s.page.tap('[data-tour="next"]'); await sleep(450); continue; }
    let pt = null;
    for (let w = 0; w < 20; w++) {
      const p1 = await s.page.evaluate(() => JSON.stringify(document.getElementById("tourHole").getBoundingClientRect()));
      await sleep(120);
      const p2 = await s.page.evaluate(() => JSON.stringify(document.getElementById("tourHole").getBoundingClientRect()));
      if (p1 === p2) break;
    }
    pt = await s.page.evaluate(() => {
      const h = document.getElementById("tourHole").getBoundingClientRect(), bx = document.getElementById("tourBox").getBoundingClientRect();
      const inBox = (x, y) => x >= bx.left && x <= bx.right && y >= bx.top && y <= bx.bottom;
      const c = Array.from(document.querySelectorAll("button,[role=button]")).filter((x) => { const r = x.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return r.width && cx >= h.left && cx <= h.right && cy >= h.top && cy <= h.bottom && !inBox(cx, cy) && !document.getElementById("tourBox").contains(x); });
      const t = c[Math.floor(c.length / 2)] || null; if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!pt) { await s.page.tap('[data-tour="skip"]'); break; }
    await s.page.mouse.click(pt.x, pt.y); await sleep(700);
  }
  return titles;
}
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
  // The guided tour: the real screen, one lit part at a time; a tap anywhere else does nothing.
  async guidedTour(t) {
    const s = await t.open({ intro: true, seed: { [KEY]: JSON.stringify({ intro: false, places: [BES], sel: "pbes", mode: "live",
      live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx: fc(9), fetchedAt: Date.now() } }) } });
    await s.goto(); await sleep(500);
    const box = () => s.page.$eval("#tourBox", (e) => ({ hidden: e.closest(".tour").hidden, title: (e.querySelector("h2") || {}).textContent, n: (e.querySelector(".to-n") || {}).textContent, next: !!e.querySelector("[data-tour=next]") }));
    let b = await box();
    check("tour: starts on the first open", !b.hidden && b.title === "Hoş geldin!", b);
    await s.page.tap('[data-tour="next"]'); await sleep(500);
    b = await box();
    check("tour: step 2 lights the place button", b.title === "Yerin", b);
    // a tap elsewhere is ignored
    await s.page.mouse.click(20, 600); await sleep(200);
    check("tour: a tap outside the lit part does nothing", (await box()).title === "Yerin" && await s.page.$eval("#placePanel", (e) => e.hidden));
    const titles = await walk(s, 40);
    for (let k = 0; k < 0; k++) {
      b = await box(); if (b.hidden) break;
      titles.push(b.title);
      if (b.next) { await s.page.tap('[data-tour="next"]'); await sleep(450); continue; }
      // tap the lit part: its first button (or the part itself)
      const pt = await s.page.evaluate(() => { const h = document.getElementById("tourHole").getBoundingClientRect(); const cx = h.left + h.width / 2, cy = h.top + h.height / 2;
        let el = document.elementFromPoint(cx, cy); const btn = el && el.closest("button,[role=button]"); if (btn) return { x: cx, y: cy };
        const c = Array.from(document.querySelectorAll("button,[role=button]")).find((x) => { const r = x.getBoundingClientRect(); return r.width && r.left >= h.left && r.right <= h.right && r.top >= h.top && r.bottom <= h.bottom; });
        if (c) { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } return { x: cx, y: cy }; });
      await s.page.mouse.click(pt.x, pt.y); await sleep(900);
    }
    note("tour steps:", titles.join(" › "));
    const want = ["Yerin", "Konum ya da yer", "Kapat", "Bugünün kıyafeti", "Nedeni", "Saat saat", "O saatin kıyafeti", "Bu hafta", "Soğuğa karşı", "Ne yapacaksın?", "Dışarıda ne kadar?", "Dolabım", "Olmayan parça", "Tamam", "Günüm", "Rutinim", "Bavul", "Takvim", "Uyarılarım", "Hazırsın!"];
    const missing = want.filter((w) => titles.indexOf(w) < 0);
    check("tour: every part is walked through by using it", !missing.length && (await box()).hidden, { missing, titles });
    check("tour: finished, not shown again", (await s.stored()).intro === true && !(await s.page.$eval("#packSheet", (e) => !e.hidden)));
    pageOk(s, "tour");
    await s.close();
    // Skip, and again from the settings
    const k = await t.open({ intro: true });
    await k.goto(); await sleep(400);
    await k.page.tap('[data-tour="skip"]'); await sleep(200);
    check("tour: 'Atla' ends it", (await k.page.$eval("#tour", (e) => e.hidden)) && (await k.stored()).intro === true);
    await k.page.reload(); await sleep(400);
    check("tour: not after a reload", await k.page.$eval("#tour", (e) => e.hidden));
    await k.page.tap("#introBtn"); await sleep(300);
    check("tour: 'Tanıtımı yeniden göster' starts it again", !(await k.page.$eval("#tour", (e) => e.hidden)));
    await k.page.keyboard.press("Escape"); await sleep(150);
    check("tour: Escape ends it", await k.page.$eval("#tour", (e) => e.hidden));
    await k.close();
    const o = await t.open({ intro: true, seed: seedLive() });
    await o.goto(); await sleep(400);
    check("tour: not for someone who already uses the app", await o.page.$eval("#tour", (e) => e.hidden));
    await o.close();
  },
  async widgetStep(t) {
    const s = await t.open({ intro: true, seed: { [KEY]: JSON.stringify({ intro: false }) } });
    await s.context.addInitScript(bridge({ widget: "can" }), { widget: "can" });
    await s.goto(); await sleep(400);
    await walk(s, 40, "[data-tour=pin]");
    const pin = await s.page.$("[data-tour=pin]");
    check("tour in the app: the widget is offered", !!pin);
    if (pin) { await pin.tap(); await sleep(200); }
    check("tour: 'Widget’ı ana ekrana ekle' asks the app to pin it", (await s.page.evaluate(() => window.__b.pins)) === 1);
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
