// Kasım 2026 özellikleri: dünle karşılaştırma, "Bugün nasıldı?", eksik parça kartı, çocuğun okul saatleri,
// toplu taşımada katman notu, bavulda takvimle tarih seçimi ve akşam bildirimi satırı (Android köprüsü).
// The page clock is fixed to a time in Istanbul; the forecast fixture starts today 00:00 Istanbul (168 hours).
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

const IST = 3 * 3600e3;
const istNow = () => new Date(Date.now() + IST);
const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
const KAD = { id: "pkad", name: "Kadıköy", sub: "İstanbul", lat: 40.9903, lon: 29.0277 };
// Today (+k days) hh:mm in Istanbul, as epoch ms.
const dayAt = (k, hh, mm = 0) => { const d = istNow(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + k, hh - 3, mm); };
const isoOf = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
// The next weekday (Mon–Fri) from today, 0..2 days ahead (the fixture covers seven days).
const nextWeekday = () => { for (let k = 0; k < 7; k++) { const dow = new Date(dayAt(k, 12)).getUTCDay(); if (dow >= 1 && dow <= 5) return k; } return 0; };
function wx(t, edit) {
  const w = fc(t), h = w.hourly;
  h.precipitation = h.time.map(() => 0); h.wind_gusts_10m = h.time.map(() => 15);
  if (edit) edit(h);
  return w;
}
function state(T, live, extra) {
  return { [KEY]: JSON.stringify(Object.assign({ places: [BES, KAD], sel: "pbes", mode: "live",
    live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx: live, fetchedAt: T } }, extra || {})) };
}
async function at(t, T, seed, init) {
  const s = await t.open({ seed });
  if (init) await s.context.addInitScript(init);
  await s.page.clock.setFixedTime(new Date(T));
  await s.goto(); await sleep(400);
  return s;
}
const text = (s, sel) => s.page.$eval(sel, (e) => ({ hidden: e.hidden, text: e.innerText.replace(/\s+/g, " ").trim() })).catch(() => ({ hidden: true, text: "" }));
const pageOk = (s, label) => {
  const cons = s.consoleErr.filter((m) => !/Failed to load resource/.test(m));
  check(label + ": no page or console errors", !s.errors.length && !cons.length, s.errors.concat(cons));
};

H.run({
  // Yesterday kept 6° warmer at this hour: "Dünden 6° daha soğuk", and a colder band than yesterday's.
  async vsYesterday(t) {
    const T = dayAt(0, 9), live = wx(4);
    const y = isoOf(dayAt(-1, 12)), hours = []; for (let h = 0; h < 24; h++) hours.push(13);
    const s = await at(t, T, state(T, live, { hist: { at: "41.0,29.0", d: { [y]: hours } } }));
    const v = await text(s, "#vsYday");
    note("vs:", v.text);
    check("vs yesterday: colder, with the outfit consequence", !v.hidden && /^↓\s*Dünden \d+° daha soğuk; dünkü kıyafetin yetmez\.$/.test(v.text), v);
    const st = await s.stored();
    check("vs yesterday: today's hours kept for tomorrow's comparison", st.hist && st.hist.at === "41.0,29.0" && Array.isArray(st.hist.d[isoOf(T)]) && st.hist.d[isoOf(T)].length === 24, st.hist && Object.keys(st.hist.d));
    pageOk(s, "vs");
    await s.close();
    // Another place: no comparison until its own hours are kept.
    const s2 = await at(t, T, state(T, live, { hist: { at: "39.9,32.9", d: { [y]: hours } } }));
    check("vs yesterday: history of another place isn't used", (await text(s2, "#vsYday")).hidden);
    await s2.close();
  },
  // In the evening the app asks once; "Üşüdüm" dresses this person a degree warmer from then on, and it can be reset.
  async howWasToday(t) {
    const T = dayAt(0, 19), live = wx(12);
    const s = await at(t, T, state(T, live));
    const c = await text(s, "#fbCard");
    check("feedback: asked in the evening", !c.hidden && /Bugün nasıldı\?/.test(c.text) && /Üşüdüm/.test(c.text) && /Terledim/.test(c.text), c);
    await s.page.tap('[data-fb="-1"]'); await sleep(200);
    const st = await s.stored();
    check("feedback: 'Üşüdüm' moves cal to −1 and isn't asked again today", st.profiles[0].cal === -1 && st.fbDay === isoOf(T) && (await text(s, "#fbCard")).hidden, { cal: st.profiles[0].cal, fbDay: st.fbDay });
    const status = await text(s, "#status"), cal = await text(s, "#calHint");
    check("feedback: thanked, and the fine-tuning shows under 'Soğuğa karşı'", /daha sıcak giydireceğim/.test(status.text) && !cal.hidden && /1° daha sıcak giydiriliyor/.test(cal.text), { status, cal });
    await s.page.tap("[data-cal-reset]"); await sleep(200);
    check("feedback: reset", (await s.stored()).profiles[0].cal === 0 && (await text(s, "#calHint")).hidden);
    pageOk(s, "feedback");
    await s.close();
    // Not in the morning.
    const s2 = await at(t, dayAt(0, 9), state(dayAt(0, 9), live));
    check("feedback: not asked in the morning", (await text(s2, "#fbCard")).hidden);
    await s2.close();
  },
  // The fine-tuning changes the outfit: at the edge of a band, −4 puts a warmer piece on.
  async calChangesOutfit(t) {
    const T = dayAt(0, 12), live = wx(15.5);
    const prof = (cal) => ({ profiles: [{ id: "me", name: "Ben", who: "me", feel: "normal", missing: [], cal }], prof: "me" });
    const s = await at(t, T, state(T, live, prof(0)));
    const a = await s.page.$eval("#tagLevel", (e) => e.textContent);
    await s.close();
    const s2 = await at(t, T, state(T, live, prof(-4)));
    const b = await s2.page.$eval("#tagLevel", (e) => e.textContent);
    note("bands:", a, "→", b);
    check("cal −4: a colder band than with no fine-tuning", a !== b, { a, b });
    await s2.close();
  },
  // A raincoat missing from the wardrobe on a wet week: the card says on how many days, and "Aslında var" puts it back.
  async missingPiece(t) {
    const T = dayAt(0, 9);
    const live = wx(12, (h) => { for (let k = 24; k < 72; k++) { h.precipitation[k] = 3; h.weather_code[k] = 63; h.precipitation_probability[k] = 90; } });
    const prof = { profiles: [{ id: "me", name: "Ben", who: "me", feel: "normal", missing: ["yagmurluk", "semsiye"] }], prof: "me" };
    const s = await at(t, T, state(T, live, prof));
    const n = await text(s, "#needCard");
    note("need:", n.text);
    check("missing piece: the card names it and the days", !n.hidden && /Bu hafta 2 gün (yağmurluk|şemsiye) gerekecek/.test(n.text) && /Aslında var/.test(n.text), n);
    const g = await s.page.$eval("[data-need-have]", (e) => e.dataset.needHave);
    await s.page.tap("[data-need-have]"); await sleep(200);
    const st = await s.stored();
    check("missing piece: 'Aslında var' puts it in the wardrobe", st.profiles[0].missing.indexOf(g) < 0, st.profiles[0].missing);
    const n2 = await text(s, "#needCard");
    if (!n2.hidden) { await s.page.tap("[data-need-off]"); await sleep(200); }
    check("missing piece: 'Bu hafta gösterme' hides it", (await text(s, "#needCard")).hidden && (n2.hidden || Object.keys((await s.stored()).needOff || {}).length === 1));
    pageOk(s, "need");
    await s.close();
  },
  // A child with school hours: the outfit is for the school day and the note says what goes in the bag.
  async schoolHours(t) {
    const k = nextWeekday(), T = dayAt(k, 7);
    // warm afternoon: 6° at 08:00, 16° at 15:00
    const live = wx(10, (h) => { for (let i = 0; i < h.time.length; i++) { const hr = +h.time[i].slice(11, 13); const v = hr <= 8 ? 6 : hr >= 14 ? 16 : 6 + (hr - 8) * 1.6; h.apparent_temperature[i] = v; h.temperature_2m[i] = v + 1; } });
    const prof = { profiles: [{ id: "me", name: "Ben", who: "me", feel: "normal", missing: [] }, { id: "ukid", name: "Deniz", who: "child", feel: "normal", missing: [], school: { in: "08:00", out: "15:00" } }], prof: "ukid" };
    const s = await at(t, T, state(T, live, prof));
    const pills = await text(s, "#pills"), feels = await text(s, "#nowFeels"), tips = await s.page.$$eval("#tips li", (l) => l.map((x) => x.textContent));
    note("school:", pills.text, "|", feels.text, "|", tips[0]);
    check("school: dressed for school hours", /Okul saatine göre/.test(pills.text) && /okul 08:00 6°, çıkış 15:00 16°/.test(feels.text), { pills, feels });
    check("school: the bag note", /^Çıkışta \(15:00\) 16°, hava ısınıyor: .+ öğlen çıkarılabilir, çantada yer açın\.$/.test(tips[0] || ""), tips);
    // The person sheet keeps the times; a half-filled pair is refused.
    await s.page.tap("[data-person-edit]"); await sleep(200);
    const v = await s.page.evaluate(() => [document.getElementById("pfIn").value, document.getElementById("pfOut").value, document.getElementById("pfSchool").hidden]);
    check("school: times shown in the person sheet", v[0] === "08:00" && v[1] === "15:00" && v[2] === false, v);
    await s.page.fill("#pfOut", ""); await s.page.tap("[data-pf-save]"); await sleep(150);
    check("school: only one time → error, not saved", !(await s.page.$eval("#pfSchErr", (e) => e.hidden)) && (await s.stored()).profiles[1].school.out === "15:00");
    pageOk(s, "school");
    await s.close();
  },
  // A 20-minute metro ride on a cold morning: the first tip is about thin layers and opening the coat on board.
  async metroLayers(t) {
    const T = dayAt(0, 6, 30), DOW = new Date(T + IST).getUTCDay();
    const go = { id: "r1", from: "pbes", to: "pkad", name: "Metro", steps: [{ m: "walk", min: 8, slope: "flat" }, { m: "metro", min: 25 }, { m: "walk", min: 6, slope: "flat" }] };
    const cold = wx(3);
    const s = await at(t, T, state(T, cold, { trips: [{ id: "t1", from: "pbes", to: "pkad", time: "07:30", days: [DOW] }], routes: [go], dayMode: true,
      dayWx: { fetchedAt: T, byPlace: { pbes: cold, pkad: cold } } }));
    const tips = await s.page.$$eval("#tips li", (l) => l.map((x) => x.textContent));
    note("metro:", tips[0]);
    check("metro: layers note first", /^Metro içi yaklaşık 22°, dışarısı −?\d+°: (kazak yerine önü açılan bir hırka ya da ince katlar giy; içeride .+ aç\.|ince katlar giy; içeride .+ aç ya da çıkar\.)$/.test(tips[0] || ""), tips);
    pageOk(s, "metro");
    await s.close();
  },
  // The packing list from the calendar: dates in the forecast give a list for them; dates months ahead keep the dates
  // and say when the list comes.
  async packCalendar(t) {
    const T = dayAt(0, 10), live = wx(12);
    const s = await at(t, T, state(T, live));
    await s.page.tap("#packBtn"); await sleep(250);
    await s.page.tap("[data-pk-cal]"); await sleep(150);
    const from = isoOf(dayAt(2, 12)), to = isoOf(dayAt(4, 12));
    await s.page.fill("#pkFrom", from); await s.page.dispatchEvent("#pkFrom", "change"); await sleep(150);
    await s.page.fill("#pkTo", to); await s.page.dispatchEvent("#pkTo", "change"); await sleep(200);
    const body = await text(s, "#packBody");
    note("pack range:", body.text.slice(0, 200));
    const st = await s.stored();
    check("calendar: three days, from the chosen date", /Beşiktaş · 3 gün/.test(body.text) && st.pack.from === from && st.pack.to === to && !/Kaç gün\?/.test(body.text), { pack: st.pack, text: body.text.slice(0, 160) });
    check("calendar: clothes listed for the weather", /Üst/.test(body.text) && /Çorap/.test(body.text) && (await s.page.$$(".pk-day")).length === 3);
    // Far ahead: kept, with a note.
    const f2 = isoOf(dayAt(60, 12)), t2 = isoOf(dayAt(66, 12));
    await s.page.fill("#pkFrom", f2); await s.page.dispatchEvent("#pkFrom", "change"); await sleep(150);
    await s.page.fill("#pkTo", t2); await s.page.dispatchEvent("#pkTo", "change"); await sleep(200);
    const far = await text(s, "#packBody");
    note("pack far:", far.text.slice(0, 260));
    check("calendar: months ahead → dates kept, no forecast yet, basics listed", /7 gün/.test(far.text) && /hava tahmini henüz yok/.test(far.text) && /civarı bu listeyi aç/.test(far.text) && /Çorap/.test(far.text), far.text.slice(0, 300));
    // Back to "Bugünden": the dates go.
    await s.page.tap('[data-pk="start"][data-v="0"]'); await sleep(150);
    const st2 = await s.stored();
    check("calendar: 'Bugünden' clears the dates", !st2.pack.from && !st2.pack.to && /Kaç gün\?/.test((await text(s, "#packBody")).text));
    pageOk(s, "pack calendar");
    await s.close();
  },
  // The evening note row appears in the Android app (bridge with eveningState) and turns it on.
  async eveningRow(t) {
    const T = dayAt(0, 10), live = wx(12);
    const s = await at(t, T, state(T, live), () => {
      window.__eve = { state: "off", calls: [] };
      window.NeGiysemAndroid = { saveState() {}, setTheme() {}, reset() {}, hasLocation: () => true,
        eveningState: () => window.__eve.state, setEvening: (on) => { window.__eve.calls.push(on); window.__eve.state = on ? "on" : "off"; } };
    });
    const r = await text(s, "#eveRow");
    check("evening: row shown in the app", !r.hidden && /Her akşam yarını bildir/.test(r.text), r);
    await s.page.tap("#eveBtn"); await sleep(150);
    const r2 = await text(s, "#eveRow"), calls = await s.page.evaluate(() => window.__eve.calls);
    check("evening: turned on through the app", calls.length === 1 && calls[0] === true && /Akşam bildirimi açık/.test(r2.text), { calls, r2 });
    await s.close();
    // On the website there's no such row.
    const w = await at(t, T, state(T, live));
    check("evening: no row on the website", (await text(w, "#eveRow")).hidden);
    await w.close();
  },
});
