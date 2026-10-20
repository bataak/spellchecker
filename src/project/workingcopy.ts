import { isEditablePath, parentDirs } from "../tex/texproject.ts";
import type { CopyChange, WorkingCopy } from "./git/gitsync.ts";
import { dropEntries } from "./projectedit.ts";
import {
  diskText,
  noteEol,
  readText,
  recountDirty,
  type State,
} from "./projectstate.ts";

function applyRemoteFile(
  s: State,
  path: string,
  bytes: Uint8Array | null,
): void {
  if (bytes === null) {
    dropEntries(s, path);
    return;
  }
  if (isEditablePath(path)) {
    const { text, crlf } = readText(bytes);
    noteEol(s, path, crlf);
    s.texts.set(path, text);
    s.saved.set(path, text);
  } else s.binaries.set(path, bytes);
  for (const dir of parentDirs(path)) s.dirs.add(dir);
}

function applyChange(s: State, change: CopyChange): void {
  for (const [path, bytes] of change.pulled ?? [])
    applyRemoteFile(s, path, bytes);
  for (const [path, text] of change.merged ?? []) s.texts.set(path, text);
  for (const dir of change.dirs ?? []) s.dirs.add(dir);
  const plan = change.committed;
  if (plan) {
    for (const [path, text] of plan.texts) {
      s.saved.set(path, text);
      s.added.delete(path);
    }
    for (const [path] of plan.writes) s.fresh.delete(path);
    for (const path of plan.deletes) s.saved.delete(path);
    s.unsynced = false;
  }
  s.remote = change.remote;
  recountDirty(s);
}

export function workingCopy(
  s: State,
  applied: () => void = () => {},
): WorkingCopy {
  const encoder = new TextEncoder();
  return {
    texts: s.texts,
    binaries: s.binaries,
    saved: (path) => s.saved.get(path),
    added: (path) => s.added.has(path),
    encode: (path, text) => encoder.encode(diskText(s, path, text)),
    apply: (change) => {
      applyChange(s, change);
      applied();
    },
  };
}
