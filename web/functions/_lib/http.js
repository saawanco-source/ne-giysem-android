// Shared HTTP plumbing for the /api/* Pages Functions: JSON responses with CORS, input checks, method routing.
// Nothing here exports an onRequest* name, so Pages never turns this folder into a route.

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
};

export const DEFAULT_UA = "NeGiysem/1.0 (+https://ne-giysem.pages.dev)";

/** The identifying User-Agent for MET Norway and Photon (never a browser string). */
export function userAgent(env) {
  const ua = env && typeof env.MET_USER_AGENT === "string" ? env.MET_USER_AGENT.trim() : "";
  return ua || DEFAULT_UA;
}

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}
export const badRequest = (message) => new HttpError(400, message);
export const upstreamError = (message, extra) => new HttpError(502, message, extra);

export function json(body, status = 200, cacheControl = "no-store", extra = {}) {
  return jsonText(JSON.stringify(body), status, cacheControl, extra);
}
export function jsonText(text, status = 200, cacheControl = "no-store", extra = {}) {
  return new Response(text, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl, ...CORS, ...extra },
  });
}

/** Wraps a GET handler: OPTIONS -> 204 preflight, HEAD -> headers only, other methods -> 405, errors -> JSON {error}. */
export function route(handler) {
  return async function onRequest(context) {
    const method = context.request.method;
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (method !== "GET" && method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405, "no-store", { allow: "GET, HEAD, OPTIONS" });
    }
    let res;
    try {
      res = await handler(context, new URL(context.request.url));
    } catch (e) {
      if (e instanceof HttpError) {
        res = json({ error: e.message, ...(e.extra || {}) }, e.status, "no-store");
      } else {
        console.error("api error", e && e.stack ? e.stack : e);
        res = json({ error: "internal_error" }, 502, "no-store");
      }
    }
    return method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
  };
}

/** Number from a query value; NaN for missing, empty or non-numeric text. */
export function num(v) {
  if (v == null) return NaN;
  const s = String(v).trim();
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** A latitude (max 90) or longitude (max 180), or a 400. */
export function coord(v, name, max) {
  const n = num(v);
  if (!Number.isFinite(n) || Math.abs(n) > max) throw badRequest(`invalid ${name}`);
  return n;
}

/** Rounds to d decimals without producing -0. */
export function round(v, d) {
  const f = 10 ** d, r = Math.round(v * f) / f;
  return r === 0 ? 0 : r;
}

/** True when a query parameter was given with some text. */
export const given = (v) => v != null && String(v).trim() !== "";
