import type * as Y from "yjs";
import { createEmitter } from "../core/emitter.ts";
import { CURSOR_COLORS, CURSOR_HUES } from "./peercolors.ts";
import { NAMES, type Profile } from "./profile.ts";

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

type Claims = ReadonlyMap<string, ColorClaim>;
type Gap = ((a: number, b: number) => number) | null;

const MAX_KEY = 32;
const DAY_MS = 86_400_000;
export const STALE_MS = 30 * DAY_MS;
export const PRUNE_MS = 90 * DAY_MS;

function validClaim(value: unknown, count: number): value is ColorClaim {
  if (!value || typeof value !== "object") return false;
  const { c, a, s } = value as Partial<ColorClaim>;
  return (
    Number.isInteger(c) &&
    c! >= 0 &&
    c! < count &&
    Number.isFinite(a) &&
    (s === undefined || Number.isFinite(s))
  );
}

function before(a: [string, ColorClaim], b: [string, ColorClaim]): boolean {
  return a[1].a !== b[1].a ? a[1].a < b[1].a : a[0] < b[0];
}

function pickSlot(
  claims: Claims,
  me: string,
  wanted: number,
  count: number,
  gap: Gap,
): number {
  const mine = claims.get(me);
  const others = [...claims].filter(([key]) => key !== me);
  if (
    mine &&
    !others.some((other) => other[1].c === mine.c && before(other, [me, mine]))
  )
    return mine.c;
  const counts = Array.from({ length: count }, () => 0);
  for (const [, claim] of others) counts[claim.c]!++;
  const least = Math.min(...counts);
  const start = Math.abs(wanted) % count;
  let best = start;
  let bestGap = -1;
  for (let step = 0; step < count; step++) {
    const slot = (start + step) % count;
    if (counts[slot] !== least) continue;
    if (!gap) return slot;
    const near = Math.min(360, ...others.map(([, c]) => gap(c.c, slot)));
    if (near > bestGap) {
      best = slot;
      bestGap = near;
    }
  }
  return best;
}

function hueGap(a: number, b: number): number {
  const d = Math.abs(CURSOR_HUES[a]! - CURSOR_HUES[b]!) % 360;
  return d > 180 ? 360 - d : d;
}

export function pickColor(claims: Claims, me: string, wanted: number): number {
  return pickSlot(claims, me, wanted, CURSOR_COLORS.length, hueGap);
}

export function pickName(claims: Claims, me: string, wanted: number): number {
  return pickSlot(claims, me, wanted, NAMES.length, null);
}

const seenAt = (claim: ColorClaim): number => claim.s ?? claim.a;

function claimsOf(map: Y.Map<unknown>, count: number, since = -Infinity) {
  const out = new Map<string, ColorClaim>();
  map.forEach((value, key) => {
    if (
      key.length <= MAX_KEY &&
      validClaim(value, count) &&
      seenAt(value) >= since
    )
      out.set(key, value);
  });
  return out;
}

function prune(map: Y.Map<unknown>, me: string, count: number, now: number) {
  const old: string[] = [];
  map.forEach((value, key) => {
    if (key === me) return;
    if (!validClaim(value, count) || seenAt(value) < now - PRUNE_MS)
      old.push(key);
  });
  if (!old.length) return;
  const run = (): void => old.forEach((key) => map.delete(key));
  if (map.doc) map.doc.transact(run);
  else run();
}

interface Claimer {
  readonly map: Y.Map<unknown>;
  current(): number | null;
  settle(wanted: number | null): boolean;
  of(key: string): number | null;
}

function claimer(
  map: Y.Map<unknown>,
  me: string,
  count: number,
  pick: (claims: Claims, me: string, wanted: number) => number,
): Claimer {
  let value: number | null = null;
  return {
    map,
    current: () => value,
    settle(wanted) {
      const now = Date.now();
      prune(map, me, count, now);
      const mine = claimsOf(map, count).get(me);
      if (wanted === null) {
        if (mine) map.delete(me);
        const was = value;
        value = null;
        return was !== null;
      }
      const next = pick(claimsOf(map, count, now - STALE_MS), me, wanted);
      if (mine?.c !== next) map.set(me, { c: next, a: now, s: now });
      else if (seenAt(mine) < now - DAY_MS) map.set(me, { ...mine, s: now });
      if (next === value) return false;
      value = next;
      return true;
    },
    of: (key) => claimsOf(map, count).get(key)?.c ?? null,
  };
}

export function createRoomColors(
  doc: Y.Doc,
  me: string,
  base: () => Profile,
): RoomColors {
  const colors = claimer(
    doc.getMap<unknown>("colors"),
    me,
    CURSOR_COLORS.length,
    pickColor,
  );
  const names = claimer(
    doc.getMap<unknown>("names"),
    me,
    NAMES.length,
    pickName,
  );
  const changed = createEmitter();
  const settle = (): void => {
    const profile = base();
    const color = colors.settle(profile.color);
    const name = names.settle(profile.auto ?? null);
    if (color || name) changed.emit();
  };
  const observer = (): void => settle();
  colors.map.observe(observer);
  names.map.observe(observer);
  settle();
  return {
    profile() {
      const profile = base();
      const color = colors.current() ?? profile.color;
      const name = names.current();
      return profile.auto === undefined || name === null
        ? { ...profile, color }
        : { ...profile, color, name: NAMES[name]! };
    },
    colorOf: colors.of,
    forget(key) {
      if (key === me) return;
      colors.map.delete(key);
      names.map.delete(key);
    },
    onChange: changed.on,
    destroy() {
      colors.map.unobserve(observer);
      names.map.unobserve(observer);
      changed.clear();
    },
  };
}
