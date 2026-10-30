// Findings from the autumn beta test (Istanbul, late October–November 2026): the rain banner, the day plan's notes.
// The page clock is fixed to a time of today in Istanbul, so trips can be ahead of it.
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

const IST = 3 * 3600e3;
const istNow = () => new Date(Date.now() + IST);
const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
const KAD = { id: "pkad", name: "Kadıköy", sub: "İstanbul", lat: 40.9903, lon: 29.0277 };
// Today hh:mm in Istanbul, as epoch ms.
const todayAt = (hh, mm = 0) => { const d = istNow(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - 3, mm); };
const DOW = istNow().getUTCDay();
// A dry forecast with amounts; edit(h) changes hours by fixture index (0 = today 00:00 in Istanbul).
function wx(t, edit) {
  const w = fc(t), h = w.hourly;
  h.precipitation = h.time.map(() => 0); h.wind_gusts_10m = h.time.map(() => 15);
  if (edit) edit(h);
  return w;
}
const wetHours = (from, to, mm, code = 63, p = 90) => (h) => { for (let k = from; k <= to; k++) { h.precipitation[k] = mm; h.weather_code[k] = code; h.precipitation_probability[k] = p; } };
const go = { id: "r1", from: "pbes", to: "pkad", name: "Metro", steps: [{ m: "walk", min: 5, slope: "flat" }, { m: "metro", min: 20 }, { m: "walk", min: 5, slope: "flat" }] };
const ret = { id: "r2", from: "pkad", to: "pbes", name: "Dönüş", steps: [{ m: "walk", min: 5, slope: "flat" }, { m: "metro", min: 20 }, { m: "walk", min: 5, slope: "flat" }] };
const ferry = { id: "r3", from: "pbes", to: "pkad", name: "Vapur", steps: [{ m: "walk", min: 8, slope: "flat" }, { m: "ferry", min: 20 }, { m: "walk", min: 5, slope: "flat" }] };
const TRIPS = [{ id: "t1", from: "pbes", to: "pkad", time: "07:30", days: [DOW] }, { id: "t2", from: "pkad", to: "pbes", time: "17:30", days: [DOW] }];

function state(T, live, extra) {
  return { [KEY]: JSON.stringify(Object.assign({ places: [BES, KAD], sel: "pbes", mode: "live",
    live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx: live, fetchedAt: T } }, extra || {})) };
}
const dayState = (T, live, bes, kad, routes, extra) => state(T, live, Object.assign({ trips: TRIPS, routes: routes || [go, ret], dayMode: true,
  dayWx: { fetchedAt: T, byPlace: { pbes: bes, pkad: kad } } }, extra || {}));
async function at(t, T, seed) {
  const s = await t.open({ seed });
  await s.page.clock.setFixedTime(new Date(T));
  await s.goto(); await sleep(400);
  return s;
}
const banner = (s) => s.page.$eval("#rainAlert", (e) => ({ hidden: e.hidden, text: e.innerText.replace(/\s+/g, " ").trim() }));
const tips = (s) => s.page.$$eval("#tips li", (l) => l.map((x) => x.textContent));
const head = (s) => s.page.$eval("#headline", (e) => e.textContent).catch(() => "");
const pageOk = (s, label) => {
  const cons = s.consoleErr.filter((m) => !/Failed to load resource/.test(m));
  check(label + ": no page or console errors", !s.errors.length && !cons.length, s.errors.concat(cons));
};

H.run({
  // Heavy rain with a coat already worn: the banner says what the outfit says (umbrella, waterproof coat), not "raincoat".
  async heavyRainCoatWorn(t) {
    const T = todayAt(9);
    const s = await at(t, T, state(T, wx(11, wetHours(11, 16, 4))));
    const b = await banner(s);
    note("heavy, coat on:", b.text);
    check("banner: heavy rain with a coat on → umbrella and a waterproof outer layer", !b.hidden && /şemsiyeni al, dış katmanın su geçirmez olsun/.test(b.text) && !/yağmurluğunu/.test(b.text), b);
    pageOk(s, "heavy rain");
    await s.close();
  },
  // Drizzle is called drizzle, as in the pills.
  async drizzleBanner(t) {
    const T = todayAt(9);
    const s = await at(t, T, state(T, wx(15, wetHours(11, 13, 0.2, 51, 60))));
    const b = await banner(s);
    check("banner: drizzle starts, not rain", !b.hidden && /^Çiseleme 11:00 civarı başlıyor/.test(b.text), b);
    await s.close();
  },
  // A day plan with dry trips (the rain falls while the person is at school): no "take your umbrella" banner.
  async dryTripsNoBanner(t) {
    const T = todayAt(7);
    const dry = wx(15);
    const s = await at(t, T, dayState(T, wx(15, wetHours(9, 11, 1.2)), dry, dry));
    const b = await banner(s);
    check("banner: none when the shown day plan has no rain gear", b.hidden, b);
    pageOk(s, "dry trips");
    await s.close();
  },
  // Rain from 13:00 at school, the trip home at 17:30: the banner says when it really starts.
  async rainStartsEarlier(t) {
    const T = todayAt(7);
    const dry = wx(15), kad = wx(15, wetHours(13, 20, 1.5));
    for (const lang of ["tr", "en"]) {
      const s = await at(t, T, dayState(T, dry, dry, kad, null, { lang }));
      const b = await banner(s);
      note(lang, "rain since 13:00:", b.text);
      check(lang + ": banner says the rain starts at 13:00 and is still falling at 17:30", !b.hidden && (lang === "tr"
        ? /^Yağmur 13:00 civarı başlıyor, Kadıköy → Beşiktaş yolunda \(17:30\) da sürüyor; /.test(b.text)
        : /^Rain starts around 13:00 and is still falling on your Kadıköy → Beşiktaş trip \(17:30\); /.test(b.text)), b);
      pageOk(s, lang + " rain since 13:00");
      await s.close();
    }
  },
  // Already raining at school since 13:00, now 14:20, the trip home at 17:30 (wet): "since 13:00", not "starts at 15:00".
  async rainAlreadyFalling(t) {
    const T = todayAt(14, 20);
    const dry = wx(15), kad = wx(15, wetHours(13, 20, 1.5));
    const s = await at(t, T, dayState(T, dry, dry, kad));
    const b = await banner(s);
    check("banner: rain falling since 13:00 and still on the trip", !b.hidden && /^Yağmur 13:00 civarından beri yağıyor, Kadıköy → Beşiktaş yolunda \(17:30\) da sürüyor; /.test(b.text), b);
    await s.close();
    // Rain 13:00–16:59, the 17:00 trip itself dry (a 35% morning keeps an umbrella in the outfit): not "still falling on the trip".
    const T2 = todayAt(7), kad2 = wx(15, wetHours(13, 16, 1.5)), bes2 = wx(15, (h) => { for (let k = 7; k <= 8; k++) h.precipitation_probability[k] = 35; });
    const q = await at(t, T2, dayState(T2, bes2, bes2, kad2, null, { trips: [TRIPS[0], Object.assign({}, TRIPS[1], { time: "17:00" })] }));
    const c = await banner(q);
    note("rain until 17:00:", c.text);
    check("banner: rain from 13:00, but no 'da sürüyor' when the trip itself is dry", !c.hidden && /^Yağmur 13:00 civarı başlıyor; Kadıköy → Beşiktaş yolunda \(17:00\) /.test(c.text) && !/sürüyor/.test(c.text), c);
    await q.close();
  },
  // In the evening, tomorrow's plan leads: tonight's rain at the place is still announced.
  async eveningBanner(t) {
    const T = todayAt(18, 30);
    const dry = wx(15), rainy = wx(15, wetHours(19, 21, 1.2));
    const s = await at(t, T, dayState(T, rainy, dry, dry, null, { trips: TRIPS.map((x) => Object.assign({}, x, { days: [0, 1, 2, 3, 4, 5, 6] })) }));
    const b = await banner(s);
    check("evening: tonight's rain banner with tomorrow's plan shown", !b.hidden && /^Yağmur 19:00 civarı başlıyor/.test(b.text), b);
    pageOk(s, "evening");
    await s.close();
  },
  // Drizzle and no umbrella in the wardrobe: a hood, as the outfit (no raincoat for drizzle).
  async drizzleNoUmbrella(t) {
    const T = todayAt(9);
    const s = await at(t, T, state(T, wx(15, wetHours(11, 13, 0.2, 51, 60)), { profiles: [{ id: "me", name: "Ben", who: "me", feel: "normal", missing: ["semsiye"] }], prof: "me" }));
    const b = await banner(s);
    check("drizzle without an umbrella: 'kapüşon yeter'", !b.hidden && /^Çiseleme 11:00 civarı başlıyor; kapüşon yeter\./.test(b.text), b);
    await s.close();
  },
  // A thunderstorm with 22 mm at 14:00 while the person is at school: the day plan's tips say so.
  async dangerBetweenTrips(t) {
    const T = todayAt(7);
    const dry = wx(19), kad = wx(19, (h) => { h.precipitation[14] = 22; h.weather_code[14] = 95; h.precipitation_probability[14] = 80; });
    for (const lang of ["tr", "en"]) {
      const s = await at(t, T, dayState(T, dry, dry, kad, null, { lang }));
      const tp = await tips(s);
      note(lang, "tips:", JSON.stringify(tp));
      // (one tip: the thunderstorm's has the umbrella in it)
      check(lang + ": a tip for the storm between the trips", lang === "tr"
        ? tp.some((x) => /^Gök gürültülü sağanak bekleniyor \(14:00–15:00\); arada dışarı çıkacaksan şemsiyeni al, açık alanda kalma\.$/.test(x)) && !tp.some((x) => /yağış bekleniyor/.test(x))
        : tp.some((x) => /^Thunderstorms expected \(14:00–15:00\); if you go out in between/.test(x)), tp);
      pageOk(s, lang + " storm between trips");
      await s.close();
    }
    // A worse storm after the last trip doesn't hide the one between the trips; heavy rain alone gets its own tip.
    {
      const k2 = wx(19, (h) => { h.precipitation[14] = 10; h.weather_code[14] = 95; h.precipitation_probability[14] = 80;
        h.precipitation[22] = 20; h.weather_code[22] = 99; h.precipitation_probability[22] = 90; });
      const q = await at(t, T, dayState(T, dry, dry, k2));
      const tq = await tips(q);
      check("tip for the 14:00 storm even with a worse one at 22:00", tq.some((x) => /^Gök gürültülü sağanak bekleniyor \(14:00–15:00\)/.test(x)), tq);
      await q.close();
      const k3 = wx(19, (h) => { h.precipitation[14] = 10; h.weather_code[14] = 63; h.precipitation_probability[14] = 90; });
      const r = await at(t, T, dayState(T, dry, dry, k3));
      const tr = await tips(r);
      check("heavy rain alone between the trips: its own tip", tr.some((x) => /^Kuvvetli yağış bekleniyor \(14:00–15:00\); arada dışarı çıkacaksan şemsiyeni de al\.$/.test(x)), tr);
      await r.close();
    }
    // Not when the trips themselves are in it (the outfit has the umbrella then).
    const wetAll = wx(19, (h) => { wetHours(7, 18, 2)(h); h.precipitation[14] = 22; });
    const s = await at(t, T, dayState(T, wetAll, wetAll, wetAll));
    const tp = await tips(s);
    check("no extra rain tip when the outfit already has rain gear", !tp.some((x) => /yağış bekleniyor/.test(x)), tp);
    await s.close();
  },
  // A ferry in a lodos storm: the day plan says sailings may be cancelled.
  async ferryInStorm(t) {
    const T = todayAt(7);
    const stormy = wx(16, (h) => { for (let k = 6; k <= 10; k++) { h.wind_speed_10m[k] = 45; h.wind_gusts_10m[k] = 85; h.wind_direction_10m[k] = 210; } });
    const s = await at(t, T, dayState(T, stormy, stormy, stormy, [ferry, ret]));
    const tp = await tips(s), hd = await head(s);
    note("ferry storm:", hd, JSON.stringify(tp));
    check("ferry in a storm: a tip that sailings may be cancelled", tp.some((x) => /vapur seferleri iptal olabilir/.test(x)), tp);
    pageOk(s, "ferry storm");
    await s.close();
  },
});
