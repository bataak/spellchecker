import {
  baseName,
  dirName,
  joinPath,
  movedPath,
  skippedPath,
} from "../tex/texproject.ts";
import { ProjectError } from "./projecterror.ts";

const MAX_FILES = 3000;
export const MAX_BYTES = 200 * 1024 * 1024;

type IterableDir = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
};

export function budget(): { take: (size: number) => void } {
  let files = 0;
  let bytes = 0;
  return {
    take(size) {
      files += 1;
      bytes += size;
      if (files > MAX_FILES)
        throw new ProjectError(
          "Төсөлд хэт олон файл байна (" + MAX_FILES + "-аас ихгүй)",
        );
      if (bytes > MAX_BYTES)
        throw new ProjectError("Төсөл хэт том байна (200 MB-аас ихгүй)");
    },
  };
}

export interface DirScan {
  readonly files: [string, Uint8Array][];
  readonly same: string[];
  readonly dirs: string[];
  readonly stamps: Map<string, string>;
}

export async function readDir(
  dir: FileSystemDirectoryHandle,
  known: ReadonlyMap<string, string> = new Map(),
): Promise<DirScan> {
  const files: [string, Uint8Array][] = [];
  const same: string[] = [];
  const dirs: string[] = [];
  const stamps = new Map<string, string>();
  const limit = budget();
  const walk = async (
    handle: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<void> => {
    for await (const entry of (handle as IterableDir).values()) {
      const path = joinPath(prefix, entry.name);
      if (skippedPath(path)) continue;
      if (entry.kind === "directory") {
        dirs.push(path);
        await walk(entry as FileSystemDirectoryHandle, path);
        continue;
      }
      const file = await (entry as FileSystemFileHandle).getFile();
      limit.take(file.size);
      const stamp = file.size + ":" + file.lastModified;
      stamps.set(path, stamp);
      if (known.get(path) === stamp) same.push(path);
      else files.push([path, new Uint8Array(await file.arrayBuffer())]);
    }
  };
  await walk(dir, "");
  return { files, same, dirs, stamps };
}

export async function dirHandleFor(
  root: FileSystemDirectoryHandle,
  dir: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const part of dir ? dir.split("/") : [])
    current = await current.getDirectoryHandle(part, { create });
  return current;
}

export async function writeEntry(
  root: FileSystemDirectoryHandle,
  path: string,
  data: Uint8Array | string,
): Promise<void> {
  const dir = await dirHandleFor(root, dirName(path), true);
  const file = await dir.getFileHandle(baseName(path), { create: true });
  const stream = await file.createWritable();
  await stream.write(
    typeof data === "string"
      ? data
      : new Blob([data as Uint8Array<ArrayBuffer>]),
  );
  await stream.close();
}

export async function readEntry(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<Uint8Array | null> {
  try {
    const dir = await dirHandleFor(root, dirName(path), false);
    const file = await (await dir.getFileHandle(baseName(path))).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export async function removeEntry(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  try {
    const dir = await dirHandleFor(root, dirName(path), false);
    await dir.removeEntry(baseName(path), { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError"))
      throw error;
  }
}

export async function copyDir(
  source: FileSystemDirectoryHandle,
  target: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const entry of (source as IterableDir).values()) {
    if (entry.kind === "directory") {
      await copyDir(
        entry as FileSystemDirectoryHandle,
        await target.getDirectoryHandle(entry.name, { create: true }),
      );
      continue;
    }
    const file = await (entry as FileSystemFileHandle).getFile();
    const out = await target.getFileHandle(entry.name, { create: true });
    const stream = await out.createWritable();
    await stream.write(file);
    await stream.close();
  }
}

export async function moveEntry(
  root: FileSystemDirectoryHandle,
  move: {
    readonly from: string;
    readonly source: string;
    readonly target: string;
    readonly dir: boolean;
  },
  files: Iterable<readonly [string, Uint8Array | string]>,
): Promise<void> {
  const { from, source, target } = move;
  if (move.dir) {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await dirHandleFor(root, source, false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError")
        return;
      throw error;
    }
    await copyDir(dir, await dirHandleFor(root, target, true));
    await removeEntry(root, source);
    return;
  }
  for (const [path, data] of files) {
    const next = movedPath(path, from, target);
    if (next === null) continue;
    if (typeof data !== "string") {
      await writeEntry(root, next, data);
      continue;
    }
    const bytes = await readEntry(root, movedPath(path, from, source) ?? path);
    await writeEntry(root, next, bytes ?? data);
  }
  await removeEntry(root, source);
}
