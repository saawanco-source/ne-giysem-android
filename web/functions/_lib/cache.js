// Edge cache (Workers Cache API, caches.default) for upstream results, keyed by synthetic URLs on the site's own origin.
// An entry is a JSON body plus two metadata headers: when it stops being fresh (x-ng-expires, ms) and the upstream
// Last-Modified (for If-Modified-Since). The edge keeps it a while longer than "fresh" (keepSeconds) so a stale copy
// can be revalidated cheaply or served while the upstream is down.
import { upstreamError } from "./http.js";

function edgeCache() {
  try {
    return (globalThis.caches && globalThis.caches.default) || null;
  } catch (e) {
    return null;
  }
}

export function cacheKey(request, namespace, id) {
  const origin = new URL(request.url).origin;
  return `${origin}/__ng-cache/${namespace}/${encodeURIComponent(id)}`;
}

/** {text, expires, lastModified} or null. Cache failures count as a miss. */
export async function readEntry(key) {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const res = await cache.match(key);
    if (!res) return null;
    const text = await res.text();
    return { text, expires: Number(res.headers.get("x-ng-expires")) || 0, lastModified: res.headers.get("x-ng-last-modified") || null };
  } catch (e) {
    return null;
  }
}

/** Stores text in the background (context.waitUntil) and returns the write promise. */
export function writeEntry(context, key, text, { expires, keepSeconds, lastModified }) {
  const cache = edgeCache();
  if (!cache) return Promise.resolve();
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": `public, max-age=${Math.max(60, Math.ceil(keepSeconds))}`,
    "x-ng-expires": String(Math.round(expires)),
  };
  if (lastModified) headers["x-ng-last-modified"] = lastModified;
  let p;
  try {
    p = Promise.resolve(cache.put(key, new Response(text, { headers }))).catch((e) => console.warn("cache put failed", e));
  } catch (e) {
    p = Promise.resolve();
  }
  if (context && typeof context.waitUntil === "function") context.waitUntil(p);
  return p;
}

/**
 * Fetch-through cache for a JSON upstream with a fixed lifetime (Photon search/reverse).
 * transform(json) -> value to store and return (default: the upstream text unchanged).
 * Returns {text, cache: "hit"|"miss"|"stale"}; a stale copy is used only when the upstream fails.
 */
export async function cachedJson(context, { key, url, ttlSeconds, headers, transform, name }) {
  const hit = await readEntry(key);
  if (hit && hit.expires > Date.now()) return { text: hit.text, cache: "hit" };
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    if (hit) return { text: hit.text, cache: "stale" };
    throw upstreamError(`${name}_unreachable`);
  }
  if (!res.ok) {
    if (hit) return { text: hit.text, cache: "stale" };
    throw upstreamError(`${name}_status_${res.status}`, { upstreamStatus: res.status });
  }
  const raw = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    if (hit) return { text: hit.text, cache: "stale" };
    throw upstreamError(`${name}_bad_response`);
  }
  const text = transform ? JSON.stringify(transform(parsed)) : raw;
  writeEntry(context, key, text, { expires: Date.now() + ttlSeconds * 1000, keepSeconds: ttlSeconds * 2 });
  return { text, cache: "miss" };
}
