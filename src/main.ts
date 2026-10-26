import "./style.css";
import "./editor/gutter.css";
import "./mdbar/md-toolbar.css";
import "./ui/scrollhint.css";
import "./export/export.css";
import "./define/deftip.css";
import "./project/project.css";
import "./collab/collab.css";
import "./spellui/dictmanager.css";
import { MultiSpellChecker } from "./spell/spellchecker.ts";
import { createSpellSession } from "./spell/spellsession.ts";
import type { SpellChecker } from "./spell/spellchecker.ts";
import { initImageStore } from "./files/imagestore.ts";
import { initSurvey } from "./feedback/survey.ts";
import { initAppearance } from "./ui/appearance.ts";
import { initMeasureControl } from "./ui/measure.ts";
import type { Layout } from "./ui/layout.ts";
import { initSaveHints } from "./export/savehints.ts";
import { createPreviewMode } from "./ui/previewmode.ts";
import { createDocMode } from "./doc/docmode.ts";
import { createDocumentSession } from "./doc/docsession.ts";
import { createProjectStore } from "./project/projectstore.ts";
import { initMdToolbar } from "./mdbar/mdtoolbar.ts";
import { createBackdrop } from "./editor/backdrop.ts";
import { createMarkLayer } from "./editor/marklayer.ts";
import { initKeyboardLayout } from "./editor/kblayout.ts";
import { initUndoHistory } from "./editor/undohistory.ts";
import { createEmptyTips } from "./ui/emptytips.ts";
import { createOfficeSession } from "./office/session.ts";
import { createDictStatus } from "./spellui/dictstatus.ts";
import { initStatus } from "./ui/status.ts";
import { initAppUpdate } from "./app/appupdate.ts";
import { installErrorLog } from "./core/errorlog.ts";
import { createEditorPort } from "./app/ports.ts";
import { createDocStatus } from "./app/docstatus.ts";
import { createCheckLoop } from "./app/checkloop.ts";
import { bindLineBlocks, createEditorView } from "./app/editorview.ts";
import { initAppHints } from "./app/apphints.ts";
import { warmTex } from "./app/texwarm.ts";
import { texSpans } from "./tex/texhighlight.ts";
import { createEmitter } from "./core/emitter.ts";
import { createEmptyState } from "./app/emptystate.ts";
import { createTexMode } from "./app/texmode.ts";
import { initAppExport } from "./app/appexport.ts";
import { createPopovers } from "./app/popovers.ts";
import { createEditorWiring } from "./app/editorwiring.ts";
import { bindAppChrome } from "./app/chromewiring.ts";
import { createFileWiring } from "./app/filewiring.ts";
import { createProjectWiring } from "./app/projectwiring.ts";
import { createPreviewPane } from "./app/previewpane.ts";
import { watchTabs } from "./app/tabwatch.ts";
import { initTexInput } from "./app/texinput.ts";
import { startApp } from "./app/startup.ts";
import { nextFrame, queryControls, queryShell } from "./app/dom.ts";
import { createMarkupMode } from "./app/markupmode.ts";
import { createLastCaret } from "./app/lastcaret.ts";
import { createCollabWiring } from "./app/collabwiring.ts";
import { fileSlot } from "./collab/roomslot.ts";

installErrorLog();

const projectStore = createProjectStore();
const { onProjectChange, project } = projectStore;

document.body.classList.add("ready");

const els = queryShell();
const controls = queryControls();
const { editor: editorEl, workspace, editorWrap } = els;
const { desktopMQ, narrowMQ, touchMQ } = els;
const layoutChanged = createEmitter<Layout>();

const backdrop = createBackdrop(els.backdrop);
bindLineBlocks(backdrop, narrowMQ, () => void loop.render());

const view = createEditorView({
  editor: editorEl,
  backdrop,
  marks: () => marks,
  onLine: (line) => docStatus.refreshLine(line),
  onScroll: () => pop.followScroll(),
});

const checker: SpellChecker = new MultiSpellChecker();
const spell = createSpellSession({
  checker,
  markup: () => markupMode.skips(),
  isLatex: isLatexText,
  progress: async (message, animate) => {
    status.set(message, animate);
    await nextFrame();
  },
});

const dicts = createDictStatus();
const lastCaret = createLastCaret();
const markupMode = createMarkupMode({
  isMarkdownFile: () => doc.isMarkdownFile(),
  render: () => loop.render(),
  entered: (on) => {
    previewMode.enter(on, isTexFile());
    previewCtl.setMarkdownMode(on);
    exportCtl.syncPrint();
    nudgeHints();
  },
});
const enterMdMode = (on: boolean): void => markupMode.enter(on);

const status = initStatus(els.status, () => docStatus.restore());

const editor = createEditorPort({
  el: editorEl,
  set: (text, caret) => void editorText.set(text, caret),
  insert: (text, start, end) => editorText.insert(text, start, end),
  render: () => loop.render(),
  save: () => draft.save(),
  hidePopover: () => pop.hide(),
});

const office = createOfficeSession({
  editor,
  status,
  showSource: (source) => previewCtl.setSource(source),
  baseline: () => undoCtl.baseline(),
  syncFixButtons: () => fixers.sync(),
  onModeChange: () => {
    doc.syncSaveHint();
    exportCtl.syncPrint();
  },
});
const officeActive = (): boolean => office.active() !== null;

const doc = createDocumentSession({
  office: office.active,
  targetName: () => fileIO.targetName(),
  template: () => mdBar.template(),
  isTex: isTexFile,
  setSaveTitles: initSaveHints(controls),
  refreshBar: () => mdBar.refresh(),
  enterMode: enterMdMode,
});

const docStatus = createDocStatus({
  status,
  statusEl: els.status,
  editor: editorEl,
  dicts,
  fileName: doc.fileName,
  lineCount: backdrop.lineCount,
  desktop: desktopMQ,
  narrow: narrowMQ,
});

const docMode = createDocMode({
  officeActive,
  fileName: doc.name,
});

function isLatexText(text: string): boolean {
  return docMode.isLatex(text);
}

function isTexFile(): boolean {
  return isLatexText(editorEl.value);
}

const texMode = createTexMode({
  isTex: isTexFile,
  paint: (on) => applyTexPaint(on),
  changed: () => {
    mdBar.refresh();
    enterMdMode(doc.markdownActive());
    previewCtl.update();
    projectLink.sync();
    fixers.clean.sync();
  },
});

const marks = createMarkLayer({
  editor: editorEl,
  backdrop,
  syncScroll: view.syncScroll,
  texHighlighter: texSpans,
});

function applyTexPaint(on: boolean): void {
  if (marks.setTex(on) && on)
    warmTex((html, ms) => status.hold(html, ms, false));
}

const previewMode = createPreviewMode({
  hasText: () => editorEl.value.length > 0,
  setPaneAvailable: (on) => paneCtl.setAvailable(on),
  setBodyMode: (on) => document.body.classList.toggle("preview-mode", on),
  setLayout: (blocked, wanted, tex) => {
    measureCtl.setPreviewBlocked(blocked);
    measureCtl.setPreviewMode(wanted, tex);
  },
});

const emptyTips = createEmptyTips(controls.emptyTips);
const syncEmptyState = createEmptyState({
  el: els.emptyState,
  tips: emptyTips,
  textChanged: () => previewMode.textChanged(),
  cleared: () => defTip.clear(),
});

const survey = initSurvey(editorEl);

const loop = createCheckLoop({
  editor: editorEl,
  spell,
  marks,
  docStatus,
  prepare: (text) => {
    syncEmptyState(text);
    texMode.sync();
    marks.follow();
    previewCtl.update();
  },
  unready: (text) => {
    view.syncScroll();
    errorPanel.clear(text.trim() !== "");
  },
  painted: (text, bad) => {
    view.syncScroll();
    view.captureTop();
    errorPanel.render();
    survey.onErrorCount(bad.length, text.trim() !== "");
  },
  setText: (text, caret) => editorText.set(text, caret),
  hidePopover: () => pop.hide(),
  save: () => draft.save(),
  propagate: () => fixFlow.propagate(),
  syncScroll: view.syncScroll,
});
const render = loop.render;

const popovers = createPopovers({
  editor: editorEl,
  backdrop,
  popover: els.popover,
  workspace,
  editorWrap,
  desktopMQ,
  checker,
  hold: status.hold,
  englishEnabled: dicts.english,
  tokenAtCaret: view.tokenAtCaret,
  syncScroll: view.syncScroll,
  badTokens: () => marks.tokens(),
  lastCaret: lastCaret.get,
  setLastCaret: lastCaret.set,
  dockRoom: (side, active) => measureCtl.dockRoom(side, active),
  render,
  apply: (token, replacement) => fixFlow.apply(token, replacement),
  dropFix: () => fixFlow.drop(),
  attachKeyboard: (input) => kbLayout.attach(input),
});

const { defDock, defTip, pop, errorPanel } = popovers;

const { editorText, fixFlow, fixers, draft } = createEditorWiring({
  view: {
    editor: editorEl,
    port: editor,
    backdrop,
    view,
    marks,
    status,
    fixButtons: controls.fixButtons,
  },
  flow: {
    spell,
    loop,
    office,
    popovers,
    lastCaret,
    skipClean: () => !docMode.checksLetters() || isTexFile(),
    textChanged: syncEmptyState,
    clearSource: () => previewCtl.setSource(null),
    mdBar: () => mdBar,
  },
});

initAppearance(controls.appearance);

const measureCtl = initMeasureControl(editorWrap, editorEl, layoutChanged.emit);
defDock.sync(measureCtl.layout().panel);
layoutChanged.on((l) => defDock.sync(l.panel));
const {
  preview: previewCtl,
  pane: paneCtl,
  pdfSave,
} = createPreviewPane({
  wrap: editorWrap,
  area: editorEl,
  workspace,
  measure: measureCtl,
  layoutChanged,
  sideBySide: () => desktopMQ.matches,
  visibleOffset: view.visibleOffset,
  onFormat: (next, caret = Math.min(editorEl.selectionStart, next.length)) =>
    void editor.reformat(next, caret),
  isLatex: isLatexText,
  projectKey: () => projectLink.key(),
  inProject: () => projectLink.bound(),
  texProject: () => projectLink.texProject(),
  jump: view.revealRange,
  mainFile: () => (projectLink.bound() ? (project()?.main ?? null) : null),
  baseName: doc.baseName,
  mobileTex: () =>
    touchMQ.matches && !desktopMQ.matches && !officeActive() && isTexFile(),
  saveProject: () => projectLink.save(true),
  notify: status.hold,
});

const appUpdate = initAppUpdate((html) => status.hold(html), import.meta.url);

const { saveChain, fileIO, slots } = createFileWiring({
  editor,
  status,
  office,
  doc,
  pdf: pdfSave,
  isTex: isTexFile,
  project: () => projectLink,
  mdBar: () => mdBar,
  undo: () => undoCtl,
  refreshPreview: () => previewCtl.update(),
});

const mdBar = initMdToolbar({
  editor: editorEl,
  mount: document.querySelector<HTMLElement>("header.topbar") ?? undefined,
  isMdFile: doc.isMarkdownFile,
  onDraftError: () =>
    status.hold(
      "Энэ загварын бичвэрийг хадгалж чадсангүй. Файлаар хадгална уу.",
      8000,
      false,
    ),
  isTexFile,
  fileName: doc.fileName,
  onLeave: (from) => slots.leave(from),
  onTemplate: (id, from) => templateChanged(id, from),
  onExample: () => enterMdMode(!isTexFile()),
  projectDirty: () => project()?.unsaved ?? false,
  onCloseProject: () => projectLink.close(),
  onCloseFile: (slot) => {
    slots.forget(slot);
    collab.forget(fileSlot(slot));
  },
});
const nudgeHints = initAppHints({
  editor: editorEl,
  markdownActive: doc.markdownActive,
});

docMode.setTemplate(mdBar.template());
fixers.clean.sync();
texMode.start();
initTexInput({
  editor: editorEl,
  active: () => marks.tex(),
  rectAt: backdrop.rangeRectAt,
  project: () => (projectLink.bound() ? projectStore.projectFiles() : null),
  path: () => projectLink.path(),
  toolbar: mdBar,
});
const projectLink = createProjectWiring({
  store: projectStore,
  view: {
    editor: editorEl,
    workspace,
    editorWrap,
    measure: measureCtl,
    preview: previewCtl,
    status,
  },
  mode: {
    doc,
    docStatus,
    docMode,
    texMode,
    isTex: isTexFile,
    enterMdMode,
    render,
  },
  files: { mdBar, fileIO, draft, undo: () => undoCtl },
});
layoutChanged.on(() => projectLink.sync());
const kbLayout = initKeyboardLayout({ editor: editorEl, status: els.status });
void initImageStore(() => editorEl.value);
const undoCtl = initUndoHistory({
  editor: editorEl,
  slot: () => {
    const path = projectLink.path();
    return path ? mdBar.slot() + "\u0000" + path : mdBar.slot();
  },
});

function templateChanged(id: string, from: string): void {
  previewMode.templateChanged();
  docMode.setTemplate(id);
  fixers.clean.sync();
  if (from !== mdBar.slot()) slots.enter(mdBar.slot());
  texMode.sync();
  projectLink.sync();
  enterMdMode(doc.markdownActive());
  tabGuard.sync();
}

const exportCtl = initAppExport({
  saveChain,
  editor: editorEl,
  templateId: () => mdBar.template(),
  isMarkdownFile: doc.isMarkdownFile,
  isTex: isTexFile,
  baseName: doc.baseName,
  blocked: officeActive,
  project: () => projectLink,
  pdf: () => previewCtl.pdf(),
  saveSource: fileIO.saveSource,
  hold: status.hold,
});
enterMdMode(doc.markdownActive());
editorEl.addEventListener("input", nudgeHints);

desktopMQ.addEventListener("change", () => {
  paneCtl.sync();
  pop.hide();
  errorPanel.render();
});

bindAppChrome({
  view: {
    editor: editorEl,
    port: editor,
    status,
    statusEl: els.status,
    backdropEl: els.backdrop,
  },
  office,
  marks,
  fixers,
  lastCaret,
  hasOpenFile: () => doc.fileName() !== null,
  forgetFile: () => {
    previewMode.cleared();
    projectLink.cleared();
    fileIO.forgetFile();
    if (collab.forget(fileSlot(mdBar.slot())))
      status.hold("Хамтын засвараас гарлаа. Бусдын бичвэр хэвээр үлдэнэ.");
  },
  afterClear: (cleared) => {
    mdBar.reset(cleared);
    emptyTips.rotate();
  },
  openDictMenu: () => dictionaries.openMenu(),
});

const collab = createCollabWiring({
  editor: editorEl,
  view: {
    host: editorWrap,
    caretRect: backdrop.caretRect,
    rangeRects: backdrop.rangeRects,
  },
  mdBar,
  doc,
  store: projectStore,
  project: projectLink,
  isTex: isTexFile,
  officeActive,
  undo: () => undoCtl,
  notify: (message) => status.hold(message, 8000, false),
});

const tabGuard = watchTabs({
  slot: () => mdBar.slot(),
  project: () => project()?.uid ?? null,
  onProjectChange,
  warn: (message) => status.hold(message, 8000, false),
});

const dictionaries = startApp({
  entryUrl: import.meta.url,
  editor: editorEl,
  backdropEl: els.backdrop,
  statusEl: els.status,
  backdrop,
  checker,
  dicts,
  docStatus,
  status,
  appUpdate,
  loop,
  marks,
  draft,
  undo: () => undoCtl,
  mdBar,
  office,
  fileIO,
  doc,
  project: projectLink,
  store: projectStore,
  collab,
  measure: measureCtl,
  nudge: nudgeHints,
});
