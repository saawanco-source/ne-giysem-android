// /api/route: Google Routes (transit) behind the app's own server, simplified; off without a key; never cached.
import test from "node:test";
import assert from "node:assert/strict";
import * as routeApi from "../../web/functions/api/route.js";
import { installCache, installFetch, jsonResponse, call, ORIGIN, atTime } from "./helpers.mjs";

const KEY = { GOOGLE_ROUTES_KEY: "test-key-not-real" };
const APP = { origin: ORIGIN };
const NOW = Date.parse("2026-10-27T05:00:00Z"); // 08:00 in İstanbul
const Q = "from=41.0430,29.0070&to=41.0800,29.0100&depart=2026-10-27T05:30:00.000Z";

// A trimmed computeRoutes answer: walk, bus 559C, walk to the metro, M2, walk; and a ferry alternative.
const t = (h, m) => `2026-10-27T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
const walk = (s, d) => ({ travelMode: "WALK", staticDuration: `${s}s`, distanceMeters: d });
const ride = (type, vname, line, agency, from, dep, to, arr, stops) => ({
  travelMode: "TRANSIT", staticDuration: `${(Date.parse(arr) - Date.parse(dep)) / 1000}s`, distanceMeters: 4000,
  transitDetails: {
    stopDetails: { departureStop: { name: from }, arrivalStop: { name: to }, departureTime: dep, arrivalTime: arr },
    headsign: "Hacıosman", stopCount: stops,
    transitLine: { name: line.name, nameShort: line.short, color: "#1e88e5", textColor: "#ffffff",
      agencies: [{ name: agency, uri: "https://example.org/" + agency.length }], vehicle: { type, name: { text: vname } } },
  },
});
const GOOGLE = {
  routes: [
    { duration: "2280s", distanceMeters: 9000, localizedValues: { transitFare: { text: "₺34,00" } },
      legs: [{ steps: [
        walk(120, 150), walk(60, 80),
        ride("BUS", "Otobüs", { name: "Beşiktaş - Levent", short: "559C" }, "İETT", "Beşiktaş", t(5, 36), "Zincirlikuyu", t(5, 50), 6),
        walk(180, 200),
        ride("SUBWAY", "Metro", { name: "M2 Yenikapı - Hacıosman", short: "M2" }, "Metro İstanbul", "Gayrettepe", t(5, 57), "Levent", t(6, 1), 2),
        walk(240, 300),
      ] }] },
    { duration: "2700s", distanceMeters: 11000,
      legs: [{ steps: [
        walk(300, 400),
        ride("BUS", "Metrobüs", { name: "Metrobüs", short: "34" }, "İETT", "Zincirlikuyu", t(5, 40), "Mecidiyeköy", t(5, 44), 1),
        ride("FERRY", "Vapur", { name: "Beşiktaş - Üsküdar", short: "" }, "Şehir Hatları", "Beşiktaş", t(5, 50), "Üsküdar", t(6, 5), 0),
      ] }] },
  ],
};

test("probe says whether the feature is on, without asking Google", async () => {
  installCache();
  const calls = installFetch(() => { throw new Error("no upstream call expected"); });
  assert.deepEqual((await call(routeApi, `${ORIGIN}/api/route?probe=1`)).body, { on: false });
  assert.deepEqual((await call(routeApi, `${ORIGIN}/api/route?probe=1`, { env: KEY })).body, { on: true });
  const off = await call(routeApi, `${ORIGIN}/api/route?${Q}`, { headers: APP });
  assert.equal(off.res.status, 503);
  assert.equal(off.body.error, "routes_off");
  assert.equal(calls.length, 0);
});

test("asks Google for transit with alternatives and simplifies the answer", async () => {
  installCache();
  const calls = installFetch(() => jsonResponse(GOOGLE));
  const { res, body } = await atTime(NOW, () => call(routeApi, `${ORIGIN}/api/route?${Q}&lang=en`, { env: KEY, headers: APP }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store", "Google's routes are never cached");
  const c = calls[0];
  assert.equal(c.url, "https://routes.googleapis.com/directions/v2:computeRoutes");
  assert.equal(c.method, "POST");
  assert.equal(c.headers.get("x-goog-api-key"), KEY.GOOGLE_ROUTES_KEY);
  assert.equal(c.headers.get("x-goog-fieldmask"), routeApi.FIELD_MASK);
  const sent = JSON.parse(c.body);
  assert.equal(sent.travelMode, "TRANSIT");
  assert.equal(sent.computeAlternativeRoutes, true);
  assert.equal(sent.languageCode, "en");
  assert.equal(sent.departureTime, "2026-10-27T05:30:00.000Z");
  assert.deepEqual(sent.origin.location.latLng, { latitude: 41.043, longitude: 29.007 });
  assert.equal(sent.transitPreferences, undefined, "no mode filter: ferries stay in");

  assert.equal(body.source, "Google Maps");
  assert.deepEqual(body.agencies.map((a) => a.name), ["İETT", "Metro İstanbul", "Şehir Hatları"]);
  const [a, b] = body.routes;
  assert.equal(a.min, 38);
  assert.equal(a.fare, "₺34,00");
  assert.equal(a.firstDep, t(5, 36));
  assert.equal(a.lastArr, t(6, 1));
  assert.deepEqual(a.steps.map((s) => s.m + ":" + s.min), ["walk:3", "bus:14", "walk:3", "wait:4", "metro:4", "walk:4"],
    "walks in a row merged; the transfer's gap minus the walk is a wait");
  assert.equal(a.steps[1].line, "559C");
  assert.equal(a.steps[1].from, "Beşiktaş");
  assert.equal(a.steps[1].stops, 6);
  assert.equal(a.steps[1].agency, "İETT");
  assert.deepEqual(b.steps.map((s) => s.m + ":" + s.min), ["walk:5", "metrobus:4", "wait:6", "ferry:15"], "Metrobüs and the ferry recognised");
});

test("only the app's own pages may ask, within limits", async () => {
  installCache();
  installFetch(() => jsonResponse(GOOGLE));
  const other = await call(routeApi, `${ORIGIN}/api/route?${Q}`, { env: KEY, headers: { origin: "https://evil.example" } });
  assert.equal(other.res.status, 403);
  const none = await call(routeApi, `${ORIGIN}/api/route?${Q}`, { env: KEY });
  assert.equal(none.res.status, 403, "no Origin, no Referer (a script, not the app)");
  for (const h of [{ origin: "https://appassets.androidplatform.net" }, { "sec-fetch-site": "same-origin" },
    { referer: "https://abc123.ne-giysem.pages.dev/" }, { origin: "http://localhost:8787" }]) {
    const r = await atTime(NOW, () => call(routeApi, `${ORIGIN}/api/route?${Q}`, { env: KEY, headers: h }));
    assert.equal(r.res.status, 200, JSON.stringify(h));
  }
  const bad = async (q) => (await atTime(NOW, () => call(routeApi, `${ORIGIN}/api/route?${q}`, { env: KEY, headers: APP }))).body.error;
  assert.equal(await bad("from=41.04,29.00&to=39.92,32.85&depart=2026-10-27T05:30:00Z"), "too_far");
  assert.equal(await bad("from=41.04,29.00&to=41.04,29.00&depart=2026-10-27T05:30:00Z"), "same_place");
  assert.equal(await bad("from=41.04&to=41.08,29.01&depart=2026-10-27T05:30:00Z"), "from must be LAT,LON");
  assert.equal(await bad("from=41.04,29.00&to=41.08,29.01&depart=yarın"), "invalid depart");

  installCache();
  const calls = installFetch(() => jsonResponse(GOOGLE));
  const ip = { ...APP, "cf-connecting-ip": "203.0.113.9" };
  let last;
  for (let i = 0; i <= routeApi.RATE_PER_HOUR; i++) last = await atTime(NOW, () => call(routeApi, `${ORIGIN}/api/route?${Q}`, { env: KEY, headers: ip }));
  assert.equal(last.res.status, 429);
  assert.equal(last.body.error, "rate_limited");
  assert.equal(calls.length, routeApi.RATE_PER_HOUR, "the one over the limit never reaches Google");
});

test("Google's errors: quota and failures are told apart, details stay on the server", async () => {
  installCache();
  installFetch(() => jsonResponse({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }, 429));
  const q = await atTime(NOW, () => call(routeApi, `${ORIGIN}/api/route?${Q}`, { env: KEY, headers: APP }));
  assert.equal(q.res.status, 429);
  assert.equal(q.body.error, "quota");
  installFetch(() => jsonResponse({ error: { code: 403, status: "PERMISSION_DENIED", message: "API key not valid" } }, 403));
  const f = await atTime(NOW, () => call(routeApi, `${ORIGIN}/api/route?${Q}`, { env: KEY, headers: APP }));
  assert.equal(f.res.status, 502);
  assert.equal(f.body.error, "routes_failed");
  assert.ok(!JSON.stringify(f.body).includes("not valid"), "Google's message isn't passed on");
});

test("a departure in the past asks from now on", async () => {
  installCache();
  const calls = installFetch(() => jsonResponse({ routes: [] }));
  const { body } = await atTime(NOW, () => call(routeApi, `${ORIGIN}/api/route?from=41.0430,29.0070&to=41.0800,29.0100&depart=2026-10-27T04:00:00Z`, { env: KEY, headers: APP }));
  assert.deepEqual(body.routes, []);
  assert.equal(JSON.parse(calls[0].body).departureTime, new Date(NOW + 60e3).toISOString());
});

test("visitors: IPv6 counted per /64 (one line), the site's own domain and ALLOWED_ORIGINS may ask", async () => {
  const { visitor, allowedOrigin } = routeApi;
  assert.equal(visitor("1.2.3.4"), "1.2.3.4");
  assert.equal(visitor("2a02:1234:abcd:1::5"), visitor("2a02:1234:abcd:1:ffff:1:2:3"));
  assert.equal(visitor("2a02:1234::1"), "2a02:1234:0:0::/64");
  assert.ok(allowedOrigin("https://negiysem.com", "https://negiysem.com", ""));
  assert.ok(allowedOrigin("https://www.negiysem.com", "https://ne-giysem.pages.dev", "https://negiysem.com, https://www.negiysem.com"));
  assert.ok(!allowedOrigin("https://evil.example", "https://negiysem.com", "https://negiysem.com"));
});
