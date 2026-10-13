const UPSTREAMS = {
  2026: [
    "https://mirrors.ctan.org/systems/texlive/tlnet/archive/",
    "https://mirror.math.princeton.edu/pub/CTAN/systems/texlive/tlnet/archive/",
    "https://ftp.fau.de/ctan/systems/texlive/tlnet/archive/",
  ],
};
const PATH = /^\/(\d{4})\/([A-Za-z0-9][A-Za-z0-9_-]{0,99})\.tar\.xz$/;
const UPSTREAM_TIMEOUT_MS = 25000;
const CACHE_SECONDS = 7 * 24 * 60 * 60;

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim());
  return list.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  const headers = new Headers({ Vary: "Origin" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

function reply(status, origin) {
  return new Response(null, { status, headers: corsHeaders(origin) });
}

function withCors(response, origin) {
  const headers = corsHeaders(origin);
  for (const name of [
    "Content-Type",
    "Content-Length",
    "Cache-Control",
    "ETag",
    "Last-Modified",
  ]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

async function fromUpstream(year, name) {
  let status = 502;
  for (const base of UPSTREAMS[year]) {
    let upstream;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      upstream = await fetch(base + name + ".tar.xz", {
        redirect: "follow",
        signal: controller.signal,
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      });
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (upstream.status === 404) {
      status = 404;
      continue;
    }
    if (!upstream.ok) continue;
    const length = Number(upstream.headers.get("Content-Length") ?? 0);
    const headers = new Headers({
      "Content-Type": "application/x-xz",
      "Cache-Control": "public, max-age=" + CACHE_SECONDS + ", immutable",
    });
    if (length) headers.set("Content-Length", String(length));
    for (const header of ["ETag", "Last-Modified"]) {
      const value = upstream.headers.get(header);
      if (value) headers.set(header, value);
    }
    return {
      status: 200,
      response: new Response(upstream.body, { status: 200, headers }),
    };
  }
  return { status };
}

export default {
  async fetch(request, env, ctx) {
    const origin = allowedOrigin(request.headers.get("Origin"), env);
    if (request.headers.get("Origin") && !origin) return reply(403, null);
    if (request.method === "OPTIONS") return reply(204, origin);
    if (request.method !== "GET" && request.method !== "HEAD")
      return reply(405, origin);

    const url = new URL(request.url);
    const match = PATH.exec(url.pathname);
    if (!match || !UPSTREAMS[match[1]]) return reply(404, origin);
    const [, year, name] = match;

    const key = new Request(url.origin + url.pathname, { method: "GET" });
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) return withCors(hit, origin);

    const result = await fromUpstream(year, name);
    if (!result.response) return reply(result.status, origin);
    ctx.waitUntil(
      cache.put(key, result.response.clone()).catch(() => undefined),
    );
    return withCors(result.response, origin);
  },
};
