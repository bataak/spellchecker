import { initProjectPanel, type ProjectPanel } from "./projectpanel.ts";
import {
  ProjectError,
  hasProject,
  onProjectChange,
  openDirHandle,
  project,
  projectKey,
  projectText,
  restoreProject,
  saveProject,
  setActive,
  setLinked,
  setMain,
  setProjectText,
} from "./projectstore.ts";
import { baseName, isTexSource } from "./texproject.ts";
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
  readonly layout: () => void;
  readonly notify: (message: string) => void;
}

export interface ProjectLink {
  readonly bound: () => boolean;
  readonly path: () => string | null;
  readonly key: () => string | null;
  readonly unbind: (forget: boolean) => void;
  readonly adopt: (strict: boolean) => void;
  readonly save: () => Promise<string | null>;
  readonly openZip: (file: File) => Promise<void>;
  readonly openDir: (handle: FileSystemDirectoryHandle) => Promise<void>;
  readonly restore: () => Promise<void>;
  readonly sync: () => void;
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

  const openFile = (path: string): void => {
    const view = project();
    if (!view || view.pending) return;
    const text = projectText(path);
    if (text === null) return;
    if (bound && boundPath === path) {
      editor.focus({ preventScroll: true });
      return;
    }
    pushText();
    remember();
    setActive(path);
    bind(path);
    const place = places.get(path);
    deps.bindName(baseName(path));
    editor.value = "";
    editor.value = text;
    if (place) editor.setSelectionRange(place.start, place.end);
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
      adopt(false);
      if (bound) return;
    }
    if (prefer && !bound && deps.fileName() === prefer) {
      const saved = projectText(prefer);
      if (saved !== null) {
        setProjectText(prefer, editor.value);
        if (isTexSource(prefer) && /\\documentclass\b/.test(editor.value))
          setMain(prefer);
        openFile(prefer);
        return;
      }
    }
    openFile(view.active);
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
        ? { name, handle: deps.fileHandle() }
        : null;
    },
    onClosed: () => storeSlot(null),
    onLayout: deps.layout,
    notify: deps.notify,
  });

  editor.addEventListener("input", pushText);

  onProjectChange(() => {
    const view = project();
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
    }
    deps.onChange();
  });

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
      return result === "downloaded"
        ? "Zip татлаа"
        : result === "files"
          ? "Файл татлаа"
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
        if (!(await restoreProject())) return;
      } catch (error) {
        fail(error);
        return;
      }
      adopt(false);
      panel.sync();
    },
    sync: panel.sync,
  };
}
