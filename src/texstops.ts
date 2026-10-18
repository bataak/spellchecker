import type { Patch } from "./mdedit.ts";
import type { Expansion } from "./texcompletion.ts";

export interface TabStops {
  readonly from: number;
  readonly closes: readonly number[];
  readonly body: number | null;
}

export interface TabJump {
  readonly stack: TabStops[];
  readonly caret: number | null;
}

export function snippetStops(edit: Expansion): TabStops | null {
  if (!edit.closes.length) return null;
  return { from: edit.caret, closes: edit.closes, body: edit.body };
}

export function caretPatch(
  before: string,
  after: string,
  caret: number,
): Patch | null {
  if (before === after) return null;
  const tail = Math.min(before.length, Math.max(0, after.length - caret));
  let b = 0;
  while (
    b < tail &&
    before.charCodeAt(before.length - 1 - b) ===
      after.charCodeAt(after.length - 1 - b)
  )
    b += 1;
  const max = Math.min(before.length, after.length) - b;
  let a = 0;
  while (a < max && before.charCodeAt(a) === after.charCodeAt(a)) a += 1;
  return {
    from: a,
    to: before.length - b,
    insert: after.slice(a, after.length - b),
  };
}

function exitOf(stops: TabStops): number {
  return stops.body ?? stops.closes[stops.closes.length - 1]! + 1;
}

function valid(stops: TabStops, text: string): boolean {
  if (stops.body !== null && text[stops.body] !== "\n") return false;
  return stops.closes.every((c) => text[c] === "}" || text[c] === "]");
}

export function shiftStops(
  stack: readonly TabStops[],
  patch: Patch,
): TabStops[] {
  const delta = patch.insert.length - (patch.to - patch.from);
  const mark = (p: number): number =>
    p < patch.from ? p : p >= patch.to ? p + delta : -1;
  const out: TabStops[] = [];
  for (const stops of stack) {
    const closes = stops.closes.map(mark);
    if (closes.some((c) => c < 0)) continue;
    const body = stops.body === null ? null : mark(stops.body);
    if (body !== null && body < 0) continue;
    const from =
      stops.from <= patch.from
        ? stops.from
        : stops.from >= patch.to
          ? stops.from + delta
          : patch.from;
    out.push({ from, closes, body });
  }
  return out;
}

export function tabStop(
  stack: readonly TabStops[],
  text: string,
  caret: number,
): TabJump {
  const rest = stack.slice();
  while (rest.length) {
    const top = rest[rest.length - 1]!;
    if (!valid(top, text) || caret < top.from || caret > exitOf(top)) {
      rest.pop();
      continue;
    }
    const i = top.closes.findIndex((c) => c >= caret);
    if (i < 0) {
      rest.pop();
      continue;
    }
    if (i + 1 < top.closes.length)
      return { stack: rest, caret: top.closes[i + 1]! };
    rest.pop();
    return { stack: rest, caret: exitOf(top) };
  }
  return { stack: rest, caret: null };
}
