import type { Scope } from "./appparts.ts";
import { createEmptyTips } from "../ui/emptytips.ts";
import { createEmptyState } from "./emptystate.ts";
import { createCheckLoop } from "./checkloop.ts";
import { createPopovers } from "./popovers.ts";
import { createEditorWiring } from "./editorwiring.ts";
import { initAppearance } from "../ui/appearance.ts";
import { initMeasureControl } from "../ui/measure.ts";

type ChecksReads =
  | "controls"
  | "defTip"
  | "docStatus"
  | "draft"
  | "editorText"
  | "els"
  | "errorPanel"
  | "fixFlow"
  | "marks"
  | "pop"
  | "previewCtl"
  | "previewMode"
  | "spell"
  | "texMode"
  | "view";
type ChecksGives = "emptyTips" | "loop" | "syncEmptyState";

export function composeChecks(app: Scope<ChecksReads, ChecksGives>): void {
  const { els, view, marks, texMode } = app;
  const emptyTips = createEmptyTips(app.controls.emptyTips);
  const syncEmptyState = createEmptyState({
    el: els.emptyState,
    tips: emptyTips,
    textChanged: () => app.previewMode.textChanged(),
    cleared: () => app.defTip.clear(),
  });
  const loop = createCheckLoop({
    editor: els.editor,
    spell: app.spell,
    marks,
    docStatus: app.docStatus,
    prepare: (text) => {
      syncEmptyState(text);
      texMode.sync();
      marks.follow();
      app.previewCtl.update();
    },
    unready: (text) => {
      view.syncScroll();
      app.errorPanel.clear(text.trim() !== "");
    },
    painted: () => {
      view.syncScroll();
      view.captureTop();
      app.errorPanel.render();
    },
    setText: (text, caret) => app.editorText.set(text, caret),
    hidePopover: () => app.pop.hide(),
    save: () => app.draft.save(),
    propagate: () => app.fixFlow.propagate(),
    syncScroll: view.syncScroll,
  });
  app.provide({ emptyTips, syncEmptyState, loop });
}

type EditingReads =
  | "backdrop"
  | "checker"
  | "controls"
  | "dicts"
  | "docMode"
  | "editor"
  | "els"
  | "fixFlow"
  | "isTexFile"
  | "kbLayout"
  | "lastCaret"
  | "layoutChanged"
  | "loop"
  | "marks"
  | "mdBar"
  | "measureCtl"
  | "office"
  | "previewCtl"
  | "spell"
  | "status"
  | "syncEmptyState"
  | "view";
type EditingGives =
  | "defDock"
  | "defTip"
  | "draft"
  | "editorText"
  | "errorPanel"
  | "fixFlow"
  | "fixers"
  | "measureCtl"
  | "pop";

export function composeEditing(app: Scope<EditingReads, EditingGives>): void {
  const { els, view, marks, status, lastCaret, loop } = app;
  const popovers = createPopovers({
    editor: els.editor,
    backdrop: app.backdrop,
    popover: els.popover,
    workspace: els.workspace,
    editorWrap: els.editorWrap,
    desktopMQ: els.desktopMQ,
    checker: app.checker,
    hold: status.hold,
    englishEnabled: app.dicts.english,
    tokenAtCaret: view.tokenAtCaret,
    syncScroll: view.syncScroll,
    badTokens: () => marks.tokens(),
    lastCaret: lastCaret.get,
    setLastCaret: lastCaret.set,
    dockRoom: (side, active) => app.measureCtl.dockRoom(side, active),
    render: loop.render,
    apply: (token, replacement) => app.fixFlow.apply(token, replacement),
    dropFix: () => app.fixFlow.drop(),
    attachKeyboard: (input) => app.kbLayout.attach(input),
  });
  const { defDock, defTip, pop, errorPanel } = popovers;
  app.provide({ defDock, defTip, pop, errorPanel });

  const { editorText, fixFlow, fixers, draft } = createEditorWiring({
    view: {
      editor: els.editor,
      port: app.editor,
      backdrop: app.backdrop,
      view,
      marks,
      status,
      fixButtons: app.controls.fixButtons,
    },
    flow: {
      spell: app.spell,
      loop,
      office: app.office,
      popovers,
      lastCaret,
      skipClean: () => !app.docMode.checksLetters() || app.isTexFile(),
      textChanged: app.syncEmptyState,
      clearSource: () => app.previewCtl.setSource(null),
      mdBar: () => app.mdBar,
    },
  });
  app.provide({ editorText, fixFlow, fixers, draft });

  initAppearance(app.controls.appearance);
  const measureCtl = initMeasureControl(
    els.editorWrap,
    els.editor,
    app.layoutChanged.emit,
  );
  app.provide({ measureCtl });
  defDock.sync(measureCtl.layout().panel);
  app.layoutChanged.on((l) => defDock.sync(l.panel));
}
