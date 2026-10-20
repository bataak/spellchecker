import { downloadBlob } from "../files/download.ts";
import { buildProject, type ProjectBuild } from "./projectbuild.ts";
import { markZipped, snapshotOf, type ProjectSnapshot } from "./projectedit.ts";
import { downloadChanged, writeChanged, zipOf } from "./projectsave.ts";
import { commitState } from "./git/gitsession.ts";
import type { Resolver } from "./git/gitsync.ts";
import type { StoreCore } from "./storecore.ts";

export type SaveResult =
  "saved" | "downloaded" | "files" | "committed" | "clean";

export function createSaving(core: StoreCore) {
  async function projectZip(): Promise<Blob> {
    return zipOf(core.require());
  }

  function projectSnapshot(): ProjectSnapshot {
    return snapshotOf(core.require());
  }

  function markExported(snap: ProjectSnapshot = projectSnapshot()): void {
    const s = core.state();
    if (!s || s.id !== snap.id) return;
    s.exportedAt = Date.now();
    if (s.kind === "memory") markZipped(s, snap);
    core.changed(true);
  }

  async function exportZip(): Promise<void> {
    const snap = projectSnapshot();
    downloadBlob(await projectZip(), core.require().name + ".zip");
    markExported(snap);
  }

  async function saveProject(
    message = "",
    resolve?: Resolver,
  ): Promise<SaveResult> {
    const s = core.require();
    if (s.kind === "git") {
      try {
        return (await commitState(s, message, resolve, () => {
          if (core.state() === s) core.changed(true);
        }))
          ? "committed"
          : "clean";
      } finally {
        core.changed(true);
      }
    }
    if (s.kind === "dir") {
      if (!(await writeChanged(s, core.diskRoot()))) return "clean";
      core.changed(true);
      return "saved";
    }
    if (s.kind === "folder") {
      if (!(await downloadChanged(s))) return "clean";
      core.changed(true);
      return "files";
    }
    await exportZip();
    return "downloaded";
  }

  function projectBuild(): Promise<ProjectBuild> {
    return buildProject(core.require());
  }

  return {
    projectZip,
    saveProject,
    exportZip,
    projectSnapshot,
    markExported,
    projectBuild,
  };
}
