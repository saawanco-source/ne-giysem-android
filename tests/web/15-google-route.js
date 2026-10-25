// "Günüm": the best public-transport route from Google Maps (through the app's /api/route), only after the person turns
// it on; the rainy-day pick keeps you out of the rain but still gets you there on time; nothing of Google's is stored.
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

const IST = 3 * 3600e3;
const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
const KAD = { id: "pkad", name: "Kadıköy", sub: "İstanbul", lat: 40.9903, lon: 29.0277 };
// The page clock: today 09:30 in İstanbul; the trip leaves at 10:30, rain 10:00–13:00 at both ends.
const d = new Date(Date.now() + IST), T = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9 - 3, 30), DOW = d.getUTCDay();
const hm = (ms) => new Date(ms + IST).toISOString().slice(11, 16);

function wet(wx) {
  for (let k = 10; k <= 12; k++) { wx.hourly.weather_code[k] = 63; wx.hourly.precipitation_probability[k] = 90; }
  return wx;
}
function seed(extra = {}) {
  const a = wet(fc(14)), b = wet(fc(15));
  const st = {
    places: [BES, KAD], sel: "pbes", mode: "live", live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx: a, fetchedAt: T },
    trips: [{ id: "t1", from: "pbes", to: "pkad", time: "10:30", days: [DOW] }, { id: "t2", from: "pkad", to: "pbes", time: "18:00", days: [DOW] }],
    routes: [{ id: "r1", from: "pkad", to: "pbes", name: "Vapur", steps: [{ m: "walk", min: 8 }, { m: "ferry", min: 20 }, { m: "walk", min: 6 }] }],
    dayMode: true, dayWx: { fetchedAt: T, byPlace: { pbes: a, pkad: b } },
  };
  return { [KEY]: JSON.stringify(Object.assign(st, extra)) };
}

// Three ways, timed from the asked departure: A is the fastest but walks 15 minutes in the rain; B is 3 minutes later
// and mostly underground; C keeps you driest but arrives 40 minutes later (not on time).
function google(u) {
  const base = Date.parse(u.searchParams.get("depart")), at = (min) => new Date(base + min * 60e3).toISOString();
  const walk = (min) => ({ m: "walk", min, sec: min * 60, dist: min * 80 });
  const ride = (m, line, vehicle, agency, dep, arr, from, to) => ({ m, min: arr - dep, sec: (arr - dep) * 60, line, name: line + " hattı", vehicle,
    color: "#1e88e5", textColor: "#ffffff", from, to, dep: at(dep), arr: at(arr), stops: 5, headsign: "Kadıköy", agency, agencyUrl: "https://example.org/" + agency.length });
  const r = (min, steps) => ({ min, dist: 6000, fare: "", firstDep: steps.find((s) => s.dep).dep, lastArr: [...steps].reverse().find((s) => s.arr).arr, steps });
  return {
    routes: [
      r(32, [walk(15), ride("bus", "559C", "Otobüs", "İETT", 18, 30, "Beşiktaş", "Üsküdar"), walk(2)]),
      r(35, [walk(3), ride("metro", "M2", "Metro", "Metro İstanbul", 10, 30, "Gayrettepe", "Kadıköy"), walk(5)]),
      r(72, [walk(2), ride("bus", "15F", "Otobüs", "İETT", 40, 70, "Beşiktaş", "Kadıköy"), walk(2)]),
    ],
    agencies: [{ name: "İETT", url: "https://example.org/4" }, { name: "Metro İstanbul", url: "https://example.org/14" }],
    source: "Google Maps",
  };
}

async function open(t, o = {}) {
  const s = await t.open(Object.assign({ api: true, seed: seed(o.extra), net: Object.assign({ routeOn: true, route: google }, o.net || {}) }, o.ctx ? { ctx: o.ctx } : {}));
  await s.page.clock.setFixedTime(new Date(T));
  await s.goto(); await sleep(500);
  return s;
}
const trip = (s, n) => s.page.evaluate((n) => {
  const el = document.querySelectorAll("#trips .trip")[n]; if (!el) return null;
  const g = el.querySelector(".gr");
  return { text: el.innerText.replace(/\s+/g, " "), gr: g ? g.innerText.replace(/\s+/g, " ") : "", badges: g ? [...g.querySelectorAll(".gl")].map((b) => b.textContent) : [],
    agencies: g ? [...g.querySelectorAll(".gr-ag a")].map((a) => a.textContent + "@" + a.getAttribute("href")) : [] };
}, n);
const routeCalls = (s) => s.net.calls.route.filter((u) => !u.includes("probe=1"));

H.run({
  async optInFirst(t) {
    const s = await open(t);
    const card = await s.page.$eval("#tripCard", (e) => e.innerText.replace(/\s+/g, " "));
    check("before turning it on: an offer that says what goes to Google", /Toplu taşımada en uygun rotayı bul/.test(card) && /Google Maps’e gönderilir/.test(card), card.slice(-260));
    check("before turning it on: only the probe reached the server", s.net.calls.route.length === 1 && routeCalls(s).length === 0, s.net.calls.route);
    check("the trip without a route of its own still says so", /Bu yolculuk için henüz rota yok/.test((await trip(s, 0)).text));

    await s.page.click('[data-gr="on"]'); await sleep(600);
    const calls = routeCalls(s).map((u) => new URL(u));
    note(calls.map((u) => u.search).join(" | "));
    const c1 = calls.find((u) => u.searchParams.get("from") === "41.04300,29.00700");
    check("one request per trip ahead today", calls.length === 2, calls.map((u) => u.search));
    check("request: the places' coordinates, the departure time, the language", c1 && c1.searchParams.get("to") === "40.99030,29.02770" &&
      Date.parse(c1.searchParams.get("depart")) === T + 60 * 60e3 && c1.searchParams.get("lang") === "tr", c1 && c1.search);

    const a = await trip(s, 0);
    note("t1:", a.gr);
    check("shows Google's route with attribution", /Toplu taşımada en uygunu/.test(a.gr) && /Google Maps/.test(a.gr) && /Sefer saatleri ve rotalar: Google Maps/.test(a.gr), a.gr);
    check("picks the drier route that is still on time (M2), not the fastest or the driest-but-late", a.badges[0] === "M2", a.badges);
    check("leave time puts two minutes at the first stop; arrival", /Çıkış 10:35 · varış 11:05/.test(a.gr), a.gr);
    check("says why: a little later but less rain", /3 dk daha geç varır ama yağmurda daha az kalırsın\./.test(a.gr), a.gr);
    check("the other two are listed", /Diğer seçenekler \(2\)/.test(a.gr), a.gr);
    check("operators named, with their links", a.agencies.join() === "İETT@https://example.org/4,Metro İstanbul@https://example.org/14", a.agencies);
    const b = await trip(s, 1);
    check("a trip with its own routes gets the suggestion too", /Vapur/.test(b.text) && /Toplu taşımada en uygunu/.test(b.gr), b.text.slice(0, 200));

    const stored = await s.page.evaluate((k) => localStorage.getItem(k), KEY);
    check("only the switch is stored, none of Google's routes", /"gRoutes":true/.test(stored) && !/559C|M2|Metro İstanbul|İETT/.test(stored));
    await s.page.$eval("#tripCard", (e) => e.scrollIntoView()); await sleep(200);
    await (await s.page.$("#tripCard")).screenshot({ path: require("path").join(H.SHOTS, "15-google-route.png") });

    await s.page.click('[data-gr="off"]'); await sleep(300);
    const off = await s.page.$eval("#tripCard", (e) => ({ gr: e.querySelectorAll(".gr").length, offer: !!e.querySelector('[data-gr="on"]') }));
    const stored2 = await s.page.evaluate((k) => localStorage.getItem(k), KEY);
    check("turned off: suggestions gone, the offer is back", off.gr === 0 && off.offer && !/gRoutes/.test(stored2), off);
    check("no page or console errors", !s.errors.length && !s.consoleErr.filter((m) => !/Failed to load resource/.test(m)).length, s.errors.concat(s.consoleErr));
    await s.close();
  },
  async english(t) {
    const s = await open(t, { extra: { gRoutes: true, lang: "en" }, ctx: { locale: "en-US" } });
    await sleep(300);
    const a = await trip(s, 0);
    note("t1 en:", a.gr);
    check("English: title, times, reason, attribution", /Best public transport route/.test(a.gr) && /Leave at 10:35 · arrive 11:05/.test(a.gr) &&
      /Arrives 3 min later, but you spend less time in the rain\./.test(a.gr) && /Operated by İETT, Metro İstanbul/.test(a.gr) && /Timetables and routes: Google Maps/.test(a.gr), a.gr);
    check("English request", routeCalls(s).every((u) => new URL(u).searchParams.get("lang") === "en") && routeCalls(s).length === 2);
    await s.close();
  },
  async troubles(t) {
    const s = await open(t, { extra: { gRoutes: true }, net: { fail: { route: (u) => (u.includes("probe=1") ? null : 429) } } });
    const a = await trip(s, 0);
    check("too many requests: says it will try again, no retry storm", /Şu an çok fazla istek var/.test(a.gr) && routeCalls(s).length === 2, [a.gr, routeCalls(s).length]);
    await sleep(800);
    check("still no retry within the quarter hour", routeCalls(s).length === 2, routeCalls(s).length);
    await s.close();

    const off = await open(t, { extra: { gRoutes: true }, net: { routeOn: false } });
    const card = await off.page.$eval("#tripCard", (e) => ({ gr: e.querySelectorAll(".gr").length, offer: !!e.querySelector("[data-gr]") }));
    check("server without Google key: no offer, no suggestions, no requests", card.gr === 0 && !card.offer && routeCalls(off).length === 0, card);
    await off.close();

    const web = await t.open({ seed: seed({ gRoutes: true }) }); // no app server at all (open-data mode)
    await web.page.clock.setFixedTime(new Date(T));
    await web.goto(); await sleep(400);
    check("without the app's server: nothing asked", web.net.calls.route.length === 0, web.net.calls.route);
    await web.close();
  },
});
