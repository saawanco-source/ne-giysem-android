// GET /api/route?from=LAT,LON&to=LAT,LON&depart=ISO-8601[&lang=tr|en]
// Public-transport routes from Google's Routes API (computeRoutes, TRANSIT, with alternatives), simplified to what the
// app needs: walking, waiting and each ride with its line, stops, times and operator. Google's answer is never stored
// (Google Maps Platform terms: no caching of route content); every answer is "no-store".
//
// Off unless the site has a GOOGLE_ROUTES_KEY secret (Cloudflare Pages → Settings → Variables and secrets); then
// /api/route?probe=1 says {"on":true} without asking Google. The key stays on the server and should be restricted to
// the Routes API with a daily quota in Google Cloud; on top of that each visitor gets at most RATE_PER_HOUR answers
// an hour, and only the app's own pages may ask.
import { route, json, badRequest, coord, HttpError, upstreamError } from "../_lib/http.js";

const GOOGLE = "https://routes.googleapis.com/directions/v2:computeRoutes";
export const RATE_PER_HOUR = 30;
const MAX_KM = 150;
// Only the fields the app shows (Google bills by the fields asked for, and the mask is required).
export const FIELD_MASK = [
  "routes.duration", "routes.distanceMeters", "routes.localizedValues", "routes.travelAdvisory.transitFare",
  "routes.legs.steps.travelMode", "routes.legs.steps.distanceMeters", "routes.legs.steps.staticDuration",
  "routes.legs.steps.transitDetails",
].join(",");

/** The app's own pages: the site (and its preview builds), the Android app's bundled page, local development. */
export function allowedOrigin(o) {
  if (!o) return false;
  let u;
  try { u = new URL(o); } catch (e) { return false; }
  if (u.protocol === "https:" && (u.hostname === "ne-giysem.pages.dev" || u.hostname.endsWith(".ne-giysem.pages.dev"))) return true;
  if (u.protocol === "https:" && u.hostname === "appassets.androidplatform.net") return true;
  return (u.protocol === "http:" || u.protocol === "https:") && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

function fromApp(request) {
  const h = request.headers;
  if (allowedOrigin(h.get("origin"))) return true;
  // Same-site GETs carry no Origin; browsers say so in Sec-Fetch-Site, and the Referer names the page.
  if (h.get("sec-fetch-site") === "same-origin") return true;
  const ref = h.get("referer");
  if (ref) { try { return allowedOrigin(new URL(ref).origin); } catch (e) { return false; } }
  return false;
}

function point(v, name) {
  const parts = String(v || "").split(",");
  if (parts.length !== 2) throw badRequest(`${name} must be LAT,LON`);
  return { lat: coord(parts[0], `${name} latitude`, 90), lon: coord(parts[1], `${name} longitude`, 180) };
}

function km(a, b) {
  const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** At most RATE_PER_HOUR answers per visitor and hour, counted in the edge cache (per data centre; best effort). */
async function underLimit(request) {
  const cache = globalThis.caches && globalThis.caches.default;
  if (!cache) return true;
  const ip = request.headers.get("cf-connecting-ip") || "?";
  const key = `${new URL(request.url).origin}/__ng-rate/route/${encodeURIComponent(ip)}/${Math.floor(Date.now() / 3600e3)}`;
  try {
    const hit = await cache.match(key);
    const n = hit ? Number(await hit.text()) || 0 : 0;
    if (n >= RATE_PER_HOUR) return false;
    await cache.put(key, new Response(String(n + 1), { headers: { "cache-control": "public, max-age=3600" } }));
  } catch (e) { /* a broken counter must not stop the feature */ }
  return true;
}

const seconds = (d) => { const m = /^(\d+(?:\.\d+)?)s$/.exec(String(d || "")); return m ? Math.round(Number(m[1])) : 0; };
const minutes = (s) => Math.max(1, Math.round(s / 60));

/** Google's vehicle type → the app's step kinds (walk, wait, bus, metrobus, metro, marmaray, tram, ferry). */
export function modeOf(type, line, agency) {
  const short = String((line && (line.nameShort || line.name)) || "");
  if (/^(BUS|INTERCITY_BUS|TROLLEYBUS|SHARE_TAXI)$/.test(type)) {
    // İstanbul's Metrobüs runs as İETT bus lines 34, 34A, 34BZ…
    if (/metrob[üu]s/i.test(String((line && line.name) || "")) || (/^34[A-Z]{0,2}$/.test(short) && /İETT|IETT/i.test(agency || ""))) return "metrobus";
    return "bus";
  }
  if (/^(SUBWAY|METRO_RAIL|MONORAIL|FUNICULAR)$/.test(type)) return "metro";
  if (/^(TRAM|LIGHT_RAIL|CABLE_CAR|GONDOLA_LIFT)$/.test(type)) return "tram";
  if (/^(RAIL|HEAVY_RAIL|COMMUTER_TRAIN|HIGH_SPEED_TRAIN|LONG_DISTANCE_TRAIN)$/.test(type)) return "marmaray";
  if (type === "FERRY") return "ferry";
  return "bus";
}

/**
 * One Google route → {min, dist, fare, dep, arr, steps}. Walking instructions in a row become one walk; between two
 * rides the time left after walking becomes a wait. A ride: {m, min, line, name, vehicle, color, textColor, from, to,
 * dep, arr, stops, headsign, agency, agencyUrl}.
 */
export function simplify(r) {
  const steps = [];
  let walkS = 0, walkM = 0, lastArr = null;
  const flushWalk = () => {
    if (walkS > 0) steps.push({ m: "walk", min: minutes(walkS), dist: walkM, sec: walkS });
    walkS = 0; walkM = 0;
  };
  for (const leg of r.legs || []) for (const st of leg.steps || []) {
    if (st.travelMode === "TRANSIT" && st.transitDetails) {
      const td = st.transitDetails, sd = td.stopDetails || {}, line = td.transitLine || {};
      const agency = (line.agencies && line.agencies[0]) || {};
      const vehicle = line.vehicle || {};
      const dep = sd.departureTime || null, arr = sd.arrivalTime || null;
      const walkBefore = walkS;
      flushWalk();
      // Between two rides: whatever the walk leaves of the gap is spent waiting at the stop.
      if (lastArr && dep) {
        const gap = (Date.parse(dep) - Date.parse(lastArr)) / 1000 - walkBefore;
        if (gap >= 60) steps.push({ m: "wait", min: Math.round(gap / 60), sec: Math.round(gap) });
      }
      const rideS = dep && arr ? Math.max(0, (Date.parse(arr) - Date.parse(dep)) / 1000) : seconds(st.staticDuration);
      steps.push({
        m: modeOf(vehicle.type, line, agency.name), min: minutes(rideS), sec: Math.round(rideS),
        line: line.nameShort || line.name || "", name: line.name || "", vehicle: (vehicle.name && vehicle.name.text) || "",
        color: line.color || "", textColor: line.textColor || "",
        from: (sd.departureStop && sd.departureStop.name) || "", to: (sd.arrivalStop && sd.arrivalStop.name) || "",
        dep, arr, stops: td.stopCount || 0, headsign: td.headsign || "", agency: agency.name || "", agencyUrl: agency.uri || "",
      });
      lastArr = arr;
    } else {
      walkS += seconds(st.staticDuration);
      walkM += st.distanceMeters || 0;
    }
  }
  flushWalk();
  const rides = steps.filter((s) => s.dep);
  const fare = r.travelAdvisory && r.travelAdvisory.transitFare;
  const lv = r.localizedValues || {};
  return {
    min: minutes(seconds(r.duration)), dist: r.distanceMeters || 0,
    fare: (lv.transitFare && lv.transitFare.text) || (fare && fare.units != null ? `${fare.units} ${fare.currencyCode || ""}`.trim() : ""),
    firstDep: rides.length ? rides[0].dep : null, lastArr: rides.length ? rides[rides.length - 1].arr : null,
    steps,
  };
}

export const onRequest = route(async (context, url) => {
  const key = context.env && typeof context.env.GOOGLE_ROUTES_KEY === "string" ? context.env.GOOGLE_ROUTES_KEY.trim() : "";
  if (url.searchParams.get("probe") === "1") return json({ on: !!key }, 200, "no-store");
  if (!key) throw new HttpError(503, "routes_off");
  if (!fromApp(context.request)) throw new HttpError(403, "forbidden");

  const from = point(url.searchParams.get("from"), "from");
  const to = point(url.searchParams.get("to"), "to");
  if (km(from, to) > MAX_KM) throw badRequest("too_far");
  if (km(from, to) < 0.05) throw badRequest("same_place");
  const depart = Date.parse(url.searchParams.get("depart") || "");
  const now = Date.now();
  if (!Number.isFinite(depart) || depart > now + 8 * 864e5) throw badRequest("invalid depart");
  const lang = url.searchParams.get("lang") === "en" ? "en" : "tr";
  if (!(await underLimit(context.request))) throw new HttpError(429, "rate_limited");

  const ll = (p) => ({ location: { latLng: { latitude: Math.round(p.lat * 1e5) / 1e5, longitude: Math.round(p.lon * 1e5) / 1e5 } } });
  const body = {
    origin: ll(from), destination: ll(to), travelMode: "TRANSIT", computeAlternativeRoutes: true,
    // A time already past is asked for as "now" (Google plans transit from the timetable onwards).
    departureTime: new Date(Math.max(depart, now + 60e3)).toISOString(), languageCode: lang, units: "METRIC",
  };
  let res;
  try {
    res = await fetch(GOOGLE, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": FIELD_MASK },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw upstreamError("routes_unreachable");
  }
  const text = await res.text();
  if (!res.ok) {
    let status = "";
    try { status = (JSON.parse(text).error || {}).status || ""; } catch (e) { /* not JSON */ }
    console.error("google routes", res.status, status, text.slice(0, 300));
    if (res.status === 429 || status === "RESOURCE_EXHAUSTED") throw new HttpError(429, "quota");
    throw upstreamError("routes_failed", { upstream: res.status });
  }
  let data;
  try { data = JSON.parse(text); } catch (e) { throw upstreamError("routes_bad_answer"); }
  const routes = (data.routes || []).map(simplify).filter((r) => r.steps.length);
  const agencies = [];
  routes.forEach((r) => r.steps.forEach((s) => {
    if (s.agency && !agencies.some((a) => a.name === s.agency)) agencies.push({ name: s.agency, url: s.agencyUrl || "" });
  }));
  return json({ routes, agencies, source: "Google Maps" }, 200, "no-store");
});
