import type { Backdrop } from "../editor/backdrop.ts";
import type { DefTip } from "../define/deftip.ts";
import { isTouch } from "../editor/input.ts";
import type { WordSpan } from "../spell/lookup.ts";
import { wordScrollTarget } from "./popgeom.ts";
import { createPlacer } from "./popplace.ts";
import { buildDefPanel, hintOverlap, scrollHints } from "./popdef.ts";

export interface PopoverDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: Backdrop;
  readonly popover: HTMLElement;
  readonly defTip: DefTip;
  readonly syncScroll: () => void;
}

export interface Popover {
  readonly open: (start: number) => void;
  readonly isOpenAt: (start: number) => boolean;
  readonly list: () => HTMLElement | null;
  readonly measure: () => void;
  readonly place: () => void;
  readonly updateScrollHint: () => void;
  readonly obscuredBy: (btn: Element) => number;
  readonly bringWordIntoView: () => void;
  readonly hide: () => void;
  readonly showDefPanel: (word: string) => Promise<void>;
  readonly openWordPanel: (span: WordSpan) => Promise<void>;
  readonly followScroll: () => void;
}

interface DismissActions {
  hide(): void;
  closeDefPanel(): void;
  bringWordIntoView(): void;
  place(): void;
}

function bindDismiss(
  { editor, popover, defTip }: PopoverDeps,
  a: DismissActions,
): void {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.isComposing) return;
    if (!popover.hidden && popover.dataset.view === "def") {
      a.closeDefPanel();
      return;
    }
    if (defTip.wordTipOpen()) {
      defTip.hide();
      editor.focus({ preventScroll: true });
      return;
    }
    if (popover.hidden) return;
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae !== editor && !popover.contains(ae))
      return;
    a.hide();
    editor.focus({ preventScroll: true });
  });
  document.addEventListener("mousedown", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest("#popover, .def-tip") && target !== editor) a.hide();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      a.bringWordIntoView();
      a.place();
    });
    window.visualViewport.addEventListener("scroll", a.place);
  }
  window.addEventListener("resize", a.place);
}

export function initPopover(deps: PopoverDeps): Popover {
  const { editor, backdrop, popover, defTip } = deps;
  let activeStart: number | null = null;
  let kbAdjustTimer: ReturnType<typeof setTimeout> | null = null;
  let popoverScrollTop = 0;
  let wordPanelSpan: WordSpan | null = null;

  function hide(): void {
    defTip.hide();
    wordPanelSpan = null;
    delete popover.dataset.view;
    popover.hidden = true;
    activeStart = null;
    placer.forget();
    if (kbAdjustTimer) clearTimeout(kbAdjustTimer);
  }

  function closeDefPanel(): void {
    popover.querySelector(".pop-def")?.remove();
    delete popover.dataset.view;
    measure();
    place();
  }

  async function showDefPanel(
    word: string,
    onBack = closeDefPanel,
  ): Promise<void> {
    const def = await defTip.definitionFor(word);
    if (popover.hidden) return;
    popover.querySelector(".pop-def")?.remove();
    const { panel, back } = buildDefPanel(word, def, defTip, onBack);
    popover.appendChild(panel);
    popover.dataset.view = "def";
    measure();
    place();
    if (!isTouch()) back.focus();
  }

  async function openWordPanel(span: WordSpan): Promise<void> {
    if (!backdrop.rangeRectAt(span.start, span.end)) return;
    defTip.hide();
    defTip.resetDefinitions();
    const def = await defTip.definitionFor(span.word);
    if (!def.entries.length) return;
    activeStart = null;
    wordPanelSpan = span;
    popoverScrollTop = editor.scrollTop;
    popover.innerHTML = "";
    popover.hidden = false;
    await showDefPanel(span.word, hide);
  }

  function bringWordIntoView(): void {
    if (popover.hidden || activeStart == null) return;
    if (!isTouch()) return;
    const mark = backdrop.el.querySelector(
      'mark[data-start="' + activeStart + '"]',
    );
    if (!mark) return;
    const next = wordScrollTarget(editor, mark.getBoundingClientRect());
    if (next === null) return;
    editor.scrollTop = next;
    deps.syncScroll();
  }

  function scheduleKbAdjust(): void {
    if (kbAdjustTimer) clearTimeout(kbAdjustTimer);
    const delays = [100, 250, 450, 650];
    let delayIndex = 0;
    const run = () => {
      if (popover.hidden) return;
      bringWordIntoView();
      place();
      delayIndex++;
      if (delayIndex < delays.length)
        kbAdjustTimer = setTimeout(
          run,
          delays[delayIndex] - delays[delayIndex - 1],
        );
    };
    kbAdjustTimer = setTimeout(run, delays[0]);
  }

  function list(): HTMLElement | null {
    return popover.querySelector<HTMLElement>(".pop-list");
  }

  function updateScrollHint(): void {
    const target = list();
    if (target) scrollHints(popover, target);
  }

  function anchorRect(): DOMRect | null {
    if (wordPanelSpan)
      return backdrop.rangeRectAt(wordPanelSpan.start, wordPanelSpan.end);
    if (activeStart == null) return null;
    const mark = backdrop.el.querySelector(
      'mark[data-start="' + activeStart + '"]',
    );
    return mark ? mark.getBoundingClientRect() : null;
  }

  const placer = createPlacer({
    popover,
    anchor: anchorRect,
    lost: hide,
    placed: () => {
      updateScrollHint();
      defTip.position();
    },
  });
  const measure = placer.measure;
  const place = placer.place;

  function open(start: number): void {
    defTip.hide();
    wordPanelSpan = null;
    delete popover.dataset.view;
    defTip.resetDefinitions();
    popover.innerHTML =
      '<div class="pop-scroll">' +
      '<div class="pop-list"><div class="muted pop-empty">тооцоолж байна…</div></div>' +
      "</div>";
    activeStart = start;
    popoverScrollTop = editor.scrollTop;
    popover.hidden = false;
    bringWordIntoView();
    measure();
    place();
    scheduleKbAdjust();
  }

  function followScroll(): void {
    if (defTip.keyboardShifting()) {
      defTip.followWordTip();
      popoverScrollTop = editor.scrollTop;
    } else {
      defTip.hideWordTip();
    }
    if (!popover.hidden && Math.abs(editor.scrollTop - popoverScrollTop) > 20) {
      hide();
    } else {
      place();
    }
  }

  bindDismiss(deps, { hide, closeDefPanel, bringWordIntoView, place });

  return {
    open,
    isOpenAt: (start) => !popover.hidden && activeStart === start,
    list,
    measure,
    place,
    updateScrollHint,
    obscuredBy: (btn) => hintOverlap(popover, btn),
    bringWordIntoView,
    hide,
    showDefPanel: (word) => showDefPanel(word),
    openWordPanel,
    followScroll,
  };
}
