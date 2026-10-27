import { allowedOrigin, type OriginEnv } from "../../shared/origin.ts";

const UPSTREAMS: Readonly<Record<string, readonly string[]>> = {
  2026: [
    "https://mirror.math.princeton.edu/pub/CTAN/systems/texlive/tlnet/archive/",
    "https://ftp.fau.de/ctan/systems/texlive/tlnet/archive/",
    "https://mirrors.ctan.org/systems/texlive/tlnet/archive/",
  ],
};
const PATH = /^\/(\d{4})\/([A-Za-z0-9][A-Za-z0-9_-]{0,99})\.tar\.xz$/;
const UPSTREAM_TIMEOUT_MS = 25000;
const CACHE_SECONDS = 7 * 24 * 60 * 60;
const CACHE_VERSION = "v2";
const XZ_MAGIC = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00];

async function asXz(response: Response): Promise<Response | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  let head: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  while (head.length < XZ_MAGIC.length) {
    const { done, value } = await reader.read();
    if (done) break;
    const next = new Uint8Array(head.length + value.length);
    next.set(head);
    next.set(value, head.length);
    head = next;
  }
  if (!XZ_MAGIC.every((byte, i) => head[i] === byte)) {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(head);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason: unknown) {
      return reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    headers: response.headers,
  });
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({ Vary: "Origin" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

function reply(status: number, origin: string | null): Response {
  return new Response(null, { status, headers: corsHeaders(origin) });
}

function withCors(response: Response, origin: string | null): Response {
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

async function fromUpstream(
  bases: readonly string[],
  name: string,
): Promise<{ status: number; response?: Response }> {
  let status = 502;
  for (const base of bases) {
    let upstream: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      upstream = await fetch(base + name + ".tar.xz", {
        redirect: "follow",
        signal: controller.signal,
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
    const checked = await asXz(upstream).catch(() => null);
    if (!checked) continue;
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
      response: new Response(checked.body, { status: 200, headers }),
    };
  }
  return { status };
}

export default {
  async fetch(
    request: Request,
    env: OriginEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const origin = allowedOrigin(request.headers.get("Origin"), env);
    if (request.headers.get("Origin") && !origin) return reply(403, null);
    if (request.method === "OPTIONS") return reply(204, origin);
    if (request.method !== "GET" && request.method !== "HEAD")
      return reply(405, origin);

    const url = new URL(request.url);
    const match = PATH.exec(url.pathname);
    const bases =
      match && Object.hasOwn(UPSTREAMS, match[1]!)
        ? UPSTREAMS[match[1]!]
        : undefined;
    if (!match || !bases) return reply(404, origin);
    const name = match[2]!;

    const key = new Request(url.origin + "/" + CACHE_VERSION + url.pathname, {
      method: "GET",
    });
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) {
      const checked = await asXz(hit).catch(() => null);
      if (checked) return withCors(checked, origin);
      ctx.waitUntil(cache.delete(key).catch(() => undefined));
    }

    const result = await fromUpstream(bases, name);
    if (!result.response) return reply(result.status, origin);
    ctx.waitUntil(
      cache.put(key, result.response.clone()).catch(() => undefined),
    );
    return withCors(result.response, origin);
  },
};
