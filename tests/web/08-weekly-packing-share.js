// This week, packing list, rain-coming warning and the share picture.
const fs = require("fs"), path = require("path");
const H = require("./lib");
const { check, note, sleep, KEY, fc, SHOTS } = H;

const IST = 3 * 3600e3;                                   // Europe/Istanbul, no DST
const pad = (n) => String(n).padStart(2, "0");
const istNow = () => new Date(Date.now() + IST);
const istHour = () => istNow().getUTCHours();
const todayKey = () => { const d = istNow(); return d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate(); }; // the app's dateKey()
const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const LEVELS = ["Dondurucu", "Çok soğuk", "Soğuk", "Soğukça", "Serin", "Ilık", "Sıcak", "Çok sıcak"];
const BAD = /undefined|NaN|null|Infinity|\[object|[{}]/;

const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
const KAD = { id: "pkad", name: "Kadıköy", sub: "İstanbul", lat: 40.9903, lon: 29.0277 };
// rain (code, probability) for `hours` hours from fixture index i (index 0 = today 00:00 local)
function rain(wx, i, hours, code = 63, p = 85) {
  for (let k = i; k < i + hours && k < wx.hourly.time.length; k++) { wx.hourly.weather_code[k] = code; wx.hourly.precipitation_probability[k] = p; }
  return wx;
}
// a saved place with fresh weather: nothing is fetched when the page opens
function seed(wx, extra = {}) {
  return { [KEY]: JSON.stringify(Object.assign({ places: [BES, KAD], sel: "pbes", mode: "live",
    live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx, fetchedAt: Date.now() } }, extra)) };
}
const DARK = { colorScheme: "dark" };
const pageOk = (s, label) => {
  const cons = s.consoleErr.filter((m) => !/Failed to load resource/.test(m));
  return check(label + ": no page or console errors", !s.errors.length && !cons.length, s.errors.concat(cons));
};
async function scrollTo(s, sel) { await s.page.$eval(sel, (e) => e.scrollIntoView({ block: "start" })); await sleep(150); }

H.run({
  async weekly(t) {
    const wx = rain(fc(14), 24 + 8, 13, 63, 90); // tomorrow wet all day
    for (const theme of ["light", "dark"]) {
      const s = await t.open({ seed: seed(wx), ctx: theme === "dark" ? DARK : {} });
      // Daytime in Istanbul, so today's row still has hours ahead whatever time the suite runs.
      const ist = new Date(Date.now() + 3 * 3600e3), at10 = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 7, 0);
      await s.page.clock.setFixedTime(new Date(at10));
      await s.goto(); await sleep(400);
      const rows = await s.page.$$eval("#week .wk-row", (b) => b.map((x) => ({ text: x.innerText.replace(/\s+/g, " ").trim(), arts: x.querySelectorAll(".wk-arts .art svg").length, expanded: x.getAttribute("aria-expanded") })));
      if (theme === "light") {
        note("rows:", rows.map((r) => r.text));
        check("week: 7 day rows", rows.length === 7, rows.length);
        check("week: first 'Bugün', then 'Yarın', then weekday names", /^Bugün/.test(rows[0].text) && /^Yarın/.test(rows[1].text) && rows.slice(2).every((r) => DAYS.some((d) => r.text.startsWith(d))), rows.map((r) => r.text.split(" ")[0]));
        check("week: each row has a level, a feels-like range and 2–3 stickers", rows.every((r) => LEVELS.some((l) => r.text.includes(l)) && /−?\d+° – (hissedilen )?−?\d+°/.test(r.text) && r.arts >= 2 && r.arts <= 3), rows);
        check("week: no NaN / undefined / braces", rows.every((r) => !BAD.test(r.text)), rows.filter((r) => BAD.test(r.text)));
        check("week: wet tomorrow shows its rain chance, dry days don't", /%90/.test(rows[1].text) && !/%/.test(rows[3].text), [rows[1].text, rows[3].text]);
        const tomorrowSr = await s.page.$eval("#week li:nth-child(2) .wk-row", (b) => b.textContent);
        check("week: wet day's key items include rain gear", /Şemsiye|Yağmurluk/.test(tomorrowSr), tomorrowSr);
        // tap a row: the verdict opens
        await s.page.locator("#week .wk-row").nth(1).tap(); await sleep(150);
        const more = await s.page.$eval("#week li:nth-child(2)", (li) => ({ exp: li.querySelector(".wk-row").getAttribute("aria-expanded"), hidden: li.querySelector(".wk-more").hidden, text: li.querySelector(".wk-more").innerText }));
        note("tomorrow expanded:", more.text.replace(/\n/g, " | "));
        check("week: tapping a day shows its headline and what to wear", more.exp === "true" && !more.hidden && /Giy: /.test(more.text) && !BAD.test(more.text), more);
        await s.page.locator("#week .wk-row").nth(1).tap(); await sleep(100);
        check("week: tapping again closes it", await s.page.$eval("#week li:nth-child(2) .wk-more", (e) => e.hidden), true);
        await s.page.locator("#week .wk-row").nth(1).tap(); await sleep(100);
        // the engine respects the person's settings: "Çabuk üşürüm" makes days colder (never warmer)
        const lv = () => s.page.$$eval("#week .wk-day small", (x) => x.map((e) => e.textContent.split(" · ")[0]));
        const before = await lv();
        await s.page.locator('.seg[data-key="feel"] [data-val="cold"]').tap(); await sleep(200);
        const after = await lv();
        check("week: 'Çabuk üşürüm' never makes a day warmer", after.every((l, i) => LEVELS.indexOf(l) <= LEVELS.indexOf(before[i])) && after.some((l, i) => l !== before[i]), { before, after });
        await s.page.locator('.seg[data-key="feel"] [data-val="normal"]').tap(); await sleep(150);
      }
      await scrollTo(s, "#weekCard"); await s.shot(`08-week-${theme}`);
      const ov = await s.page.evaluate(() => ({ docW: document.documentElement.scrollWidth, vw: innerWidth }));
      check(`week (${theme}): no horizontal scroll at 412 px`, ov.docW <= ov.vw, ov);
      pageOk(s, "week " + theme);
      await s.close();
    }
    // 360 px phone
    const n = await t.open({ seed: seed(wx), ctx: { viewport: { width: 360, height: 780 } } });
    await n.goto(); await sleep(400);
    await scrollTo(n, "#weekCard"); await n.shot("08-week-360");
    const ov = await n.page.evaluate(() => ({ docW: document.documentElement.scrollWidth, vw: innerWidth, clipped: [...document.querySelectorAll("#week .wk-row")].some((r) => r.scrollWidth > r.clientWidth + 1) }));
    check("week: fits a 360 px phone", ov.docW <= ov.vw && !ov.clipped, ov);
    await n.close();
    // desktop: the week card sits in the left column, the packing sheet is centred
    const dsk = await t.open({ seed: seed(wx), ctx: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false } });
    await dsk.goto(); await sleep(400);
    const pos = await dsk.page.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return { week: r("weekCard").left, day: r("dayCard").left, board: document.querySelector(".board").getBoundingClientRect().left }; });
    check("desktop: week card in the left column with the hourly card", Math.abs(pos.week - pos.day) < 2 && pos.board > pos.week + 300, pos);
    await dsk.page.screenshot({ path: path.join(SHOTS, "08-desktop.png"), fullPage: true });
    await dsk.page.click("#weekCard [data-open-pack]"); await sleep(400);
    await dsk.shot("08-desktop-pack");
    pageOk(dsk, "desktop");
    await dsk.close();
    // manual mode: no week (it needs a forecast)
    const m = await t.open({ seed: { [KEY]: JSON.stringify({ mode: "manual" }) } });
    await m.goto(); await sleep(300);
    check("week: hidden in manual mode", await m.page.$eval("#weekCard", (e) => e.hidden), true);
    check("share button hidden in manual mode", await m.page.$eval("#heroActs", (e) => e.hidden), true);
    pageOk(m, "manual");
    await m.close();
  },

  async packing(t) {
    const wx = rain(fc(12), 24 + 8, 13, 63, 90); // tomorrow wet
    const s = await t.open({ seed: seed(wx), ctx: { permissions: ["clipboard-read", "clipboard-write"] } });
    await s.goto(); await sleep(300);
    await s.page.locator("#weekCard [data-open-pack]").tap(); await sleep(200);
    check("pack: sheet opens from 'Bavul hazırla'", !(await s.page.$eval("#packSheet", (e) => e.hidden)), true);
    check("pack: focus moves into the sheet", await s.page.evaluate(() => document.getElementById("packSheet").contains(document.activeElement)), true);
    await s.page.tap('[data-pk="start"][data-v="0"]'); await s.page.tap('[data-pk="days"][data-v="3"]'); await sleep(150);
    const read = () => s.page.$$eval(".pk-it", (l) => l.map((x) => ({ key: x.querySelector("input").dataset.pkItem, label: x.querySelector(".pl b").textContent, n: +(x.querySelector(".n") ? x.querySelector(".n").textContent.replace("×", "") : 1), why: x.querySelector(".pl small").textContent, on: x.querySelector("input").checked })));
    const items = await read();
    note("3 days from today:", items.map((i) => i.label + (i.n > 1 ? " ×" + i.n : "") + " (" + i.why + ")").join(" · "));
    const sum = (re) => items.filter((i) => re.test(i.key)).reduce((a, i) => a + i.n, 0);
    check("pack: umbrella when a day is wet", items.some((i) => i.key === "acc:semsiye"), items.map((i) => i.label));
    check("pack: one top per day (3)", sum(/^top:(tshirt|longsleeve)$/) === 3, items.filter((i) => /^top:/.test(i.key)));
    check("pack: bottoms one per 2–3 days (1–2 for 3 days)", sum(/^bottom:/) >= 1 && sum(/^bottom:/) <= 2, items.filter((i) => /^bottom:/.test(i.key)));
    check("pack: one outer layer at most of a heavy kind", items.filter((i) => /^outer:(?!yagmurluk)/.test(i.key)).length <= 1 && items.filter((i) => /^outer:/.test(i.key)).every((i) => i.n === 1), items.filter((i) => /^outer:/.test(i.key)));
    check("pack: socks for every day plus a spare for the wet day", items.find((i) => i.key === "base:corap").n === 4, items.find((i) => i.key === "base:corap"));
    check("pack: no NaN / undefined in the list", items.every((i) => !BAD.test(i.label + i.why)), items.filter((i) => BAD.test(i.label + i.why)));
    const sumTxt = await s.page.$eval(".pk-sum", (e) => e.textContent);
    check("pack: summary shows place, days and progress", /Beşiktaş · 3 gün/.test(sumTxt) && /0\/\d+ hazır/.test(sumTxt), sumTxt);
    await s.page.locator(".pk-it", { hasText: "Katlanır şemsiye" }).tap(); await sleep(100);
    const st = await s.stored();
    check("pack: ticks are kept in state for this trip", Object.values(st.pack.ticks).some((a) => a.includes("acc:semsiye")) && st.pack.days === 3 && st.pack.start === 0, st.pack);
    await s.shot("08-pack-light");
    // share/copy the list text
    const hasShare = await s.page.evaluate(() => typeof navigator.share === "function");
    await s.page.tap("[data-pk-share]"); await sleep(300);
    if (!hasShare) {
      const clip = await s.page.evaluate(() => navigator.clipboard.readText());
      note("clipboard:", clip.split("\n").slice(0, 6).join(" / "));
      check("pack: 'Listeyi kopyala' puts the list on the clipboard", /^Bavul listesi: Beşiktaş, 3 gün/.test(clip) && /☑ Katlanır şemsiye/.test(clip) && /Ne Giysem\?/.test(clip), clip.slice(0, 120));
      check("pack: says it was copied", /kopyalandı/.test(await s.page.$eval("#pkMsg", (e) => e.textContent)), await s.page.$eval("#pkMsg", (e) => e.textContent));
    } else note("navigator.share exists here; copy path not exercised");
    // forecast shorter than the trip
    await s.page.tap('[data-pk="start"][data-v="1"]'); await s.page.tap('[data-pk="days"][data-v="7"]'); await sleep(150);
    const miss = await s.page.$eval("#packBody", (e) => e.innerText);
    check("pack: says when the trip is longer than the forecast", /Son 1 gün için henüz tahmin yok/.test(miss), miss.slice(0, 200));
    const items7 = await read();
    check("pack: 7 days → 7 tops, 7 underwear", items7.filter((i) => /^top:(tshirt|longsleeve)$/.test(i.key)).reduce((a, i) => a + i.n, 0) === 7 && items7.find((i) => i.key === "base:ic").n === 7, items7.map((i) => i.key + "×" + i.n));
    // ticks survive a reload (same trip)
    await s.page.tap('[data-pk="start"][data-v="0"]'); await s.page.tap('[data-pk="days"][data-v="3"]');
    await s.reload(); await sleep(300);
    await s.page.locator("#packBtn").scrollIntoViewIfNeeded(); await s.page.tap("#packBtn"); await sleep(200);
    const again = await read();
    check("pack: settings and ticks survive a reload", (await s.page.$eval('[data-pk="days"][aria-pressed="true"]', (e) => e.dataset.v)) === "3" && again.find((i) => i.key === "acc:semsiye").on, again.filter((i) => i.on));
    // Escape closes and gives focus back
    await s.page.keyboard.press("Escape"); await sleep(100);
    check("pack: Escape closes the sheet, focus back on the button", (await s.page.$eval("#packSheet", (e) => e.hidden)) && (await s.page.evaluate(() => document.activeElement && document.activeElement.id)) === "packBtn", true);
    // a saved place without a forecast: explained, and its weather can be fetched with the existing flow
    await s.page.tap("#packBtn"); await sleep(150);
    await s.page.tap('[data-pk="place"][data-v="pkad"]'); await sleep(150);
    const noWx = await s.page.$eval("#packBody .pk-note", (e) => e.innerText);
    check("pack: place without forecast says so and offers to fetch", /henüz alınmadı/.test(noWx) && !!(await s.page.$("[data-pk-fetch]")), noWx);
    const calls = s.net.calls.forecast.length;
    await s.page.tap("[data-pk-fetch]"); await sleep(900);
    const after = await read();
    check("pack: after fetching, the list is there for that place", s.net.calls.forecast.length === calls + 1 && after.length > 5 && /Kadıköy · 3 gün/.test(await s.page.$eval(".pk-sum", (e) => e.textContent)), { calls: s.net.calls.forecast.length - calls, n: after.length });
    pageOk(s, "pack");
    await s.close();

    // dry forecast: no umbrella; dark screenshot
    const d = await t.open({ seed: seed(fc(20)), ctx: DARK });
    await d.goto(); await sleep(300);
    await d.page.locator("#packBtn").scrollIntoViewIfNeeded(); await d.page.tap("#packBtn"); await sleep(150);
    await d.page.tap('[data-pk="start"][data-v="0"]'); await d.page.tap('[data-pk="days"][data-v="3"]'); await sleep(150);
    const dry = await d.page.$$eval(".pk-it input", (l) => l.map((x) => x.dataset.pkItem));
    check("pack: dry trip has no umbrella", !dry.includes("acc:semsiye"), dry);
    await d.shot("08-pack-dark");
    pageOk(d, "pack dry");
    await d.close();

    // manual mode, nothing saved: the sheet explains itself
    const m = await t.open({ seed: { [KEY]: JSON.stringify({ mode: "manual" }) } });
    await m.goto(); await sleep(300);
    await m.page.locator("#packBtn").scrollIntoViewIfNeeded(); await m.page.tap("#packBtn"); await sleep(150);
    check("pack (manual, no places): explains a place is needed", /yer seç/.test(await m.page.$eval("#packBody", (e) => e.innerText)), await m.page.$eval("#packBody", (e) => e.innerText));
    pageOk(m, "pack manual");
    await m.close();
  },

  async rainBanner(t) {
    const h = istHour();
    const banner = (s) => s.page.$eval("#rainAlert", (e) => ({ hidden: e.hidden, text: e.innerText.replace(/\s+/g, " ").trim() }));
    // dry now, rain from h+2
    const s = await t.open({ seed: seed(rain(fc(15), h + 2, 3)) });
    await s.goto(); await sleep(300);
    const a = await banner(s);
    note("rain in 2 h:", a.text, "| pills:", await s.page.$eval("#pills", (e) => e.textContent));
    check("rain: banner when rain starts in 2 h, with its time", !a.hidden && a.text.includes(pad((h + 2) % 24) + ":00") && /şemsiye/.test(a.text), a);
    check("rain: banner doesn't repeat the % from the pills", !/%/.test(a.text), a.text);
    await s.shot("08-rain-light");
    await s.page.tap("[data-rain-off]"); await sleep(100);
    check("rain: dismiss hides it", (await banner(s)).hidden, true);
    check("rain: dismissal stored for today", (await s.stored()).rainOff === todayKey(), (await s.stored()).rainOff);
    await s.reload(); await sleep(300);
    check("rain: stays dismissed after reload", (await banner(s)).hidden, true);
    pageOk(s, "rain");
    await s.close();
    // dark theme screenshot of the banner
    const dk = await t.open({ seed: seed(rain(fc(15), h + 2, 3)), ctx: DARK });
    await dk.goto(); await sleep(300); await dk.shot("08-rain-dark"); await dk.close();
    // a dismissal from another day doesn't count
    const old = await t.open({ seed: seed(rain(fc(15), h + 2, 3), { rainOff: "2020-1-1" }) });
    await old.goto(); await sleep(300);
    check("rain: yesterday's dismissal doesn't hide today's warning", !(await banner(old)).hidden, true);
    await old.close();
    // already raining
    const wet = rain(fc(15), Math.max(0, h - 1), 6); wet.current.weather_code = 63; wet.current.precipitation = 1.2;
    const r = await t.open({ seed: seed(wet) });
    await r.goto(); await sleep(300);
    check("rain: no banner when it's already raining", (await banner(r)).hidden, await banner(r));
    await r.close();
    // dry all day, and rain only 5 h away
    for (const [name, wx] of [["dry all day", fc(15)], ["rain 5 h away", rain(fc(15), h + 5, 3)]]) {
      const q = await t.open({ seed: seed(wx) });
      await q.goto(); await sleep(300);
      check("rain: no banner when " + name, (await banner(q)).hidden, await banner(q));
      pageOk(q, name);
      await q.close();
    }
    // a routine trip later today walks into rain at the destination (the page clock is set to 09:30 so a trip can be ahead)
    {
      const d = istNow(), T = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9 - 3, 30), dow = d.getUTCDay();
      const dry = fc(19), wetB = rain(fc(16), 13, 3, 61, 80); // Kadıköy: rain 13:00–16:00
      const st = JSON.parse(seed(dry)[KEY]);
      st.live.fetchedAt = T;
      Object.assign(st, {
        trips: [{ id: "t1", from: "pbes", to: "pkad", time: "13:00", days: [dow] }],
        routes: [{ id: "r1", from: "pbes", to: "pkad", name: "Vapur", steps: [{ m: "walk", min: 10, slope: "flat" }, { m: "ferry", min: 20 }, { m: "walk", min: 10, slope: "flat" }] }],
        dayMode: true, dayWx: { fetchedAt: T, byPlace: { pbes: dry, pkad: wetB } },
      });
      const q = await t.open({ seed: { [KEY]: JSON.stringify(st) } });
      await q.page.clock.setFixedTime(new Date(T));
      await q.goto(); await sleep(300);
      const b = await banner(q);
      note("trip rain:", b.text);
      check("rain: banner for a routine trip later today", !b.hidden && /Beşiktaş → Kadıköy/.test(b.text) && b.text.includes("13:00") && q.net.calls.forecast.length === 0, { b, fetched: q.net.calls.forecast.length });
      await q.shot("08-rain-trip");
      pageOk(q, "trip rain");
      await q.close();
      // the same day with the routine switched off: no trip warning (and the place itself is dry)
      st.dayMode = false;
      const o = await t.open({ seed: { [KEY]: JSON.stringify(st) } });
      await o.page.clock.setFixedTime(new Date(T));
      await o.goto(); await sleep(300);
      check("rain: no trip warning when 'Günüme göre' is off", (await banner(o)).hidden, await banner(o));
      await o.close();
    }
  },

  async shareCard(t) {
    const wx = fc(15);
    // phones with the Web Share API: a PNG file goes to navigator.share
    const s = await t.open({ seed: seed(wx) });
    await s.context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: (d) => !!(d && d.files && d.files.length) });
      Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: async (d) => { window.__shared = d; } });
    });
    await s.goto(); await sleep(300);
    await s.page.tap("#shareBtn");
    await s.page.waitForFunction(() => window.__shared, null, { timeout: 8000 });
    const info = await s.page.evaluate(async () => {
      const d = window.__shared, f = d.files[0], bmp = await createImageBitmap(f);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const x = c.getContext("2d"); x.drawImage(bmp, 0, 0);
      const px = Array.from(x.getImageData(6, 6, 1, 1).data).slice(0, 3);
      const buf = new Uint8Array(await f.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { name: f.name, type: f.type, w: bmp.width, h: bmp.height, size: f.size, text: d.text, px, lv: getComputedStyle(document.documentElement).getPropertyValue("--lv").trim(), b64: btoa(bin) };
    });
    fs.writeFileSync(path.join(SHOTS, "08-share-card.png"), Buffer.from(info.b64, "base64"));
    const hex = "#" + info.px.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    note("shared:", info.name, info.type, info.w + "×" + info.h, info.size + " B", "| bg", hex, "lv", info.lv, "| text:", info.text);
    check("share: a 1080×1920 PNG file is handed to navigator.share", info.type === "image/png" && info.w === 1080 && info.h === 1920 && /^ne-giysem-\d{4}-\d{2}-\d{2}\.png$/.test(info.name), info.name);
    check("share: background is the level colour", hex === info.lv.toUpperCase(), { hex, lv: info.lv });
    check("share: caption is the headline without braces", info.text && !/[{}]/.test(info.text) && /Ne Giysem/.test(info.text), info.text);
    pageOk(s, "share");
    await s.close();

    // no Web Share: the PNG is downloaded
    const d = await t.open({ seed: seed(wx) });
    await d.context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: undefined });
      Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: undefined });
    });
    await d.goto(); await sleep(300);
    const [dl] = await Promise.all([d.page.waitForEvent("download", { timeout: 8000 }), d.page.tap("#shareBtn")]);
    const file = await dl.path(), png = fs.readFileSync(file);
    const dim = { w: png.readUInt32BE(16), h: png.readUInt32BE(20), sig: png.slice(1, 4).toString() };
    check("share (no Web Share): downloads a 1080×1920 PNG", dl.suggestedFilename().endsWith(".png") && dim.sig === "PNG" && dim.w === 1080 && dim.h === 1920, { name: dl.suggestedFilename(), dim });
    check("share (no Web Share): status says it was downloaded", /indirildi/.test(await d.status()), await d.status());
    pageOk(d, "download");
    await d.close();

    // inside the Android app (no native share bridge yet): the picture in a sheet with a hint
    for (const theme of ["light", "dark"]) {
      const night = theme === "dark" ? (() => { const w = fc(8); w.current.is_day = 0; w.hourly.is_day = w.hourly.is_day.map(() => 0); return w; })() : wx;
      const a = await t.open({ seed: seed(night), ctx: theme === "dark" ? DARK : {} });
      await a.context.addInitScript(() => { window.NeGiysemAndroid = { saveState() {}, setTheme() {}, hasLocation() { return true; }, reset() {} }; });
      await a.goto(); await sleep(300);
      await a.page.tap("#shareBtn");
      await a.page.waitForFunction(() => { const i = document.getElementById("shareImg"); return !document.getElementById("shareSheet").hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
      const v = await a.page.evaluate(() => {
        const i = document.getElementById("shareImg"), c = document.createElement("canvas"); c.width = 4; c.height = 4; const x = c.getContext("2d"); x.drawImage(i, 0, 0, 1080, 1920, 0, 0, 4, 4);
        return { w: i.naturalWidth, h: i.naturalHeight, hint: document.getElementById("shareHint").textContent, alt: i.alt, px: Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3), focusIn: document.getElementById("shareSheet").contains(document.activeElement) };
      });
      note(`android (${theme}):`, v.w + "×" + v.h, v.hint, "| corner", v.px);
      check(`share (Android app, ${theme}): picture shown with 'basılı tut' hint`, v.w === 1080 && v.h === 1920 && /basılı tut/.test(v.hint) && /Paylaşım kartı/.test(v.alt) && v.focusIn, v);
      if (theme === "dark") check("share at night: dark background", v.px.every((c) => c < 90), v.px);
      await sleep(400); // let the sheet finish sliding in
      await a.shot(`08-share-android-${theme}`);
      if (theme === "dark") { // the night picture itself, to look at
        const src = await a.page.$eval("#shareImg", (i) => i.src);
        if (src.startsWith("data:image/png;base64,")) fs.writeFileSync(path.join(SHOTS, "08-share-card-night.png"), Buffer.from(src.split(",")[1], "base64"));
      }
      await a.page.keyboard.press("Escape"); await sleep(100);
      check(`share (${theme}): Escape closes, focus back on Paylaş`, (await a.page.$eval("#shareSheet", (e) => e.hidden)) && (await a.page.evaluate(() => document.activeElement.id)) === "shareBtn", true);
      pageOk(a, "android " + theme);
      await a.close();
    }
  },
});
