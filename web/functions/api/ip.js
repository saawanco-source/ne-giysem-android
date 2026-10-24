// GET /api/ip
// Approximate location of the caller from Cloudflare's own IP geolocation (request.cf); no upstream call.
// Field names follow BigDataCloud's reverse-geocode-client, which the clients read today.
import { route, json, num } from "../_lib/http.js";

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const PRIVATE = "private, no-store";

export const onRequest = route(async (context) => {
  const cf = context.request.cf || {};
  const latitude = num(cf.latitude), longitude = num(cf.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return json({ error: "location_unavailable" }, 404, PRIVATE);
  }
  const city = text(cf.city);
  return json({
    latitude, longitude, city, locality: city, principalSubdivision: text(cf.region), countryCode: text(cf.country),
  }, 200, PRIVATE);
});
