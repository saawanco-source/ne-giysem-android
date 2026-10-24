// Refresh spam and switching places while a request is still running: does the shown place match the weather and the pressed chip?
const H = require("./lib");
const { check, note, sleep, GPS, KEY } = H;

const seedPlaces = (extra = {}) => ({ [KEY]: JSON.stringify(Object.assign({
  places: [
    { id: "pbes", name: "Beşiktaş", sub: "İstanbul", lat: 41.043, lon: 29.007 },   // 19°
    { id: "pusk", name: "Üsküdar", sub: "İstanbul", lat: 41.026, lon: 29.015 },    // 20°
    { id: "pkiz", name: "Kızılay", sub: "Çankaya, Ankara", lat: 39.92, lon: 32.854 }, // 5°
  ], sel: "auto", mode: "manual" }, extra)) });
const TEMP = { "Beşiktaş": "19°", "Üsküdar": "20°", "Kızılay": "5°", "Moda": "22°" };
function consistent(a) {
  const pressed = (a.chips.find((c) => c.startsWith("[*]")) || "").slice(3);
  const pressedName = pressed.startsWith("Konumum") ? "Moda" : pressed;
  return { ok: pressedName === a.label && TEMP[a.label] === a.temp, pressed: pressedName, label: a.label, temp: a.temp };
}

H.run({
  async refreshSpam(t) {
    const s = await t.open({ geo: { state: "prompt", coords: GPS.moda }, net: { delay: { forecast: 1200, photon: 0, omgeo: 0, bdc: 0 } } });
    await s.goto();
    for (let i = 0; i < 12; i++) { await s.page.tap("#refresh"); await sleep(40); }
    await sleep(2000);
    for (let i = 0; i < 12; i++) { await s.page.tap("#refresh"); await sleep(40); }
    await sleep(2000);
    const a = await s.snap();
    note("after 2x12 taps:", JSON.stringify(a), "| prompts:", s.geo.asked, "| forecast calls:", s.net.calls.forecast.length, "| gps calls:", s.geo.gets);
    check("refresh spam: one prompt", s.geo.asked === 1, s.geo.asked);
    check("refresh spam: requests not multiplied (<=2 forecast calls)", s.net.calls.forecast.length <= 2, s.net.calls.forecast.length);
    check("refresh spam: consistent", consistent(a).ok, consistent(a));
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  // Tap Beşiktaş, then Üsküdar 300 ms later while Beşiktaş weather is still loading.
  async fastChipSwitch(t) {
    const s = await t.open({ seed: seedPlaces(), geo: { state: "granted", coords: GPS.moda }, net: { delay: { forecast: 1500, photon: 0, omgeo: 0, bdc: 0 } } });
    await s.goto(); await sleep(2000); // auto (Moda) done
    await s.chip("Beşiktaş"); await sleep(300);
    await s.chip("Üsküdar"); await sleep(2500);
    const a = await s.snap(), st = await s.stored();
    note("after Beşiktaş→Üsküdar:", JSON.stringify(a), "| stored sel:", st.sel, "live.placeKey:", st.live.placeKey, "live.place:", st.live.place.name);
    await s.openPanel(); await s.shot("05-fast-chip-switch");
    check("fast chip switch: pressed chip = shown place = weather", consistent(a).ok, consistent(a));
    check("fast chip switch: stored live.placeKey matches live.place", (st.live.placeKey === "pusk") === (st.live.place.name === "Üsküdar"), { placeKey: st.live.placeKey, place: st.live.place.name });
    await s.reload(); await sleep(600);
    const b = await s.snap();
    note("after reload:", JSON.stringify(b));
    check("fast chip switch: still consistent after reload", consistent(b).ok, consistent(b));
    await s.close();
  },

  // GPS is slow (4 s); meanwhile the person taps a saved place.
  async savedPlaceDuringGps(t) {
    const s = await t.open({ seed: seedPlaces(), geo: { state: "granted", coords: GPS.moda, delay: 3000 } });
    await s.goto(); await sleep(300); // auto refresh -> GPS 3 s
    await s.chip("Kızılay"); await sleep(200);
    const a0 = await s.snap();
    await sleep(3500);
    const a = await s.snap(), st = await s.stored();
    note("tapped Kızılay during GPS:", JSON.stringify(a0), "→", JSON.stringify(a), "| live.placeKey:", st.live.placeKey, "| live.place:", st.live.place.name);
    await s.openPanel(); await s.shot("05-saved-place-during-gps");
    check("saved place during GPS: pressed chip = shown place = weather", consistent(a).ok, consistent(a));
    check("saved place during GPS: Kızılay weather loaded eventually", a.label === "Kızılay" && a.temp === "5°", a);
    await s.close();
  },

  // Adding a place from search while the first GPS/weather request runs.
  async addPlaceDuringFetch(t) {
    const s = await t.open({ geo: { state: "granted", coords: GPS.moda }, net: { delay: { forecast: 2500, photon: 0, omgeo: 0, bdc: 0 } } });
    await s.goto(); await sleep(200);
    await s.openSearch(); await s.type("kızılay", 20); await sleep(600); await s.page.tap("#res-0");
    await sleep(3500);
    const a = await s.snap();
    note("added Kızılay during fetch:", JSON.stringify(a));
    check("added place during fetch: its weather is shown", a.label === "Kızılay" && a.temp === "5°", a);
    check("added place during fetch: consistent", consistent(a).ok, consistent(a));
    await s.close();
  },
});
