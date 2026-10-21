import { baseName, documentFolders, isTexSource } from "../tex/texproject.ts";
import { attemptAsync } from "../core/attempt.ts";
import type { LoadedRepo } from "./git/gitsync.ts";
import { readDir } from "./projectdisk.ts";
import { applyScan } from "./projectedit.ts";
import { ProjectError } from "./projecterror.ts";
import {
  pickDirectoryFiles,
  readFileList,
  readZip,
  type LoadedFiles,
} from "./projectsources.ts";
import { withStamps, type ProjectKind, type State } from "./projectstate.ts";
import type { StoreCore } from "./storecore.ts";

async function writeGranted(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    return (
      (await handle.queryPermission?.({ mode: "readwrite" })) === "granted"
    );
  } catch {
    return false;
  }
}

async function chooseDirectory(
  near: FileSystemFileHandle | null,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker!({
      mode: "readwrite",
      ...(near ? { startIn: near } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      return null;
    throw error;
  }
}

export function createOpeners(core: StoreCore) {
  const fromLoaded = (kind: ProjectKind, loaded: LoadedFiles): State =>
    core.fresh(kind, loaded.name, null, loaded.files, loaded.dirs);

  let refreshing: Promise<boolean> | null = null;

  function refreshProject(): Promise<boolean> {
    refreshing ??= refreshFromDisk().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function refreshFromDisk(): Promise<boolean> {
    const s = core.state();
    if (!s || s.pending || s.kind !== "dir" || !s.handle) return false;
    if (!(await writeGranted(s.handle))) return false;
    const scan = await readDir(s.handle, s.stamps);
    if (core.state() !== s) return false;
    const conflicts: string[] = [];
    if (!applyScan(s, scan, (path) => conflicts.push(path))) return false;
    core.changed(true);
    if (conflicts.length) core.conflict(conflicts);
    return true;
  }

  function adopt(next: State): void {
    if (next.main === null)
      throw new ProjectError(
        "Төсөлд \\documentclass болон \\begin{document} бүхий үндсэн .tex файл олдсонгүй",
      );
    const before = core.state();
    next.active = next.main ?? [...next.texts.keys()].find(isTexSource) ?? null;
    next.twin =
      before !== null &&
      before.name === next.name &&
      before.main !== null &&
      next.main !== null &&
      baseName(before.main) !== baseName(next.main);
    core.replace(next);
    void core.persist
      .save(true)
      .then(() => (next.kind === "dir" ? core.persist.dropFiles() : undefined));
    core.notify();
  }

  async function openDirHandle(
    handle: FileSystemDirectoryHandle,
  ): Promise<void> {
    const writable = await attemptAsync(
      async () =>
        (await handle.requestPermission?.({ mode: "readwrite" })) === "granted",
      false,
    );
    const { files, dirs, stamps } = await readDir(handle);
    adopt(
      withStamps(
        core.fresh(
          writable ? "dir" : "folder",
          handle.name,
          writable ? handle : null,
          files,
          dirs,
        ),
        stamps,
      ),
    );
  }

  async function pickFolder(
    near: FileSystemFileHandle | null = null,
  ): Promise<boolean> {
    if (window.showDirectoryPicker) {
      const handle = await chooseDirectory(near);
      if (!handle) return false;
      await openDirHandle(handle);
      return true;
    }
    const picked = await pickDirectoryFiles();
    if (!picked.length) return false;
    adopt(fromLoaded("folder", await readFileList(picked)));
    return true;
  }

  async function openZip(file: File): Promise<void> {
    adopt(fromLoaded("memory", await readZip(file)));
  }

  async function openGitRepo(
    loaded: LoadedRepo,
    pick: (folders: string[]) => Promise<string | null>,
  ): Promise<boolean> {
    const next = fromLoaded("git", loaded);
    next.remote = loaded.remote;
    const folders = documentFolders(next.texts);
    if (folders.size > 1) {
      const folder = await pick([...folders.keys()]);
      const main = folder === null ? undefined : folders.get(folder);
      if (main === undefined) return false;
      next.main = main;
    }
    adopt(next);
    return true;
  }

  return { refreshProject, openDirHandle, pickFolder, openZip, openGitRepo };
}
