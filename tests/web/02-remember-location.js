// "Remember last location": a GPS fix is stored and reused (no new permission question) while the
// browser says the permission is not "granted". Counts permission prompts (geo.asked).
const H = require("./lib");
const { check, note, sleep, GPS, KEY } = H;

const age = (st, ms) => { st.live.fetchedAt -= ms; return st; };

H.run({
  // Browser that never remembers (prompt every time it's asked).
  async neverRemembers(t) {
    const s = await t.open({ geo: { state: "prompt", answer: "allow", coords: GPS.moda } });
    await s.goto(); await s.page.tap("#refresh"); await sleep(800);
    check("1st fix: one prompt", s.geo.asked === 1, s.geo.asked);
    const st = await s.stored();
    check("fix stored", st.fix && Math.abs(st.fix.lat - GPS.moda.lat) < 1e-6 && st.fix.name === "Moda", st.fix);
    for (let i = 0; i < 4; i++) { await s.page.tap("#refresh"); await sleep(400); }
    const a = await s.snap();
    note("after 4 refreshes:", JSON.stringify(a));
    check("refresh x4: no new prompt", s.geo.asked === 1, s.geo.asked);
    check("status says last known location + 'Konumumu güncelle'", /Son bilinen konumun kullanılıyor \(bugün \d\d:\d\d\)/.test(a.status) && a.acts.includes("Konumumu güncelle"), a);
    // reload twice (weather fresh, then stale)
    await s.reload(); await sleep(400);
    note("reload (fresh weather):", JSON.stringify(await s.snap()));
    check("reload: no prompt", s.geo.asked === 1, s.geo.asked);
    await s.page.evaluate((k) => { const st = JSON.parse(localStorage.getItem(k)); st.live.fetchedAt -= 3 * 3600e3; localStorage.setItem(k, JSON.stringify(st)); }, KEY);
    await s.reload(); await sleep(700);
    const b = await s.snap();
    note("reload (3 h old weather):", JSON.stringify(b));
    check("stale reload: refreshed automatically without prompt", s.geo.asked === 1 && /Son bilinen/.test(b.status), { asked: s.geo.asked, b });
    // visibility change
    await s.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await sleep(400);
    check("visibilitychange: no prompt", s.geo.asked === 1, s.geo.asked);
    // Konumumu güncelle -> exactly one prompt; person moved to Etiler
    s.geo.coords = GPS.etiler;
    await s.page.click("#status button"); await sleep(800);
    const c = await s.snap();
    note("after Konumumu güncelle:", JSON.stringify(c));
    check("güncelle: one more prompt", s.geo.asked === 2, s.geo.asked);
    check("güncelle: new place + its weather", c.label === "Etiler" && c.temp === "10°", c);
    check("güncelle: offers 'Bu konumu kaydet'", c.acts.includes("Bu konumu kaydet"), c.acts);
    await s.page.click("#status button"); await sleep(600);
    const d = await s.snap(), st2 = await s.stored();
    note("after Bu konumu kaydet:", JSON.stringify(d), "places:", st2.places.map((p) => p.name + "/" + p.sub));
    check("kaydet: place saved & selected", st2.places.length === 1 && st2.sel === st2.places[0].id && d.chips.some((x) => x.startsWith("[*]Etiler")), d.chips);
    await s.shot("02-after-save-fix");
    // a fresh fix next to a saved place must not offer saving again
    await s.chip("Konumum"); await sleep(600);
    note("Konumum after save:", JSON.stringify(await s.snap()));
    await s.page.click("#status button"); await sleep(700); // Konumumu güncelle again, same spot
    const e = await s.snap();
    note("fresh fix next to saved place:", JSON.stringify(e));
    check("fresh fix next to saved place: no 'Bu konumu kaydet'", !e.acts.includes("Bu konumu kaydet"), e.acts);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  // Browser that remembers after the first "allow" (Chrome https): fresh fix each time, never asks again.
  async remembers(t) {
    const s = await t.open({ geo: { state: "prompt", answer: "allow", remembers: true, coords: GPS.moda } });
    await s.goto(); await s.page.tap("#refresh"); await sleep(800);
    const a = await s.snap();
    note("remembering browser 1st:", JSON.stringify(a));
    check("remembers: no 'Bu konumu kaydet' (browser remembers)", !a.acts.includes("Bu konumu kaydet"), a);
    s.geo.coords = GPS.etiler;
    await s.page.tap("#refresh"); await sleep(800);
    const b = await s.snap();
    check("remembers: refresh gets a fresh position (moved -> Etiler)", b.label === "Etiler" && b.temp === "10°", b);
    check("remembers: asked only once", s.geo.asked === 1, s.geo.asked);
    await s.close();
  },

  // Stored fix, but the person later blocks location in browser settings -> denied.
  async fixThenDenied(t) {
    const s = await t.open({ geo: { state: "prompt", answer: "allow", coords: GPS.trabzon } });
    await s.goto(); await s.page.tap("#refresh"); await sleep(800);
    s.geo.state = "denied";
    await s.page.tap("#refresh"); await sleep(600);
    const a = await s.snap();
    note("denied with stored fix:", JSON.stringify(a));
    check("denied+fix: keeps using last fix (Trabzon)", a.label === "Trabzon" && a.temp === "7°", a);
    // the action offered is 'Konumumu güncelle' which can never work while denied
    if (a.acts.includes("Konumumu güncelle")) {
      await s.page.click("#status button"); await sleep(600);
      const b = await s.snap();
      note("Konumumu güncelle while denied:", JSON.stringify(b));
      check("denied: 'Konumumu güncelle' explains the permission is blocked", /izin/i.test(b.status), b.status);
    }
    await s.close();
  },

  // A stale fix from yesterday in another city: status must say it is old; place must be the old one, not silently mixed.
  async staleFixOtherCity(t) {
    // Noon yesterday (Istanbul), so it reads as "dün" whatever time the suite runs.
    const ist = new Date(Date.now() + 3 * 3600e3), yesterday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 3 * 3600e3 - 12 * 3600e3;
    const seed = { [KEY]: JSON.stringify({ places: [], sel: "auto", mode: "manual", fix: { lat: GPS.trabzon.lat, lon: GPS.trabzon.lon, name: "Trabzon", at: yesterday } }) };
    const s = await t.open({ seed, geo: { state: "prompt", coords: GPS.moda } });
    await s.goto(); await sleep(800);
    const a = await s.snap();
    note("reopen with yesterday's Trabzon fix:", JSON.stringify(a));
    await s.shot("02-stale-fix");
    check("stale fix: no prompt on open", s.geo.asked === 0, s.geo.asked);
    check("stale fix: status names the date ('dün')", /dün \d\d:\d\d/.test(a.status), a.status);
  },

  // GPS works but reverse geocoding (BigDataCloud) fails once -> fix is stored nameless forever.
  async fixWithoutName(t) {
    const s = await t.open({ geo: { state: "prompt", coords: GPS.moda }, net: { fail: { forecast: null, photon: null, omgeo: null, bdc: 503 } } });
    await s.goto(); await s.page.tap("#refresh"); await sleep(800);
    note("bdc down:", JSON.stringify(await s.snap()));
    s.net.fail.bdc = null; // service back
    await s.page.tap("#refresh"); await sleep(600);
    await s.reload(); await sleep(300);
    await s.page.tap("#refresh"); await sleep(600);
    const a = await s.snap();
    note("bdc back, after refresh+reload+refresh:", JSON.stringify(a));
    await s.shot("02-fix-without-name");
    check("fix name recovers once reverse geocoding works again", a.label !== "Konumun", a.label);
    await s.close();
  },

  // Permission blocked, approximate (IP) location in use: weather hours old on reopen. Refreshing would not show any
  // permission question (denied answers at once), so it could refresh by itself.
  async deniedStaleWeather(t) {
    const s = await t.open({ geo: { state: "denied" } });
    await s.goto(); await s.page.tap("#refresh"); await sleep(700);
    await s.page.evaluate((k) => { const st = JSON.parse(localStorage.getItem(k)); st.live.fetchedAt -= 4 * 3600e3; localStorage.setItem(k, JSON.stringify(st)); }, KEY);
    const n0 = s.net.calls.forecast.length;
    await s.reload(); await sleep(800);
    const a = await s.snap(), facts = await s.page.$$eval("#facts .fact", (f) => f.map((x) => x.textContent));
    note("denied + 4 h old weather, reopened:", JSON.stringify(a), facts.slice(-1), "| new forecast calls:", s.net.calls.forecast.length - n0);
    check("denied + stale weather: refreshed on open (no prompt possible)", s.net.calls.forecast.length > n0, { calls: s.net.calls.forecast.length - n0, status: a.status });
    await s.close();
  },

  // "Tüm verilerimi sil" forgets the fix; next refresh asks again (that is expected) and nothing comes back.
  async resetForgetsFix(t) {
    const s = await t.open({ geo: { state: "prompt", coords: GPS.moda } });
    await s.goto(); await s.page.tap("#refresh"); await sleep(700);
    await s.page.click("#status button"); await sleep(600); // save fix as a place
    const r = s.page.locator("#resetBtn"); await r.scrollIntoViewIfNeeded(); await r.tap(); await r.tap(); await sleep(300);
    const st = await s.page.evaluate((k) => localStorage.getItem(k), KEY);
    const a = await s.snap();
    note("after reset:", JSON.stringify(a), "| storage:", st);
    check("reset: storage empty", st === null, st);
    check("reset: back to first-open look", a.label === "Elle ayar" && a.chips.join() === "Konumum,+ Yer ekle,[*]Elle ayarla", a);
    await s.reload(); await sleep(400);
    const b = await s.snap();
    note("reload after reset:", JSON.stringify(b));
    check("reset+reload: no fix reused, no prompt", s.geo.asked === 1 && /Başlamak/.test(b.status), { asked: s.geo.asked, b });
    await s.close();
  },

  // Reset while a location/weather request is still running.
  async resetDuringFetch(t) {
    const s = await t.open({ geo: { state: "granted", coords: GPS.moda, delay: 2500 } });
    await s.goto(); await sleep(300); // auto-start (granted) -> GPS takes 2.5 s
    const r = s.page.locator("#resetBtn"); await r.scrollIntoViewIfNeeded(); await r.tap(); await r.tap(); await sleep(200);
    note("right after reset:", JSON.stringify(await s.snap()), "| storage:", await s.page.evaluate((k) => localStorage.getItem(k), KEY));
    await sleep(3500);
    const st = await s.stored(), a = await s.snap();
    note("3.5 s after reset:", JSON.stringify(a), "| storage fix:", st && st.fix, "| live place:", st && st.live && st.live.place.name);
    await s.page.evaluate(() => window.scrollTo(0, 0)); await s.shot("02-reset-during-fetch");
    check("reset during fetch: location does not come back into storage", !st || (!st.fix && !st.live), st && { fix: st.fix, live: st.live && st.live.place });
    await s.close();
  },
});
