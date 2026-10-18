import {
  addFile,
  closeProject,
  createDir,
  createFile,
  grantProject,
  onProjectChange,
  openZip,
  exportZip,
  pickFolder,
  refreshProject,
  project,
  projectHas,
  projectText,
  removePath,
  renamePath,
  setMain,
} from "./projectstore.ts";
import {
  baseName,
  dirName,
  isEditablePath,
  isLatexDocument,
  isTexSource,
  joinPath,
} from "../tex/texproject.ts";
import { KEYS, read, remove, write } from "../store.ts";
import { confirmClose } from "./linkfiles.ts";
import { failureMessage } from "./projecterror.ts";
import { editName } from "./nameeditor.ts";
import { buildPanel } from "./panelmarkup.ts";
import {
  emptyMessage,
  exportTitle,
  folderLabel,
  projectTitle,
  removeQuestion,
  replaceQuestion,
  treeStamp,
  type OpenedFile,
} from "./panelview.ts";
import { createProjectMenu, type MenuItem } from "./projectmenu.ts";
import { initTreeDrag, movedPath } from "./treedrag.ts";
import { rowOf, rowSelector, treeRows } from "./treerows.ts";

const PEEK_MS = 5000;

export interface ProjectPanelDeps {
  readonly workspace: HTMLElement;
  readonly tools: () => HTMLElement | null;
  readonly texActive: () => boolean;
  readonly away: () => string | null;
  readonly openFile: (path: string) => void;
  readonly view: (path: string | null) => boolean;
  readonly beforeOpen: () => boolean;
  readonly onOpened: (fresh: boolean, prefer?: string) => void;
  readonly openedFile: () => OpenedFile | null;
  readonly onClosed: () => void;
  readonly onLayout: () => void;
  readonly notify: (message: string) => void;
}

export interface ProjectPanel {
  readonly sync: () => void;
  readonly show: (on: boolean) => void;
  readonly openZipFile: (file: File) => Promise<void>;
  readonly reveal: () => void;
}

function loadOpen(): boolean {
  return read(KEYS.projectPanel) === "on";
}

function saveOpen(on: boolean): void {
  if (on) write(KEYS.projectPanel, "on");
  else remove(KEYS.projectPanel);
}

export function initProjectPanel(deps: ProjectPanelDeps): ProjectPanel {
  const wide = window.matchMedia("(min-width: 1024px)");
  const {
    panel,
    headIcon,
    title,
    hideBtn,
    newFileBtn,
    newDirBtn,
    exportBtn,
    closeBtn,
    refreshBtn,
    tree,
    empty,
    emptyText,
    folderBtn,
    zipBtn,
    grantBtn,
    forgetBtn,
    zipInput,
    foot,
    toggle,
  } = buildPanel();
  deps.workspace.prepend(panel);

  const menu = createProjectMenu(() =>
    tree.querySelector<HTMLElement>(".project-row[tabindex='0']")?.focus(),
  );
  const closeMenu = menu.close;

  let open = loadOpen() && wide.matches;
  let awayOpen: string | null = null;
  let laying = false;
  let wasFloating = false;
  const collapsed = new Set<string>();
  let selected: string | null = null;
  let editing: HTMLInputElement | null = null;
  let busy = false;
  let shownVersion = "";

  const fail = (error: unknown): void => {
    const message = failureMessage(
      error,
      "Төслийн үйлдлийг гүйцэтгэж чадсангүй",
    );
    if (message !== null) deps.notify(message);
  };

  const run = async (task: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    busy = true;
    panel.classList.add("is-busy");
    try {
      await task();
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
      panel.classList.remove("is-busy");
    }
  };

  const visible = (): boolean => {
    if (!deps.texActive()) return false;
    const away = deps.away();
    if (away !== null) return awayOpen === away;
    awayOpen = null;
    return open;
  };

  const place = (): void => {
    const tools = deps.tools();
    if (tools && toggle.parentElement !== tools) tools.prepend(toggle);
  };

  let flashTimer = 0;
  let peekTimer = 0;
  const keepPeek = (): void => {
    clearTimeout(peekTimer);
    peekTimer = 0;
  };
  panel.addEventListener("pointerdown", keepPeek);
  panel.addEventListener("wheel", keepPeek, { passive: true });
  panel.addEventListener("focusin", keepPeek);
  const flashToggle = (): void => {
    toggle.classList.add("is-shown");
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(
      () => toggle.classList.remove("is-shown"),
      5000,
    );
  };

  const syncVisibility = (): void => {
    place();
    const shown = visible();
    const hide = !deps.texActive() || shown;
    if (toggle.hidden && !hide) flashToggle();
    toggle.hidden = hide;
    toggle.setAttribute("aria-pressed", String(shown));
    toggle.classList.toggle("is-on", shown);
    if (panel.hidden === !shown) return;
    panel.hidden = !shown;
    const root = document.documentElement;
    if (shown) root.dataset.project = "on";
    else delete root.dataset.project;
    if (!shown) closeMenu();
    laying = true;
    try {
      deps.onLayout();
    } finally {
      laying = false;
    }
    wasFloating = floating();
  };

  const syncFloat = (): boolean => {
    if (laying || panel.hidden) return false;
    const now = floating();
    const turned = now && !wasFloating && wide.matches;
    wasFloating = now;
    if (!turned) return false;
    show(false);
    return true;
  };

  const show = (on: boolean): void => {
    const away = deps.away();
    if (away !== null) awayOpen = on ? away : null;
    if (on || away === null) {
      open = on;
      saveOpen(on);
    }
    syncVisibility();
    if (on) render();
  };

  const floating = (): boolean =>
    !wide.matches || "projectFloat" in document.documentElement.dataset;

  const closeDrawer = (): void => {
    if (!wide.matches) show(false);
  };

  const syncFoot = (exportedAt: number | null): void => {
    exportBtn.title = exportTitle(exportedAt, Date.now());
  };

  const render = (): void => {
    const view = project();
    syncVisibility();
    if (syncFloat() || panel.hidden) return;
    const pending = view?.pending ?? false;
    const ready = view !== null && !pending;
    title.textContent = view ? view.label : "LaTeX төсөл";
    title.title = projectTitle(view);
    headIcon.hidden = view === null;
    closeBtn.hidden = !ready;
    refreshBtn.hidden = !ready || view.kind !== "dir";
    exportBtn.hidden = !ready;
    exportBtn.classList.toggle(
      "is-due",
      ready && view.kind === "memory" && view.unsaved,
    );
    foot.hidden = !ready;
    if (ready) syncFoot(view.exportedAt);
    empty.hidden = ready;
    tree.hidden = !ready;
    const file = deps.openedFile();
    folderBtn.textContent = folderLabel(file, !!window.showDirectoryPicker);
    folderBtn.hidden = pending;
    zipBtn.hidden = pending;
    grantBtn.hidden = !pending;
    forgetBtn.hidden = !pending;
    emptyText.textContent = emptyMessage(pending ? view!.label : null, file);

    if (!ready) {
      tree.replaceChildren();
      shownVersion = "";
      return;
    }

    const stamp = treeStamp(view, collapsed, selected);
    if (editing || stamp === shownVersion) return;
    shownVersion = stamp;
    const focusPath =
      document.activeElement instanceof HTMLElement &&
      tree.contains(document.activeElement)
        ? document.activeElement.closest<HTMLElement>(".project-row")?.dataset
            .path
        : undefined;
    const rows = treeRows(view, collapsed, selected);
    tree.replaceChildren(...rows);
    const first =
      rows.find((row) => row.dataset.path === focusPath) ??
      rows.find((row) => row.classList.contains("is-active")) ??
      rows[0];
    if (first) first.tabIndex = 0;
    if (focusPath !== undefined && first) first.focus({ preventScroll: true });
  };

  const isDir = (path: string): boolean =>
    project()?.dirs.includes(path) ?? false;

  const activate = (path: string): void => {
    if (isDir(path)) {
      if (collapsed.has(path)) collapsed.delete(path);
      else collapsed.add(path);
      render();
      return;
    }
    if (!isEditablePath(path)) {
      if (deps.view(path)) {
        selected = path;
        render();
        closeDrawer();
        return;
      }
      deps.notify(baseName(path) + " — нээх боломжгүй файл");
      return;
    }
    deps.view(null);
    deps.openFile(path);
    closeDrawer();
  };

  const targetDir = (): string => {
    if (selected === null) return "";
    return isDir(selected) ? selected : dirName(selected);
  };

  const finishEdit = (): void => {
    editing = null;
    shownVersion = "";
    render();
  };

  const nameEditor = { run, notify: deps.notify, done: finishEdit };

  const insertRow = (input: HTMLInputElement): void => {
    editing = input;
    const holder = document.createElement("div");
    holder.className = "project-row is-new";
    const dir = targetDir();
    const depth = dir ? dir.split("/").length : 0;
    holder.style.setProperty("--depth", String(depth));
    holder.append(input);
    const anchor = dir
      ? tree.querySelector<HTMLElement>(rowSelector(dir))
      : null;
    if (anchor) anchor.after(holder);
    else tree.prepend(holder);
  };

  const startCreate = (dir: boolean): void => {
    const parent = targetDir();
    if (parent) collapsed.delete(parent);
    shownVersion = "";
    render();
    editName(nameEditor, insertRow, dir ? "" : "*.tex", async (name) => {
      const path = joinPath(parent, name);
      if (dir) {
        await createDir(path);
        selected = path;
        return;
      }
      await createFile(path);
      selected = path;
      if (isEditablePath(path)) deps.openFile(path);
    });
  };

  const startRename = (path: string): void => {
    const row = tree.querySelector<HTMLElement>(rowSelector(path));
    if (!row) return;
    const inRow = (input: HTMLInputElement): void => {
      editing = input;
      row.querySelector(".project-name")?.replaceWith(input);
    };
    editName(nameEditor, inRow, baseName(path), async (name) => {
      const next = joinPath(dirName(path), name);
      await renamePath(path, next);
      selected = next;
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
    void run(async () => {
      await removePath(path);
      if (selected === path) selected = null;
    });
  };

  const openMenu = (path: string, x: number, y: number): void => {
    const view = project();
    if (!view || view.pending) return;
    selected = path;
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
    menu.open(items, x, y);
  };

  tree.addEventListener("click", (event) => {
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
    selected = path;
    activate(path);
    render();
  });

  tree.addEventListener("contextmenu", (event) => {
    const row = rowOf(event.target);
    if (!row || row.classList.contains("is-new")) return;
    event.preventDefault();
    openMenu(row.dataset.path ?? "", event.clientX, event.clientY);
  });

  tree.addEventListener("keydown", (event) => {
    const row = rowOf(event.target);
    if (!row || editing) return;
    const rows = [...tree.querySelectorAll<HTMLElement>(".project-row")];
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
    else if (event.key === "ArrowRight" && isDir(path) && collapsed.has(path))
      activate(path);
    else if (event.key === "ArrowLeft" && isDir(path) && !collapsed.has(path))
      activate(path);
    else if (event.key === "Enter" || event.key === " ") {
      selected = path;
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
    tree,
    active: () => project() !== null,
    editing: () => editing !== null,
    isDir,
    closeMenu,
    move: (from, dir) => {
      const to = movedPath(from, dir);
      void run(async () => {
        await renamePath(from, to);
        if (dir) collapsed.delete(dir);
        selected = to;
      });
    },
    add: (dir, files) => {
      void run(async () => {
        for (const file of files) {
          const target = joinPath(dir, file.name);
          if (projectHas(target) && !replaceOk(target)) continue;
          await addFile(target, new Uint8Array(await file.arrayBuffer()));
        }
      });
    },
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (!menu.el.hidden && !menu.el.contains(target)) closeMenu();
    if (
      floating() &&
      !panel.hidden &&
      !panel.contains(target) &&
      !toggle.contains(target) &&
      !menu.el.contains(target)
    )
      show(false);
  });

  const opened = (prefer?: string): void => {
    collapsed.clear();
    selected = null;
    shownVersion = "";
    show(true);
    deps.onOpened(true, prefer);
    const view = project();
    if (view) deps.notify("«" + view.label + "» төслийг нээлээ");
    closeDrawer();
  };

  folderBtn.addEventListener("click", () => {
    if (!deps.beforeOpen()) return;
    const file = deps.openedFile();
    void run(async () => {
      if (await pickFolder(file?.handle ?? null)) opened(file?.name);
    });
  });
  zipBtn.addEventListener("click", () => {
    if (!deps.beforeOpen()) return;
    zipInput.click();
  });

  const openZipFile = (file: File): Promise<void> =>
    run(async () => {
      const prefer = deps.openedFile()?.name;
      await openZip(file);
      opened(prefer);
    });

  zipInput.addEventListener("change", () => {
    const file = zipInput.files?.[0];
    zipInput.value = "";
    if (file) void openZipFile(file);
  });
  grantBtn.addEventListener("click", () => {
    void run(async () => {
      if (await grantProject()) deps.onOpened(false);
      else deps.notify("Хавтсанд хандах зөвшөөрөл өгөгдсөнгүй");
    });
  });
  forgetBtn.addEventListener("click", () => {
    closeProject();
    deps.onClosed();
  });
  newFileBtn.addEventListener("click", () => startCreate(false));
  refreshBtn.addEventListener("click", () => {
    void run(async () => {
      deps.notify(
        (await refreshProject())
          ? "Дискэн дээрх өөрчлөлтийг уншлаа"
          : "Дискэн дээр өөрчлөлт алга",
      );
    });
  });
  newDirBtn.addEventListener("click", () => startCreate(true));
  const runExport = (): void => {
    void run(async () => {
      await exportZip();
      deps.notify("Төслийг zip архив болгож татлаа");
    });
  };
  exportBtn.addEventListener("click", runExport);
  window.setInterval(() => {
    const view = project();
    if (view && !view.pending && !panel.hidden) syncFoot(view.exportedAt);
  }, 60000);

  closeBtn.addEventListener("click", () => {
    if (!confirmClose(project()?.unsaved)) return;
    closeProject();
    deps.onClosed();
  });
  hideBtn.addEventListener("click", () => show(false));
  toggle.addEventListener("click", () => show(!visible()));

  wide.addEventListener("change", () => {
    if (!wide.matches && !panel.hidden) show(false);
  });

  let hadProject = project() !== null;
  onProjectChange(() => {
    const has = project() !== null;
    const closed = hadProject && !has;
    hadProject = has;
    if (closed && open) show(false);
    else render();
  });
  render();
  if (!panel.hidden && floating()) show(false);

  return {
    sync: render,
    show,
    openZipFile,
    reveal: () => {
      if (!panel.hidden) return;
      show(true);
      if (!floating()) return;
      clearTimeout(peekTimer);
      peekTimer = window.setTimeout(() => {
        peekTimer = 0;
        if (panel.hidden || !floating()) return;
        if (panel.matches(":hover") || panel.contains(document.activeElement))
          return;
        show(false);
      }, PEEK_MS);
    },
  };
}
