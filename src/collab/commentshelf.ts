import {
  type PortableThread,
  type PortableNote,
  portableThreads,
  MAX_COMMENTS,
} from "./commentmodel.ts";
import { noteError } from "../core/errorlog.ts";

export interface NoteStore {
  load(key: string): Promise<unknown>;
  save(key: string, value: object): Promise<void>;
  drop(key: string): Promise<void>;
}

export type Thread = {
  -readonly [K in keyof PortableThread]: PortableThread[K];
} & { replies: PortableNote[] };

const SAVE_MS = 400;

export interface Shelf {
  get(key: string): Thread[] | undefined;
  load(key: string): Promise<Thread[]>;
  persist(key: string): void;
  take(key: string, accept: Accept): Promise<number>;
  keep(key: string, incoming: readonly PortableThread[]): Promise<boolean>;
  discard(key: string): void;
  clear(key: string, skipKeep: boolean): void;
  close(): void;
}

export type Accept = (
  threads: readonly PortableThread[],
) => ReadonlySet<string>;

const BLOCK_MS = 60_000;

export function createShelf(
  store: NoteStore,
  loadedKey: (key: string) => void,
) {
  const loaded = new Map<string, Thread[]>();
  const loading = new Map<string, Promise<Thread[]>>();
  const blocked = new Map<string, number>();
  const block = (key: string): void =>
    void blocked.set(key, Date.now() + BLOCK_MS);
  const unblock = (key: string): boolean => {
    const until = blocked.get(key);
    blocked.delete(key);
    return until !== undefined && until > Date.now();
  };
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
    async take(key, accept) {
      const list = await shelf.load(key);
      if (!list.length) return 0;
      const done = accept([...list]);
      const kept = list.filter((thread) => !done.has(thread.id));
      const taken = list.length - kept.length;
      list.splice(0, list.length, ...kept);
      if (taken) shelf.persist(key);
      return taken;
    },
    async keep(key, incoming) {
      if (unblock(key) || !incoming.length) return false;
      const list = await shelf.load(key);
      const known = new Set(list.map((thread) => thread.id));
      for (const thread of portableThreads(incoming) as Thread[])
        if (!known.has(thread.id) && list.length < MAX_COMMENTS)
          list.push(thread);
      shelf.persist(key);
      return true;
    },
    discard(key) {
      block(key);
      loaded.set(key, []);
      clearTimeout(timers.get(key));
      store.drop(key).catch(noteError);
    },
    clear(key, skipKeep) {
      if (skipKeep) block(key);
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
