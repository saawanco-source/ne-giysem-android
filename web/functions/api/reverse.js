// GET /api/reverse?lat=…&lon=…
// Place name for a coordinate through Photon reverse geocoding (OpenStreetMap data, ODbL), in the field names the client
// already reads from BigDataCloud: {locality, city, principalSubdivision}. Cached 30 days per ~100 m cell (3 decimals).
import { route, jsonText, coord, round, userAgent } from "../_lib/http.js";
import { cacheKey, cachedJson } from "../_lib/cache.js";

const PHOTON = "https://photon.komoot.io";
const TTL_S = 30 * 86400;
const LOCAL_PLACES = new Set([
  "neighbourhood", "quarter", "suburb", "city_district", "district", "borough", "town", "village", "hamlet", "locality",
  "isolated_dwelling",
]);
const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Photon reverse GeoJSON -> {locality, city, principalSubdivision}.
 * locality: the feature itself when it is a neighbourhood/suburb/district/town-like place, else its locality
 * (neighbourhood level) or district (suburb level); city: city, else county; principalSubdivision: state.
 */
export function reverseFields(geo) {
  const f = geo && Array.isArray(geo.features) ? geo.features[0] : null;
  const p = (f && f.properties) || {};
  const isPlace = p.osm_key === "place";
  const self = text(p.name);
  const selfLocal = p.type === "locality" || p.type === "district" || (isPlace && LOCAL_PLACES.has(p.osm_value)) ? self : null;
  const selfCity = p.type === "city" || p.type === "county" || (isPlace && (p.osm_value === "city" || p.osm_value === "municipality")) ? self : null;
  const selfState = p.type === "state" ? self : null;
  return {
    locality: selfLocal || text(p.locality) || text(p.district),
    city: text(p.city) || selfCity || text(p.county),
    principalSubdivision: text(p.state) || selfState,
  };
}

export const onRequest = route(async (context, url) => {
  const lat = round(coord(url.searchParams.get("lat"), "lat", 90), 3).toFixed(3);
  const lon = round(coord(url.searchParams.get("lon"), "lon", 180), 3).toFixed(3);
  const r = await cachedJson(context, {
    key: cacheKey(context.request, "photon-reverse-v1", `${lat},${lon}`),
    url: `${PHOTON}/reverse?lat=${lat}&lon=${lon}`,
    ttlSeconds: TTL_S,
    headers: { "user-agent": userAgent(context.env), accept: "application/json" },
    transform: reverseFields,
    name: "photon",
  });
  return jsonText(r.text, 200, "public, max-age=86400", { "x-ng-cache": r.cache });
});
