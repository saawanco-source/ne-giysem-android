// Feeds /api/forecast output into the web app's real engine (plan, liveInput, dayPlan from web/index.html),
// with S set the way tests/parity/run-js.js sets it. Runs on the real clock: fixtures start at the current hour.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as forecast from "../../web/functions/api/forecast.js";
import { installCache, installFetch, jsonResponse, call, ORIGIN } from "./helpers.mjs";
import { istanbul, berlin, metComplete, floorHour, H, dn } from "./fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require("../parity/js-engine.js").load(path.join(here, "..", "..", "web", "index.html"));

const now = Date.now();
const first = floorHour(now);
const span = { first, hourlyUntil: first + 59 * H, last: first + 9 * 24 * H + 21 * H };

/** A wet İstanbul: moderate rain in every block. */
function rainyIstanbul() {
  return metComplete({
    lat: 41.01, lon: 28.98, alt: 39, ...span,
    temp: () => 12, rh: () => 93, wind: () => 7, dir: () => 200, cloud: () => 100, uv: () => 0.5, gust: true,
    sym: (t, hours) => (hours === 12 ? "rain" : dn("rainshowers", t, 28.98)), precip: (t, hours) => 1.4 * hours,
    pop: { h1: false, h6: false, h12: false },
  });
}

async function forecastFor(fixtures, latList, lonList) {
  installCache();
  let i = 0;
  installFetch(() => jsonResponse(fixtures[i++ % fixtures.length](), 200, { expires: new Date(Date.now() + 1800000).toUTCString() }));
  const { res, body } = await call(forecast, `${ORIGIN}/api/forecast?latitude=${latList}&longitude=${lonList}`);
  assert.equal(res.status, 200);
  return body;
}

function liveState(wx, extra = {}) {
  return {
    places: [], sel: "auto", hours: 6, feel: "normal", act: "city", manual: { temp: 17, sky: "partly", wind: "breezy" }, mode: "live",
    live: { placeKey: "auto", place: { name: "X", lat: wx.latitude, lon: wx.longitude }, wx, fetchedAt: Date.now() },
    routes: [], trips: [], dayMode: true, dayWx: null, choice: { date: "", picks: {} }, fix: null, ...extra,
  };
}

function runPlan(S) {
  E.setS(S);
  const inp = E.liveInput();
  assert.ok(inp, "liveInput() gives an input");
  const p = E.plan(inp, S);
  assert.ok(Array.isArray(p.wear) && p.wear.length > 0, "non-empty outfit");
  assert.equal(typeof p.head, "string");
  assert.ok(Number.isFinite(p.E));
  return { inp, p };
}

test("engine reads the İstanbul and Berlin answers for every feel / activity / window", async () => {
  for (const [name, fx] of [["İstanbul", istanbul], ["Berlin", berlin]]) {
    const wx = await forecastFor([() => fx(span)], name === "Berlin" ? 52.52 : 41.01, name === "Berlin" ? 13.41 : 28.98);
    for (const hours of [3, 6, 12]) for (const feel of ["cold", "normal", "warm"]) for (const act of ["city", "field", "sport"]) {
      const { inp } = runPlan(liveState(wx, { hours, feel, act }));
      assert.equal(inp.kind, "live");
      assert.equal(inp.window.length, hours + 1, `${name}: window of ${hours} h`);
      assert.equal(inp.now.t, wx.current.temperature_2m, "fresh answer: current block used");
      assert.equal(inp.now.gust, wx.current.wind_gusts_10m);
      assert.ok(inp.window.every((w) => Number.isFinite(w.app) && Number.isFinite(w.p)), "every hour has feels-like and probability");
    }
    // An hour-old answer makes the engine fall back to the hourly arrays.
    const S = liveState(wx); S.live.fetchedAt = Date.now() - 60 * 60000;
    const { inp } = runPlan(S);
    assert.ok(Number.isFinite(inp.now.app));
  }
});

test("rainy and cold answers lead to rain and winter clothes", async () => {
  const wet = await forecastFor([rainyIstanbul], 41.01, 28.98);
  const r = runPlan(liveState(wet));
  assert.equal(r.p.wet, true, "rain is noticed");
  const ids = r.p.wear.concat(r.p.take).map((w) => w.g);
  assert.ok(ids.includes("semsiye") || ids.includes("yagmurluk"), "umbrella or raincoat: " + ids.join(","));

  const cold = await forecastFor([() => berlin(span)], 52.52, 13.41);
  const c = runPlan(liveState(cold));
  const wear = c.p.wear.map((w) => w.g);
  assert.ok(["mont", "kaban", "sisme", "parka"].some((g) => wear.includes(g)), "a coat at a few degrees: " + wear.join(","));
});

test("the array answer drives the day plan (trip places looked up by hour)", async () => {
  // Like the app: the first point is the live place, the rest are trip places (Avcılar home, Bahçeköy campus).
  const all = await forecastFor([() => istanbul(span)], "41.01,40.98,41.18", "28.98,28.72,28.99");
  assert.ok(Array.isArray(all) && all.length === 3);
  const places = [{ id: "home", name: "Ev", lat: 40.98, lon: 28.72 }, { id: "uni", name: "Kampüs", lat: 41.18, lon: 28.99 }];
  const routes = [{ id: "r1", from: "home", to: "uni", name: "Metrobüs", steps: [{ m: "walk", min: 10, slope: "flat" }, { m: "wait", min: 5 }, { m: "metrobus", min: 45 }, { m: "walk", min: 12, slope: "up" }] },
    { id: "r2", from: "uni", to: "home", name: "Dönüş", steps: [{ m: "walk", min: 12, slope: "flat" }, { m: "metrobus", min: 45 }, { m: "walk", min: 10, slope: "flat" }] }];
  const trips = [{ id: "t1", from: "home", to: "uni", time: "08:00", days: [0, 1, 2, 3, 4, 5, 6] }, { id: "t2", from: "uni", to: "home", time: "17:30", days: [0, 1, 2, 3, 4, 5, 6] }];
  const S = liveState(all[0], { places, routes, trips, dayWx: { fetchedAt: Date.now(), byPlace: { home: all[1], uni: all[2] } } });
  E.setS(S);
  const day = E.dayPlan();
  assert.ok(day && day.items.length > 0, "a trip is planned");
  assert.ok(day.exps && day.exps.length > 0, "outdoor minutes found weather in the hourly arrays");
  assert.ok(day.exps.every((e) => Number.isFinite(e.app) && typeof e.time === "string"));
  const p = E.plan(day.inp, S);
  assert.ok(p.wear.length > 0);
  // The live input still works with the same state.
  assert.ok(E.liveInput());
});
