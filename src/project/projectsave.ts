import { noteError } from "../core/errorlog.ts";
import { fflate } from "../archive/fflate.ts";
import { downloadBlob } from "../files/download.ts";
import {
  baseName,
  dirName,
  joinPath,
  sameOnDisk,
  within,
} from "../tex/texproject.ts";
import { moveEntry, writeEntry } from "./projectdisk.ts";
import { diskText, recountDirty, type State } from "./projectstate.ts";

export async function writeChanged(
  s: State,
  root: FileSystemDirectoryHandle | null,
): Promise<boolean> {
  if (!s.dirty.size) return false;
  for (const path of s.dirty) {
    const text = s.texts.get(path);
    if (text === undefined) continue;
    if (root) await writeEntry(root, path, diskText(s, path, text));
    s.saved.set(path, text);
    s.added.delete(path);
  }
  s.unsynced = false;
  recountDirty(s);
  return true;
}

export async function downloadChanged(s: State): Promise<boolean> {
  const paths = new Set([
    ...[...s.dirty].filter((path) => s.texts.has(path)),
    ...s.fresh,
  ]);
  if (!paths.size) return false;
  for (const path of paths) {
    const text = s.texts.get(path);
    if (text === undefined) {
      const bytes = s.binaries.get(path);
      if (bytes)
        downloadBlob(
          new Blob([bytes as Uint8Array<ArrayBuffer>]),
          baseName(path),
        );
    } else {
      downloadBlob(
        new Blob([diskText(s, path, text)], {
          type: "text/plain;charset=utf-8",
        }),
        baseName(path),
      );
      s.saved.set(path, text);
      s.added.delete(path);
    }
    s.fresh.delete(path);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  s.unsynced = false;
  recountDirty(s);
  return true;
}

export async function zipOf(s: State): Promise<Blob> {
  const { zipSync } = await fflate();
  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = {};
  for (const [path, text] of s.texts)
    entries[path] = encoder.encode(diskText(s, path, text));
  for (const [path, bytes] of s.binaries) entries[path] = bytes;
  for (const dir of s.dirs)
    if (![...Object.keys(entries)].some((path) => within(path, dir)))
      entries[dir + "/"] = new Uint8Array(0);
  return new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], {
    type: "application/zip",
  });
}

export async function digestOf(s: State): Promise<string | null> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [encoder.encode(s.main + "\u0000")];
  const paths = [...s.texts.keys(), ...s.binaries.keys()].sort();
  for (const path of paths) {
    const text = s.texts.get(path);
    const data =
      text === undefined ? s.binaries.get(path)! : encoder.encode(text);
    parts.push(encoder.encode(path + "\u0000" + data.length + "\u0000"), data);
  }
  try {
    const bytes = await new Blob(parts as BlobPart[]).arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch (error) {
    noteError(error);
    return null;
  }
}

export async function moveOnDisk(
  s: State,
  root: FileSystemDirectoryHandle,
  from: string,
  target: string,
): Promise<void> {
  const files: [string, Uint8Array | string][] = [
    ...[...s.saved].map(([path, text]): [string, string] => [
      path,
      diskText(s, path, text),
    ]),
    ...s.binaries,
  ];
  const dir = s.dirs.has(from);
  if (!sameOnDisk(from, target)) {
    await moveEntry(root, { from, source: from, target, dir }, files);
    return;
  }
  const temp = joinPath(
    dirName(from),
    "." + baseName(from) + "-" + Date.now().toString(36),
  );
  await moveEntry(root, { from, source: from, target: temp, dir }, files);
  await moveEntry(root, { from, source: temp, target, dir }, files);
}
