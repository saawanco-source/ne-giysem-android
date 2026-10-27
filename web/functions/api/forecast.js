// GET /api/forecast?latitude=A[,B…]&longitude=C[,D…]
// Open-Meteo-shaped forecast built from MET Norway Locationforecast 2.0 (CC BY 4.0). One coordinate -> one object,
// several -> an array in the same order (max 8). Other query parameters (current=, hourly=, daily=, timezone=, …)
// are accepted and ignored, so the client can keep its Open-Meteo query string.
//
// A place MET can't answer for in a list of several comes back as {"error": "..."} in its slot (the others still
// come); only when every place fails is the whole answer an error. A forecast built from MET's last copy while MET
// is down says so ("stale": true, "met_updated_at") and is not cached anywhere.
import { route, jsonText, badRequest, coord, round } from "../_lib/http.js";
import { getMetSeries, metId } from "../_lib/met.js";
import { buildForecast } from "../_lib/openmeteo.js";
import { cacheKey, readEntry, writeEntry } from "../_lib/cache.js";

export const MAX_POINTS = 8;
// A built forecast is kept for 10 minutes per cell: building it is most of the CPU an answer costs (the free plan
// allows 10 ms a request), while MET's own data changes about hourly.
const BUILT_VERSION = "built-v1";
export const BUILT_MS = 10 * 60000;

function list(value, name, max) {
  if (value == null || !String(value).trim()) throw badRequest(`missing ${name}`);
  return String(value).split(",").map((v) => coord(v, name, max));
}

/** {text, cache, stale} for one ~1 km cell at time `now`. Throws when MET fails and nothing is cached. */
async function cell(context, la, lo, now) {
  const bucket = Math.floor(now / BUILT_MS);
  const key = cacheKey(context.request, BUILT_VERSION, `${metId(la, lo)}|${bucket}`);
  const built = await readEntry(key);
  if (built && built.expires > now && built.text) return { text: built.text, cache: "hit", stale: false };
  const r = await getMetSeries(context, la, lo);
  const body = buildForecast(r.series, la, lo, now);
  if (r.cache === "stale") {
    body.stale = true;
    body.met_updated_at = r.series.updatedAt || null;
    return { text: JSON.stringify(body), cache: "stale", stale: true };
  }
  const text = JSON.stringify(body);
  writeEntry(context, key, text, { expires: (bucket + 1) * BUILT_MS, keepSeconds: BUILT_MS / 1000 });
  return { text, cache: r.cache, stale: false };
}

export const onRequest = route(async (context, url) => {
  const lats = list(url.searchParams.get("latitude"), "latitude", 90);
  const lons = list(url.searchParams.get("longitude"), "longitude", 180);
  if (lats.length !== lons.length) throw badRequest("latitude and longitude need the same number of values");
  if (lats.length > MAX_POINTS) throw badRequest(`at most ${MAX_POINTS} coordinates per request`);

  // ~1 km cells: MET allows at most 4 decimals, 2 keep the cache small and shared between nearby users.
  const pts = lats.map((la, i) => [round(la, 2), round(lons[i], 2)]);
  const now = Date.now();
  const loads = new Map(); // the same cell twice in one request is built once
  for (const [la, lo] of pts) {
    const id = metId(la, lo);
    if (!loads.has(id)) loads.set(id, cell(context, la, lo, now).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })));
  }
  const results = await Promise.all(pts.map(([la, lo]) => loads.get(metId(la, lo))));
  if (results.every((r) => !r.ok)) throw results[0].e;
  if (pts.length === 1) {
    const r = results[0].v;
    return jsonText(r.text, 200, r.stale ? "no-store" : "public, max-age=600", { "x-ng-cache": r.cache });
  }
  const parts = results.map((r) => (r.ok ? r.v.text : JSON.stringify({ error: (r.e && r.e.message) || "unavailable" })));
  const anyStale = results.some((r) => r.ok && r.v.stale), anyFailed = results.some((r) => !r.ok);
  return jsonText("[" + parts.join(",") + "]", 200, anyStale || anyFailed ? "no-store" : "public, max-age=600", {
    "x-ng-cache": results.map((r) => (r.ok ? r.v.cache : "error")).join(","),
  });
});
