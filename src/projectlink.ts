import { initProjectPanel, type ProjectPanel } from "./projectpanel.ts";
import {
  ProjectError,
  hasProject,
  onProjectChange,
  openDirHandle,
  project,
  projectKey,
  projectText,
  refreshProject,
  restoreProject,
  saveProject,
  setActive,
  setLinked,
  closeProject,
  setMain,
  setProjectText,
} from "./projectstore.ts";
import {
  baseName,
  isLatexDocument,
  isTexSource,
  masterPath,
  referencesFiles,
  texMaster,
} from "./texproject.ts";
import { TEMPLATE_INPUT } from "./undohistory.ts";

const SLOT_KEY = "mn-spell:project-slot";

export interface ProjectLinkDeps {
  readonly editor: HTMLTextAreaElement;
  readonly workspace: HTMLElement;
  readonly tools: () => HTMLElement | null;
  readonly slot: () => string;
  readonly fileName: () => string | null;
  readonly fileHandle: () => FileSystemFileHandle | null;
  readonly texActive: () => boolean;
  readonly bindName: (name: string | null) => void;
  readonly afterSwitch: () => void;
  readonly onChange: () => void;
  readonly onProject: (name: string | null) => void;
  readonly inSlot: () => boolean;
  readonly enterSlot: () => void;
  readonly closeFileSlot: (id: string) => void;
  readonly layout: () => void;
  readonly notify: (message: string) => void;
}

export interface ProjectLink {
  readonly bound: () => boolean;
  readonly path: () => string | null;
  readonly key: () => string | null;
  readonly unbind: (forget: boolean) => void;
  readonly adopt: (strict: boolean) => void;
  readonly enter: () => void;
  readonly close: () => void;
  readonly save: () => Promise<string | null>;
  readonly openZip: (file: File) => Promise<void>;
  readonly openDir: (handle: FileSystemDirectoryHandle) => Promise<void>;
  readonly restore: () => Promise<void>;
  readonly sync: () => void;
  readonly fileOpened: (name: string) => void;
  readonly cleared: () => void;
}

interface Place {
  readonly start: number;
  readonly end: number;
  readonly scroll: number;
}

function storedSlot(): string | null {
  try {
    return localStorage.getItem(SLOT_KEY);
  } catch {
    return null;
  }
}

function storeSlot(slot: string | null): void {
  try {
    if (slot === null) localStorage.removeItem(SLOT_KEY);
    else localStorage.setItem(SLOT_KEY, slot);
  } catch {}
}

export function initProjectLink(deps: ProjectLinkDeps): ProjectLink {
  const { editor } = deps;
  let bound = false;
  let boundPath: string | null = null;
  let boundId = 0;
  const places = new Map<string, Place>();

  const pushText = (): void => {
    if (bound && boundPath) setProjectText(boundPath, editor.value);
  };

  const remember = (): void => {
    if (!bound || !boundPath) return;
    places.set(boundPath, {
      start: editor.selectionStart,
      end: editor.selectionEnd,
      scroll: editor.scrollTop,
    });
  };

  const bind = (path: string): void => {
    bound = true;
    boundPath = path;
    boundId = project()?.id ?? 0;
    setLinked(true);
    storeSlot(deps.slot());
  };

  const unbind = (forget: boolean): void => {
    remember();
    bound = false;
    boundPath = null;
    setLinked(false);
    if (forget) storeSlot(null);
  };

  let entering = false;

  const openFile = (path: string): void => {
    const view = project();
    if (!view || view.pending) return;
    if (projectText(path) === null) return;
    if (!deps.inSlot()) {
      entering = true;
      try {
        deps.enterSlot();
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
    bound = false;
    setActive(path);
    bind(path);
    deps.bindName(baseName(path));
    load(text, places.get(path) ?? null);
  };

  const load = (text: string, place: Place | null): void => {
    editor.value = "";
    editor.value = text;
    const end = text.length;
    if (place)
      editor.setSelectionRange(
        Math.min(place.start, end),
        Math.min(place.end, end),
      );
    else editor.setSelectionRange(0, 0);
    editor.focus({ preventScroll: true });
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: TEMPLATE_INPUT,
      }),
    );
    editor.scrollTop = place?.scroll ?? 0;
    deps.afterSwitch();
  };

  const adopt = (strict: boolean): void => {
    const view = project();
    if (!view?.active || view.pending || bound) return;
    if (deps.fileName() !== baseName(view.active)) return;
    if (
      strict
        ? projectText(view.active) !== editor.value
        : storedSlot() !== deps.slot()
    )
      return;
    bind(view.active);
    pushText();
    deps.afterSwitch();
  };

  const opened = (fresh: boolean, prefer?: string): void => {
    const view = project();
    if (!view?.active) return;
    if (!fresh) {
      if (deps.inSlot()) adopt(false);
      if (bound) return;
      openFile(view.active);
      return;
    }
    const fromSlot = deps.slot();
    const fromText = editor.value;
    const target =
      prefer !== undefined && deps.fileName() === prefer
        ? locate(view.files, prefer, fromText)
        : null;
    if (target !== null) {
      setProjectText(target, fromText);
      const master = texMaster(fromText);
      const main = master === null ? null : masterPath(target, master);
      if (isTexSource(target) && isLatexDocument(fromText)) setMain(target);
      else if (main !== null && projectText(main) !== null) setMain(main);
    }
    openFile(target ?? view.active);
    if (target !== null && fromSlot !== deps.slot())
      deps.closeFileSlot(fromSlot);
  };

  const locate = (
    files: readonly string[],
    name: string,
    text: string,
  ): string | null => {
    const matches = files.filter(
      (path) => path === name || baseName(path) === name,
    );
    return (
      matches.find((path) => projectText(path) === text) ??
      matches.sort((a, b) => a.split("/").length - b.split("/").length)[0] ??
      null
    );
  };

  const enter = (): void => {
    if (entering || bound) return;
    const view = project();
    if (!view?.active || view.pending) return;
    adopt(true);
    if (!bound) openFile(view.active);
  };

  const close = (): void => {
    const view = project();
    if (
      view?.unsaved &&
      !window.confirm("Хадгалаагүй өөрчлөлт байна. Төслийг хаах уу?")
    )
      return;
    closeProject();
    storeSlot(null);
  };

  const panel: ProjectPanel = initProjectPanel({
    workspace: deps.workspace,
    tools: deps.tools,
    texActive: () => bound || deps.texActive(),
    openFile,
    beforeOpen: () => {
      const view = project();
      return (
        !view?.unsaved ||
        window.confirm(
          "Нээлттэй төсөлд хадгалаагүй өөрчлөлт байна. Шинэ төсөл нээх үү?",
        )
      );
    },
    onOpened: opened,
    openedFile: () => {
      const name = deps.fileName();
      return name && !bound && /\.(tex|ltx)$/i.test(name)
        ? { name, handle: deps.fileHandle(), master: texMaster(editor.value) }
        : null;
    },
    onClosed: () => storeSlot(null),
    onLayout: deps.layout,
    notify: deps.notify,
  });

  editor.addEventListener("input", (event) => {
    if (event instanceof InputEvent && event.data === TEMPLATE_INPUT) return;
    pushText();
  });

  let shownName: string | null = null;
  onProjectChange(() => {
    const view = project();
    const name = view?.name ?? null;
    if (name !== shownName) {
      shownName = name;
      deps.onProject(name);
    }
    if (bound && !view) {
      unbind(true);
      deps.bindName(null);
      deps.afterSwitch();
    } else if (bound && view && view.id !== boundId) {
      unbind(false);
    } else if (bound && view) {
      if (view.active === null) {
        unbind(false);
        if (view.main) openFile(view.main);
        else {
          deps.bindName(null);
          deps.afterSwitch();
        }
        return;
      }
      if (view.active !== null && view.active !== boundPath) {
        const moved = places.get(boundPath ?? "");
        if (moved && boundPath) places.delete(boundPath);
        boundPath = view.active;
        if (moved) places.set(view.active, moved);
        deps.bindName(baseName(view.active));
      }
      const text = boundPath === null ? null : projectText(boundPath);
      if (
        text !== null &&
        text !== editor.value &&
        boundPath !== null &&
        !view.dirty.has(boundPath)
      )
        load(text, {
          start: editor.selectionStart,
          end: editor.selectionEnd,
          scroll: editor.scrollTop,
        });
    }
    deps.onChange();
  });

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
    if (error instanceof ProjectError) deps.notify(error.message);
    else if (!(error instanceof DOMException && error.name === "AbortError")) {
      console.error("project:", error);
      deps.notify("Төслийг нээж чадсангүй");
    }
  };

  return {
    bound: () => bound,
    path: () => (bound ? boundPath : null),
    key: () => {
      if (!bound) return null;
      pushText();
      return projectKey();
    },
    unbind,
    adopt,
    async save() {
      if (!bound || !hasProject()) return null;
      pushText();
      const result = await saveProject();
      if (result === "files")
        deps.notify(
          "Засварласан файлуудыг «Татаж авсан файлууд» хавтас руу татлаа — анхны файлыг тэдгээрээр солино уу",
        );
      return result === "downloaded"
        ? "Zip татлаа"
        : result === "files"
          ? "Засварласан файлуудыг татлаа"
          : result === "saved"
            ? "Хадгаллаа"
            : "Өөрчлөлт алга";
    },
    async openZip(file) {
      const view = project();
      if (
        view?.unsaved &&
        !window.confirm(
          "Нээлттэй төсөлд хадгалаагүй өөрчлөлт байна. Шинэ төсөл нээх үү?",
        )
      )
        return;
      await panel.openZipFile(file);
    },
    async openDir(handle) {
      const view = project();
      if (
        view?.unsaved &&
        !window.confirm(
          "Нээлттэй төсөлд хадгалаагүй өөрчлөлт байна. Шинэ төсөл нээх үү?",
        )
      )
        return;
      try {
        await openDirHandle(handle);
        panel.show(true);
        opened(true);
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
      panel.sync();
    },
    sync: panel.sync,
    enter,
    close,
    cleared() {
      unbind(true);
      panel.show(false);
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
