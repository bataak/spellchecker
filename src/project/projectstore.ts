import { baseName } from "../tex/texproject.ts";
import type { Provider } from "./git/githost.ts";
import { digestOf } from "./projectsave.ts";
import type { ProjectKind, State } from "./projectstate.ts";
import { createStoreCore, type StoreCore } from "./storecore.ts";
import { createEditors } from "./storeedit.ts";
import { createOpeners } from "./storeopen.ts";
import { createRestore } from "./storerestore.ts";
import { createSaving } from "./storesave.ts";

export interface ProjectView {
  readonly id: number;
  readonly kind: ProjectKind;
  readonly name: string;
  readonly label: string;
  readonly files: readonly string[];
  readonly dirs: readonly string[];
  readonly main: string | null;
  readonly active: string | null;
  readonly dirty: ReadonlySet<string>;
  readonly unsaved: boolean;
  readonly pending: boolean;
  readonly version: number;
  readonly exportedAt: number | null;
  readonly uid: string;
  readonly provider: Provider | null;
}

export { ProjectError } from "./projecterror.ts";
export type { ProjectBuild } from "./projectbuild.ts";
export type { ProjectSnapshot } from "./projectedit.ts";
export type { ProjectKind } from "./projectstate.ts";
export type { SaveResult } from "./storesave.ts";

function viewOf(s: State): ProjectView {
  const dirty = new Set(s.dirty);
  return {
    id: s.id,
    kind: s.kind,
    name: s.name,
    label: s.twin && s.main ? s.name + " · " + baseName(s.main) : s.name,
    files: [...s.texts.keys(), ...s.binaries.keys()],
    dirs: [...s.dirs],
    main: s.main,
    active: s.active,
    dirty,
    unsaved:
      dirty.size > 0 ||
      s.fresh.size > 0 ||
      ((s.kind === "memory" || s.kind === "git") && s.unsynced),
    pending: s.pending,
    version: s.version,
    exportedAt: s.exportedAt,
    uid: s.uid,
    provider: s.remote?.provider ?? null,
  };
}

function createReaders(core: StoreCore) {
  let digestMemo: { id: number; version: number; value: string } | null = null;

  async function projectDigest(): Promise<string | null> {
    const s = core.state();
    if (!s || s.pending || !s.main) return null;
    if (digestMemo?.id === s.id && digestMemo.version === s.version)
      return digestMemo.value;
    const { id, version } = s;
    const value = await digestOf(s);
    if (value !== null) digestMemo = { id, version, value };
    return value;
  }

  return {
    onProjectChange: core.onChange,
    onDiskConflict: core.onConflict,
    project: (): ProjectView | null => {
      const s = core.state();
      return s ? viewOf(s) : null;
    },
    hasProject: (): boolean => {
      const s = core.state();
      return s !== null && !s.pending;
    },
    projectBinary: (path: string): Uint8Array | null =>
      core.state()?.binaries.get(path) ?? null,
    projectText: (path: string): string | null =>
      core.state()?.texts.get(path) ?? null,
    projectSavedText: (path: string): string | null =>
      core.state()?.saved.get(path) ?? null,
    projectKey: (): string | null => {
      const s = core.state();
      return s && !s.pending ? String(s.version) : null;
    },
    projectDigest,
  };
}

export function createProjectStore() {
  const core = createStoreCore();
  return {
    ...createReaders(core),
    ...createOpeners(core),
    ...createRestore(core),
    ...createEditors(core),
    ...createSaving(core),
  };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
