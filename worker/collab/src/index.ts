import { allowedOrigin } from "../../shared/origin.ts";
import { ROOM_ID } from "./limits.ts";
import { lookup } from "./links.ts";
import { guardTurn } from "./turn.ts";
import type { Env } from "./types.ts";

export { Links } from "./links.ts";
export { Quota } from "./quota.ts";
export { Room } from "./room.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request.headers.get("Origin"), env);
    if (!origin) return new Response("origin", { status: 403 });
    const path = new URL(request.url).pathname;
    const short = /^\/j\/([^/]+)$/.exec(path);
    if (short) return lookup(request, env, short[1]!);
    const match = /^\/room\/([^/]+)$/.exec(path);
    if (!match || !ROOM_ID.test(match[1]!))
      return new Response("route", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("upgrade", { status: 426 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(match[1]!));
    return room.fetch(request);
  },
  async scheduled(
    event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(guardTurn(env, new Date(event.scheduledTime)));
  },
};
