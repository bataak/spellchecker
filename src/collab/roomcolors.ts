import type * as Y from "yjs";
import { createEmitter } from "../core/emitter.ts";
import { CURSOR_COLORS, CURSOR_HUES } from "./peercolors.ts";
import type { Profile } from "./profile.ts";

export interface ColorClaim {
  readonly c: number;
  readonly a: number;
  readonly s?: number;
}

export interface RoomColors {
  profile(): Profile;
  colorOf(key: string): number | null;
  forget(key: string): void;
  onChange(listener: () => void): () => void;
  destroy(): void;
}

const COLORS = "colors";
const MAX_KEY = 32;
const DAY_MS = 86_400_000;
export const STALE_MS = 30 * DAY_MS;
export const PRUNE_MS = 90 * DAY_MS;

function validClaim(value: unknown): value is ColorClaim {
  if (!value || typeof value !== "object") return false;
  const { c, a, s } = value as Partial<ColorClaim>;
  return (
    Number.isInteger(c) &&
    c! >= 0 &&
    c! < CURSOR_COLORS.length &&
    Number.isFinite(a) &&
    (s === undefined || Number.isFinite(s))
  );
}

function before(a: [string, ColorClaim], b: [string, ColorClaim]): boolean {
  return a[1].a !== b[1].a ? a[1].a < b[1].a : a[0] < b[0];
}

export function pickColor(
  claims: ReadonlyMap<string, ColorClaim>,
  me: string,
  wanted: number,
): number {
  const mine = claims.get(me);
  const others = [...claims].filter(([key]) => key !== me);
  if (
    mine &&
    !others.some((other) => other[1].c === mine.c && before(other, [me, mine]))
  )
    return mine.c;
  const counts = CURSOR_COLORS.map(() => 0);
  for (const [, claim] of others) counts[claim.c]!++;
  const least = Math.min(...counts);
  const start = Math.abs(wanted) % CURSOR_COLORS.length;
  const used = others.map(([, claim]) => CURSOR_HUES[claim.c]!);
  let best = start;
  let bestGap = -1;
  for (let step = 0; step < counts.length; step++) {
    const color = (start + step) % counts.length;
    if (counts[color] !== least) continue;
    const gap = Math.min(
      360,
      ...used.map((hue) => hueGap(hue, CURSOR_HUES[color]!)),
    );
    if (gap > bestGap) {
      best = color;
      bestGap = gap;
    }
  }
  return best;
}

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const seenAt = (claim: ColorClaim): number => claim.s ?? claim.a;

function claimsOf(map: Y.Map<unknown>, since = -Infinity) {
  const out = new Map<string, ColorClaim>();
  map.forEach((value, key) => {
    if (key.length <= MAX_KEY && validClaim(value) && seenAt(value) >= since)
      out.set(key, value);
  });
  return out;
}

function prune(map: Y.Map<unknown>, me: string, now: number): void {
  const old: string[] = [];
  map.forEach((value, key) => {
    if (key === me) return;
    if (!validClaim(value) || seenAt(value) < now - PRUNE_MS) old.push(key);
  });
  if (!old.length) return;
  const run = (): void => old.forEach((key) => map.delete(key));
  if (map.doc) map.doc.transact(run);
  else run();
}

export function createRoomColors(
  doc: Y.Doc,
  me: string,
  base: () => Profile,
): RoomColors {
  const map = doc.getMap<unknown>(COLORS);
  const changed = createEmitter();
  let color: number | null = null;
  const settle = (): void => {
    const now = Date.now();
    prune(map, me, now);
    const claims = claimsOf(map, now - STALE_MS);
    const next = pickColor(claims, me, base().color);
    const mine = claimsOf(map).get(me);
    if (mine?.c !== next) map.set(me, { c: next, a: now, s: now });
    else if (seenAt(mine) < now - DAY_MS) map.set(me, { ...mine, s: now });
    if (next === color) return;
    color = next;
    changed.emit();
  };
  const observer = (): void => settle();
  map.observe(observer);
  settle();
  return {
    profile: () => ({ ...base(), color: color ?? base().color }),
    colorOf: (key) => claimsOf(map).get(key)?.c ?? null,
    forget: (key) => void (key !== me && map.delete(key)),
    onChange: changed.on,
    destroy() {
      map.unobserve(observer);
      changed.clear();
    },
  };
}
