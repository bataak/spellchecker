import "./wipe.ts";
import "./style.css";
import "./gutter.css";
import "./md-toolbar.css";
import "./export.css";
import "./deftip.css";
import "./project/project.css";
import { MultiSpellChecker } from "./spell/spellchecker.ts";
import { createSpellSession } from "./spell/spellsession.ts";
import { createFixFlow } from "./spell/fixflow.ts";
import type { SpellChecker } from "./spell/spellchecker.ts";
import { initFileIO } from "./fileio.ts";
import { initImageStore } from "./imagestore.ts";
import { initToolbar } from "./toolbar.ts";
import { initKeyboardToolbar } from "./kbtoolbar.ts";
import { initSuggest } from "./suggest.ts";
import { initSurvey } from "./survey.ts";
import { getIgnored, onIgnoredChange } from "./spell/ignore.ts";
import { initIgnoreList } from "./ignorelist.ts";
import { initAppearance } from "./appearance.ts";
import { initMeasureControl, type MeasureControl } from "./measure.ts";
import { initPreview, type Preview } from "./preview/preview.ts";
import { initPaneToggle, type PaneToggle } from "./panetoggle.ts";
import { initSaveHints } from "./savehints.ts";
import { missingNote, setSaveBusy } from "./savepdf.ts";
import { zipTexText } from "./tex/texzip.ts";
import { createPreviewMode } from "./previewmode.ts";
import { createDocMode } from "./docmode.ts";
import { createDocumentSession } from "./docsession.ts";
import { initProjectLink, type ProjectLink } from "./project/projectlink.ts";
import { PROJECT_SLOT, isFileSlot } from "./fileslots.ts";
import { createProjectStore } from "./project/projectstore.ts";
import { KEYS, write } from "./store.ts";
import { escapeHtml } from "./htmlutil.ts";
import { isDashSuffix } from "./spell/textcheck.ts";
import { saveDraftFile, loadDraftFile } from "./storage.ts";
import { initMdToolbar, sharedSlot } from "./mdtoolbar.ts";
import { initSlotSwitch } from "./slotswitch.ts";
import { initTabGuard, type TabGuard } from "./tabguard.ts";
import { PLAIN } from "./templates.ts";
import { initExport, type ExportControl } from "./export.ts";
import { createBackdrop } from "./backdrop.ts";
import { createMarkLayer } from "./marklayer.ts";
import { initMarkTap } from "./marktap.ts";
import { initTexComplete } from "./tex/texcomplete.ts";
import { initKeyboardLayout } from "./kblayout.ts";
import { initUndoHistory, type UndoControl } from "./undohistory.ts";
import { initTexImageInput, insertPickedImage } from "./tex/teximages.ts";
import { initDefineControls } from "./definecontrols.ts";
import { initSuggestPopover } from "./suggestpopover.ts";
import { rotateEmptyTips, syncEmptyTips } from "./emptytips.ts";
import { initDictMenu } from "./dict/dictmenu.ts";
import { createOfficeSession } from "./office/session.ts";
import { createDictStatus } from "./dict/dictstatus.ts";
import { initStatus, reveal } from "./status.ts";
import { flash } from "./clipboard.ts";
import { initEditorText } from "./editortext.ts";
import { initDraftText } from "./drafttext.ts";
import { initClean, initDecode } from "./decode.ts";
import { initAppUpdate } from "./appupdate.ts";
import { requestDurableStorage } from "./offline.ts";
import { initShortcuts } from "./shortcuts.ts";
import { initDefTip } from "./deftip.ts";
import { initDefDock } from "./defdock.ts";
import { initPopover } from "./popover.ts";
import { initErrorPanel } from "./errorpanel.ts";
import { installErrorLog } from "./errorlog.ts";
import { initReportButton } from "./reportbtn.ts";
import { createEditorPort } from "./ports.ts";
import { createDocStatus } from "./app/docstatus.ts";
import { createDictLife } from "./app/dictlife.ts";
import { createCheckLoop } from "./app/checkloop.ts";
import { createEditorView } from "./app/editorview.ts";
import { initAppHints } from "./app/apphints.ts";
import { warmTex } from "./app/texwarm.ts";
import { createOpenPolicy } from "./app/openpolicy.ts";
import { createPdfSave } from "./app/pdfsave.ts";
import {
  bindArming,
  bindComposition,
  bindEditorInput,
  type Caret,
} from "./app/editorinput.ts";

installErrorLog();

const projectStore = createProjectStore();
const { onProjectChange, project } = projectStore;

let previewCtl: Preview | null = null;
let paneCtl: PaneToggle | null = null;
let projectLink: ProjectLink | null = null;
let measureCtl: MeasureControl | null = null;
let exportCtl: ExportControl | null = null;
let undoCtl: UndoControl | null = null;
let tabGuard: TabGuard | null = null;

document.body.classList.add("ready");

const els = {
  status: document.querySelector("#statusText") as HTMLElement,
  editor: document.querySelector("#editor") as HTMLTextAreaElement,
  backdrop: document.querySelector("#backdrop") as HTMLElement,
  popover: document.querySelector("#popover") as HTMLElement,
  emptyState: document.querySelector<HTMLElement>("#emptyState"),
};
const editorEl = els.editor;

const desktopMQ = window.matchMedia("(min-width: 1024px)");
const narrowMQ = window.matchMedia("(max-width: 700px)");
const touchMQ = window.matchMedia("(pointer: coarse)");
const backdrop = createBackdrop(els.backdrop);
backdrop.setLineBlocks(!narrowMQ.matches);
narrowMQ.addEventListener("change", () => {
  backdrop.setLineBlocks(!narrowMQ.matches);
  backdrop.reset();
  void loop.render();
});

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
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
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
  showSource: (source) => previewCtl?.setSource(source),
  baseline: () => undoCtl?.baseline(),
  syncFixButtons: () => syncFixButtons(),
  onModeChange: () => {
    doc.syncSaveHint();
    exportCtl?.syncPrint();
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
  projectBound: () => projectLink?.bound() ?? false,
  fileName: doc.name,
});

function isLatexText(text: string): boolean {
  return docMode.isLatex(text);
}

function isTexFile(): boolean {
  return isLatexText(editorEl.value);
}

let lastTex: boolean | null = null;
function syncTexMode(): void {
  if (lastTex === null) return;
  const tex = isTexFile();
  if (tex === lastTex) return;
  lastTex = tex;
  applyTexPaint(tex);
  mdBar.refresh();
  enterMdMode(doc.markdownActive());
  previewCtl?.update();
  projectLink?.sync();
  clean.sync();
}

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
  setPaneAvailable: (on) => paneCtl?.setAvailable(on),
  setBodyMode: (on) => document.body.classList.toggle("preview-mode", on),
  setLayout: (blocked, wanted, tex) => {
    measureCtl?.setPreviewBlocked(blocked);
    measureCtl?.setPreviewMode(wanted, tex);
  },
});

function syncEmptyState(text: string): void {
  const empty = text.length === 0;
  previewMode.textChanged();
  if (empty) defTip.clear();
  if (!els.emptyState) return;
  els.emptyState.classList.toggle("is-hidden", !empty);
  els.emptyState.setAttribute("aria-hidden", empty ? "false" : "true");
  const root = document.documentElement;
  if (root.classList.contains("has-text") === empty) {
    root.classList.toggle("has-text", !empty);
    write(KEYS.hasText, empty ? "0" : "1");
  }
  syncEmptyTips(empty);
}

const survey = initSurvey();

const loop = createCheckLoop({
  editor: editorEl,
  spell,
  marks,
  docStatus,
  prepare: (text) => {
    syncEmptyState(text);
    syncTexMode();
    marks.follow();
    previewCtl?.update();
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

const defDock = initDefDock({
  workspace: document.querySelector(".workspace") as HTMLElement,
  editorWrap: editorEl.closest(".editor-wrap") as HTMLElement,
  errorPanel: document.querySelector("#errorPanel") as HTMLElement,
  desktopMQ,
  room: (side, active) => measureCtl?.dockRoom(side, active) ?? false,
});

const defTip = initDefTip({
  editor: editorEl,
  popover: els.popover,
  define: checker.define ? (word) => checker.define!(word) : undefined,
  showPanel: (word) => void pop.showDefPanel(word),
  hidePopover: () => pop.hide(),
  holdStatus: status.hold,
  dock: defDock,
  backdrop,
});

const pop = initPopover({
  editor: editorEl,
  backdrop,
  popover: els.popover,
  defTip,
  syncScroll: view.syncScroll,
});

const errorPanel = initErrorPanel({
  editor: editorEl,
  backdrop,
  desktopMQ,
  badTokens: () => marks.tokens(),
  lastCaret: () => lastCaret,
  setLastCaret: (caret) => {
    lastCaret = caret;
  },
  onPick: () => fixFlow.drop(),
  syncScroll: view.syncScroll,
  showPopoverFor: (token) => void suggestPopover.showFor(token),
});

initDefineControls({
  editor: editorEl,
  backdrop,
  checker,
  defTip,
  defDock,
  pop,
  holdStatus: status.hold,
  englishEnabled: dicts.english,
  errorAtCaret: view.tokenAtCaret,
  showErrorPopover: (token) => void suggestPopover.showFor(token),
});

const suggestPopover = initSuggestPopover({
  editor: editorEl,
  backdrop,
  popover: els.popover,
  pop,
  defTip,
  checker,
  desktopMQ,
  render,
  apply: (token, replacement) => fixFlow.apply(token, replacement),
  attachKeyboard: (input) => kbLayout.attach(input),
  errorAtCaret: view.tokenAtCaret,
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
  onReplace: () => previewCtl?.setSource(null),
  accept: (old, next) => {
    const docx = office.active();
    if (docx && !docx.sync(old, next)) {
      status.hold("Энэ өөрчлөлтийг docx файлд буулгах боломжгүй");
      return false;
    }
    return true;
  },
  onReplaced: () => syncFixButtons(),
});

const fixButtonDeps = { editor, invalidate: () => spell.clear() };
const decode = initDecode(fixButtonDeps);
const STANDARD_LETTERS_MESSAGE = "Зарим үсгийн кодыг стандарт болгов";
const announceLetters = (): void => decode.announce(STANDARD_LETTERS_MESSAGE);
bindComposition(editorEl, announceLetters);
const clean = initClean({
  ...fixButtonDeps,
  skip: () => !docMode.checksLetters() || isTexFile(),
});
function syncFixButtons(): void {
  decode.sync();
  clean.sync();
}

const draft = initDraftText({
  editor: editorEl,
  onLoaded: () => {
    syncFixButtons();
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

const editorWrap = editorEl.closest<HTMLElement>(".editor-wrap");
if (editorWrap) {
  measureCtl = initMeasureControl(editorWrap, editorEl, (l) => {
    defDock.sync(l.panel);
    paneCtl?.sync();
    if (l.preview) previewCtl?.update();
    projectLink?.sync();
  });
  defDock.sync();
  previewCtl = initPreview({
    wrap: editorWrap,
    area: editorEl,
    onFormat: (next) =>
      void editor.reformat(
        next,
        Math.min(editorEl.selectionStart, next.length),
      ),
    isLatex: isLatexText,
    projectKey: () => projectLink?.key() ?? null,
    inProject: () => projectLink?.bound() ?? false,
    texProject: () => projectLink?.texProject() ?? null,
    pdfName: () => pdfSave.name(),
    jump: view.revealRange,
  });
  const workspace = editorWrap.closest<HTMLElement>(".workspace");
  if (workspace)
    paneCtl = initPaneToggle(
      workspace,
      editorEl,
      () => desktopMQ.matches && (measureCtl?.layout().preview ?? false),
      (on) => {
        if (!on) return;
        previewCtl?.update();
        previewCtl?.revealAt(view.visibleOffset());
      },
    );
}

const pdfSave = createPdfSave({
  preview: () => previewCtl,
  mainFile: () => (projectLink?.bound() ? (project()?.main ?? null) : null),
  baseName: doc.baseName,
  mobileTex: () =>
    touchMQ.matches && !desktopMQ.matches && !officeActive() && isTexFile(),
  saveProject: () => projectLink?.save(true),
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
    save: () => projectLink?.save() ?? Promise.resolve(null),
    openZip: async (file) => {
      if (projectLink) await projectLink.openZip(file);
    },
    openDir: async (handle) => {
      if (projectLink) await projectLink.openDir(handle);
    },
    openExisting: (name, text) =>
      projectLink?.openExisting(name, text) ?? false,
  },
  pdf: pdfSave,
  defaultExt: () => (isTexFile() ? "tex" : doc.markdownActive() ? "md" : "txt"),
  onFileOpened: (ref) => {
    projectLink?.unbind(true);
    saveDraftFile(ref, mdBar.slot());
    doc.open(ref ? ref.name : null);
    if (ref?.kind === "text")
      queueMicrotask(() => projectLink?.fileOpened(ref.name));
  },
  prepareOpen: createOpenPolicy(() => mdBar, status.hold),
  onLoaded: () => {
    undoCtl?.reset();
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
  refreshPreview: () => previewCtl?.update(),
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
    syncTexMode();
    projectLink?.sync();
    enterMdMode(doc.markdownActive());
    tabGuard?.sync();
  },
  onExample: () => enterMdMode(!isTexFile()),
  projectDirty: () => project()?.unsaved ?? false,
  onCloseProject: () => projectLink?.close(),
  onCloseFile: (slot) => slots.forget(slot),
});
const nudgeHints = initAppHints({
  editor: editorEl,
  markdownActive: doc.markdownActive,
});

docMode.setTemplate(mdBar.template());
clean.sync();
lastTex = isTexFile();
applyTexPaint(lastTex);
initTexComplete({
  editor: editorEl,
  active: () => marks.tex(),
  rectAt: backdrop.rangeRectAt,
  onImage: () => void insertPickedImage(editorEl),
});
initTexImageInput({ editor: editorEl, active: () => marks.tex() });
const workspaceEl = document.querySelector<HTMLElement>(".workspace");
if (workspaceEl)
  projectLink = initProjectLink({
    store: projectStore,
    editor: editorEl,
    workspace: workspaceEl,
    tools: () =>
      editorWrap?.querySelector<HTMLElement>(".editor-tools") ?? null,
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
    afterSwitch: () => {
      undoCtl?.baseline();
      syncTexMode();
      enterMdMode(doc.markdownActive());
      void render();
      draft.save();
    },
    onProject: (name) => {
      mdBar.setProject(name);
      if (name === null) mdBar.leaveProject();
    },
    onChange: () => {
      syncTexMode();
      previewCtl?.update();
    },
    layout: () => measureCtl?.refresh(),
    notify: (message) => status.hold(message, 6000, false),
    show: (source) => previewCtl?.setSource(source),
  });
const kbLayout = initKeyboardLayout({ editor: editorEl, status: els.status });
void initImageStore(() => editorEl.value);
undoCtl = initUndoHistory({
  editor: editorEl,
  slot: () => {
    const path = projectLink?.path();
    return path ? mdBar.slot() + "\u0000" + path : mdBar.slot();
  },
});
enterMdMode(doc.markdownActive());
editorEl.addEventListener("input", nudgeHints);

function enterMdMode(on: boolean): void {
  const markup = on || doc.isMarkdownFile();
  if (markup !== markupSkips) {
    markupSkips = markup;
    void render();
  }
  previewMode.enter(on, isTexFile());
  previewCtl?.setMarkdownMode(on);
  exportCtl?.syncPrint();
  nudgeHints();
}

exportCtl = initExport({
  editor: editorEl,
  saveButton: document.querySelector<HTMLElement>("#saveBtn"),
  printButton: document.querySelector<HTMLElement>("#printBtn"),
  template: () => {
    if (isTexFile()) return PLAIN;
    const id = mdBar.template();
    if (!isFileSlot(id)) return id;
    return doc.isMarkdownFile() ? "report" : PLAIN;
  },
  baseName: doc.baseName,
  blocked: officeActive,
  isTex: isTexFile,
  texProject: () => projectLink?.texProject() ?? null,
  texZip: async (text, name) => {
    if (projectLink?.bound()) return projectLink.zip();
    const { blob, missing } = await zipTexText(text, name);
    if (missing.length)
      status.hold(missingNote("Архивт ороогүй зураг: ", missing), 8000, false);
    return blob;
  },
  texZipped: () => projectLink?.zipped(),
  texPdf: async () => {
    if (!previewCtl) throw new Error("no preview");
    const { pdf, missing } = await previewCtl.pdf();
    if (missing.length)
      status.hold(missingNote("PDF-д ороогүй зураг: ", missing), 8000, false);
    return pdf;
  },
  texSource: (name) => fileIO.saveSource(name, !!projectLink?.bound()),
  onDone: () => flash("#saveBtn", "Хадгаллаа"),
  onBlocked: () => flash("#saveBtn", "Экспорт хийх боломжгүй"),
  onPrintError: (error) => {
    flash("#printBtn", "Хэвлэж чадсангүй");
    if (error instanceof Error && error.name === "PdfError")
      status.hold(escapeHtml(error.message), 8000, false);
  },
  onBusy: (busy, ext) =>
    setSaveBusy(busy, ext === "zip" ? "Архивлаж байна…" : undefined),
});

async function restoreDraftFile(): Promise<void> {
  const ref = loadDraftFile(mdBar.slot());
  if (!ref) return;
  if (ref.kind === "office" && (await office.restore(ref.name))) {
    doc.open(ref.name);
    return;
  }
  fileIO.restoreFile(ref);
  doc.open(fileIO.targetName());
}

initShortcuts({
  editor: editorEl,
  openDictMenu: () => openDictMenu(),
  lastCaret: () => lastCaret,
});

const dictLife = createDictLife({
  checker,
  dicts,
  docStatus,
  status,
  appUpdate,
  blank: () => editorEl.value.trim() === "",
  recheckAll: loop.recheckAll,
});

async function restoreView(): Promise<void> {
  await draft.load();
  undoCtl?.baseline();
  await restoreDraftFile();
  await projectLink?.restore();
  void render();
  document.documentElement.classList.remove("booting");
  editorEl.focus({ preventScroll: true });
  nudgeHints();
  draft.restoreBootScroll();
  void Promise.resolve(document.fonts?.ready).then(() => {
    draft.restoreBootScroll();
    requestAnimationFrame(() => {
      draft.restoreBootScroll();
      draft.dropBootScroll();
    });
  });
  for (const type of ["pointerdown", "wheel", "keydown", "touchstart"])
    editorEl.addEventListener(type, draft.dropBootScroll, { once: true });
}

async function boot(): Promise<void> {
  void requestDurableStorage();
  if (!import.meta.env.DEV) void appUpdate.recoverStale(true);
  dictLife.watchFatal();
  status.set("Hunspell ачаалж байна…");
  await restoreView();
  await dictLife.start();
}

desktopMQ.addEventListener("change", () => {
  paneCtl?.sync();
  pop.hide();
  errorPanel.render();
});

void boot();

setTimeout(() => {
  document.documentElement.classList.remove("booting");
}, 2000);

initToolbar({
  editor,
  status,
  statusEl: els.status,
  office: { active: officeActive, close: office.close },
  forgetFile: () => {
    previewMode.cleared();
    projectLink?.cleared();
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

initSuggest({
  getBadTokens: () => marks.tokens(),
  isDashSuffix: (token) => isDashSuffix(editorEl.value, token),
  checkKnown: (list) =>
    checker.ready && !checker.dead && checker.loadedIds.includes("mn_MN")
      ? checker.checkWords(list)
      : Promise.resolve(null),
});

initIgnoreList(() => void render());
onIgnoredChange(() => void render());

let guardedProject: string | null = null;
tabGuard = initTabGuard({
  slot: () => mdBar.slot(),
  project: () => project()?.uid ?? null,
  warn: (message) => status.hold(message, 8000, false),
});
onProjectChange(() => {
  const uid = project()?.uid ?? null;
  if (uid === guardedProject) return;
  guardedProject = uid;
  tabGuard?.sync();
});


initReportButton(() => {
  const active = dicts.active();
  return {
    entryUrl: import.meta.url,
    activeDicts: checker.loadedIds.filter((id) => active.includes(id)),
    officeActive: officeActive(),
    markdownActive: doc.markdownActive(),
    fileName: doc.fileName(),
    layout: measureCtl?.layout() ?? null,
    text: editorEl.value,
    errorWords: marks.tokens().map((token) => token.word),
    personalDict: getIgnored(),
    listDicts: () => checker.listDicts?.({ peek: true }) ?? Promise.resolve([]),
  };
});

const openDictMenu = initDictMenu({
  statusEl: els.status,
  getEnabled: dicts.english,
  onApply: dictLife.setEnglish,
  onClose: () => editorEl.focus(),
});

void document.fonts.ready.then(() => {
  backdrop.reset();
  void render();
});

if (import.meta.env.DEV) {
  const assertMetrics = () => {
    const delta = els.backdrop.scrollHeight - editorEl.scrollHeight;
    if (delta !== 0) {
      console.warn("backdrop/editor өндрийн зөрүү:", delta, "px");
    }
  };
  editorEl.addEventListener("input", assertMetrics);
  void document.fonts.ready.then(assertMetrics);
}
