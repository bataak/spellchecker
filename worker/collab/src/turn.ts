import { TURN_TTL_S, TURN_WAIT_MS, GB, TURN_LIMIT_GB } from "./limits.ts";
import type { Env } from "./types.ts";

export async function turnServers(env: Env): Promise<unknown[]> {
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
    const body = await response.json<{ iceServers?: unknown }>();
    return Array.isArray(body?.iceServers) ? body.iceServers : [];
  } catch {
    return [];
  }
}

function cloudflare(
  env: Env,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch("https://api.cloudflare.com/client/v4" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + env.CF_API_TOKEN,
      "Content-Type": "application/json",
    },
  });
}

interface EgressReply {
  readonly errors?: { readonly message: string }[];
  readonly data?: {
    readonly viewer?: {
      readonly accounts?: {
        readonly callsTurnUsageAdaptiveGroups?: {
          readonly sum?: { readonly egressBytes?: number };
        }[];
      }[];
    };
  };
}

async function turnEgress(env: Env, now: Date): Promise<number> {
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
  const body = await response.json<EgressReply>();
  if (body.errors?.length)
    throw new Error("graphql " + body.errors[0]!.message);
  const groups =
    body.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups ?? [];
  return groups.reduce(
    (total, group) => total + (group.sum?.egressBytes ?? 0),
    0,
  );
}

export async function guardTurn(env: Env, now = new Date()): Promise<void> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN || !env.TURN_KEY_ID) return;
  const limit = Number(env.TURN_LIMIT_GB) || TURN_LIMIT_GB;
  const used = await turnEgress(env, now);
  const gb = (used / GB).toFixed(1) + " GB";
  if (used < limit * GB) {
    console.log("turn usage", gb);
    return;
  }
  const response = await cloudflare(
    env,
    "/accounts/" + env.CF_ACCOUNT_ID + "/calls/turn_keys/" + env.TURN_KEY_ID,
    { method: "DELETE" },
  );
  console.log("turn key deleted", gb, response.status);
}
