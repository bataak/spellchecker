import type { Backdrop } from "../editor/backdrop.ts";
import { initDefDock, type DefDock } from "../define/defdock.ts";
import { initDefineControls } from "../define/definecontrols.ts";
import { initDefTip, type DefTip } from "../define/deftip.ts";
import { initErrorPanel, type ErrorPanel } from "../spellui/errorpanel.ts";
import { initPopover, type Popover } from "../ui/popover.ts";
import type { SpellChecker } from "../spell/spellchecker.ts";
import type { Token } from "../spell/textcheck.ts";
import {
  initSuggestPopover,
  type SuggestPopover,
} from "../spellui/suggestpopover.ts";
import { requireEl } from "../ui/dom.ts";
import type { Caret } from "./editorinput.ts";

export interface PopoversDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: Backdrop;
  readonly popover: HTMLElement;
  readonly workspace: HTMLElement;
  readonly editorWrap: HTMLElement;
  readonly desktopMQ: MediaQueryList;
  readonly checker: SpellChecker;
  readonly hold: (html: string, ms?: number, animate?: boolean) => void;
  readonly englishEnabled: () => ReadonlySet<string>;
  readonly tokenAtCaret: () => Token | null;
  readonly syncScroll: () => void;
  readonly badTokens: () => Token[];
  readonly lastCaret: () => Caret | null;
  readonly setLastCaret: (caret: Caret) => void;
  readonly dockRoom: (side: "left" | "right", active: boolean) => boolean;
  readonly render: () => Promise<void>;
  readonly apply: (token: Token, replacement: string) => Promise<void>;
  readonly dropFix: () => void;
  readonly attachKeyboard: (input: HTMLInputElement) => void;
}

export interface Popovers {
  readonly defDock: DefDock;
  readonly defTip: DefTip;
  readonly pop: Popover;
  readonly errorPanel: ErrorPanel;
  readonly suggestPopover: SuggestPopover;
}

export function createPopovers(deps: PopoversDeps): Popovers {
  const { editor, backdrop, popover, desktopMQ, checker } = deps;
  const showFor = (token: Token): void => void suggestPopover.showFor(token);

  const defDock = initDefDock({
    workspace: deps.workspace,
    editorWrap: deps.editorWrap,
    errorPanel: requireEl("#errorPanel"),
    desktopMQ,
    room: deps.dockRoom,
  });

  const defTip = initDefTip({
    editor,
    popover,
    define: (word) => checker.define(word),
    showPanel: (word) => void pop.showDefPanel(word),
    hidePopover: () => pop.hide(),
    holdStatus: deps.hold,
    dock: defDock,
    backdrop,
  });

  const pop = initPopover({
    editor,
    backdrop,
    popover,
    defTip,
    syncScroll: deps.syncScroll,
  });

  const errorPanel = initErrorPanel({
    editor,
    backdrop,
    desktopMQ,
    list: document.querySelector<HTMLElement>("#errorList"),
    copy: document.querySelector<HTMLButtonElement>("#copyErrorsBtn"),
    title: document.querySelector<HTMLElement>("#errorPanelTitle"),
    badTokens: deps.badTokens,
    lastCaret: deps.lastCaret,
    setLastCaret: deps.setLastCaret,
    onPick: deps.dropFix,
    syncScroll: deps.syncScroll,
    showPopoverFor: showFor,
  });

  initDefineControls({
    editor,
    button: document.querySelector<HTMLButtonElement>("#defineBtn"),
    backdrop,
    checker,
    defTip,
    defDock,
    pop,
    holdStatus: deps.hold,
    englishEnabled: deps.englishEnabled,
    errorAtCaret: deps.tokenAtCaret,
    showErrorPopover: showFor,
  });

  const suggestPopover = initSuggestPopover({
    editor,
    backdrop,
    popover,
    pop,
    defTip,
    checker,
    desktopMQ,
    render: deps.render,
    apply: deps.apply,
    attachKeyboard: deps.attachKeyboard,
    errorAtCaret: deps.tokenAtCaret,
  });

  return { defDock, defTip, pop, errorPanel, suggestPopover };
}
