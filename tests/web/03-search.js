// "+ Yer ekle" place search on a phone: typeahead, Turkish letters, slow/failed services, keyboard, saving, deleting, undo.
const H = require("./lib");
const { check, note, sleep, GPS, KEY } = H;

// start every search test from "has a GPS location in İstanbul" so the search is biased there
async function ready(t, o = {}) {
  const s = await t.open(Object.assign({ geo: { state: "granted", coords: GPS.moda } }, o));
  await s.goto(); await sleep(500);
  await s.openSearch();
  return s;
}
const marks = (s) => s.page.$$eval("#results mark", (m) => m.map((x) => x.textContent));

H.run({
  async typeaheadTurkish(t) {
    const s = await ready(t);
    const cases = [["kadık", "Kadıköy"], ["kadikoy", "Kadıköy"], ["KADIKÖY", "Kadıköy"], ["istanbul", "İstanbul"], ["İSTANBUL", "İstanbul"], ["ISTANBUL", "İstanbul"],
      ["sisli", "Şişli"], ["caglayan", "Çağlayan"], ["agva", "Ağva"], ["igdir", "Iğdır"], ["IĞDIR", "Iğdır"], ["üsküdar", "Üsküdar"], ["uskudar", "Üsküdar"]];
    for (const [q, want] of cases) {
      await s.type(q, 30); await sleep(700);
      const r = await s.results(), m = await marks(s);
      const ok = r.length && r[0].startsWith(want);
      check(`typeahead "${q}" -> first result ${want}`, ok, r.slice(0, 2));
      check(`highlight for "${q}" marks part of the name`, m.length > 0, m.slice(0, 2));
    }
    await s.type("kadıköy", 30); await sleep(700);
    await s.shot("03-results-kadikoy");
    note("kadıköy results:", await s.results());
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  async shortLongEmpty(t) {
    const s = await ready(t);
    await s.type("ka", 30); await sleep(700);
    check("2 letters: no request, no list", s.net.calls.photon.length === 0 && !(await s.results()).length, s.net.calls.photon.length);
    await s.page.press("#q", "Enter"); await sleep(700);
    note("2 letters + Enter:", (await s.results()).slice(0, 3), "| status:", await s.status());
    const long = "kadıköy moda caddesi ".repeat(20).trim();
    await s.page.fill("#q", long); await s.page.dispatchEvent("#q", "input"); await sleep(800);
    const st = await s.status();
    note("long query (" + long.length + " chars): url length", (s.net.calls.photon.slice(-1)[0] || "").length, "| status:", st, "| results:", (await s.results()).length);
    await s.shot("03-long-query");
    await s.type("zzqqxx", 30); await sleep(800);
    const st2 = await s.status();
    check("no results: helpful message", /Sonuç bulunamadı/.test(st2), st2);
    // whitespace-only + Enter
    await s.page.fill("#q", "    "); await s.page.press("#q", "Enter"); await sleep(300);
    check("spaces only + Enter: nothing breaks", !s.errors.length, s.errors);
    // typing in the search wipes the status line that carried the location note/action
    await s.close();
  },

  // Slow service: the older (shorter) query answers after the newer one.
  async staleResponses(t) {
    const s = await ready(t, { net: { delay: { forecast: 0, photon: (u) => (/q=kad&/.test(u) || /q=kad$/.test(u) ? 4000 : 300), omgeo: 0, bdc: 0 } } });
    await s.page.type("#q", "kad", { delay: 40 }); await sleep(550);   // request for "kad" goes out (slow)
    await s.page.type("#q", "ıköy moda", { delay: 40 }); await sleep(1200);
    const r1 = await s.results();
    await sleep(3500); // the slow "kad" answer arrives now
    const r2 = await s.results();
    note("after newer answer:", r1.slice(0, 2), "| after the stale answer arrived:", r2.slice(0, 2));
    check("stale slow answer does not overwrite newer results", JSON.stringify(r1) === JSON.stringify(r2), { r1: r1.slice(0, 2), r2: r2.slice(0, 2) });
    // slow answer arriving after the user closed the search / chose something
    s.net.delay.photon = 3000;
    await s.type("beşiktaş", 20); await sleep(500);
    await s.page.tap("#cancelSearch"); await sleep(3000);
    check("answer after Vazgeç does not reopen a list", !(await s.page.$eval("#results", (e) => !e.hidden)), null);
    await s.close();
  },

  async serviceErrors(t) {
    // Photon 500 -> Open-Meteo fallback
    let s = await ready(t, { net: { fail: { photon: 500 } } });
    await s.type("bakırköy", 30); await sleep(900);
    const r = await s.results();
    note("photon 500, fallback results:", r);
    check("photon 500 -> fallback results shown", r.length > 0 && r[0].startsWith("Bakırköy"), r);
    await s.close();
    // both 429
    s = await ready(t, { net: { fail: { photon: 429, omgeo: 429 } } });
    await s.type("bakırköy", 30); await sleep(900);
    const st = await s.status();
    note("both 429:", st, await s.statusActs());
    await s.shot("03-search-429");
    check("search 429: message talks about place search, not the weather service", !/Hava servisi/.test(st), st);
    await s.close();
    // both network failure
    s = await ready(t, { net: { fail: { photon: "abort", omgeo: "abort" } } });
    await s.type("bakırköy", 30); await sleep(900);
    const st2 = await s.status();
    note("both network fail:", st2);
    check("search network failure: message talks about place search, not weather", !/Hava durumu/.test(st2), st2);
    // retry after service is back
    s.net.fail.photon = null; s.net.fail.omgeo = null;
    await s.page.click("#status button"); await sleep(900);
    check("Tekrar dene works after recovery", (await s.results()).length > 0, await s.results());
    await s.close();
    // Photon 500 and fallback reachable but empty -> error hidden as "no results"
    s = await ready(t, { net: { fail: { photon: 503 } } });
    await s.type("güney kampüsü", 30); await sleep(900);
    const st3 = await s.status();
    note("photon 503 + fallback empty:", st3);
    check("photon down + fallback empty: says service problem, not 'no results'", !/Sonuç bulunamadı/.test(st3), st3);
    await s.close();
    // Photon timeout (> 8 s) -> fallback
    s = await ready(t, { net: { delay: { photon: 9000, forecast: 0, omgeo: 0, bdc: 0 } } });
    await s.type("bakırköy", 30); await sleep(9500);
    check("photon timeout -> fallback results", (await s.results()).length > 0, await s.results());
    await s.close();
  },

  // Few Photon hits -> Open-Meteo results are appended; the same place shows twice.
  async duplicateResults(t) {
    const s = await ready(t);
    await s.type("moda", 30); await sleep(800);
    const r = await s.results();
    note("moda:", r);
    await s.shot("03-duplicate-moda");
    const names = r.map((x) => x.split(/(?=[A-ZÇĞİÖŞÜ][a-zçğıöşü]+, )/)[0]);
    check("same place not listed twice", r.filter((x) => x.startsWith("Moda")).length === 1, r);
    await s.close();
  },

  async keyboard(t) {
    const s = await ready(t);
    await s.type("kadıköy", 30); await sleep(700);
    const r = await s.results();
    await s.page.press("#q", "ArrowDown"); await s.page.press("#q", "ArrowDown");
    const sel = await s.page.$eval("#q", (e) => e.getAttribute("aria-activedescendant"));
    check("ArrowDown x2 -> 3rd option active", sel === "res-2", sel);
    await s.page.press("#q", "ArrowUp");
    check("ArrowUp -> 2nd", (await s.page.$eval("#q", (e) => e.getAttribute("aria-activedescendant"))) === "res-1", null);
    await s.page.press("#q", "Enter"); await sleep(800);
    const st = await s.stored(), a = await s.snap();
    note("Enter chose:", st.places.map((p) => p.name + " / " + p.sub), JSON.stringify(a));
    check("Enter picks the highlighted (2nd) result", st.places.length === 1 && r[1].startsWith(st.places[0].name), { picked: st.places[0], r1: r[1] });
    // Escape
    await s.openSearch(); await s.type("moda", 30); await sleep(700);
    await s.page.press("#q", "Escape"); await sleep(100);
    const hidden = await s.page.$eval("#searchForm", (e) => e.hidden), focus = await s.page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
    note("after Escape: form hidden", hidden, "focus on", focus);
    check("Escape closes search", hidden, hidden);
    // Enter typed before the typeahead fires
    await s.openSearch(); await s.page.type("#q", "beşiktaş", { delay: 20 }); await s.page.press("#q", "Enter"); await sleep(800);
    const r2 = await s.results();
    note("Enter right away -> results:", r2.slice(0, 2), "status:", await s.status());
    check("Enter right away: results appear", r2.length > 0, r2);
    await s.page.press("#q", "Enter"); await sleep(800);
    const st2 = await s.stored();
    check("second Enter picks the first result", st2.places.some((p) => p.name === "Beşiktaş"), st2.places.map((p) => p.name));
    await s.close();
  },

  // Save several places, switch chips, delete, undo. Weather must always match the shown place.
  async savedPlaces(t) {
    const s = await ready(t);
    for (const q of ["beşiktaş", "üsküdar", "kızılay"]) { await s.type(q, 20); await sleep(700); await s.page.tap("#res-0"); await sleep(700); await s.openSearch(); }
    await s.page.tap("#cancelSearch");
    const chips = await s.chips();
    note("chips:", chips);
    check("3 places saved, last selected", chips.some((c) => c === "[*]Kızılay"), chips);
    const want = { "Beşiktaş": "19°", "Üsküdar": "20°", "Kızılay": "5°", "Konumum": "22°" };
    for (const n of ["Beşiktaş", "Konumum", "Üsküdar", "Kızılay"]) {
      await s.chip(n); await sleep(700);
      const a = await s.snap();
      check(`chip ${n}: label + temp match`, (n === "Konumum" ? a.label === "Moda" : a.label === n) && a.temp === want[n], { label: a.label, temp: a.temp });
    }
    await s.openPanel(); await s.shot("03-panel-places");
    // delete the selected place (Kızılay)
    await s.page.tap('button[aria-label="Kızılay kaydını sil"]'); await sleep(400);
    const a = await s.snap();
    note("after deleting the selected place:", JSON.stringify(a));
    await s.shot("03-deleted-selected");
    check("deleting selected place: shown place and pressed chip agree", !(a.label === "Kızılay" && a.chips.some((c) => c.startsWith("[*]Konumum"))), { label: a.label, temp: a.temp, chips: a.chips });
    // undo
    await s.page.click("#status button"); await sleep(400);
    const b = await s.snap();
    note("after Geri al:", JSON.stringify(b));
    check("Geri al restores the chip in the same position", b.chips.join("|").replace(/\[\*\]/g, "").includes("Üsküdar|Kızılay"), b.chips);
    check("Geri al restores the selection of the deleted (selected) place", b.chips.includes("[*]Kızılay"), b.chips);
    await s.reload(); await sleep(400);
    const c = await s.snap();
    note("after reload:", JSON.stringify(c));
    // duplicates: add Beşiktaş again
    await s.openSearch(); await s.type("beşiktaş", 20); await sleep(700); await s.page.tap("#res-0"); await sleep(700);
    const ch2 = await s.chips();
    note("after adding Beşiktaş again:", ch2);
    check("adding an already-saved place does not create a duplicate chip", ch2.filter((x) => x.replace("[*]", "") === "Beşiktaş").length === 1, ch2);
    await s.openPanel(); await s.shot("03-duplicate-chip");
    check("no page errors", !s.errors.length, s.errors);
    await s.close();
  },

  // "Ara" (Enter) while the weather is still loading.
  async searchWhileBusy(t) {
    const s = await t.open({ geo: { state: "granted", coords: GPS.moda }, net: { delay: { forecast: 3000, photon: 0, omgeo: 0, bdc: 0 } } });
    await s.goto(); await sleep(200); // auto refresh running (3 s)
    await s.openSearch(); await s.page.type("#q", "beşiktaş", { delay: 20 }); await s.page.press("#q", "Enter"); await sleep(1000);
    const r = await s.results(), st = await s.status();
    note("Enter while weather loads -> results:", r.length, "status:", st, "photon calls:", s.net.calls.photon.length);
    check("Enter while weather is loading still searches", r.length > 0, { results: r.length, photon: s.net.calls.photon.length });
    await sleep(2500);
    await s.close();
  },

  // "Şu an bulunduğum yeri kaydet"
  async saveHereButton(t) {
    const s = await t.open({ geo: { state: "prompt", coords: GPS.etiler } });
    await s.goto(); await s.openSearch();
    await s.shot("03-search-open");
    await s.page.tap("#saveHere"); await sleep(900);
    const a = await s.snap(), st = await s.stored();
    note("saveHere:", JSON.stringify(a), st.places);
    check("saveHere: one prompt, place saved+selected with its weather", s.geo.asked === 1 && a.chips.includes("[*]Etiler") && a.temp === "10°", { asked: s.geo.asked, a });
    await s.openSearch(); await s.page.tap("#saveHere"); await sleep(900);
    const ch = await s.chips();
    note("saveHere twice at the same spot:", ch);
    check("saveHere twice at the same spot: no duplicate", ch.filter((x) => x.replace("[*]", "") === "Etiler").length === 1, ch);
    await s.close();
  },
});
