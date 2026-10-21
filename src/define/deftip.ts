import { placeTip, placeTipAtPointer } from "./defmarks.ts";
import {
  createDefinitionCache,
  fillDefinition,
  type Definition,
} from "./definitions.ts";
import { createPauseToggle, createTipWindow } from "./tipwindow.ts";
import type { Backdrop } from "../editor/backdrop.ts";
import { KEYBOARD_LAYOUT_EVENT } from "../editor/kbtoolbar.ts";
import type { WordSpan } from "../spell/lookup.ts";
import { emptyNote, type DefDock } from "./defdock.ts";
import { bindDefDot } from "./defdot.ts";
import { bindDockPin } from "./defpin.ts";
import { createWordAnchor } from "./wordanchor.ts";
import { createWordTip } from "./wordtip.ts";

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

function graceTimer(
  ms: number,
  run: () => void,
): { cancel(): void; schedule(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    cancel,
    schedule() {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        run();
      }, ms);
    },
  };
}

function watchKeyboardShift(): () => boolean {
  let until = 0;
  window.addEventListener(KEYBOARD_LAYOUT_EVENT, () => {
    until = performance.now() + 500;
  });
  return () => performance.now() < until;
}

function hideOnOutsidePointer(hide: () => void): void {
  document.addEventListener("pointerdown", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest(".sg-dot, .def-tip")) hide();
  });
}

function fillBody(
  body: HTMLElement,
  word: string,
  def: Definition,
  swap: boolean,
): void {
  fillDefinition(body, word, def);
  if (!swap) return;
  body.classList.remove("is-swapping");
  void body.offsetWidth;
  body.classList.add("is-swapping");
}

function placeDefTip(
  tip: HTMLElement,
  anchor: HTMLElement,
  popover: HTMLElement,
  editor: HTMLElement,
  pointerX: number | null,
): void {
  tip.style.maxHeight = "";
  const vv = window.visualViewport;
  const anchorRect = anchor.getBoundingClientRect();
  const size = { width: tip.offsetWidth, height: tip.offsetHeight };
  const top = vv ? vv.offsetTop : 0;
  const bottom = Math.min(
    top + (vv ? vv.height : window.innerHeight),
    editor.getBoundingClientRect().bottom,
  );
  const view = {
    left: vv ? vv.offsetLeft : 0,
    top,
    width: vv ? vv.width : window.innerWidth,
    height: Math.max(0, bottom - top),
  };
  const atPointer =
    pointerX !== null
      ? placeTipAtPointer(pointerX, anchorRect, size, view)
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
    tip.style.maxHeight = atPointer.maxHeight + "px";
  tip.style.left = window.scrollX + place.left + "px";
  tip.style.top = window.scrollY + place.top + "px";
}

export function initDefTip(deps: DefTipDeps): DefTip {
  const { editor, popover } = deps;
  let shownWord = "";
  let dockedWord = "";
  let defTipAnchor: HTMLElement | null = null;
  const words = createWordAnchor();
  const pause = createPauseToggle();

  const grace = graceTimer(DEF_TIP_GRACE_MS, () => hide());
  const keyboardShifting = watchKeyboardShift();

  function hide(): void {
    grace.cancel();
    if (defTipAnchor) defTipAnchor.setAttribute("aria-expanded", "false");
    defTipAnchor = null;
    words.el()?.classList.remove("is-lit");
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
    onEnter: grace.cancel,
    onLeave: () => {
      if (defTipAnchor) grace.schedule();
    },
    onClose: closePinned,
  });

  const showPinned = (content: Node[]): void => {
    win.showPinned(content);
    shownWord = "";
  };
  bindDockPin({ dock: deps.dock, win, pause, showPinned, closePinned });

  const definitions = createDefinitionCache(deps.define);
  const definitionFor = definitions.get;

  function position(): void {
    const defTip = win.el();
    if (!defTip || defTip.hidden || !defTipAnchor || win.pinned()) return;
    if (!defTipAnchor.isConnected) {
      hide();
      return;
    }
    const pointerX = defTipAnchor === words.el() ? wordTip.pointerX() : null;
    placeDefTip(defTip, defTipAnchor, popover, editor, pointerX);
  }

  const light = (anchor: HTMLElement): void => {
    if (anchor === words.el()) anchor.classList.add("is-lit");
  };

  function tipWanted(anchor: HTMLElement): boolean {
    if (defTipAnchor !== anchor || !anchor.isConnected) return false;
    return anchor === words.el() || !popover.hidden;
  }

  async function show(anchor: HTMLElement, word: string): Promise<void> {
    grace.cancel();
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
      fillBody(docked, word, def, dockedWord !== word);
      docked.scrollTop = 0;
      dockedWord = word;
      light(anchor);
      return;
    }
    const defTip = win.ensure();
    fillBody(win.body()!, word, def, !defTip.hidden && shownWord !== word);
    shownWord = word;
    defTip.hidden = false;
    defTip.scrollTop = 0;
    anchor.setAttribute("aria-expanded", "true");
    light(anchor);
    position();
  }

  function bindDot(dot: HTMLElement): void {
    bindDefDot(dot, {
      isAnchor: (el) => defTipAnchor === el,
      show: (el, word) => void show(el, word),
      hide,
      scheduleHide: grace.schedule,
      showPanel: deps.showPanel,
    });
  }

  hideOnOutsidePointer(hide);

  function wordTipOpen(): boolean {
    return !!defTipAnchor && defTipAnchor === words.el();
  }

  function hideWordTip(): void {
    if (wordTipOpen()) hide();
  }

  const wordTip = createWordTip({
    editor,
    backdrop: deps.backdrop,
    anchor: words,
    definitionFor,
    isOpen: wordTipOpen,
    hide,
    position,
    show,
    beforeShow: () => {
      if (!deps.dock.body() && !win.pinned()) deps.hidePopover();
    },
    holdStatus: deps.holdStatus,
  });

  return {
    definitionFor,
    resetDefinitions: definitions.reset,
    fill: fillDefinition,
    hide,
    position,
    bindDot,
    wordTipOpen,
    hideWordTip,
    followWordTip: wordTip.follow,
    showWordDefinition: wordTip.showDefinition,
    keyboardShifting,
    pinned: () => win.pinned() && !(win.el()?.hidden ?? true),
    paused: pause.paused,
    clear: () => {
      hide();
      wordTip.forget();
      deps.dock.clear();
      dockedWord = "";
      win.body()?.replaceChildren(emptyNote());
      shownWord = "";
    },
  };
}
