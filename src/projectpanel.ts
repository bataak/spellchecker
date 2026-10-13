import {
  ProjectError,
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
  removePath,
  renamePath,
  setMain,
  type ProjectView,
} from "./projectstore.ts";
import {
  baseName,
  buildTree,
  dirName,
  isEditablePath,
  isTexSource,
  joinPath,
  validName,
  type TreeNode,
} from "./texproject.ts";

const OPEN_KEY = "mn-spell:project-panel";

export interface ProjectPanelDeps {
  readonly workspace: HTMLElement;
  readonly tools: () => HTMLElement | null;
  readonly texActive: () => boolean;
  readonly openFile: (path: string) => void;
  readonly beforeOpen: () => boolean;
  readonly onOpened: (fresh: boolean, prefer?: string) => void;
  readonly openedFile: () => {
    readonly name: string;
    readonly handle: FileSystemFileHandle | null;
  } | null;
  readonly onClosed: () => void;
  readonly onLayout: () => void;
  readonly notify: (message: string) => void;
}

export interface ProjectPanel {
  readonly sync: () => void;
  readonly show: (on: boolean) => void;
  readonly openZipFile: (file: File) => Promise<void>;
}

const ICON = {
  folder:
    '<path d="M1.5 4.2c0-.8.6-1.4 1.4-1.4h3.3l1.5 1.7h5.4c.8 0 1.4.6 1.4 1.4v6.6c0 .8-.6 1.4-1.4 1.4H2.9c-.8 0-1.4-.6-1.4-1.4z"/>',
  file: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/>',
  newFile:
    '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3M8 7.5v4.5M5.75 9.75h4.5"/>',
  newFolder:
    '<path d="M1.5 4.2c0-.8.6-1.4 1.4-1.4h3.3l1.5 1.7h5.4c.8 0 1.4.6 1.4 1.4v6.6c0 .8-.6 1.4-1.4 1.4H2.9c-.8 0-1.4-.6-1.4-1.4z"/><path d="M8 7v4.5M5.75 9.25h4.5"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  more: '<circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
  tree: '<path d="M2 2.5h4.5M4 2.5v9.5h3.5M4 7h3.5"/><rect x="8.5" y="5" width="6" height="4" rx="1"/><rect x="8.5" y="10" width="6" height="4" rx="1"/>',
  refresh:
    '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M12.2 1.8v2.6H9.6"/>',
} as const;

function icon(body: string, size = 16): string {
  return (
    '<svg viewBox="0 0 16 16" width="' +
    size +
    '" height="' +
    size +
    '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
    body +
    "</svg>"
  );
}

function headButton(label: string, body: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "project-act";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon(body);
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

function loadOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "on";
  } catch {
    return false;
  }
}

function saveOpen(on: boolean): void {
  try {
    if (on) localStorage.setItem(OPEN_KEY, "on");
    else localStorage.removeItem(OPEN_KEY);
  } catch {}
}

interface MenuItem {
  readonly label: string;
  readonly run: () => void;
  readonly danger?: boolean;
}

export function initProjectPanel(deps: ProjectPanelDeps): ProjectPanel {
  const wide = window.matchMedia("(min-width: 1024px)");
  const panel = document.createElement("aside");
  panel.className = "project-panel";
  panel.setAttribute("aria-label", "LaTeX төсөл");
  panel.hidden = true;

  const head = document.createElement("div");
  head.className = "project-head";
  const headIcon = document.createElement("span");
  headIcon.className = "project-head-icon";
  headIcon.innerHTML = icon(ICON.folder, 16);
  const title = document.createElement("span");
  title.className = "project-title";
  const hideBtn = headButton("Самбарыг нуух", ICON.tree);
  head.append(headIcon, title, hideBtn);

  const textButton = (label: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-foot-btn";
    button.textContent = label;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    return button;
  };
  const newFileBtn = headButton("Шинэ файл", ICON.newFile);
  const newDirBtn = headButton("Шинэ хавтас", ICON.newFolder);
  const exportBtn = textButton("Zip татах");
  const closeBtn = headButton("Төслийг хаах", ICON.close);
  const refreshBtn = headButton("Дискнээс дахин унших", ICON.refresh);

  const tree = document.createElement("div");
  tree.className = "project-tree";
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-label", "Төслийн файлууд");

  const empty = document.createElement("div");
  empty.className = "project-empty";
  const emptyText = document.createElement("p");
  const folderBtn = document.createElement("button");
  folderBtn.type = "button";
  folderBtn.className = "project-open";
  folderBtn.textContent = "Хавтас нээх";
  const zipBtn = document.createElement("button");
  zipBtn.type = "button";
  zipBtn.className = "project-open";
  zipBtn.textContent = "Zip нээх";
  const grantBtn = document.createElement("button");
  grantBtn.type = "button";
  grantBtn.className = "project-open";
  grantBtn.textContent = "Хандах зөвшөөрөл өгөх";
  const forgetBtn = document.createElement("button");
  forgetBtn.type = "button";
  forgetBtn.className = "project-open project-quiet";
  forgetBtn.textContent = "Мартах";
  empty.append(emptyText, folderBtn, zipBtn, grantBtn, forgetBtn);

  const zipInput = document.createElement("input");
  zipInput.type = "file";
  zipInput.accept = ".zip,application/zip";
  zipInput.hidden = true;

  const foot = document.createElement("div");
  foot.className = "project-foot";
  const spacer = document.createElement("span");
  spacer.className = "project-foot-gap";
  foot.append(newFileBtn, newDirBtn, refreshBtn, spacer, exportBtn, closeBtn);

  panel.append(head, tree, empty, foot, zipInput);
  deps.workspace.prepend(panel);

  const menu = document.createElement("div");
  menu.className = "project-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  document.body.append(menu);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "project-toggle";
  toggle.title = "LaTeX төсөл";
  toggle.setAttribute("aria-label", "LaTeX төслийн самбар");
  toggle.setAttribute("aria-pressed", "false");
  toggle.innerHTML = icon(ICON.tree, 15);
  toggle.addEventListener("mousedown", (event) => event.preventDefault());

  let open = loadOpen() && wide.matches;
  const collapsed = new Set<string>();
  let selected: string | null = null;
  let editing: HTMLInputElement | null = null;
  let busy = false;
  let shownVersion = "";

  const fail = (error: unknown): void => {
    if (error instanceof ProjectError) deps.notify(error.message);
    else if (error instanceof DOMException && error.name === "AbortError")
      return;
    else {
      console.error("project:", error);
      deps.notify("Төслийн үйлдлийг гүйцэтгэж чадсангүй");
    }
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

  const visible = (): boolean =>
    open && (deps.texActive() || project() !== null);

  const place = (): void => {
    const tools = deps.tools();
    if (tools && toggle.parentElement !== tools) tools.prepend(toggle);
  };

  const syncVisibility = (): void => {
    place();
    const shown = visible();
    toggle.hidden = !(deps.texActive() || project() !== null);
    toggle.setAttribute("aria-pressed", String(shown));
    toggle.classList.toggle("is-on", shown);
    if (panel.hidden === !shown) return;
    panel.hidden = !shown;
    const root = document.documentElement;
    if (shown) root.dataset.project = "on";
    else delete root.dataset.project;
    if (!shown) closeMenu();
    deps.onLayout();
  };

  const show = (on: boolean): void => {
    open = on;
    saveOpen(on);
    syncVisibility();
    if (on) render();
  };

  const floating = (): boolean =>
    !wide.matches || "projectFloat" in document.documentElement.dataset;

  const closeDrawer = (): void => {
    if (floating()) show(false);
  };

  const icons = (node: TreeNode): string =>
    icon(node.dir ? ICON.folder : ICON.file, 15);

  const ago = (time: number): string => {
    const minutes = Math.floor((Date.now() - time) / 60000);
    if (minutes < 1) return "дөнгөж сая";
    if (minutes < 60) return minutes + " минутын өмнө";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " цагийн өмнө";
    return Math.floor(hours / 24) + " өдрийн өмнө";
  };

  const syncFoot = (view: ProjectView): void => {
    exportBtn.title =
      "Төслийг бүхэлд нь zip болгож татах" +
      (view.exportedAt === null
        ? ""
        : " · сүүлд татсан: " + ago(view.exportedAt));
  };

  const rowFor = (
    node: TreeNode,
    depth: number,
    view: ProjectView,
  ): HTMLElement => {
    const row = document.createElement("div");
    row.className = "project-row";
    row.dataset.path = node.path;
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", String(depth + 1));
    row.tabIndex = -1;
    row.style.setProperty("--depth", String(depth));
    if (node.dir) {
      row.classList.add("is-dir");
      row.setAttribute("aria-expanded", String(!collapsed.has(node.path)));
    } else if (!isEditablePath(node.path)) row.classList.add("is-binary");
    if (node.path === view.active) {
      row.classList.add("is-active");
      row.setAttribute("aria-current", "true");
    }
    if (node.path === selected) row.classList.add("is-selected");
    const caret = document.createElement("span");
    caret.className = "project-caret";
    const glyph = document.createElement("span");
    glyph.className = "project-icon";
    glyph.innerHTML = icons(node);
    const name = document.createElement("span");
    name.className = "project-name";
    name.textContent = node.name;
    row.append(caret, glyph, name);
    row.title = node.path;
    if (node.path === view.main) {
      const badge = document.createElement("span");
      badge.className = "project-main";
      badge.textContent = "үндсэн";
      badge.title = "Хөрвүүлэх үндсэн файл";
      row.append(badge);
    }
    if (view.dirty.has(node.path)) {
      const dot = document.createElement("span");
      dot.className = "project-dot";
      dot.title = "Хадгалаагүй өөрчлөлттэй";
      row.append(dot);
    }
    const more = document.createElement("button");
    more.type = "button";
    more.className = "project-more";
    more.tabIndex = -1;
    more.setAttribute("aria-label", "Үйлдлүүд");
    more.innerHTML = icon(ICON.more, 14);
    row.append(more);
    return row;
  };

  const render = (): void => {
    const view = project();
    syncVisibility();
    if (panel.hidden) return;
    const pending = view?.pending ?? false;
    const ready = view !== null && !pending;
    title.textContent = view ? view.name : "LaTeX төсөл";
    title.title = view
      ? view.kind === "dir"
        ? view.name + " — дискэн дээрх хавтас"
        : view.name + " — энэ хөтөч дотор хадгалагдана"
      : "";
    headIcon.hidden = view === null;
    refreshBtn.hidden = !ready || view.kind !== "dir";
    exportBtn.hidden = !ready;
    exportBtn.classList.toggle(
      "is-due",
      ready && view.kind === "memory" && view.unsaved,
    );
    foot.hidden = !ready;
    if (ready) syncFoot(view);
    empty.hidden = ready;
    tree.hidden = !ready;
    const file = deps.openedFile();
    folderBtn.textContent =
      file?.handle && window.showDirectoryPicker
        ? "«" + file.name + "»-ийн хавтсыг нээх"
        : "Хавтас нээх";
    folderBtn.hidden = pending;
    zipBtn.hidden = pending;
    grantBtn.hidden = !pending;
    forgetBtn.hidden = !pending;
    emptyText.textContent = pending
      ? "«" +
        view!.name +
        "» хавтсыг дахин нээхийн тулд хандах зөвшөөрөл өгнө үү."
      : "Олон файлтай LaTeX төслийг хавтсаар эсвэл zip файлаар нээж засварлана.";
    if (!ready) {
      tree.replaceChildren();
      shownVersion = "";
      return;
    }
    const stamp =
      view.version +
      ":" +
      view.active +
      ":" +
      view.main +
      ":" +
      [...view.dirty].join("|") +
      ":" +
      [...collapsed].join("|") +
      ":" +
      selected;
    if (editing || stamp === shownVersion) return;
    shownVersion = stamp;
    const focusPath =
      document.activeElement instanceof HTMLElement &&
      tree.contains(document.activeElement)
        ? document.activeElement.closest<HTMLElement>(".project-row")?.dataset
            .path
        : undefined;
    const rows: HTMLElement[] = [];
    const walk = (nodes: readonly TreeNode[], depth: number): void => {
      for (const node of nodes) {
        rows.push(rowFor(node, depth, view));
        if (node.dir && !collapsed.has(node.path))
          walk(node.children, depth + 1);
      }
    };
    walk(buildTree(view.files, view.dirs), 0);
    tree.replaceChildren(...rows);
    const first =
      rows.find((row) => row.dataset.path === focusPath) ??
      rows.find((row) => row.classList.contains("is-active")) ??
      rows[0];
    if (first) first.tabIndex = 0;
    if (focusPath !== undefined && first) first.focus({ preventScroll: true });
  };

  const rowOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element
      ? target.closest<HTMLElement>(".project-row")
      : null;

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
      deps.notify(baseName(path) + " — засварлах боломжгүй файл");
      return;
    }
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

  const editName = (
    row: HTMLElement | null,
    initial: string,
    commit: (name: string) => Promise<void>,
  ): void => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "project-input";
    input.value = initial;
    input.spellcheck = false;
    input.setAttribute("aria-label", "Нэр");
    let done = false;
    const end = async (save: boolean): Promise<void> => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (save && name && name !== initial) {
        if (!validName(name)) {
          deps.notify('Нэрэнд / \\ : * ? " < > | тэмдэгт орж болохгүй');
        } else await run(() => commit(name));
      }
      finishEdit();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void end(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        void end(false);
      }
      event.stopPropagation();
    });
    input.addEventListener("blur", () => void end(true));
    editing = input;
    if (row) {
      row.querySelector(".project-name")?.replaceWith(input);
    } else {
      const holder = document.createElement("div");
      holder.className = "project-row is-new";
      const dir = targetDir();
      const depth = dir ? dir.split("/").length : 0;
      holder.style.setProperty("--depth", String(depth));
      holder.append(input);
      const anchor = dir
        ? tree.querySelector<HTMLElement>(
            '.project-row[data-path="' + CSS.escape(dir) + '"]',
          )
        : null;
      if (anchor) anchor.after(holder);
      else tree.prepend(holder);
    }
    input.focus();
    const dot = initial.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  };

  const startCreate = (dir: boolean): void => {
    const parent = targetDir();
    if (parent) collapsed.delete(parent);
    shownVersion = "";
    render();
    editName(null, dir ? "" : ".tex", async (name) => {
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
    const row = tree.querySelector<HTMLElement>(
      '.project-row[data-path="' + CSS.escape(path) + '"]',
    );
    if (!row) return;
    editName(row, baseName(path), async (name) => {
      const next = joinPath(dirName(path), name);
      await renamePath(path, next);
      selected = next;
    });
  };

  const remove = (path: string): void => {
    const view = project();
    if (!view) return;
    const dir = isDir(path);
    const where = view.kind === "dir" ? " дискнээс" : "";
    const question =
      "«" +
      baseName(path) +
      "» " +
      (dir ? "хавтсыг доторх бүх файлтай нь" : "файлыг") +
      where +
      " устгах уу?";
    if (!window.confirm(question)) return;
    void run(async () => {
      await removePath(path);
      if (selected === path) selected = null;
    });
  };

  const closeMenu = (): void => {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
  };

  const openMenu = (path: string, x: number, y: number): void => {
    const view = project();
    if (!view || view.pending) return;
    selected = path;
    const dir = isDir(path);
    const items: MenuItem[] = [];
    if (!dir && isEditablePath(path))
      items.push({ label: "Нээх", run: () => activate(path) });
    if (!dir && isTexSource(path) && view.main !== path)
      items.push({ label: "Үндсэн файл болгох", run: () => setMain(path) });
    if (dir) {
      items.push({ label: "Шинэ файл", run: () => startCreate(false) });
      items.push({ label: "Шинэ хавтас", run: () => startCreate(true) });
    }
    items.push({ label: "Нэр солих", run: () => startRename(path) });
    items.push({ label: "Устгах", run: () => remove(path), danger: true });
    menu.replaceChildren(
      ...items.map((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "project-menu-item";
        button.setAttribute("role", "menuitem");
        button.textContent = item.label;
        if (item.danger) button.classList.add("is-danger");
        button.addEventListener("click", () => {
          closeMenu();
          item.run();
        });
        return button;
      }),
    );
    menu.hidden = false;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const right = document.documentElement.clientWidth;
    const bottom = window.innerHeight;
    menu.style.left = Math.max(8, Math.min(x, right - width - 8)) + "px";
    menu.style.top = Math.max(8, Math.min(y, bottom - height - 8)) + "px";
    menu.querySelector<HTMLButtonElement>("button")?.focus();
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
    else if (event.key === "Delete") remove(path);
    else if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      const box = row.getBoundingClientRect();
      openMenu(path, box.left + 24, box.bottom);
    } else return;
    event.preventDefault();
  });

  tree.addEventListener("dragover", (event) => {
    if (!project() || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    tree.classList.add("is-drop");
  });
  tree.addEventListener("dragleave", () => tree.classList.remove("is-drop"));
  tree.addEventListener("drop", (event) => {
    tree.classList.remove("is-drop");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!project() || !files.length) return;
    event.preventDefault();
    event.stopPropagation();
    const row = rowOf(event.target);
    const path = row?.dataset.path ?? "";
    const dir = row ? (isDir(path) ? path : dirName(path)) : "";
    void run(async () => {
      for (const file of files)
        await addFile(
          joinPath(dir, file.name),
          new Uint8Array(await file.arrayBuffer()),
        );
    });
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (!menu.hidden && !menu.contains(target)) closeMenu();
    if (
      floating() &&
      !panel.hidden &&
      !panel.contains(target) &&
      !toggle.contains(target) &&
      !menu.contains(target)
    )
      show(false);
  });
  menu.addEventListener("keydown", (event) => {
    const items = [...menu.querySelectorAll<HTMLButtonElement>("button")];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      closeMenu();
      tree.querySelector<HTMLElement>(".project-row[tabindex='0']")?.focus();
    } else if (event.key === "ArrowDown")
      items[(at + 1) % items.length]?.focus();
    else if (event.key === "ArrowUp")
      items[(at - 1 + items.length) % items.length]?.focus();
    else return;
    event.preventDefault();
  });

  const opened = (prefer?: string): void => {
    collapsed.clear();
    selected = null;
    shownVersion = "";
    show(true);
    deps.onOpened(true, prefer);
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
      await openZip(file);
      opened();
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
      deps.notify("Төслийг zip болгож татлаа");
    });
  };
  exportBtn.addEventListener("click", runExport);
  window.setInterval(() => {
    const view = project();
    if (view && !view.pending && !panel.hidden) syncFoot(view);
  }, 60000);

  closeBtn.addEventListener("click", () => {
    const view = project();
    if (
      view?.unsaved &&
      !window.confirm("Хадгалаагүй өөрчлөлт байна. Төслийг хаах уу?")
    )
      return;
    closeProject();
    deps.onClosed();
  });
  hideBtn.addEventListener("click", () => show(false));
  toggle.addEventListener("click", () => show(!visible()));

  wide.addEventListener("change", () => {
    if (!wide.matches && !panel.hidden) show(false);
  });

  onProjectChange(render);
  render();
  if (!panel.hidden && floating()) show(false);

  return {
    sync: render,
    show,
    openZipFile,
  };
}
