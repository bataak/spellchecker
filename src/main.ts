import { confirmWipe } from "./ui/wipe.ts";
import "./style.css";
import "./editor/gutter.css";
import "./mdbar/md-toolbar.css";
import "./export/export.css";
import "./define/deftip.css";
import "./project/project.css";
import { MultiSpellChecker } from "./spell/spellchecker.ts";
import { createSpellSession } from "./spell/spellsession.ts";
import { createFixFlow } from "./spell/fixflow.ts";
import type { SpellChecker } from "./spell/spellchecker.ts";
import { initFileIO } from "./files/fileio.ts";
import { initImageStore } from "./files/imagestore.ts";
import { initToolbar } from "./ui/toolbar.ts";
import { initKeyboardToolbar } from "./editor/kbtoolbar.ts";
import { initSurvey } from "./feedback/survey.ts";
import { initAppearance } from "./ui/appearance.ts";
import { initMeasureControl } from "./ui/measure.ts";
import type { Layout } from "./ui/layout.ts";
import { initSaveHints } from "./export/savehints.ts";
import { createPreviewMode } from "./ui/previewmode.ts";
import { createDocMode } from "./doc/docmode.ts";
import { createDocumentSession } from "./doc/docsession.ts";
import { initProjectLink } from "./project/projectlink.ts";
import { PROJECT_SLOT } from "./slots/fileslots.ts";
import { createProjectStore } from "./project/projectstore.ts";
import { saveDraftFile } from "./core/storage.ts";
import { initMdToolbar, sharedSlot } from "./mdbar/mdtoolbar.ts";
import { initSlotSwitch } from "./slots/slotswitch.ts";
import { createBackdrop } from "./editor/backdrop.ts";
import { createMarkLayer } from "./editor/marklayer.ts";
import { initMarkTap } from "./editor/marktap.ts";
import { initKeyboardLayout } from "./editor/kblayout.ts";
import { initUndoHistory } from "./editor/undohistory.ts";
import { rotateEmptyTips } from "./ui/emptytips.ts";
import { createOfficeSession } from "./office/session.ts";
import { createDictStatus } from "./dict/dictstatus.ts";
import { initStatus, reveal } from "./ui/status.ts";
import { initEditorText } from "./editor/editortext.ts";
import { initDraftText } from "./editor/drafttext.ts";
import { initAppUpdate } from "./core/appupdate.ts";
import { initShortcuts } from "./ui/shortcuts.ts";
import { createButtonCommands } from "./ui/commands.ts";
import { installErrorLog } from "./core/errorlog.ts";
import { createEditorPort } from "./app/ports.ts";
import { createDocStatus } from "./app/docstatus.ts";
import { createCheckLoop } from "./app/checkloop.ts";
import { bindLineBlocks, createEditorView } from "./app/editorview.ts";
import { initAppHints } from "./app/apphints.ts";
import { warmTex } from "./app/texwarm.ts";
import { createOpenPolicy } from "./app/openpolicy.ts";
import { createSignal } from "./app/signal.ts";
import { createEmptyState } from "./app/emptystate.ts";
import { createTexMode } from "./app/texmode.ts";
import { initAppExport } from "./app/appexport.ts";
import { boot } from "./app/boot.ts";
import { restoreDraftFile } from "./app/draftfile.ts";
import { createPopovers } from "./app/popovers.ts";
import { createFixers } from "./app/fixers.ts";
import { createPreviewPane } from "./app/previewpane.ts";
import { watchTabs } from "./app/tabwatch.ts";
import { initTexInput } from "./app/texinput.ts";
import { initAppReport } from "./app/appreport.ts";
import { initDictionaries } from "./app/dictionaries.ts";
import { nextFrame, queryShell } from "./app/dom.ts";
import { bindArming, bindEditorInput, type Caret } from "./app/editorinput.ts";

installErrorLog();

const projectStore = createProjectStore();
const { onProjectChange, project } = projectStore;

document.body.classList.add("ready");

const els = queryShell();
const { editor: editorEl, workspace, editorWrap } = els;
const { desktopMQ, narrowMQ, touchMQ } = els;
const layoutChanged = createSignal<Layout>();

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
  markup: () => markupSkips,
  isLatex: isLatexText,
  progress: async (message, animate) => {
    status.set(message, animate);
    await nextFrame();
  },
});

const dicts = createDictStatus();
let markupSkips = false;
let lastCaret: Caret | null = null;

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
  setSaveTitles: (output, open) => syncSaveTitles(output, open),
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
    clean.sync();
  },
});

const marks = createMarkLayer({
  editor: editorEl,
  backdrop,
  syncScroll: view.syncScroll,
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

const syncEmptyState = createEmptyState({
  el: els.emptyState,
  textChanged: () => previewMode.textChanged(),
  cleared: () => defTip.clear(),
});

const survey = initSurvey();

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

const syncSaveTitles = initSaveHints();

const { defDock, defTip, pop, errorPanel, suggestPopover } = createPopovers({
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
  lastCaret: () => lastCaret,
  setLastCaret: (caret) => {
    lastCaret = caret;
  },
  dockRoom: (side, active) => measureCtl.dockRoom(side, active),
  render,
  apply: (token, replacement) => fixFlow.apply(token, replacement),
  dropFix: () => fixFlow.drop(),
  attachKeyboard: (input) => kbLayout.attach(input),
});

const fixFlow = createFixFlow({
  editor: editorEl,
  spell,
  setText: (text, caret) => editor.set(text, caret),
  render: () => void render(),
  commit: loop.commit,
  cancel: () => pop.hide(),
});

const hadSelection = bindArming(
  editorEl,
  () => editorText,
  () => fixFlow,
  view.tokenAtCaret,
);

const editorText = initEditorText({
  editor: editorEl,
  onEdit: () => fixFlow.drop(),
  onReplace: () => previewCtl.setSource(null),
  accept: (old, next) => {
    const docx = office.active();
    if (docx && !docx.sync(old, next)) {
      status.hold("Энэ өөрчлөлтийг docx файлд буулгах боломжгүй");
      return false;
    }
    return true;
  },
  onReplaced: () => fixers.sync(),
});

const fixers = createFixers({
  editor,
  invalidate: () => spell.clear(),
  skipClean: () => !docMode.checksLetters() || isTexFile(),
});
const { decode, clean, announceLetters } = fixers;

const draft = initDraftText({
  editor: editorEl,
  onLoaded: () => {
    fixers.sync();
    if (editorEl.value) reveal(editorEl, "glyph-reveal");
  },
  onCaret: (caret) => {
    lastCaret = caret;
  },
  store: () => ({
    slot: mdBar.slot,
    shared: sharedSlot,
    read: mdBar.draft,
    write: mdBar.writeDraft,
    caret: mdBar.caret,
    writeCaret: mdBar.writeCaret,
  }),
});

const markTap = initMarkTap({
  editor: editorEl,
  backdrop,
  tokens: () => marks.tokens(),
  show: (token) => suggestPopover.showFor(token),
});

bindEditorInput({
  editor: editorEl,
  editorText,
  marks,
  fixFlow,
  loop,
  hadSelection,
  hidePopover: () => pop.hide(),
  textChanged: syncEmptyState,
  saveSoon: draft.saveSoon,
  fixers: [decode, clean],
  setLastCaret: (caret) => {
    lastCaret = caret;
  },
  markTap,
  suggest: suggestPopover,
  tokenAtCaret: view.tokenAtCaret,
});

initAppearance();

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
  onFormat: (next) =>
    void editor.reformat(next, Math.min(editorEl.selectionStart, next.length)),
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

const fileIO = initFileIO({
  editor,
  status,
  office: {
    active: officeActive,
    open: office.open,
    close: office.close,
    save: office.save,
  },
  project: {
    save: () => projectLink.save(),
    openZip: (file) => projectLink.openZip(file),
    openDir: (handle) => projectLink.openDir(handle),
    openExisting: (name, text) => projectLink.openExisting(name, text),
  },
  pdf: pdfSave,
  defaultExt: () => (isTexFile() ? "tex" : doc.markdownActive() ? "md" : "txt"),
  onFileOpened: (ref) => {
    projectLink.unbind(true);
    saveDraftFile(ref, mdBar.slot());
    doc.open(ref ? ref.name : null);
    if (ref?.kind === "text")
      queueMicrotask(() => projectLink.fileOpened(ref.name));
  },
  prepareOpen: createOpenPolicy(() => mdBar, status.hold),
  onLoaded: () => {
    undoCtl.reset();
    mdBar.markSaved();
  },
  onSaved: (written) => mdBar.markSaved(written),
});

const slots = initSlotSwitch({
  editor: editorEl,
  files: {
    take: () => fileIO.takeFile(),
    put: (file) => fileIO.putFile(file),
    restore: (ref) => fileIO.restoreFile(ref),
    name: () => fileIO.targetName(),
  },
  office: {
    file: office.file,
    park: office.park,
    open: async (file, text, cancelled) => {
      await office.open(file, text, cancelled);
      return officeActive();
    },
    queue: office.queue,
    settled: office.settled,
  },
  project: () => projectLink,
  draft: (slot) => mdBar.draft(slot),
  setName: doc.setName,
  refreshPreview: () => previewCtl.update(),
  entered: doc.entered,
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
  onTemplate: (id, from) => {
    previewMode.templateChanged();
    docMode.setTemplate(id);
    clean.sync();
    if (from !== mdBar.slot()) slots.enter(mdBar.slot());
    texMode.sync();
    projectLink.sync();
    enterMdMode(doc.markdownActive());
    tabGuard.sync();
  },
  onExample: () => enterMdMode(!isTexFile()),
  projectDirty: () => project()?.unsaved ?? false,
  onCloseProject: () => projectLink.close(),
  onCloseFile: (slot) => slots.forget(slot),
});
const nudgeHints = initAppHints({
  editor: editorEl,
  markdownActive: doc.markdownActive,
});

docMode.setTemplate(mdBar.template());
clean.sync();
texMode.start();
initTexInput({
  editor: editorEl,
  active: () => marks.tex(),
  rectAt: backdrop.rangeRectAt,
});
const projectLink = initProjectLink({
  store: projectStore,
  editor: editorEl,
  workspace,
  tools: () => editorWrap.querySelector<HTMLElement>(".editor-tools"),
  slots: {
    current: () => mdBar.slot(),
    inProject: () => mdBar.template() === PROJECT_SLOT,
    enterProject: () => mdBar.enterProject(),
    close: (id) => mdBar.closeFile(id, true),
    files: () => mdBar.fileSlots(),
  },
  file: {
    name: doc.name,
    handle: () => fileIO.targetHandle(),
    bind: (name) => {
      fileIO.putFile(name ? { handle: null, name } : null);
      saveDraftFile(name ? { name, kind: "text" } : null, mdBar.slot());
      doc.setName(name);
      docStatus.restore();
    },
  },
  texActive: isTexFile,
  onBound: docMode.setProjectBound,
  afterSwitch: () => {
    undoCtl.baseline();
    texMode.sync();
    enterMdMode(doc.markdownActive());
    void render();
    draft.save();
  },
  onProject: (name) => {
    mdBar.setProject(name);
    if (name === null) mdBar.leaveProject();
  },
  onChange: () => {
    texMode.sync();
    previewCtl.update();
  },
  layout: () => measureCtl.refresh(),
  notify: (message) => status.hold(message, 6000, false),
  show: (source) => previewCtl.setSource(source),
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

function enterMdMode(on: boolean): void {
  const markup = on || doc.isMarkdownFile();
  if (markup !== markupSkips) {
    markupSkips = markup;
    void render();
  }
  previewMode.enter(on, isTexFile());
  previewCtl.setMarkdownMode(on);
  exportCtl.syncPrint();
  nudgeHints();
}

const exportCtl = initAppExport({
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

initShortcuts({
  editor: editorEl,
  commands: createButtonCommands(),
  wipe: confirmWipe,
  openDictMenu: () => dictionaries.openMenu(),
  lastCaret: () => lastCaret,
});

desktopMQ.addEventListener("change", () => {
  paneCtl.sync();
  pop.hide();
  errorPanel.render();
});

initToolbar({
  editor,
  status,
  statusEl: els.status,
  office: { active: officeActive, close: office.close },
  forgetFile: () => {
    previewMode.cleared();
    projectLink.cleared();
    fileIO.forgetFile();
  },
  afterClear: (cleared) => {
    mdBar.reset(cleared);
    rotateEmptyTips();
  },
  hasOpenFile: () => doc.fileName() !== null,
  badTokens: () => marks.tokens(),
  lettersFixed: announceLetters,
});
initKeyboardToolbar(editorEl, els.backdrop);

const tabGuard = watchTabs({
  slot: () => mdBar.slot(),
  project: () => project()?.uid ?? null,
  onProjectChange,
  warn: (message) => status.hold(message, 8000, false),
});

initAppReport({
  entryUrl: import.meta.url,
  editor: editorEl,
  checker,
  dicts,
  officeActive,
  markdownActive: doc.markdownActive,
  fileName: doc.fileName,
  layout: () => measureCtl.layout(),
  errorWords: () => marks.tokens().map((token) => token.word),
});

const dictionaries = initDictionaries({
  checker,
  dicts,
  docStatus,
  status,
  appUpdate,
  recheckAll: loop.recheckAll,
  editor: editorEl,
  statusEl: els.status,
  badTokens: () => marks.tokens(),
  render,
});

void boot({
  editor: editorEl,
  backdrop: els.backdrop,
  draft,
  baseline: () => undoCtl.baseline(),
  restoreFile: () =>
    restoreDraftFile({
      slot: () => mdBar.slot(),
      restoreOffice: office.restore,
      restoreText: fileIO.restoreFile,
      targetName: fileIO.targetName,
      opened: doc.open,
    }),
  restoreProject: () => projectLink.restore(),
  fontsLoaded: () => {
    backdrop.reset();
    void render();
  },
  render,
  nudge: nudgeHints,
  appUpdate,
  dictLife: dictionaries.life,
  status: (message) => status.set(message),
});
