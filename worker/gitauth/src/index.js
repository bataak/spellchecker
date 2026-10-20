const ROUTES = {
  "/github/device/code": "https://github.com/login/device/code",
  "/github/device/token": "https://github.com/login/oauth/access_token",
};
const UPSTREAM_TIMEOUT_MS = 15000;

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim());
  return list.includes(origin) ? origin : null;
}

function cors(origin) {
  const headers = new Headers({ Vary: "Origin" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

function reply(origin, status, body) {
  const headers = cors(origin);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request.headers.get("Origin"), env);
    const url = new URL(request.url);
    const upstream = ROUTES[url.pathname];
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: origin ? 204 : 403,
        headers: cors(origin),
      });
    if (!origin) return reply(null, 403, { error: "origin" });
    if (!upstream || request.method !== "POST")
      return reply(origin, 404, { error: "route" });
    let input;
    try {
      input = await request.json();
    } catch {
      return reply(origin, 400, { error: "body" });
    }
    if (!env.GITHUB_CLIENT_ID || input.client_id !== env.GITHUB_CLIENT_ID)
      return reply(origin, 403, { error: "client" });
    const form = new URLSearchParams();
    for (const key of ["client_id", "scope", "device_code", "grant_type"])
      if (typeof input[key] === "string") form.set(key, input[key]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetch(upstream, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "git-auth-worker",
        },
        body: form,
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({ error: "upstream" }));
      return reply(origin, response.ok ? 200 : 502, body);
    } catch {
      return reply(origin, 504, { error: "timeout" });
    } finally {
      clearTimeout(timer);
    }
  },
};
