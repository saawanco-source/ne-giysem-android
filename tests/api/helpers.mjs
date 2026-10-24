// Test doubles for the Pages Functions runtime: caches.default, fetch, request.cf, context.waitUntil and the clock.

/** In-memory caches.default that honours the stored max-age like the Workers Cache API. */
export function installCache() {
  const store = new Map();
  const cache = {
    puts: 0,
    store,
    async match(key) {
      const k = typeof key === "string" ? key : key.url;
      const e = store.get(k);
      if (!e) return undefined;
      if (Date.now() > e.storedAt + e.maxAge * 1000) { store.delete(k); return undefined; }
      return new Response(e.body, { headers: e.headers });
    },
    async put(key, res) {
      const k = typeof key === "string" ? key : key.url;
      const cc = res.headers.get("cache-control") || "";
      const m = /max-age=(\d+)/.exec(cc);
      store.set(k, { body: await res.text(), headers: Object.fromEntries(res.headers), storedAt: Date.now(), maxAge: m ? +m[1] : 0 });
      cache.puts++;
    },
  };
  globalThis.caches = { default: cache };
  return cache;
}

/** Replaces fetch with a handler (url, init) -> Response | Promise<Response>; records every call. */
export function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const headers = new Headers(init.headers || {});
    calls.push({ url: String(url), headers });
    return handler(String(url), { ...init, headers });
  };
  return calls;
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status, headers: { "content-type": "application/json;charset=UTF-8", ...headers },
  });
}

/** Calls a Pages Function module the way Pages does and waits for its waitUntil work. */
export async function call(mod, url, { method = "GET", env = {}, cf } = {}) {
  const request = new Request(url, { method });
  if (cf !== undefined) Object.defineProperty(request, "cf", { value: cf });
  const pending = [];
  const context = { request, env, params: {}, waitUntil: (p) => pending.push(p), next: () => { throw new Error("next"); }, data: {} };
  const res = await mod.onRequest(context);
  await Promise.all(pending);
  const text = method === "HEAD" || res.status === 204 ? "" : await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
  return { res, body, text };
}

/** Runs fn with Date.now() pinned (our code reads the clock only through Date.now). */
export async function atTime(ms, fn) {
  const real = Date.now;
  const clock = { now: ms };
  Date.now = () => clock.now;
  try { return await fn(clock); } finally { Date.now = real; }
}

export const ORIGIN = "https://ne-giysem.pages.dev";
