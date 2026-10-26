// The app's server out of reach (in Türkiye *.pages.dev is blocked on many networks): the page gets the weather from
// MET Norway itself (forecast-lib.js, the server's own builder), place names and the rough location from BigDataCloud,
// search from Photon; for half an hour it doesn't try the server again.
const H = require("./lib");
const { check, note, sleep, GPS, API_ORIGIN } = H;

const blocked = (u) => (u.startsWith(API_ORIGIN) ? "abort" : null);
const NET = { fail: { forecast: blocked, bdc: blocked, photon: blocked, route: blocked } };
const apiCalls = (s) => Object.values(s.net.calls).flat().filter((u) => u.startsWith(API_ORIGIN));

H.run({
  async weatherWithoutServer(t) {
    const s = await t.open({ api: true, net: NET, geo: { state: "granted", coords: GPS.etiler } });
    await s.goto(); await sleep(2500);
    const a = await s.snap();
    note("blocked server:", JSON.stringify(a), "| api calls:", apiCalls(s).length, "| met:", s.net.calls.met.length);
    check("weather from MET Norway directly (Etiler 10°)", a.label === "Etiler" && a.temp === "10°", a);
    check("no error shown", !/alınamadı|ulaşılamadı/.test(a.status), a.status);
    check("place name from BigDataCloud directly", s.net.calls.bdc.some((u) => u.includes("api.bigdatacloud.net")), s.net.calls.bdc);
    check("MET asked once, for the place's ~1 km cell", s.net.calls.met.length === 1 && /lat=41\.17&lon=28\.99/.test(s.net.calls.met[0]), s.net.calls.met);
    const before = apiCalls(s).length;

    await s.page.tap("#refresh"); await sleep(1500);
    check("refresh: straight to MET, the server isn't tried again for a while", apiCalls(s).length === before && s.net.calls.met.length === 2,
      { api: apiCalls(s).length, before, met: s.net.calls.met.length });

    await s.openSearch(); await s.page.fill("#q", "kadıköy"); await sleep(1200);
    check("search goes to Photon directly", s.net.calls.photon.some((u) => u.includes("photon.komoot.io")) && apiCalls(s).length === before, s.net.calls.photon);
    check("no page errors", !s.errors.length, s.errors);
    await s.shot("17-server-blocked");

    // Half an hour later the server is tried again (and, working again, used).
    s.net.fail = { forecast: null, bdc: null, photon: null, route: null, met: null };
    await s.page.evaluate(() => { localStorage.setItem("negiysem:v2:apidown", String(Date.now() - 1000)); });
    await s.page.reload(); await sleep(1500);
    const metNow = s.net.calls.met.length;
    await s.page.tap("#refresh"); await sleep(1500);
    check("after the half hour: the server again", apiCalls(s).some((u) => u.includes("/api/forecast")) && s.net.calls.met.length === metNow, { met: s.net.calls.met.length, metNow });
    await s.close();
  },
  async metAlsoDown(t) {
    const s = await t.open({ api: true, net: { fail: Object.assign({}, NET.fail, { met: 503 }) }, geo: { state: "granted", coords: GPS.etiler } });
    await s.goto(); await sleep(2500);
    const a = await s.snap();
    check("server and MET both down: says it couldn't get the weather, offers to retry", /Hava servisine ulaşılamadı|Hava durumu alınamadı/.test(a.status) && a.acts.includes("Tekrar dene"), a);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },
});
