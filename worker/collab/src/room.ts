import { DENIED_CODE, FULL_CODE } from "../../shared/protocol.ts";
import { DAY_MS, MAX_LABEL, MAX_PEERS, ROOM_TTL_MS } from "./limits.ts";
import { DurableObject } from "cloudflare:workers";
import { admit } from "./admission.ts";
import type { Links } from "./links.ts";
import { RoomIce } from "./roomice.ts";
import {
  endRoom,
  invite,
  removeMember,
  roster,
  type RoomHost,
} from "./roomowner.ts";
import { clearContent, createTables, isShared } from "./roomstore.ts";
import { expect, fitsStore, receive, snapshots, store } from "./snapshots.ts";
import type { Access, Crowd, Env, Offer, Peer, PeerMeta } from "./types.ts";
import { parseSignal, readMeta, refuse, type Signal } from "./util.ts";

export class Room extends DurableObject<Env> implements RoomHost {
  readonly sql: SqlStorage;
  private readonly iceBroker: RoomIce;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.iceBroker = new RoomIce(this.sql, env);
    createTables(this.sql);
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

  async touch(): Promise<void> {
    const due = Date.now() + ROOM_TTL_MS;
    const current = await this.ctx.storage.getAlarm();
    if (current !== null && current > due - DAY_MS) return;
    await this.ctx.storage.setAlarm(due);
  }

  async ice(): Promise<Offer | null> {
    if (new Set(this.peers().map((p) => p.dev)).size < 2) return null;
    return this.iceBroker.request();
  }

  roomId(): string | null {
    return readMeta(this.sql, "room");
  }

  links(): DurableObjectStub<Links> | null {
    return this.env.LINKS?.get(this.env.LINKS.idFromName("links")) ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const params = url.searchParams;
    const dev = params.get("d") ?? "";
    const id = params.get("p") ?? "";
    const early = this.crowd(id, dev);
    if (early.code !== undefined) return refuse(early.code, early.reason);
    const access = await admit(this.sql, params, dev);
    if (access.code) return refuse(access.code, "denied");
    this.remember(url.pathname.split("/")[2]);
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
      this.sql.exec(
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
    const offer = others.length ? this.iceBroker.cached(Date.now()) : null;
    if (access.member) this.send(server, { t: "member", m: access.member });
    this.send(server, {
      t: "hi",
      id,
      peers: others.map((p) => p.id),
      s: isShared(this.sql),
      ice: offer?.ice ?? [],
      life: offer?.life ?? 0,
    });
    for (const parts of snapshots(this.sql)) {
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
      return { code: DENIED_CODE, reason: "denied" };
    if (others.length >= MAX_PEERS) return { code: FULL_CODE, reason: "full" };
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
        expect(this.sql, ws, meta, input.n);
        return true;
    }
    return false;
  }

  ownerMessage(ws: WebSocket, input: Signal): Promise<void> | void {
    switch (input.t) {
      case "invite":
        return invite(this, ws, input.i, input.n);
      case "members":
        return this.send(ws, roster(this));
      case "remove":
        return removeMember(this, ws, input.dev, input.wipe === true);
      case "close":
        return endRoom(this, ws, input.wipe === true);
    }
  }

  relay(meta: PeerMeta, input: Signal): void {
    if (typeof input.d !== "string") return;
    const target = this.peers().find((p) => p.id === input.to);
    if (target) this.send(target.ws, { t: "from", from: meta.id, d: input.d });
  }

  label(meta: PeerMeta, label: unknown): void {
    if (typeof label !== "string" || label.length > MAX_LABEL) return;
    this.sql.exec(
      "UPDATE members SET label = ? WHERE dev = ? AND gone = 0",
      label,
      meta.dev,
    );
  }

  quit(ws: WebSocket, meta: PeerMeta): void {
    if (!meta.owner)
      this.sql.exec("DELETE FROM members WHERE dev = ?", meta.dev);
    ws.close(1000, "left");
    this.leave(ws);
  }

  evict(ws: WebSocket, code: number): void {
    this.send(ws, { t: "final", code });
    ws.serializeAttachment(null);
    ws.close(code, "final");
  }

  receive(
    ws: WebSocket,
    meta: PeerMeta,
    data: ArrayBuffer,
  ): Promise<void> | undefined {
    const parts = receive(this.sql, ws, meta, data);
    if (parts) return this.store(meta.dev, parts);
  }

  store(dev: string, parts: ArrayBuffer[]): Promise<void> | undefined {
    if (!fitsStore(parts) || !isShared(this.sql)) return;
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
    if (meta.up) this.sql.exec("DELETE FROM stage WHERE dev = ?", meta.dev);
    for (const peer of this.peers())
      if (peer.ws !== ws) this.send(peer.ws, { t: "bye", id: meta.id });
  }

  dropLinks(): void {
    const links = this.links();
    const room = this.roomId();
    if (links && room) this.ctx.waitUntil(links.dropRoom(room));
  }

  alarm(): Promise<void> {
    return this.sweep();
  }

  async sweep(): Promise<void> {
    if (this.peers().length) {
      await this.touch();
      return;
    }
    this.dropLinks();
    clearContent(this.sql);
    this.sql.exec("DELETE FROM meta WHERE k <> 'closed'");
  }
}
