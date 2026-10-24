// Offline after a good load, offline on first open, back online, manual mode and back to live.
const H = require("./lib");
const { check, note, sleep, GPS, KEY } = H;

async function goOffline(s, on) { s.net.offline = on; await s.context.setOffline(on); await sleep(200); }
async function addPlace(s, q) { await s.openSearch(); await s.type(q, 20); await sleep(700); await s.page.tap("#res-0"); await sleep(700); }

H.run({
  async offlineAfterLoad(t) {
    const s = await t.open({ geo: { state: "granted", coords: GPS.moda } });
    await s.goto(); await sleep(500);
    await addPlace(s, "beşiktaş"); await s.chip("Konumum"); await sleep(600);
    await goOffline(s, true);
    await s.page.tap("#refresh"); await sleep(600);
    const a = await s.snap();
    note("offline refresh:", JSON.stringify(a));
    check("offline refresh: says offline, keeps last weather", /Çevrimdışısın/.test(a.status) && a.label === "Moda" && a.temp === "22°", a);
    // switch to a saved place while offline
    await s.chip("Beşiktaş"); await sleep(600);
    const b = await s.snap();
    note("offline, tapped Beşiktaş:", JSON.stringify(b));
    await s.shot("04-offline-chip-switch");
    check("offline chip switch: pressed chip matches the shown place", !(b.chips.includes("[*]Beşiktaş") && b.label !== "Beşiktaş"), { label: b.label, temp: b.temp, chips: b.chips });
    await goOffline(s, false);
    await s.page.evaluate(() => window.dispatchEvent(new Event("online"))); await sleep(800);
    const c = await s.snap();
    note("back online:", JSON.stringify(c), "forecast calls:", s.net.calls.forecast.length);
    check("back online: the chosen place (Beşiktaş) gets loaded", c.label === "Beşiktaş" && c.temp === "19°", { label: c.label, temp: c.temp, chips: c.chips });
    await s.reload(); await sleep(500);
    const d = await s.snap();
    note("reload after that:", JSON.stringify(d));
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  async offlineFirstOpen(t) {
    const s = await t.open({ geo: { state: "prompt", coords: GPS.moda } });
    await goOffline(s, true);
    await s.goto(); await sleep(300); // shell served as if from the service-worker cache
    const a = await s.snap();
    note("first open, offline:", JSON.stringify(a));
    await s.shot("04-offline-first-open");
    check("first open offline: status says the device is offline", /Çevrimdışı/.test(a.status), a.status);
    await s.page.tap("#refresh"); await sleep(800);
    const b = await s.snap();
    note("offline, tapped refresh:", JSON.stringify(b), "prompts:", s.geo.asked);
    await s.shot("04-offline-first-refresh");
    check("offline first refresh: says offline", /Çevrimdışısın/.test(b.status), b.status);
    await goOffline(s, false);
    await s.page.evaluate(() => window.dispatchEvent(new Event("online"))); await sleep(900);
    const c = await s.snap();
    note("back online:", JSON.stringify(c), "prompts:", s.geo.asked);
    await s.shot("04-offline-first-back-online");
    check("back online: place has a real name (not 'Konumun')", c.label !== "Konumun", c.label);
    await s.close();
  },

  async manualAndBack(t) {
    const s = await t.open({ geo: { state: "granted", coords: GPS.moda } });
    await s.goto(); await sleep(500);
    await s.chip("Elle ayarla"); await sleep(300);
    // set 3° snow
    await s.page.$eval("#mTemp", (e) => { e.value = "3"; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await s.page.locator('.seg[data-key="sky"] button[data-val="snow"]').tap();
    const a = await s.snap();
    note("manual:", JSON.stringify(a), "| head:", await s.head());
    check("manual: label 'Elle ayar' and 3°", a.label === "Elle ayar" && a.temp === "3°", a);
    await s.reload(); await sleep(400);
    const b = await s.snap();
    check("manual survives reload (no auto switch to live)", b.label === "Elle ayar" && b.temp === "3°", b);
    // go stale and reload: still manual
    await s.page.evaluate((k) => { const st = JSON.parse(localStorage.getItem(k)); st.live.fetchedAt -= 5 * 3600e3; localStorage.setItem(k, JSON.stringify(st)); }, KEY);
    await s.reload(); await sleep(500);
    check("manual + stale weather + reload: stays manual", (await s.label()) === "Elle ayar", await s.label());
    // back to live via chip
    await s.chip("Konumum"); await sleep(600);
    const c = await s.snap();
    check("back to live via Konumum chip", c.label === "Moda" && c.temp === "22°", c);
    // back to manual, then refresh button -> live again (is that expected?)
    await s.chip("Elle ayarla"); await s.page.tap("#refresh"); await sleep(600);
    note("manual + refresh button:", JSON.stringify(await s.snap()));
    await s.close();
  },

  // Manual chosen while a live request is still running.
  async manualDuringFetch(t) {
    const s = await t.open({ geo: { state: "granted", coords: GPS.moda }, net: { delay: { forecast: 2500, photon: 0, omgeo: 0, bdc: 0 } } });
    await s.goto(); await sleep(300);
    await s.chip("Elle ayarla"); await sleep(100);
    const a = await s.snap();
    await sleep(3000);
    const b = await s.snap();
    note("manual tapped during fetch:", JSON.stringify(a), "→ after fetch:", JSON.stringify(b));
    check("manual chosen during a fetch stays manual", b.label === "Elle ayar", b);
    await s.close();
  },
});
