import {
  clipText,
  displayHeadword,
  placeTip,
  placeTipAtPointer,
} from "./defmarks.ts";
import type { DictEntry } from "./stardict.ts";
import { rangeRectAt } from "./backdrop.ts";
import { KEYBOARD_LAYOUT_EVENT } from "./kbtoolbar.ts";
import { escapeHtml } from "./htmlutil.ts";
import { isTouch } from "./input.ts";
import type { WordSpan } from "./lookup.ts";
import { emptyNote, type DefDock } from "./defdock.ts";

export type Definition = {
  dicts: number;
  source: string;
  entries: DictEntry[];
};

export interface DefTipDeps {
  readonly editor: HTMLTextAreaElement;
  readonly popover: HTMLElement;
  readonly define: ((word: string) => Promise<Definition>) | undefined;
  readonly showPanel: (word: string) => void;
  readonly hidePopover: () => void;
  readonly holdStatus: (html: string, ms?: number, animate?: boolean) => void;
  readonly dock: DefDock;
}

export interface DefTip {
  readonly definitionFor: (word: string) => Promise<Definition>;
  readonly resetDefinitions: () => void;
  readonly fill: (tip: HTMLElement, word: string, def: Definition) => void;
  readonly hide: () => void;
  readonly position: () => void;
  readonly bindDot: (dot: HTMLElement) => void;
  readonly wordTipOpen: () => boolean;
  readonly hideWordTip: () => void;
  readonly followWordTip: () => void;
  readonly showWordDefinition: (
    span: WordSpan,
    pointerX?: number,
  ) => Promise<void>;
  readonly keyboardShifting: () => boolean;
  readonly pinned: () => boolean;
  readonly paused: () => boolean;
  readonly clear: () => void;
}

const DEF_TEXT_LIMIT = 3000;
const DEF_TIP_GRACE_MS = 250;
const PIN_KEY = "def-pin";
const PIN_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M9 5v14"/><path d="M15 5v14"/></svg>';
const PLAY_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M7 5v14l11-7z"/></svg>';
const PAUSE_LABEL = "Түр зогсоох (эсвэл Shift дарж барих)";
const RESUME_LABEL = "Заагчийг чагнах (эсвэл Ctrl дарж үг шалгах)";
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

export function initDefTip(deps: DefTipDeps): DefTip {
  const { editor, popover } = deps;
  let defTip: HTMLDivElement | null = null;
  let defTipBody: HTMLDivElement | null = null;
  let pinBtn: HTMLButtonElement | null = null;
  let pinned = false;
  let shownWord = "";
  let dockedWord = "";
  let defTipAnchor: HTMLElement | null = null;
  let defTipHideTimer: ReturnType<typeof setTimeout> | null = null;
  let defCache = new Map<string, Promise<Definition>>();
  let wordAnchor: HTMLElement | null = null;
  let wordTipSpan: WordSpan | null = null;
  let wordTicket = 0;
  let wordPointerX: number | null = null;
  let keyboardShiftUntil = 0;
  let grab: { dx: number; dy: number } | null = null;
  let zone: ReturnType<DefDock["zoneAt"]> = null;
  let dragBar: HTMLElement | null = null;
  let paused = false;
  const pauseBtns: HTMLButtonElement[] = [];

  function cancelHide(): void {
    if (defTipHideTimer) clearTimeout(defTipHideTimer);
    defTipHideTimer = null;
  }

  function scheduleHide(): void {
    cancelHide();
    defTipHideTimer = setTimeout(() => {
      defTipHideTimer = null;
      hide();
    }, DEF_TIP_GRACE_MS);
  }

  function hide(): void {
    cancelHide();
    if (defTipAnchor) defTipAnchor.setAttribute("aria-expanded", "false");
    defTipAnchor = null;
    wordAnchor?.classList.remove("is-lit");
    if (defTip && !pinned) defTip.hidden = true;
  }

  function savePin(): void {
    try {
      if (pinned && defTip)
        localStorage.setItem(
          PIN_KEY,
          `${defTip.offsetLeft},${defTip.offsetTop}`,
        );
      else localStorage.removeItem(PIN_KEY);
    } catch {}
  }

  function loadPin(): { left: number; top: number } | null {
    try {
      const [left, top] = (localStorage.getItem(PIN_KEY) ?? "")
        .split(",")
        .map(Number);
      return Number.isFinite(left) && Number.isFinite(top)
        ? { left: left!, top: top! }
        : null;
    } catch {
      return null;
    }
  }

  function setPinned(on: boolean): void {
    if (!defTip || pinned === on) return;
    const rect = defTip.getBoundingClientRect();
    pinned = on;
    defTip.classList.toggle("is-pinned", on);
    pinBtn?.setAttribute("aria-pressed", String(on));
    if (pinBtn) pinBtn.title = on ? "Бэхэлгээг авах" : "Энэ байрлалд бэхлэх";
    defTip.style.left = (on ? 0 : window.scrollX) + rect.left + "px";
    defTip.style.top = (on ? 0 : window.scrollY) + rect.top + "px";
    savePin();
  }

  function pauseButton(className: string): HTMLButtonElement {
    const button = iconButton(className, PAUSE_ICON, PAUSE_LABEL);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", () => setPaused(!paused));
    pauseBtns.push(button);
    return button;
  }

  function setPaused(on: boolean): void {
    paused = on;
    for (const button of pauseBtns) {
      button.setAttribute("aria-pressed", String(on));
      button.title = on ? RESUME_LABEL : PAUSE_LABEL;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = on ? PLAY_ICON : PAUSE_ICON;
    }
  }

  function closePinned(): void {
    setPinned(false);
    hide();
  }

  function moveTip(left: number, top: number): void {
    if (!defTip) return;
    const maxLeft = window.innerWidth - defTip.offsetWidth;
    const maxTop = window.innerHeight - defTip.offsetHeight;
    defTip.style.left = Math.max(0, Math.min(left, maxLeft)) + "px";
    defTip.style.top = Math.max(0, Math.min(top, maxTop)) + "px";
  }

  function iconButton(
    className: string,
    icon: string,
    label: string,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = icon;
    return button;
  }

  function buildTip(): HTMLDivElement {
    const tip = document.createElement("div");
    tip.id = "defTip";
    tip.className = "def-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    tip.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "touch") cancelHide();
    });
    tip.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "touch" && defTipAnchor) scheduleHide();
    });

    const bar = document.createElement("div");
    bar.className = "def-tip-bar";
    pinBtn = iconButton(
      "def-tip-btn def-tip-pin",
      PIN_ICON,
      "Энэ байрлалд бэхлэх",
    );
    pinBtn.setAttribute("aria-pressed", "false");
    pinBtn.addEventListener("click", () => setPinned(!pinned));
    const closeBtn = iconButton(
      "def-tip-btn def-tip-close",
      CLOSE_ICON,
      "Хаах",
    );
    closeBtn.addEventListener("click", closePinned);
    bar.append(pauseButton("def-tip-btn def-tip-pause"), pinBtn, closeBtn);

    bar.addEventListener("mousedown", (e) => e.preventDefault());
    dragBar = bar;
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      if ((e.target as Element).closest(".def-tip-btn")) return;
      e.preventDefault();
      setPinned(true);
      const rect = tip.getBoundingClientRect();
      startDrag(e.pointerId, e.clientX - rect.left, e.clientY - rect.top);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!grab) return;
      moveTip(e.clientX - grab.dx, e.clientY - grab.dy);
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
      if (!target || !defTipBody) return;
      deps.dock.dock(target, [...defTipBody.childNodes]);
      closePinned();
    });
    bar.addEventListener("pointercancel", () => {
      zone = null;
      release();
    });

    defTipBody = document.createElement("div");
    defTipBody.className = "def-tip-body";
    tip.append(bar, defTipBody);
    document.body.appendChild(tip);
    return tip;
  }

  function startDrag(pointerId: number, dx: number, dy: number): void {
    grab = { dx, dy };
    dragBar?.setPointerCapture(pointerId);
  }

  function showPinned(content: Node[]): HTMLDivElement {
    const tip = (defTip ??= buildTip());
    defTipBody!.replaceChildren(...(content.length ? content : [emptyNote()]));
    shownWord = "";
    tip.hidden = false;
    tip.scrollTop = 0;
    setPinned(true);
    return tip;
  }

  deps.dock.onDragOut((e, content) => {
    showPinned(content);
    moveTip(e.clientX - 40, e.clientY - 12);
    startDrag(e.pointerId, 40, 12);
  });

  deps.dock.addControl(pauseButton("error-copy def-dock-pause"));

  deps.dock.onShow((body) => {
    if (!pinned || !defTip || defTip.hidden || !defTipBody) return;
    const content = [...defTipBody.childNodes].filter(
      (node) => !(node as Element).classList?.contains("def-empty"),
    );
    if (content.length) {
      body.replaceChildren(...content);
      body.scrollTop = 0;
    }
    closePinned();
  });

  const savedPin = loadPin();
  if (savedPin && window.matchMedia("(hover: hover)").matches) {
    requestAnimationFrame(() => {
      if (deps.dock.body()) return;
      showPinned([]);
      moveTip(savedPin.left, savedPin.top);
    });
  }

  window.addEventListener("resize", () => {
    if (pinned && defTip && !defTip.hidden)
      moveTip(defTip.offsetLeft, defTip.offsetTop);
  });

  function definitionFor(word: string): Promise<Definition> {
    let pending = defCache.get(word);
    if (!pending) {
      pending = deps.define
        ? deps.define(word)
        : Promise.resolve({ source: "", entries: [], dicts: -1 });
      const cache = defCache;
      const request = pending;
      cache.set(word, request);
      void request.then((def) => {
        if (!def.entries.length && cache.get(word) === request)
          cache.delete(word);
      });
    }
    return pending;
  }

  function fill(tip: HTMLElement, word: string, def: Definition): void {
    tip.replaceChildren();
    const labels = def.entries.map((entry) =>
      displayHeadword(entry.headword, word),
    );
    const seen = new Map<string, number>();
    def.entries.forEach((entry, position) => {
      const label = labels[position]!;
      const repeats = labels.filter((item) => item === label).length;
      const nth = (seen.get(label) ?? 0) + 1;
      seen.set(label, nth);
      const block = document.createElement("div");
      block.className = "def-tip-entry";
      const head = document.createElement("div");
      head.className = "def-tip-hw";
      head.textContent = label;
      if (repeats > 1) {
        const num = document.createElement("span");
        num.className = "def-tip-num";
        num.textContent = " " + String(nth);
        head.appendChild(num);
      }
      block.appendChild(head);
      const text = document.createElement("div");
      text.className = "def-tip-text";
      text.textContent = clipText(entry.text, DEF_TEXT_LIMIT);
      block.appendChild(text);
      tip.appendChild(block);
      const next = def.entries[position + 1];
      if (entry.source && (!next || next.source !== entry.source)) {
        const from = document.createElement("div");
        from.className = "def-tip-source";
        from.textContent = entry.source;
        tip.appendChild(from);
      }
    });
    if (def.source && !def.entries.some((entry) => entry.source)) {
      const credit = document.createElement("div");
      credit.className = "def-tip-source";
      credit.textContent = def.source;
      tip.appendChild(credit);
    }
  }

  function reveal(body: HTMLElement): void {
    body.classList.remove("is-swapping");
    void body.offsetWidth;
    body.classList.add("is-swapping");
  }

  function withinEditor<V extends { top: number; height: number }>(view: V): V {
    const editorBottom = editor.getBoundingClientRect().bottom;
    const bottom = Math.min(view.top + view.height, editorBottom);
    return { ...view, height: Math.max(0, bottom - view.top) };
  }

  function position(): void {
    if (!defTip || defTip.hidden || !defTipAnchor || pinned) return;
    if (!defTipAnchor.isConnected) {
      hide();
      return;
    }
    defTip.style.maxHeight = "";
    const vv = window.visualViewport;
    const anchorRect = defTipAnchor.getBoundingClientRect();
    const size = { width: defTip.offsetWidth, height: defTip.offsetHeight };
    const view = withinEditor({
      left: vv ? vv.offsetLeft : 0,
      top: vv ? vv.offsetTop : 0,
      width: vv ? vv.width : window.innerWidth,
      height: vv ? vv.height : window.innerHeight,
    });
    const atPointer =
      defTipAnchor === wordAnchor && wordPointerX !== null
        ? placeTipAtPointer(wordPointerX, anchorRect, size, view)
        : null;
    const place =
      atPointer ??
      placeTip(
        anchorRect,
        popover.hidden ? anchorRect : popover.getBoundingClientRect(),
        size,
        view,
      );
    if (atPointer && atPointer.maxHeight < size.height)
      defTip.style.maxHeight = atPointer.maxHeight + "px";
    defTip.style.left = window.scrollX + place.left + "px";
    defTip.style.top = window.scrollY + place.top + "px";
  }

  function tipWanted(anchor: HTMLElement): boolean {
    if (defTipAnchor !== anchor || !anchor.isConnected) return false;
    return anchor === wordAnchor || !popover.hidden;
  }

  async function show(anchor: HTMLElement, word: string): Promise<void> {
    cancelHide();
    if (
      defTip &&
      !defTip.hidden &&
      (pinned ? shownWord === word : defTipAnchor === anchor)
    ) {
      if (pinned) {
        defTipAnchor = anchor;
        light(anchor);
      }
      return;
    }
    if (defTipAnchor && defTipAnchor !== anchor)
      defTipAnchor.setAttribute("aria-expanded", "false");
    defTipAnchor = anchor;
    const def = await definitionFor(word);
    if (!tipWanted(anchor)) return;
    if (!def.entries.length) {
      hide();
      return;
    }
    const docked = deps.dock.body();
    if (docked) {
      fill(docked, word, def);
      docked.scrollTop = 0;
      if (dockedWord !== word) reveal(docked);
      dockedWord = word;
      light(anchor);
      return;
    }
    if (!defTip) defTip = buildTip();
    fill(defTipBody!, word, def);
    if (!defTip.hidden && shownWord !== word) reveal(defTipBody!);
    shownWord = word;
    defTip.hidden = false;
    defTip.scrollTop = 0;
    anchor.setAttribute("aria-expanded", "true");
    light(anchor);
    position();
  }

  function light(anchor: HTMLElement): void {
    if (anchor === wordAnchor) anchor.classList.add("is-lit");
  }

  function bindDot(dot: HTMLElement): void {
    const word = dot.previousElementSibling?.textContent ?? "";
    if (!word) return;
    let pointerKind = "";
    const toggle = () => {
      if (defTipAnchor === dot) hide();
      else void show(dot, word);
    };
    dot.addEventListener("mousedown", (e) => e.preventDefault());
    dot.addEventListener("pointerdown", (e) => {
      pointerKind = e.pointerType;
    });
    dot.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "touch") void show(dot, word);
    });
    dot.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "touch" && defTipAnchor === dot) scheduleHide();
    });
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      const kind = pointerKind;
      pointerKind = "";
      if (kind === "mouse" || kind === "pen") return;
      if (isTouch()) {
        deps.showPanel(word);
        return;
      }
      toggle();
    });
    dot.addEventListener("focus", () => {
      if (!pointerKind) void show(dot, word);
    });
    dot.addEventListener("blur", () => {
      if (defTipAnchor === dot) hide();
    });
  }

  document.addEventListener("pointerdown", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest(".sg-dot, .def-tip")) hide();
  });

  function anchorAtRect(rect: DOMRect): HTMLElement {
    if (!wordAnchor) {
      wordAnchor = document.createElement("div");
      wordAnchor.className = "word-anchor";
      document.body.appendChild(wordAnchor);
    }
    wordAnchor.style.left = window.scrollX + rect.left + "px";
    wordAnchor.style.top = window.scrollY + rect.top + "px";
    wordAnchor.style.width = rect.width + "px";
    wordAnchor.style.height = rect.height + "px";
    return wordAnchor;
  }

  function wordTipOpen(): boolean {
    return !!defTipAnchor && defTipAnchor === wordAnchor;
  }

  function hideWordTip(): void {
    if (wordTipOpen()) hide();
  }

  function visibleInEditor(rect: DOMRect): boolean {
    const box = editor.getBoundingClientRect();
    return rect.top >= box.top - 2 && rect.bottom <= box.bottom + 2;
  }

  window.addEventListener(KEYBOARD_LAYOUT_EVENT, () => {
    keyboardShiftUntil = performance.now() + 500;
  });

  function followWordTip(): void {
    const rect = wordTipSpan
      ? rangeRectAt(wordTipSpan.start, wordTipSpan.end)
      : null;
    if (!rect || !visibleInEditor(rect)) {
      hideWordTip();
      return;
    }
    anchorAtRect(rect);
    position();
  }

  async function showWordDefinition(
    span: WordSpan,
    pointerX?: number,
  ): Promise<void> {
    const quiet = pointerX !== undefined;
    const rect = rangeRectAt(span.start, span.end);
    if (!rect || !visibleInEditor(rect)) return;
    const ticket = ++wordTicket;
    const def = await definitionFor(span.word);
    if (ticket !== wordTicket) return;
    if (quiet && !def.entries.length) {
      hideWordTip();
      return;
    }
    if (
      wordTipOpen() &&
      (wordTipSpan?.start !== span.start || wordTipSpan?.end !== span.end)
    )
      hide();
    wordTipSpan = span;
    wordPointerX = pointerX ?? null;
    if (!deps.dock.body() && !pinned) deps.hidePopover();
    if (!def.entries.length) {
      deps.holdStatus(
        "Тайлбар олдсонгүй: " + escapeHtml(span.word),
        3000,
        false,
      );
      return;
    }
    await show(anchorAtRect(rect), span.word);
  }

  return {
    definitionFor,
    resetDefinitions: () => {
      defCache = new Map();
    },
    fill,
    hide,
    position,
    bindDot,
    wordTipOpen,
    hideWordTip,
    followWordTip,
    showWordDefinition,
    keyboardShifting: () => performance.now() < keyboardShiftUntil,
    pinned: () => pinned && !!defTip && !defTip.hidden,
    paused: () => paused,
    clear: () => {
      hide();
      wordTipSpan = null;
      deps.dock.clear();
      dockedWord = "";
      if (defTipBody) defTipBody.replaceChildren(emptyNote());
      shownWord = "";
    },
  };
}
