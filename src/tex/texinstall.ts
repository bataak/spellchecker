import { queryWorker } from "./workerquery.ts";
import { session } from "./texsession.ts";
import { noteError } from "../core/errorlog.ts";

interface EngineFiles {
  readonly bundled: ReadonlySet<string>;
  readonly baseMap: Uint8Array | null;
  readonly installed: Set<string>;
  readonly maps: Map<string, Uint8Array>;
}

export const engineFiles = new WeakMap<Worker, EngineFiles>();

const sessionPackages = new Set<string>();

const PACKAGE_ERROR =
  /File `[^']+' not found|I can't find file|Metric \(TFM\) file not found|cannot open Type 1 font file|cannot open encoding file|Font \S+ at \d+ not found|Package babel Error: Unknown option/;

const MISSES_TIMEOUT_MS = 2000;

interface MissesReply {
  readonly cmd?: string;
  readonly names?: string[];
}

function askMisses(worker: Worker): Promise<string[]> {
  return queryWorker<MissesReply, string[]>(
    worker,
    { cmd: "misses" },
    (reply) => (reply.cmd === "misses" ? (reply.names ?? []) : undefined),
    MISSES_TIMEOUT_MS,
  ).catch(() => []);
}

function writeMap(worker: Worker, state: EngineFiles): void {
  const parts = [state.baseMap ?? new Uint8Array(0), ...state.maps.values()];
  const newline = new Uint8Array([10]);
  const chunks = parts.flatMap((part) => [part, newline]);
  const size = chunks.reduce((sum, part) => sum + part.length, 0);
  const map = new Uint8Array(size);
  let at = 0;
  for (const part of chunks) {
    map.set(part, at);
    at += part.length;
  }
  worker.postMessage({ cmd: "writetex", name: "pdftex.map", src: map });
}

async function installPackage(worker: Worker, name: string): Promise<void> {
  const state = engineFiles.get(worker);
  if (!state || state.installed.has(name)) return;
  const { loadPackage } = await import("./texfetch.ts");
  session.packageNotice?.("«" + name + "» TeX багцыг ачаалж байна…");
  const pkg = await loadPackage(name);
  let mapsChanged = false;
  for (const map of pkg.maps) {
    const data = pkg.files.get(map);
    if (data && !state.maps.has(map)) {
      state.maps.set(map, data.slice());
      mapsChanged = true;
    }
  }
  for (const [file, data] of pkg.files)
    if (!state.bundled.has(file))
      worker.postMessage({ cmd: "writetex", name: file, src: data }, [
        data.buffer,
      ]);
  if (mapsChanged) writeMap(worker, state);
  state.installed.add(name);
  sessionPackages.add(name);
}

export async function reinstallPackages(worker: Worker): Promise<void> {
  for (const name of sessionPackages)
    try {
      await installPackage(worker, name);
    } catch (error) {
      noteError(error);
    }
}

export async function addPackages(
  worker: Worker,
  log: string,
): Promise<boolean> {
  if (!PACKAGE_ERROR.test(log)) return false;
  const fetcher = await import("./texfetch.ts");
  if (!fetcher.packagesEnabled()) return false;
  const state = engineFiles.get(worker);
  if (!state) return false;
  const files = fetcher.wantedFiles(log, await askMisses(worker));
  if (!files.length) return false;
  const names = await fetcher.packagesFor(files, (name) =>
    state.installed.has(name),
  );
  if (!names.length) return false;
  for (const name of names) await installPackage(worker, name);
  return true;
}
