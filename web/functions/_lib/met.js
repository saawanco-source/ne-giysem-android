// MET Norway Locationforecast 2.0 "complete": fetch with an identifying User-Agent, cache per ~1 km cell until MET's
// Expires, revalidate with If-Modified-Since, and reduce the response to the few values the forecast builder needs.
// Terms: https://api.met.no/doc/TermsOfService (max 4 decimals, own User-Agent, cache, max 20 requests/s in total).
import { cacheKey, readEntry, writeEntry } from "./cache.js";
import { userAgent, upstreamError, HttpError } from "./http.js";

export const MET_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete";
const SERIES_VERSION = "met-v1"; // bump when the normalized format changes
const DEFAULT_TTL_MS = 30 * 60000; // when MET sends no usable Expires
const MIN_TTL_MS = 60000;
const MAX_TTL_MS = 6 * 3600000;
const GRACE_S = 12 * 3600; // a stale copy is kept this long for revalidation and as a fallback while MET is down

const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function period(p) {
  if (!p || typeof p !== "object") return null;
  const sym = p.summary && typeof p.summary.symbol_code === "string" ? p.summary.symbol_code : null;
  const d = p.details || {};
  const out = { s: sym, p: n(d.precipitation_amount), pop: n(d.probability_of_precipitation) };
  return out.s == null && out.p == null && out.pop == null ? null : out;
}

/**
 * Locationforecast JSON -> {v, updatedAt, elevation, steps:[{t, T, rh, ws, wd, g, c, uv, h1, h6, h12}]} with
 * t = UTC ms, T °C, rh %, ws/g m/s, wd degrees (from), c cloud %, uv clear-sky UV index, and the next_1/6/12_hours
 * blocks as {s: symbol_code, p: precipitation mm, pop: probability %}. Missing values are null.
 */
export function normalizeMet(json) {
  const props = json && json.properties;
  const ts = props && Array.isArray(props.timeseries) ? props.timeseries : null;
  if (!ts || !ts.length) throw new Error("met: no timeseries");
  const byTime = new Map();
  for (const step of ts) {
    const t = Date.parse(step && step.time);
    const data = step && step.data;
    const i = data && data.instant && data.instant.details;
    if (!Number.isFinite(t) || !i) continue;
    const h1 = period(data.next_1_hours);
    const uv1 = data.next_1_hours && data.next_1_hours.details ? n(data.next_1_hours.details.ultraviolet_index_clear_sky_max) : null;
    byTime.set(t, {
      t,
      T: n(i.air_temperature),
      rh: n(i.relative_humidity),
      ws: n(i.wind_speed),
      wd: n(i.wind_from_direction),
      g: n(i.wind_speed_of_gust),
      c: n(i.cloud_area_fraction),
      uv: n(i.ultraviolet_index_clear_sky) ?? uv1,
      h1,
      h6: period(data.next_6_hours),
      h12: period(data.next_12_hours),
    });
  }
  const steps = [...byTime.values()].sort((a, b) => a.t - b.t);
  if (!steps.some((s) => s.T != null)) throw new Error("met: no temperatures");
  const coords = json.geometry && Array.isArray(json.geometry.coordinates) ? json.geometry.coordinates : [];
  return { v: 1, updatedAt: (props.meta && props.meta.updated_at) || null, elevation: n(coords[2]), steps };
}

function expiryOf(res, now) {
  const e = Date.parse(res.headers.get("expires") || "");
  const at = Number.isFinite(e) ? e : now + DEFAULT_TTL_MS;
  return Math.min(Math.max(at, now + MIN_TTL_MS), now + MAX_TTL_MS);
}

export const metId = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;
export const metUrl = (lat, lon) => `${MET_URL}?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;

/**
 * Normalized MET series for a coordinate already rounded to 2 decimals.
 * Returns {series, cache} with cache "hit" (fresh copy), "miss" (new download), "revalidated" (304, copy kept)
 * or "stale" (MET failed; the last copy is served). Throws a 502 HttpError when MET fails and nothing is cached.
 */
export async function getMetSeries(context, lat, lon) {
  const key = cacheKey(context.request, SERIES_VERSION, metId(lat, lon));
  const cached = await readEntry(key);
  const now = Date.now();
  if (cached && cached.expires > now) {
    try {
      return { series: JSON.parse(cached.text), cache: "hit" };
    } catch (e) {
      /* unreadable entry: download again */
    }
  }
  const stale = () => {
    try {
      return cached ? { series: JSON.parse(cached.text), cache: "stale" } : null;
    } catch (e) {
      return null;
    }
  };

  const headers = { "user-agent": userAgent(context.env), accept: "application/json" };
  if (cached && cached.lastModified) headers["if-modified-since"] = cached.lastModified;
  let res;
  try {
    res = await fetch(metUrl(lat, lon), { headers });
  } catch (e) {
    const s = stale();
    if (s) return s;
    throw upstreamError("met_unreachable");
  }
  const at = Date.now();
  if (res.status === 304 && cached) {
    const s = stale();
    if (s) {
      const expires = expiryOf(res, at);
      writeEntry(context, key, cached.text, {
        expires, keepSeconds: (expires - at) / 1000 + GRACE_S,
        lastModified: res.headers.get("last-modified") || cached.lastModified,
      });
      return { series: s.series, cache: "revalidated" };
    }
  }
  if (res.status !== 200 && res.status !== 203) {
    // 429 = throttled, 403 = User-Agent or coordinates refused, 5xx = MET trouble.
    const s = stale();
    if (s) return s;
    // 400/422: MET refuses these coordinates (out of its area or invalid): the request's fault, not an outage.
    if (res.status === 400 || res.status === 422) throw new HttpError(400, "coordinates_refused", { upstreamStatus: res.status });
    throw upstreamError(`met_status_${res.status}`, { upstreamStatus: res.status });
  }
  if (res.status === 203) console.warn("MET Locationforecast answered 203: this product version is deprecated, see api.met.no");
  let series;
  try {
    series = normalizeMet(await res.json());
  } catch (e) {
    const s = stale();
    if (s) return s;
    throw upstreamError("met_bad_response");
  }
  const expires = expiryOf(res, at);
  writeEntry(context, key, JSON.stringify(series), {
    expires, keepSeconds: (expires - at) / 1000 + GRACE_S, lastModified: res.headers.get("last-modified"),
  });
  return { series, cache: "miss" };
}
