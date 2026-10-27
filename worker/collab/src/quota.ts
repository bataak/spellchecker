import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types.ts";
import { first } from "./util.ts";

export class Quota extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, n INTEGER NOT NULL)",
    );
  }

  take(limit: number): boolean {
    const sql = this.ctx.storage.sql;
    const day = new Date().toISOString().slice(0, 10);
    const row = first(
      sql.exec<{ n: number }>("SELECT n FROM days WHERE day = ?", day),
    );
    if (row && row.n >= limit) return false;
    sql.exec(
      "INSERT INTO days (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1",
      day,
    );
    sql.exec("DELETE FROM days WHERE day < ?", day);
    return true;
  }

  give(): void {
    const day = new Date().toISOString().slice(0, 10);
    this.ctx.storage.sql.exec(
      "UPDATE days SET n = n - 1 WHERE day = ? AND n > 0",
      day,
    );
  }
}
