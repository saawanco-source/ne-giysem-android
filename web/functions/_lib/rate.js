// Best-effort rate limits for the /api/* functions, counted in the edge cache (per data centre): a visitor's address
// (an IPv6 /64) never appears in the cache, only an HMAC of it and the time window, keyed with the server's secret.
/** The visitor for rate limiting: the IPv4 address, or the /64 network of an IPv6 one (one home or phone line). */
export function visitor(ip) {
  const a = String(ip || "?").trim();
  if (a.indexOf(":") < 0) return a;
  let parts = a.split("::");
  if (parts.length > 2) return a;
  const head = parts[0] ? parts[0].split(":") : [], tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const full = parts.length === 2 ? head.concat(Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), tail) : head;
  return full.slice(0, 4).map((x) => (x || "0").toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/**
 * The counter's name for a visitor in one hour: an HMAC of the address (an IPv6 /64) and the hour, keyed with the
 * server's secret, so the edge cache never holds an IP address, and the name can't be turned back into one (an
 * unkeyed hash of an IPv4 address could be, by trying them all) nor linked from one hour to the next.
 */
export async function visitorTag(ip, win, secret) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode("ng-rate:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(visitor(ip) + "|" + win)));
  return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * At most [max] requests per visitor (or, with [who] "all", for everyone together) and window of [seconds]; true
 * while under. A broken counter never stops the service.
 */
export async function counted(request, secret, bucket, max, seconds, who) {
  const cache = globalThis.caches && globalThis.caches.default;
  if (!cache) return true;
  const win = Math.floor(Date.now() / 1000 / seconds);
  try {
    const tag = who === "all" ? "all" : await visitorTag(request.headers.get("cf-connecting-ip"), win, secret || "ng");
    const key = `${new URL(request.url).origin}/__ng-rate/${bucket}/${tag}/${win}`;
    const hit = await cache.match(key);
    const n = hit ? Number(await hit.text()) || 0 : 0;
    if (n >= max) return false;
    const left = Math.max(1, seconds - Math.floor(Date.now() / 1000) % seconds);
    await cache.put(key, new Response(String(n + 1), { headers: { "cache-control": `public, max-age=${left}` } }));
  } catch (e) { /* best effort */ }
  return true;
}

/** The per-visitor limit for the weather and place endpoints: a 429 past it. */
export async function limit(context, bucket, perHour) {
  const env = context.env || {};
  const secret = typeof env.RATE_SECRET === "string" && env.RATE_SECRET.trim() ? env.RATE_SECRET.trim() : "";
  return counted(context.request, secret, bucket, perHour, 3600);
}
