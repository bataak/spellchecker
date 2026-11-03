import * as Y from "yjs";
import { type Profile, MAX_NAME } from "./profile.ts";
import {
  MAX_QUOTE,
  MAX_COLOR,
  MAX_AUTHOR,
  type CommentNote,
  NO_NAME,
  MAX_COMMENTS,
  colorOf,
  type PortableNote,
  cleanBody,
  type PortableThread,
  locateQuote,
  type CommentThread,
  oldestFirst,
  newestFirst,
  type CommentSpan,
  MAX_COMMENT_ID,
} from "./commentmodel.ts";
import { MAX_CHAT_TEXT } from "./chat.ts";
import { cleanName, cleanText } from "./safetext.ts";
import { fromBase64Url, toBase64Url, randomId } from "./collabkey.ts";

export interface CommentsDeps {
  readonly doc: Y.Doc;
  readonly texts: () => ReadonlyMap<string | null, Y.Text>;
  readonly active: () => Y.Text | null;
  readonly author: string;
  readonly profile: () => Profile;
}

export interface Stored {
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

const MAX_ENTRY = 8192;

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

export function prune(map: Y.Map<unknown>): void {
  const bad: string[] = [];
  map.forEach((value, key) => {
    if (!validComment(key, value)) bad.push(key);
  });
  if (!bad.length || !map.doc) return;
  map.doc.transact(() => {
    for (const key of bad) map.delete(key);
  });
}

function byAge(a: Stored, b: Stored): number {
  return a.a - b.a || (a.i < b.i ? -1 : a.i > b.i ? 1 : 0);
}

export function entries(map: Y.Map<unknown>): Stored[] {
  const all: Stored[] = [];
  map.forEach((value, key) => {
    if (validComment(key, value) && cleanText(value.t).trim()) all.push(value);
  });
  const kept = all.sort(byAge).slice(0, MAX_COMMENTS);
  const threads = new Set(
    kept.filter((value) => value.o === undefined).map((value) => value.i),
  );
  return kept.filter((value) => value.o === undefined || threads.has(value.o));
}

export function relative(text: Y.Text, index: number, assoc: number): string {
  return toBase64Url(
    Y.encodeRelativePosition(
      Y.createRelativePositionFromTypeIndex(text, index, assoc),
    ),
  );
}

export function stamp(profile: Profile, author: string, body: string) {
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

export function adoptInto(
  deps: CommentsDeps,
  map: Y.Map<unknown>,
  threads: readonly PortableThread[],
): ReadonlySet<string> {
  const texts = deps.texts();
  const fresh = (id: string): string => (map.has(id) ? randomId(9) : id);
  const done = new Set<string>();
  deps.doc.transact(() => {
    for (const thread of threads) {
      if (map.has(thread.id) || !cleanBody(thread.text)) {
        done.add(thread.id);
        continue;
      }
      const text = texts.get(thread.path);
      if (!text) continue;
      if (map.size + 1 + thread.replies.length > MAX_COMMENTS) break;
      done.add(thread.id);
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
  return done;
}

export function threadsOf(
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

export function spansOf(
  deps: CommentsDeps,
  stored: readonly Stored[],
): CommentSpan[] {
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

export function exportOf(
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

export function setResolved(
  map: Y.Map<unknown>,
  id: string,
  on: boolean,
): boolean {
  const value = map.get(id);
  if (!validComment(id, value) || value.o !== undefined) return false;
  if ((value.s === 1) === on) return true;
  const next: Record<string, unknown> = { ...value };
  delete next.s;
  if (on) next.s = 1;
  map.set(id, next);
  return true;
}
