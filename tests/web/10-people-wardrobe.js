// People (age groups) and the wardrobe: what the app suggests when a piece isn't owned.
const H = require("./lib");
const { check, sleep, KEY, fc } = H;

const seed = (t0, extra = {}) => ({ [KEY]: JSON.stringify(Object.assign({
  places: [{ id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 }], sel: "pbes", mode: "live",
  live: { placeKey: "pbes", place: { name: "Beşiktaş", lat: 41.043, lon: 29.007 }, wx: fc(t0), fetchedAt: Date.now() } }, extra)) });
const wear = (s) => s.page.$$eval("#wear .lab", (e) => e.map((x) => x.textContent));
const take = (s) => s.page.$$eval("#take .mini", (e) => e.map((x) => x.textContent.trim()));
async function toggle(s, keys) {
  await s.page.click("#wardBtn"); await sleep(150);
  for (const k of keys) { await s.page.click(`[data-ward="${k}"]`); await sleep(60); }
  await s.page.click("#wardSheet .ed-foot [data-close-sheet]"); await sleep(150);
}

H.run({
  async missingCoat(t) {
    const s = await t.open({ seed: seed(5) });
    await s.goto(); await sleep(400);
    const before = await wear(s);
    check("cold day suggests a kaban", before.includes("Kaban"), before);
    await toggle(s, ["kaban", "atki"]);
    const after = await wear(s), head = await s.head(), tk = await take(s);
    check("no kaban in the wardrobe: the closest coat instead", !after.includes("Kaban") && after.includes("Şişme mont"), after);
    check("headline doesn't name the missing kaban", !/kaban/i.test(head), head);
    check("no atkı offered", !tk.some((x) => /Atkı/.test(x)), tk);
    const hint = await s.page.$eval("#wardHint", (e) => e.textContent);
    check("settings say what is missing", /Kaban/.test(hint) && /Atkı/.test(hint), hint);
    await s.reload(); await sleep(300);
    check("wardrobe survives a reload", !(await wear(s)).includes("Kaban"), await wear(s));
    await s.page.hover("#wear .stk:nth-child(2)"); await sleep(150);
    const tip = await s.page.$eval("#tipCard", (e) => e.textContent);
    check("info card says why the stand-in is there", /Dolabında kaban yok/.test(tip), tip);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  async noCoatAtAll(t) {
    const s = await t.open({ seed: seed(5) });
    await s.goto(); await sleep(400);
    await toggle(s, ["kaban", "sisme", "mont", "parka"]);
    const marked = await s.page.$$eval("#wear .stk.need .lab", (e) => e.map((x) => x.textContent));
    check("nothing can replace the coat: it stays, marked as not owned", marked.length === 1, marked);
    await s.close();
  },

  async noUmbrellaInRain(t) {
    const wx = fc(18); wx.current.weather_code = 63; wx.current.precipitation = 2;
    const s = await t.open({ seed: { [KEY]: JSON.stringify({ places: [{ id: "pbes", name: "Beşiktaş", lat: 41.043, lon: 29.007 }], sel: "pbes", mode: "live",
      live: { placeKey: "pbes", place: { name: "Beşiktaş", lat: 41.043, lon: 29.007 }, wx, fetchedAt: Date.now() } }) } });
    await s.goto(); await sleep(400);
    check("rain: umbrella offered", (await take(s)).some((x) => /Şemsiye/.test(x)), await take(s));
    await toggle(s, ["semsiye"]);
    const tk = await take(s), head = await s.head();
    check("no umbrella owned: not offered, headline doesn't ask for it", !tk.some((x) => /Şemsiye/.test(x)) && !/emsiye/.test(head), { tk, head });
    check("still something waterproof is worn", (await wear(s)).some((x) => /Yağmurluk|Rüzgârlık|ceket|Mont/.test(x)), await wear(s));
    await s.close();
  },

  async childProfile(t) {
    const calls = [];
    const s = await t.open({ seed: seed(9) });
    await s.page.exposeFunction("__bridge", (j) => calls.push(JSON.parse(j)));
    await s.context.addInitScript(() => { window.NeGiysemAndroid = { saveState: (j) => window.__bridge(j), setTheme() {}, reset() {}, hasLocation: () => false }; });
    await s.goto(); await sleep(400);
    const hero = (s) => s.page.evaluate(() => document.getElementById("pills").textContent + " · " + document.getElementById("tagLevel").textContent);
    const me = await hero(s);
    await s.page.click("[data-person-add]"); await sleep(150);
    await s.page.fill("#pfName", "Deniz"); await s.page.click("[data-pf-save]"); await sleep(300);
    const kid = await hero(s);
    check("child profile: hero says whose outfit", /Deniz için/.test(kid), kid);
    check("child is dressed warmer than the adult (one band colder)", me !== kid && /Soğuk/.test(kid), { me, kid });
    const last = calls[calls.length - 1] || {};
    check("Android widget gets the active person", last.who === "child" && Array.isArray(last.missing), last);
    await toggle(s, ["kazak"]);
    await s.page.click('[data-person="me"]'); await sleep(250);
    check("each person has their own wardrobe", (await wear(s)).includes("Kazak") || !(await wear(s)).length, await wear(s));
    await s.reload(); await sleep(300);
    const chips = await s.page.$$eval("#people .chip", (e) => e.map((x) => (x.getAttribute("aria-pressed") === "true" ? "*" : "") + x.textContent));
    check("people survive a reload", chips.some((c) => /Deniz/.test(c)) && chips.some((c) => c === "*Ben"), chips);
    // edit and delete
    await s.page.click('[data-person^="u"]'); await sleep(200);
    await s.page.click("[data-person-edit]"); await sleep(150);
    await s.page.click("[data-pf-del]"); await sleep(250);
    const left = await s.page.$$eval("#people [data-person]", (e) => e.length);
    check("a person can be deleted", left === 1, left);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  async resetClearsPeople(t) {
    const s = await t.open({ seed: seed(9, { profiles: [{ id: "me", name: "Ben", who: "me", feel: "normal", missing: ["kaban"] }, { id: "u1", name: "Ali", who: "elder", feel: "cold", missing: [] }], prof: "u1" }) });
    await s.goto(); await sleep(300);
    const r = await s.page.$("#resetBtn"); await r.click(); await r.click(); await sleep(200);
    const n = await s.page.$$eval("#people [data-person]", (e) => e.length), hint = await s.page.$eval("#wardHint", (e) => e.textContent);
    check("reset: back to one person with a full wardrobe", n === 1 && !/yok:/.test(hint), { n, hint });
    await s.close();
  },
});
