import type { Mesh } from "./mesh.ts";
import type { Signal } from "./signal.ts";

const STUN: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
const MARGIN_S = 20 * 60;
const MIN_MS = 60_000;
const RETRY_MS = 5 * 60_000;

export interface IceOffer {
  readonly ice: RTCIceServer[];
  readonly life: number;
}

export interface IceKeeper {
  servers(): RTCIceServer[];
  take(offer: IceOffer): void;
  stop(): void;
}

export function iceRefreshMs(life: number): number {
  return Math.max(MIN_MS, (life - MARGIN_S) * 1000);
}

interface IceParts {
  readonly signal: Pick<Signal, "command">;
  readonly mesh: Pick<Mesh, "refresh">;
}

export function createIceKeeper(parts: () => IceParts): IceKeeper {
  let servers = STUN;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ask = (): void => {
    parts().signal.command({ t: "ice" });
    timer = setTimeout(ask, RETRY_MS);
  };
  return {
    servers: () => servers,
    take({ ice, life }) {
      if (!ice.length || !life) return;
      servers = ice;
      parts().mesh.refresh();
      if (timer) clearTimeout(timer);
      timer = setTimeout(ask, iceRefreshMs(life));
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
