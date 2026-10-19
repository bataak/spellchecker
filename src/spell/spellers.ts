import { fetchGzBytes, loadDictBytes } from "../dict/dictrefresh.ts";
import {
  resolveBackend,
  type SpellBackend,
  type SpellerInstance,
} from "./backend.ts";

export const DICTIONARIES = [
  { id: "mn_MN", label: "Монгол" },
  { id: "en_GB", label: "English (UK)" },
  { id: "en_US", label: "English (US)" },
];
export const PRIMARY = "mn_MN";

export interface Speller {
  readonly id: string;
  readonly inst: SpellerInstance;
}

interface ManifestEntry {
  id: string;
  version: string | null;
  aff: string;
  dic: string;
}

export interface SpellersDeps {
  readonly asset: (path: string) => string;
  readonly netFetch: typeof fetch;
  readonly onUpdated: (id: string, version: string) => void;
}

export interface Spellers {
  start(): Promise<SpellBackend>;
  load(id: string): Promise<string>;
  refresh(): Promise<void>;
  setActive(ids: readonly string[]): void;
  primary(): SpellerInstance | undefined;
  active(): Speller[];
  version(): string | null;
}

const utf8 = new TextDecoder("utf-8");

const cacheOnlyFetch: typeof fetch = async (input) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const hit = await caches.match(url, { ignoreSearch: true });
  if (!hit) throw new Error("precache-д алга: " + url);
  return hit;
};

const order = (item: { id: string }): number =>
  DICTIONARIES.findIndex((dict) => dict.id === item.id);

export function createSpellers(deps: SpellersDeps): Spellers {
  const { asset } = deps;
  const instances: Speller[] = [];
  const active = new Set<string>(DICTIONARIES.map((dict) => dict.id));
  let backend: SpellBackend | null = null;
  let manifest: Record<string, ManifestEntry> | null = null;
  let mnVersion: string | null = null;
  let refreshing = false;

  const put = (id: string, inst: SpellerInstance): SpellerInstance | null => {
    const index = instances.findIndex((item) => item.id === id);
    if (index >= 0) {
      const previous = instances[index]!.inst;
      instances[index] = { id, inst };
      return previous;
    }
    instances.push({ id, inst });
    instances.sort((a, b) => order(a) - order(b));
    return null;
  };

  async function loadManifest(): Promise<Record<string, ManifestEntry>> {
    if (import.meta.env.DEV) {
      const out: Record<string, ManifestEntry> = {};
      for (const dict of DICTIONARIES) {
        out[dict.id] = {
          id: dict.id,
          version: null,
          aff: dict.id + ".aff",
          dic: dict.id + ".dic",
        };
      }
      return out;
    }
    const res = await fetch(asset("dict/dict-manifest.json"));
    if (!res.ok) throw new Error("dict-manifest.json -> " + res.status);
    const data = (await res.json()) as { dicts?: ManifestEntry[] };
    const out: Record<string, ManifestEntry> = {};
    for (const entry of data.dicts || []) out[entry.id] = entry;
    return out;
  }

  async function load(id: string): Promise<string> {
    const entry = manifest![id];
    if (!entry) throw new Error(id + " manifest-д алга");
    const [aff, dic] = await Promise.all([
      fetchGzBytes(asset("dict/" + entry.aff)),
      fetchGzBytes(asset("dict/" + entry.dic)),
    ]);
    const inst = await backend!.build(aff, dic, id);
    if (id === PRIMARY) {
      mnVersion =
        entry.version ||
        utf8
          .decode(aff)
          .match(/^#?\s*Version:\s*(.+)$/m)?.[1]!
          .trim() ||
        null;
    }
    put(id, inst);
    return id;
  }

  async function refresh(): Promise<void> {
    if (import.meta.env.DEV) return;
    if (refreshing || !backend || !manifest) return;
    refreshing = true;
    try {
      const url =
        asset("dict/dict-manifest.json") + "?fresh=" + String(Date.now());
      const res = await deps.netFetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { dicts?: ManifestEntry[] };
      const entry = (data.dicts || []).find((dict) => dict.id === PRIMARY);
      if (!entry || !entry.version) return;
      if (entry.version === mnVersion) return;
      const files = await loadDictBytes(
        asset("dict/" + entry.aff),
        asset("dict/" + entry.dic),
        [cacheOnlyFetch, deps.netFetch],
      );
      if (!files) return;
      const inst = await backend.build(files[0], files[1], PRIMARY);
      if (
        typeof inst.spell !== "function" ||
        typeof inst.suggest !== "function"
      )
        return;
      const previous = put(PRIMARY, inst);
      manifest[PRIMARY] = entry;
      mnVersion = entry.version;
      deps.onUpdated(PRIMARY, entry.version);
      if (previous && previous.dispose) {
        try {
          previous.dispose();
        } catch (_) {}
      }
    } catch (_) {
    } finally {
      refreshing = false;
    }
  }

  return {
    async start() {
      backend = await resolveBackend();
      manifest = await loadManifest();
      return backend;
    },
    load,
    refresh,
    setActive(ids) {
      active.clear();
      for (const id of ids) active.add(id);
      active.add(PRIMARY);
    },
    primary: () => instances.find((item) => item.id === PRIMARY)?.inst,
    active: () => instances.filter(({ id }) => active.has(id)),
    version: () => mnVersion,
  };
}
