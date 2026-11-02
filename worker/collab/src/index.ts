import { allowedOrigin } from "../../shared/origin.ts";
import { accessToken } from "./admission.ts";
import { CLIENT_ID, DENIED, ROOM_ID } from "./limits.ts";
import { lookup } from "./links.ts";
import { guardTurn } from "./turn.ts";
import type { Env } from "./types.ts";
import { refuse } from "./util.ts";

export { Links } from "./links.ts";
export { Quota } from "./quota.ts";
export { Room } from "./room.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request.headers.get("Origin"), env);
    if (!origin) return new Response("origin", { status: 403 });
    const url = new URL(request.url);
    const short = /^\/j\/([^/]+)$/.exec(url.pathname);
    if (short) return lookup(request, env, short[1]!);
    const match = /^\/room\/([^/]+)$/.exec(url.pathname);
    if (!match || !ROOM_ID.test(match[1]!))
      return new Response("route", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("upgrade", { status: 426 });
    const params = url.searchParams;
    if (
      !CLIENT_ID.test(params.get("d") ?? "") ||
      !CLIENT_ID.test(params.get("p") ?? "")
    )
      return new Response("client", { status: 400 });
    if (!accessToken(params)) return refuse(DENIED, "denied");
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
