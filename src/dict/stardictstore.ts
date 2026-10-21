import stardictList from "virtual:stardict-index";
import type { DictListEntry } from "./dictindex.ts";
import { hasLatinHeadwords, type StarDict } from "./stardict.ts";
import { loadStarDicts } from "./stardictload.ts";
import {
  idxDigest,
  loadDictOrder,
  loadUserDicts,
  sortByOrder,
} from "./userdicts.ts";

export interface LoadedDict {
  id: string;
  user: boolean;
  digest: string;
  dict: StarDict;
}

export interface StarDictStoreDeps {
  readonly dir: () => string;
  readonly onScripts: (latin: boolean) => void;
}

export interface StarDictStore {
  ensure(): Promise<void>;
  reset(): void;
  reorder(): Promise<void>;
  online(): void;
  dicts(): StarDict[];
  loaded(): LoadedDict[];
  withDicts<T>(
    run: (dicts: StarDict[], broken: StarDict[]) => Promise<T>,
  ): Promise<T>;
}

interface BundledResult {
  loaded: [string, LoadedDict][];
  failed: DictListEntry[];
}

interface UserResult {
  loaded: LoadedDict[];
  incomplete: boolean;
}

const RELOAD_BACKOFF = [2000, 5000, 15000, 60000];
const latinDicts = new WeakMap<StarDict, boolean>();

export function isLatinDict(dict: StarDict): boolean {
  let latin = latinDicts.get(dict);
  if (latin === undefined) {
    latin = hasLatinHeadwords(dict.index);
    latinDicts.set(dict, latin);
  }
  return latin;
}

async function bundledEntry(dict: StarDict): Promise<LoadedDict> {
  return {
    id: "bundled:" + dict.info.bookname,
    user: false,
    digest: await idxDigest(dict.index.bytes),
    dict,
  };
}

async function loadUser(): Promise<UserResult> {
  try {
    const { loaded, failed } = await loadUserDicts();
    return {
      loaded: loaded.map(({ name, digest, dict }) => ({
        id: "user:" + name,
        user: true,
        digest,
        dict,
      })),
      incomplete: failed.length > 0,
    };
  } catch (err) {
    console.warn("Хэрэглэгчийн толь ачаалагдсангүй:", err);
    return { loaded: [], incomplete: true };
  }
}

async function loadBundled(
  dir: StarDictStoreDeps["dir"],
  list: DictListEntry[],
): Promise<BundledResult> {
  try {
    const { loaded, failed } = await loadStarDicts(dir(), list);
    const entries = await Promise.all(
      loaded.map(
        async ({ entry, dict }) =>
          [entry.base, await bundledEntry(dict)] as [string, LoadedDict],
      ),
    );
    return { loaded: entries, failed };
  } catch (err) {
    console.warn("StarDict ачаалагдсангүй:", err);
    return { loaded: [], failed: list.slice() };
  }
}

interface DictState {
  bundled: Map<string, LoadedDict>;
  missing: DictListEntry[];
  user: LoadedDict[];
  userIncomplete: boolean;
}

function emptyState(): DictState {
  return { bundled: new Map(), missing: [], user: [], userIncomplete: false };
}

function backoff(attempt: number): number {
  return RELOAD_BACKOFF[Math.min(attempt, RELOAD_BACKOFF.length - 1)]!;
}

function needsRepair(state: DictState): boolean {
  return state.missing.length > 0 || state.userIncomplete;
}

function composeList(state: DictState, order: string[]): LoadedDict[] {
  const list = [
    ...stardictList.flatMap((entry) => {
      const found = state.bundled.get(entry.base);
      return found ? [found] : [];
    }),
    ...state.user,
  ];
  return sortByOrder(list, order);
}

function mergeRepair(
  state: DictState,
  found: BundledResult,
  missing: DictListEntry[],
  user: UserResult | null,
): void {
  for (const [base, entry] of found.loaded) state.bundled.set(base, entry);
  state.missing = [
    ...found.failed,
    ...state.missing.filter(
      (entry) => !missing.includes(entry) && !state.bundled.has(entry.base),
    ),
  ];
  if (user) {
    state.user = user.loaded;
    state.userIncomplete = user.incomplete;
  }
}

function dropBroken(state: DictState, broken: StarDict[]): void {
  for (const dict of broken) {
    for (const [base, entry] of state.bundled) {
      if (entry.dict !== dict) continue;
      state.bundled.delete(base);
      const listed = stardictList.find((item) => item.base === base);
      if (listed && !state.missing.includes(listed)) state.missing.push(listed);
    }
    if (state.user.some((entry) => entry.dict === dict)) {
      state.user = state.user.filter((entry) => entry.dict !== dict);
      state.userIncomplete = true;
    }
  }
}

export function createStarDictStore(deps: StarDictStoreDeps): StarDictStore {
  let starDicts: StarDict[] = [];
  let loadedDicts: LoadedDict[] = [];
  let state = emptyState();
  let dictOrder: string[] = [];
  let generation = 0;
  let starDictLoading: Promise<void> | null = null;
  let repairing: Promise<void> | null = null;
  let repairAt = 0;
  let repairCount = 0;

  function composeDicts(): void {
    loadedDicts = composeList(state, dictOrder);
    starDicts = loadedDicts.map((entry) => entry.dict);
    deps.onScripts(starDicts.some((dict) => isLatinDict(dict)));
  }

  function scheduleRepair(): void {
    repairCount = needsRepair(state) ? repairCount + 1 : 0;
    repairAt = repairCount ? Date.now() + backoff(repairCount - 1) : 0;
  }

  async function loadAllDicts(): Promise<void> {
    const current = generation;
    const [found, user, order] = await Promise.all([
      loadBundled(deps.dir, stardictList),
      loadUser(),
      loadDictOrder().catch(() => []),
    ]);
    if (current !== generation) return;
    state = {
      bundled: new Map(found.loaded),
      missing: found.failed,
      user: user.loaded,
      userIncomplete: user.incomplete,
    };
    dictOrder = order;
    composeDicts();
    scheduleRepair();
  }

  async function repairDicts(): Promise<void> {
    const current = generation;
    const missing = state.missing.slice();
    const repairUser = state.userIncomplete;
    const found = missing.length
      ? await loadBundled(deps.dir, missing)
      : { loaded: [], failed: [] };
    const user = repairUser ? await loadUser() : null;
    if (current !== generation) return;
    mergeRepair(state, found, missing, user);
    composeDicts();
    scheduleRepair();
  }

  async function ensure(): Promise<void> {
    if (!starDictLoading) starDictLoading = loadAllDicts();
    await starDictLoading;
    if (!needsRepair(state)) return;
    if (Date.now() < repairAt) return;
    if (!repairing)
      repairing = repairDicts().finally(() => {
        repairing = null;
      });
    await repairing;
  }

  return {
    ensure,
    reset() {
      generation++;
      starDictLoading = null;
      repairing = null;
      repairAt = 0;
      repairCount = 0;
      state = emptyState();
      composeDicts();
    },
    async reorder() {
      await ensure();
      dictOrder = await loadDictOrder().catch(() => dictOrder);
      composeDicts();
    },
    online() {
      repairAt = 0;
      repairCount = 0;
    },
    dicts: () => starDicts,
    loaded: () => loadedDicts,
    async withDicts(run) {
      await ensure();
      const broken: StarDict[] = [];
      const result = await run(starDicts, broken);
      if (!broken.length) return result;
      dropBroken(state, broken);
      composeDicts();
      repairAt = 0;
      await ensure();
      return run(starDicts, []);
    },
  };
}
