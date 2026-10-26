import type { WorkerRequest, WorkerResponse, DictFailure } from "./messages.ts";
import { createDictLookup } from "./dictlookup.ts";
import { createStarDictStore, isLatinDict } from "../dict/stardictstore.ts";
import { createSpellers, DICTIONARIES, PRIMARY } from "./spellers.ts";
import { createWordCheck } from "./wordcheck.ts";
import { standardLetters } from "../lang/letters.ts";
import { attempt, attemptAsync } from "../core/attempt.ts";

declare global {
  interface Window {
    __cacheFirstFetch?: boolean;
  }
}

const post = (msg: WorkerResponse): void => self.postMessage(msg);

const netFetch: typeof fetch = self.fetch.bind(self);

if (!self.__cacheFirstFetch) {
  self.__cacheFirstFetch = true;
  const origFetch = self.fetch.bind(self);
  self.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input && input.url) || "";
    if (url && (!init || init.method == null || init.method === "GET")) {
      const cached = await attemptAsync(
        () => caches.match(url, { ignoreSearch: true }),
        undefined,
      );
      if (cached) return cached;
    }
    return origFetch(input, init);
  };
}

let BASE = "/";
const asset = (path: string): string =>
  (BASE + path).replace(/([^:])\/{2,}/g, "$1/");

const spellers = createSpellers({
  asset,
  netFetch,
  onUpdated: (id, version) => post({ type: "dictUpdated", id, version }),
});
const words = createWordCheck({
  primary: spellers.primary,
  active: spellers.active,
});
const store = createStarDictStore({
  dir: () => asset("dict/stardict/"),
  onScripts: (latin) => post({ type: "dictScripts", latin }),
});
const lookup = createDictLookup({ store, words });

self.addEventListener("online", () => store.online());

async function init(): Promise<void> {
  const backend = await spellers.start();
  const loaded: string[] = [];
  const failed: DictFailure[] = [];
  try {
    await spellers.load(PRIMARY);
    loaded.push(PRIMARY);
  } catch (err) {
    failed.push({ id: PRIMARY, error: String(err) });
  }
  const rest = DICTIONARIES.filter((dict) => dict.id !== PRIMARY);
  post({
    type: "ready",
    loaded,
    failed,
    pending: rest.map((dict) => dict.id),
    source: backend.label,
    fallbackReason: backend.fallbackReason || null,
    mnVersion: spellers.version(),
  });
  const results = await Promise.all(
    rest.map((dict) =>
      spellers.load(dict.id).then(
        (id) => ({ id, error: null as string | null }),
        (err) => ({ id: dict.id, error: String(err) }),
      ),
    ),
  );
  post({
    type: "complete",
    loaded: results
      .filter((result) => !result.error)
      .map((result) => result.id),
    failed: results.filter(
      (result): result is { id: string; error: string } => !!result.error,
    ),
  });
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === "init") {
    BASE = msg.base || "/";
    try {
      await init();
    } catch (err) {
      post({ type: "error", error: String(err) });
    }
    return;
  }

  if (msg.type === "reorderDicts") {
    await store.reorder();
    return;
  }

  if (msg.type === "listDicts") {
    if (!msg.peek) await store.ensure();
    post({
      type: "listDicts",
      id: msg.id,
      dicts: store.loaded().map(({ id, user, digest, dict }) => ({
        id,
        digest,
        name: dict.info.bookname,
        words: dict.info.wordcount,
        user,
        latin: isLatinDict(dict),
      })),
    });
    return;
  }

  if (msg.type === "reloadDicts") {
    store.reset();
    await store.ensure();
    return;
  }

  if (msg.type === "refresh") {
    await spellers.refresh();
    return;
  }

  if (msg.type === "setActive") {
    spellers.setActive(msg.ids);
    return;
  }

  if (msg.type === "check") {
    const out: Record<string, boolean> = {};
    for (const word of msg.words) {
      try {
        out[word] = words.isCorrect(standardLetters(word));
      } catch {
        out[word] = true;
      }
    }
    post({ type: "check", id: msg.id, results: out });
    return;
  }

  if (msg.type === "lookup") {
    const found = await lookup.headwords(msg.words);
    post({ type: "lookup", id: msg.id, found });
    return;
  }

  if (msg.type === "define") {
    const entries = await lookup.define(standardLetters(msg.word));
    const dicts = store.dicts();
    post({
      type: "define",
      id: msg.id,
      source: dicts.length > 1 ? "" : (dicts[0]?.info.bookname ?? ""),
      entries,
      dicts: dicts.length,
    });
    return;
  }

  if (msg.type === "suggest") {
    const suggestions = attempt(
      () => words.suggest(standardLetters(msg.word)) || [],
      [],
    );
    post({ type: "suggest", id: msg.id, suggestions });
  }
};
