// web/forecast-lib.js (the app's way to the weather when its server is out of reach) builds exactly the forecast the
// server builds from the same MET answer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import vm from "vm";
import { istanbul, berlin } from "./fixtures.mjs";
import { normalizeMet } from "../../web/functions/_lib/met.js";
import { buildForecast } from "../../web/functions/_lib/openmeteo.js";

const lib = () => {
  const ctx = { Date, Math, JSON, Intl };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../../web/forecast-lib.js", import.meta.url), "utf8"), ctx);
  return ctx.NGForecast;
};
const strip = (o) => JSON.parse(JSON.stringify(Object.assign({}, o, { generationtime_ms: 0 })));

test("forecast-lib.js gives the server's forecast for the same MET answer", () => {
  const L = lib();
  for (const [name, met, lat, lon] of [["İstanbul", istanbul(), 41.0123, 28.9789], ["Berlin", berlin(), 52.5161, 13.4049]]) {
    const now = Date.parse(met.properties.timeseries[3].time) + 17 * 60000;
    const a = L.fromMet(met, lat, lon, now);
    const b = buildForecast(normalizeMet(met), Math.round(lat * 100) / 100, Math.round(lon * 100) / 100, now);
    assert.deepEqual(strip(a), strip(b), name);
  }
  assert.equal(L.metUrl(41.0123, 28.9789), "https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=41.01&lon=28.98");
});

test("forecast-lib.js runs without modern syntax (older WebViews) and defines only NGForecast", () => {
  const src = readFileSync(new URL("../../web/forecast-lib.js", import.meta.url), "utf8");
  assert.ok(!/\?\?|\?\.[a-zA-Z_$(\[]/.test(src.replace(/"(?:[^"\\]|\\.)*"/g, "")), "no ?? or ?. (ES2020) left");
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.deepEqual(Object.keys(ctx), ["NGForecast"]);
});
