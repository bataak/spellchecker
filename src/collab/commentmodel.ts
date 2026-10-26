import { MAX_CHAT_TEXT } from "./chat.ts";
import { MAX_NAME } from "./profile.ts";
import { cleanName, cleanText } from "./safetext.ts";

export interface CommentNote {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly at: number;
  readonly text: string;
  readonly mine: boolean;
  readonly edited: boolean;
}

export interface CommentThread extends CommentNote {
  readonly path: string | null;
  readonly from: number | null;
  readonly to: number | null;
  readonly quote: string;
  readonly resolved: boolean;
  readonly replies: readonly CommentNote[];
}

export interface CommentDraft {
  readonly anchor: string;
  readonly head: string;
  readonly quote: string;
  readonly scope?: string;
}

export interface CommentSpan {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

export interface CommentHit {
  readonly id: string;
  readonly inside: boolean;
}

export interface Comments {
  list(): readonly CommentThread[];
  spans(): readonly CommentSpan[];
  at(offset: number): CommentHit | null;
  draft(start: number, end: number, sample: string): CommentDraft | null;
  add(draft: CommentDraft, text: string): string | null;
  reply(id: string, text: string): boolean;
  edit(id: string, text: string): boolean;
  remove(id: string): boolean;
  resolve(id: string, on: boolean): boolean;
  resolveAll(ids: readonly string[]): void;
  unread(): number;
  seen(): void;
  onChange(listener: () => void): () => void;
  destroy(): void;
}

export interface PortableNote {
  readonly id: string;
  readonly author: string | null;
  readonly name: string;
  readonly color: number;
  readonly at: number;
  readonly text: string;
  readonly edited: boolean;
}

export interface PortableThread extends PortableNote {
  readonly path: string | null;
  readonly from: number | null;
  readonly to: number | null;
  readonly quote: string;
  readonly resolved: boolean;
  readonly replies: readonly PortableNote[];
}

export interface TextChange {
  readonly from: number;
  readonly removed: number;
  readonly inserted: number;
}

export const MAX_COMMENTS = 1000;
export const MAX_QUOTE = 300;
export const MAX_COLOR = 64;
export const MAX_COMMENT_ID = 24;
export const MAX_AUTHOR = 16;
export const NO_NAME = "Нэргүй";
const MAX_PATH = 1024;

export function cleanBody(text: string): string {
  return cleanText(text).trim().slice(0, MAX_CHAT_TEXT);
}

export function colorOf(color: number): number {
  return Number.isInteger(color) ? Math.abs(color) % MAX_COLOR : 0;
}

export function newestFirst(
  a: Pick<CommentNote, "at" | "id">,
  b: Pick<CommentNote, "at" | "id">,
): number {
  return b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function oldestFirst(
  a: Pick<CommentNote, "at" | "id">,
  b: Pick<CommentNote, "at" | "id">,
): number {
  return -newestFirst(a, b);
}

export function smallestAt(
  spans: readonly CommentSpan[],
  offset: number,
): CommentHit | null {
  let best: CommentSpan | null = null;
  let inside = false;
  for (const span of spans) {
    if (offset < span.from || offset > span.to) continue;
    const within = span.from < offset && offset < span.to;
    const smaller = !best || span.to - span.from < best.to - best.from;
    if (!best || (within && !inside) || (within === inside && smaller)) {
      best = span;
      inside = within;
    }
  }
  return best ? { id: best.id, inside } : null;
}

export function diffChange(old: string, next: string): TextChange | null {
  if (old === next) return null;
  const shortest = Math.min(old.length, next.length);
  let head = 0;
  while (head < shortest && old[head] === next[head]) head++;
  let tail = 0;
  while (
    tail < shortest - head &&
    old[old.length - 1 - tail] === next[next.length - 1 - tail]
  )
    tail++;
  return {
    from: head,
    removed: old.length - tail - head,
    inserted: next.length - tail - head,
  };
}

export function shiftStart(at: number, change: TextChange): number {
  if (at < change.from) return at;
  if (at >= change.from + change.removed)
    return at + change.inserted - change.removed;
  return change.from + change.inserted;
}

export function shiftEnd(at: number, change: TextChange): number {
  if (at <= change.from) return at;
  if (at >= change.from + change.removed)
    return at + change.inserted - change.removed;
  return change.from;
}

function nearest(value: string, quote: string, near: number): number {
  let best = -1;
  for (
    let at = value.indexOf(quote);
    at !== -1;
    at = value.indexOf(quote, at + 1)
  )
    if (best === -1 || Math.abs(at - near) < Math.abs(best - near)) best = at;
  return best;
}

export function locateQuote(
  value: string,
  thread: Pick<PortableThread, "from" | "to" | "quote">,
): { from: number; to: number } | null {
  const { from, to, quote } = thread;
  if (from !== null && to !== null && to > from && to <= value.length)
    if (cleanText(value.slice(from, to)).startsWith(quote)) return { from, to };
  if (!quote.trim()) return null;
  const at = nearest(value, quote, from ?? 0);
  if (at === -1) return null;
  const size =
    quote.length >= MAX_QUOTE && from !== null && to !== null && to > from
      ? to - from
      : quote.length;
  return { from: at, to: Math.min(value.length, at + size) };
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function position(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && (value as number) >= 0);
}

function portableNote(value: unknown): PortableNote | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    !text(v.id, MAX_COMMENT_ID) ||
    !v.id ||
    !text(v.name, MAX_NAME) ||
    !Number.isFinite(v.at) ||
    !text(v.text, MAX_CHAT_TEXT) ||
    !cleanBody(v.text)
  )
    return null;
  return {
    id: v.id,
    author: text(v.author, MAX_AUTHOR) && v.author ? v.author : null,
    name: cleanName(v.name, MAX_NAME) || NO_NAME,
    color: colorOf(v.color as number),
    at: v.at as number,
    text: cleanBody(v.text),
    edited: v.edited === true,
  };
}

function portableThread(value: unknown): PortableThread | null {
  const note = portableNote(value);
  if (!note) return null;
  const v = value as Record<string, unknown>;
  const path = v.path === null || text(v.path, MAX_PATH) ? v.path : undefined;
  if (path === undefined || !position(v.from) || !position(v.to)) return null;
  if (!text(v.quote, MAX_QUOTE) || !Array.isArray(v.replies)) return null;
  return {
    ...note,
    path: path as string | null,
    from: v.from,
    to: v.to,
    quote: cleanText(v.quote),
    resolved: v.resolved === true,
    replies: v.replies
      .map(portableNote)
      .filter((reply): reply is PortableNote => reply !== null),
  };
}

export function portableThreads(value: unknown): PortableThread[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_COMMENTS)
    .map(portableThread)
    .filter((thread): thread is PortableThread => thread !== null);
}
