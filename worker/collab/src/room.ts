import {
  CLIENT_ID,
  TOKEN,
  MAX_PEERS,
  MAX_INVITES,
  MAX_LABEL,
  DENIED,
  REMOVED,
  ENDED,
  WIPED,
  PURGED,
  FULL,
  DAY_MS,
  ROOM_TTL_MS,
  TURN_TTL_S,
  TURN_MIN_LIFE_MS,
  TURN_DAILY,
  TURN_RETRY_MS,
} from "./limits.ts";
import { DurableObject } from "cloudflare:workers";
import { admit } from "./admission.ts";
import type { Links } from "./links.ts";
import {
  expect,
  fitsStore,
  forget,
  receive,
  snapshots,
  store,
} from "./snapshots.ts";
import { turnServers } from "./turn.ts";
import type {
  Access,
  Crowd,
  Env,
  Offer,
  Peer,
  PeerMeta,
  Turn,
} from "./types.ts";
import {
  digest,
  first,
  parseSignal,
  readMeta,
  refuse,
  type Signal,
} from "./util.ts";

export class Room extends DurableObject<Env> {
  turn: Turn | null = null;
  retryAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
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

  peers(): Peer[] {
    const out: Peer[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as PeerMeta | null;
      if (meta) out.push({ ws, id: meta.id, dev: meta.dev, owner: meta.owner });
    }
    return out;
  }

  send(ws: WebSocket, message: ArrayBuffer | object): void {
    try {
      ws.send(
        message instanceof ArrayBuffer ? message : JSON.stringify(message),
      );
    } catch {
      return;
    }
  }

  meta(key: string): string | null {
    return readMeta(this.ctx.storage.sql, key);
  }

  async touch(): Promise<void> {
    const due = Date.now() + ROOM_TTL_MS;
    const current = await this.ctx.storage.getAlarm();
    if (current !== null && current > due - DAY_MS) return;
    await this.ctx.storage.setAlarm(due);
  }

  cachedIce(now: number): Offer | null {
    this.turn ??= JSON.parse(this.meta("turn") ?? "null") as Turn | null;
    return this.turn && this.turn.expires - now > TURN_MIN_LIFE_MS
      ? this.offer(this.turn, now)
      : null;
  }

  async ice(): Promise<Offer | null> {
    if (new Set(this.peers().map((p) => p.dev)).size < 2) return null;
    const now = Date.now();
    const cached = this.cachedIce(now);
    if (cached) return cached;
    if (this.retryAt > now || !this.env.TURN_KEY_TOKEN) return null;
    const quota = this.env.QUOTA.get(this.env.QUOTA.idFromName("turn"));
    const daily = Number(this.env.TURN_DAILY) || TURN_DAILY;
    const taken = await quota.take(daily);
    const list = taken ? await turnServers(this.env) : [];
    if (!list.length) {
      if (taken) await quota.give();
      this.retryAt = now + TURN_RETRY_MS;
      return null;
    }
    const turn = { list, expires: now + TURN_TTL_S * 1000 };
    this.turn = turn;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO meta (k, v) VALUES ('turn', ?)",
      JSON.stringify(turn),
    );
    return this.offer(turn, now);
  }

  offer(turn: Turn, now: number): Offer {
    return {
      t: "ice",
      ice: turn.list,
      life: Math.floor((turn.expires - now) / 1000),
    };
  }

  roomId(): string | null {
    return this.meta("room");
  }

  links(): DurableObjectStub<Links> | null {
    return this.env.LINKS?.get(this.env.LINKS.idFromName("links")) ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.remember(url.pathname.split("/")[2]);
    const params = url.searchParams;
    const dev = params.get("d") ?? "";
    const id = params.get("p") ?? "";
    if (!CLIENT_ID.test(dev) || !CLIENT_ID.test(id))
      return new Response("client", { status: 400 });
    const early = this.crowd(id, dev);
    if (early.code !== undefined) return refuse(early.code, early.reason);
    const access = await admit(this.ctx.storage.sql, params, dev);
    if (access.code) return refuse(access.code, "denied");
    await this.touch();
    const crowd = this.crowd(id, dev);
    if (crowd.code !== undefined) return refuse(crowd.code, crowd.reason);
    for (const peer of crowd.replaced) {
      peer.ws.serializeAttachment(null);
      peer.ws.close(1000, "replaced");
    }
    return this.join(id, dev, access, crowd.others);
  }

  remember(name: string | undefined): void {
    if (name && !this.roomId())
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO meta (k, v) VALUES ('room', ?)",
        name,
      );
  }

  join(id: string, dev: string, access: Access, others: Peer[]): Response {
    const [client, server] = Object.values(new WebSocketPair()) as [
      WebSocket,
      WebSocket,
    ];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, dev, owner: access.owner === true });
    const offer = others.length ? this.cachedIce(Date.now()) : null;
    if (access.member) this.send(server, { t: "member", m: access.member });
    this.send(server, {
      t: "hi",
      id,
      peers: others.map((p) => p.id),
      s: this.shared(),
      ice: offer?.ice ?? [],
      life: offer?.life ?? 0,
    });
    for (const parts of snapshots(this.ctx.storage.sql)) {
      if (parts.length > 1) this.send(server, { t: "snap", n: parts.length });
      for (const data of parts) this.send(server, data);
    }
    for (const peer of others) {
      this.send(peer.ws, { t: "join", id });
      if (offer) this.send(peer.ws, offer);
    }
    if (others.length && !offer) this.ctx.waitUntil(this.shareIce());
    return new Response(null, { status: 101, webSocket: client });
  }

  crowd(id: string, dev: string): Crowd {
    const others: Peer[] = [];
    const replaced: Peer[] = [];
    for (const peer of this.peers())
      (peer.id === id ? replaced : others).push(peer);
    if (replaced.some((peer) => peer.dev !== dev))
      return { code: DENIED, reason: "denied" };
    if (others.length >= MAX_PEERS) return { code: FULL, reason: "full" };
    return { others, replaced };
  }

  async shareIce(): Promise<void> {
    try {
      const offer = await this.ice();
      if (offer) for (const peer of this.peers()) this.send(peer.ws, offer);
    } catch {
      return;
    }
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const meta = ws.deserializeAttachment() as PeerMeta | null;
    if (!meta) return;
    if (typeof message !== "string") return this.receive(ws, meta, message);
    const input = parseSignal(message);
    if (!input || (await this.peerMessage(ws, meta, input))) return;
    if (meta.owner) return this.ownerMessage(ws, input);
  }

  async peerMessage(
    ws: WebSocket,
    meta: PeerMeta,
    input: Signal,
  ): Promise<boolean> {
    switch (input.t) {
      case "to":
        this.relay(meta, input);
        return true;
      case "ice": {
        const offer = await this.ice();
        if (offer) this.send(ws, offer);
        return true;
      }
      case "label":
        this.label(meta, input.l);
        return true;
      case "leave":
        this.quit(ws, meta);
        return true;
      case "snap":
        expect(this.ctx.storage.sql, ws, meta, input.n);
        return true;
    }
    return false;
  }

  ownerMessage(ws: WebSocket, input: Signal): Promise<void> | void {
    switch (input.t) {
      case "invite":
        return this.invite(ws, input.i, input.n);
      case "members":
        return this.send(ws, this.roster());
      case "remove":
        return this.remove(ws, input.dev, input.wipe === true);
      case "close":
        return this.end(ws, input.wipe === true);
    }
  }

  relay(meta: PeerMeta, input: Signal): void {
    if (typeof input.d !== "string") return;
    const target = this.peers().find((p) => p.id === input.to);
    if (target) this.send(target.ws, { t: "from", from: meta.id, d: input.d });
  }

  label(meta: PeerMeta, label: unknown): void {
    if (typeof label !== "string" || label.length > MAX_LABEL) return;
    this.ctx.storage.sql.exec(
      "UPDATE members SET label = ? WHERE dev = ? AND gone = 0",
      label,
      meta.dev,
    );
  }

  quit(ws: WebSocket, meta: PeerMeta): void {
    if (!meta.owner)
      this.ctx.storage.sql.exec("DELETE FROM members WHERE dev = ?", meta.dev);
    ws.close(1000, "left");
    this.leave(ws);
  }

  async invite(ws: WebSocket, token: unknown, name: unknown): Promise<void> {
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
    const links = this.links();
    const room = this.roomId();
    const code =
      links && room
        ? await links.put(room, token, typeof name === "string" ? name : "")
        : null;
    this.send(
      ws,
      code ? { t: "invited", i: token, c: code } : { t: "invited", i: token },
    );
  }

  roster(): object {
    const online = new Set(this.peers().map((p) => p.dev));
    const owner = this.meta("dev");
    const list: object[] = [];
    for (const row of this.ctx.storage.sql.exec<{
      dev: string;
      label: string;
      at: number;
    }>("SELECT dev, label, at FROM members WHERE gone = 0 ORDER BY at"))
      list.push({
        dev: row.dev,
        l: row.label,
        at: row.at,
        on: online.has(row.dev),
        o: row.dev === owner,
      });
    return { t: "members", list };
  }

  remove(ws: WebSocket, dev: unknown, wipe: boolean): void {
    if (typeof dev !== "string" || dev === this.meta("dev")) return;
    this.ctx.storage.sql.exec(
      "UPDATE members SET gone = ?, h = '', label = '' WHERE dev = ?",
      wipe ? 2 : 1,
      dev,
    );
    forget(this.ctx.storage.sql, dev);
    const peers = this.peers();
    for (const peer of peers) {
      if (peer.dev !== dev) continue;
      this.evict(peer.ws, wipe ? PURGED : REMOVED);
      for (const other of peers)
        if (other.dev !== dev) this.send(other.ws, { t: "kick", id: peer.id });
    }
    this.send(ws, this.roster());
  }

  end(ws: WebSocket, wipe: boolean): Promise<void> {
    const sql = this.ctx.storage.sql;
    for (const table of ["snap", "piece", "stage", "invites", "members"])
      sql.exec("DELETE FROM " + table);
    sql.exec(
      "INSERT OR REPLACE INTO meta (k, v) VALUES ('closed', ?)",
      String(wipe ? WIPED : ENDED),
    );
    this.dropLinks();
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

  evict(ws: WebSocket, code: number): void {
    this.send(ws, { t: "final", code });
    ws.serializeAttachment(null);
    ws.close(code, "final");
  }

  shared(): boolean {
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

  receive(
    ws: WebSocket,
    meta: PeerMeta,
    data: ArrayBuffer,
  ): Promise<void> | undefined {
    const parts = receive(this.ctx.storage.sql, ws, meta, data);
    if (parts) return this.store(meta.dev, parts);
  }

  store(dev: string, parts: ArrayBuffer[]): Promise<void> | undefined {
    if (!fitsStore(parts) || !this.shared()) return;
    store(this.ctx.storage, dev, parts);
    return this.touch();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  leave(ws: WebSocket): void {
    const meta = ws.deserializeAttachment() as PeerMeta | null;
    ws.serializeAttachment(null);
    if (!meta) return;
    if (meta.up)
      this.ctx.storage.sql.exec("DELETE FROM stage WHERE dev = ?", meta.dev);
    for (const peer of this.peers())
      if (peer.ws !== ws) this.send(peer.ws, { t: "bye", id: meta.id });
  }

  dropLinks(): void {
    const links = this.links();
    const room = this.roomId();
    if (links && room) this.ctx.waitUntil(links.dropRoom(room));
  }

  async alarm(): Promise<void> {
    if (this.peers().length) {
      await this.touch();
      return;
    }
    this.dropLinks();
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
