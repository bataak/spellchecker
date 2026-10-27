import { talkCovers, yieldTalk } from "../ui/talkslot.ts";
import type { ProjectStore } from "./projectstore.ts";
import { failureMessage } from "./projecterror.ts";
import { buildPanel, type PanelParts } from "./panelmarkup.ts";
import type { OpenedFile } from "./panelview.ts";
import {
  createProjectMenu,
  type MenuItem,
  type ProjectMenu,
} from "./projectmenu.ts";
import { createTreeState, initTreeControl } from "./treecontrol.ts";
import { wireActions } from "./panelactions.ts";
import { renderChrome, renderTree, syncFoot } from "./panelrender.ts";
import { createPanelShow } from "./panelshow.ts";
import { eventNode } from "../ui/dom.ts";

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
  readonly openMenu: (anchor: HTMLElement, before: readonly MenuItem[]) => void;
}

function openProjectMenu(
  menu: ProjectMenu,
  anchor: HTMLElement,
  parts: PanelParts,
  before: readonly MenuItem[],
): void {
  if (menu.owner() === anchor) {
    menu.close();
    return;
  }
  const box = anchor.getBoundingClientRect();
  menu.open(
    [
      ...before,
      {
        label: "LaTeX төсөл",
        items: [
          { label: "Хавтас нээх", run: () => parts.folderBtn.click() },
          { label: "Zip файл нээх", run: () => parts.zipBtn.click() },
          { label: "Git repo нээх", run: () => parts.gitBtn.click() },
        ],
      },
    ],
    box.left,
    box.top,
    anchor,
  );
  menu.el.style.top = Math.max(8, box.top - menu.el.offsetHeight - 4) + "px";
}

function busyRunner(
  panel: HTMLElement,
  notify: (message: string) => void,
): (task: () => Promise<unknown>) => Promise<void> {
  let busy = false;
  return async (task) => {
    if (busy) return;
    busy = true;
    panel.classList.add("is-busy");
    try {
      await task();
    } catch (error) {
      const message = failureMessage(
        error,
        "Төслийн үйлдлийг гүйцэтгэж чадсангүй",
      );
      if (message !== null) notify(message);
    } finally {
      busy = false;
      panel.classList.remove("is-busy");
    }
  };
}

export function initProjectPanel(deps: ProjectPanelDeps): ProjectPanel {
  const { store } = deps;
  const parts = buildPanel();
  const { panel, tree, toggle } = parts;
  deps.workspace.prepend(panel);
  const menu = createProjectMenu(() =>
    tree.querySelector<HTMLElement>(".project-row[tabindex='0']")?.focus(),
  );
  const state = createTreeState();
  const run = busyRunner(panel, deps.notify);

  const vis = createPanelShow({
    panel,
    toggle,
    tools: deps.tools,
    texActive: deps.texActive,
    away: deps.away,
    onLayout: deps.onLayout,
    onHide: menu.close,
    render: () => render(),
  });

  const render = (): void => {
    const view = store.project();
    vis.syncVisibility();
    if (vis.syncFloat() || panel.hidden) return;
    if (!renderChrome(parts, view, deps.openedFile()) || view === null) {
      tree.replaceChildren();
      state.shown = "";
      return;
    }
    renderTree(tree, state, view);
  };

  const treeControl = initTreeControl({
    store,
    tree,
    state,
    menu,
    render,
    run,
    notify: deps.notify,
    openFile: deps.openFile,
    view: deps.view,
    closeDrawer: vis.closeDrawer,
  });

  document.addEventListener("pointerdown", (event) => {
    const target = eventNode(event);
    if (
      !menu.el.hidden &&
      !menu.el.contains(target) &&
      !menu.owner()?.contains(target)
    )
      menu.close();
    if (
      vis.floating() &&
      !panel.hidden &&
      !panel.contains(target) &&
      !toggle.contains(target) &&
      !menu.el.contains(target)
    )
      vis.show(false);
  });

  const openZipFile = wireActions({
    deps,
    parts,
    state,
    tree: treeControl,
    run,
    show: vis.show,
    render,
  });
  window.setInterval(() => {
    const view = store.project();
    if (view && !view.pending && !panel.hidden)
      syncFoot(parts, view.exportedAt);
  }, 60000);
  parts.hideBtn.addEventListener("click", () => vis.show(false));
  toggle.addEventListener("click", () =>
    talkCovers() ? yieldTalk(true) : vis.show(!vis.visible()),
  );

  let hadProject = store.project() !== null;
  store.onProjectChange(() => {
    const has = store.project() !== null;
    const closed = hadProject && !has;
    hadProject = has;
    if (closed && vis.isOpen()) vis.show(false);
    else render();
  });
  render();
  if (!panel.hidden && vis.floating()) vis.show(false);

  return {
    sync: render,
    show: vis.show,
    openZipFile,
    openMenu: (anchor, before) => openProjectMenu(menu, anchor, parts, before),
    reveal: vis.reveal,
  };
}
