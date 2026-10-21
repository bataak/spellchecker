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

const POP_LOADING =
  '<div class="pop-scroll">' +
  '<div class="pop-list"><div class="muted pop-empty">тооцоолж байна…</div></div>' +
  "</div>";

const KB_DELAYS = [100, 250, 450, 650];

function markOf(backdrop: Backdrop, start: number): Element | null {
  return backdrop.el.querySelector('mark[data-start="' + start + '"]');
}

function revealWord(
  editor: HTMLTextAreaElement,
  mark: Element | null,
): boolean {
  if (!mark) return false;
  const next = wordScrollTarget(editor, mark.getBoundingClientRect());
  if (next === null) return false;
  editor.scrollTop = next;
  return true;
}

function createKbAdjust(step: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
  };
  return {
    cancel,
    schedule(): void {
      cancel();
      let index = 0;
      const run = (): void => {
        if (!step()) return;
        index++;
        if (index < KB_DELAYS.length)
          timer = setTimeout(run, KB_DELAYS[index]! - KB_DELAYS[index - 1]!);
      };
      timer = setTimeout(run, KB_DELAYS[0]);
    },
  };
}

function anchorOf(
  backdrop: Backdrop,
  span: WordSpan | null,
  start: number | null,
): DOMRect | null {
  if (span) return backdrop.rangeRectAt(span.start, span.end);
  if (start == null) return null;
  return markOf(backdrop, start)?.getBoundingClientRect() ?? null;
}

function createDefPanel(
  popover: HTMLElement,
  defTip: DefTip,
  relayout: () => void,
) {
  const close = (): void => {
    popover.querySelector(".pop-def")?.remove();
    delete popover.dataset.view;
    relayout();
  };
  const show = async (word: string, onBack = close): Promise<void> => {
    const def = await defTip.definitionFor(word);
    if (popover.hidden) return;
    popover.querySelector(".pop-def")?.remove();
    const { panel, back } = buildDefPanel(word, def, defTip, onBack);
    popover.appendChild(panel);
    popover.dataset.view = "def";
    relayout();
    if (!isTouch()) back.focus();
  };
  return { close, show };
}

export function initPopover(deps: PopoverDeps): Popover {
  const { editor, backdrop, popover, defTip } = deps;
  let activeStart: number | null = null;
  let popoverScrollTop = 0;
  let wordPanelSpan: WordSpan | null = null;

  function hide(): void {
    defTip.hide();
    wordPanelSpan = null;
    delete popover.dataset.view;
    popover.hidden = true;
    activeStart = null;
    placer.forget();
    kbAdjust.cancel();
  }

  const defPanel = createDefPanel(popover, defTip, () => {
    measure();
    place();
  });
  const closeDefPanel = defPanel.close;
  const showDefPanel = defPanel.show;

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
    if (popover.hidden || activeStart == null || !isTouch()) return;
    if (revealWord(editor, markOf(backdrop, activeStart))) deps.syncScroll();
  }

  const kbAdjust = createKbAdjust(() => {
    if (popover.hidden) return false;
    bringWordIntoView();
    place();
    return true;
  });

  const list = (): HTMLElement | null =>
    popover.querySelector<HTMLElement>(".pop-list");

  function updateScrollHint(): void {
    const target = list();
    if (target) scrollHints(popover, target);
  }

  const placer = createPlacer({
    popover,
    anchor: () => anchorOf(backdrop, wordPanelSpan, activeStart),
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
    popover.innerHTML = POP_LOADING;
    activeStart = start;
    popoverScrollTop = editor.scrollTop;
    popover.hidden = false;
    bringWordIntoView();
    measure();
    place();
    kbAdjust.schedule();
  }

  function followScroll(): void {
    if (defTip.keyboardShifting()) {
      defTip.followWordTip();
      popoverScrollTop = editor.scrollTop;
    } else defTip.hideWordTip();
    if (!popover.hidden && Math.abs(editor.scrollTop - popoverScrollTop) > 20)
      hide();
    else place();
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
