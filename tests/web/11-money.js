// Ads, shop links and donations: off until the app's own server and the IDs are set; never ads or donations inside the Android app.
const H = require("./lib");
const { check, sleep, KEY, fc } = H;

const seed = () => ({ [KEY]: JSON.stringify({ places: [{ id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 }], sel: "pbes", mode: "live",
  live: { placeKey: "pbes", place: { name: "Beşiktaş", lat: 41.043, lon: 29.007 }, wx: fc(5), fetchedAt: Date.now() } }) });
const MONEY = { shops: [{ name: "Amazon", url: "https://www.amazon.com.tr/s?k={q}&tag=test-21" }, { name: "Trendyol", url: "https://www.trendyol.com/sr?q={q}" }],
  adsense: { client: "ca-pub-1234567890", slot: "42" }, donate: "https://example.org/destek" };

async function open(t, o) {
  const s = await t.open(Object.assign({ seed: seed() }, o.base || {}));
  const reqs = []; s.page.on("request", (r) => reqs.push(r.url()));
  if (o.config) await s.context.addInitScript((c) => { window.NG_CONFIG = c; }, o.config);
  if (o.android) await s.context.addInitScript(() => { window.NeGiysemAndroid = { saveState() {}, setTheme() {}, reset() {}, hasLocation: () => false }; });
  await s.goto(); await sleep(500);
  s.reqs = reqs; return s;
}
async function tapSticker(s, i = 2) { await s.page.tap(`#wear .stk:nth-child(${i})`); await sleep(200); return s.page.$eval("#tipCard", (e) => ({ hidden: e.hidden, html: e.innerHTML })); }
const visible = (s, sel) => s.page.$eval(sel, (e) => !e.hidden);

H.run({
  async offByDefault(t) {
    const s = await open(t, {});
    const tip = await tapSticker(s);
    check("no server: no shop links", !/class="shop"/.test(tip.html), tip.html.slice(-120));
    check("no server: no ad slot, no consent, no donation", !(await visible(s, "#adSlot")) && !(await visible(s, "#consent")) && !(await visible(s, "#donateRow")));
    check("no ad script requested", !s.reqs.some((u) => /googlesyndication/.test(u)), s.reqs.filter((u) => /google/.test(u)));
    await s.close();
  },

  async idsWithoutServerStayOff(t) {
    const s = await open(t, { config: MONEY });
    const tip = await tapSticker(s);
    check("IDs set but no server (free data sources): everything stays off", !/class="shop"/.test(tip.html) && !(await visible(s, "#consent")) && !(await visible(s, "#donateRow")));
    await s.close();
  },

  async websiteWithServer(t) {
    const s = await open(t, { base: { api: true }, config: MONEY });
    const tip = await tapSticker(s);
    check("shop links in the info card, labelled as ads", /class="shop"/.test(tip.html) && /Reklam/.test(tip.html) && /rel="sponsored noopener"/.test(tip.html), tip.html.slice(-400));
    check("search words and affiliate tag in the link", /amazon\.com\.tr\/s\?k=kaban&amp;tag=test-21/.test(tip.html) || /k=kaban&amp;tag=test-21/.test(tip.html), tip.html.match(/href="[^"]+"/g));
    const pinned = await s.page.$eval("#tipCard", (e) => getComputedStyle(e).pointerEvents);
    check("a tapped card takes taps (links work)", pinned === "auto", pinned);
    check("consent question first, no ad script before it", (await visible(s, "#consent")) && !s.reqs.some((u) => /googlesyndication/.test(u)));
    await s.page.click('#consent [data-ads="npa"]'); await sleep(300);
    const npa = await s.page.evaluate(() => window.adsbygoogle && window.adsbygoogle.requestNonPersonalizedAds);
    check("'Kişiselleştirme': non-personalised ads requested, slot shown", npa === 1 && (await visible(s, "#adSlot")), npa);
    check("ad script requested after the choice", s.reqs.some((u) => /googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1234567890/.test(u)));
    check("donation shown on the website", (await visible(s, "#donateRow")) && (await s.page.$eval("#donateBtn", (e) => e.href)) === MONEY.donate);
    await s.reload(); await sleep(400);
    check("choice remembered: no question again", !(await visible(s, "#consent")) && (await visible(s, "#adSlot")));
    await s.page.click("#adPrefs"); await sleep(150);
    check("'Reklam tercihleri' asks again", await visible(s, "#consent"));
    // a child's links search children's sizes
    await s.page.click("[data-person-add]"); await sleep(150); await s.page.fill("#pfName", "Deniz"); await s.page.click("[data-pf-save]"); await sleep(300);
    const kid = await tapSticker(s);
    check("child profile: children's sizes in the shop search", /k=%C3%A7ocuk%20/.test(kid.html), (kid.html.match(/href="[^"]+"/) || [])[0]);
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  async androidApp(t) {
    const s = await open(t, { base: { api: true }, config: MONEY, android: true });
    const tip = await tapSticker(s);
    check("Android app: shop links still offered", /class="shop"/.test(tip.html));
    check("Android app: no web ads, no consent bar, no donation (Play rules)", !(await visible(s, "#adSlot")) && !(await visible(s, "#consent")) && !(await visible(s, "#donateRow")));
    check("Android app: no ad script", !s.reqs.some((u) => /googlesyndication/.test(u)));
    await s.close();
  },
});
