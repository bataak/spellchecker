import type { App } from "./appparts.ts";
import { MultiSpellChecker } from "../spell/spellchecker.ts";
import { createSpellSession } from "../spell/spellsession.ts";
import { createProjectStore } from "../project/projectstore.ts";
import { createEmitter } from "../core/emitter.ts";
import type { Layout } from "../ui/layout.ts";
import { createBackdrop } from "../editor/backdrop.ts";
import { bindLineBlocks, createEditorView } from "./editorview.ts";
import { createDictStatus } from "../spellui/dictstatus.ts";
import { createLastCaret } from "./lastcaret.ts";
import { createMarkupMode } from "./markupmode.ts";
import { initStatus } from "../ui/status.ts";
import { createEditorPort } from "./ports.ts";
import { nextFrame, queryControls, queryShell } from "./dom.ts";
import { createOfficeSession } from "../office/session.ts";
import { createDocumentSession } from "../doc/docsession.ts";
import { initSaveHints } from "../export/savehints.ts";
import { createDocStatus } from "./docstatus.ts";
import { createDocMode } from "../doc/docmode.ts";
import { createTexMode } from "./texmode.ts";
import { warmTex } from "./texwarm.ts";
import { createMarkLayer } from "../editor/marklayer.ts";
import { texSpans } from "../tex/texhighlight.ts";
import { createPreviewMode } from "../ui/previewmode.ts";

export function composeEditor(app: App): void {
  const projectStore = createProjectStore();
  document.body.classList.add("ready");
  const els = queryShell();
  const controls = queryControls();
  const layoutChanged = createEmitter<Layout>();
  const backdrop = createBackdrop(els.backdrop);
  bindLineBlocks(backdrop, els.narrowMQ, () => void app.loop.render());
  const view = createEditorView({
    editor: els.editor,
    backdrop,
    marks: () => app.marks,
    onLine: (line) => app.docStatus.refreshLine(line),
    onScroll: () => app.pop.followScroll(),
  });
  app.provide({ projectStore, els, controls, layoutChanged, backdrop, view });

  const checker = new MultiSpellChecker();
  const spell = createSpellSession({
    checker,
    markup: () => app.markupMode.skips(),
    isLatex: (text) => app.isLatexText(text),
    progress: async (message, animate) => {
      app.status.set(message, animate);
      await nextFrame();
    },
  });
  app.provide({
    checker,
    spell,
    dicts: createDictStatus(),
    lastCaret: createLastCaret(),
  });

  const markupMode = createMarkupMode({
    isMarkdownFile: () => app.doc.isMarkdownFile(),
    render: () => app.loop.render(),
    entered: (on) => {
      app.previewMode.enter(on, app.isTexFile());
      app.previewCtl.setMarkdownMode(on);
      app.exportCtl.syncPrint();
      app.nudgeHints();
    },
  });
  const status = initStatus(els.status, () => app.docStatus.restore());
  const editor = createEditorPort({
    el: els.editor,
    set: (text, caret) => void app.editorText.set(text, caret),
    insert: (text, start, end) => app.editorText.insert(text, start, end),
    render: () => app.loop.render(),
    save: () => app.draft.save(),
    hidePopover: () => app.pop.hide(),
  });
  app.provide({
    markupMode,
    enterMdMode: (on) => markupMode.enter(on),
    status,
    editor,
  });
}

export function composeDocument(app: App): void {
  const { els, editor, status } = app;
  const office = createOfficeSession({
    editor,
    status,
    showSource: (source) => app.previewCtl.setSource(source),
    baseline: () => app.undoCtl.baseline(),
    syncFixButtons: () => app.fixers.sync(),
    onModeChange: (active) => {
      document.body.classList.toggle("docx-mode", active);
      app.doc.syncSaveHint();
      app.exportCtl.syncPrint();
    },
  });
  const officeActive = (): boolean => office.active() !== null;
  const isLatexText = (text: string): boolean => app.docMode.isLatex(text);
  const isTexFile = (): boolean => isLatexText(els.editor.value);
  app.provide({ office, officeActive, isLatexText, isTexFile });

  const doc = createDocumentSession({
    office: office.active,
    targetName: () => app.fileIO.targetName(),
    template: () => app.mdBar.template(),
    isTex: isTexFile,
    setSaveTitles: initSaveHints(app.controls),
    refreshBar: () => app.mdBar.refresh(),
    enterMode: app.enterMdMode,
  });
  const docStatus = createDocStatus({
    status,
    statusEl: els.status,
    editor: els.editor,
    dicts: app.dicts,
    fileName: doc.fileName,
    lineCount: app.backdrop.lineCount,
    desktop: els.desktopMQ,
    narrow: els.narrowMQ,
  });
  const docMode = createDocMode({ officeActive, fileName: doc.name });
  app.provide({ doc, docStatus, docMode });
}

export function composeModes(app: App): void {
  const { els, doc, status } = app;
  const texMode = createTexMode({
    isTex: app.isTexFile,
    paint: (on) => {
      if (app.marks.setTex(on) && on)
        warmTex((html, ms) => status.hold(html, ms, false));
    },
    changed: () => {
      app.mdBar.refresh();
      app.enterMdMode(doc.markdownActive());
      app.previewCtl.update();
      app.projectLink.sync();
      app.fixers.clean.sync();
    },
  });
  const marks = createMarkLayer({
    editor: els.editor,
    backdrop: app.backdrop,
    syncScroll: app.view.syncScroll,
    texHighlighter: texSpans,
  });
  const previewMode = createPreviewMode({
    hasText: () => els.editor.value.length > 0,
    setPaneAvailable: (on) => app.paneCtl.setAvailable(on),
    setBodyMode: (on) => document.body.classList.toggle("preview-mode", on),
    setLayout: (blocked, wanted, tex) => {
      app.measureCtl.setPreviewBlocked(blocked);
      app.measureCtl.setPreviewMode(wanted, tex);
    },
  });
  app.provide({ texMode, marks, previewMode });
}
