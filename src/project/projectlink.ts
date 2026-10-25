import { failureMessage } from "./projecterror.ts";
import { initProjectPanel, type ProjectPanel } from "./projectpanel.ts";
import {
  confirmClose,
  confirmReplace,
  conflictNotice,
  findSameFile,
  isTexName,
} from "./linkfiles.ts";
import type {
  ProjectSnapshot,
  ProjectStore,
  ProjectView,
} from "./projectstore.ts";
import {
  isLatexDocument,
  isTexSource,
  referencesFiles,
  texMaster,
} from "../tex/texproject.ts";
import type { PreviewSource } from "../preview/preview.ts";
import type { LoadedFiles } from "./projectsources.ts";
import type { TexProject } from "./projectbuild.ts";
import { onSwap, swapOrigin } from "../editor/editortext.ts";
import {
  createBinding,
  storeSlot,
  type BindDeps,
  type Binding,
} from "./linkbind.ts";
import { absorbSlots, createOpened, createViewer } from "./linkopen.ts";
import { createSave } from "./linksave.ts";

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

export interface PanelHost {
  readonly workspace: HTMLElement;
  readonly tools: () => HTMLElement | null;
  readonly openButton: HTMLElement | null;
  readonly fileButton: HTMLElement | null;
  readonly fileTypes: string;
  readonly texActive: () => boolean;
  readonly layout: () => void;
  readonly show: (source: PreviewSource | null) => void;
}

export interface ProjectLinkDeps extends BindDeps {
  readonly host: PanelHost;
  readonly onChange: () => void;
  readonly onProject: (name: string | null) => void;
  readonly notify: (message: string) => void;
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
  readonly openShared: (
    loaded: LoadedFiles,
    uid: string,
    main: string | null,
  ) => boolean;
  readonly drop: () => void;
  readonly restore: () => Promise<void>;
  readonly sync: () => void;
  readonly fileOpened: (name: string) => void;
  readonly openExisting: (name: string, text: string) => boolean;
  readonly cleared: () => void;
}

function watchProject(deps: ProjectLinkDeps, binding: Binding): void {
  const { store } = deps;
  onSwap((origin) => {
    if (origin !== "project" && binding.bound() && !deps.slots.inProject())
      binding.detach();
  });
  deps.editor.addEventListener("input", (event) => {
    if (swapOrigin(event) === null) binding.pushText();
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
  store.onProjectChange(() => {
    const view = store.project();
    announce(view);
    if (binding.follow(view)) deps.onChange();
  });
  store.onDiskConflict((paths) => deps.notify(conflictNotice(paths)));
  let lastRefresh = 0;
  const refresh = (): void => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastRefresh < 1000) return;
    lastRefresh = Date.now();
    void store.refreshProject().catch(() => false);
  };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
}

function projectPanelFor(
  deps: ProjectLinkDeps,
  binding: Binding,
  opened: (fresh: boolean, prefer?: string) => void,
): ProjectPanel {
  const { store, editor, host } = deps;
  return initProjectPanel({
    store,
    workspace: host.workspace,
    tools: host.tools,
    texActive: () => binding.bound() || host.texActive(),
    away: () =>
      store.hasProject() && !deps.slots.inProject()
        ? deps.slots.current()
        : null,
    openFile: binding.openFile,
    view: createViewer(store, host.show),
    beforeOpen: () => confirmReplace(store.project()?.unsaved),
    onOpened: opened,
    openedFile: () => {
      const name = deps.file.name();
      return isTexName(name) && !binding.bound()
        ? { name, handle: deps.file.handle(), master: texMaster(editor.value) }
        : null;
    },
    onClosed: () => storeSlot(null),
    onLayout: host.layout,
    notify: deps.notify,
  });
}

function bindOpenButton(host: PanelHost, panel: ProjectPanel): void {
  const openButton = host.openButton;
  if (!openButton) return;
  openButton.title = "Файл (" + host.fileTypes + ") эсвэл LaTeX төсөл нээх";
  openButton.addEventListener("click", () =>
    panel.openMenu(openButton, [
      { label: host.fileTypes, run: () => host.fileButton?.click() },
    ]),
  );
}

function findOpenFile(
  store: ProjectStore,
  name: string,
  text: string,
): string | undefined {
  const view = store.project();
  if (!view || view.pending) return undefined;
  return findSameFile(
    view.files,
    name,
    (path) =>
      store.projectText(path) === text || store.projectSavedText(path) === text,
  );
}

async function restoreInto(
  deps: ProjectLinkDeps,
  binding: Binding,
  panel: ProjectPanel,
  fail: (error: unknown) => void,
): Promise<void> {
  try {
    if (!(await deps.store.restoreProject())) {
      deps.onProject(null);
      return;
    }
  } catch (error) {
    fail(error);
    deps.onProject(null);
    return;
  }
  binding.adopt(false);
  absorbSlots(deps);
  panel.sync();
}

function sharedOpeners(
  store: ProjectStore,
  panel: ProjectPanel,
  opened: (fresh: boolean) => void,
  fail: (error: unknown) => void,
): Pick<ProjectLink, "openShared" | "drop"> {
  return {
    openShared(loaded, uid, main) {
      try {
        store.openShared(loaded, uid, main);
      } catch (error) {
        fail(error);
        return false;
      }
      panel.show(true);
      opened(true);
      return true;
    },
    drop() {
      store.closeProject();
      storeSlot(null);
    },
  };
}

export function initProjectLink(deps: ProjectLinkDeps): ProjectLink {
  const { store, editor } = deps;
  const binding = createBinding(deps);
  const opened = createOpened(deps, binding);
  const save = createSave(store, binding, deps.notify);
  let zipSnap: ProjectSnapshot | null = null;

  const enter = (): void => {
    if (binding.entering() || binding.bound()) return;
    const view = store.project();
    if (!view?.active || view.pending) return;
    binding.adopt(true);
    if (!binding.bound()) binding.openFile(view.active);
    panel.reveal();
  };

  const close = (): void => {
    if (!confirmClose(store.project()?.unsaved)) return;
    store.closeProject();
    storeSlot(null);
  };

  const panel = projectPanelFor(deps, binding, opened);
  bindOpenButton(deps.host, panel);
  watchProject(deps, binding);

  const fail = (error: unknown): void => {
    const message = failureMessage(error, "Төслийг нээж чадсангүй");
    if (message !== null) deps.notify(message);
  };

  return {
    bound: binding.bound,
    path: binding.path,
    key: () => {
      if (!binding.bound()) return null;
      binding.pushText();
      return store.projectKey();
    },
    texProject: () =>
      binding.bound() && store.hasProject()
        ? { build: store.projectBuild, digest: store.projectDigest }
        : null,
    unbind: binding.unbind,
    adopt: binding.adopt,
    save,
    zip() {
      binding.pushText();
      zipSnap = store.projectSnapshot();
      return store.projectZip();
    },
    zipped() {
      if (zipSnap) store.markExported(zipSnap);
      zipSnap = null;
    },
    async openZip(file) {
      if (!confirmReplace(store.project()?.unsaved)) return;
      await panel.openZipFile(file);
    },
    async openDir(handle) {
      if (!confirmReplace(store.project()?.unsaved)) return;
      const name = deps.file.name();
      const prefer = isTexName(name) && !binding.bound() ? name : undefined;
      try {
        await store.openDirHandle(handle);
        panel.show(true);
        opened(true, prefer);
      } catch (error) {
        fail(error);
      }
    },
    ...sharedOpeners(store, panel, opened, fail),
    restore: () => restoreInto(deps, binding, panel, fail),
    sync: panel.sync,
    enter,
    close,
    cleared() {
      binding.unbind(true);
      panel.show(false);
    },
    openExisting(name, text) {
      const path = findOpenFile(store, name, text);
      if (path === undefined) return false;
      binding.openFile(path);
      panel.reveal();
      return true;
    },
    fileOpened(name) {
      if (store.project() !== null) return;
      const text = editor.value;
      panel.show(
        isTexSource(name) &&
          ((isLatexDocument(text) && referencesFiles(text)) ||
            texMaster(text) !== null),
      );
    },
  };
}
