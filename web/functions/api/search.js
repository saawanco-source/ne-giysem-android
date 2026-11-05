// GET /api/search?q=…[&lat=…&lon=…]
// Place search through Photon (komoot, OpenStreetMap data © OpenStreetMap contributors, ODbL). The GeoJSON answer is
// passed on unchanged and cached for a day per normalized query and bias point.
import { route, jsonText, badRequest, coord, round, given, userAgent, cacheInfo, tooMany } from "../_lib/http.js";
import { limit } from "../_lib/rate.js";
import { cacheKey, cachedJson } from "../_lib/cache.js";

const PHOTON = "https://photon.komoot.io";
const TTL_S = 86400;

export const onRequest = route(async (context, url) => {
  if (!(await limit(context, "search", 300))) throw tooMany();
  const q = String(url.searchParams.get("q") || "").normalize("NFC").replace(/\s+/g, " ").trim();
  const len = [...q].length;
  if (len < 2 || len > 100) throw badRequest("q must be 2-100 characters");

  const la = url.searchParams.get("lat"), lo = url.searchParams.get("lon");
  let bias = null;
  if (given(la) || given(lo)) bias = [round(coord(la, "lat", 90), 3).toFixed(3), round(coord(lo, "lon", 180), 3).toFixed(3)];

  const upstream = `${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=12` +
    (bias ? `&lat=${bias[0]}&lon=${bias[1]}&zoom=10&location_bias_scale=0.1` : "");
  // Photon matches case-insensitively, so differently capitalised queries share one entry.
  const id = q.toLowerCase() + (bias ? `@${bias[0]},${bias[1]}` : "");
  const r = await cachedJson(context, {
    key: cacheKey(context.request, "photon-search-v1", id),
    url: upstream,
    ttlSeconds: TTL_S,
    headers: { "user-agent": userAgent(context.env), accept: "application/json" },
    name: "photon",
  });
  return jsonText(r.text, 200, "public, max-age=3600", cacheInfo(context, r.cache));
});
