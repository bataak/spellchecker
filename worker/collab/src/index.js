import { DurableObject } from "cloudflare:workers";

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{16}$/;
const MAX_SLOTS = 8;
const MAX_PEERS = 8;
const FULL = 4009;
const MAX_SIGNAL = 64 * 1024;
const MAX_SNAPSHOT = 1900 * 1024;
const SNAPSHOT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim());
  return list.includes(origin) ? origin : null;
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS snap (dev TEXT PRIMARY KEY, data BLOB NOT NULL, at INTEGER NOT NULL)",
    );
  }

  peers() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment();
      if (meta) out.push({ ws, id: meta.id });
    }
    return out;
  }

  send(ws, message) {
    try {
      ws.send(
        message instanceof ArrayBuffer ? message : JSON.stringify(message),
      );
    } catch {
      return;
    }
  }

  async fetch(request) {
    const params = new URL(request.url).searchParams;
    const dev = params.get("d") ?? "";
    const id = params.get("p") ?? "";
    if (!CLIENT_ID.test(dev) || !CLIENT_ID.test(id))
      return new Response("client", { status: 400 });
    const others = [];
    for (const peer of this.peers()) {
      if (peer.id !== id) {
        others.push(peer);
        continue;
      }
      peer.ws.serializeAttachment(null);
      peer.ws.close(1000, "replaced");
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (others.length >= MAX_PEERS) {
      server.accept();
      server.close(FULL, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, dev });
    this.send(server, { t: "hi", id, peers: others.map((p) => p.id) });
    for (const row of this.ctx.storage.sql.exec("SELECT data FROM snap"))
      this.send(server, row.data);
    for (const peer of others) this.send(peer.ws, { t: "join", id });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const meta = ws.deserializeAttachment();
    if (!meta) return;
    if (typeof message !== "string") return this.store(meta.dev, message);
    if (message.length > MAX_SIGNAL) return;
    let input;
    try {
      input = JSON.parse(message);
    } catch {
      return;
    }
    if (input?.t !== "to" || typeof input.d !== "string") return;
    const target = this.peers().find((p) => p.id === input.to);
    if (target) this.send(target.ws, { t: "from", from: meta.id, d: input.d });
  }

  store(dev, data) {
    if (data.byteLength === 0 || data.byteLength > MAX_SNAPSHOT) return;
    const sql = this.ctx.storage.sql;
    sql.exec(
      "INSERT INTO snap (dev, data, at) VALUES (?, ?, ?) ON CONFLICT (dev) DO UPDATE SET data = excluded.data, at = excluded.at",
      dev,
      data,
      Date.now(),
    );
    sql.exec(
      "DELETE FROM snap WHERE dev NOT IN (SELECT dev FROM snap ORDER BY at DESC LIMIT ?)",
      MAX_SLOTS,
    );
    return this.ctx.storage.setAlarm(Date.now() + SNAPSHOT_TTL_MS);
  }

  async webSocketClose(ws) {
    this.leave(ws);
  }

  async webSocketError(ws) {
    this.leave(ws);
  }

  leave(ws) {
    const meta = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    if (!meta) return;
    for (const peer of this.peers())
      if (peer.ws !== ws) this.send(peer.ws, { t: "bye", id: meta.id });
  }

  async alarm() {
    if (this.peers().length) {
      await this.ctx.storage.setAlarm(Date.now() + SNAPSHOT_TTL_MS);
      return;
    }
    this.ctx.storage.sql.exec("DELETE FROM snap");
  }
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request.headers.get("Origin"), env);
    if (!origin) return new Response("origin", { status: 403 });
    const match = /^\/room\/([^/]+)$/.exec(new URL(request.url).pathname);
    if (!match || !ROOM_ID.test(match[1]))
      return new Response("route", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("upgrade", { status: 426 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(match[1]));
    return room.fetch(request);
  },
};
