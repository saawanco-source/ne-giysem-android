// GET /api/ip
// Approximate location of the caller from Cloudflare's own IP geolocation (request.cf); no upstream call.
// Field names follow BigDataCloud's reverse-geocode-client, which the clients read today.
import { route, json, num } from "../_lib/http.js";
import { allowedOrigin } from "./route.js";

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const PRIVATE = "private, no-store";

export const onRequest = route(async (context) => {
  const cf = context.request.cf || {};
  // Only the app's own pages may read it from a browser: another website must not get its visitors' city from us.
  const o = context.request.headers.get("origin"), env = context.env || {};
  const corsOk = !o || allowedOrigin(o, new URL(context.request.url).origin, env.ALLOWED_ORIGINS, env.DEV_ORIGINS === "1");
  if (!corsOk) return json({ error: "forbidden" }, 403, PRIVATE, { "access-control-allow-origin": "null" });
  const latitude = num(cf.latitude), longitude = num(cf.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return json({ error: "location_unavailable" }, 404, PRIVATE);
  }
  const city = text(cf.city);
  return json({
    latitude, longitude, city, locality: city, principalSubdivision: text(cf.region), countryCode: text(cf.country),
  }, 200, PRIVATE);
});
