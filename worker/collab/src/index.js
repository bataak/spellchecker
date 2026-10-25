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
const MAX_PART = 1900 * 1024;
const MAX_PARTS = 16;
const MAX_SNAPSHOT = 8 * 1024 * 1024;
const ROOM_BYTES = 16 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const ROOM_TTL_MS = 90 * DAY_MS;
const TURN_TTL_S = 4 * 60 * 60;
const TURN_MIN_LIFE_MS = 2 * 60 * 60 * 1000;
const TURN_DAILY = 2000;
const TURN_RETRY_MS = 5 * 60 * 1000;
const TURN_WAIT_MS = 3000;
const GB = 1e9;
const TURN_LIMIT_GB = 490;

function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim());
  return list.includes(origin) ? origin : null;
}

async function turnServers(env) {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return [];
  try {
    const response = await fetch(
      "https://rtc.live.cloudflare.com/v1/turn/keys/" +
        env.TURN_KEY_ID +
        "/credentials/generate-ice-servers",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.TURN_KEY_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: TURN_TTL_S }),
        signal: AbortSignal.timeout(TURN_WAIT_MS),
      },
    );
    if (!response.ok) return [];
    const body = await response.json();
    return Array.isArray(body?.iceServers) ? body.iceServers : [];
  } catch {
    return [];
  }
}

function cloudflare(env, path, init) {
  return fetch("https://api.cloudflare.com/client/v4" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + env.CF_API_TOKEN,
      "Content-Type": "application/json",
    },
  });
}

async function turnEgress(env, now) {
  const day = now.toISOString().slice(0, 10);
  const response = await cloudflare(env, "/graphql", {
    method: "POST",
    body: JSON.stringify({
      query:
        "query($account: string!, $key: string!, $from: Date!, $to: Date!) { viewer { accounts(filter: { accountTag: $account }) { callsTurnUsageAdaptiveGroups(limit: 1, filter: { keyId: $key, date_geq: $from, date_leq: $to }) { sum { egressBytes } } } } }",
      variables: {
        account: env.CF_ACCOUNT_ID,
        key: env.TURN_KEY_ID,
        from: day.slice(0, 8) + "01",
        to: day,
      },
    }),
  });
  if (!response.ok) throw new Error("graphql " + response.status);
  const body = await response.json();
  if (body.errors?.length) throw new Error("graphql " + body.errors[0].message);
  const groups =
    body.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups ?? [];
  return groups.reduce(
    (total, group) => total + (group.sum?.egressBytes ?? 0),
    0,
  );
}

async function guardTurn(env, now = new Date()) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN || !env.TURN_KEY_ID) return;
  const limit = Number(env.TURN_LIMIT_GB) || TURN_LIMIT_GB;
  const used = await turnEgress(env, now);
  const gb = (used / GB).toFixed(1) + " GB";
  if (used < limit * GB) return console.log("turn usage", gb);
  const response = await cloudflare(
    env,
    "/accounts/" + env.CF_ACCOUNT_ID + "/calls/turn_keys/" + env.TURN_KEY_ID,
    { method: "DELETE" },
  );
  console.log("turn key deleted", gb, response.status);
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
    for (const table of ["piece", "stage"])
      sql.exec(
        "CREATE TABLE IF NOT EXISTS " +
          table +
          " (dev TEXT NOT NULL, i INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (dev, i))",
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

  async touch() {
    const due = Date.now() + ROOM_TTL_MS;
    const current = await this.ctx.storage.getAlarm();
    if (current !== null && current > due - DAY_MS) return;
    await this.ctx.storage.setAlarm(due);
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
      }
      if (this.meta("dev") !== dev) return { code: DENIED };
      return { owner: true };
    }
    if (member) {
      const row = first(
        sql.exec("SELECT h, gone FROM members WHERE dev = ?", dev),
      );
      if (row?.gone) return { code: row.gone === 2 ? PURGED : REMOVED };
      return row && row.h === hash ? {} : { code: DENIED };
    }
    const fresh = newToken();
    const freshHash = await digest(fresh);
    const used = first(sql.exec("SELECT dev FROM invites WHERE h = ?", hash));
    if (!used || (used.dev && used.dev !== dev)) return { code: DENIED };
    const known = first(
      sql.exec("SELECT gone FROM members WHERE dev = ?", dev),
    );
    if (known?.gone && used.dev)
      return { code: known.gone === 2 ? PURGED : REMOVED };
    if (!known || known.gone) {
      const count = first(
        sql.exec("SELECT COUNT(*) AS n FROM members WHERE gone = 0"),
      );
      if (count.n >= MAX_MEMBERS) return { code: DENIED };
    }
    sql.exec("UPDATE invites SET dev = ? WHERE h = ?", dev, hash);
    sql.exec(
      "INSERT INTO members (dev, h, at) VALUES (?, ?, ?) ON CONFLICT (dev) DO UPDATE SET h = excluded.h, gone = 0, label = '', at = excluded.at",
      dev,
      freshHash,
      now,
    );
    return { member: fresh };
  }

  async ice() {
    if (new Set(this.peers().map((p) => p.dev)).size < 2) return null;
    const now = Date.now();
    this.turn ??= JSON.parse(this.meta("turn") ?? "null");
    if (this.turn && this.turn.expires - now > TURN_MIN_LIFE_MS)
      return this.offer(now);
    if (this.retryAt > now || !this.env.TURN_KEY_TOKEN) return null;
    const quota = this.env.QUOTA.get(this.env.QUOTA.idFromName("turn"));
    const daily = Number(this.env.TURN_DAILY) || TURN_DAILY;
    const list = (await quota.take(daily)) ? await turnServers(this.env) : [];
    if (!list.length) {
      this.retryAt = now + TURN_RETRY_MS;
      return null;
    }
    this.turn = { list, expires: now + TURN_TTL_S * 1000 };
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO meta (k, v) VALUES ('turn', ?)",
      JSON.stringify(this.turn),
    );
    return this.offer(now);
  }

  offer(now) {
    return {
      t: "ice",
      ice: this.turn.list,
      life: Math.floor((this.turn.expires - now) / 1000),
    };
  }

  async fetch(request) {
    const params = new URL(request.url).searchParams;
    const dev = params.get("d") ?? "";
    const id = params.get("p") ?? "";
    if (!CLIENT_ID.test(dev) || !CLIENT_ID.test(id))
      return new Response("client", { status: 400 });
    const access = await this.admit(params, dev);
    if (access.code) return refuse(access.code, "denied");
    await this.touch();
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
    const offer = others.length ? await this.ice() : null;
    if (access.member) this.send(server, { t: "member", m: access.member });
    this.send(server, {
      t: "hi",
      id,
      peers: others.map((p) => p.id),
      s: this.shared(),
      ice: offer?.ice ?? [],
      life: offer?.life ?? 0,
    });
    for (const parts of this.snapshots()) {
      if (parts.length > 1) this.send(server, { t: "snap", n: parts.length });
      for (const data of parts) this.send(server, data);
    }
    for (const peer of others) {
      this.send(peer.ws, { t: "join", id });
      if (offer) this.send(peer.ws, offer);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const meta = ws.deserializeAttachment();
    if (!meta) return;
    if (typeof message !== "string") return this.receive(ws, meta, message);
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
    if (input?.t === "ice") {
      const offer = await this.ice();
      if (offer) this.send(ws, offer);
      return;
    }
    if (input?.t === "label") return this.label(meta, input.l);
    if (input?.t === "leave") return this.quit(ws, meta);
    if (input?.t === "snap") return this.expect(ws, meta, input.n);
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
    this.forget(dev);
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
    for (const table of ["snap", "piece", "stage", "invites", "members"])
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

  shared() {
    const sql = this.ctx.storage.sql;
    return (
      first(sql.exec("SELECT 1 AS x FROM invites LIMIT 1")) !== null ||
      first(
        sql.exec(
          "SELECT 1 AS x FROM members WHERE dev != ? LIMIT 1",
          this.meta("dev") ?? "",
        ),
      ) !== null
    );
  }

  snapshots() {
    const sql = this.ctx.storage.sql;
    const out = [];
    for (const row of [...sql.exec("SELECT dev, data FROM snap ORDER BY at")]) {
      const parts = [row.data];
      for (const piece of sql.exec(
        "SELECT data FROM piece WHERE dev = ? ORDER BY i",
        row.dev,
      ))
        parts.push(piece.data);
      out.push(parts);
    }
    return out;
  }

  forget(dev, tables = ["snap", "piece", "stage"]) {
    const sql = this.ctx.storage.sql;
    for (const table of tables)
      sql.exec("DELETE FROM " + table + " WHERE dev = ?", dev);
  }

  expect(ws, meta, n) {
    this.ctx.storage.sql.exec("DELETE FROM stage WHERE dev = ?", meta.dev);
    const up =
      Number.isInteger(n) && n > 1 && n <= MAX_PARTS
        ? { n, got: 0, size: 0, bad: false }
        : null;
    ws.serializeAttachment({ ...meta, up });
  }

  receive(ws, meta, data) {
    const up = meta.up;
    if (!up) return this.store(meta.dev, [data]);
    const sql = this.ctx.storage.sql;
    const size = up.size + data.byteLength;
    const got = up.got + 1;
    const fits =
      !up.bad &&
      data.byteLength > 0 &&
      data.byteLength <= MAX_PART &&
      size <= MAX_SNAPSHOT;
    ws.serializeAttachment({
      ...meta,
      up: got < up.n ? { n: up.n, got, size, bad: !fits } : null,
    });
    if (!fits) {
      if (!up.bad) sql.exec("DELETE FROM stage WHERE dev = ?", meta.dev);
      return;
    }
    sql.exec(
      "INSERT OR REPLACE INTO stage (dev, i, data) VALUES (?, ?, ?)",
      meta.dev,
      up.got,
      data,
    );
    if (got < up.n) return;
    const parts = [
      ...sql.exec("SELECT data FROM stage WHERE dev = ? ORDER BY i", meta.dev),
    ].map((row) => row.data);
    sql.exec("DELETE FROM stage WHERE dev = ?", meta.dev);
    if (parts.length === up.n) return this.store(meta.dev, parts);
  }

  store(dev, parts) {
    if (
      parts.some((data) => data.byteLength === 0 || data.byteLength > MAX_PART)
    )
      return;
    if (!this.shared()) return;
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      sql.exec(
        "INSERT INTO snap (dev, data, at) VALUES (?, ?, ?) ON CONFLICT (dev) DO UPDATE SET data = excluded.data, at = excluded.at",
        dev,
        parts[0],
        Date.now(),
      );
      sql.exec("DELETE FROM piece WHERE dev = ?", dev);
      parts
        .slice(1)
        .forEach((data, at) =>
          sql.exec(
            "INSERT INTO piece (dev, i, data) VALUES (?, ?, ?)",
            dev,
            at + 1,
            data,
          ),
        );
      this.prune();
    });
    return this.touch();
  }

  prune() {
    let used = 0;
    let kept = 0;
    for (const row of [
      ...this.ctx.storage.sql.exec(
        "SELECT dev, length(data) + COALESCE((SELECT SUM(length(data)) FROM piece WHERE piece.dev = snap.dev), 0) AS size FROM snap ORDER BY at DESC",
      ),
    ]) {
      if (kept > 0 && (kept >= MAX_SLOTS || used + row.size > ROOM_BYTES)) {
        this.forget(row.dev, ["snap", "piece"]);
        continue;
      }
      used += row.size;
      kept++;
    }
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
    if (meta.up)
      this.ctx.storage.sql.exec("DELETE FROM stage WHERE dev = ?", meta.dev);
    for (const peer of this.peers())
      if (peer.ws !== ws) this.send(peer.ws, { t: "bye", id: meta.id });
  }

  async alarm() {
    if (this.peers().length) {
      await this.touch();
      return;
    }
    const sql = this.ctx.storage.sql;
    for (const table of [
      "snap",
      "piece",
      "stage",
      "meta",
      "invites",
      "members",
    ])
      sql.exec("DELETE FROM " + table);
  }
}

export class Quota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, n INTEGER NOT NULL)",
    );
  }

  take(limit) {
    const sql = this.ctx.storage.sql;
    const day = new Date().toISOString().slice(0, 10);
    const row = first(sql.exec("SELECT n FROM days WHERE day = ?", day));
    if (row && row.n >= limit) return false;
    sql.exec(
      "INSERT INTO days (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1",
      day,
    );
    sql.exec("DELETE FROM days WHERE day < ?", day);
    return true;
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
  async scheduled(event, env, ctx) {
    ctx.waitUntil(guardTurn(env, new Date(event.scheduledTime)));
  },
};
