import { escapeHtml } from "../core/htmlutil.ts";
import type { ProjectStore } from "./projectstore.ts";
import {
  baseName,
  dirName,
  isEditablePath,
  isLatexDocument,
  isTexSource,
  joinPath,
} from "../tex/texproject.ts";
import { editName } from "./nameeditor.ts";
import { removeQuestion, replaceQuestion } from "./panelview.ts";
import type { MenuItem, ProjectMenu } from "./projectmenu.ts";
import { initTreeDrag, movedPath } from "./treedrag.ts";
import { rowOf, rowSelector } from "./treerows.ts";

export interface TreeState {
  readonly collapsed: Set<string>;
  selected: string | null;
  editing: HTMLInputElement | null;
  shown: string;
  focus: string | null;
}

export function createTreeState(): TreeState {
  return {
    collapsed: new Set(),
    selected: null,
    editing: null,
    shown: "",
    focus: null,
  };
}

export interface TreeControlDeps {
  readonly store: ProjectStore;
  readonly tree: HTMLElement;
  readonly state: TreeState;
  readonly menu: ProjectMenu;
  readonly render: () => void;
  readonly run: (task: () => Promise<unknown>) => Promise<void>;
  readonly notify: (message: string) => void;
  readonly openFile: (path: string) => void;
  readonly view: (path: string | null) => boolean;
  readonly closeDrawer: () => void;
}

export interface TreeControl {
  readonly startCreate: (dir: boolean) => void;
}

export function initTreeControl(deps: TreeControlDeps): TreeControl {
  const {
    addFile,
    createDir,
    createFile,
    project,
    projectHas,
    projectText,
    removePath,
    renamePath,
    setMain,
  } = deps.store;
  const { state } = deps;

  const isDir = (path: string): boolean =>
    project()?.dirs.includes(path) ?? false;

  const activate = (path: string): void => {
    if (isDir(path)) {
      if (state.collapsed.has(path)) state.collapsed.delete(path);
      else state.collapsed.add(path);
      deps.render();
      return;
    }
    if (!isEditablePath(path)) {
      if (deps.view(path)) {
        state.selected = path;
        deps.render();
        deps.closeDrawer();
        return;
      }
      deps.notify(escapeHtml(baseName(path)) + " — нээх боломжгүй файл");
      return;
    }
    deps.view(null);
    deps.openFile(path);
    deps.closeDrawer();
  };

  const targetDir = (): string => {
    if (state.selected === null) return "";
    return isDir(state.selected) ? state.selected : dirName(state.selected);
  };

  const finishEdit = (): void => {
    state.editing = null;
    state.shown = "";
    deps.render();
  };

  const nameEditor = { run: deps.run, notify: deps.notify, done: finishEdit };

  const insertRow = (input: HTMLInputElement): void => {
    state.editing = input;
    const holder = document.createElement("div");
    holder.className = "project-row is-new";
    const dir = targetDir();
    const depth = dir ? dir.split("/").length : 0;
    holder.style.setProperty("--depth", String(depth));
    holder.append(input);
    const anchor = dir
      ? deps.tree.querySelector<HTMLElement>(rowSelector(dir))
      : null;
    if (anchor) anchor.after(holder);
    else deps.tree.prepend(holder);
  };

  const startCreate = (dir: boolean): void => {
    const parent = targetDir();
    if (parent) state.collapsed.delete(parent);
    state.shown = "";
    deps.render();
    editName(nameEditor, insertRow, dir ? "" : "*.tex", async (name) => {
      const path = joinPath(parent, name);
      if (dir) {
        await createDir(path);
        state.selected = path;
        return;
      }
      await createFile(path);
      state.selected = path;
      if (isEditablePath(path)) deps.openFile(path);
    });
  };

  const startRename = (path: string): void => {
    const row = deps.tree.querySelector<HTMLElement>(rowSelector(path));
    if (!row) return;
    const inRow = (input: HTMLInputElement): void => {
      state.editing = input;
      row.querySelector(".project-name")?.replaceWith(input);
    };
    editName(nameEditor, inRow, baseName(path), async (name) => {
      const next = joinPath(dirName(path), name);
      await renamePath(path, next);
      state.selected = next;
    });
  };

  const replaceOk = (path: string): boolean => {
    const view = project();
    return window.confirm(
      replaceQuestion(
        baseName(path),
        view?.dirty.has(path) ?? false,
        view?.kind === "dir",
      ),
    );
  };

  const confirmRemove = (path: string): void => {
    const view = project();
    if (!view) return;
    const question = removeQuestion(
      baseName(path),
      isDir(path),
      view.kind === "dir",
    );
    if (!window.confirm(question)) return;
    void deps.run(async () => {
      await removePath(path);
      if (state.selected === path) state.selected = null;
    });
  };

  const openMenu = (path: string, x: number, y: number): void => {
    const view = project();
    if (!view || view.pending) return;
    state.selected = path;
    const dir = isDir(path);
    const items: MenuItem[] = [];
    const text = dir ? null : projectText(path);
    if (
      text !== null &&
      isTexSource(path) &&
      view.main !== path &&
      isLatexDocument(text)
    )
      items.push({ label: "Үндсэн файл болгох", run: () => setMain(path) });
    if (dir) {
      items.push({ label: "Шинэ файл үүсгэх", run: () => startCreate(false) });
      items.push({ label: "Шинэ хавтас үүсгэх", run: () => startCreate(true) });
    }
    items.push({ label: "Нэр солих", run: () => startRename(path) });
    items.push({
      label: "Устгах",
      run: () => confirmRemove(path),
      danger: true,
    });
    deps.menu.open(items, x, y);
  };

  deps.tree.addEventListener("click", (event) => {
    if ((event.target as Element).closest(".project-skip")) {
      state.focus = null;
      deps.render();
      return;
    }
    const row = rowOf(event.target);
    if (!row || row.classList.contains("is-new")) return;
    const path = row.dataset.path ?? "";
    if ((event.target as Element).closest(".project-more")) {
      const box = (event.target as Element)
        .closest(".project-more")!
        .getBoundingClientRect();
      openMenu(path, box.left, box.bottom + 4);
      return;
    }
    state.selected = path;
    activate(path);
    deps.render();
  });

  deps.tree.addEventListener("contextmenu", (event) => {
    const row = rowOf(event.target);
    if (!row || row.classList.contains("is-new")) return;
    event.preventDefault();
    openMenu(row.dataset.path ?? "", event.clientX, event.clientY);
  });

  deps.tree.addEventListener("keydown", (event) => {
    const row = rowOf(event.target);
    if (!row || state.editing) return;
    const rows = [...deps.tree.querySelectorAll<HTMLElement>(".project-row")];
    const at = rows.indexOf(row);
    const path = row.dataset.path ?? "";
    const focusRow = (next: HTMLElement | undefined): void => {
      if (!next) return;
      row.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    };
    if (event.key === "ArrowDown") focusRow(rows[at + 1]);
    else if (event.key === "ArrowUp") focusRow(rows[at - 1]);
    else if (
      event.key === "ArrowRight" &&
      isDir(path) &&
      state.collapsed.has(path)
    )
      activate(path);
    else if (
      event.key === "ArrowLeft" &&
      isDir(path) &&
      !state.collapsed.has(path)
    )
      activate(path);
    else if (event.key === "Enter" || event.key === " ") {
      state.selected = path;
      activate(path);
    } else if (event.key === "F2") startRename(path);
    else if (event.key === "Delete") confirmRemove(path);
    else if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      const box = row.getBoundingClientRect();
      openMenu(path, box.left + 24, box.bottom);
    } else return;
    event.preventDefault();
  });

  initTreeDrag({
    tree: deps.tree,
    active: () => project() !== null,
    editing: () => state.editing !== null,
    isDir,
    closeMenu: deps.menu.close,
    move: (from, dir) => {
      const to = movedPath(from, dir);
      void deps.run(async () => {
        await renamePath(from, to);
        if (dir) state.collapsed.delete(dir);
        state.selected = to;
      });
    },
    add: (dir, files) => {
      void deps.run(async () => {
        for (const file of files) {
          const target = joinPath(dir, file.name);
          if (projectHas(target) && !replaceOk(target)) continue;
          await addFile(target, new Uint8Array(await file.arrayBuffer()));
        }
      });
    },
  });

  return { startCreate };
}
