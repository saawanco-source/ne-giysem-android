// Everything chosen survives a reload; corrupted / old / partial localStorage never breaks the page.
const H = require("./lib");
const { check, note, sleep, GPS, KEY, fc } = H;

H.run({
  async survivesReload(t) {
    const s = await t.open({ geo: { state: "prompt", coords: GPS.moda } });
    await s.goto(); await s.page.tap("#refresh"); await sleep(700);
    for (const q of ["beşiktaş", "kızılay"]) { await s.openSearch(); await s.type(q, 20); await sleep(700); await s.page.tap("#res-0"); await sleep(700); }
    await s.chip("Beşiktaş"); await sleep(600);
    for (const sel of ['[data-key="feel"] [data-val="cold"]', '[data-key="act"] [data-val="field"]', '[data-key="hours"] [data-val="12"]']) await s.page.locator(".seg" + sel).tap();
    const before = await s.snap(), headB = await s.head();
    const segB = await s.page.$$eval('.seg button[aria-pressed="true"]', (b) => b.map((x) => x.dataset.val));
    await s.reload(); await sleep(500);
    const after = await s.snap(), headA = await s.head();
    const segA = await s.page.$$eval('.seg button[aria-pressed="true"]', (b) => b.map((x) => x.dataset.val));
    note("before:", JSON.stringify(before), segB, "| after:", JSON.stringify(after), segA);
    check("reload: same place, chips, temp, headline and settings", before.label === after.label && before.temp === after.temp && JSON.stringify(before.chips) === JSON.stringify(after.chips) && headA === headB && JSON.stringify(segA) === JSON.stringify(segB), { before, after });
    check("reload: no extra prompt", s.geo.asked === 1, s.geo.asked);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  async corruptedStorage(t) {
    const wx = fc(14), now = Date.now();
    const live = (o = {}) => Object.assign({ placeKey: "auto", place: { name: "İstanbul", lat: 41.0, lon: 28.97 }, wx, fetchedAt: now }, o);
    const cases = {
      "invalid JSON": "{places:[",
      "null": "null",
      "array": "[]",
      "number": "42",
      "string": JSON.stringify("hello"),
      "empty object": "{}",
      "places not array": JSON.stringify({ places: { a: 1 }, sel: "x" }),
      "place without name": JSON.stringify({ places: [{ id: "p1", lat: 41, lon: 29 }], sel: "p1", mode: "manual" }),
      "place with lat null": JSON.stringify({ places: [{ id: "p1", name: "Null Ada", lat: null, lon: null }], sel: "p1", mode: "manual" }),
      "place with string coords": JSON.stringify({ places: [{ id: "p1", name: "Str", lat: "41.04", lon: "29.00" }], sel: "p1", mode: "manual" }),
      "sel points to deleted place": JSON.stringify({ places: [], sel: "gone", mode: "live", live: live({ placeKey: "gone" }) }),
      "live without fetchedAt": JSON.stringify({ mode: "live", live: live({ fetchedAt: undefined }) }),
      "live without place name": JSON.stringify({ mode: "live", live: live({ place: { lat: 41, lon: 29 } }) }),
      "live wx hourly empty": JSON.stringify({ mode: "live", live: live({ wx: { hourly: { time: [] } } }) }),
      "live wx hourly arrays missing": JSON.stringify({ mode: "live", live: live({ wx: { hourly: { time: wx.hourly.time } } }) }),
      "live wx from last month": JSON.stringify({ mode: "live", live: live({ fetchedAt: now - 30 * 864e5, wx: (() => { const w = fc(14); w.hourly.time = w.hourly.time.map((x) => x.replace(/^(\d{4})-(\d\d)/, (m, y, mo) => y + "-" + String(Math.max(1, +mo - 1)).padStart(2, "0"))); return w; })() }) }),
      "manual weird values": JSON.stringify({ mode: "manual", manual: { temp: "abc", sky: "lava", wind: 7 }, hours: "6", feel: "freezing", act: 3 }),
      "fix with string date": JSON.stringify({ sel: "auto", mode: "manual", fix: { lat: 41, lon: 29, name: "Fix", at: "yesterday" } }),
      "fix without name": JSON.stringify({ sel: "auto", mode: "manual", fix: { lat: 40.9812, lon: 29.0262, at: now - 3600e3 } }),
      "trip with bad data": JSON.stringify({ places: [{ id: "a", name: "Ev", lat: 41, lon: 29 }, { id: "b", name: "Okul", lat: 41.17, lon: 28.99 }], trips: [{ id: "t1", from: "a", to: "b", days: [0, 1, 2, 3, 4, 5, 6], time: null }], routes: [{ id: "r1", from: "a", to: "b", steps: [null, { m: "walk" }] }], dayWx: { byPlace: { a: wx, b: wx } }, mode: "live", live: live() }),
      "choice weird": JSON.stringify({ choice: { picks: "x", date: 5 }, mode: "live", live: live() }),
    };
    for (const [name, raw] of Object.entries(cases)) {
      const s = await t.open({ seed: { [KEY]: raw }, geo: { state: "prompt", coords: GPS.moda } });
      await s.goto(); await sleep(500);
      const a = await s.snap().catch((e) => ({ err: String(e) }));
      const pageOk = !s.errors.length;
      // the app still responds: open place panel and the manual card or refresh
      let responsive = true;
      try { await s.page.tap("#placeBtn", { timeout: 2000 }); responsive = !(await s.page.$eval("#placePanel", (e) => e.hidden)); } catch (e) { responsive = false; }
      check(`corrupt "${name}": no page error, still usable`, pageOk && responsive, pageOk ? a : s.errors.map((x) => x.split("\n")[0]));
      if (pageOk) note(name, "->", JSON.stringify(a));
      if (name === "trip with bad data" || name === "place without name" || name === "live without fetchedAt") await s.shot("06-corrupt-" + name.replace(/\W+/g, "-"));
      await s.close();
    }
  },

  // After a boot crash caused by stored data: can the person get out of it?
  async recoverFromBootCrash(t) {
    const wx = fc(14);
    const raw = JSON.stringify({ places: [{ id: "a", name: "Ev", lat: 41, lon: 29 }, { id: "b", name: "Okul", lat: 41.17, lon: 28.99 }], trips: [{ id: "t1", from: "a", to: "b", days: [0, 1, 2, 3, 4, 5, 6], time: "23:59" }], routes: [{ id: "r1", from: "a", to: "b", steps: [null] }], dayWx: { byPlace: { a: wx, b: wx } }, mode: "live", live: { placeKey: "auto", place: { name: "İstanbul", lat: 41, lon: 28.97 }, wx, fetchedAt: Date.now() } });
    const s = await t.open({ seed: { [KEY]: raw }, geo: { state: "granted", coords: GPS.moda } });
    await s.goto(); await sleep(400);
    note("boot errors:", s.errors.map((e) => e.split("\n")[0]));
    await s.page.tap("#refresh"); await sleep(800);
    note("after refresh:", JSON.stringify(await s.snap()), "| errors:", s.errors.length);
    check("boot crash: refresh button recovers", (await s.chips()).length > 0, await s.chips());
    const r = s.page.locator("#resetBtn"); await r.scrollIntoViewIfNeeded(); await r.tap(); await r.tap(); await sleep(300);
    const a = await s.snap();
    note("after reset:", JSON.stringify(a));
    check("boot crash: 'Tüm verilerimi sil' recovers", a.chips.length > 0, a);
    await s.close();
  },

  // Data written by an older version under negiysem:v1 (no migration expected, but nothing must break).
  async oldKeyV1(t) {
    const v1 = JSON.stringify({ places: [{ id: "x", name: "Eski Ev", lat: 41, lon: 29 }], sel: "x", city: "İstanbul", unit: "c" });
    const s = await t.open({ seed: { "negiysem:v1": v1 }, geo: { state: "prompt", coords: GPS.moda } });
    await s.goto(); await sleep(400);
    const a = await s.snap();
    note("only v1 data present:", JSON.stringify(a));
    check("old v1 key: no crash", !s.errors.length, s.errors);
    check("old v1 key: saved places carried over (or user told)", a.chips.some((c) => c.includes("Eski Ev")) || /eski|taşı/i.test(a.status), a.chips);
    await s.close();
  },

  // Storage unavailable (private mode / quota): setItem throws.
  async storageThrows(t) {
    const s = await t.open({ geo: { state: "granted", coords: GPS.moda } });
    await s.context.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); }; });
    await s.goto(); await sleep(700);
    const a = await s.snap();
    note("setItem throws:", JSON.stringify(a));
    check("storage throwing: app still works", !s.errors.length && a.label === "Moda", { errors: s.errors, a });
    await s.close();
  },

  // Long place names on a 412 px phone.
  async longNames(t) {
    const long = "Boğaziçi Üniversitesi Güney Kampüsü Kuzey Kapısı Otoparkı Girişi Yanı";
    const seed = { [KEY]: JSON.stringify({ places: [{ id: "p1", name: long, sub: "Sarıyer, İstanbul", lat: 41.1757, lon: 28.99 }, { id: "p2", name: "Ev", lat: 40.98, lon: 28.72 }], sel: "p1", mode: "manual" }) };
    const s = await t.open({ seed, geo: { state: "prompt" } });
    await s.goto(); await sleep(900);
    await s.openPanel(); await sleep(200);
    const ov = await s.page.evaluate(() => ({ docW: document.documentElement.scrollWidth, vw: innerWidth }));
    note("long names:", JSON.stringify(await s.snap()), ov);
    await s.shot("06-long-place-name");
    check("long place name: no horizontal scroll on 412 px", ov.docW <= ov.vw, ov);
    await s.close();
  },
});
