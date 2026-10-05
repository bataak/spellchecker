import { parseDock, resolveDock, type DockPlace } from "./layout.ts";

const STORAGE_KEY = "def-dock";
const EMPTY_TEXT = "Тайлбар харах үгэн дээр заагчаа аваачна уу";
const DRAG_THRESHOLD = 5;

export function emptyNote(): HTMLElement {
  const note = document.createElement("p");
  note.className = "def-empty";
  note.textContent = EMPTY_TEXT;
  return note;
}
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

export interface DefDockDeps {
  readonly workspace: HTMLElement;
  readonly editorWrap: HTMLElement;
  readonly errorPanel: HTMLElement;
  readonly desktopMQ: MediaQueryList;
  readonly room: (side: "left" | "right", active: boolean) => boolean;
}

export interface DefDock {
  readonly body: () => HTMLElement | null;
  readonly zoneAt: (x: number, y: number) => DockPlace | null;
  readonly hint: (zone: DockPlace | null) => void;
  readonly dock: (zone: DockPlace, content?: Node[]) => void;
  readonly sync: (panelShown?: boolean) => void;
  readonly onDragOut: (
    handler: (e: PointerEvent, content: Node[]) => void,
  ) => void;
  readonly onShow: (handler: (body: HTMLElement) => void) => void;
  readonly addControl: (control: HTMLElement) => void;
}

function load(): DockPlace | null {
  try {
    return parseDock(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function save(place: DockPlace | null): void {
  try {
    if (place) localStorage.setItem(STORAGE_KEY, place);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function initDefDock(deps: DefDockDeps): DefDock {
  const { workspace, editorWrap, errorPanel, desktopMQ } = deps;
  let desired = load();
  let placed: DockPlace | null = null;
  let panelShown = true;
  let pane: HTMLElement | null = null;
  let paneBody: HTMLElement | null = null;
  let hintEl: HTMLElement | null = null;
  let dragOut: ((e: PointerEvent, content: Node[]) => void) | null = null;
  let shown: ((body: HTMLElement) => void) | null = null;
  const controls: HTMLElement[] = [];

  function build(): HTMLElement {
    const el = document.createElement("section");
    el.className = "def-dock";
    el.setAttribute("aria-label", "Үгийн тайлбар");
    const head = document.createElement("div");
    head.className = "error-panel-head def-dock-head";
    const title = document.createElement("span");
    title.className = "error-panel-title";
    title.textContent = "Үгийн тайлбар";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "error-copy";
    close.title = "Тайлбарын цонхыг хаах";
    close.setAttribute("aria-label", "Тайлбарын цонхыг хаах");
    close.innerHTML = CLOSE_ICON;
    close.addEventListener("click", () => {
      desired = null;
      save(null);
      place();
    });
    head.append(title, ...controls, close);
    paneBody = document.createElement("div");
    paneBody.className = "def-dock-body";
    paneBody.setAttribute("aria-live", "polite");
    paneBody.append(emptyNote());
    el.append(head, paneBody);
    bindDragOut(head);
    return el;
  }

  function bindDragOut(head: HTMLElement): void {
    let start: { x: number; y: number } | null = null;
    head.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      if ((e.target as Element).closest("button")) return;
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener("pointermove", (e) => {
      if (!start || !paneBody || !dragOut) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved < DRAG_THRESHOLD) return;
      start = null;
      const content = [...paneBody.childNodes].filter(
        (node) => !(node as Element).classList?.contains("def-empty"),
      );
      paneBody.replaceChildren(emptyNote());
      desired = null;
      save(null);
      place();
      dragOut(e, content);
    });
    const stop = () => {
      start = null;
    };
    head.addEventListener("pointerup", stop);
    head.addEventListener("pointercancel", stop);
  }

  function roomFor(side: DockPlace): boolean {
    if (side !== "left" && side !== "right") return false;
    return deps.room(side, placed === side);
  }

  function place(): void {
    const root = document.documentElement;
    const next = desktopMQ.matches
      ? resolveDock(desired, panelShown, desired ? roomFor(desired) : false)
      : null;
    if (next === placed && (next === null || pane?.isConnected)) return;
    const appearing = !placed;
    placed = next;
    if (!next) {
      pane?.remove();
      delete root.dataset.dockCol;
      return;
    }
    pane ??= build();
    pane.dataset.place = next;
    if (next === "left") workspace.insertBefore(pane, editorWrap);
    else if (next === "right") workspace.append(pane);
    else if (next === "panel-top") errorPanel.prepend(pane);
    else
      errorPanel.insertBefore(
        pane,
        errorPanel.querySelector(".error-panel-foot"),
      );
    if (next === "left" || next === "right") root.dataset.dockCol = next;
    else delete root.dataset.dockCol;
    if (appearing && paneBody) shown?.(paneBody);
  }

  function panelVisible(): boolean {
    return errorPanel.offsetParent !== null;
  }

  function zoneRect(zone: DockPlace): DOMRect | null {
    const ws = workspace.getBoundingClientRect();
    if (zone === "panel" || zone === "panel-top") {
      const r = errorPanel.getBoundingClientRect();
      const top = zone === "panel" ? r.top + r.height / 2 : r.top;
      return new DOMRect(r.left, top, r.width, r.height / 2);
    }
    const width = errorPanel.offsetWidth || 358;
    if (zone === "left") {
      const r = editorWrap.getBoundingClientRect();
      return new DOMRect(Math.max(0, r.left - width), ws.top, width, ws.height);
    }
    const right = Math.min(
      ws.right + width,
      document.documentElement.clientWidth,
    );
    return new DOMRect(right - width, ws.top, width, ws.height);
  }

  function zoneAt(x: number, y: number): DockPlace | null {
    if (!desktopMQ.matches) return null;
    const ws = workspace.getBoundingClientRect();
    if (y < ws.top || y > ws.bottom) return null;
    if (panelVisible()) {
      const r = errorPanel.getBoundingClientRect();
      if (x >= r.left && x <= r.right)
        return y < r.top + r.height / 2 ? "panel-top" : "panel";
    }
    const box = editorWrap.querySelector(".editor")?.getBoundingClientRect();
    if (box && x < box.left && roomFor("left")) return "left";
    if (x > ws.right && roomFor("right")) return "right";
    return null;
  }

  function hint(zone: DockPlace | null): void {
    const rect = zone && zoneRect(zone);
    if (!rect) {
      if (hintEl) hintEl.hidden = true;
      return;
    }
    if (!hintEl) {
      hintEl = document.createElement("div");
      hintEl.className = "dock-hint";
      document.body.append(hintEl);
    }
    hintEl.hidden = false;
    hintEl.style.left = rect.left + "px";
    hintEl.style.top = rect.top + "px";
    hintEl.style.width = rect.width + "px";
    hintEl.style.height = rect.height + "px";
  }

  function dock(zone: DockPlace, content?: Node[]): void {
    desired = zone;
    save(zone);
    place();
    if (content && paneBody) {
      paneBody.replaceChildren(...(content.length ? content : [emptyNote()]));
      paneBody.scrollTop = 0;
    }
  }

  desktopMQ.addEventListener("change", place);

  return {
    body: () => (placed ? paneBody : null),
    zoneAt,
    hint,
    dock,
    onDragOut(handler) {
      dragOut = handler;
    },
    onShow(handler) {
      shown = handler;
    },
    addControl(control) {
      controls.push(control);
      pane?.querySelector(".def-dock-head > :last-child")?.before(control);
    },
    sync(shown) {
      if (shown !== undefined) panelShown = shown;
      place();
    },
  };
}
