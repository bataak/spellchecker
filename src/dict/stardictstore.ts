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

export function createStarDictStore(deps: StarDictStoreDeps): StarDictStore {
  let starDicts: StarDict[] = [];
  let loadedDicts: LoadedDict[] = [];
  let bundled = new Map<string, LoadedDict>();
  let bundledMissing: DictListEntry[] = [];
  let userDicts: LoadedDict[] = [];
  let userIncomplete = false;
  let dictOrder: string[] = [];
  let generation = 0;
  let starDictLoading: Promise<void> | null = null;
  let repairing: Promise<void> | null = null;
  let repairAt = 0;
  let repairCount = 0;

  function composeDicts(): void {
    const list = [
      ...stardictList.flatMap((entry) => {
        const found = bundled.get(entry.base);
        return found ? [found] : [];
      }),
      ...userDicts,
    ];
    loadedDicts = sortByOrder(list, dictOrder);
    starDicts = loadedDicts.map((entry) => entry.dict);
    deps.onScripts(starDicts.some((dict) => isLatinDict(dict)));
  }

  function scheduleRepair(): void {
    if (!bundledMissing.length && !userIncomplete) {
      repairCount = 0;
      repairAt = 0;
      return;
    }
    const delay =
      RELOAD_BACKOFF[Math.min(repairCount, RELOAD_BACKOFF.length - 1)]!;
    repairCount++;
    repairAt = Date.now() + delay;
  }

  async function loadAllDicts(): Promise<void> {
    const current = generation;
    const [found, user, order] = await Promise.all([
      loadBundled(deps.dir, stardictList),
      loadUser(),
      loadDictOrder().catch(() => []),
    ]);
    if (current !== generation) return;
    bundled = new Map(found.loaded);
    bundledMissing = found.failed;
    userDicts = user.loaded;
    userIncomplete = user.incomplete;
    dictOrder = order;
    composeDicts();
    scheduleRepair();
  }

  async function repairDicts(): Promise<void> {
    const current = generation;
    const missing = bundledMissing.slice();
    const repairUser = userIncomplete;
    const found = missing.length
      ? await loadBundled(deps.dir, missing)
      : { loaded: [], failed: [] };
    const user = repairUser ? await loadUser() : null;
    if (current !== generation) return;
    for (const [base, entry] of found.loaded) bundled.set(base, entry);
    bundledMissing = [
      ...found.failed,
      ...bundledMissing.filter(
        (entry) => !missing.includes(entry) && !bundled.has(entry.base),
      ),
    ];
    if (user) {
      userDicts = user.loaded;
      userIncomplete = user.incomplete;
    }
    composeDicts();
    scheduleRepair();
  }

  async function ensure(): Promise<void> {
    if (!starDictLoading) starDictLoading = loadAllDicts();
    await starDictLoading;
    if (!bundledMissing.length && !userIncomplete) return;
    if (Date.now() < repairAt) return;
    if (!repairing)
      repairing = repairDicts().finally(() => {
        repairing = null;
      });
    await repairing;
  }

  function markBroken(broken: StarDict[]): void {
    for (const dict of broken) {
      for (const [base, entry] of bundled) {
        if (entry.dict !== dict) continue;
        bundled.delete(base);
        const listed = stardictList.find((item) => item.base === base);
        if (listed && !bundledMissing.includes(listed))
          bundledMissing.push(listed);
      }
      if (userDicts.some((entry) => entry.dict === dict)) {
        userDicts = userDicts.filter((entry) => entry.dict !== dict);
        userIncomplete = true;
      }
    }
    composeDicts();
    repairAt = 0;
  }

  return {
    ensure,
    reset() {
      generation++;
      starDictLoading = null;
      repairing = null;
      repairAt = 0;
      repairCount = 0;
      bundled = new Map();
      bundledMissing = [];
      userDicts = [];
      userIncomplete = false;
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
      markBroken(broken);
      await ensure();
      return run(starDicts, []);
    },
  };
}
