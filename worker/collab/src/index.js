import { DurableObject } from "cloudflare:workers";

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{16}$/;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const MAX_SLOTS = 8;
const MAX_PEERS = 8;
const MAX_INVITES = 32;
const MAX_MEMBERS = 64;
const MAX_LABEL = 600;
const DENIED = 4003;
const REMOVED = 4004;
const ENDED = 4005;
const WIPED = 4006;
const PURGED = 4007;
const FULL = 4009;
const MAX_SIGNAL = 64 * 1024;
const MAX_SNAPSHOT = 1900 * 1024;
const ROOM_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim());
  return list.includes(origin) ? origin : null;
}

async function digest(token) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function first(cursor) {
  for (const row of cursor) return row;
  return null;
}

function refuse(code, reason) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS snap (dev TEXT PRIMARY KEY, data BLOB NOT NULL, at INTEGER NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS invites (h TEXT PRIMARY KEY, at INTEGER NOT NULL, dev TEXT)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS members (dev TEXT PRIMARY KEY, h TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, gone INTEGER NOT NULL DEFAULT 0)",
    );
  }

  peers() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment();
      if (meta) out.push({ ws, id: meta.id, dev: meta.dev, owner: meta.owner });
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

  meta(key) {
    return (
      first(this.ctx.storage.sql.exec("SELECT v FROM meta WHERE k = ?", key))
        ?.v ?? null
    );
  }

  touch() {
    return this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  async admit(params, dev) {
    const owner = params.get("o");
    const member = params.get("m");
    const invite = params.get("i");
    const token = owner ?? member ?? invite;
    if (!token || !TOKEN.test(token)) return { code: DENIED };
    const closed = Number(this.meta("closed"));
    if (closed) return { code: closed };
    const hash = await digest(token);
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    if (owner) {
      const known = this.meta("owner");
      if (known && known !== hash) return { code: DENIED };
      if (!known) {
        if (first(sql.exec("SELECT 1 AS x FROM members LIMIT 1")))
          return { code: DENIED };
        sql.exec("INSERT INTO meta (k, v) VALUES ('owner', ?)", hash);
        sql.exec("INSERT INTO meta (k, v) VALUES ('dev', ?)", dev);
        sql.exec(
          "INSERT INTO members (dev, h, at) VALUES (?, '', ?)",
          dev,
          now,
        );
        await this.touch();
      }
      if (this.meta("dev") !== dev) return { code: DENIED };
      return { owner: true };
    }
    const row = first(
      sql.exec("SELECT h, gone FROM members WHERE dev = ?", dev),
    );
    if (row?.gone) return { code: row.gone === 2 ? PURGED : REMOVED };
    if (member) return row && row.h === hash ? {} : { code: DENIED };
    const fresh = newToken();
    const freshHash = await digest(fresh);
    const used = first(sql.exec("SELECT dev FROM invites WHERE h = ?", hash));
    if (!used || (used.dev && used.dev !== dev)) return { code: DENIED };
    const gone = first(sql.exec("SELECT gone FROM members WHERE dev = ?", dev));
    if (gone?.gone) return { code: gone.gone === 2 ? PURGED : REMOVED };
    if (!gone) {
      const count = first(
        sql.exec("SELECT COUNT(*) AS n FROM members WHERE gone = 0"),
      );
      if (count.n >= MAX_MEMBERS) return { code: DENIED };
    }
    sql.exec("UPDATE invites SET dev = ? WHERE h = ?", dev, hash);
    sql.exec(
      "INSERT INTO members (dev, h, at) VALUES (?, ?, ?) ON CONFLICT (dev) DO UPDATE SET h = excluded.h",
      dev,
      freshHash,
      now,
    );
    return { member: fresh };
  }

  async fetch(request) {
    const params = new URL(request.url).searchParams;
    const dev = params.get("d") ?? "";
    const id = params.get("p") ?? "";
    if (!CLIENT_ID.test(dev) || !CLIENT_ID.test(id))
      return new Response("client", { status: 400 });
    const access = await this.admit(params, dev);
    if (access.code) return refuse(access.code, "denied");
    const others = [];
    for (const peer of this.peers()) {
      if (peer.id !== id) {
        others.push(peer);
        continue;
      }
      peer.ws.serializeAttachment(null);
      peer.ws.close(1000, "replaced");
    }
    if (others.length >= MAX_PEERS) return refuse(FULL, "full");
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, dev, owner: access.owner === true });
    if (access.member) this.send(server, { t: "member", m: access.member });
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
    if (input?.t === "to" && typeof input.d === "string") {
      const target = this.peers().find((p) => p.id === input.to);
      if (target)
        this.send(target.ws, { t: "from", from: meta.id, d: input.d });
      return;
    }
    if (input?.t === "label") return this.label(meta, input.l);
    if (input?.t === "leave") return this.quit(ws, meta);
    if (!meta.owner) return;
    if (input?.t === "invite") return this.invite(ws, input.i);
    if (input?.t === "members") return this.send(ws, this.roster());
    if (input?.t === "remove")
      return this.remove(ws, input.dev, input.wipe === true);
    if (input?.t === "close") return this.end(ws, input.wipe === true);
  }

  label(meta, label) {
    if (typeof label !== "string" || label.length > MAX_LABEL) return;
    this.ctx.storage.sql.exec(
      "UPDATE members SET label = ? WHERE dev = ? AND gone = 0",
      label,
      meta.dev,
    );
  }

  quit(ws, meta) {
    if (!meta.owner)
      this.ctx.storage.sql.exec("DELETE FROM members WHERE dev = ?", meta.dev);
    ws.close(1000, "left");
    this.leave(ws);
  }

  async invite(ws, token) {
    if (typeof token !== "string" || !TOKEN.test(token)) return;
    const hash = await digest(token);
    const sql = this.ctx.storage.sql;
    sql.exec(
      "INSERT OR IGNORE INTO invites (h, at, dev) VALUES (?, ?, NULL)",
      hash,
      Date.now(),
    );
    sql.exec(
      "DELETE FROM invites WHERE dev IS NULL AND h NOT IN (SELECT h FROM invites WHERE dev IS NULL ORDER BY at DESC LIMIT ?)",
      MAX_INVITES,
    );
    this.send(ws, { t: "invited", i: token });
  }

  roster() {
    const online = new Set(this.peers().map((p) => p.dev));
    const owner = this.meta("dev");
    const list = [];
    for (const row of this.ctx.storage.sql.exec(
      "SELECT dev, label, at FROM members WHERE gone = 0 ORDER BY at",
    ))
      list.push({
        dev: row.dev,
        l: row.label,
        at: row.at,
        on: online.has(row.dev),
        o: row.dev === owner,
      });
    return { t: "members", list };
  }

  remove(ws, dev, wipe) {
    if (typeof dev !== "string" || dev === this.meta("dev")) return;
    this.ctx.storage.sql.exec(
      "UPDATE members SET gone = ?, h = '', label = '' WHERE dev = ?",
      wipe ? 2 : 1,
      dev,
    );
    this.ctx.storage.sql.exec("DELETE FROM snap WHERE dev = ?", dev);
    const peers = this.peers();
    for (const peer of peers) {
      if (peer.dev !== dev) continue;
      this.evict(peer.ws, wipe ? PURGED : REMOVED);
      for (const other of peers)
        if (other.dev !== dev) this.send(other.ws, { t: "kick", id: peer.id });
    }
    this.send(ws, this.roster());
  }

  end(ws, wipe) {
    const sql = this.ctx.storage.sql;
    for (const table of ["snap", "invites", "members"])
      sql.exec("DELETE FROM " + table);
    sql.exec(
      "INSERT OR REPLACE INTO meta (k, v) VALUES ('closed', ?)",
      String(wipe ? WIPED : ENDED),
    );
    this.send(ws, { t: "ended" });
    for (const peer of this.peers()) {
      if (peer.ws !== ws) this.evict(peer.ws, wipe ? WIPED : ENDED);
      else {
        peer.ws.serializeAttachment(null);
        peer.ws.close(1000, "ended");
      }
    }
    return this.touch();
  }

  evict(ws, code) {
    this.send(ws, { t: "final", code });
    ws.serializeAttachment(null);
    ws.close(code, "final");
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
    return this.touch();
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
      await this.touch();
      return;
    }
    const sql = this.ctx.storage.sql;
    for (const table of ["snap", "meta", "invites", "members"])
      sql.exec("DELETE FROM " + table);
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
