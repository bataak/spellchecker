export type SignalEvent =
  | {
      readonly t: "hi";
      readonly id: string;
      readonly peers: string[];
      readonly shared: boolean;
      readonly ice: RTCIceServer[];
      readonly life: number;
    }
  | {
      readonly t: "ice";
      readonly ice: RTCIceServer[];
      readonly life: number;
    }
  | { readonly t: "join"; readonly id: string }
  | { readonly t: "bye"; readonly id: string }
  | { readonly t: "from"; readonly from: string; readonly d: string }
  | { readonly t: "kick"; readonly id: string }
  | { readonly t: "member"; readonly m: string }
  | { readonly t: "invited"; readonly i: string }
  | { readonly t: "ended" }
  | { readonly t: "members"; readonly list: RosterEntry[] };

export interface RosterEntry {
  readonly dev: string;
  readonly label: string;
  readonly online: boolean;
  readonly owner: boolean;
}

export type SignalState =
  | "connecting"
  | "open"
  | "closed"
  | "full"
  | "denied"
  | "removed"
  | "ended"
  | "wiped"
  | "purged";

export const DENIED_CODE = 4003;
export const REMOVED_CODE = 4004;
export const ENDED_CODE = 4005;
export const WIPED_CODE = 4006;
export const PURGED_CODE = 4007;
export const FULL_CODE = 4009;
const FINAL: Partial<Record<number, SignalState>> = {
  [DENIED_CODE]: "denied",
  [REMOVED_CODE]: "removed",
  [ENDED_CODE]: "ended",
  [WIPED_CODE]: "wiped",
  [PURGED_CODE]: "purged",
  [FULL_CODE]: "full",
};
export function finalState(code: number): SignalState | undefined {
  return FINAL[code];
}

export const SNAPSHOT_PART = 1000 * 1024;
const MAX_PARTS = 16;
export const isText = (value: unknown): value is string =>
  typeof value === "string";

function parseRoster(list: unknown[]): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    if (!isText(v.dev)) continue;
    out.push({
      dev: v.dev,
      label: isText(v.l) ? v.l : "",
      online: v.on === true,
      owner: v.o === true,
    });
  }
  return out;
}

const ICE_URL = /^(stun|turns?):[^\s]+$/;
const DNS_PORT = /:53(\?|$)/;

function parseIce(list: unknown): RTCIceServer[] {
  if (!Array.isArray(list)) return [];
  const out: RTCIceServer[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const raw: unknown[] = Array.isArray(v.urls) ? v.urls : [v.urls];
    const urls = raw.filter(
      (url): url is string =>
        isText(url) && ICE_URL.test(url) && !DNS_PORT.test(url),
    );
    if (!urls.length) continue;
    out.push(
      isText(v.username) && isText(v.credential)
        ? { urls, username: v.username, credential: v.credential }
        : { urls },
    );
  }
  return out;
}

function lifeOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function parseSignal(raw: string): SignalEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  return parseEvent(value as Record<string, unknown>);
}

function parseAccessEvent(v: Record<string, unknown>): SignalEvent | null {
  if (v.t === "member" && isText(v.m)) return { t: "member", m: v.m };
  if (v.t === "invited" && isText(v.i)) return { t: "invited", i: v.i };
  if (v.t === "ended") return { t: "ended" };
  if (v.t === "members" && Array.isArray(v.list))
    return { t: "members", list: parseRoster(v.list) };
  return null;
}

function parseEvent(v: Record<string, unknown>): SignalEvent | null {
  if (v.t === "hi" && isText(v.id) && Array.isArray(v.peers))
    return {
      t: "hi",
      id: v.id,
      peers: v.peers.filter(isText),
      shared: v.s === true,
      ice: parseIce(v.ice),
      life: lifeOf(v.life),
    };
  if (v.t === "ice")
    return { t: "ice", ice: parseIce(v.ice), life: lifeOf(v.life) };
  if ((v.t === "join" || v.t === "bye" || v.t === "kick") && isText(v.id))
    return { t: v.t, id: v.id };
  if (v.t === "from" && isText(v.from) && isText(v.d))
    return { t: "from", from: v.from, d: v.d };
  return parseAccessEvent(v);
}

export function finalCode(raw: string): number | null {
  if (!raw.startsWith('{"t":"final"')) return null;
  try {
    const value = JSON.parse(raw) as { code?: unknown };
    return typeof value.code === "number" ? value.code : null;
  } catch {
    return null;
  }
}

export function snapshotParts(raw: string): number | null {
  if (!raw.startsWith('{"t":"snap"')) return null;
  try {
    const { n } = JSON.parse(raw) as { n?: unknown };
    return Number.isInteger(n) &&
      (n as number) > 1 &&
      (n as number) <= MAX_PARTS
      ? (n as number)
      : null;
  } catch {
    return null;
  }
}

export function splitSnapshot(data: Uint8Array): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let at = 0; at < data.byteLength; at += SNAPSHOT_PART)
    parts.push(data.subarray(at, at + SNAPSHOT_PART));
  return parts.length ? parts : [data];
}

export function joinParts(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(
    parts.reduce((size, part) => size + part.byteLength, 0),
  );
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}
