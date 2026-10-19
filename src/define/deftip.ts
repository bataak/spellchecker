import { placeTip, placeTipAtPointer } from "./defmarks.ts";
import {
  createDefinitionCache,
  fillDefinition,
  type Definition,
} from "./definitions.ts";
import { createPauseToggle, createTipWindow } from "./tipwindow.ts";
import type { Backdrop } from "../editor/backdrop.ts";
import { KEYBOARD_LAYOUT_EVENT } from "../editor/kbtoolbar.ts";
import { escapeHtml } from "../core/htmlutil.ts";
import { isTouch } from "../editor/input.ts";
import type { WordSpan } from "../spell/lookup.ts";
import { emptyNote, type DefDock } from "./defdock.ts";

const LATIN = /\p{Script=Latin}/u;

export type { Definition } from "./definitions.ts";

export interface DefTipDeps {
  readonly editor: HTMLTextAreaElement;
  readonly popover: HTMLElement;
  readonly define: ((word: string) => Promise<Definition>) | undefined;
  readonly showPanel: (word: string) => void;
  readonly hidePopover: () => void;
  readonly holdStatus: (html: string, ms?: number, animate?: boolean) => void;
  readonly dock: DefDock;
  readonly backdrop: Backdrop;
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

const DEF_TIP_GRACE_MS = 250;

export function initDefTip(deps: DefTipDeps): DefTip {
  const { editor, popover } = deps;
  let shownWord = "";
  let dockedWord = "";
  let defTipAnchor: HTMLElement | null = null;
  let defTipHideTimer: ReturnType<typeof setTimeout> | null = null;
  let wordAnchor: HTMLElement | null = null;
  let wordTipSpan: WordSpan | null = null;
  let wordTicket = 0;
  let wordPointerX: number | null = null;
  let keyboardShiftUntil = 0;
  const pause = createPauseToggle();

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
    const tip = win.el();
    if (tip && !win.pinned()) tip.hidden = true;
  }

  function closePinned(): void {
    win.setPinned(false);
    hide();
  }

  const win = createTipWindow({
    dock: deps.dock,
    pause,
    onEnter: cancelHide,
    onLeave: () => {
      if (defTipAnchor) scheduleHide();
    },
    onClose: closePinned,
  });

  function showPinned(content: Node[]): void {
    win.showPinned(content);
    shownWord = "";
  }

  deps.dock.onDragOut((e, content) => {
    showPinned(content);
    win.move(e.clientX - 40, e.clientY - 12);
    win.startDrag(e.pointerId, 40, 12);
  });

  deps.dock.addControl(pause.button("error-copy def-dock-pause"));

  deps.dock.onShow((body) => {
    const tip = win.el();
    const tipBody = win.body();
    if (!win.pinned() || !tip || tip.hidden || !tipBody) return;
    const content = [...tipBody.childNodes].filter(
      (node) => !(node as Element).classList?.contains("def-empty"),
    );
    if (content.length) {
      body.replaceChildren(...content);
      body.scrollTop = 0;
    }
    closePinned();
  });

  const savedPin = win.savedPin();
  if (savedPin && window.matchMedia("(hover: hover)").matches) {
    requestAnimationFrame(() => {
      if (deps.dock.body()) return;
      showPinned([]);
      win.move(savedPin.left, savedPin.top);
    });
  }

  const definitions = createDefinitionCache(deps.define);
  const definitionFor = definitions.get;

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
    const defTip = win.el();
    if (!defTip || defTip.hidden || !defTipAnchor || win.pinned()) return;
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
    const pinned = win.pinned();
    const open = win.el();
    if (
      open &&
      !open.hidden &&
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
      fillDefinition(docked, word, def);
      docked.scrollTop = 0;
      if (dockedWord !== word) reveal(docked);
      dockedWord = word;
      light(anchor);
      return;
    }
    const defTip = win.ensure();
    const defTipBody = win.body()!;
    fillDefinition(defTipBody, word, def);
    if (!defTip.hidden && shownWord !== word) reveal(defTipBody);
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
      ? deps.backdrop.rangeRectAt(wordTipSpan.start, wordTipSpan.end)
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
    const rect = deps.backdrop.rangeRectAt(span.start, span.end);
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
    if (!deps.dock.body() && !win.pinned()) deps.hidePopover();
    if (!def.entries.length) {
      deps.holdStatus(
        "Тайлбар олдсонгүй: " + escapeHtml(span.word),
        3000,
        false,
      );
      return;
    }
    const anchor = anchorAtRect(rect);
    anchor.dataset.script = LATIN.test(span.word) ? "latin" : "other";
    await show(anchor, span.word);
  }

  return {
    definitionFor,
    resetDefinitions: definitions.reset,
    fill: fillDefinition,
    hide,
    position,
    bindDot,
    wordTipOpen,
    hideWordTip,
    followWordTip,
    showWordDefinition,
    keyboardShifting: () => performance.now() < keyboardShiftUntil,
    pinned: () => win.pinned() && !(win.el()?.hidden ?? true),
    paused: pause.paused,
    clear: () => {
      hide();
      wordTipSpan = null;
      deps.dock.clear();
      dockedWord = "";
      win.body()?.replaceChildren(emptyNote());
      shownWord = "";
    },
  };
}
