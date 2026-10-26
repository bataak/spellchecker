import type { App } from "./appparts.ts";
import { createPreviewPane } from "./previewpane.ts";
import { initAppUpdate } from "./appupdate.ts";
import { createFileWiring } from "./filewiring.ts";
import { initMdToolbar } from "../mdbar/mdtoolbar.ts";
import { initAppHints } from "./apphints.ts";
import { initTexInput } from "./texinput.ts";
import { createProjectWiring } from "./projectwiring.ts";
import { initKeyboardLayout } from "../editor/kblayout.ts";
import { initImageStore } from "../files/imagestore.ts";
import { initUndoHistory } from "../editor/undohistory.ts";
import { fileSlot } from "../collab/roomslot.ts";

export function composePanes(app: App): void {
  const { els, view, status, editor, doc } = app;
  const pane = createPreviewPane({
    wrap: els.editorWrap,
    area: els.editor,
    workspace: els.workspace,
    measure: app.measureCtl,
    layoutChanged: app.layoutChanged,
    sideBySide: () => els.desktopMQ.matches,
    visibleOffset: view.visibleOffset,
    onFormat: (
      next,
      caret = Math.min(els.editor.selectionStart, next.length),
    ) => void editor.reformat(next, caret),
    isLatex: app.isLatexText,
    projectKey: () => app.projectLink.key(),
    inProject: () => app.projectLink.bound(),
    texProject: () => app.projectLink.texProject(),
    jump: view.revealRange,
    mainFile: () =>
      app.projectLink.bound()
        ? (app.projectStore.project()?.main ?? null)
        : null,
    baseName: doc.baseName,
    mobileTex: () =>
      els.touchMQ.matches &&
      !els.desktopMQ.matches &&
      !app.officeActive() &&
      app.isTexFile(),
    saveProject: () => app.projectLink.save(true),
    notify: status.hold,
  });
  app.provide({ previewCtl: pane.preview, paneCtl: pane.pane });

  const appUpdate = initAppUpdate((html) => status.hold(html), app.entryUrl);
  const { saveChain, fileIO, slots } = createFileWiring({
    editor,
    status,
    office: app.office,
    doc,
    pdf: pane.pdfSave,
    isTex: app.isTexFile,
    project: () => app.projectLink,
    mdBar: () => app.mdBar,
    undo: () => app.undoCtl,
    refreshPreview: () => app.previewCtl.update(),
  });
  app.provide({ appUpdate, saveChain, fileIO, slots });
}

function templateChanged(app: App, id: string, from: string): void {
  app.previewMode.templateChanged();
  app.docMode.setTemplate(id);
  app.fixers.clean.sync();
  if (from !== app.mdBar.slot()) app.slots.enter(app.mdBar.slot());
  app.texMode.sync();
  app.projectLink.sync();
  app.enterMdMode(app.doc.markdownActive());
  app.tabGuard.sync();
}

export function composeToolbar(app: App): void {
  const { els, status, doc, slots } = app;
  const mdBar = initMdToolbar({
    editor: els.editor,
    mount: document.querySelector<HTMLElement>("header.topbar") ?? undefined,
    isMdFile: doc.isMarkdownFile,
    onDraftError: () =>
      status.hold(
        "Энэ загварын бичвэрийг хадгалж чадсангүй. Файлаар хадгална уу.",
        8000,
        false,
      ),
    isTexFile: app.isTexFile,
    fileName: doc.fileName,
    onLeave: (from) => slots.leave(from),
    onTemplate: (id, from) => templateChanged(app, id, from),
    onExample: () => app.enterMdMode(!app.isTexFile()),
    projectDirty: () => app.projectStore.project()?.unsaved ?? false,
    onCloseProject: () => app.projectLink.close(),
    onCloseFile: (slot) => {
      slots.forget(slot);
      app.collab.forget(fileSlot(slot));
    },
  });
  const nudgeHints = initAppHints({
    editor: els.editor,
    markdownActive: doc.markdownActive,
  });
  app.provide({ mdBar, nudgeHints });

  app.docMode.setTemplate(mdBar.template());
  app.fixers.clean.sync();
  app.texMode.start();
  initTexInput({
    editor: els.editor,
    active: () => app.marks.tex(),
    rectAt: app.backdrop.rangeRectAt,
    project: () =>
      app.projectLink.bound() ? app.projectStore.projectFiles() : null,
    path: () => app.projectLink.path(),
    toolbar: mdBar,
  });
}

export function composeProject(app: App): void {
  const { els, status, doc } = app;
  const projectLink = createProjectWiring({
    store: app.projectStore,
    view: {
      editor: els.editor,
      workspace: els.workspace,
      editorWrap: els.editorWrap,
      measure: app.measureCtl,
      preview: app.previewCtl,
      status,
    },
    mode: {
      doc,
      docStatus: app.docStatus,
      docMode: app.docMode,
      texMode: app.texMode,
      isTex: app.isTexFile,
      enterMdMode: app.enterMdMode,
      render: app.loop.render,
    },
    files: {
      mdBar: app.mdBar,
      fileIO: app.fileIO,
      draft: app.draft,
      undo: () => app.undoCtl,
    },
  });
  app.provide({ projectLink });
  app.layoutChanged.on(() => projectLink.sync());

  const kbLayout = initKeyboardLayout({
    editor: els.editor,
    status: els.status,
  });
  void initImageStore(() => els.editor.value);
  const undoCtl = initUndoHistory({
    editor: els.editor,
    slot: () => {
      const path = projectLink.path();
      return path ? app.mdBar.slot() + "\u0000" + path : app.mdBar.slot();
    },
  });
  app.provide({ kbLayout, undoCtl });
}
