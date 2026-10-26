import type * as Y from "yjs";
import { createEmitter } from "../core/emitter.ts";
import { CURSOR_COLORS, CURSOR_HUES } from "./peercolors.ts";
import type { Profile } from "./profile.ts";

export interface ColorClaim {
  readonly c: number;
  readonly a: number;
}

export interface RoomColors {
  profile(): Profile;
  colorOf(key: string): number | null;
  onChange(listener: () => void): () => void;
  destroy(): void;
}

const COLORS = "colors";
const MAX_KEY = 32;

function validClaim(value: unknown): value is ColorClaim {
  if (!value || typeof value !== "object") return false;
  const { c, a } = value as Partial<ColorClaim>;
  return (
    Number.isInteger(c) &&
    c! >= 0 &&
    c! < CURSOR_COLORS.length &&
    Number.isFinite(a)
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

function claimsOf(map: Y.Map<unknown>): Map<string, ColorClaim> {
  const out = new Map<string, ColorClaim>();
  map.forEach((value, key) => {
    if (key.length <= MAX_KEY && validClaim(value)) out.set(key, value);
  });
  return out;
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
    const claims = claimsOf(map);
    const next = pickColor(claims, me, base().color);
    if (claims.get(me)?.c !== next) map.set(me, { c: next, a: Date.now() });
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
    onChange: changed.on,
    destroy() {
      map.unobserve(observer);
      changed.clear();
    },
  };
}
