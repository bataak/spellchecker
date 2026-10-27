import type { EditorPort } from "../core/ports.ts";
import { initKeyboardToolbar } from "../editor/kbtoolbar.ts";
import type { MarkLayer } from "../editor/marklayer.ts";
import type { OfficeSession } from "../office/session.ts";
import { createButtonCommands } from "../ui/commands.ts";
import { initShortcuts } from "../ui/shortcuts.ts";
import type { StatusControl } from "../ui/status.ts";
import { confirmWipe } from "../ui/wipe.ts";
import type { Fixers } from "./fixers.ts";
import type { LastCaret } from "./lastcaret.ts";
import { initToolbar } from "./toolbar.ts";

export interface ChromeWiringView {
  readonly editor: HTMLTextAreaElement;
  readonly port: EditorPort;
  readonly status: StatusControl;
  readonly statusEl: HTMLElement;
  readonly backdropEl: HTMLElement;
}

export interface ChromeWiringDeps {
  readonly view: ChromeWiringView;
  readonly office: OfficeSession;
  readonly marks: MarkLayer;
  readonly fixers: Fixers;
  readonly lastCaret: LastCaret;
  readonly hasOpenFile: () => boolean;
  readonly forgetFile: () => void;
  readonly afterClear: (cleared: boolean) => void;
  readonly confirmClear?: () => boolean | Promise<boolean>;
  readonly invite: (text: string) => Promise<boolean>;
  readonly closeProject?: () => boolean;
  readonly openDictMenu: () => void;
}

export function bindAppChrome(deps: ChromeWiringDeps): void {
  const { editor, port, status, statusEl, backdropEl } = deps.view;
  const { office } = deps;

  initShortcuts({
    editor,
    commands: createButtonCommands(),
    wipe: confirmWipe,
    openDictMenu: deps.openDictMenu,
    lastCaret: deps.lastCaret.get,
  });

  initToolbar({
    editor: port,
    status,
    statusEl,
    office: { active: () => office.active() !== null, close: office.close },
    forgetFile: deps.forgetFile,
    afterClear: deps.afterClear,
    confirmClear: deps.confirmClear,
    closeProject: deps.closeProject,
    hasOpenFile: deps.hasOpenFile,
    badTokens: () => deps.marks.tokens(),
    lettersFixed: deps.fixers.announceLetters,
    invite: deps.invite,
  });
  initKeyboardToolbar(editor, backdropEl);
}
