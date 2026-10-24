// /api/search, /api/reverse, /api/ip and the MET symbol table.
import test from "node:test";
import assert from "node:assert/strict";
import * as search from "../../web/functions/api/search.js";
import * as reverse from "../../web/functions/api/reverse.js";
import * as ip from "../../web/functions/api/ip.js";
import { wmoFromSymbol, precipProbability } from "../../web/functions/_lib/wmo.js";
import { installCache, installFetch, jsonResponse, call, ORIGIN } from "./helpers.mjs";

const PHOTON_SEARCH = {
  features: [
    { geometry: { coordinates: [29.0263, 40.9903], type: "Point" }, type: "Feature",
      properties: { osm_type: "R", osm_id: 1766105, extent: [28.99, 41.01, 29.11, 40.96], country: "Türkiye", osm_key: "place",
        countrycode: "TR", osm_value: "town", name: "Kadıköy", county: "Kadıköy", state: "İstanbul", type: "city" } },
    { geometry: { coordinates: [29.0254, 40.9819], type: "Point" }, type: "Feature",
      properties: { osm_type: "N", osm_id: 2697, country: "Türkiye", osm_key: "place", countrycode: "TR", osm_value: "suburb",
        name: "Moda", city: "İstanbul", county: "Kadıköy", state: "İstanbul", type: "district" } },
  ],
  type: "FeatureCollection",
};
const PHOTON_TEXT = JSON.stringify(PHOTON_SEARCH);

test("search proxies Photon with the client's parameters and returns the GeoJSON unchanged", async () => {
  installCache();
  const calls = installFetch(() => jsonResponse(PHOTON_TEXT));
  const { res, text } = await call(search, `${ORIGIN}/api/search?q=%20%20kad%C4%B1k%C3%B6y%20%20moda%20&lat=41.01234&lon=28.97567`);
  assert.equal(res.status, 200);
  assert.equal(text, PHOTON_TEXT, "body passed through byte for byte");
  assert.equal(calls[0].url, "https://photon.komoot.io/api/?q=kad%C4%B1k%C3%B6y%20moda&limit=12&lat=41.012&lon=28.976&zoom=10&location_bias_scale=0.1");
  assert.equal(calls[0].headers.get("user-agent"), "NeGiysem/1.0 (+https://ne-giysem.pages.dev)");
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("x-ng-cache"), "miss");

  // Same query in other capitals/spacing and a bias within the same 3-decimal cell: served from the cache.
  const again = await call(search, `${ORIGIN}/api/search?q=Kad%C4%B1k%C3%B6y%20Moda&lat=41.0118&lon=28.9758`);
  assert.equal(again.res.headers.get("x-ng-cache"), "hit");
  assert.equal(again.text, PHOTON_TEXT);
  assert.equal(calls.length, 1);

  const noBias = await call(search, `${ORIGIN}/api/search?q=moda`);
  assert.equal(calls[1].url, "https://photon.komoot.io/api/?q=moda&limit=12");
  assert.equal(noBias.res.status, 200);
});

test("search: q must be 2-100 characters; bad bias -> 400; Photon errors -> 502", async () => {
  installCache();
  const calls = installFetch(() => jsonResponse("rate limited", 429));
  for (const q of ["", "a", "%20a%20", "x".repeat(101)]) {
    const r = await call(search, `${ORIGIN}/api/search?q=${q}`);
    assert.equal(r.res.status, 400, JSON.stringify(q));
    assert.equal(typeof r.body.error, "string");
  }
  assert.equal((await call(search, `${ORIGIN}/api/search?q=${"ş".repeat(100)}`)).res.status, 502, "100 letters is allowed (counted as characters)");
  assert.equal((await call(search, `${ORIGIN}/api/search?q=moda&lat=95&lon=29`)).res.status, 400);
  assert.equal((await call(search, `${ORIGIN}/api/search?q=moda&lat=41`)).res.status, 400, "lat without lon");
  const r = await call(search, `${ORIGIN}/api/search?q=moda`);
  assert.equal(r.res.status, 502);
  assert.equal(r.body.error, "photon_status_429");
  assert.equal(r.body.upstreamStatus, 429);
  assert.equal(calls.length, 2);
});

test("reverse maps Photon to {locality, city, principalSubdivision} and caches per 3-decimal cell", async () => {
  installCache();
  const campus = {
    features: [{ geometry: { coordinates: [28.9893, 41.1764], type: "Point" }, type: "Feature",
      properties: { osm_type: "W", osm_id: 26513117, country: "Türkiye", osm_key: "amenity", countrycode: "TR", osm_value: "university",
        name: "İÜ-Cerrahpaşa Orman Fakültesi", street: "Çayırbaşı Caddesi", postcode: "34473", district: "Bahçeköy Merkez Mahallesi",
        city: "Sarıyer", county: "Sarıyer", state: "İstanbul", type: "house" } }],
    type: "FeatureCollection",
  };
  const calls = installFetch(() => jsonResponse(campus));
  const r = await call(reverse, `${ORIGIN}/api/reverse?lat=41.17642&lon=28.98931`);
  assert.equal(r.res.status, 200);
  assert.deepEqual(r.body, { locality: "Bahçeköy Merkez Mahallesi", city: "Sarıyer", principalSubdivision: "İstanbul" });
  assert.equal(calls[0].url, "https://photon.komoot.io/reverse?lat=41.176&lon=28.989");
  assert.match(calls[0].headers.get("user-agent"), /^NeGiysem\//);
  const again = await call(reverse, `${ORIGIN}/api/reverse?lat=41.1758&lon=28.9894`);
  assert.equal(again.res.headers.get("x-ng-cache"), "hit");
  assert.deepEqual(again.body, r.body);
  assert.equal(calls.length, 1);

  const fields = reverse.reverseFields;
  assert.deepEqual(fields({ features: [{ properties: { name: "Moda", osm_key: "place", osm_value: "suburb", type: "district", city: "İstanbul", county: "Kadıköy", state: "İstanbul" } }] }),
    { locality: "Moda", city: "İstanbul", principalSubdivision: "İstanbul" });
  assert.deepEqual(fields({ features: [{ properties: { name: "Sinop", osm_key: "place", osm_value: "city", type: "city", state: "Sinop" } }] }),
    { locality: null, city: "Sinop", principalSubdivision: "Sinop" });
  assert.deepEqual(fields({ features: [] }), { locality: null, city: null, principalSubdivision: null });
  assert.equal((await call(reverse, `${ORIGIN}/api/reverse?lat=41`)).res.status, 400);
});

test("ip uses request.cf, numbers as numbers, private no-store; 404 JSON when unknown", async () => {
  const calls = installFetch(() => { throw new Error("no upstream expected"); });
  const r = await call(ip, `${ORIGIN}/api/ip`, { cf: { latitude: "41.01380", longitude: "28.94970", city: "Istanbul", region: "Istanbul", regionCode: "34", country: "TR" } });
  assert.equal(r.res.status, 200);
  assert.deepEqual(r.body, { latitude: 41.0138, longitude: 28.9497, city: "Istanbul", locality: "Istanbul", principalSubdivision: "Istanbul", countryCode: "TR" });
  assert.equal(r.res.headers.get("cache-control"), "private, no-store");
  assert.equal(r.res.headers.get("access-control-allow-origin"), "*");
  for (const cf of [undefined, {}, { latitude: "", longitude: "" }, { latitude: "x", longitude: "29" }]) {
    const n = await call(ip, `${ORIGIN}/api/ip`, { cf });
    assert.equal(n.res.status, 404);
    assert.equal(n.body.error, "location_unavailable");
    assert.equal(n.res.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(calls.length, 0);
});

// Every symbol_code in the Locationforecast 2.0 OpenAPI schema (WeatherSymbol enum, 83 values).
const ALL_SYMBOLS = ("clearsky_day clearsky_night clearsky_polartwilight fair_day fair_night fair_polartwilight " +
  "lightssnowshowersandthunder_day lightssnowshowersandthunder_night lightssnowshowersandthunder_polartwilight lightsnowshowers_day " +
  "lightsnowshowers_night lightsnowshowers_polartwilight heavyrainandthunder heavysnowandthunder rainandthunder " +
  "heavysleetshowersandthunder_day heavysleetshowersandthunder_night heavysleetshowersandthunder_polartwilight heavysnow " +
  "heavyrainshowers_day heavyrainshowers_night heavyrainshowers_polartwilight lightsleet heavyrain lightrainshowers_day " +
  "lightrainshowers_night lightrainshowers_polartwilight heavysleetshowers_day heavysleetshowers_night heavysleetshowers_polartwilight " +
  "lightsleetshowers_day lightsleetshowers_night lightsleetshowers_polartwilight snow heavyrainshowersandthunder_day " +
  "heavyrainshowersandthunder_night heavyrainshowersandthunder_polartwilight snowshowers_day snowshowers_night snowshowers_polartwilight " +
  "fog snowshowersandthunder_day snowshowersandthunder_night snowshowersandthunder_polartwilight lightsnowandthunder heavysleetandthunder " +
  "lightrain rainshowersandthunder_day rainshowersandthunder_night rainshowersandthunder_polartwilight rain lightsnow " +
  "lightrainshowersandthunder_day lightrainshowersandthunder_night lightrainshowersandthunder_polartwilight heavysleet sleetandthunder " +
  "lightrainandthunder sleet lightssleetshowersandthunder_day lightssleetshowersandthunder_night lightssleetshowersandthunder_polartwilight " +
  "lightsleetandthunder partlycloudy_day partlycloudy_night partlycloudy_polartwilight sleetshowersandthunder_day " +
  "sleetshowersandthunder_night sleetshowersandthunder_polartwilight rainshowers_day rainshowers_night rainshowers_polartwilight " +
  "snowandthunder sleetshowers_day sleetshowers_night sleetshowers_polartwilight cloudy heavysnowshowersandthunder_day " +
  "heavysnowshowersandthunder_night heavysnowshowersandthunder_polartwilight heavysnowshowers_day heavysnowshowers_night " +
  "heavysnowshowers_polartwilight").split(" ");

test("every MET symbol maps to a WMO code the client knows", () => {
  assert.equal(ALL_SYMBOLS.length, 83);
  const known = new Set([0, 1, 2, 3, 45, 61, 63, 65, 66, 67, 71, 73, 75, 80, 81, 82, 85, 86, 95, 96]);
  for (const s of ALL_SYMBOLS) {
    for (const t of [10, 0]) assert.ok(known.has(wmoFromSymbol(s, t)), `${s} at ${t} °C -> ${wmoFromSymbol(s, t)}`);
  }
  const table = {
    clearsky_day: 0, fair_night: 1, partlycloudy_polartwilight: 2, cloudy: 3, fog: 45,
    lightrain: 61, rain: 63, heavyrain: 65, lightrainshowers_day: 80, rainshowers_night: 81, heavyrainshowers_day: 82,
    lightsnow: 71, snow: 73, heavysnow: 75, lightsnowshowers_day: 85, snowshowers_day: 85, heavysnowshowers_night: 86,
    lightsleet: 61, sleet: 63, heavysleet: 65, sleetshowers_day: 81,
    rainandthunder: 95, heavyrainshowersandthunder_day: 95, lightssnowshowersandthunder_day: 96, sleetandthunder: 96, snowandthunder: 96,
  };
  for (const [s, code] of Object.entries(table)) assert.equal(wmoFromSymbol(s, 5), code, s);
  assert.equal(wmoFromSymbol("sleet", 0.5), 66);
  assert.equal(wmoFromSymbol("lightsleetshowers_day", -2), 66);
  assert.equal(wmoFromSymbol("heavysleet", 0.4), 67);
  assert.equal(wmoFromSymbol("sleet", 0.6), 63);
  assert.equal(wmoFromSymbol("nonsense"), null);
  assert.equal(wmoFromSymbol(undefined), null);
});

test("derived precipitation probability rule", () => {
  assert.equal(precipProbability(37.4, 0, "cloudy"), 37, "MET's value wins");
  assert.equal(precipProbability(null, 0.5, "rain"), 80);
  assert.equal(precipProbability(null, 0.1, "cloudy"), 60);
  assert.equal(precipProbability(null, 0, "lightsnowshowers_day"), 40);
  assert.equal(precipProbability(null, null, "rainandthunder"), 40);
  assert.equal(precipProbability(null, 0, "partlycloudy_day"), 0);
});
