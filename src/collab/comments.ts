import * as Y from "yjs";
import { createEmitter } from "../core/emitter.ts";
import { fromBase64Url, randomId, toBase64Url } from "./collabkey.ts";
import { MAX_CHAT_TEXT } from "./chat.ts";
import {
  cleanBody,
  colorOf,
  locateQuote,
  MAX_COLOR,
  MAX_COMMENT_ID,
  MAX_COMMENTS,
  MAX_QUOTE,
  MAX_AUTHOR,
  NO_NAME,
  newestFirst,
  oldestFirst,
  smallestAt,
  type CommentNote,
  type Comments,
  type CommentSpan,
  type CommentThread,
  type PortableNote,
  type PortableThread,
} from "./commentmodel.ts";
import { MAX_NAME, type Profile } from "./profile.ts";
import { cleanName, cleanText } from "./safetext.ts";

export type {
  CommentDraft,
  CommentNote,
  Comments,
  CommentSpan,
  CommentThread,
} from "./commentmodel.ts";
export { MAX_COMMENTS, MAX_QUOTE } from "./commentmodel.ts";

export interface CollabComments extends Comments {
  adopt(threads: readonly PortableThread[]): void;
  export(): PortableThread[];
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

const MAX_ID = MAX_COMMENT_ID;
const MAX_POSITION = 256;
const MAX_ENTRY = 4096;
const COMMENTS = "comments";

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
    c: colorOf(profile.color),
    a: Date.now(),
    t: body,
    u: author,
  };
}

function storedNote(note: PortableNote, author: string, id: string) {
  const value: Record<string, unknown> = {
    i: id,
    n: cleanName(note.name, MAX_NAME),
    c: colorOf(note.color),
    a: note.at,
    t: cleanBody(note.text),
    u: note.author ?? author,
  };
  if (note.edited) value.e = note.at;
  return value;
}

function portableOf(note: CommentNote, author: string): PortableNote {
  return {
    id: note.id,
    author: note.mine ? null : author,
    name: note.name,
    color: note.color,
    at: note.at,
    text: note.text,
    edited: note.edited,
  };
}

function adoptInto(
  deps: CommentsDeps,
  map: Y.Map<unknown>,
  threads: readonly PortableThread[],
): void {
  const texts = deps.texts();
  const fresh = (id: string): string => (map.has(id) ? randomId(9) : id);
  deps.doc.transact(() => {
    for (const thread of threads) {
      const text = texts.get(thread.path);
      if (!text || !cleanBody(thread.text) || map.has(thread.id)) continue;
      if (map.size + 1 + thread.replies.length > MAX_COMMENTS) break;
      const place = locateQuote(text.toString(), thread);
      const value = storedNote(thread, deps.author, thread.id);
      value.f = relative(text, place?.from ?? 0, 0);
      value.h = place ? relative(text, place.to, -1) : value.f;
      value.q = cleanText(thread.quote).slice(0, MAX_QUOTE);
      if (thread.resolved) value.s = 1;
      map.set(thread.id, value);
      for (const reply of thread.replies) {
        const id = fresh(reply.id);
        map.set(id, { ...storedNote(reply, deps.author, id), o: thread.id });
      }
    }
  });
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
      replies: (replies.get(value.i) ?? []).sort(oldestFirst),
    });
  }
  return out.sort(newestFirst);
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

function exportOf(
  threads: readonly CommentThread[],
  stored: readonly Stored[],
): PortableThread[] {
  const authors = new Map(stored.map((value) => [value.i, value.u]));
  const of = (note: CommentNote): PortableNote =>
    portableOf(note, authors.get(note.id) ?? "");
  return threads.map((thread) => ({
    ...of(thread),
    path: thread.path,
    from: thread.from,
    to: thread.to,
    quote: thread.quote,
    resolved: thread.resolved,
    replies: thread.replies.map(of),
  }));
}

export function createComments(deps: CommentsDeps): CollabComments {
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
  let seenIds = new Set(stored().map((value) => value.i));

  const list = (): CommentThread[] => threadsOf(deps, stored());
  return {
    list,
    spans,
    at: (offset) => smallestAt(spans(), offset),
    adopt: (threads) => adoptInto(deps, map, threads),
    export: () => exportOf(list(), stored()),
    unread: () =>
      stored().filter(
        (value) => value.u !== deps.author && !seenIds.has(value.i),
      ).length,
    seen() {
      seenIds = new Set(stored().map((value) => value.i));
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
