import { createEmitter } from "../core/emitter.ts";
import { swapOrigin } from "../editor/editortext.ts";
import { randomId } from "./collabkey.ts";
import {
  cleanBody,
  colorOf,
  diffChange,
  locateQuote,
  MAX_COMMENTS,
  MAX_QUOTE,
  newestFirst,
  oldestFirst,
  shiftEnd,
  shiftStart,
  smallestAt,
  type CommentDraft,
  type CommentNote,
  type Comments,
  type CommentSpan,
  type CommentThread,
  type PortableNote,
  type PortableThread,
  type TextChange,
} from "./commentmodel.ts";
import { MAX_NAME, type Profile } from "./profile.ts";
import { cleanName, cleanText } from "./safetext.ts";
import {
  type NoteStore,
  type Accept,
  type Thread,
  type Shelf,
  createShelf,
} from "./commentshelf.ts";

export interface DocRef {
  readonly kind: "file" | "project";
  readonly key: string;
  readonly path: string | null;
}

export interface LocalCommentsDeps {
  readonly editor: HTMLTextAreaElement;
  readonly doc: () => DocRef | null;
  readonly profile: () => Profile;
  readonly store: NoteStore;
}

export interface LocalComments extends Comments {
  current(): DocRef | null;
  sync(): void;
  take(key: string, accept: Accept): Promise<number>;
  keep(key: string, threads: readonly PortableThread[]): Promise<void>;
  discard(key: string): void;
  clear(key: string, skipKeep: boolean): void;
}

function same(a: DocRef | null, b: DocRef | null): boolean {
  return a?.key === b?.key && a?.path === b?.path;
}

function noteView(note: PortableNote): CommentNote {
  return {
    id: note.id,
    name: note.name,
    color: note.color,
    at: note.at,
    text: note.text,
    mine: note.author === null,
    edited: note.edited,
  };
}

function threadView(thread: Thread): CommentThread {
  return {
    ...noteView(thread),
    path: thread.path,
    from: thread.from,
    to: thread.to,
    quote: thread.quote,
    resolved: thread.resolved,
    replies: thread.replies.map(noteView).sort(oldestFirst),
  };
}

type Shift = "same" | "moved" | "gone";

function shiftThread(thread: Thread, change: TextChange): Shift {
  if (thread.from === null || thread.to === null) return "same";
  const from = shiftStart(thread.from, change);
  const to = shiftEnd(thread.to, change);
  if (from === thread.from && to === thread.to) return "same";
  const live = to > from;
  thread.from = live ? from : null;
  thread.to = live ? to : null;
  return live ? "moved" : "gone";
}

function noteOf(profile: Profile, body: string): PortableNote {
  return {
    id: randomId(9),
    author: null,
    name: cleanName(profile.name, MAX_NAME),
    color: colorOf(profile.color),
    at: Date.now(),
    text: body,
    edited: false,
  };
}

function editNote(note: PortableNote, body: string): PortableNote {
  return body === note.text ? note : { ...note, text: body, edited: true };
}

function editIn(threads: Thread[], id: string, body: string): boolean {
  for (const thread of threads) {
    if (thread.id === id && thread.author === null) {
      Object.assign(thread, editNote(thread, body));
      return true;
    }
    const at = thread.replies.findIndex(
      (reply) => reply.id === id && reply.author === null,
    );
    if (at === -1) continue;
    thread.replies[at] = editNote(thread.replies[at]!, body);
    return true;
  }
  return false;
}

function removeIn(threads: Thread[], id: string): boolean {
  const at = threads.findIndex((t) => t.id === id && t.author === null);
  if (at !== -1) return threads.splice(at, 1).length > 0;
  for (const thread of threads) {
    const index = thread.replies.findIndex(
      (reply) => reply.id === id && reply.author === null,
    );
    if (index !== -1) return thread.replies.splice(index, 1).length > 0;
  }
  return false;
}

function spansOf(threads: readonly Thread[], ref: DocRef | null) {
  const out: CommentSpan[] = [];
  for (const thread of threads)
    if (
      !thread.resolved &&
      thread.path === ref?.path &&
      thread.from !== null &&
      thread.to !== null
    )
      out.push({ id: thread.id, from: thread.from, to: thread.to });
  return out;
}

function scopeOf(ref: Pick<DocRef, "key" | "path">): string {
  return ref.key + "\n" + (ref.path ?? "");
}

function parseScope(scope: string): Pick<DocRef, "key" | "path"> {
  const at = scope.indexOf("\n");
  const path = scope.slice(at + 1);
  return { key: scope.slice(0, at), path: path || null };
}

function draftAt(
  value: string,
  span: readonly [number, number],
  sample: string,
  scope: string,
): CommentDraft | null {
  const [start, end] = span;
  const raw = value.slice(start, end);
  if (start >= end || raw !== sample || !raw.trim()) return null;
  return {
    anchor: String(start),
    head: String(end),
    quote: cleanText(raw).slice(0, MAX_QUOTE),
    scope,
  };
}

function threadAt(
  value: string | null,
  draft: CommentDraft,
  path: string | null,
  note: PortableNote,
): Thread {
  const span = {
    from: Number(draft.anchor),
    to: Number(draft.head),
    quote: draft.quote,
  };
  const place = value === null ? span : locateQuote(value, span);
  return {
    ...note,
    path,
    from: place?.from ?? null,
    to: place?.to ?? null,
    quote: draft.quote,
    resolved: false,
    replies: [],
  };
}

type ShelfActions = Pick<LocalComments, "take" | "keep" | "discard" | "clear">;

function shelfActions(
  shelf: Shelf,
  shown: (key: string) => void,
): ShelfActions {
  return {
    async take(key, accept) {
      const taken = await shelf.take(key, accept);
      if (taken) shown(key);
      return taken;
    },
    async keep(key, incoming) {
      if (await shelf.keep(key, incoming)) shown(key);
    },
    discard(key) {
      shelf.discard(key);
      shown(key);
    },
    clear(key, skipKeep) {
      shelf.clear(key, skipKeep);
      shown(key);
    },
  };
}

export function createLocalComments(deps: LocalCommentsDeps): LocalComments {
  const { editor } = deps;
  const changed = createEmitter();
  let ref: DocRef | null = null;
  let base = editor.value;
  const shown = (key: string): void => {
    if (ref?.key === key) changed.emit();
  };
  const shelf = createShelf(deps.store, shown);
  const threads = (): Thread[] => (ref ? (shelf.get(ref.key) ?? []) : []);
  const touch = (): boolean => {
    if (ref) shelf.persist(ref.key);
    changed.emit();
    return true;
  };
  const find = (id: string): Thread | undefined =>
    threads().find((thread) => thread.id === id);
  const sync = (): void => {
    const next = deps.doc();
    base = editor.value;
    if (same(next, ref)) return;
    ref = next;
    if (ref) void shelf.load(ref.key);
    changed.emit();
  };
  const onInput = (event: Event): void => {
    if (swapOrigin(event) !== null || !same(deps.doc(), ref)) return sync();
    const change = diffChange(base, editor.value);
    base = editor.value;
    if (!change || !ref) return;
    const shifts = new Set<Shift>();
    for (const thread of threads())
      if (thread.path === ref.path) shifts.add(shiftThread(thread, change));
    if (shifts.has("gone")) touch();
    else if (shifts.has("moved")) shelf.persist(ref.key);
  };
  editor.addEventListener("input", onInput);
  sync();
  const spans = (): CommentSpan[] => spansOf(threads(), ref);

  return {
    current: () => ref,
    sync,
    list: () => threads().map(threadView).sort(newestFirst),
    spans,
    at: (offset) => smallestAt(spans(), offset),
    draft(start, end, sample) {
      if (!ref || !shelf.get(ref.key)) return null;
      return draftAt(editor.value, [start, end], sample, scopeOf(ref));
    },
    add(draft, text) {
      const body = cleanBody(text);
      const target = draft.scope ? parseScope(draft.scope) : ref;
      const list = target && shelf.get(target.key);
      if (!body || !target || !list || list.length >= MAX_COMMENTS) return null;
      const here = ref !== null && scopeOf(ref) === scopeOf(target);
      const thread = threadAt(here ? editor.value : null, draft, target.path, {
        ...noteOf(deps.profile(), body),
      });
      list.push(thread);
      shelf.persist(target.key);
      changed.emit();
      return thread.id;
    },
    reply(id, text) {
      const body = cleanBody(text);
      const thread = find(id);
      if (!body || !thread) return false;
      thread.replies.push(noteOf(deps.profile(), body));
      return touch();
    },
    edit(id, text) {
      const body = cleanBody(text);
      return !!body && editIn(threads(), id, body) && touch();
    },
    remove: (id) => removeIn(threads(), id) && touch(),
    resolve(id, on) {
      const thread = find(id);
      if (!thread) return false;
      thread.resolved = on;
      return touch();
    },
    resolveAll(ids) {
      const wanted = new Set(ids);
      for (const thread of threads())
        if (wanted.has(thread.id)) thread.resolved = true;
      touch();
    },
    ...shelfActions(shelf, shown),
    unread: () => 0,
    seen: () => {},
    onChange: changed.on,
    destroy() {
      editor.removeEventListener("input", onInput);
      shelf.close();
      changed.clear();
    },
  };
}
