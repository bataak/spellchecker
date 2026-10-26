import type { Scope } from "./appparts.ts";
import { initAppExport } from "./appexport.ts";
import { bindAppChrome } from "./chromewiring.ts";
import { createCollabWiring } from "./collabwiring.ts";
import { watchTabs } from "./tabwatch.ts";
import { startApp } from "./startup.ts";
import { fileSlot } from "../collab/roomslot.ts";
import { keepLayoutOnReload } from "../ui/layoutsnapshot.ts";

type ShellReads =
  | "collab"
  | "dictionaries"
  | "doc"
  | "editor"
  | "els"
  | "emptyTips"
  | "enterMdMode"
  | "errorPanel"
  | "fileIO"
  | "fixers"
  | "isTexFile"
  | "lastCaret"
  | "marks"
  | "mdBar"
  | "nudgeHints"
  | "office"
  | "officeActive"
  | "paneCtl"
  | "pop"
  | "previewCtl"
  | "previewMode"
  | "projectLink"
  | "saveChain"
  | "status";
type ShellGives = "exportCtl";

export function composeShell(app: Scope<ShellReads, ShellGives>): void {
  const { els, status, doc, mdBar, projectLink, fileIO } = app;
  const exportCtl = initAppExport({
    saveChain: app.saveChain,
    editor: els.editor,
    templateId: () => mdBar.template(),
    isMarkdownFile: doc.isMarkdownFile,
    isTex: app.isTexFile,
    baseName: doc.baseName,
    blocked: app.officeActive,
    project: () => projectLink,
    pdf: () => app.previewCtl.pdf(),
    saveSource: fileIO.saveSource,
    hold: status.hold,
  });
  app.provide({ exportCtl });
  app.enterMdMode(doc.markdownActive());
  els.editor.addEventListener("input", app.nudgeHints);

  els.desktopMQ.addEventListener("change", () => {
    app.paneCtl.sync();
    app.pop.hide();
    app.errorPanel.render();
  });

  bindAppChrome({
    view: {
      editor: els.editor,
      port: app.editor,
      status,
      statusEl: els.status,
      backdropEl: els.backdrop,
    },
    office: app.office,
    marks: app.marks,
    fixers: app.fixers,
    lastCaret: app.lastCaret,
    hasOpenFile: () => doc.fileName() !== null,
    forgetFile: () => {
      app.previewMode.cleared();
      projectLink.cleared();
      fileIO.forgetFile();
      if (app.collab.forget(fileSlot(mdBar.slot())))
        status.hold("Хамтын засвараас гарлаа. Бусдын бичвэр хэвээр үлдэнэ.");
    },
    afterClear: (cleared) => {
      mdBar.reset(cleared);
      app.emptyTips.rotate();
    },
    openDictMenu: () => app.dictionaries.openMenu(),
  });
  keepLayoutOnReload();
}

type SessionReads =
  | "appUpdate"
  | "backdrop"
  | "checker"
  | "dicts"
  | "doc"
  | "docStatus"
  | "draft"
  | "els"
  | "entryUrl"
  | "fileIO"
  | "isTexFile"
  | "loop"
  | "marks"
  | "mdBar"
  | "measureCtl"
  | "nudgeHints"
  | "office"
  | "officeActive"
  | "projectLink"
  | "projectStore"
  | "status"
  | "undoCtl";
type SessionGives = "collab" | "dictionaries" | "tabGuard";

export function composeSession(app: Scope<SessionReads, SessionGives>): void {
  const { els, status, doc, mdBar, projectLink, projectStore } = app;
  const collab = createCollabWiring({
    editor: els.editor,
    view: {
      host: els.editorWrap,
      caretRect: app.backdrop.caretRect,
      rangeRects: app.backdrop.rangeRects,
    },
    mdBar,
    doc,
    store: projectStore,
    project: projectLink,
    isTex: app.isTexFile,
    officeActive: app.officeActive,
    undo: () => app.undoCtl,
    notify: (message) => status.hold(message, 8000, false),
  });
  const tabGuard = watchTabs({
    slot: () => mdBar.slot(),
    project: () => projectStore.project()?.uid ?? null,
    onProjectChange: projectStore.onProjectChange,
    warn: (message) => status.hold(message, 8000, false),
  });
  app.provide({ collab, tabGuard });

  const dictionaries = startApp({
    entryUrl: app.entryUrl,
    editor: els.editor,
    backdropEl: els.backdrop,
    statusEl: els.status,
    backdrop: app.backdrop,
    checker: app.checker,
    dicts: app.dicts,
    docStatus: app.docStatus,
    status,
    appUpdate: app.appUpdate,
    loop: app.loop,
    marks: app.marks,
    draft: app.draft,
    undo: () => app.undoCtl,
    mdBar,
    office: app.office,
    fileIO: app.fileIO,
    doc,
    project: projectLink,
    store: projectStore,
    collab,
    measure: app.measureCtl,
    nudge: app.nudgeHints,
  });
  app.provide({ dictionaries });
}
