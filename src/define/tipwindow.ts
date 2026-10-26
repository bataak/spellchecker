import {
  CLOSE_ICON,
  PAUSE_ICON,
  PAUSE_LABEL,
  PIN_ICON,
  PLAY_ICON,
  RESUME_LABEL,
  iconButton,
} from "./deficons.ts";
import { emptyNote, type DefDock } from "./defdock.ts";
import { KEYS, read, remove, write } from "../core/store.ts";
import { closestTarget } from "../ui/dom.ts";

export interface PauseToggle {
  button(className: string): HTMLButtonElement;
  paused(): boolean;
}

export function createPauseToggle(): PauseToggle {
  let paused = false;
  const buttons: HTMLButtonElement[] = [];

  const set = (on: boolean): void => {
    paused = on;
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(on));
      button.title = on ? RESUME_LABEL : PAUSE_LABEL;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = on ? PLAY_ICON : PAUSE_ICON;
    }
  };

  return {
    button(className) {
      const button = iconButton(className, PAUSE_ICON, PAUSE_LABEL);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("mousedown", (e) => e.preventDefault());
      button.addEventListener("click", () => set(!paused));
      buttons.push(button);
      return button;
    },
    paused: () => paused,
  };
}

export function parsePin(raw: string | null): {
  left: number;
  top: number;
} | null {
  const [left, top] = (raw ?? "").split(",").map(Number);
  return Number.isFinite(left) && Number.isFinite(top)
    ? { left: left!, top: top! }
    : null;
}

export interface TipWindowDeps {
  readonly dock: DefDock;
  readonly pause: PauseToggle;
  readonly onEnter: () => void;
  readonly onLeave: () => void;
  readonly onClose: () => void;
}

export interface TipWindow {
  el(): HTMLDivElement | null;
  body(): HTMLDivElement | null;
  ensure(): HTMLDivElement;
  pinned(): boolean;
  setPinned(on: boolean): void;
  move(left: number, top: number): void;
  startDrag(pointerId: number, dx: number, dy: number): void;
  showPinned(content: Node[]): HTMLDivElement;
  savedPin(): { left: number; top: number } | null;
}

function tipShell(deps: TipWindowDeps): HTMLDivElement {
  const el = document.createElement("div");
  el.id = "defTip";
  el.className = "def-tip";
  el.setAttribute("role", "tooltip");
  el.hidden = true;
  el.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "touch") deps.onEnter();
  });
  el.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "touch") deps.onLeave();
  });
  return el;
}

function tipBar(
  deps: TipWindowDeps,
  togglePin: () => void,
): { bar: HTMLDivElement; pinBtn: HTMLButtonElement } {
  const bar = document.createElement("div");
  bar.className = "def-tip-bar";
  const pinBtn = iconButton(
    "def-tip-btn def-tip-pin",
    PIN_ICON,
    "Энэ байрлалд бэхлэх",
  );
  pinBtn.setAttribute("aria-pressed", "false");
  pinBtn.addEventListener("click", togglePin);
  const closeBtn = iconButton("def-tip-btn def-tip-close", CLOSE_ICON, "Хаах");
  closeBtn.addEventListener("click", deps.onClose);
  bar.append(deps.pause.button("def-tip-btn def-tip-pause"), pinBtn, closeBtn);
  bar.addEventListener("mousedown", (e) => e.preventDefault());
  return { bar, pinBtn };
}

export function createTipWindow(deps: TipWindowDeps): TipWindow {
  let tip: HTMLDivElement | null = null;
  let tipBody: HTMLDivElement | null = null;
  let pinBtn: HTMLButtonElement | null = null;
  let dragBar: HTMLElement | null = null;
  let pinned = false;
  let grab: { dx: number; dy: number } | null = null;
  let zone: ReturnType<DefDock["zoneAt"]> = null;

  function savePin(): void {
    if (pinned && tip) write(KEYS.defPin, `${tip.offsetLeft},${tip.offsetTop}`);
    else remove(KEYS.defPin);
  }

  function setPinned(on: boolean): void {
    if (!tip || pinned === on) return;
    const rect = tip.getBoundingClientRect();
    pinned = on;
    tip.classList.toggle("is-pinned", on);
    pinBtn?.setAttribute("aria-pressed", String(on));
    if (pinBtn) pinBtn.title = on ? "Бэхэлгээг авах" : "Энэ байрлалд бэхлэх";
    tip.style.left = (on ? 0 : window.scrollX) + rect.left + "px";
    tip.style.top = (on ? 0 : window.scrollY) + rect.top + "px";
    savePin();
  }

  function move(left: number, top: number): void {
    if (!tip) return;
    const maxLeft = window.innerWidth - tip.offsetWidth;
    const maxTop = window.innerHeight - tip.offsetHeight;
    tip.style.left = Math.max(0, Math.min(left, maxLeft)) + "px";
    tip.style.top = Math.max(0, Math.min(top, maxTop)) + "px";
  }

  function startDrag(pointerId: number, dx: number, dy: number): void {
    grab = { dx, dy };
    dragBar?.setPointerCapture(pointerId);
  }

  function build(): HTMLDivElement {
    const el = tipShell(deps);
    const made = tipBar(deps, () => setPinned(!pinned));
    const bar = made.bar;
    pinBtn = made.pinBtn;
    dragBar = bar;
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      if (closestTarget(e, ".def-tip-btn")) return;
      e.preventDefault();
      setPinned(true);
      const rect = el.getBoundingClientRect();
      startDrag(e.pointerId, e.clientX - rect.left, e.clientY - rect.top);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!grab) return;
      move(e.clientX - grab.dx, e.clientY - grab.dy);
      zone = deps.dock.zoneAt(e.clientX, e.clientY);
      deps.dock.hint(zone);
    });
    const release = () => {
      grab = null;
      deps.dock.hint(null);
      savePin();
    };
    bar.addEventListener("pointerup", () => {
      const target = zone;
      zone = null;
      release();
      if (!target || !tipBody) return;
      deps.dock.dock(target, [...tipBody.childNodes]);
      deps.onClose();
    });
    bar.addEventListener("pointercancel", () => {
      zone = null;
      release();
    });

    tipBody = document.createElement("div");
    tipBody.className = "def-tip-body";
    el.append(bar, tipBody);
    document.body.appendChild(el);
    return el;
  }

  const ensure = (): HTMLDivElement => (tip ??= build());

  window.addEventListener("resize", () => {
    if (pinned && tip && !tip.hidden) move(tip.offsetLeft, tip.offsetTop);
  });

  return {
    el: () => tip,
    body: () => tipBody,
    ensure,
    pinned: () => pinned,
    setPinned,
    move,
    startDrag,
    showPinned(content) {
      const el = ensure();
      tipBody!.replaceChildren(...(content.length ? content : [emptyNote()]));
      el.hidden = false;
      el.scrollTop = 0;
      setPinned(true);
      return el;
    },
    savedPin: () => parsePin(read(KEYS.defPin)),
  };
}
