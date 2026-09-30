import { clipText, displayHeadword, placeTip } from "./defmarks.ts";
import type { DictEntry } from "./stardict.ts";
import { rangeRectAt } from "./backdrop.ts";
import { KEYBOARD_LAYOUT_EVENT } from "./kbtoolbar.ts";
import { escapeHtml } from "./htmlutil.ts";
import { isTouch } from "./input.ts";
import type { WordSpan } from "./lookup.ts";

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
  readonly showWordDefinition: (span: WordSpan) => Promise<void>;
  readonly keyboardShifting: () => boolean;
}

const DEF_TEXT_LIMIT = 3000;
const DEF_TIP_GRACE_MS = 250;

export function initDefTip(deps: DefTipDeps): DefTip {
  const { editor, popover } = deps;
  let defTip: HTMLDivElement | null = null;
  let defTipAnchor: HTMLElement | null = null;
  let defTipHideTimer: ReturnType<typeof setTimeout> | null = null;
  let defCache = new Map<string, Promise<Definition>>();
  let wordAnchor: HTMLElement | null = null;
  let wordTipSpan: WordSpan | null = null;
  let keyboardShiftUntil = 0;

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
    if (defTip) defTip.hidden = true;
  }

  function definitionFor(word: string): Promise<Definition> {
    let pending = defCache.get(word);
    if (!pending) {
      pending = deps.define
        ? deps.define(word)
        : Promise.resolve({ source: "", entries: [], dicts: -1 });
      defCache.set(word, pending);
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

  function placeTipWithinEditor(
    ...args: Parameters<typeof placeTip>
  ): ReturnType<typeof placeTip> {
    const [anchor, container, tip, view, gap] = args;
    const editorBottom = editor.getBoundingClientRect().bottom;
    const bottom = Math.min(view.top + view.height, editorBottom);
    return placeTip(
      anchor,
      container,
      tip,
      { ...view, height: Math.max(0, bottom - view.top) },
      gap,
    );
  }

  function position(): void {
    if (!defTip || defTip.hidden || !defTipAnchor) return;
    if (!defTipAnchor.isConnected) {
      hide();
      return;
    }
    const vv = window.visualViewport;
    const anchorRect = defTipAnchor.getBoundingClientRect();
    const place = placeTipWithinEditor(
      anchorRect,
      popover.hidden ? anchorRect : popover.getBoundingClientRect(),
      { width: defTip.offsetWidth, height: defTip.offsetHeight },
      {
        left: vv ? vv.offsetLeft : 0,
        top: vv ? vv.offsetTop : 0,
        width: vv ? vv.width : window.innerWidth,
        height: vv ? vv.height : window.innerHeight,
      },
    );
    defTip.style.left = window.scrollX + place.left + "px";
    defTip.style.top = window.scrollY + place.top + "px";
  }

  function tipWanted(anchor: HTMLElement): boolean {
    if (defTipAnchor !== anchor || !anchor.isConnected) return false;
    return anchor === wordAnchor || !popover.hidden;
  }

  async function show(anchor: HTMLElement, word: string): Promise<void> {
    cancelHide();
    if (defTipAnchor === anchor && defTip && !defTip.hidden) return;
    if (defTipAnchor && defTipAnchor !== anchor)
      defTipAnchor.setAttribute("aria-expanded", "false");
    defTipAnchor = anchor;
    const def = await definitionFor(word);
    if (!tipWanted(anchor)) return;
    if (!def.entries.length) {
      hide();
      return;
    }
    if (!defTip) {
      defTip = document.createElement("div");
      defTip.id = "defTip";
      defTip.className = "def-tip";
      defTip.setAttribute("role", "tooltip");
      defTip.hidden = true;
      defTip.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "touch") cancelHide();
      });
      defTip.addEventListener("pointerleave", (e) => {
        if (e.pointerType !== "touch" && defTipAnchor) scheduleHide();
      });
      document.body.appendChild(defTip);
    }
    fill(defTip, word, def);
    defTip.hidden = false;
    defTip.scrollTop = 0;
    anchor.setAttribute("aria-expanded", "true");
    position();
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

  async function showWordDefinition(span: WordSpan): Promise<void> {
    const rect = rangeRectAt(span.start, span.end);
    if (!rect || !visibleInEditor(rect)) return;
    wordTipSpan = span;
    deps.hidePopover();
    const def = await definitionFor(span.word);
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
  };
}
