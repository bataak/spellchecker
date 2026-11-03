import { isEditablePath, parentDirs, within } from "../tex/texproject.ts";
import type { CopyChange, Plan, WorkingCopy } from "./git/gitsync.ts";
import { dropEntries } from "./projectedit.ts";
import { conflictsOf, merge3, resolveChunks } from "./git/merge3.ts";
import {
  diskText,
  noteEol,
  readText,
  recountDirty,
  type State,
} from "./projectstate.ts";

function placeRemoteFile(s: State, path: string, bytes: Uint8Array): void {
  for (const dir of [...s.dirs]) if (within(dir, path)) s.dirs.delete(dir);
  if (isEditablePath(path)) {
    const { text, crlf } = readText(bytes);
    noteEol(s, path, crlf);
    s.texts.set(path, text);
    s.saved.set(path, text);
  } else s.binaries.set(path, bytes);
  for (const dir of parentDirs(path)) s.dirs.add(dir);
}

function rebase(seen: string, current: string, incoming: string): string {
  const chunks = merge3(seen, current, incoming);
  return resolveChunks(
    chunks,
    conflictsOf(chunks).map(() => "both"),
  );
}

function applyPulled(
  s: State,
  pulled: ReadonlyMap<string, Uint8Array | null>,
): void {
  for (const [path, bytes] of pulled) if (bytes === null) dropEntries(s, path);
  for (const [path, bytes] of pulled)
    if (bytes !== null) placeRemoteFile(s, path, bytes);
}

function rebaseTyped(
  s: State,
  before: ReadonlyMap<string, string | undefined>,
  seen: ReadonlyMap<string, string | undefined>,
): void {
  for (const [path, current] of before) {
    const base = seen.get(path);
    const incoming = s.texts.get(path);
    if (
      current !== undefined &&
      base !== undefined &&
      incoming !== undefined &&
      current !== base
    )
      s.texts.set(path, rebase(base, current, incoming));
  }
}

function settleCommit(s: State, plan: Plan): void {
  for (const [path, text] of plan.texts) {
    s.saved.set(path, text);
    s.added.delete(path);
  }
  for (const [path] of plan.writes) s.fresh.delete(path);
  for (const path of plan.deletes) s.saved.delete(path);
  s.unsynced = false;
}

function applyChange(s: State, change: CopyChange): void {
  const seen = change.seen ?? new Map<string, string | undefined>();
  const before = new Map([...seen.keys()].map((p) => [p, s.texts.get(p)]));
  applyPulled(s, change.pulled ?? new Map());
  for (const [path, text] of change.merged ?? []) s.texts.set(path, text);
  rebaseTyped(s, before, seen);
  for (const dir of change.dirs ?? []) s.dirs.add(dir);
  if (change.committed) settleCommit(s, change.committed);
  s.remote = change.remote;
  recountDirty(s);
}

export function workingCopy(
  s: State,
  pulled: () => void = () => {},
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
      if (change.pulled) pulled();
    },
  };
}
