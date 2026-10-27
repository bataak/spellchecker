import { MAX_INVITES } from "./limits.ts";
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types.ts";
import { first } from "./util.ts";

const CODE = /^[A-Za-z0-9_-]{8}$/;
const LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_NAME = 600;

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export class Links extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, room TEXT NOT NULL, invite TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL)",
    );
  }

  put(room: string, invite: string, name: string): string | null {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    sql.exec("DELETE FROM codes WHERE at < ?", now - LINK_TTL_MS);
    const label =
      typeof name === "string" && name.length <= MAX_NAME ? name : "";
    for (let tries = 0; tries < 4; tries++) {
      const code = newCode();
      if (first(sql.exec("SELECT 1 AS x FROM codes WHERE code = ?", code)))
        continue;
      sql.exec(
        "INSERT INTO codes (code, room, invite, name, at) VALUES (?, ?, ?, ?, ?)",
        code,
        room,
        invite,
        label,
        now,
      );
      sql.exec(
        "DELETE FROM codes WHERE room = ? AND code NOT IN (SELECT code FROM codes WHERE room = ? ORDER BY at DESC, rowid DESC LIMIT ?)",
        room,
        room,
        MAX_INVITES,
      );
      return code;
    }
    return null;
  }

  get(code: string): { room: string; invite: string; name: string } | null {
    if (!CODE.test(code)) return null;
    const row = first(
      this.ctx.storage.sql.exec<{
        room: string;
        invite: string;
        name: string;
        at: number;
      }>("SELECT room, invite, name, at FROM codes WHERE code = ?", code),
    );
    if (!row || row.at < Date.now() - LINK_TTL_MS) return null;
    return { room: row.room, invite: row.invite, name: row.name };
  }

  dropRoom(room: string): void {
    this.ctx.storage.sql.exec("DELETE FROM codes WHERE room = ?", room);
  }
}

export async function lookup(
  request: Request,
  env: Env,
  code: string,
): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket")
    return new Response("upgrade", { status: 426 });
  if (!CODE.test(code) || !env.LINKS)
    return new Response("code", { status: 404 });
  const found = await env.LINKS.get(env.LINKS.idFromName("links")).get(code);
  const [client, server] = Object.values(new WebSocketPair()) as [
    WebSocket,
    WebSocket,
  ];
  server.accept();
  server.send(JSON.stringify(found ? { t: "link", ...found } : { t: "link" }));
  server.close(1000, "done");
  return new Response(null, { status: 101, webSocket: client });
}
