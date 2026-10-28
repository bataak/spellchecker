import { parseDock, resolveDock, type DockPlace } from "../ui/layout.ts";
import { KEYS, read, remove, write } from "../core/store.ts";
import { closestTarget } from "../ui/dom.ts";

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
  readonly clear: () => void;
}

function load(): DockPlace | null {
  return parseDock(read(KEYS.defDock));
}

function save(place: DockPlace | null): void {
  if (place) write(KEYS.defDock, place);
  else remove(KEYS.defDock);
}

function buildDockPane(
  controls: readonly HTMLElement[],
  onClose: () => void,
): { el: HTMLElement; head: HTMLElement; body: HTMLElement } {
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
  close.addEventListener("click", onClose);
  head.append(title, ...controls, close);
  head.addEventListener("mousedown", (e) => e.preventDefault());
  const body = document.createElement("div");
  body.className = "def-dock-body";
  body.setAttribute("aria-live", "polite");
  body.append(emptyNote());
  el.append(head, body);
  return { el, head, body };
}

function bindDragOut(
  head: HTMLElement,
  dragged: (e: PointerEvent) => boolean,
): void {
  let start: { x: number; y: number } | null = null;
  head.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    if (closestTarget(e, "button")) return;
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved < DRAG_THRESHOLD) return;
    const from = start;
    start = null;
    if (!dragged(e)) start = from;
  });
  const stop = () => {
    start = null;
  };
  head.addEventListener("pointerup", stop);
  head.addEventListener("pointercancel", stop);
}

type DockEls = Pick<DefDockDeps, "workspace" | "editorWrap" | "errorPanel">;

function dockZoneRect(
  { workspace, editorWrap, errorPanel }: DockEls,
  zone: DockPlace,
): DOMRect | null {
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

function dockZoneAt(
  { workspace, editorWrap, errorPanel }: DockEls,
  roomFor: (side: DockPlace) => boolean,
  x: number,
  y: number,
): DockPlace | null {
  const ws = workspace.getBoundingClientRect();
  if (y < ws.top || y > ws.bottom) return null;
  if (errorPanel.offsetParent !== null) {
    const r = errorPanel.getBoundingClientRect();
    if (x >= r.left && x <= r.right)
      return y < r.top + r.height / 2 ? "panel-top" : "panel";
  }
  const box = editorWrap.querySelector(".editor")?.getBoundingClientRect();
  if (box && x < box.left && roomFor("left")) return "left";
  if (x > ws.right && roomFor("right")) return "right";
  return null;
}

function createDockHint(): (rect: DOMRect | null) => void {
  let hintEl: HTMLElement | null = null;
  return (rect) => {
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
  };
}

export function initDefDock(deps: DefDockDeps): DefDock {
  const { workspace, editorWrap, errorPanel, desktopMQ } = deps;
  let desired = load();
  let placed: DockPlace | null = null;
  let panelShown = true;
  let pane: HTMLElement | null = null;
  let paneBody: HTMLElement | null = null;
  const hint = createDockHint();
  let dragOut: ((e: PointerEvent, content: Node[]) => void) | null = null;
  let shown: ((body: HTMLElement) => void) | null = null;
  const controls: HTMLElement[] = [];

  function build(): HTMLElement {
    const built = buildDockPane(controls, () => {
      desired = null;
      save(null);
      place();
    });
    paneBody = built.body;
    bindDragOut(built.head, (e) => {
      if (!paneBody || !dragOut) return false;
      const content = [...paneBody.childNodes].filter(
        (node) => !(node as Element).classList?.contains("def-empty"),
      );
      paneBody.replaceChildren(emptyNote());
      desired = null;
      save(null);
      place();
      dragOut(e, content);
      return true;
    });
    return built.el;
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
    zoneAt: (x, y) =>
      desktopMQ.matches ? dockZoneAt(deps, roomFor, x, y) : null,
    hint: (zone) => hint(zone && dockZoneRect(deps, zone)),
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
    clear() {
      paneBody?.replaceChildren(emptyNote());
    },
    sync(shown) {
      if (shown !== undefined) panelShown = shown;
      place();
    },
  };
}
