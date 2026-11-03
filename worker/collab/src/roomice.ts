import {
  TURN_DAILY,
  TURN_MIN_LIFE_MS,
  TURN_RETRY_MS,
  TURN_TTL_S,
} from "./limits.ts";
import { turnServers } from "./turn.ts";
import type { Env, Offer, Turn } from "./types.ts";
import { readMeta } from "./util.ts";

function offerOf(turn: Turn, now: number): Offer {
  return {
    t: "ice",
    ice: turn.list,
    life: Math.floor((turn.expires - now) / 1000),
  };
}

export class RoomIce {
  private turn: Turn | null = null;
  private retryAt = 0;
  private readonly sql: SqlStorage;
  private readonly env: Env;

  constructor(sql: SqlStorage, env: Env) {
    this.sql = sql;
    this.env = env;
  }

  cached(now: number): Offer | null {
    this.turn ??= JSON.parse(
      readMeta(this.sql, "turn") ?? "null",
    ) as Turn | null;
    return this.turn && this.turn.expires - now > TURN_MIN_LIFE_MS
      ? offerOf(this.turn, now)
      : null;
  }

  async request(): Promise<Offer | null> {
    const now = Date.now();
    const cached = this.cached(now);
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
    this.sql.exec(
      "INSERT OR REPLACE INTO meta (k, v) VALUES ('turn', ?)",
      JSON.stringify(turn),
    );
    return offerOf(turn, now);
  }
}
