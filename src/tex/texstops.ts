import type { Patch } from "../core/textdiff.ts";
import { inComment, lineIndent } from "./texcompletion.ts";
import type { Expansion } from "./texcompletion.ts";

export interface TabStops {
  readonly from: number;
  readonly closes: readonly number[];
  readonly body: number | null;
}

export interface PairEdit {
  readonly patch: Patch | null;
  readonly caret: number;
  readonly stack: TabStops[];
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
  return stops.closes.every(
    (c) => text[c] === "}" || text[c] === "]" || text[c] === "$",
  );
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

const PAIR_BEFORE = /[\s)\]}.,;:!?]/;

function escaped(text: string, at: number): boolean {
  let n = 0;
  while (at - 1 - n >= 0 && text[at - 1 - n] === "\\") n += 1;
  return n % 2 === 1;
}

export function typeDollar(
  stack: readonly TabStops[],
  text: string,
  from: number,
  to: number,
): PairEdit | null {
  if (from !== to || escaped(text, from) || inComment(text, from)) return null;
  const live = stack.filter((s) => valid(s, text));
  const empty = live.some(
    (s) =>
      s.from === from &&
      s.closes.length === 1 &&
      s.closes[0] === from &&
      text[from - 1] === "$" &&
      text[from] === "$",
  );
  if (!empty) {
    const over =
      text[from] === "$" &&
      live.some((s) =>
        s.closes.some(
          (c) =>
            text[c] === "$" &&
            (c === from || (c === from + 1 && text[from + 1] === "$")),
        ),
      );
    if (over) return { patch: null, caret: from + 1, stack: live };
    if (from < text.length && !PAIR_BEFORE.test(text[from]!)) return null;
  }
  const patch = { from, to: from, insert: "$$" };
  const shifted = shiftStops(live, patch);
  return {
    patch,
    caret: from + 1,
    stack: empty
      ? shifted
      : [...shifted, { from: from + 1, closes: [from + 1], body: null }],
  };
}

export function deleteDollar(
  stack: readonly TabStops[],
  text: string,
  caret: number,
): PairEdit | null {
  if (text[caret - 1] !== "$" || text[caret] !== "$") return null;
  const live = stack.filter((s) => valid(s, text));
  const pair = live.some(
    (s) =>
      s.closes.length === 1 &&
      text[s.closes[0]!] === "$" &&
      s.closes[0]! - caret === caret - s.from &&
      caret - s.from <= 1 &&
      caret - s.from >= 0,
  );
  if (!pair) return null;
  const patch = { from: caret - 1, to: caret + 1, insert: "" };
  return { patch, caret: caret - 1, stack: shiftStops(live, patch) };
}

export function typeBracket(
  stack: readonly TabStops[],
  text: string,
  from: number,
  to: number,
): PairEdit | null {
  if (from !== to || !escaped(text, from) || inComment(text, from)) return null;
  if (from < text.length && !PAIR_BEFORE.test(text[from]!)) return null;
  const live = stack.filter((s) => valid(s, text));
  const patch = { from, to: from, insert: "[\\]" };
  return {
    patch,
    caret: from + 1,
    stack: [
      ...shiftStops(live, patch),
      { from: from + 1, closes: [from + 2], body: null },
    ],
  };
}

export function deleteBracket(
  stack: readonly TabStops[],
  text: string,
  caret: number,
): PairEdit | null {
  if (text.slice(caret - 2, caret + 2) !== "\\[\\]") return null;
  const live = stack.filter((s) => valid(s, text));
  const pair = live.some(
    (s) =>
      s.from === caret && s.closes.length === 1 && s.closes[0] === caret + 1,
  );
  if (!pair) return null;
  const patch = { from: caret - 1, to: caret + 2, insert: "" };
  return { patch, caret: caret - 1, stack: shiftStops(live, patch) };
}

export function breakDisplay(
  stack: readonly TabStops[],
  text: string,
  from: number,
  to: number,
): PairEdit | null {
  if (from !== to || inComment(text, from) || escaped(text, from - 2))
    return null;
  const open = text.slice(from - 2, from);
  const close = text.slice(from, from + 2);
  if (
    !(open === "$$" && close === "$$") &&
    !(open === "\\[" && close === "\\]")
  )
    return null;
  const indent = lineIndent(text, from);
  const insert = "\n" + indent + "  \n" + indent;
  const patch = { from, to: from, insert };
  const caret = from + 1 + indent.length + 2;
  const live = stack.filter(
    (s) => valid(s, text) && !s.closes.includes(from + 1),
  );
  return {
    patch,
    caret,
    stack: [
      ...shiftStops(live, patch),
      { from: caret, closes: [from + insert.length + 1], body: null },
    ],
  };
}
