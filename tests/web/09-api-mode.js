// "API mode": with the app's own server configured, every weather / place / location call goes there and nowhere else.
const H = require("./lib");
const { check, note, sleep, GPS, KEY, API_ORIGIN } = H;
const DIRECT = /open-meteo\.com|photon\.komoot\.io|bigdatacloud\.net|geojs\.io/;

function direct(s) { return s.net.log.filter((x) => DIRECT.test(x.url)).map((x) => x.url); }
function viaApi(s) { return s.net.log.filter((x) => x.url.startsWith(API_ORIGIN + "/api/")).map((x) => new URL(x.url).pathname); }

H.run({
  async gpsAndWeather(t) {
    const s = await t.open({ api: true, geo: { state: "granted", coords: GPS.moda } });
    await s.goto(); await sleep(800);
    const a = await s.snap();
    check("granted GPS: Moda's weather via the app's server", a.label === "Moda" && a.temp === "22°", a);
    check("calls went to /api/forecast and /api/reverse", viaApi(s).includes("/api/forecast") && viaApi(s).includes("/api/reverse"), viaApi(s));
    check("nothing called the free services directly", !direct(s).length, direct(s));
    const credit = await s.page.$eval("#wxCredit", (e) => e.textContent);
    check("credit names MET Norway", /MET Norway/.test(credit), credit);
    const foot = await s.page.$eval("#foot", (e) => e.innerHTML);
    check("footer links the privacy page on the app's server", foot.includes(API_ORIGIN + "/gizlilik.html"), foot.slice(-160));
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  async deniedUsesServerIp(t) {
    const s = await t.open({ api: true, geo: { state: "prompt", answer: "deny", coords: GPS.moda } });
    await s.goto(); await sleep(300);
    await s.page.tap("#refresh"); await sleep(900);
    const a = await s.snap();
    check("denied: rough location from the app's server", a.label === "İstanbul" && /yaklaşık/.test(a.status), a);
    check("used /api/ip", viaApi(s).includes("/api/ip"), viaApi(s));
    check("nothing called the free services directly", !direct(s).length, direct(s));
    await s.close();
  },

  async searchViaServer(t) {
    const s = await t.open({ api: true, geo: { state: "granted", coords: GPS.moda } });
    await s.goto(); await sleep(800);
    await s.openSearch(); await s.type("beşiktaş", 30); await sleep(900);
    const r = await s.results();
    check("search results come from /api/search", r.length && /Beşiktaş/.test(r[0]) && viaApi(s).includes("/api/search"), { r, api: viaApi(s) });
    const searchUrl = s.net.log.find((x) => x.url.includes("/api/search")).url;
    check("search sends no extra Photon parameters (the server adds them)", !/limit=|zoom=/.test(searchUrl), searchUrl);
    await s.page.tap("#res-0"); await sleep(900);
    const a = await s.snap();
    check("chosen place loads its weather", a.label === "Beşiktaş" && a.temp === "19°", a);
    check("nothing called the free services directly", !direct(s).length, direct(s));
    await s.close();
  },

  async withoutServerStaysDirect(t) {
    const s = await t.open({ geo: { state: "granted", coords: GPS.moda } });
    await s.goto(); await sleep(800);
    check("without a server the old direct services are used", direct(s).length > 0 && !viaApi(s).length, { direct: direct(s).length, api: viaApi(s) });
    await s.close();
  },
});
