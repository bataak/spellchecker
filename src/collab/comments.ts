import * as Y from "yjs";
import { createEmitter } from "../core/emitter.ts";
import {
  cleanBody,
  MAX_COMMENTS,
  MAX_QUOTE,
  smallestAt,
  type Comments,
  type CommentSpan,
  type CommentThread,
  type PortableThread,
} from "./commentmodel.ts";
import { cleanText } from "./safetext.ts";
import {
  type CommentsDeps,
  type Stored,
  entries,
  validComment,
  spansOf,
  setResolved,
  prune,
  threadsOf,
  adoptInto,
  exportOf,
  relative,
  stamp,
} from "./commentstored.ts";
export type {
  CommentDraft,
  CommentNote,
  Comments,
  CommentSpan,
  CommentThread,
} from "./commentmodel.ts";

export { MAX_COMMENTS, MAX_QUOTE } from "./commentmodel.ts";

export interface CollabComments extends Comments {
  adopt(threads: readonly PortableThread[]): ReadonlySet<string>;
  export(): PortableThread[];
}

const COMMENTS = "comments";

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
  const resolve = (id: string, on: boolean): boolean =>
    setResolved(map, id, on);
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
    resolve,
    resolveAll(ids) {
      doc.transact(() => ids.forEach((id) => resolve(id, true)));
    },
    full: () => map.size >= MAX_COMMENTS,
    onChange: changed.on,
    destroy() {
      map.unobserve(observer);
      changed.clear();
    },
  };
}
