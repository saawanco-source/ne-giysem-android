// First open on a phone with no stored state; location permission granted / prompt / denied / never answered.
const H = require("./lib");
const { check, note, sleep, GPS } = H;

H.run({
  // Nothing stored, browser would ask (state "prompt"). App must not ask on its own; tells the user how to start.
  async firstOpenPrompt(t) {
    const s = await t.open({ geo: { state: "prompt" } });
    await s.goto(); await sleep(400);
    const a = await s.snap();
    note("first screen:", JSON.stringify(a), "| headline:", await s.head());
    await s.shot("01-first-open-prompt");
    check("first open: no permission prompt on its own", s.geo.asked === 0, { asked: s.geo.asked });
    check("first open: status explains how to start", /Başlamak/.test(a.status), a.status);
    check("first open: no weather request before consent", s.net.calls.forecast.length === 0, s.net.calls.forecast.length);
    // tap refresh (the only icon) -> one prompt -> allow
    await s.page.tap("#refresh"); await sleep(900);
    const b = await s.snap();
    note("after refresh + allow:", JSON.stringify(b));
    await s.shot("01-after-allow");
    check("refresh: exactly one prompt", s.geo.asked === 1, { asked: s.geo.asked });
    check("refresh: place is the GPS place (Moda)", b.label === "Moda", b.label);
    check("refresh: weather matches Moda (22°)", b.temp === "22°", b.temp);
    check("refresh: offers 'Bu konumu kaydet'", b.acts.includes("Bu konumu kaydet"), b.acts);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  // Permission already granted (real Chromium geolocation, not the fake): app starts by itself.
  async firstOpenGrantedReal(t) {
    const s = await t.open({ realGeo: { grant: true, coords: GPS.etiler } });
    await s.goto(); await sleep(1200);
    const a = await s.snap();
    note("granted first open:", JSON.stringify(a));
    await s.shot("01-first-open-granted");
    check("granted: starts on its own with GPS place", a.label === "Etiler" && a.temp === "10°", a);
    check("granted: no 'Bu konumu kaydet' when browser remembers", !a.acts.includes("Bu konumu kaydet"), a.acts);
    check("granted: status empty", a.status === "", a.status);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  // Real Chromium without permission (headless denies).
  async firstOpenDeniedReal(t) {
    const s = await t.open({ realGeo: { grant: false, coords: GPS.moda } });
    await s.goto(); await sleep(300);
    note("denied real first:", JSON.stringify(await s.snap()));
    await s.page.tap("#refresh"); await sleep(1200);
    const a = await s.snap();
    note("denied real after refresh:", JSON.stringify(a));
    await s.shot("01-denied-real-ip");
    check("denied: falls back to IP estimate (İstanbul 14°)", a.label === "İstanbul" && a.temp === "14°", a);
    check("denied: wording says approximate location", /yaklaşık konum/.test(a.status), a.status);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  // Fake: state already "denied" before first open.
  async firstOpenDeniedState(t) {
    const s = await t.open({ geo: { state: "denied" } });
    await s.goto(); await sleep(300);
    const a0 = await s.snap();
    note("denied state first screen:", JSON.stringify(a0));
    await s.page.tap("#refresh"); await sleep(800);
    const a = await s.snap();
    note("denied state after refresh:", JSON.stringify(a));
    check("denied state: IP fallback", a.label === "İstanbul", a);
    // "Şu an bulunduğum yeri kaydet" with denied permission
    await s.openSearch(); await s.page.tap("#saveHere"); await sleep(400);
    note("saveHere denied:", await s.status());
    check("saveHere denied: tells to allow in settings", /izin/.test(await s.status()), await s.status());
    await s.close();
  },

  // Person denies at the prompt.
  async promptThenDeny(t) {
    const s = await t.open({ geo: { state: "prompt", answer: "deny" } });
    await s.goto(); await s.page.tap("#refresh"); await sleep(800);
    const a = await s.snap();
    note("deny at prompt:", JSON.stringify(a));
    check("deny: one prompt", s.geo.asked === 1, s.geo.asked);
    check("deny: IP fallback with permission wording", /izni olmadığı/.test(a.status), a.status);
    await s.page.tap("#refresh"); await sleep(800);
    check("deny: refresh again does not prompt again (state denied)", s.geo.asked === 1, s.geo.asked);
    await s.close();
  },

  // Person never answers the browser question (prompt stays open). Real browsers do not run the
  // geolocation timeout while the permission question is open, so getCurrentPosition never returns.
  async promptNeverAnswered(t) {
    const s = await t.open({ geo: { state: "prompt", answer: "hang" } });
    await s.goto(); await s.page.tap("#refresh"); await sleep(1500);
    const a = await s.snap();
    note("prompt open, 1.5 s:", JSON.stringify(a));
    // after "a long time" (we can't wait forever; 15 s > app's 12 s geolocation timeout)
    await sleep(14000);
    const b = await s.snap();
    note("prompt open, 15.5 s:", JSON.stringify(b));
    await s.shot("01-prompt-never-answered");
    check("unanswered prompt: app is not stuck busy after 15 s", !b.busy, b);
    // The person gives up and wants to type a place instead: search works (typeahead isn't blocked)...
    await s.openSearch(); await s.type("moda"); await sleep(900);
    const res = await s.results();
    note("search results while stuck:", res.slice(0, 2));
    if (res.length) { await s.page.tap("#res-0"); await sleep(900); }
    const c = await s.snap();
    note("after choosing Moda while geolocation is hanging:", JSON.stringify(c));
    await s.shot("01-choose-place-while-hanging");
    check("unanswered prompt: choosing a searched place still loads its weather", c.label === "Moda" && c.temp === "22°", c);
    // also a press on the refresh button
    await s.page.tap("#refresh"); await sleep(600);
    check("unanswered prompt: refresh responds", s.net.calls.forecast.length > 0, { forecastCalls: s.net.calls.forecast.length });
    await s.close();
  },

  // Position unavailable / timeout once permission is given -> IP fallback wording.
  async positionTimeout(t) {
    const s = await t.open({ geo: { state: "granted", pos: "timeout" } });
    await s.goto(); await sleep(13000);
    const a = await s.snap();
    note("granted but timeout:", JSON.stringify(a));
    check("timeout: IP fallback wording 'Konum bulunamadı; yaklaşık konum kullanıldı.'", /Konum bulunamadı; yaklaşık/.test(a.status), a.status);
    await s.close();
  },
});
