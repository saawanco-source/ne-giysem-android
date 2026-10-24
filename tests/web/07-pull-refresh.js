// Pull to refresh (the Android app and the installed web app have no browser refresh gesture).
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

// A saved place with fresh weather, so nothing refreshes on its own when the page opens.
const seed = () => ({ [KEY]: JSON.stringify({
  places: [{ id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 }], sel: "pbes", mode: "live",
  live: { placeKey: "pbes", place: { name: "Beşiktaş", lat: 41.043, lon: 29.007 }, wx: fc(19), fetchedAt: Date.now() } }) });

async function touch(s) {
  const cdp = await s.context.newCDPSession(s.page);
  return async function drag(x, y0, x1, y1, steps = 14) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (x1 - x) * i / steps, y: y0 + (y1 - y0) * i / steps }] });
      await sleep(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
}
const calls = (s) => s.net.calls.forecast.length;

H.run({
  async pullAtTop(t) {
    const s = await t.open({ seed: seed(), net: { delay: { forecast: 600, photon: 0, omgeo: 0, bdc: 0 } } });
    await s.goto(); await sleep(400);
    const drag = await touch(s), before = calls(s);
    check("opening with fresh weather makes no request", before === 0, before);
    await drag(206, 220, 206, 520);
    await sleep(150);
    const spinning = await s.page.$eval(".ptr", (e) => e.classList.contains("spin"));
    check("long pull at the top: spinner shows while loading", spinning, spinning);
    await sleep(1200);
    check("long pull at the top: weather is fetched once", calls(s) === before + 1, calls(s) - before);
    const after = await s.page.$eval(".ptr", (e) => ({ spin: e.classList.contains("spin"), op: getComputedStyle(e).opacity }));
    check("indicator goes away after loading", !after.spin && +after.op < 0.05, after);
    const a = await s.snap();
    check("same place and its weather after the pull", a.label === "Beşiktaş" && a.temp === "19°", a);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  async shortPull(t) {
    const s = await t.open({ seed: seed() });
    await s.goto(); await sleep(400);
    const drag = await touch(s);
    await drag(206, 220, 206, 300, 6);
    await sleep(800);
    check("short pull: no refresh", calls(s) === 0, calls(s));
    await s.close();
  },

  async scrolledDown(t) {
    const s = await t.open({ seed: seed() });
    await s.goto(); await sleep(400);
    await s.page.evaluate(() => window.scrollTo(0, 700)); await sleep(200);
    const drag = await touch(s);
    await drag(206, 300, 206, 650);
    await sleep(800);
    const y = await s.page.evaluate(() => window.scrollY);
    check("pull while scrolled down: page scrolls, no refresh", calls(s) === 0 && y < 700, { calls: calls(s), scrollY: y });
    await s.close();
  },

  async sidewaysOnHourStrip(t) {
    const s = await t.open({ seed: seed() });
    await s.goto(); await sleep(400);
    const box = await s.page.$eval("#hours", (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await s.page.evaluate(() => window.scrollTo(0, 0));
    const drag = await touch(s);
    if (box.y > 0 && box.y < 900) await drag(box.x, box.y, box.x - 150, box.y + 60);
    await sleep(800);
    check("swipe on the hour strip: no refresh", calls(s) === 0, calls(s));
    await s.close();
  },

  // Android draws a square blue flash over tapped elements unless the page turns it off.
  async noTapFlash(t) {
    const s = await t.open({ seed: seed() });
    await s.goto(); await sleep(300);
    await s.openPanel();
    const r = await s.page.evaluate(() => ["#refresh", "#placeBtn", ".stk", ".mini", "#chips .chip", ".seg button", "summary", ".src a"].map((sel) => {
      const e = document.querySelector(sel); if (!e) return sel + ": missing";
      const c = getComputedStyle(e).webkitTapHighlightColor;
      return /rgba\(0, 0, 0, 0\)|transparent/.test(c) ? null : sel + ": " + c;
    }).filter(Boolean));
    check("no tap flash on buttons, stickers, chips and links", !r.length, r);
    await s.close();
  },

  async pullWhileLoading(t) {
    const s = await t.open({ seed: seed(), net: { delay: { forecast: 1500, photon: 0, omgeo: 0, bdc: 0 } } });
    await s.goto(); await sleep(400);
    await s.page.tap("#refresh"); await sleep(100);
    const drag = await touch(s);
    await drag(206, 220, 206, 520);
    await sleep(2200);
    check("pull while already loading: no second request", calls(s) === 1, calls(s));
    const spin = await s.page.$eval(".ptr", (e) => e.classList.contains("spin"));
    check("indicator not stuck", !spin, spin);
    await s.close();
  },
});
