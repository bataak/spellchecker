import { KEYS, read, remove, write } from "../core/store.ts";
import { onSlotChange, talkCovers } from "../ui/talkslot.ts";

const PEEK_MS = 5000;

export interface ShowDeps {
  readonly panel: HTMLElement;
  readonly toggle: HTMLElement;
  readonly tools: () => HTMLElement | null;
  readonly texActive: () => boolean;
  readonly away: () => string | null;
  readonly onLayout: () => void;
  readonly onHide: () => void;
  readonly render: () => void;
}

export interface PanelShow {
  isOpen(): boolean;
  closeDrawer(): void;
  show(on: boolean): void;
  visible(): boolean;
  syncVisibility(): void;
  syncFloat(): boolean;
  floating(): boolean;
  reveal(): void;
}

function saveOpen(on: boolean): void {
  if (on) write(KEYS.projectPanel, "on");
  else remove(KEYS.projectPanel);
}

function createFlash(toggle: HTMLElement): () => void {
  let timer = 0;
  return () => {
    toggle.classList.add("is-shown");
    clearTimeout(timer);
    timer = window.setTimeout(() => toggle.classList.remove("is-shown"), 5000);
  };
}

function markProject(shown: boolean): void {
  const root = document.documentElement;
  if (shown) root.dataset.project = "on";
  else delete root.dataset.project;
}

export function createPanelShow(deps: ShowDeps): PanelShow {
  const { panel, toggle } = deps;
  const wide = window.matchMedia("(min-width: 1024px)");
  let open = read(KEYS.projectPanel) === "on" && wide.matches;
  let awayOpen: string | null = null;
  let laying = false;
  let wasFloating = false;
  let peekTimer = 0;

  const floating = (): boolean =>
    !wide.matches || "projectFloat" in document.documentElement.dataset;
  const visible = (): boolean => {
    if (!deps.texActive()) return false;
    const away = deps.away();
    if (away !== null) return awayOpen === away;
    awayOpen = null;
    return open;
  };
  const keepPeek = (): void => {
    clearTimeout(peekTimer);
    peekTimer = 0;
  };
  panel.addEventListener("pointerdown", keepPeek);
  panel.addEventListener("wheel", keepPeek, { passive: true });
  panel.addEventListener("focusin", keepPeek);
  const flashToggle = createFlash(toggle);
  const layout = (shown: boolean): void => {
    panel.hidden = !shown;
    markProject(shown);
    if (!shown) deps.onHide();
    laying = true;
    try {
      deps.onLayout();
    } finally {
      laying = false;
    }
    wasFloating = floating();
  };
  const syncVisibility = (): void => {
    const tools = deps.tools();
    if (tools && toggle.parentElement !== tools) tools.prepend(toggle);
    const shown = visible();
    const seen = shown && !talkCovers();
    const hide = !deps.texActive() || seen;
    if (toggle.hidden && !hide) flashToggle();
    toggle.hidden = hide;
    toggle.setAttribute("aria-pressed", String(seen));
    toggle.classList.toggle("is-on", seen);
    if (panel.hidden !== !shown) layout(shown);
  };
  const show = (on: boolean): void => {
    const away = deps.away();
    if (away !== null) awayOpen = on ? away : null;
    if (on || away === null) {
      open = on;
      saveOpen(on);
    }
    syncVisibility();
    if (on) deps.render();
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
  const reveal = (): void => {
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
  };
  const closeDrawer = (): void => {
    if (!wide.matches) show(false);
  };
  wide.addEventListener("change", () => {
    if (!panel.hidden) closeDrawer();
  });
  onSlotChange(syncVisibility);
  return {
    isOpen: () => open,
    closeDrawer,
    show,
    visible,
    syncVisibility,
    syncFloat,
    floating,
    reveal,
  };
}
