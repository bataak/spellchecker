import { attemptAsync } from "../core/attempt.ts";
import { readDir } from "./projectdisk.ts";
import { applyEdits } from "./projectedit.ts";
import { storedEdits, storedFiles, storedMeta } from "./projectpersist.ts";
import {
  metaOf,
  newUid,
  withStamps,
  type Meta,
  type State,
} from "./projectstate.ts";
import type { StoreCore } from "./storecore.ts";

export function createRestore(core: StoreCore) {
  let pendingEdits: Record<string, string> = {};

  function applyRestored(
    next: State,
    meta: Meta,
    edits: Record<string, string>,
  ): void {
    applyEdits(next, meta, edits);
    core.replace(next);
    core.notify();
  }

  async function restoreFiles(
    meta: Meta,
    edits: Record<string, string>,
  ): Promise<boolean> {
    const files = await storedFiles();
    if (!files) return false;
    const next = core.fresh(
      meta.kind,
      meta.name,
      null,
      Object.entries(files),
      meta.dirs,
    );
    next.remote = meta.remote ?? null;
    applyRestored(next, meta, edits);
    return true;
  }

  async function restoreProject(): Promise<boolean> {
    const meta = await storedMeta();
    if (!meta) return false;
    const edits = await storedEdits();
    if (meta.kind !== "dir") return restoreFiles(meta, edits);
    if (!meta.handle) return false;
    const handle = meta.handle;
    const granted = await attemptAsync(
      async () =>
        (await handle.queryPermission?.({ mode: "readwrite" })) === "granted",
      false,
    );
    if (granted) {
      const { files, dirs, stamps } = await readDir(handle);
      applyRestored(
        withStamps(core.fresh("dir", meta.name, handle, files, dirs), stamps),
        meta,
        edits,
      );
      return true;
    }
    core.replace({
      ...core.fresh("dir", meta.name, handle, [], meta.dirs),
      pending: true,
      exportedAt: meta.exportedAt ?? null,
      main: meta.main,
      active: meta.active,
      twin: meta.twin ?? false,
      uid: meta.uid ?? newUid(),
    });
    pendingEdits = edits;
    core.notify();
    return true;
  }

  async function grantProject(): Promise<boolean> {
    const s = core.state();
    if (!s?.pending || !s.handle) return false;
    const handle = s.handle;
    const granted = await attemptAsync(
      async () =>
        (await handle.requestPermission?.({ mode: "readwrite" })) === "granted",
      false,
    );
    if (!granted) return false;
    const { files, dirs, stamps } = await readDir(handle);
    applyRestored(
      withStamps(core.fresh("dir", s.name, handle, files, dirs), stamps),
      metaOf(s),
      pendingEdits,
    );
    pendingEdits = {};
    return true;
  }

  function closeProject(): void {
    core.replace(null);
    pendingEdits = {};
    core.persist.clear();
    core.notify();
  }

  return { restoreProject, grantProject, closeProject };
}
