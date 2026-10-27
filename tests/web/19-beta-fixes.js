// Findings from the beta test (October 2026), each checked the way a person would meet it on the phone.
const H = require("./lib");
const { check, note, sleep, KEY, fc } = H;

const BES = { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 };   // 19°
const USK = { id: "pusk", name: "Üsküdar", sub: "İstanbul", lat: 41.026, lon: 29.015 };    // 20°
const ROUTE = { id: "r1", from: "pbes", to: "pusk", name: "Vapur", steps: [{ m: "walk", min: 8, slope: "flat" }, { m: "ferry", min: 20, slope: "flat" }] };
const live = (p, t) => ({ placeKey: p.id, place: { name: p.name, sub: p.sub, lat: p.lat, lon: p.lon }, wx: fc(t), fetchedAt: Date.now() });
const seed = (o) => ({ [KEY]: JSON.stringify(Object.assign({ places: [BES, USK], sel: "pbes", mode: "live", live: live(BES, 19) }, o)) });
const pageOk = (s, label) => {
  const cons = s.consoleErr.filter((m) => !/Failed to load resource/.test(m));
  check(label + ": no page or console errors", !s.errors.length && !cons.length, s.errors.concat(cons));
};

H.run({
  // A renamed place is called by its new name at the top right away, and in what the widget gets.
  async renameShowsAtTop(t) {
    const s = await t.open({ seed: seed({}) });
    await s.goto(); await sleep(300);
    await s.page.evaluate(() => document.querySelector("[data-open-routine]").click()); await sleep(200);
    await s.page.evaluate(() => { const i = document.querySelector('input[data-place="pbes"][data-k="name"]'); i.value = "Ev"; i.dispatchEvent(new Event("change", { bubbles: true })); });
    await sleep(200);
    const label = await s.label();
    check("rename: the header says the new name", label === "Ev", label);
    pageOk(s, "rename");
    await s.close();
  },
  // Undo after deleting a place brings its routes back too; focus goes to "Geri al".
  async undoBringsRoutesBack(t) {
    const s = await t.open({ seed: seed({ routes: [ROUTE] }) });
    await s.goto(); await sleep(300);
    await s.page.evaluate(() => document.querySelector('button[aria-label="Üsküdar kaydını sil"]').click()); await sleep(200);
    const focus = await s.page.evaluate(() => document.activeElement && document.activeElement.textContent);
    check("delete: focus is on Geri al", focus === "Geri al", focus);
    check("delete: its route is gone meanwhile", (await s.stored()).routes.length === 0, (await s.stored()).routes);
    await s.page.click("#status button"); await sleep(200);
    const st = await s.stored();
    check("undo: the place and its route are back", st.places.some((p) => p.id === "pusk") && st.routes.length === 1 && st.routes[0].id === "r1", { places: st.places.map((p) => p.id), routes: st.routes });
    pageOk(s, "undo");
    await s.close();
  },
  // Deleting the place whose weather is still on its way: that request is dropped, the shown place stays chosen.
  async removeWhileLoading(t) {
    const s = await t.open({ seed: seed({ sel: "pusk", live: live(USK, 20) }), net: { delay: { forecast: 1500 } } });
    await s.goto(); await sleep(300);
    await s.chip("Beşiktaş"); await sleep(200);
    await s.page.evaluate(() => document.querySelector('button[aria-label="Beşiktaş kaydını sil"]').click()); await sleep(100);
    const msg = await s.status();
    await sleep(2200);
    const a = await s.snap();
    note("after the slow answer:", JSON.stringify(a));
    check("remove while loading: no 'its weather is still shown' when another place is shown", !/hâlâ onun/.test(msg), msg);
    check("remove while loading: the deleted place doesn't come back on screen", a.label === "Üsküdar" && a.temp === "20°", { label: a.label, temp: a.temp });
    check("remove while loading: the shown place's chip is the pressed one", a.chips.includes("[*]Üsküdar"), a.chips);
    pageOk(s, "remove while loading");
    await s.close();
  },
  // "Sonuç bulunamadı" goes away with the query that caused it; a renamed place isn't added twice from search.
  async searchNotes(t) {
    const s = await t.open({ seed: seed({ places: [Object.assign({}, BES, { name: "İş" })], sel: "pbes", live: live(Object.assign({}, BES, { name: "İş" }), 19) }) });
    await s.goto(); await sleep(300);
    await s.openSearch(); await s.type("zzqx"); await sleep(900);
    const before = await s.status();
    await s.page.fill("#q", "zz"); await s.page.dispatchEvent("#q", "input"); await sleep(200);
    const after = await s.status();
    check("search: 'Sonuç bulunamadı' shown, then gone for a 2-letter query", /Sonuç bulunamadı/.test(before) && after === "", { before, after });
    await s.type("Beşiktaş"); await sleep(900);
    await s.page.click("#results button"); await sleep(600);
    const st = await s.stored();
    check("search: the renamed place at the same spot isn't added again", st.places.length === 1 && st.sel === "pbes", st.places.map((p) => p.name));
    pageOk(s, "search");
    await s.close();
  },
  // Saving a person without a name says so, and the note goes once a name is typed.
  async personNeedsName(t) {
    const s = await t.open({ seed: seed({}) });
    await s.goto(); await sleep(300);
    await s.page.evaluate(() => document.querySelector("[data-person-add]").click()); await sleep(200);
    await s.page.fill("#pfName", "");
    await s.page.evaluate(() => document.querySelector("[data-pf-save]").click()); await sleep(100);
    const shown = await s.page.$eval("#pfErr", (e) => !e.hidden && e.textContent);
    await s.page.type("#pfName", "Deniz"); await sleep(100);
    const gone = await s.page.$eval("#pfErr", (e) => e.hidden);
    const invalid = await s.page.$eval("#pfName", (e) => e.getAttribute("aria-invalid"));
    check("person: an empty name gets a visible message", shown === "Bir ad yaz.", shown);
    check("person: the message and aria-invalid go once a name is typed", gone && invalid === null, { gone, invalid });
    pageOk(s, "person");
    await s.close();
  },
});
