import {
  cleanPath,
  isEditablePath,
  isLatexDocument,
  isTexSource,
  within,
} from "../tex/texproject.ts";
import { dirHandleFor, removeEntry, writeEntry } from "./projectdisk.ts";
import { dropEntries, moveEntries, putDir, putFile } from "./projectedit.ts";
import { ProjectError } from "./projecterror.ts";
import { moveOnDisk } from "./projectsave.ts";
import { exists, markDirty, type State } from "./projectstate.ts";
import type { StoreCore } from "./storecore.ts";

const TAKEN = "Ийм нэртэй зүйл байна";

export function createEditors(core: StoreCore) {
  function setProjectText(path: string, text: string): void {
    const s = core.state();
    if (!s || s.pending || !s.texts.has(path) || s.texts.get(path) === text)
      return;
    s.texts.set(path, text);
    markDirty(s, path);
    core.changed(false);
  }

  function setActive(path: string | null): void {
    const s = core.state();
    if (!s || s.active === path) return;
    s.active = path;
    void core.persist.save();
    core.notify();
  }

  function setMain(path: string): void {
    const s = core.state();
    const text = s?.texts.get(path);
    if (!s || !isTexSource(path) || text === undefined || s.main === path)
      return;
    if (!isLatexDocument(text)) return;
    s.main = path;
    core.changed(true);
  }

  async function storeFile(
    s: State,
    path: string,
    bytes: Uint8Array,
  ): Promise<void> {
    const root = core.diskRoot();
    if (root) await writeEntry(root, path, bytes);
    putFile(s, path, bytes);
    core.changed(true);
  }

  async function createFile(path: string): Promise<void> {
    const s = core.require();
    const clean = cleanPath(path);
    if (!clean) throw new ProjectError("Файлын нэр буруу байна");
    if (exists(s, clean)) throw new ProjectError(TAKEN);
    await storeFile(s, clean, new Uint8Array(0));
  }

  function projectHas(path: string): boolean {
    const s = core.state();
    const clean = cleanPath(path);
    return !!s && !!clean && exists(s, clean);
  }

  async function addFile(path: string, bytes: Uint8Array): Promise<void> {
    const s = core.require();
    const clean = cleanPath(path);
    if (!clean) throw new ProjectError("Файлын нэр буруу байна");
    if (
      s.dirs.has(clean) ||
      (exists(s, clean) && !s.texts.has(clean) && !s.binaries.has(clean))
    )
      throw new ProjectError(TAKEN);
    await storeFile(s, clean, bytes);
  }

  async function createDir(path: string): Promise<void> {
    const s = core.require();
    const clean = cleanPath(path);
    if (!clean) throw new ProjectError("Хавтасны нэр буруу байна");
    if (exists(s, clean)) throw new ProjectError(TAKEN);
    if (s.kind === "dir" && s.handle) await dirHandleFor(s.handle, clean, true);
    putDir(s, clean);
    core.changed(true);
  }

  async function renamePath(from: string, to: string): Promise<void> {
    const s = core.require();
    const target = cleanPath(to);
    if (!target) throw new ProjectError("Нэр буруу байна");
    if (target === from) return;
    if (exists(s, target, from)) throw new ProjectError(TAKEN);
    if (within(target, from))
      throw new ProjectError("Хавтсыг өөр дотор нь зөөх боломжгүй");
    if (s.dirty.has(from) && !isEditablePath(target))
      throw new ProjectError(
        "Хадгалаагүй өөрчлөлттэй файлыг засах боломжгүй төрөл рүү нэрлэхгүй",
      );
    const root = core.diskRoot();
    if (root) await moveOnDisk(s, root, from, target);
    moveEntries(s, from, target);
    core.changed(true);
  }

  async function removePath(path: string): Promise<void> {
    const s = core.require();
    const root = core.diskRoot();
    if (root) await removeEntry(root, path);
    dropEntries(s, path);
    core.changed(true);
  }

  return {
    setProjectText,
    setActive,
    setMain,
    createFile,
    projectHas,
    addFile,
    createDir,
    renamePath,
    removePath,
  };
}
