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
  readonly define: (word: string) => Promise<Definition>;
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

interface TipState {
  anchor: HTMLElement | null;
  shownWord: string;
  dockedWord: string;
}

interface ShowCtx {
  readonly deps: DefTipDeps;
  readonly win: ReturnType<typeof createTipWindow>;
  readonly words: ReturnType<typeof createWordAnchor>;
  readonly definitionFor: (word: string) => Promise<Definition>;
  readonly hide: () => void;
  readonly position: () => void;
}

function sameTip(st: TipState, c: ShowCtx, anchor: HTMLElement, word: string) {
  const open = c.win.el();
  if (!open || open.hidden) return false;
  return c.win.pinned() ? st.shownWord === word : st.anchor === anchor;
}

function light(c: ShowCtx, anchor: HTMLElement): void {
  if (anchor === c.words.el()) anchor.classList.add("is-lit");
}

function tipWanted(st: TipState, c: ShowCtx, anchor: HTMLElement): boolean {
  if (st.anchor !== anchor || !anchor.isConnected) return false;
  return anchor === c.words.el() || !c.deps.popover.hidden;
}

async function showTip(
  st: TipState,
  c: ShowCtx,
  anchor: HTMLElement,
  word: string,
): Promise<void> {
  if (sameTip(st, c, anchor, word)) {
    if (c.win.pinned()) {
      st.anchor = anchor;
      light(c, anchor);
    }
    return;
  }
  if (st.anchor && st.anchor !== anchor)
    st.anchor.setAttribute("aria-expanded", "false");
  st.anchor = anchor;
  const def = await c.definitionFor(word);
  if (!tipWanted(st, c, anchor)) return;
  if (!def.entries.length) {
    c.hide();
    return;
  }
  const docked = c.deps.dock.body();
  if (docked) {
    fillBody(docked, word, def, st.dockedWord !== word);
    docked.scrollTop = 0;
    st.dockedWord = word;
    light(c, anchor);
    return;
  }
  const defTip = c.win.ensure();
  fillBody(c.win.body()!, word, def, !defTip.hidden && st.shownWord !== word);
  st.shownWord = word;
  defTip.hidden = false;
  defTip.scrollTop = 0;
  anchor.setAttribute("aria-expanded", "true");
  light(c, anchor);
  c.position();
}

export function initDefTip(deps: DefTipDeps): DefTip {
  const st: TipState = { anchor: null, shownWord: "", dockedWord: "" };
  const words = createWordAnchor();
  const pause = createPauseToggle();

  const grace = graceTimer(DEF_TIP_GRACE_MS, () => hide());
  const keyboardShifting = watchKeyboardShift();

  function hide(): void {
    grace.cancel();
    if (st.anchor) st.anchor.setAttribute("aria-expanded", "false");
    st.anchor = null;
    words.el()?.classList.remove("is-lit");
    const tip = win.el();
    if (tip && !win.pinned()) tip.hidden = true;
  }

  const closePinned = (): void => {
    win.setPinned(false);
    hide();
  };

  const win = createTipWindow({
    dock: deps.dock,
    pause,
    onEnter: grace.cancel,
    onLeave: () => {
      if (st.anchor) grace.schedule();
    },
    onClose: closePinned,
  });

  const showPinned = (content: Node[]): void => {
    win.showPinned(content);
    st.shownWord = "";
  };
  bindDockPin({ dock: deps.dock, win, pause, showPinned, closePinned });

  const definitions = createDefinitionCache(deps.define);
  const definitionFor = definitions.get;

  function position(): void {
    const defTip = win.el();
    if (!defTip || defTip.hidden || !st.anchor || win.pinned()) return;
    if (!st.anchor.isConnected) {
      hide();
      return;
    }
    const pointerX = st.anchor === words.el() ? wordTip.pointerX() : null;
    placeDefTip(defTip, st.anchor, deps.popover, deps.editor, pointerX);
  }

  const ctx: ShowCtx = { deps, win, words, definitionFor, hide, position };
  const show = (anchor: HTMLElement, word: string): Promise<void> => {
    grace.cancel();
    return showTip(st, ctx, anchor, word);
  };

  const bindDot = (dot: HTMLElement): void =>
    bindDefDot(dot, {
      isAnchor: (el) => st.anchor === el,
      show: (el, word) => void show(el, word),
      hide,
      scheduleHide: grace.schedule,
      showPanel: deps.showPanel,
    });

  hideOnOutsidePointer(hide);

  const wordTipOpen = (): boolean => !!st.anchor && st.anchor === words.el();

  function hideWordTip(): void {
    if (wordTipOpen()) hide();
  }

  const wordTip = createWordTip({
    editor: deps.editor,
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
      st.dockedWord = "";
      win.body()?.replaceChildren(emptyNote());
      st.shownWord = "";
    },
  };
}
