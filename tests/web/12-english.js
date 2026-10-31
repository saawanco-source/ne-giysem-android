// English: the language follows the browser (Turkish only on a Turkish device) until it is picked in "Sana göre";
// every screen, sheet, message, the share picture and the Android payload then speak English, and switching back restores Turkish.
const fs = require("fs"), path = require("path");
const H = require("./lib");
const { check, note, sleep, KEY, fc, GPS, PLACES, SHOTS, API_ORIGIN } = H;

const EN = { locale: "en-US" }, EN_DARK = { locale: "en-US", colorScheme: "dark" };
const IST = 3 * 3600e3;
const istNow = () => new Date(Date.now() + IST);
const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };
const KAD = { id: "pkad", name: "Kadıköy", sub: "İstanbul", lat: 40.9903, lon: 29.0277 };
function rain(wx, i, hours, code = 63, p = 85) {
  for (let k = i; k < i + hours && k < wx.hourly.time.length; k++) { wx.hourly.weather_code[k] = code; wx.hourly.precipitation_probability[k] = p; }
  return wx;
}
function state(wx, extra = {}) {
  return Object.assign({ places: [BES, KAD], sel: "pbes", mode: "live", live: { placeKey: "pbes", place: { name: BES.name, lat: BES.lat, lon: BES.lon }, wx, fetchedAt: Date.now() } }, extra);
}
const seed = (wx, extra) => ({ [KEY]: JSON.stringify(state(wx, extra)) });

// What may stay Turkish in English: place names (the fixtures and the saved places), the brand, and the language switch itself.
const ALLOW = [...new Set([].concat(...PLACES.map((p) => [p.name, p.district, p.city, p.state])).filter(Boolean))]
  .concat(["Türkiye", "Ne Giysem?", "Ne Giysem", "Türkçe", "Dil · Language", "Deniz"]).sort((a, b) => b.length - a.length);
const TR_CHARS = /[çğıöşüÇĞİÖŞÜâîû]/;
// Turkish words the app uses that have no Turkish letters (so the letter check alone would miss them)
const TR_WORDS = /\b(ve|bir|ile|yok|var|hava|havas[ıi]|yer|dk|km\/sa|kaydet|kapat|tamam|ara|sil|rota|ekle|sana|kar|sis|serin|sakin|sert|spor|reklam|giy|olsun|ama|daha|konum|mont|kaban|bere|tayt|bavul|durak|vapur|araba|taksi|dakika|pzt|cmt|paz|pazar|cuma|nem|ben|kalan|gibi|bas|al)\b/i;
// Everything a person sees or hears: rendered text, then aria-label / placeholder / title / alt / value of rendered elements.
async function leaks(page) {
  const items = await page.evaluate(() => {
    const out = [{ where: "text", s: document.body.innerText }, { where: "title", s: document.title },
      { where: "meta", s: document.querySelector('meta[name="description"]').content }];
    document.querySelectorAll("*").forEach((el) => {
      if (el.closest("[hidden]") || el.closest('[lang="tr"]')) return;
      ["aria-label", "placeholder", "title", "alt"].forEach((a) => { const v = el.getAttribute(a); if (v) out.push({ where: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "@" + a, s: v }); });
      if (el.tagName === "INPUT" && el.type !== "hidden" && el.id !== "q" && el.value) out.push({ where: "input#" + (el.id || el.dataset.k || "") + "@value", s: el.value }); // (#q holds what the person typed)
      if (el.tagName === "TEXTAREA" && el.value) out.push({ where: "textarea@value", s: el.value });
    });
    return out;
  });
  const bad = [];
  for (const it of items) {
    let s = it.s; for (const a of ALLOW) s = s.split(a).join(" ");
    s.split(/\n+/).forEach((line) => { if (TR_CHARS.test(line) || TR_WORDS.test(line)) bad.push(it.where + ": " + line.trim().slice(0, 140)); });
  }
  return bad;
}
async function noLeaks(s, label) {
  const bad = await leaks(s.page);
  return check(label + ": no Turkish in visible text or attributes", !bad.length, bad.slice(0, 8));
}
const pageOk = (s, label) => {
  const cons = s.consoleErr.filter((m) => !/Failed to load resource/.test(m));
  return check(label + ": no page or console errors", !s.errors.length && !cons.length, s.errors.concat(cons));
};
async function scrollTo(s, sel) { await s.page.$eval(sel, (e) => e.scrollIntoView({ block: "start" })); await sleep(200); }
const androidBridge = async (s, calls) => {
  await s.page.exposeFunction("__bridge", (j) => calls.push(JSON.parse(j)));
  await s.context.addInitScript(() => { window.NeGiysemAndroid = { saveState: (j) => window.__bridge(j), setTheme() {}, reset() {}, hasLocation: () => true }; });
};

H.run({
  async englishByDefault(t) {
    // a first open on an English phone: manual weather, English everywhere
    const f = await t.open({ ctx: EN, geo: { state: "prompt" } });
    await f.goto(); await sleep(400);
    const a = await f.page.evaluate(() => ({ lang: document.documentElement.lang, head: document.getElementById("headline").textContent, status: document.getElementById("status").textContent,
      manual: document.getElementById("manualCard").innerText, pressed: document.querySelector('[data-key="lang"] [aria-pressed="true"]').dataset.val }));
    note("first open (en-US):", JSON.stringify(a));
    check("en-US browser: the page is English (<html lang=en>, English switch pressed)", a.lang === "en" && a.pressed === "en", a);
    check("first open: status and manual card in English", /^To start, press refresh/.test(a.status) && /Set the weather by hand/.test(a.manual) && /Sunny/.test(a.manual) && /Breezy/.test(a.manual), a);
    check("first open: language not stored until chosen", !((await f.stored()) || {}).lang, await f.stored());
    await noLeaks(f, "first open (manual)");
    pageOk(f, "first open");
    await f.close();

    // live weather on an English phone, light and dark
    for (const theme of ["light", "dark"]) {
      const s = await t.open({ ctx: theme === "dark" ? EN_DARK : EN, seed: seed(fc(9)) });
      await s.goto(); await sleep(400);
      const m = await s.page.evaluate(() => ({ head: document.getElementById("headline").textContent, pills: [...document.querySelectorAll("#pills .pill")].map((e) => e.textContent), level: document.getElementById("tagLevel").textContent,
        labels: [...document.querySelectorAll("#wear .lab")].map((e) => e.textContent), take: document.getElementById("take").innerText, feels: document.getElementById("nowFeels").textContent,
        cond: document.getElementById("nowCond").textContent, facts: document.getElementById("facts").innerText, place: document.getElementById("placeBtn").getAttribute("aria-label") }));
      if (theme === "light") {
        note("main:", JSON.stringify(m));
        check("main: English headline with its highlight", /[A-Za-z]/.test(m.head) && !!(await s.page.$("#headline .hl")) && !TR_CHARS.test(m.head), m.head);
        check("main: level on the tag, sticker labels, 'Take along' in English", ["Freezing", "Very cold", "Cold", "Chilly", "Cool", "Mild", "Warm", "Hot"].includes(m.level) && m.labels.includes("Sweater") && /^Take along/.test(m.take), m);
        check("main: feels-like, condition, units (km/h, %)", /^Feels like \d+°/.test(m.feels) && m.cond === "Partly cloudy" && /NE wind · 10 km\/h/.test(m.facts) && /Rain 5%/.test(m.facts) && /Humidity 65%/.test(m.facts) && /Updated \d\d:\d\d/.test(m.facts), m);
        check("main: place button aria-label in English", m.place === "Place: Beşiktaş. Change", m.place);
        // the info card: tap a sticker
        await s.page.tap("#wear .stk:nth-child(1)"); await sleep(250);
        const tip = await s.page.$eval("#tipCard", (e) => ({ hidden: e.hidden, text: e.innerText }));
        note("info card:", tip.text.replace(/\n/g, " | "));
        check("info card: slot, alternatives, reasons and tip in English", !tip.hidden && /Top · (mid|base) layer/i.test(tip.text) && /Feels like/.test(tip.text) && !TR_CHARS.test(tip.text), tip.text);
        await noLeaks(s, "main with info card");
        await s.page.tap("#headline"); await sleep(150);
        // the detailed list
        await s.page.$eval("#more", (d) => { d.open = true; }); await sleep(100);
        const slots = await s.page.$eval("#slotList", (e) => e.textContent); // (innerText would be upper-cased by the CSS)
        check("detailed list in English", /Outer layer/.test(slots) && /Bottoms/.test(slots) && /Feet/.test(slots), slots.slice(0, 200));
        await s.page.$eval("#more", (d) => { d.open = false; });
      }
      await s.page.evaluate(() => window.scrollTo(0, 0)); await sleep(150);
      await s.shot(`12-main-${theme}`);
      await scrollTo(s, ".me"); await s.shot(`12-settings-${theme}`);
      const me = await s.page.$eval(".me", (e) => e.innerText);
      if (theme === "light") {
        check("settings card in English, with the language switch", /For you/.test(me) && /How long outside\?/.test(me) && /I get cold easily/.test(me) && /Delete all my data/.test(me) && /Dil · Language/.test(me) && /English/.test(me), me.slice(0, 300));
        await noLeaks(s, "main screen");
        const ov = await s.page.evaluate(() => ({ docW: document.documentElement.scrollWidth, vw: innerWidth }));
        check("English: no horizontal scroll at 412 px", ov.docW <= ov.vw, ov);
      }
      pageOk(s, "main " + theme);
      await s.close();
    }
  },

  async switchInApp(t) {
    const calls = [];
    const s = await t.open({ seed: seed(fc(9)) }); // Turkish phone
    await androidBridge(s, calls);
    await s.goto(); await sleep(400);
    // (each drawing numbers its own gradients: the numbers aren't part of the comparison)
    const grab = () => s.page.evaluate(() => { const ids = (h) => h.replace(/ng\d+-/g, "ng-"); return { lang: document.documentElement.lang, head: document.getElementById("headline").innerHTML,
      pills: document.getElementById("pills").innerHTML, wear: ids(document.getElementById("wear").innerHTML), me: ids(document.querySelector(".me").innerHTML),
      manual: document.getElementById("manualCard").innerHTML, week: ids(document.getElementById("week").innerHTML), foot: document.getElementById("foot").innerHTML,
      q: document.getElementById("q").getAttribute("placeholder"), refresh: document.getElementById("refresh").getAttribute("aria-label"), desc: document.querySelector('meta[name="description"]').content }; });
    const tr0 = await grab();
    check("Turkish phone: Turkish page", tr0.lang === "tr" && /Sana göre/.test(tr0.me), tr0.lang);
    check("Android payload carries lang 'tr'", calls.length === 0 || calls[calls.length - 1].lang === "tr", calls.slice(-1));
    await scrollTo(s, '[data-key="lang"]');
    await s.page.tap('[data-key="lang"] [data-val="en"]'); await sleep(300);
    const en = await grab();
    note("after tapping English:", en.head.replace(/<[^>]+>/g, ""), "|", en.refresh);
    check("tapping English: re-rendered at once, no reload", en.lang === "en" && /For you/.test(en.me) && en.head !== tr0.head && en.refresh === "Refresh the weather" && en.q === "Neighborhood, school, stop or address…", en.lang);
    check("English: stored and sent to Android", (await s.stored()).lang === "en" && calls.length && calls[calls.length - 1].lang === "en", { stored: (await s.stored()).lang, last: calls.slice(-1).map((c) => c.lang) });
    await noLeaks(s, "after the switch");
    await s.reload(); await sleep(400);
    check("English survives a reload on a Turkish phone", await s.page.evaluate(() => document.documentElement.lang) === "en" && /^Feels like/.test(await s.page.$eval("#nowFeels", (e) => e.textContent)), true);
    await scrollTo(s, '[data-key="lang"]');
    await s.page.tap('[data-key="lang"] [data-val="tr"]'); await sleep(300);
    const tr1 = await grab();
    const same = Object.keys(tr0).filter((k) => tr0[k] !== tr1[k]);
    check("back to Türkçe: Turkish restored exactly (headline, pills, stickers, settings, week, footer, attributes)", !same.length, same.map((k) => k + ": " + String(tr1[k]).slice(0, 120)));
    check("Türkçe: stored and sent to Android", (await s.stored()).lang === "tr" && calls[calls.length - 1].lang === "tr", calls.slice(-1).map((c) => c.lang));
    pageOk(s, "switch");
    await s.close();
  },

  async resetGoesBackToDevice(t) {
    for (const [ctx, device, other] of [[{}, "tr", "en"], [EN, "en", "tr"]]) {
      const s = await t.open({ ctx, seed: seed(fc(9)) });
      await s.goto(); await sleep(300);
      await scrollTo(s, '[data-key="lang"]');
      await s.page.tap(`[data-key="lang"] [data-val="${other}"]`); await sleep(250);
      const r = await s.page.$("#resetBtn"); await r.click(); await r.click(); await sleep(300);
      const st = await s.page.evaluate((k) => ({ lang: document.documentElement.lang, status: document.getElementById("status").textContent, stored: localStorage.getItem(k), btn: document.getElementById("resetBtn").textContent }), KEY);
      check(`'${device}' device, '${other}' picked, data deleted: back to '${device}'`, st.lang === device && (device === "en" ? /^All data deleted/.test(st.status) && st.btn === "Delete all my data" : /^Tüm veriler silindi/.test(st.status) && st.btn === "Tüm verilerimi sil"), st);
      await s.close();
    }
  },

  async routineWeekPack(t) {
    // the page clock at 09:30 so today's 13:00 trip is ahead; rain at Kadıköy 13:00–16:00
    const d = istNow(), T = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9 - 3, 30), dow = d.getUTCDay();
    const dry = rain(fc(14), 24 + 8, 13, 63, 90), wetB = rain(fc(16), 13, 3, 61, 80);
    const st = state(dry, {
      trips: [{ id: "t1", from: "pbes", to: "pkad", time: "13:00", days: [dow] }, { id: "t2", from: "pkad", to: "pbes", time: "18:00", days: [dow] }],
      routes: [{ id: "r1", from: "pbes", to: "pkad", name: "Ferry", steps: [{ m: "walk", min: 10, slope: "up" }, { m: "ferry", min: 20, a: "Beşiktaş", b: "Kadıköy" }, { m: "walk", min: 10, slope: "flat" }] },
        { id: "r2", from: "pbes", to: "pkad", name: "Metro", steps: [{ m: "wait", min: 5 }, { m: "metro", min: 25 }, { m: "walk", min: 6, slope: "steep" }] }],
      dayMode: true, dayWx: { fetchedAt: T, byPlace: { pbes: dry, pkad: wetB } } });
    st.live.fetchedAt = T;
    st.places.push({ id: "pkiz", name: "Kızılay", sub: "Ankara", lat: 39.92, lon: 32.854 }); // saved, never fetched
    for (const theme of ["light", "dark"]) {
      const s = await t.open({ ctx: Object.assign({ permissions: ["clipboard-read", "clipboard-write"] }, theme === "dark" ? EN_DARK : EN), seed: { [KEY]: JSON.stringify(st) } });
      await s.page.clock.setFixedTime(new Date(T));
      await s.goto(); await sleep(400);
      if (theme === "light") {
        const banner = await s.page.$eval("#rainAlert", (e) => ({ hidden: e.hidden, text: e.innerText.replace(/\s+/g, " ").trim(), aria: e.querySelector("[data-rain-off]") && e.querySelector("[data-rain-off]").getAttribute("aria-label") }));
        note("rain banner:", banner.text);
        check("rain banner in English, for the trip", !banner.hidden && /^Rain (starts )?around \d\d:\d\d/.test(banner.text) && /Beşiktaş → Kadıköy/.test(banner.text) && /umbrella|hooded/.test(banner.text) && banner.aria === "Dismiss the rain warning for today", banner);
        const trip = await s.page.$eval("#tripCard", (e) => e.innerText.replace(/\n+/g, " | "));
        note("my day:", trip.slice(0, 300));
        check("'My day' card in English (min, outside, walking, route chips)", /^Today \| For my day \| Edit/.test(trip) && /suggested/.test(trip) && /No route for this trip yet\./.test(trip) && /\d+ min/.test(trip) && /outside \d+ min/.test(trip) && /walking \d+ min/.test(trip) && /Ferry/.test(trip) && /For my day/.test(trip), trip.slice(0, 300));
        check("pills say the outfit follows my day", /For my day/.test(await s.page.$eval("#pills", (e) => e.textContent)), await s.page.$eval("#pills", (e) => e.textContent));
        // every highlight followed by punctuation is wrapped with it (no comma at the start of a line)
        const hd = await s.page.$eval("#headline", (e) => ({ text: e.textContent, glued: [...e.querySelectorAll(".nw")].map((n) => n.textContent),
          loose: [...e.querySelectorAll(".hl")].filter((h) => !h.closest(".nw") && h.nextSibling && /^[.,;:!?]/.test(h.nextSibling.textContent || "")).length }));
        note("headline:", JSON.stringify(hd));
        check("headline: punctuation after the highlight stays on its line", hd.loose === 0, hd);
        await s.shot("12-myday-light");
        await noLeaks(s, "my day + rain banner");
      }
      // this week
      await scrollTo(s, "#weekCard");
      const rows = await s.page.$$eval("#week .wk-row", (b) => b.map((x) => x.innerText.replace(/\s+/g, " ").trim()));
      if (theme === "light") {
        note("week rows:", rows.join(" || "));
        const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        check("week: Today, Tomorrow, then English weekdays and levels", /^Today/.test(rows[0]) && /^Tomorrow/.test(rows[1]) && rows.slice(2).every((r) => DAYS.some((x) => r.startsWith(x))) && rows.every((r) => /(Freezing|Very cold|Cold|Chilly|Cool|Mild|Warm|Hot)/.test(r)), rows);
        await s.page.locator("#week .wk-row").nth(1).tap(); await sleep(200);
        const more = await s.page.$eval("#week li:nth-child(2) .wk-more", (e) => e.innerText);
        note("tomorrow:", more.replace(/\n/g, " | "));
        check("week: a tapped day shows its verdict in English", /Wear: /.test(more) && /Take along: /.test(more) && /Feels like -?−?\d+° – −?\d+°/.test(more) && /Chance of rain 90%/.test(more), more);
      }
      await s.shot(`12-week-${theme}`);
      // packing list
      await s.page.locator("#weekCard [data-open-pack]").tap(); await sleep(300);
      await s.page.tap('[data-pk="start"][data-v="0"]'); await s.page.tap('[data-pk="days"][data-v="3"]'); await sleep(200);
      const pack = await s.page.$eval("#packBody", (e) => e.innerText.replace(/\n+/g, " | "));
      if (theme === "light") {
        note("pack:", pack.slice(0, 400));
        check("packing sheet in English (summary, groups, reasons)", /Where to\?/.test(pack) && /Beşiktaş · 3 days/.test(pack) && /0\/\d+ packed/.test(pack) && /Tops/.test(pack) && /Basics/.test(pack) && /Socks/.test(pack) && /Underwear/.test(pack) && /One for each day/.test(pack) && /Folding umbrella/.test(pack), pack.slice(0, 500));
        const range = await s.page.$eval(".pk-sum span", (e) => e.textContent);
        check("packing: dates in English (month name)", /^(January|February|March|April|May|June|July|August|September|October|November|December) \d+/.test(range), range);
        await s.page.locator(".pk-it", { hasText: "Folding umbrella" }).tap(); await sleep(100);
        if (await s.page.evaluate(() => typeof navigator.share === "function")) note("navigator.share exists here; copy path not exercised");
        else {
          check("packing: share button says 'Copy the list'", (await s.page.$eval("[data-pk-share]", (e) => e.textContent)) === "Copy the list", await s.page.$eval("[data-pk-share]", (e) => e.textContent));
          await s.page.tap("[data-pk-share]"); await sleep(300);
          const clip = await s.page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
          note("copied list:", clip.split("\n").slice(0, 5).join(" / "));
          check("packing: the copied list is English", /^Packing list: Beşiktaş, 3 days \(/.test(clip) && /☑ Folding umbrella/.test(clip) && /\nTops:\n/.test(clip) && /Made with Ne Giysem\?$/.test(clip) && !TR_CHARS.test(clip.replace(/Beşiktaş/g, "")), clip.slice(0, 160));
          check("packing: 'copied' message in English", /List copied to the clipboard\./.test(await s.page.$eval("#pkMsg", (e) => e.textContent)), await s.page.$eval("#pkMsg", (e) => e.textContent));
        }
        await s.page.tap('[data-pk="start"][data-v="1"]'); await s.page.tap('[data-pk="days"][data-v="7"]'); await sleep(150);
        check("packing: 'no forecast yet' note in English", /No forecast yet for the last day: the counts are for 7 days, the weather for the first 6 days\./.test(await s.page.$eval("#packBody", (e) => e.innerText)), (await s.page.$eval("#packBody", (e) => e.innerText)).slice(0, 300));
        await s.page.tap('[data-pk="place"][data-v="pkiz"]'); await sleep(150);
        const nw = await s.page.$eval("#packBody .pk-note", (e) => e.innerText);
        check("packing: place without forecast explained in English", /^There's no forecast for Kızılay yet; get its weather first to make the list\./.test(nw) && /Get the weather for Kızılay/.test(await s.page.$eval("[data-pk-fetch]", (e) => e.textContent)), nw);
        await s.page.tap('[data-pk="place"][data-v="pbes"]'); await s.page.tap('[data-pk="start"][data-v="0"]'); await s.page.tap('[data-pk="days"][data-v="3"]'); await sleep(150);
        await noLeaks(s, "packing sheet");
      }
      await s.shot(`12-pack-${theme}`);
      await s.page.keyboard.press("Escape"); await sleep(150);
      if (theme === "light") {
        // the routine editor (last: closing it fetches the trips' weather again)
        await s.page.tap("#tripCard [data-open-routine]"); await sleep(400);
        const ed = await s.page.$eval("#routine", (e) => e.innerText.replace(/\n+/g, " | "));
        note("routine editor:", ed.slice(0, 300));
        check("routine editor in English", /^My routine/.test(ed) && /Places/.test(ed) && /Trips/.test(ed) && /Routes/.test(ed) && /Add a step:/.test(ed) && /Gentle uphill|Steep uphill|Flat/.test(ed) && /Mon/.test(ed) && /Done, get the weather/.test(ed), ed.slice(0, 400));
        const attrs = await s.page.$$eval("#routine [aria-label], #routine [placeholder]", (l) => l.map((e) => e.getAttribute("aria-label") || e.getAttribute("placeholder")));
        check("routine editor aria-labels / placeholders in English", attrs.some((a) => /^Departure time: .+ → .+$/.test(a)) && attrs.some((a) => /^Mon, .+ → .+$/.test(a)) && attrs.includes("From") && attrs.includes("To") && attrs.includes("Minutes") && attrs.some((a) => /^Delete the \d\d:\d\d trip$/.test(a)) && attrs.includes("Where you get on"), attrs.slice(0, 12));
        await s.page.tap('#routine [data-act="addroute"]'); await sleep(250);
        check("a new route gets an English name", (await s.page.$$eval('#routine input[data-k="name"][data-route]', (l) => l.map((e) => e.value))).includes("Route 3"), await s.page.$$eval('#routine input[data-k="name"][data-route]', (l) => l.map((e) => e.value)));
        await scrollTo(s, "#routine"); await s.shot("12-routine-light");
        await noLeaks(s, "routine editor");
        await s.page.tap('#routine [data-act="close"]'); await sleep(300);
      }
      pageOk(s, "routine/week/pack " + theme);
      await s.close();
    }
  },

  async peopleWardrobe(t) {
    for (const theme of ["light", "dark"]) {
      const s = await t.open({ ctx: theme === "dark" ? EN_DARK : EN, seed: seed(fc(5)) });
      await s.goto(); await sleep(400);
      await s.page.click("[data-person-add]"); await sleep(200);
      const sheet = await s.page.$eval("#personSheet", (e) => ({ text: e.innerText, ph: e.querySelector("#pfName").placeholder }));
      if (theme === "light") {
        note("person sheet:", sheet.text.replace(/\n+/g, " | "));
        check("person sheet in English", /^Add a person/.test(sheet.text) && /Age group/.test(sheet.text) && /Adult/.test(sheet.text) && /Child/.test(sheet.text) && /Over 65/.test(sheet.text) && /Save/.test(sheet.text) && sheet.ph === "E.g. Alex", sheet);
        await noLeaks(s, "person sheet");
      }
      await s.page.fill("#pfName", "Deniz"); await s.page.click("[data-pf-save]"); await sleep(300);
      const after = await s.page.evaluate(() => ({ pills: document.getElementById("pills").textContent, status: document.getElementById("status").textContent, chips: [...document.querySelectorAll("#people .chip")].map((e) => e.textContent) }));
      if (theme === "light") {
        note("after adding Deniz:", JSON.stringify(after));
        check("child added: 'For Deniz' pill, English status, age group on the chip", /For Deniz/.test(after.pills) && after.status === "The suggestion is for Deniz (child)." && after.chips.includes("Deniz · Child") && after.chips.includes("Me"), after);
      }
      // the coat the child is dressed in, to take out of the wardrobe
      const COATS = { "Puffer jacket": "sisme", "Wool coat": "kaban", "Jacket": "mont", "Parka": "parka" };
      const coat = (await s.page.$$eval("#wear .lab", (e) => e.map((x) => x.textContent))).find((l) => COATS[l]);
      await s.page.click("#wardBtn"); await sleep(250);
      const ward = await s.page.$eval("#wardSheet", (e) => e.innerText.replace(/\n+/g, " | "));
      if (theme === "light") {
        note("wardrobe:", ward.slice(0, 300), "| coat:", coat);
        check("wardrobe sheet in English", /^Deniz · My wardrobe/.test(ward) && /Tops/.test(ward) && /Outer layer/.test(ward) && /Shoes/.test(ward) && /Accessories/.test(ward) && /Wool coat/.test(ward) && /have/.test(ward) && / OK$/.test(ward), ward.slice(-300));
      }
      await s.page.click(`[data-ward="${COATS[coat]}"]`); await sleep(150);
      await s.shot(`12-wardrobe-${theme}`);
      if (theme === "light") await noLeaks(s, "wardrobe sheet");
      await s.page.click("#wardSheet .ed-foot [data-close-sheet]"); await sleep(200);
      if (theme === "light") {
        const hint = await s.page.$eval("#wardHint", (e) => e.textContent);
        check("wardrobe hint in English", hint === `Deniz: not in the wardrobe: ${coat}. What they have is suggested instead.`, hint);
        const why = "No " + coat.toLowerCase() + " in your wardrobe; this instead";
        const node = await s.page.$(`#wear .stk[aria-label*="${why}"]`);
        if (node) { await node.tap(); await sleep(200); }
        const tip = await s.page.$eval("#tipCard", (e) => e.innerText);
        check("info card says why the stand-in is there, in English", !!node && tip.includes(why), { why, tip });
        await s.page.tap("#headline"); await sleep(100);
        await noLeaks(s, "people & wardrobe");
      }
      pageOk(s, "people " + theme);
      await s.close();
    }
  },

  async shareCard(t) {
    const s = await t.open({ ctx: EN, seed: seed(fc(15)) });
    await s.context.addInitScript(() => {
      window.__drawn = [];
      const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (txt, ...a) { window.__drawn.push(String(txt)); return f.call(this, txt, ...a); };
      Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: (d) => !!(d && d.files && d.files.length) });
      Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: async (d) => { window.__shared = d; } });
    });
    await s.goto(); await sleep(300);
    await s.page.tap("#shareBtn");
    await s.page.waitForFunction(() => window.__shared, null, { timeout: 8000 });
    const info = await s.page.evaluate(async () => {
      const f = window.__shared.files[0], buf = new Uint8Array(await f.arrayBuffer()); let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { drawn: window.__drawn, text: window.__shared.text, b64: btoa(bin) };
    });
    fs.writeFileSync(path.join(SHOTS, "12-share-card.png"), Buffer.from(info.b64, "base64"));
    note("drawn on the card:", info.drawn.join(" | "));
    const all = info.drawn.join("\n");
    const WEEK = /^(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY), (JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) \d+$/;
    check("share card: English date line", WEEK.test(info.drawn[0]), info.drawn[0]);
    check("share card: feels-like, 'Take along' and the footer in English", /Feels like \d+°/.test(all) && info.drawn.includes("Take along") && info.drawn.includes("today's outfit for the weather"), info.drawn);
    check("share card: no Turkish drawn (but the place name)", !info.drawn.some((x) => TR_CHARS.test(x.replace("Beşiktaş", ""))), info.drawn.filter((x) => TR_CHARS.test(x.replace("Beşiktaş", ""))));
    check("share caption is the English headline", /\(Ne Giysem\?\)$/.test(info.text) && !TR_CHARS.test(info.text), info.text);
    pageOk(s, "share");
    await s.close();
    // Android app without a native share: the picture in a sheet with English hint and alt text
    const a = await t.open({ ctx: EN_DARK, seed: seed(fc(15)) });
    await a.context.addInitScript(() => { window.NeGiysemAndroid = { saveState() {}, setTheme() {}, hasLocation() { return true; }, reset() {} }; });
    await a.goto(); await sleep(300);
    await a.page.tap("#shareBtn");
    await a.page.waitForFunction(() => { const i = document.getElementById("shareImg"); return !document.getElementById("shareSheet").hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
    const v = await a.page.evaluate(() => ({ hint: document.getElementById("shareHint").textContent, alt: document.getElementById("shareImg").alt, title: document.getElementById("shareTitle").textContent, acts: document.getElementById("shareActs").innerText }));
    check("share sheet (Android) in English", v.hint === "Press and hold the picture to save it." && /^Share card: /.test(v.alt) && v.title === "Share card" && /Close/.test(v.acts), v);
    await sleep(400); await a.shot("12-share-sheet-dark");
    await noLeaks(a, "share sheet");
    await a.close();
  },

  async messagesAndSearch(t) {
    // search: kinds in English; then the search service fails
    const s = await t.open({ ctx: EN, geo: { state: "granted", coords: GPS.moda } });
    await s.goto(); await sleep(800);
    check("granted GPS: English status-free load, Moda weather", (await s.label()) === "Moda" && (await s.status()) === "", { label: await s.label(), status: await s.status() });
    await s.chip("+ Add a place"); await s.page.waitForSelector("#q", { state: "visible" });
    await s.type("kadıköy", 30); await sleep(900);
    const res = await s.results(), kinds = await s.page.$$eval("#results .kind", (l) => l.map((e) => e.textContent));
    note("results:", res.join(" || "));
    check("search result kinds in English", ["District", "Village", "Pier", "Quarter"].every((k) => kinds.includes(k)) && kinds.every((k) => !TR_CHARS.test(k)), kinds);
    check("search distances use a decimal point", res.some((r) => /· \d\.\d km/.test(r)), res);
    check("search panel attributes in English", (await s.page.$eval("#q", (e) => e.placeholder + "|" + e.getAttribute("aria-label"))) === "Neighborhood, school, stop or address…|Search for a place" && (await s.page.$eval("#results", (e) => e.getAttribute("aria-label"))) === "Search results", true);
    await s.shot("12-search-light");
    await noLeaks(s, "search results");
    s.net.fail.photon = 500; s.net.fail.omgeo = 500;
    await s.type("beşiktaş", 20); await s.page.keyboard.press("Enter"); await sleep(900);
    const st = await s.status(), acts = await s.statusActs();
    note("search failure:", st, acts);
    check("search failure: English message and 'Try again'", /^Couldn't reach the place search service\. Check your internet connection and try again\./.test(st) && acts.includes("Try again"), { st, acts });
    s.net.fail.photon = null; s.net.fail.omgeo = null;
    await s.page.tap("#cancelSearch"); await sleep(150);
    // weather service busy
    s.net.fail.forecast = 429;
    await s.page.tap("#refresh"); await sleep(700);
    const busy = await s.status();
    check("forecast 429: English message, last weather kept", busy.startsWith("The weather service is very busy right now; try again in a bit. Showing the last weather fetched.") && (await s.statusActs()).includes("Try again"), busy);
    s.net.fail.forecast = null;
    // offline
    s.net.offline = true; await s.context.setOffline(true); await sleep(200);
    await s.page.tap("#refresh"); await sleep(600);
    const off = await s.status();
    check("offline: English message", /^You're offline; showing the last weather fetched\./.test(off), off);
    await s.shot("12-offline-light");
    await noLeaks(s, "offline message");
    s.net.offline = false; await s.context.setOffline(false); await sleep(200);
    await s.page.evaluate(() => window.dispatchEvent(new Event("online"))); await sleep(800);
    check("back online: the offline message goes away", !/offline/.test(await s.status()), await s.status());
    pageOk(s, "messages");
    await s.close();
    // no permission: approximate location, explained in English
    const d = await t.open({ ctx: EN, geo: { state: "prompt", answer: "deny" } });
    await d.goto(); await sleep(300);
    await d.page.tap("#refresh"); await sleep(900);
    const dn = await d.snap();
    note("denied:", JSON.stringify(dn));
    check("location denied: approximate location, English note", dn.label === "İstanbul" && /^Without location permission, an approximate location was used\./.test(dn.status) && dn.chips.some((c) => /^\[\*\]My location · İstanbul$/.test(c)), dn);
    await d.close();
  },

  async moneyEnglish(t) {
    const MONEY = { shops: [{ name: "Amazon", url: "https://www.amazon.com.tr/s?k={q}&tag=test-21" }], adsense: { client: "ca-pub-1234567890", slot: "42" }, donate: "https://example.org/destek" };
    const s = await t.open({ ctx: EN, seed: seed(fc(5)), api: true });
    await s.context.addInitScript((c) => { window.NG_CONFIG = c; }, MONEY);
    await s.goto(); await sleep(500);
    const c = await s.page.$eval("#consent", (e) => ({ hidden: e.hidden, text: e.innerText, href: e.querySelector("a").getAttribute("href") }));
    check("ads consent in English, English privacy page", !c.hidden && /^To keep Ne Giysem\? free/.test(c.text) && /Allow/.test(c.text) && /Don't personalize/.test(c.text) && c.href === "privacy.html", c);
    await s.page.click('#consent [data-ads="npa"]'); await sleep(200);
    const foot = await s.page.evaluate(() => ({ credit: document.getElementById("wxCredit").textContent, foot: document.getElementById("foot").innerHTML, ad: document.querySelector("#adSlot .ad-lab").textContent, donate: document.getElementById("donateRow").innerText }));
    check("credits, footer, ad label and donation in English", /^Weather data: MET Norway \(CC BY 4\.0, adapted\)$/.test(foot.credit) && foot.foot.includes(API_ORIGIN + "/privacy.html") && /Ad choices/.test(foot.foot) && foot.ad === "Ad" && /Support Ne Giysem\?/.test(foot.donate), foot);
    await s.page.tap("#wear .stk:nth-child(2)"); await sleep(200);
    const tip = await s.page.$eval("#tipCard", (e) => ({ text: e.innerText, html: e.innerHTML }));
    check("shop links: English labels and disclosure, Turkish search words kept", tip.html.includes('<span class="ad-tag">Ad</span>') && /Find something similar: |Not in your wardrobe\? See: /.test(tip.text) && /Affiliate link: if you buy something/.test(tip.text) && /k=kaban/.test(tip.html), tip.text.slice(-200));
    await s.page.tap("#headline"); await sleep(100);
    await noLeaks(s, "ads, shops and credits");
    pageOk(s, "money");
    await s.close();
  },
});
