import type { OriginEnv } from "../../shared/origin.ts";
import type { Links } from "./links.ts";
import type { Quota } from "./quota.ts";
import type { Room } from "./room.ts";

export interface Env extends OriginEnv {
  readonly ROOMS: DurableObjectNamespace<Room>;
  readonly QUOTA: DurableObjectNamespace<Quota>;
  readonly LINKS?: DurableObjectNamespace<Links>;
  readonly TURN_KEY_ID?: string;
  readonly TURN_KEY_TOKEN?: string;
  readonly TURN_DAILY?: string;
  readonly TURN_LIMIT_GB?: string;
  readonly CF_ACCOUNT_ID?: string;
  readonly CF_API_TOKEN?: string;
}

export interface Upload {
  readonly n: number;
  readonly got: number;
  readonly size: number;
  readonly bad: boolean;
}

export interface PeerMeta {
  readonly id: string;
  readonly dev: string;
  readonly owner: boolean;
  readonly up?: Upload | null;
}

export interface Peer {
  readonly ws: WebSocket;
  readonly id: string;
  readonly dev: string;
  readonly owner: boolean;
}

export interface Access {
  readonly code?: number;
  readonly owner?: boolean;
  readonly member?: string;
}

export interface Turn {
  readonly list: unknown[];
  readonly expires: number;
}

export interface Offer {
  readonly t: "ice";
  readonly ice: unknown[];
  readonly life: number;
}

export type Crowd =
  | { readonly code: number; readonly reason: string }
  | {
      readonly code?: undefined;
      readonly others: Peer[];
      readonly replaced: Peer[];
    };
