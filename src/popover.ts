import { rangeRectAt } from "./backdrop.ts";
import type { DefTip } from "./deftip.ts";
import { isTouch } from "./input.ts";
import type { WordSpan } from "./lookup.ts";

export interface PopoverDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: HTMLElement;
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

const MIN_POPOVER_H = 120;

export function initPopover(deps: PopoverDeps): Popover {
  const { editor, backdrop, popover, defTip } = deps;
  let activeStart: number | null = null;
  let kbAdjustTimer: ReturnType<typeof setTimeout> | null = null;
  let popoverScrollTop = 0;
  let popoverFullH = 0;
  let popoverChromeH = 0;
  let wordPanelSpan: WordSpan | null = null;
  let safeTopProbe: HTMLElement | null = null;

  function hide(): void {
    defTip.hide();
    wordPanelSpan = null;
    delete popover.dataset.view;
    popover.hidden = true;
    activeStart = null;
    popoverFullH = 0;
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
    const panel = document.createElement("div");
    panel.className = "pop-def";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "pop-back";
    back.textContent = "← " + word;
    back.addEventListener("click", onBack);
    panel.appendChild(back);
    const body = document.createElement("div");
    body.className = "pop-def-body";
    if (def.entries.length) defTip.fill(body, word, def);
    else {
      const empty = document.createElement("div");
      empty.className = "muted pop-empty";
      empty.textContent = "Тайлбар олдсонгүй";
      body.appendChild(empty);
    }
    panel.appendChild(body);
    popover.appendChild(panel);
    popover.dataset.view = "def";
    measure();
    place();
    if (!isTouch()) back.focus();
  }

  async function openWordPanel(span: WordSpan): Promise<void> {
    if (!rangeRectAt(span.start, span.end)) return;
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

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.isComposing) return;
    if (!popover.hidden && popover.dataset.view === "def") {
      closeDefPanel();
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
    hide();
    editor.focus({ preventScroll: true });
  });

  function bringWordIntoView(): void {
    if (popover.hidden || activeStart == null) return;
    if (!isTouch()) return;
    const mark = backdrop.querySelector(
      'mark[data-start="' + activeStart + '"]',
    );
    if (!mark) return;

    const vv = window.visualViewport;
    const editorRect = editor.getBoundingClientRect();
    const vTop = vv ? vv.offsetTop : 0;
    const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const visTop = Math.max(editorRect.top, vTop);
    const visBottom = Math.min(editorRect.bottom, vBottom);
    const visH = visBottom - visTop;
    if (visH <= 60) return;

    const markRect = mark.getBoundingClientRect();
    if (markRect.top >= visTop + 8 && markRect.bottom <= visBottom - 8) return;

    const targetY = visTop + Math.max(60, Math.min(visH * 0.3, 150));
    const maxScroll = editor.scrollHeight - editor.clientHeight;
    const next = Math.max(
      0,
      Math.min(editor.scrollTop + (markRect.top - targetY), maxScroll),
    );
    if (Math.abs(next - editor.scrollTop) > 2) {
      editor.scrollTop = next;
      deps.syncScroll();
    }
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

  function scroller(): HTMLElement | null {
    return list() ?? popover.querySelector<HTMLElement>(".pop-def-body");
  }

  function measure(): void {
    const target = scroller();
    if (!target) return;
    target.style.maxHeight = "";
    target.style.overflowY = "";
    popover.style.maxHeight = "";
    popoverFullH = popover.offsetHeight;
    popoverChromeH = popoverFullH - target.offsetHeight;
  }

  function updateScrollHint(): void {
    const target = list();
    if (!target) return;
    const down = popover.querySelector<HTMLElement>(".pop-more");
    const up = popover.querySelector<HTMLElement>(".pop-less");
    const rest = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (down) down.hidden = rest <= 2;
    if (up) up.hidden = target.scrollTop <= 2;
  }

  function obscuredBy(btn: Element): number {
    const rect = btn.getBoundingClientRect();
    const up = popover.querySelector<HTMLElement>(".pop-less");
    if (up && !up.hidden) {
      const limit = up.getBoundingClientRect().bottom + 4;
      if (rect.top < limit) return rect.top - limit;
    }
    const down = popover.querySelector<HTMLElement>(".pop-more");
    if (down && !down.hidden) {
      const limit = down.getBoundingClientRect().top - 4;
      if (rect.bottom > limit) return rect.bottom - limit;
    }
    return 0;
  }

  function setStyle(
    target: HTMLElement,
    name: "top" | "left" | "maxHeight" | "overflowY",
    value: string,
  ): void {
    if (target.style[name] !== value) target.style[name] = value;
  }

  function sheetMode(): boolean {
    return isTouch() && popover.dataset.view === "def";
  }

  function anchorRect(): DOMRect | null {
    if (wordPanelSpan)
      return rangeRectAt(wordPanelSpan.start, wordPanelSpan.end);
    if (activeStart == null) return null;
    const mark = backdrop.querySelector(
      'mark[data-start="' + activeStart + '"]',
    );
    return mark ? mark.getBoundingClientRect() : null;
  }

  function safeAreaTop(): number {
    if (!safeTopProbe) {
      safeTopProbe = document.createElement("div");
      safeTopProbe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;" +
        "pointer-events:none;padding-top:env(safe-area-inset-top)";
      document.body.appendChild(safeTopProbe);
    }
    return parseFloat(getComputedStyle(safeTopProbe).paddingTop) || 0;
  }

  function placeSheet(): void {
    const rect = anchorRect();
    if (!rect) {
      hide();
      return;
    }
    const margin = 8;
    const vv = window.visualViewport;
    const safeTop = safeAreaTop();
    const viewTop = (vv ? vv.offsetTop : 0) + safeTop;
    const viewH = (vv ? vv.height : window.innerHeight) - safeTop;
    const viewBottom = viewTop + viewH;
    const popH = popoverFullH || popover.offsetHeight;
    const spaceBelow = viewBottom - rect.bottom - margin * 2;
    const spaceAbove = rect.top - viewTop - margin * 2;
    const below = spaceBelow >= spaceAbove;
    const room = Math.max(MIN_POPOVER_H, below ? spaceBelow : spaceAbove);
    const usedH = Math.min(popH, room);
    setStyle(popover, "maxHeight", usedH + "px");
    const body = popover.querySelector<HTMLElement>(".pop-def-body");
    if (body) {
      setStyle(body, "maxHeight", "");
      setStyle(body, "overflowY", "auto");
    }
    const wanted = below ? rect.bottom + margin : rect.top - usedH - margin;
    const top = Math.max(
      viewTop + margin,
      Math.min(wanted, viewBottom - usedH - margin),
    );
    setStyle(popover, "top", top + "px");
    setStyle(popover, "left", "");
  }

  function place(): void {
    if (popover.hidden) return;
    if (sheetMode()) {
      placeSheet();
      return;
    }
    setStyle(popover, "maxHeight", "");
    const markRect = anchorRect();
    if (!markRect) {
      hide();
      return;
    }
    const margin = 6;

    const vv = window.visualViewport;
    const safeTop = safeAreaTop();
    const viewTop = (vv ? vv.offsetTop : 0) + safeTop;
    const viewLeft = vv ? vv.offsetLeft : 0;
    const viewW = vv ? vv.width : window.innerWidth;
    const viewH = (vv ? vv.height : window.innerHeight) - safeTop;
    const viewBottom = viewTop + viewH;

    const popH = popoverFullH || popover.offsetHeight;
    const popW = popover.offsetWidth;

    const spaceBelow = viewBottom - markRect.bottom - margin * 2;
    const spaceAbove = markRect.top - viewTop - margin * 2;
    const below = spaceBelow >= spaceAbove;
    const room = Math.max(MIN_POPOVER_H, below ? spaceBelow : spaceAbove);
    const usedH = Math.min(popH, room);
    const capped = usedH < popH;

    const target = scroller();
    if (target) {
      setStyle(
        target,
        "maxHeight",
        capped ? usedH - popoverChromeH + "px" : "",
      );
      setStyle(target, "overflowY", capped ? "auto" : "");
    }

    let top = below ? markRect.bottom + margin : markRect.top - usedH - margin;
    top = Math.max(
      viewTop + margin,
      Math.min(top, viewBottom - usedH - margin),
    );
    const left = Math.max(
      viewLeft + margin,
      Math.min(markRect.left, viewLeft + viewW - popW - margin),
    );

    setStyle(popover, "top", window.scrollY + top + "px");
    setStyle(popover, "left", window.scrollX + left + "px");
    updateScrollHint();
    defTip.position();
  }

  function open(start: number): void {
    defTip.hide();
    wordPanelSpan = null;
    delete popover.dataset.view;
    defTip.resetDefinitions();
    popover.innerHTML =
      '<div class="pop-scroll">' +
      '<div class="pop-list"><div class="muted pop-empty">…</div></div>' +
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

  document.addEventListener("mousedown", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest("#popover, .def-tip") && target !== editor) hide();
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      bringWordIntoView();
      place();
    });
    window.visualViewport.addEventListener("scroll", place);
  }
  window.addEventListener("resize", place);

  return {
    open,
    isOpenAt: (start) => !popover.hidden && activeStart === start,
    list,
    measure,
    place,
    updateScrollHint,
    obscuredBy,
    bringWordIntoView,
    hide,
    showDefPanel: (word) => showDefPanel(word),
    openWordPanel,
    followScroll,
  };
}
