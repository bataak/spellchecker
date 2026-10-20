import { escapeHtml } from "../core/htmlutil.ts";
import type { ProjectStore, ProjectView } from "./projectstore.ts";
import { KEYS, read, remove, write } from "../core/store.ts";
import { confirmClose } from "./linkfiles.ts";
import { ProjectError, failureMessage } from "./projecterror.ts";
import { buildPanel } from "./panelmarkup.ts";
import {
  emptyMessage,
  exportTitle,
  folderLabel,
  projectTitle,
  treeStamp,
  type OpenedFile,
} from "./panelview.ts";
import { createProjectMenu } from "./projectmenu.ts";
import { createTreeState, initTreeControl } from "./treecontrol.ts";
import { treeRows } from "./treerows.ts";
import { askFolder, askRepo } from "./git/gitdialog.ts";
import { lastRepo, openRepo, savedToken } from "./git/gitsession.ts";

const PEEK_MS = 5000;

export interface ProjectPanelDeps {
  readonly store: ProjectStore;
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
  const {
    closeProject,
    grantProject,
    onProjectChange,
    openZip,
    openGitRepo,
    exportZip,
    pickFolder,
    refreshProject,
    project,
  } = deps.store;
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
    gitBtn,
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
  const state = createTreeState();
  let busy = false;

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

  const renderChrome = (view: ProjectView | null): boolean => {
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
    return ready;
  };

  const focusedPath = (): string | undefined => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !tree.contains(active))
      return undefined;
    return active.closest<HTMLElement>(".project-row")?.dataset.path;
  };

  const renderTree = (view: ProjectView): void => {
    const stamp = treeStamp(view, state.collapsed, state.selected, state.focus);
    if (state.editing || stamp === state.shown) return;
    state.shown = stamp;
    const focusPath = focusedPath();
    const rows = treeRows(view, state.collapsed, state.selected, state.focus);
    tree.replaceChildren(...rows);
    const first =
      rows.find((row) => row.dataset.path === focusPath) ??
      rows.find((row) => row.classList.contains("is-active")) ??
      rows[0];
    if (first) first.tabIndex = 0;
    if (focusPath !== undefined && first) first.focus({ preventScroll: true });
  };

  const render = (): void => {
    const view = project();
    syncVisibility();
    if (syncFloat() || panel.hidden) return;
    if (!renderChrome(view) || view === null) {
      tree.replaceChildren();
      state.shown = "";
      return;
    }
    renderTree(view);
  };

  const treeControl = initTreeControl({
    store: deps.store,
    tree,
    state,
    menu,
    render: () => render(),
    run,
    notify: deps.notify,
    openFile: deps.openFile,
    view: deps.view,
    closeDrawer: () => closeDrawer(),
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
    state.collapsed.clear();
    state.focus = null;
    state.selected = null;
    state.shown = "";
    show(true);
    deps.onOpened(true, prefer);
    const view = project();
    if (view) deps.notify("«" + escapeHtml(view.label) + "» төслийг нээлээ");
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
  gitBtn.addEventListener("click", () => {
    if (!deps.beforeOpen()) return;
    const prefer = deps.openedFile()?.name;
    void askRepo(
      lastRepo(),
      (provider, host) => savedToken({ provider, host }),
      async (choice, busy) => {
        try {
          const loaded = await openRepo(
            choice.spec,
            choice.token,
            choice.host,
            {
              signal: busy.signal,
              progress: (done, total) =>
                busy.say("Уншиж байна… " + done + " / " + total),
            },
          );
          busy.signal.throwIfAborted();
          let chosen: string | null = null;
          const pick = async (folders: string[]): Promise<string | null> => {
            busy.hide();
            chosen = await askFolder(folders);
            return chosen;
          };
          if (!(await openGitRepo(loaded, pick))) return;
          opened(prefer);
          state.focus = chosen;
          render();
        } catch (error) {
          throw new ProjectError(
            failureMessage(error, "Repo-г нээж чадсангүй") ?? "Цуцаллаа",
          );
        }
      },
    );
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
  newFileBtn.addEventListener("click", () => treeControl.startCreate(false));
  refreshBtn.addEventListener("click", () => {
    void run(async () => {
      deps.notify(
        (await refreshProject())
          ? "Дискэн дээрх өөрчлөлтийг уншлаа"
          : "Дискэн дээр өөрчлөлт алга",
      );
    });
  });
  newDirBtn.addEventListener("click", () => treeControl.startCreate(true));
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
