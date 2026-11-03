import {
  TEX_BUNDLE,
  TEX_FONT_FILES,
  TEX_FONTS,
  TEX_ENGINE,
} from "./texbundle.ts";
import { noteError } from "../core/errorlog.ts";
import { KEYS, at } from "../core/store.ts";
import { session } from "./texsession.ts";

export const OFFLINE_KEY = at(KEYS.texOffline, TEX_BUNDLE + TEX_FONTS);

interface AssetLoads {
  bundle: Promise<ArrayBuffer> | null;
  warmed: Promise<boolean> | null;
  fonts: Promise<boolean> | null;
}

const loads: AssetLoads = { bundle: null, warmed: null, fonts: null };

const FONT_CACHE = "tex-" + TEX_FONTS.split("/")[1];

export function asset(path: string): string {
  return import.meta.env.BASE_URL + path;
}

async function fontCache(): Promise<Cache | null> {
  try {
    return await caches.open(FONT_CACHE);
  } catch {
    return null;
  }
}

function sendFont(worker: Worker, name: string, data: ArrayBuffer): void {
  worker.postMessage({ cmd: "writetex", name, src: new Uint8Array(data) }, [
    data,
  ]);
}

const memoryFonts = new Map<string, ArrayBuffer>();

export function loadBundle(): Promise<ArrayBuffer> {
  loads.bundle ??= fetch(asset(TEX_BUNDLE))
    .then((response) => {
      if (!response.ok) throw new Error("TeX файлууд татагдсангүй");
      return response.arrayBuffer();
    })
    .catch((error: unknown) => {
      loads.bundle = null;
      throw error;
    });
  return loads.bundle;
}

export async function loadCachedFonts(worker: Worker): Promise<void> {
  const cache = await fontCache();
  if (!cache) {
    for (const [name, data] of memoryFonts)
      sendFont(worker, name, data.slice(0));
    return;
  }
  for (const name of TEX_FONT_FILES) {
    const hit = await cache.match(asset(TEX_FONTS + name));
    if (hit) sendFont(worker, name, await hit.arrayBuffer());
  }
}

async function dropOldFontCaches(): Promise<void> {
  try {
    for (const key of await caches.keys())
      if (key.startsWith("tex-fonts-") && key !== FONT_CACHE)
        await caches.delete(key);
  } catch (error) {
    noteError(error);
  }
}

function warmEngine(): Promise<boolean> {
  loads.warmed ??= Promise.all([
    ...[TEX_ENGINE, TEX_ENGINE.replace(/\.js$/, ".wasm")].map((path) =>
      fetch(asset(path), { priority: "low" }).then((response) => {
        if (!response.ok) throw new Error(path);
      }),
    ),
    loadBundle(),
  ])
    .then(() => true)
    .catch(() => {
      loads.warmed = null;
      return false;
    });
  return loads.warmed;
}

async function persistStorage(): Promise<void> {
  try {
    if (navigator.storage && !(await navigator.storage.persisted()))
      await navigator.storage.persist();
  } catch (error) {
    noteError(error);
  }
}

export function prefetchFonts(): Promise<boolean> {
  const connection = (navigator as { connection?: { saveData?: boolean } })
    .connection;
  if (connection?.saveData) return Promise.resolve(false);
  loads.fonts ??= (async () => {
    void persistStorage();
    const engineReady = warmEngine();
    await dropOldFontCaches();
    const cache = await fontCache();
    let complete = true;
    for (const name of TEX_FONT_FILES) {
      const url = asset(TEX_FONTS + name);
      if (cache ? await cache.match(url) : memoryFonts.has(name)) continue;
      let response: Response;
      try {
        response = await fetch(url, { priority: "low" });
      } catch {
        complete = false;
        break;
      }
      if (!response.ok) {
        complete = false;
        continue;
      }
      const data = await response.arrayBuffer();
      if (!cache) memoryFonts.set(name, data.slice(0));
      else
        try {
          await cache.put(url, new Response(data.slice(0)));
        } catch {
          complete = false;
          break;
        }
      if (session.live) sendFont(session.live, name, data);
    }
    const ready = complete && (await engineReady);
    if (!ready) loads.fonts = null;
    return ready && cache !== null;
  })();
  return loads.fonts;
}
