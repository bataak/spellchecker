import { TEX_LIVE_YEAR, TEX_PACKAGE_INDEX } from "./texpackages.ts";
import { isXz } from "../archive/xz.ts";
import { KEYS, readJson, writeJson } from "../core/store.ts";
import { noteError } from "../core/errorlog.ts";

export { wantedFiles } from "./texmissing.ts";

const CACHE_NAME = "tex-packages";
const CACHE_LIMIT_BYTES = 32 * 1024 * 1024;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 60_000;
const FETCH_TIMEOUT_MS = 300_000;
const UNPACK_TIMEOUT_MS = 60_000;

type IndexRow = readonly [
  size: number,
  maps: readonly string[],
  files: readonly string[],
];
type Index = Readonly<Record<string, IndexRow>>;
type Meta = Record<string, { size: number; used: number }>;

export interface TexPackage {
  readonly name: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly maps: readonly string[];
}

export class TexPackageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TexPackageError";
  }
}

const endpoint = (import.meta.env.VITE_TEX_PACKAGES_URL ?? "").replace(
  /\/*$/,
  "/",
);

export function packagesEnabled(): boolean {
  return endpoint !== "/";
}

function packageUrl(name: string): string {
  return endpoint + TEX_LIVE_YEAR + "/" + name + ".tar.xz";
}

let index: Promise<Index> | null = null;

function loadIndex(): Promise<Index> {
  index ??= fetch(import.meta.env.BASE_URL + TEX_PACKAGE_INDEX)
    .then(async (response) => {
      if (!response.ok) throw new Error(String(response.status));
      return ((await response.json()) as { packages: Index }).packages;
    })
    .catch(() => {
      index = null;
      throw new TexPackageError(
        "TeX багцын жагсаалтыг татаж чадсангүй — интернэт холболтоо шалгана уу",
      );
    });
  return index;
}

export async function packagesFor(
  files: readonly string[],
  skip: (name: string) => boolean,
): Promise<string[]> {
  const rows = await loadIndex();
  const wanted = new Set(files);
  const owner = new Map<string, string>();
  for (const [name, [size, , list]] of Object.entries(rows))
    for (const file of list) {
      if (!wanted.has(file)) continue;
      const current = owner.get(file);
      if (current === undefined || rows[current]![0] > size)
        owner.set(file, name);
    }
  return [...new Set(owner.values())].filter((name) => !skip(name));
}

const failed = new Map<string, { at: number; error: TexPackageError }>();

function readMeta(): Meta {
  const meta = readJson(KEYS.texMeta);
  return meta !== null && typeof meta === "object" ? (meta as Meta) : {};
}

function writeMeta(meta: Meta): void {
  writeJson(KEYS.texMeta, meta);
}

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function prune(cache: Cache, keepName: string): Promise<void> {
  const meta = readMeta();
  const now = Date.now();
  const known = new Set<string>();
  for (const [name, row] of Object.entries(meta)) {
    if (name !== keepName && now - row.used > CACHE_MAX_AGE_MS)
      delete meta[name];
    else known.add(packageUrl(name));
  }
  const byAge = Object.entries(meta)
    .filter(([name]) => name !== keepName)
    .sort(([, a], [, b]) => a.used - b.used);
  let total = Object.values(meta).reduce((sum, row) => sum + row.size, 0);
  for (const [name, row] of byAge) {
    if (total <= CACHE_LIMIT_BYTES) break;
    total -= row.size;
    delete meta[name];
    known.delete(packageUrl(name));
  }
  writeMeta(meta);
  try {
    for (const request of await cache.keys())
      if (!known.has(request.url)) await cache.delete(request);
  } catch (error) {
    noteError(error);
  }
}

function touch(name: string, size: number): void {
  const meta = readMeta();
  meta[name] = { size, used: Date.now() };
  writeMeta(meta);
}

async function download(name: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(packageUrl(name), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new TexPackageError(
      "«" +
        name +
        "» TeX багцыг татаж чадсангүй — интернэт холболтоо шалгана уу",
      { cause },
    );
  }
  if (response.status === 404)
    throw new TexPackageError("«" + name + "» TeX багц олдсонгүй");
  if (!response.ok)
    throw new TexPackageError(
      "«" + name + "» TeX багцыг татаж чадсангүй (" + response.status + ")",
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isXz(bytes))
    throw new TexPackageError("«" + name + "» TeX багц эвдэрсэн байна");
  return bytes;
}

let unpacker: Worker | null = null;
let unpackSeq = 0;
const unpacking = new Map<
  number,
  {
    resolve: (files: [string, Uint8Array][]) => void;
    reject: (error: Error) => void;
  }
>();

function unpackWorker(): Worker {
  if (unpacker) return unpacker;
  const worker = new Worker(new URL("./texunpack.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (
    event: MessageEvent<{
      id: number;
      files?: [string, Uint8Array][];
      error?: string;
    }>,
  ) => {
    const job = unpacking.get(event.data.id);
    if (!job) return;
    unpacking.delete(event.data.id);
    if (event.data.files) job.resolve(event.data.files);
    else job.reject(new Error(event.data.error ?? "unpack"));
  };
  worker.onerror = () => {
    for (const job of unpacking.values()) job.reject(new Error("unpack"));
    unpacking.clear();
    worker.terminate();
    unpacker = null;
  };
  unpacker = worker;
  return worker;
}

function unpack(
  bytes: Uint8Array,
  keep: readonly string[],
): Promise<[string, Uint8Array][]> {
  return new Promise((resolve, reject) => {
    const id = ++unpackSeq;
    const timer = setTimeout(() => {
      unpacking.delete(id);
      reject(new Error("unpack timeout"));
    }, UNPACK_TIMEOUT_MS);
    unpacking.set(id, {
      resolve: (files) => {
        clearTimeout(timer);
        resolve(files);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    unpackWorker().postMessage({ id, bytes, keep });
  });
}

async function packageBytes(
  name: string,
  cache: Cache | null,
): Promise<Uint8Array> {
  const url = packageUrl(name);
  const hit = await cache?.match(url).catch(() => undefined);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const bytes = await download(name);
  if (cache) {
    try {
      await cache.put(url, new Response(bytes.slice()));
      touch(name, bytes.length);
      await prune(cache, name);
    } catch (error) {
      noteError(error);
    }
  }
  return bytes;
}

export async function loadPackage(name: string): Promise<TexPackage> {
  const previous = failed.get(name);
  if (previous && Date.now() - previous.at < RETRY_AFTER_MS)
    throw previous.error;
  try {
    const row = (await loadIndex())[name];
    if (!row) throw new TexPackageError("«" + name + "» TeX багц олдсонгүй");
    const [, maps, files] = row;
    const cache = await openCache();
    const bytes = await packageBytes(name, cache);
    let unpacked: [string, Uint8Array][];
    try {
      unpacked = await unpack(bytes, files);
    } catch {
      await cache?.delete(packageUrl(name)).catch(() => false);
      throw new TexPackageError("«" + name + "» TeX багц эвдэрсэн байна");
    }
    if (cache) touch(name, bytes.length);
    failed.delete(name);
    return { name, files: new Map(unpacked), maps };
  } catch (error) {
    const reason =
      error instanceof TexPackageError
        ? error
        : new TexPackageError("«" + name + "» TeX багцыг ачаалж чадсангүй");
    failed.set(name, { at: Date.now(), error: reason });
    throw reason;
  }
}
