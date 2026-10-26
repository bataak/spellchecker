import * as Y from "yjs";
import { createEmitter } from "../core/emitter.ts";
import { fromBase64Url, randomId, toBase64Url } from "./collabkey.ts";
import { MAX_CHAT_TEXT } from "./chat.ts";
import { MAX_NAME, type Profile } from "./profile.ts";
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
}

export interface CommentSpan {
  readonly id: string;
  readonly from: number;
  readonly to: number;
}

export interface Comments {
  list(): readonly CommentThread[];
  spans(): readonly CommentSpan[];
  at(offset: number): string | null;
  draft(start: number, end: number, sample: string): CommentDraft | null;
  add(draft: CommentDraft, text: string): string | null;
  reply(id: string, text: string): boolean;
  edit(id: string, text: string): boolean;
  remove(id: string): boolean;
  resolve(id: string, on: boolean): boolean;
  onChange(listener: () => void): () => void;
  destroy(): void;
}

export interface CommentsDeps {
  readonly doc: Y.Doc;
  readonly texts: () => ReadonlyMap<string | null, Y.Text>;
  readonly active: () => Y.Text | null;
  readonly author: string;
  readonly profile: () => Profile;
}

interface Stored {
  readonly i: string;
  readonly n: string;
  readonly c: number;
  readonly a: number;
  readonly t: string;
  readonly u: string;
  readonly e?: number;
  readonly s?: 1;
  readonly f?: string;
  readonly h?: string;
  readonly q?: string;
  readonly o?: string;
}

export const MAX_COMMENTS = 1000;
export const MAX_QUOTE = 300;
const MAX_ID = 24;
const MAX_AUTHOR = 16;
const MAX_POSITION = 256;
const MAX_COLOR = 64;
const MAX_ENTRY = 4096;
const COMMENTS = "comments";
const NO_NAME = "Нэргүй";

function short(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function entrySize(value: object): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Infinity;
  }
}

function anchored(v: Partial<Stored>): boolean {
  const thread =
    short(v.f, MAX_POSITION) &&
    short(v.h, MAX_POSITION) &&
    typeof v.q === "string" &&
    v.q.length <= MAX_QUOTE &&
    v.o === undefined;
  const reply =
    short(v.o, MAX_ID) &&
    v.f === undefined &&
    v.h === undefined &&
    v.s === undefined;
  return thread !== reply;
}

export function validComment(id: string, value: unknown): value is Stored {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Partial<Stored>;
  return (
    v.i === id &&
    short(v.i, MAX_ID) &&
    typeof v.n === "string" &&
    v.n.length <= MAX_NAME &&
    Number.isInteger(v.c) &&
    v.c! >= 0 &&
    v.c! < MAX_COLOR &&
    Number.isFinite(v.a) &&
    short(v.t, MAX_CHAT_TEXT) &&
    short(v.u, MAX_AUTHOR) &&
    (v.e === undefined || Number.isFinite(v.e)) &&
    (v.s === undefined || v.s === 1) &&
    anchored(v) &&
    entrySize(value) <= MAX_ENTRY
  );
}

export function authorKey(device: string, room: string): string {
  return hashKey(device + "|" + room);
}

function hashKey(text: string): string {
  let value = 0xcbf29ce4;
  let mix = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    value = Math.imul(value ^ text.charCodeAt(i), 0x01000193) >>> 0;
    mix = Math.imul(mix ^ value, 0x5bd1e995) >>> 0;
  }
  return value.toString(36) + mix.toString(36);
}

function cleanBody(text: string): string {
  return cleanText(text).trim().slice(0, MAX_CHAT_TEXT);
}

function noteOf(value: Stored, author: string): CommentNote {
  return {
    id: value.i,
    name: cleanName(value.n, MAX_NAME) || NO_NAME,
    color: value.c,
    at: value.a,
    text: cleanText(value.t).trim(),
    mine: value.u === author,
    edited: value.e !== undefined,
  };
}

interface Located {
  readonly path: string | null;
  readonly text: Y.Text | null;
  readonly from: number | null;
  readonly to: number | null;
}

function absolute(doc: Y.Doc, raw: string): Y.AbsolutePosition | null {
  try {
    const rel = Y.decodeRelativePosition(fromBase64Url(raw));
    return Y.createAbsolutePositionFromRelativePosition(rel, doc);
  } catch {
    return null;
  }
}

function locate(
  doc: Y.Doc,
  texts: ReadonlyMap<string | null, Y.Text>,
  value: Stored,
): Located {
  const start = absolute(doc, value.f!);
  const end = absolute(doc, value.h!);
  for (const [path, text] of texts) {
    if (start?.type !== text) continue;
    const to = end?.type === text ? end.index : null;
    const live = to !== null && to > start.index;
    return {
      path,
      text,
      from: live ? start.index : null,
      to: live ? to : null,
    };
  }
  return { path: null, text: null, from: null, to: null };
}

function byPlace(a: CommentThread, b: CommentThread): number {
  if (a.path !== b.path) return (a.path ?? "").localeCompare(b.path ?? "");
  if (a.from !== b.from) {
    if (a.from === null) return 1;
    if (b.from === null) return -1;
    return a.from - b.from;
  }
  return a.at - b.at;
}

function prune(map: Y.Map<unknown>): void {
  const bad: string[] = [];
  map.forEach((value, key) => {
    if (!validComment(key, value)) bad.push(key);
  });
  if (!bad.length || !map.doc) return;
  map.doc.transact(() => {
    for (const key of bad) map.delete(key);
  });
}

function entries(map: Y.Map<unknown>): Stored[] {
  const out: Stored[] = [];
  map.forEach((value, key) => {
    if (validComment(key, value) && cleanText(value.t).trim()) out.push(value);
  });
  return out;
}

function relative(text: Y.Text, index: number, assoc: number): string {
  return toBase64Url(
    Y.encodeRelativePosition(
      Y.createRelativePositionFromTypeIndex(text, index, assoc),
    ),
  );
}

function stamp(profile: Profile, author: string, body: string) {
  return {
    i: randomId(9),
    n: cleanName(profile.name, MAX_NAME),
    c: Number.isInteger(profile.color)
      ? Math.abs(profile.color) % MAX_COLOR
      : 0,
    a: Date.now(),
    t: body,
    u: author,
  };
}

function threadsOf(
  deps: CommentsDeps,
  stored: readonly Stored[],
): CommentThread[] {
  const replies = new Map<string, CommentNote[]>();
  for (const value of stored)
    if (value.o !== undefined) {
      const list = replies.get(value.o) ?? [];
      list.push(noteOf(value, deps.author));
      replies.set(value.o, list);
    }
  const texts = deps.texts();
  const out: CommentThread[] = [];
  for (const value of stored) {
    if (value.o !== undefined) continue;
    const place = locate(deps.doc, texts, value);
    out.push({
      ...noteOf(value, deps.author),
      path: place.path,
      from: place.from,
      to: place.to,
      quote: cleanText(value.q!),
      resolved: value.s === 1,
      replies: (replies.get(value.i) ?? []).sort((a, b) => a.at - b.at),
    });
  }
  return out.sort(byPlace);
}

function spansOf(deps: CommentsDeps, stored: readonly Stored[]): CommentSpan[] {
  const text = deps.active();
  if (!text) return [];
  const only = new Map([[null, text]]);
  const out: CommentSpan[] = [];
  for (const value of stored) {
    if (value.o !== undefined || value.s === 1) continue;
    const place = locate(deps.doc, only, value);
    if (place.from !== null && place.to !== null)
      out.push({ id: value.i, from: place.from, to: place.to });
  }
  return out;
}

export function createComments(deps: CommentsDeps): Comments {
  const { doc } = deps;
  const map = doc.getMap<unknown>(COMMENTS);
  const changed = createEmitter();
  let cached: Stored[] | null = null;
  const stored = (): Stored[] => (cached ??= entries(map));
  const own = (id: string): Stored | null => {
    const value = map.get(id);
    return validComment(id, value) && value.u === deps.author ? value : null;
  };
  const thread = (id: string): Stored | null => {
    const value = map.get(id);
    return validComment(id, value) && value.o === undefined ? value : null;
  };
  const spans = (): CommentSpan[] => spansOf(deps, stored());
  const observer = (event: Y.YMapEvent<unknown>): void => {
    cached = null;
    if (!event.transaction.local) prune(map);
    changed.emit();
  };
  map.observe(observer);
  prune(map);

  return {
    list: () => threadsOf(deps, stored()),
    spans,
    at(offset) {
      let best: CommentSpan | null = null;
      for (const span of spans())
        if (span.from <= offset && offset <= span.to)
          if (!best || span.to - span.from < best.to - best.from) best = span;
      return best?.id ?? null;
    },
    draft(start, end, sample) {
      const text = deps.active();
      if (!text || start >= end || end > text.length) return null;
      const raw = text.toString().slice(start, end);
      if (raw !== sample || !raw.trim()) return null;
      return {
        anchor: relative(text, start, 0),
        head: relative(text, end, -1),
        quote: cleanText(raw).slice(0, MAX_QUOTE),
      };
    },
    add(draft, text) {
      const body = cleanBody(text);
      if (!body || map.size >= MAX_COMMENTS) return null;
      const value = {
        ...stamp(deps.profile(), deps.author, body),
        f: draft.anchor,
        h: draft.head,
        q: draft.quote,
      };
      map.set(value.i, value);
      return value.i;
    },
    reply(id, text) {
      const body = cleanBody(text);
      if (!body || !thread(id) || map.size >= MAX_COMMENTS) return false;
      const value = { ...stamp(deps.profile(), deps.author, body), o: id };
      map.set(value.i, value);
      return true;
    },
    edit(id, text) {
      const body = cleanBody(text);
      const value = own(id);
      if (!body || !value) return false;
      if (body !== value.t) map.set(id, { ...value, t: body, e: Date.now() });
      return true;
    },
    remove(id) {
      if (!own(id)) return false;
      doc.transact(() => {
        for (const value of stored()) if (value.o === id) map.delete(value.i);
        map.delete(id);
      });
      return true;
    },
    resolve(id, on) {
      const value = thread(id);
      if (!value) return false;
      if ((value.s === 1) === on) return true;
      const next: Record<string, unknown> = { ...value };
      delete next.s;
      if (on) next.s = 1;
      map.set(id, next);
      return true;
    },
    onChange: changed.on,
    destroy() {
      map.unobserve(observer);
      changed.clear();
    },
  };
}
