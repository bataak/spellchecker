import { createEmitter } from "../core/emitter.ts";
import { noteError } from "../core/errorlog.ts";
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
  portableThreads,
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

export interface DocRef {
  readonly kind: "file" | "project";
  readonly key: string;
  readonly path: string | null;
}

export interface NoteStore {
  load(key: string): Promise<unknown>;
  save(key: string, value: object): Promise<void>;
  drop(key: string): Promise<void>;
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
  take(key: string): Promise<PortableThread[]>;
  keep(key: string, threads: readonly PortableThread[]): Promise<void>;
  discard(key: string): void;
  clear(key: string, skipKeep: boolean): void;
}

type Thread = {
  -readonly [K in keyof PortableThread]: PortableThread[K];
} & { replies: PortableNote[] };

const SAVE_MS = 400;

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

function shiftThread(thread: Thread, change: TextChange): boolean {
  if (thread.from === null || thread.to === null) return false;
  const from = shiftStart(thread.from, change);
  const to = shiftEnd(thread.to, change);
  if (from === thread.from && to === thread.to) return false;
  const live = to > from;
  thread.from = live ? from : null;
  thread.to = live ? to : null;
  return true;
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

function draftAt(
  value: string,
  start: number,
  end: number,
  sample: string,
): CommentDraft | null {
  const raw = value.slice(start, end);
  if (start >= end || raw !== sample || !raw.trim()) return null;
  return {
    anchor: String(start),
    head: String(end),
    quote: cleanText(raw).slice(0, MAX_QUOTE),
  };
}

function threadAt(
  value: string,
  draft: CommentDraft,
  path: string | null,
  note: PortableNote,
): Thread {
  const place = locateQuote(value, {
    from: Number(draft.anchor),
    to: Number(draft.head),
    quote: draft.quote,
  });
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

interface Shelf {
  get(key: string): Thread[] | undefined;
  load(key: string): Promise<Thread[]>;
  persist(key: string): void;
  take(key: string): Promise<Thread[]>;
  keep(key: string, incoming: readonly PortableThread[]): Promise<boolean>;
  discard(key: string): void;
  clear(key: string, skipKeep: boolean): void;
  close(): void;
}

function createShelf(store: NoteStore, loadedKey: (key: string) => void) {
  const loaded = new Map<string, Thread[]>();
  const loading = new Map<string, Promise<Thread[]>>();
  const discarded = new Set<string>();
  const skipped = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const read = (key: string): Promise<Thread[]> =>
    store
      .load(key)
      .catch((error: unknown) => {
        noteError(error);
        return null;
      })
      .then((value) => {
        const threads = loaded.get(key) ?? (portableThreads(value) as Thread[]);
        loaded.set(key, threads);
        loading.delete(key);
        loadedKey(key);
        return threads;
      });
  const shelf: Shelf = {
    get: (key) => loaded.get(key),
    load(key) {
      const known = loaded.get(key);
      if (known) return Promise.resolve(known);
      const pending = loading.get(key) ?? read(key);
      loading.set(key, pending);
      return pending;
    },
    persist(key) {
      clearTimeout(timers.get(key));
      const save = (): void => {
        timers.delete(key);
        const threads = loaded.get(key) ?? [];
        const done = threads.length
          ? store.save(key, threads)
          : store.drop(key);
        done.catch(noteError);
      };
      timers.set(key, setTimeout(save, SAVE_MS));
    },
    async take(key) {
      const out = (await shelf.load(key)).splice(0);
      if (out.length) shelf.persist(key);
      return out;
    },
    async keep(key, incoming) {
      if (skipped.delete(key)) return false;
      if (discarded.has(key) || !incoming.length) return false;
      const list = await shelf.load(key);
      if (discarded.has(key)) return false;
      const known = new Set(list.map((thread) => thread.id));
      for (const thread of portableThreads(incoming) as Thread[])
        if (!known.has(thread.id) && list.length < MAX_COMMENTS)
          list.push(thread);
      shelf.persist(key);
      return true;
    },
    discard(key) {
      discarded.add(key);
      loaded.set(key, []);
      clearTimeout(timers.get(key));
      store.drop(key).catch(noteError);
    },
    clear(key, skipKeep) {
      if (skipKeep) skipped.add(key);
      loaded.set(key, []);
      clearTimeout(timers.get(key));
      store.drop(key).catch(noteError);
    },
    close() {
      for (const timer of timers.values()) clearTimeout(timer);
    },
  };
  return shelf;
}

type ShelfActions = Pick<LocalComments, "take" | "keep" | "discard" | "clear">;

function shelfActions(
  shelf: Shelf,
  shown: (key: string) => void,
): ShelfActions {
  return {
    async take(key) {
      const out = await shelf.take(key);
      if (out.length) shown(key);
      return out;
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
    let moved = false;
    for (const thread of threads())
      if (thread.path === ref.path && shiftThread(thread, change)) moved = true;
    if (moved) touch();
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
      return draftAt(editor.value, start, end, sample);
    },
    add(draft, text) {
      const body = cleanBody(text);
      const list = ref && shelf.get(ref.key);
      if (!body || !ref || !list || list.length >= MAX_COMMENTS) return null;
      const thread = threadAt(editor.value, draft, ref.path, {
        ...noteOf(deps.profile(), body),
      });
      list.push(thread);
      touch();
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
