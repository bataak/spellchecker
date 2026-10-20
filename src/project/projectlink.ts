import { failureMessage } from "./projecterror.ts";
import { initProjectPanel, type ProjectPanel } from "./projectpanel.ts";
import { askCommitMessage } from "./git/gitdialog.ts";
import {
  confirmClose,
  confirmReplace,
  conflictNotice,
  FILES_SAVED_NOTICE,
  findSameFile,
  isTexName,
  locateFile,
  commitSuggestion,
  saveMessage,
} from "./linkfiles.ts";
import type {
  ProjectSnapshot,
  ProjectStore,
  ProjectView,
  SaveResult,
} from "./projectstore.ts";
import {
  baseName,
  isLatexDocument,
  isTexSource,
  masterPath,
  referencesFiles,
  texMaster,
  viewableType,
} from "../tex/texproject.ts";
import type { PreviewSource } from "../preview/preview.ts";
import type { TexProject } from "./projectbuild.ts";
import { onSwap, swapOrigin, swapText } from "../editor/editortext.ts";
import { KEYS, read, remove, write } from "../core/store.ts";
import { escapeHtml } from "../core/htmlutil.ts";

const CANCELLED = "Цуцаллаа";
const COMMITTING = "Commit хийгдэж байна…";

export interface SlotFile {
  readonly id: string;
  readonly name: string;
  readonly text: string | null;
}

export interface SlotPort {
  readonly current: () => string;
  readonly inProject: () => boolean;
  readonly enterProject: () => void;
  readonly close: (id: string) => void;
  readonly files: () => SlotFile[];
}

export interface OpenFilePort {
  readonly name: () => string | null;
  readonly handle: () => FileSystemFileHandle | null;
  readonly bind: (name: string | null) => void;
}

export interface ProjectLinkDeps {
  readonly store: ProjectStore;
  readonly editor: HTMLTextAreaElement;
  readonly workspace: HTMLElement;
  readonly tools: () => HTMLElement | null;
  readonly openButton: HTMLElement | null;
  readonly slots: SlotPort;
  readonly file: OpenFilePort;
  readonly texActive: () => boolean;
  readonly onBound: (bound: boolean) => void;
  readonly afterSwitch: () => void;
  readonly onChange: () => void;
  readonly onProject: (name: string | null) => void;
  readonly layout: () => void;
  readonly notify: (message: string) => void;
  readonly show: (source: PreviewSource | null) => void;
}

export interface ProjectLink {
  readonly bound: () => boolean;
  readonly path: () => string | null;
  readonly key: () => string | null;
  readonly texProject: () => TexProject | null;
  readonly unbind: (forget: boolean) => void;
  readonly adopt: (strict: boolean) => void;
  readonly enter: () => void;
  readonly close: () => void;
  readonly save: (diskOnly?: boolean) => Promise<string | null>;
  readonly zip: () => Promise<Blob>;
  readonly zipped: () => void;
  readonly openZip: (file: File) => Promise<void>;
  readonly openDir: (handle: FileSystemDirectoryHandle) => Promise<void>;
  readonly restore: () => Promise<void>;
  readonly sync: () => void;
  readonly fileOpened: (name: string) => void;
  readonly openExisting: (name: string, text: string) => boolean;
  readonly cleared: () => void;
}

interface Place {
  readonly start: number;
  readonly end: number;
  readonly scroll: number;
}

function storedSlot(): string | null {
  return read(KEYS.projectSlot);
}

function storeSlot(slot: string | null): void {
  if (slot === null) remove(KEYS.projectSlot);
  else write(KEYS.projectSlot, slot);
}

export function initProjectLink(deps: ProjectLinkDeps): ProjectLink {
  const {
    hasProject,
    onDiskConflict,
    onProjectChange,
    openDirHandle,
    project,
    projectKey,
    projectBinary,
    projectSavedText,
    projectText,
    projectZip,
    projectSnapshot,
    markExported,
    refreshProject,
    restoreProject,
    saveProject,
    setActive,
    closeProject,
    setMain,
    setProjectText,
  } = deps.store;
  const { editor } = deps;
  let bound = false;
  let committing = false;
  let boundPath: string | null = null;
  let boundId = 0;
  const places = new Map<string, Place>();
  let detached = false;

  let zipSnap: ProjectSnapshot | null = null;

  const pushText = (): void => {
    if (bound && boundPath && !detached)
      setProjectText(boundPath, editor.value);
  };

  const remember = (): void => {
    if (!bound || !boundPath) return;
    places.set(boundPath, {
      start: editor.selectionStart,
      end: editor.selectionEnd,
      scroll: editor.scrollTop,
    });
  };

  const setBound = (on: boolean): void => {
    bound = on;
    deps.onBound(on);
  };

  const bind = (path: string): void => {
    setBound(true);
    boundPath = path;
    boundId = project()?.id ?? 0;
    detached = false;
    storeSlot(deps.slots.current());
  };

  const unbind = (forget: boolean): void => {
    remember();
    setBound(false);
    boundPath = null;
    if (forget) storeSlot(null);
  };

  let entering = false;
  let viewing = false;

  const openFile = (path: string): void => {
    const view = project();
    if (!view || view.pending) return;
    if (projectText(path) === null) return;
    if (!deps.slots.inProject()) {
      entering = true;
      try {
        deps.slots.enterProject();
      } finally {
        entering = false;
      }
    }
    const text = projectText(path);
    if (text === null) return;
    if (bound && boundPath === path) {
      editor.focus({ preventScroll: true });
      return;
    }
    pushText();
    remember();
    setBound(false);
    setActive(path);
    bind(path);
    deps.file.bind(baseName(path));
    load(text, places.get(path) ?? null);
  };

  const load = (text: string, place: Place | null): void => {
    const end = text.length;
    editor.focus({ preventScroll: true });
    swapText(editor, text, {
      origin: "project",
      start: Math.min(place?.start ?? 0, end),
      end: Math.min(place?.end ?? 0, end),
    });
    editor.scrollTop = place?.scroll ?? 0;
    deps.afterSwitch();
  };

  const adopt = (strict: boolean): void => {
    const view = project();
    if (!view?.active || view.pending || bound) return;
    if (deps.file.name() !== baseName(view.active)) return;
    if (
      strict
        ? projectText(view.active) !== editor.value
        : storedSlot() !== deps.slots.current()
    )
      return;
    bind(view.active);
    const text = projectText(view.active);
    if (text === null || text === editor.value) deps.afterSwitch();
    else
      load(text, {
        start: editor.selectionStart,
        end: editor.selectionEnd,
        scroll: editor.scrollTop,
      });
  };

  const opened = (fresh: boolean, prefer?: string): void => {
    const view = project();
    if (!view?.active) return;
    if (!fresh) {
      if (deps.slots.inProject()) adopt(false);
      if (!bound) openFile(view.active);
      absorb();
      return;
    }
    const fromSlot = deps.slots.current();
    const fromText = editor.value;
    const target =
      prefer !== undefined && deps.file.name() === prefer
        ? locateFile(view.files, prefer, fromText, projectText)
        : null;
    if (target !== null) {
      setProjectText(target, fromText);
      const master = texMaster(fromText);
      const main = master === null ? null : masterPath(target, master);
      if (isTexSource(target) && isLatexDocument(fromText)) setMain(target);
      else if (main !== null && projectText(main) !== null) setMain(main);
    }
    openFile(target ?? view.active);
    if (target !== null && fromSlot !== deps.slots.current())
      deps.slots.close(fromSlot);
    absorb();
  };

  const absorb = (): void => {
    const view = project();
    if (!view || view.pending) return;
    for (const slot of deps.slots.files()) {
      if (slot.text === null || slot.id === deps.slots.current()) continue;
      const text = slot.text;
      const same = findSameFile(
        view.files,
        slot.name,
        (path) => projectText(path) === text,
      );
      if (same !== undefined) deps.slots.close(slot.id);
    }
  };

  const enter = (): void => {
    if (entering || bound) return;
    const view = project();
    if (!view?.active || view.pending) return;
    adopt(true);
    if (!bound) openFile(view.active);
    panel.reveal();
  };

  const close = (): void => {
    if (!confirmClose(project()?.unsaved)) return;
    closeProject();
    storeSlot(null);
  };

  const panel: ProjectPanel = initProjectPanel({
    store: deps.store,
    workspace: deps.workspace,
    tools: deps.tools,
    texActive: () => bound || deps.texActive(),
    away: () =>
      hasProject() && !deps.slots.inProject() ? deps.slots.current() : null,
    openFile,
    view: (path) => {
      if (path === null) {
        if (viewing) deps.show(null);
        viewing = false;
        return true;
      }
      const type = viewableType(path);
      const bytes = projectBinary(path);
      if (type === null || bytes === null) return false;
      const file = new File(
        [bytes as Uint8Array<ArrayBuffer>],
        baseName(path),
        {
          type,
        },
      );
      deps.show({ kind: type === "application/pdf" ? "pdf" : "image", file });
      viewing = true;
      return true;
    },
    beforeOpen: () => confirmReplace(project()?.unsaved),
    onOpened: opened,
    openedFile: () => {
      const name = deps.file.name();
      return isTexName(name) && !bound
        ? { name, handle: deps.file.handle(), master: texMaster(editor.value) }
        : null;
    },
    onClosed: () => storeSlot(null),
    onLayout: deps.layout,
    notify: deps.notify,
  });

  const openButton = deps.openButton;
  openButton?.addEventListener("click", () => panel.openMenu(openButton));

  onSwap((origin) => {
    if (origin !== "project" && bound && !deps.slots.inProject())
      detached = true;
  });

  editor.addEventListener("input", (event) => {
    if (swapOrigin(event) === null) pushText();
  });

  let shownName: string | null = null;
  let shownId = 0;
  const announce = (view: ProjectView | null): void => {
    const name = view?.label ?? null;
    if (name === shownName && (view?.id ?? 0) === shownId) return;
    shownName = name;
    shownId = view?.id ?? 0;
    deps.onProject(name);
  };

  const leaveProject = (): void => {
    deps.file.bind(null);
    deps.afterSwitch();
  };

  const moveBound = (active: string): void => {
    const moved = places.get(boundPath ?? "");
    if (moved && boundPath) places.delete(boundPath);
    boundPath = active;
    if (moved) places.set(active, moved);
    deps.file.bind(baseName(active));
  };

  const reloadBound = (view: ProjectView): void => {
    if (boundPath === null || view.dirty.has(boundPath)) return;
    const text = projectText(boundPath);
    if (text === null || text === editor.value) return;
    load(text, {
      start: editor.selectionStart,
      end: editor.selectionEnd,
      scroll: editor.scrollTop,
    });
  };

  const followBound = (view: ProjectView | null): boolean => {
    if (!bound) return true;
    if (!view) {
      unbind(true);
      leaveProject();
      return true;
    }
    if (view.id !== boundId) {
      unbind(false);
      return true;
    }
    if (view.active === null) {
      unbind(false);
      if (view.main) openFile(view.main);
      else leaveProject();
      return false;
    }
    if (view.active !== boundPath) moveBound(view.active);
    reloadBound(view);
    return true;
  };

  onProjectChange(() => {
    const view = project();
    announce(view);
    if (followBound(view)) deps.onChange();
  });

  onDiskConflict((paths) => deps.notify(conflictNotice(paths)));

  let lastRefresh = 0;
  const refresh = (): void => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastRefresh < 1000) return;
    lastRefresh = Date.now();
    void refreshProject().catch(() => false);
  };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);

  const fail = (error: unknown): void => {
    const message = failureMessage(error, "Төслийг нээж чадсангүй");
    if (message !== null) deps.notify(message);
  };

  return {
    bound: () => bound,
    path: () => (bound ? boundPath : null),
    key: () => {
      if (!bound) return null;
      pushText();
      return projectKey();
    },
    texProject: () =>
      bound && hasProject()
        ? { build: deps.store.projectBuild, digest: deps.store.projectDigest }
        : null,
    unbind,
    adopt,
    async save(diskOnly = false) {
      if (!bound || !hasProject()) return null;
      if (diskOnly && project()?.kind !== "dir") return null;
      pushText();
      const view = project();
      let message = "";
      const git = view?.kind === "git";
      if (git) {
        if (committing) return COMMITTING;
        if (!view.unsaved) return saveMessage("clean");
        committing = true;
      }
      let result: SaveResult;
      try {
        if (git) {
          const asked = await askCommitMessage(
            commitSuggestion(view.dirty),
            view.provider ?? "github",
          );
          if (asked === null) return CANCELLED;
          message = asked;
        }
        result = await saveProject(message);
      } catch (error) {
        const text = failureMessage(error, "Хадгалж чадсангүй");
        if (text) deps.notify(escapeHtml(text));
        throw error;
      } finally {
        if (git) committing = false;
      }
      if (result === "files") deps.notify(FILES_SAVED_NOTICE);
      return saveMessage(result);
    },
    zip() {
      pushText();
      zipSnap = projectSnapshot();
      return projectZip();
    },
    zipped() {
      if (zipSnap) markExported(zipSnap);
      zipSnap = null;
    },
    async openZip(file) {
      if (!confirmReplace(project()?.unsaved)) return;
      await panel.openZipFile(file);
    },
    async openDir(handle) {
      if (!confirmReplace(project()?.unsaved)) return;
      const name = deps.file.name();
      const prefer = isTexName(name) && !bound ? name : undefined;
      try {
        await openDirHandle(handle);
        panel.show(true);
        opened(true, prefer);
      } catch (error) {
        fail(error);
      }
    },
    async restore() {
      try {
        if (!(await restoreProject())) {
          deps.onProject(null);
          return;
        }
      } catch (error) {
        fail(error);
        deps.onProject(null);
        return;
      }
      adopt(false);
      absorb();
      panel.sync();
    },
    sync: panel.sync,
    enter,
    close,
    cleared() {
      unbind(true);
      panel.show(false);
    },
    openExisting(name, text) {
      const view = project();
      if (!view || view.pending) return false;
      const path = findSameFile(
        view.files,
        name,
        (path) => projectText(path) === text || projectSavedText(path) === text,
      );
      if (path === undefined) return false;
      openFile(path);
      panel.reveal();
      return true;
    },
    fileOpened(name) {
      if (project() !== null) return;
      const text = editor.value;
      panel.show(
        isTexSource(name) &&
          ((isLatexDocument(text) && referencesFiles(text)) ||
            texMaster(text) !== null),
      );
    },
  };
}
