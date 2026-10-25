// Wide screens (two columns): the outfit card sticks beside the left-hand cards while scrolling, but must stop
// before "Rutinim", which spans both columns below; it used to slide over the routine editor.
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
const KAD = { id: "pkad", name: "Kadıköy", sub: "İstanbul", lat: 40.9903, lon: 29.0277 };

function seed() {
  const wx = fc(17);
  for (let k = 0; k < 10; k++) { wx.hourly.weather_code[k] = 61; wx.hourly.precipitation_probability[k] = 80; } // 4 stickers + umbrella
  const dow = new Date().getDay();
  return { [KEY]: JSON.stringify({
    places: [BES, KAD], sel: "pbes", mode: "live",
    live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx, fetchedAt: Date.now() },
    trips: [{ id: "t1", from: "pbes", to: "pkad", time: "08:30", days: [dow] }, { id: "t2", from: "pkad", to: "pbes", time: "18:00", days: [dow] }],
    routes: [{ id: "r1", from: "pbes", to: "pkad", name: "Vapur", steps: [{ m: "walk", min: 10, slope: "up" }, { m: "ferry", min: 20 }, { m: "walk", min: 10, slope: "flat" }] }],
    dayMode: false,
  }) };
}

H.run({
  async stickyStopsBeforeRoutine(t) {
    for (const [w, h] of [[1000, 800], [1366, 768], [1920, 1000]]) {
      const s = await t.open({ seed: seed(), ctx: { viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: false, hasTouch: false } });
      await s.goto(); await sleep(400);
      await s.page.click("#routineBtn"); await sleep(700);
      const total = await s.page.evaluate(() => document.documentElement.scrollHeight);
      let worst = 0, stuck = false;
      for (let y = 0; y <= total - h; y += 40) {
        const r = await s.page.evaluate((y) => {
          window.scrollTo(0, y);
          const b = document.querySelector(".board").getBoundingClientRect(), e = document.getElementById("routine").getBoundingClientRect();
          const across = Math.min(b.right, e.right) > Math.max(b.left, e.left);
          return { overlap: across ? Math.max(0, Math.min(b.bottom, e.bottom) - Math.max(b.top, e.top)) : 0, top: b.top };
        }, y);
        worst = Math.max(worst, r.overlap);
        if (y > 300 && Math.abs(r.top - 20) < 2) stuck = true; // still sticks while the left column scrolls
      }
      note(`${w}x${h}: most overlap with Rutinim ${worst}px, sticks: ${stuck}`);
      check(`${w}px: outfit card never covers Rutinim`, worst === 0, worst);
      check(`${w}px: outfit card still sticks while scrolling`, stuck, stuck);
      await s.close();
    }
  },
});
