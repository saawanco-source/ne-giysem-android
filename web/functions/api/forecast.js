// GET /api/forecast?latitude=A[,B…]&longitude=C[,D…]
// Open-Meteo-shaped forecast built from MET Norway Locationforecast 2.0 (CC BY 4.0). One coordinate -> one object,
// several -> an array in the same order (max 8). Other query parameters (current=, hourly=, daily=, timezone=, …)
// are accepted and ignored, so the client can keep its Open-Meteo query string.
import { route, json, badRequest, coord, round } from "../_lib/http.js";
import { getMetSeries, metId } from "../_lib/met.js";
import { buildForecast } from "../_lib/openmeteo.js";

export const MAX_POINTS = 8;

function list(value, name, max) {
  if (value == null || !String(value).trim()) throw badRequest(`missing ${name}`);
  return String(value).split(",").map((v) => coord(v, name, max));
}

export const onRequest = route(async (context, url) => {
  const lats = list(url.searchParams.get("latitude"), "latitude", 90);
  const lons = list(url.searchParams.get("longitude"), "longitude", 180);
  if (lats.length !== lons.length) throw badRequest("latitude and longitude need the same number of values");
  if (lats.length > MAX_POINTS) throw badRequest(`at most ${MAX_POINTS} coordinates per request`);

  // ~1 km cells: MET allows at most 4 decimals, 2 keep the cache small and shared between nearby users.
  const pts = lats.map((la, i) => [round(la, 2), round(lons[i], 2)]);
  const loads = new Map(); // the same cell twice in one request is fetched once
  for (const [la, lo] of pts) {
    const id = metId(la, lo);
    if (!loads.has(id)) loads.set(id, getMetSeries(context, la, lo));
  }
  const results = await Promise.all(pts.map(([la, lo]) => loads.get(metId(la, lo))));
  const now = Date.now();
  const bodies = results.map((r, i) => buildForecast(r.series, pts[i][0], pts[i][1], now));
  return json(bodies.length === 1 ? bodies[0] : bodies, 200, "public, max-age=600", {
    "x-ng-cache": results.map((r) => r.cache).join(","),
  });
});
