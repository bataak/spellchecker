import "./wipe.ts";
import "./style.css";
import "./gutter.css";
import "./md-toolbar.css";
import "./export.css";
import "./deftip.css";
import "./project/project.css";
import { MultiSpellChecker } from "./spell/spellchecker.ts";
import { createSpellSession, tokenizeAll } from "./spell/spellsession.ts";
import type { SpellChecker } from "./spell/spellchecker.ts";
import { initFileIO } from "./fileio.ts";
import { initImageStore } from "./imagestore.ts";
import { initToolbar } from "./toolbar.ts";
import { initKeyboardToolbar } from "./kbtoolbar.ts";
import { initSuggest } from "./suggest.ts";
import { initSurvey, surveyOnErrorCount } from "./survey.ts";
import { getIgnored, onIgnoredChange } from "./spell/ignore.ts";
import type { Token } from "./spell/textcheck.ts";
import { initIgnoreList } from "./ignorelist.ts";
import { initAppearance } from "./appearance.ts";
import { mountMeasureControl, type MeasureControl } from "./measure.ts";
import { initPreview, type Preview } from "./preview/preview.ts";
import { initPaneToggle, type PaneToggle } from "./panetoggle.ts";
import { initProjectLink, type ProjectLink } from "./project/projectlink.ts";
import { FILE_LIMIT, PROJECT_SLOT, isFileSlot } from "./fileslots.ts";
import { onProjectChange, project } from "./project/projectstore.ts";
import { KEYS, read, write } from "./store.ts";

import { escapeHtml } from "./htmlutil.ts";
import { inRanges, looksLatex, mergeRanges } from "./spell/codeskip.ts";
import {
  isDashSuffix,
  buildErrorList,
  dashNormalizeApply,
} from "./spell/textcheck.ts";
import { saveDraftFile, loadDraftFile } from "./storage.ts";
import { initMdToolbar, sharedSlot } from "./mdtoolbar.ts";
import { initSlotSwitch } from "./slotswitch.ts";
import { initTabGuard, type TabGuard } from "./tabguard.ts";
import {
  defineHint,
  exportHint,
  initHints,
  keyboardHint,
  layoutHint,
  modeHint,
  openHint,
  spellDictHint,
} from "./hint.ts";
import { isPlain, PLAIN } from "./templates.ts";
import { deliverFile, initExport, type ExportControl } from "./export.ts";
import { stripExt } from "./exportformats.ts";
import {
  initBackdrop,
  renderBackdrop,
  backdropText,
  setHighlighter,
  refreshBackdropMarks,
  captureTopAnchor,
  anchoredScrollTop,
  setActiveLine,
  setLineBlocks,
  backdropLineCount,
  marksAtY,
  rangeRectAt,
} from "./backdrop.ts";
import { shiftTokens } from "./tokenshift.ts";
import { texSpans } from "./tex/texhighlight.ts";
import { initTexComplete } from "./tex/texcomplete.ts";
import { caretPoint, initKeyboardLayout } from "./kblayout.ts";
import { initUndoHistory, type UndoControl } from "./undohistory.ts";
import { initTexImageInput, insertPickedImage } from "./tex/teximages.ts";
import { minimalDiff } from "./mdedit.ts";
import { initDefineControls } from "./definecontrols.ts";
import { initSuggestPopover } from "./suggestpopover.ts";
import { rotateEmptyTips, syncEmptyTips } from "./emptytips.ts";
import {
  initDictMenu,
  loadEnabledEnglish,
  activeIds,
  visibleIds,
} from "./dict/dictmenu.ts";
import { casePattern } from "./spell/caseform.ts";
import type { CasePattern } from "./spell/caseform.ts";
import { createOfficeSession } from "./office/session.ts";
import {
  caretLine,
  NO_STATS,
  statsBody,
  statsMessage,
  type DocStats,
  type LinePosition,
} from "./statusline.ts";
import { initStatus, reveal } from "./status.ts";
import { isBulkDelete, isSeparatorInput, isTouch } from "./input.ts";
import { copyText, flash } from "./clipboard.ts";
import {
  periodSplitDot,
  replaceAllWord,
  splitEveryOccurrence,
  wordAtCaret,
} from "./spell/wordfix.ts";
import {
  composeDropped,
  composeTypedWord,
  initEditorText,
  pasteComposed,
  swapOrigin,
} from "./editortext.ts";
import { initDraftText } from "./drafttext.ts";
import { initClean, initDecode } from "./decode.ts";
import { initAppUpdate } from "./appupdate.ts";
import {
  dictStatusMessage,
  isOfflineReady,
  offlineCapable,
  requestDurableStorage,
} from "./offline.ts";
import { initShortcuts } from "./shortcuts.ts";
import { initDefTip } from "./deftip.ts";
import { initDefDock } from "./defdock.ts";
import { initPopover } from "./popover.ts";
import { initErrorPanel } from "./errorpanel.ts";
import { installErrorLog } from "./errorlog.ts";
import { initReportButton } from "./reportbtn.ts";

installErrorLog();

let previewCtl: Preview | null = null;
let paneCtl: PaneToggle | null = null;
let projectLink: ProjectLink | null = null;

document.body.classList.add("ready");

const els = {
  status: document.querySelector("#statusText") as HTMLElement,
  editor: document.querySelector("#editor") as HTMLTextAreaElement,
  backdrop: document.querySelector("#backdrop") as HTMLElement,
  popover: document.querySelector("#popover") as HTMLElement,
  emptyState: document.querySelector<HTMLElement>("#emptyState"),
};

const desktopMQ = window.matchMedia("(min-width: 1024px)");
const narrowMQ = window.matchMedia("(max-width: 700px)");
const touchMQ = window.matchMedia("(pointer: coarse)");
setLineBlocks(!narrowMQ.matches);
initBackdrop(els.backdrop);
narrowMQ.addEventListener("change", () => {
  setLineBlocks(!narrowMQ.matches);
  initBackdrop(els.backdrop);
  render();
});
let activeLineQueued = false;
function syncActiveLineSoon(): void {
  if (activeLineQueued) return;
  activeLineQueued = true;
  requestAnimationFrame(() => {
    activeLineQueued = false;
    syncActiveLine();
  });
}
els.editor.addEventListener("click", syncActiveLineSoon);
els.editor.addEventListener("keyup", syncActiveLineSoon);
document.addEventListener("selectionchange", () => {
  if (document.activeElement === els.editor) syncActiveLineSoon();
});

const checker: SpellChecker = new MultiSpellChecker();
const spell = createSpellSession({
  checker,
  markup: () => markupSkips,
  isLatex: isLatexText,
  progress: async (message, animate) => {
    setStatus(message, animate);
    await nextFrame();
  },
});
interface PendingFix {
  original: string;
  originalPattern: CasePattern;
  dashSuffix: boolean;
  start: number;
}

let ready = false;
let badTokens: Token[] = [];
let baseStatus = "";
let offlineIndicatorActive = false;
let lastDictRefresh = 0;
let pendingFix: PendingFix | null = null;
let enabledEnglish = loadEnabledEnglish();
let lastFailed: { id: string; error: string }[] | null = null;
let lastFallbackReason: string | null = null;
let undoCtl: UndoControl | null = null;
let tabGuard: TabGuard | null = null;
let plainName: string | null = null;
let markupSkips = false;
let lastCaret: { start: number; end: number } | null = null;

const status = initStatus(els.status, () => restoreStatus());
const setStatus = status.set;
const holdStatus = status.hold;
const releaseStatusHold = status.release;

const office = createOfficeSession({
  editor: els.editor,
  setStatus,
  holdStatus,
  releaseStatusHold,
  setEditorText: (text, caret) => setEditorText(text, caret),
  hidePopover: () => hidePopover(),
  render: () => render(),
  saveText: () => saveText(),
  showSource: (source) => previewCtl?.setSource(source),
  baseline: () => undoCtl?.baseline(),
  syncFixButtons: () => syncFixButtons(),
  onModeChange: () => {
    syncSaveHint();
    exportCtl?.syncPrint();
  },
});

function restoreStatus(): void {
  if (!ready) return;
  if (els.editor.value.trim() === "" && !openFileName()) {
    if (baseStatus && !offlineIndicatorActive) setStatus(baseStatus);
    return;
  }
  setStatus(currentStatus(), false);
}
function afterPaint(): Promise<void> {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0)),
  );
}
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), ms);
  };
}

const TEX_NAME_RE = /\.(tex|ltx)$/i;

function isLatexText(text: string): boolean {
  if (office.active()) return false;
  if (inProject || projectLink?.bound()) return true;
  if (plainName) return TEX_NAME_RE.test(plainName);
  return texTemplate || looksLatex(text);
}

const TEX_TEMPLATE = "article";
let texTemplate = false;
let inProject = false;
const CHECK_TEMPLATES: ReadonlySet<string> = new Set([PLAIN, "plain2"]);
let checkTemplate = false;

function isTexFile(): boolean {
  return isLatexText(els.editor.value);
}

let lastTex: boolean | null = null;
function syncTexMode(): void {
  if (lastTex === null) return;
  const tex = isTexFile();
  if (tex === lastTex) return;
  lastTex = tex;
  applyTexPaint(tex);
  mdBar.refresh();
  enterMdMode(mdActive());
  previewCtl?.update();
  projectLink?.sync();
  clean.sync();
}

let texPaint = false;
function applyTexPaint(on: boolean): void {
  if (on === texPaint) return;
  texPaint = on;
  setHighlighter(on ? texSpans : null);
  if (on) {
    void import("./tex/texpdf.ts").then(async (mod) => {
      const ready = await mod.prefetchFonts();
      if (!ready || !navigator.serviceWorker?.controller) return;
      if (read(mod.OFFLINE_KEY) || !write(mod.OFFLINE_KEY, "1")) return;
      holdStatus("LaTeX файлтай офлайн ажиллахад бэлэн боллоо", 6000, false);
    });
    void import("./preview/pdfview.ts").then((mod) => mod.warmPdf());
    void import("./tex/teximages.ts");
    void import("./tex/latex.ts");
  }
  els.editor.parentElement?.classList.toggle("is-tex", on);
  const text = els.editor.value;
  if (text !== backdropText()) badTokens = [];
  renderBackdrop(text, badTokens);
  syncScroll();
}

function syncBackdrop(): void {
  if (!texPaint) return;
  const text = els.editor.value;
  const patch = minimalDiff(backdropText(), text);
  if (!patch) return;
  badTokens = shiftTokens(badTokens, {
    start: patch.from,
    oldEnd: patch.to,
    newEnd: patch.from + patch.insert.length,
  });
  renderBackdrop(text, badTokens);
  syncScroll();
}

function mdActive(): boolean {
  if (isTexFile()) return false;
  return openFileName() ? isMdFileOpen() : !isPlain(mdBar.template());
}

let previewWanted = false;
let clearedEmpty = false;

function syncPreviewClass(): void {
  document.body.classList.toggle(
    "preview-mode",
    previewWanted && !clearedEmpty,
  );
}

function syncPane(): void {
  paneCtl?.setAvailable(previewWanted && els.editor.value.length > 0);
}

function syncEmptyState(text: string): void {
  const empty = text.length === 0;
  syncPane();
  if (!empty && clearedEmpty) {
    clearedEmpty = false;
    syncPreviewClass();
  }
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

let renderSeq = 0;
async function render() {
  const text = els.editor.value;
  const seq = ++renderSeq;

  syncEmptyState(text);
  syncTexMode();
  syncBackdrop();
  previewCtl?.update();

  if (!ready) {
    badTokens = [];
    renderBackdrop(text, []);
    syncScroll();
    errorPanel.clear(text.trim() !== "");
    return;
  }

  const tokens = tokenizeAll(text);
  await spell.ensureChecked(text, tokens);
  if (seq !== renderSeq) return;
  const { bad, total } = spell.computeBad(text, tokens);
  badTokens = bad;

  renderBackdrop(text, bad);
  syncBackdrop();
  syncScroll();
  captureTopAnchor();
  errorPanel.render();
  surveyOnErrorCount(bad.length, text.trim() !== "");

  if (ready) {
    if (text.trim() === "" && !openFileName()) {
      if (baseStatus && !offlineIndicatorActive) setStatus(baseStatus);
    } else {
      stats = { words: total, bad: bad.length, chars: text.length };
      setStatus(currentStatus(), false);
    }
  }
}

let stats: DocStats = NO_STATS;

function linePosition(knownLine?: number): LinePosition | null {
  const value = els.editor.value;
  if (!narrowMQ.matches || value === "") return null;
  const line =
    (knownLine ?? caretLine(value, els.editor.selectionStart ?? 0)) + 1;
  return { line, total: backdropLineCount() + (value.endsWith("\n") ? 1 : 0) };
}

function currentStatus(knownLine?: number): string {
  return statsMessage(
    openFileName(),
    statsBody(stats, desktopMQ.matches, linePosition(knownLine)),
  );
}

let saveTitleBase: string | null = null;
let clearTitleBase: string | null = null;
const CLEAR_TITLE = "Талбарыг цэвэрлэх";
const CLOSE_CLEAR_TITLE = "Файлыг хааж, талбарыг цэвэрлэх";

function syncClearHint(open: boolean): void {
  const btn = document.querySelector<HTMLElement>("#clearBtn");
  if (!btn) return;
  if (clearTitleBase === null) clearTitleBase = btn.title;
  btn.title =
    open && clearTitleBase.startsWith(CLEAR_TITLE)
      ? CLOSE_CLEAR_TITLE + clearTitleBase.slice(CLEAR_TITLE.length)
      : clearTitleBase;
}

function syncSaveHint(): void {
  const btn = document.querySelector<HTMLElement>("#saveBtn");
  if (!btn) return;

  if (saveTitleBase === null) saveTitleBase = btn.title;

  const combo = saveTitleBase.includes(" · ")
    ? saveTitleBase.slice(saveTitleBase.lastIndexOf(" · "))
    : "";

  const target = fileIO.targetName();
  const docx = office.active();
  syncClearHint(!!(docx || target || plainName));

  btn.title = docx
    ? docx.outputName() + " болгож хадгална" + combo
    : target
      ? target + " болгож хадгална" + combo
      : saveTitleBase;
}

function openFileName(): string | null {
  return office.active()?.fileName() ?? plainName;
}

function refreshLineInfo(knownLine?: number): void {
  if (!ready || !narrowMQ.matches) return;
  if (!els.status.innerHTML.includes("Үгийн тоо:")) return;
  setStatus(currentStatus(knownLine), false);
}

function revealRange(start: number, end: number): void {
  const editor = els.editor;
  editor.focus({ preventScroll: true });
  try {
    editor.setSelectionRange(start, end, "forward");
  } catch (_) {}
  const box = editor.getBoundingClientRect();
  const rect = rangeRectAt(start, Math.max(end, start + 1));
  const pad = 24;
  const lines = (text: string): number => text.split("\n").length;
  const top = rect
    ? rect.top - box.top + editor.scrollTop
    : ((lines(editor.value.slice(0, start)) - 1) / lines(editor.value)) *
      editor.scrollHeight;
  const view = editor.scrollTop;
  if (top < view + pad || top > view + editor.clientHeight - pad) {
    const max = editor.scrollHeight - editor.clientHeight;
    editor.scrollTop = Math.max(
      0,
      Math.min(top - Math.min(editor.clientHeight * 0.3, 160), max),
    );
  }
  syncScroll();
}

function syncScroll() {
  els.backdrop.scrollTop = els.editor.scrollTop;
  els.backdrop.scrollLeft = els.editor.scrollLeft;
}

function syncActiveLine() {
  const line = caretLine(els.editor.value, els.editor.selectionStart ?? 0);
  setActiveLine(line);
  refreshLineInfo(line);
}

function tokenAtCaret() {
  const pos = els.editor.selectionStart;
  for (const token of badTokens) {
    if (pos >= token.start && pos <= token.end) return token;
  }
  return null;
}

const defDock = initDefDock({
  workspace: document.querySelector(".workspace") as HTMLElement,
  editorWrap: els.editor.closest(".editor-wrap") as HTMLElement,
  errorPanel: document.querySelector("#errorPanel") as HTMLElement,
  desktopMQ,
  room: (side, active) => measureCtl?.dockRoom(side, active) ?? false,
});

const defTip = initDefTip({
  editor: els.editor,
  popover: els.popover,
  define: checker.define ? (word) => checker.define!(word) : undefined,
  showPanel: (word) => void pop.showDefPanel(word),
  hidePopover: () => pop.hide(),
  holdStatus,
  dock: defDock,
});

const pop = initPopover({
  editor: els.editor,
  backdrop: els.backdrop,
  popover: els.popover,
  defTip,
  syncScroll,
});
const hidePopover = pop.hide;

const errorPanel = initErrorPanel({
  editor: els.editor,
  backdrop: els.backdrop,
  desktopMQ,
  badTokens: () => badTokens,
  lastCaret: () => lastCaret,
  setLastCaret: (caret) => {
    lastCaret = caret;
  },
  onPick: () => {
    pendingFix = null;
  },
  syncScroll,
  showPopoverFor: (token) => void showPopoverFor(token),
});

initDefineControls({
  editor: els.editor,
  backdrop: els.backdrop,
  checker,
  defTip,
  defDock,
  pop,
  holdStatus,
  englishEnabled: () => enabledEnglish,
  errorAtCaret: tokenAtCaret,
  showErrorPopover: (token) => void suggestPopover.showFor(token),
});

const suggestPopover = initSuggestPopover({
  editor: els.editor,
  backdrop: els.backdrop,
  popover: els.popover,
  pop,
  defTip,
  checker,
  desktopMQ,
  render: () => render(),
  apply: (token, replacement) => applySuggestion(token, replacement),
  attachKeyboard: (input) => kbLayout.attach(input),
  errorAtCaret: tokenAtCaret,
});
const showPopoverFor = suggestPopover.showFor;

async function maybePropagateManual() {
  if (!pendingFix) return;
  if (pendingFix.dashSuffix) {
    pendingFix = null;
    return;
  }
  const text = els.editor.value;
  const pos = els.editor.selectionStart;
  let manualFixToken = null;
  if (pos > 0 && /[\s\p{P}\p{S}]/u.test(text.charAt(pos - 1))) {
    const prev = wordAtCaret(text, pos - 1);
    if (prev && prev.end === pos - 1) manualFixToken = prev;
  }
  if (!manualFixToken) manualFixToken = wordAtCaret(text, pos);
  if (!manualFixToken) return;
  if (manualFixToken.start !== pendingFix.start) {
    pendingFix = null;
    return;
  }
  const fix = pendingFix;
  const lower = manualFixToken.word.toLowerCase();
  if (lower === fix.original) return;
  if (fix.original.length - manualFixToken.word.length > 2) return;
  if (!(await spell.correctNow(manualFixToken.word))) return;
  if (pendingFix !== fix || els.editor.value !== text) return;
  const original = fix.original;
  const primaryPattern = fix.originalPattern || "lower";
  pendingFix = null;
  const { text: nt, caret } = replaceAllWord(
    text,
    original,
    manualFixToken.word,
    pos,
    primaryPattern,
    null,
    mergeRanges([...spell.skipFor(text), ...spell.plainFences(text, original)]),
  );
  if (nt === text) return;
  const top = els.editor.scrollTop;
  setEditorText(nt, caret);
  els.editor.scrollTop = top;
  render();
}

async function recheck() {
  await render();
  await maybePropagateManual();
  saveText();
}

async function commitReplacement(text: string, caret: number): Promise<void> {
  hidePopover();
  const top = els.editor.scrollTop;
  const edit = setEditorText(text, caret);
  els.editor.scrollTop = top;
  if (edit) {
    if (!texPaint) {
      badTokens = shiftTokens(badTokens, edit);
      renderBackdrop(text, badTokens);
    }
    syncScroll();
    await afterPaint();
  }
  await render();
  saveText();
}

async function applySuggestion(
  token: Token,
  replacement: string,
): Promise<void> {
  pendingFix = null;
  const editorText = els.editor.value;
  const fences = spell.plainFences(editorText, token.word);
  const skip = mergeRanges([...spell.skipFor(editorText), ...fences]);

  const dashFix = dashNormalizeApply(editorText, token, replacement, skip);
  if (dashFix) {
    await commitReplacement(dashFix.text, dashFix.caret);
    return;
  }

  const dot = periodSplitDot(token.word, replacement);
  if (dot >= 0) {
    const split = splitEveryOccurrence(
      editorText,
      token.word,
      dot,
      token.start,
      skip,
    );
    if (split) {
      await commitReplacement(split.text, split.caret);
      return;
    }
  }

  const inFence = inRanges(fences, token.start);
  const onlyAt =
    inFence || isDashSuffix(editorText, token) ? token.start : null;
  const { text: nt, caret } = replaceAllWord(
    editorText,
    token.word.toLowerCase(),
    replacement,
    token.end,
    casePattern(token.word),
    onlyAt,
    inFence ? spell.skipFor(editorText) : skip,
  );
  if (nt === editorText) {
    hidePopover();
    return;
  }
  await commitReplacement(nt, caret);
}

const deferredCheck = debounce(() => recheck(), 1500);

const LARGE_TEXT = 50_000;
const LARGE_SETTLE_MS = 250;
const settleLarge = debounce(() => {
  void render();
  saveText();
}, LARGE_SETTLE_MS);

async function recheckAfterSeparator(): Promise<void> {
  if (els.editor.value.length <= LARGE_TEXT) return recheck();
  await maybePropagateManual();
  settleLarge();
}

let hadSelection = false;
els.editor.addEventListener("beforeinput", () => {
  hadSelection = els.editor.selectionStart !== els.editor.selectionEnd;
  if (editorText.programmatic()) return;
  const caretToken = tokenAtCaret();
  pendingFix = caretToken
    ? {
        original: caretToken.word.toLowerCase(),
        originalPattern: casePattern(caretToken.word),
        dashSuffix: isDashSuffix(els.editor.value, caretToken),
        start: caretToken.start,
      }
    : null;
});

const editorText = initEditorText({
  editor: els.editor,
  onEdit: () => {
    pendingFix = null;
  },
  onReplace: () => previewCtl?.setSource(null),
  accept: (old, next) => {
    const docx = office.active();
    if (docx && !docx.sync(old, next)) {
      holdStatus("Энэ өөрчлөлтийг docx файлд буулгах боломжгүй");
      return false;
    }
    return true;
  },
  onReplaced: () => syncFixButtons(),
});
const setEditorText = editorText.set;
const insertEditorText = editorText.insert;

const fixButtonDeps = {
  editor: els.editor,
  setEditorText,
  refresh: () => {
    spell.clear();
    return render();
  },
  saveText: () => saveText(),
};
const decode = initDecode(fixButtonDeps);
const STANDARD_LETTERS_MESSAGE = "Зарим үсгийн кодыг стандарт болгов";
els.editor.addEventListener("paste", (event) => {
  if (pasteComposed(els.editor, event))
    decode.announce(STANDARD_LETTERS_MESSAGE);
});
els.editor.addEventListener("input", (event) => {
  if (!(event instanceof InputEvent)) return;
  if (composeDropped(els.editor, event) || composeTypedWord(els.editor, event))
    decode.announce(STANDARD_LETTERS_MESSAGE);
});
const clean = initClean({
  ...fixButtonDeps,
  skip: () => !checkTemplate || isTexFile(),
});
function syncFixButtons(): void {
  decode.sync();
  clean.sync();
}

const draft = initDraftText({
  editor: els.editor,
  onLoaded: () => {
    syncFixButtons();
    if (els.editor.value) reveal(els.editor, "glyph-reveal");
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
const saveText = draft.save;

els.editor.addEventListener("input", (e) => {
  const swapped = swapOrigin(e) !== null;
  if (swapped) {
    badTokens = [];
    renderBackdrop(els.editor.value, []);
  }
  syncBackdrop();
  if (editorText.programmatic()) return;
  if (!(e instanceof InputEvent)) return;
  hidePopover();
  syncEmptyState(els.editor.value);
  draft.saveSoon();
  if (isSeparatorInput(e)) void recheckAfterSeparator();
  else {
    if (
      swapped ||
      hadSelection ||
      els.editor.value.length === 0 ||
      isBulkDelete(e)
    )
      render();
    deferredCheck();
  }
  decode.afterInput(e);
  clean.afterInput(e);
});

els.editor.addEventListener("blur", () => {
  pendingFix = null;
  lastCaret = {
    start: els.editor.selectionStart,
    end: els.editor.selectionEnd,
  };
});
const MARKS_SETTLE_MS = 100;
const refreshMarksSoon = debounce(
  () => refreshBackdropMarks(),
  MARKS_SETTLE_MS,
);
els.editor.addEventListener("scroll", () => {
  syncScroll();
  captureTopAnchor();
  pop.followScroll();
  refreshMarksSoon();
});
new ResizeObserver(() => {
  syncScroll();
  const top = anchoredScrollTop();
  if (top !== null && Math.abs(top - els.editor.scrollTop) >= 1) {
    els.editor.scrollTop = top;
    syncScroll();
  }
  refreshMarksSoon();
}).observe(els.editor);
els.editor.addEventListener("click", () => {
  pendingFix = null;
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  suggestPopover.atCaret();
});
els.editor.addEventListener("keyup", (e) => {
  const nav = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
  ];
  if (nav.indexOf(e.key) !== -1) {
    pendingFix = null;
  }
});

let suppressNextClick = false;

function markAtPoint(x: number, y: number): HTMLElement | null {
  for (const mark of marksAtY(y)) {
    const rects = mark.getClientRects();
    for (const rect of rects) {
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      )
        return mark;
    }
  }
  return null;
}
function tokenForMark(mark: HTMLElement): Token | null {
  const start = Number(mark.getAttribute("data-start"));
  for (const token of badTokens) if (token.start === start) return token;
  return null;
}
els.editor.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  suppressNextClick = false;
  const mark = markAtPoint(e.clientX, e.clientY);
  if (!mark) return;
  const markToken = tokenForMark(mark);
  if (!markToken) return;
  e.preventDefault();
  suppressNextClick = true;
  showPopoverFor(markToken);
});

els.editor.addEventListener("contextmenu", (e) => {
  const caretToken = tokenAtCaret();
  if (caretToken) {
    e.preventDefault();
    showPopoverFor(caretToken);
  }
});

initAppearance();

const editorWrap = els.editor.closest<HTMLElement>(".editor-wrap");
let measureCtl: MeasureControl | null = null;
if (editorWrap) {
  measureCtl = mountMeasureControl(editorWrap, els.editor, (l) => {
    defDock.sync(l.panel);
    if (l.preview) previewCtl?.update();
    projectLink?.sync();
  });
  defDock.sync();
  previewCtl = initPreview({
    wrap: editorWrap,
    area: els.editor,
    onFormat: (next) => {
      const caret = Math.min(els.editor.selectionStart, next.length);
      const scrollTop = els.editor.scrollTop;
      const scrollLeft = els.editor.scrollLeft;
      const restoreView = (): void => {
        els.editor.scrollTop = scrollTop;
        els.editor.scrollLeft = scrollLeft;
      };
      setEditorText(next, caret);
      restoreView();
      void Promise.resolve(render()).then(restoreView);
      saveText();
    },
    isLatex: isLatexText,
    projectKey: () => projectLink?.key() ?? null,
    inProject: () => projectLink?.bound() ?? false,
    pdfName,
    jump: revealRange,
  });
  const workspace = editorWrap.closest<HTMLElement>(".workspace");
  if (workspace)
    paneCtl = initPaneToggle(workspace, els.editor, desktopMQ, (on) => {
      if (on) previewCtl?.update();
    });
}

function pdfName(): string {
  const main = projectLink?.bound() ? project()?.main : null;
  const name = main?.split("/").pop() ?? fileIO.targetName() ?? plainName;
  return stripExt(name || "бичвэр") + ".pdf";
}

const appUpdate = initAppUpdate((html) => holdStatus(html), import.meta.url);

const fileIO = initFileIO({
  els,
  openDocxFile: office.open,
  closeDocx: office.close,
  isDocxActive: () => office.active() !== null,
  docxSave: office.save,
  flash,
  setStatus,
  setEditorText,
  hidePopover,
  render,
  saveText,
  defaultExt: () => (isTexFile() ? "tex" : mdActive() ? "md" : "txt"),
  onFileOpened: (ref) => {
    projectLink?.unbind(true);
    plainName = ref ? ref.name : null;
    saveDraftFile(ref, mdBar.slot());
    syncSaveHint();
    mdBar.refresh();
    enterMdMode(mdActive());
    if (ref?.kind === "text")
      queueMicrotask(() => projectLink?.fileOpened(ref.name));
  },
  saveProject: () => projectLink?.save() ?? Promise.resolve(null),
  savesPdf,
  savePdf,
  openProjectZip: async (file) => {
    if (projectLink) await projectLink.openZip(file);
  },
  openProjectDir: async (handle) => {
    if (projectLink) await projectLink.openDir(handle);
  },
  openInProject: (name, text) =>
    projectLink?.openExisting(name, text) ?? false,
  prepareOpen: (name, hash, text) => {
    const open = mdBar.findFile(name, hash, text);
    if (open !== null) {
      mdBar.showFile(open);
      const reload =
        text !== null &&
        mdBar.fileDirty(open) &&
        window.confirm(
          "«" +
            name +
            "» нээлттэй бөгөөд хадгалаагүй өөрчлөлттэй. Файлаас дахин нээх үү?",
        );
      return reload ? "reload" : "open";
    }
    if (mdBar.openFile(name, hash)) return "new";
    holdStatus(
      "Нэг дор " +
        FILE_LIMIT +
        " хүртэл файл нээнэ — шинэ файл нээхийн тулд ядаж нэг хуучин файлыг хаана уу",
      8000,
      false,
    );
    flash("#openBtn", "Хязгаар");
    return false;
  },
  onLoaded: () => {
    undoCtl?.reset();
    mdBar.markSaved();
  },
  onSaved: (written) => mdBar.markSaved(written),
});

const MD_NAME_RE = /\.(md|markdown|mdown)$/i;

const slots = initSlotSwitch({
  editor: els.editor,
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
      return office.active() !== null;
    },
    queue: office.queue,
    settled: office.settled,
  },
  project: () => projectLink,
  draft: (slot) => mdBar.draft(slot),
  setName: (name) => {
    plainName = name;
    syncSaveHint();
    mdBar.refresh();
  },
  refreshPreview: () => previewCtl?.update(),
  entered: () => {
    syncSaveHint();
    mdBar.refresh();
    enterMdMode(mdActive());
  },
});

const mdBar = initMdToolbar({
  editor: els.editor,
  mount: document.querySelector<HTMLElement>("header.topbar") ?? undefined,
  isMdFile: isMdFileOpen,
  onDraftError: () =>
    holdStatus(
      "Энэ загварын бичвэрийг хадгалж чадсангүй. Файлаар хадгална уу.",
      8000,
      false,
    ),
  isTexFile,
  fileName: openFileName,
  onLeave: (from) => slots.leave(from),
  onTemplate: (id, from) => {
    clearedEmpty = false;
    texTemplate = id === TEX_TEMPLATE;
    inProject = id === PROJECT_SLOT;
    checkTemplate = CHECK_TEMPLATES.has(id);
    clean.sync();
    if (from !== mdBar.slot()) slots.enter(mdBar.slot());
    syncTexMode();
    projectLink?.sync();
    enterMdMode(mdActive());
    tabGuard?.sync();
  },
  onExample: () => enterMdMode(!isTexFile()),
  projectDirty: () => project()?.unsaved ?? false,
  onCloseProject: () => projectLink?.close(),
  onCloseFile: (slot) => slots.forget(slot),
});
const find = (sel: string) => (): HTMLElement | null =>
  document.querySelector<HTMLElement>(sel);
const nudgeHints = initHints(() => {
  if (document.documentElement.classList.contains("booting")) return [];
  const layout = layoutHint(find(".measure-btn.is-shown"));
  const keyboard = keyboardHint(
    () =>
      document.activeElement !== els.editor ||
      document.querySelector(".layout-chip:not([hidden])")
        ? null
        : els.editor,
    () => {
      const caret = caretPoint(els.editor);
      const box = els.editor.getBoundingClientRect();
      if (caret.y < box.top || caret.y + caret.height > box.bottom) return null;
      return new DOMRect(caret.x, caret.y, 0, caret.height);
    },
  );
  const mode = modeHint(find(".md-select"));
  if (mdActive()) return [keyboard, mode, layout, exportHint(find("#saveBtn"))];
  if (els.editor.value.trim())
    return [keyboard, mode, layout, defineHint(find("#defineBtn"))];
  return [
    keyboard,
    mode,
    layout,
    openHint(find("#openBtn")),
    spellDictHint(find(".dict-toggle")),
  ];
});
let exportCtl: ExportControl | null = null;

texTemplate = mdBar.template() === TEX_TEMPLATE;
inProject = mdBar.template() === PROJECT_SLOT;
checkTemplate = CHECK_TEMPLATES.has(mdBar.template());
clean.sync();
lastTex = isTexFile();
applyTexPaint(lastTex);
initTexComplete({
  editor: els.editor,
  active: () => texPaint,
  rectAt: rangeRectAt,
  onImage: () => void insertPickedImage(els.editor),
});
initTexImageInput({ editor: els.editor, active: () => texPaint });
const workspaceEl = document.querySelector<HTMLElement>(".workspace");
if (workspaceEl)
  projectLink = initProjectLink({
    editor: els.editor,
    workspace: workspaceEl,
    tools: () =>
      editorWrap?.querySelector<HTMLElement>(".editor-tools") ?? null,
    slot: () => mdBar.slot(),
    fileName: () => plainName,
    fileHandle: () => fileIO.targetHandle(),
    texActive: isTexFile,
    bindName: (name) => {
      fileIO.putFile(name ? { handle: null, name } : null);
      plainName = name;
      saveDraftFile(name ? { name, kind: "text" } : null, mdBar.slot());
      syncSaveHint();
      mdBar.refresh();
      restoreStatus();
    },
    afterSwitch: () => {
      undoCtl?.baseline();
      syncTexMode();
      enterMdMode(mdActive());
      void render();
      saveText();
    },
    onProject: (name) => {
      mdBar.setProject(name);
      if (name === null) mdBar.leaveProject();
    },
    inSlot: () => mdBar.template() === PROJECT_SLOT,
    enterSlot: () => mdBar.enterProject(),
    closeFileSlot: (id) => mdBar.closeFile(id, true),
    fileSlots: () => mdBar.fileSlots(),
    onChange: () => {
      syncTexMode();
      previewCtl?.update();
    },
    layout: () => measureCtl?.refresh(),
    notify: (message) => holdStatus(message, 6000, false),
    show: (source) => previewCtl?.setSource(source),
  });
const kbLayout = initKeyboardLayout({ editor: els.editor, status: els.status });
void initImageStore(() => els.editor.value);
undoCtl = initUndoHistory({
  editor: els.editor,
  slot: () => {
    const path = projectLink?.path();
    return path ? mdBar.slot() + "\u0000" + path : mdBar.slot();
  },
});
enterMdMode(mdActive());
els.editor.addEventListener("input", nudgeHints);

function isMdFileOpen(): boolean {
  if (office.active()) return false;
  const name = fileIO.targetName() ?? plainName;
  return !!name && MD_NAME_RE.test(name);
}

function enterMdMode(on: boolean): void {
  const markup = on || isMdFileOpen();
  if (markup !== markupSkips) {
    markupSkips = markup;
    void render();
  }
  measureCtl?.setPreviewBlocked(!on && !isTexFile());
  measureCtl?.setPreviewMode(on || isTexFile(), isTexFile());
  previewWanted = on || isTexFile();
  syncPane();
  syncPreviewClass();
  previewCtl?.setMarkdownMode(on);
  exportCtl?.syncPrint();
  nudgeHints();
}

exportCtl = initExport({
  editor: els.editor,
  saveButton: document.querySelector<HTMLElement>("#saveBtn"),
  printButton: document.querySelector<HTMLElement>("#printBtn"),
  template: () => {
    if (isTexFile()) return PLAIN;
    const id = mdBar.template();
    if (!isFileSlot(id)) return id;
    return isMdFileOpen() ? "report" : PLAIN;
  },
  baseName: () => fileIO.targetName() ?? plainName,
  blocked: () => office.active() !== null,
  isTex: isTexFile,
  texZip: async (text, name) => {
    if (projectLink?.bound()) return projectLink.zip();
    const [{ zipSync, strToU8 }, { texImageSources }] = await Promise.all([
      import("fflate"),
      import("./tex/teximages.ts"),
    ]);
    const images = await texImageSources(text);
    if (images.missing.length)
      holdStatus(
        "Архивт ороогүй зураг: " + escapeHtml(images.missing.join(", ")),
        8000,
        false,
      );
    const zip = zipSync({
      ...images.files,
      [name + ".tex"]: strToU8(images.rewrite(text)),
    });
    return new Blob([zip as Uint8Array<ArrayBuffer>], {
      type: "application/zip",
    });
  },
  texZipped: () => projectLink?.zipped(),
  texPdf: async () => {
    if (!previewCtl) throw new Error("no preview");
    const { pdf, missing } = await previewCtl.pdf();
    if (missing.length)
      holdStatus(
        "PDF-д ороогүй зураг: " + escapeHtml(missing.join(", ")),
        8000,
        false,
      );
    return pdf;
  },
  texSource: (name) => fileIO.saveSource(name, !!projectLink?.bound()),
  onDone: () => flash("#saveBtn", "Хадгаллаа"),
  onBlocked: () => flash("#saveBtn", "Экспорт хийх боломжгүй"),
  onPrintError: (error) => {
    flash("#printBtn", "Хэвлэж чадсангүй");
    if (error instanceof Error && error.name === "PdfError")
      holdStatus(escapeHtml(error.message), 8000, false);
  },
  onBusy: (busy, ext) =>
    saveBusy(busy, ext === "zip" ? "Архивлаж байна…" : undefined),
});

function saveBusy(busy: boolean, text = "PDF бэлтгэж байна…"): void {
  const button = document.querySelector<HTMLElement>("#saveBtn");
  if (!button) return;
  if (busy) {
    button.dataset.label ||= button.textContent ?? "";
    button.textContent = text;
  } else {
    button.textContent = button.dataset.label ?? "";
  }
  button.toggleAttribute("aria-busy", busy);
}

function savesPdf(): boolean {
  return (
    touchMQ.matches &&
    !desktopMQ.matches &&
    office.active() === null &&
    isTexFile() &&
    !!previewCtl
  );
}

let pdfSaving = false;
async function savePdf(): Promise<void> {
  if (pdfSaving || !previewCtl) return;
  pdfSaving = true;
  saveBusy(true);
  const notes: string[] = [];
  try {
    const name = pdfName();
    const compiled = previewCtl.pdf();
    compiled.catch(() => {});
    const saved = await projectLink?.save(true).then(
      () => true,
      () => false,
    );
    if (saved === false) notes.push("Төслийн файлуудыг хадгалж чадсангүй");
    const { pdf, missing } = await compiled;
    saveBusy(false);
    if (missing.length)
      notes.push("PDF-д ороогүй зураг: " + escapeHtml(missing.join(", ")));
    if (notes.length) holdStatus(notes.join(" · "), 8000, false);
    if (await deliverFile(pdf, name, "application/pdf"))
      flash("#saveBtn", "PDF хадгаллаа");
  } catch (error) {
    saveBusy(false);
    flash("#saveBtn", "PDF гаргаж чадсангүй");
    if (error instanceof Error && error.name === "PdfError")
      notes.push(escapeHtml(error.message));
    if (notes.length) holdStatus(notes.join(" · "), 8000, false);
  } finally {
    pdfSaving = false;
  }
}

async function restoreDraftFile(): Promise<void> {
  const ref = loadDraftFile(mdBar.slot());
  if (!ref) return;
  if (ref.kind === "office" && (await office.restore(ref.name))) {
    plainName = ref.name;
    syncSaveHint();
    mdBar.refresh();
    enterMdMode(mdActive());
    return;
  }
  fileIO.restoreFile(ref);
  plainName = fileIO.targetName();
  syncSaveHint();
  mdBar.refresh();
  enterMdMode(mdActive());
}

initShortcuts({
  editor: els.editor,
  openDictMenu: () => openDictMenu(),
  lastCaret: () => lastCaret,
});

const DICT_REFRESH_GAP_MS = 24 * 60 * 60 * 1000;
const DICT_REFRESH_POLL_MS = 3 * 60 * 60 * 1000;

function maybeRefreshDict(): void {
  if (import.meta.env.DEV) return;
  if (!ready || !navigator.onLine) return;
  const now = Date.now();
  if (lastDictRefresh && now - lastDictRefresh < DICT_REFRESH_GAP_MS) return;
  lastDictRefresh = now;
  checker.refresh();
  void appUpdate.checkFreshness();
}

async function runOfflineReadyIndicator() {
  const idle = () => els.editor.value.trim() === "";
  const transient = (msg: string, animate = true): void => {
    if (idle()) setStatus(msg, animate);
  };

  if (import.meta.env.DEV || !offlineCapable()) {
    if (idle()) setStatus(baseStatus);
    return;
  }

  offlineIndicatorActive = true;
  transient("Офлайн горимд ажиллахад бэлтгэж байна…");

  let isReady = await isOfflineReady();
  const deadline = Date.now() + 20000;
  while (!isReady && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    isReady = await isOfflineReady();
  }

  if (isReady) {
    transient("Офлайн горимд ажиллахад бэлэн", false);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  offlineIndicatorActive = false;
  if (idle()) setStatus(baseStatus);
}

async function boot() {
  requestDurableStorage();
  if (!import.meta.env.DEV) void appUpdate.recoverStale(true);
  checker.onFatal = async (reason) => {
    if (await appUpdate.recoverStale()) return;
    setStatus(
      "Алдаа шалгагч зогслоо: " +
        escapeHtml(String(reason)) +
        " — хуудсыг дахин ачаална уу",
    );
  };
  setStatus("Hunspell ачаалж байна…");
  await draft.load();
  undoCtl?.baseline();
  await restoreDraftFile();
  await projectLink?.restore();
  render();
  document.documentElement.classList.remove("booting");
  els.editor.focus({ preventScroll: true });
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
    els.editor.addEventListener(type, draft.dropBootScroll, { once: true });
  try {
    const { loaded, failed, fallbackReason, mnVersion } = await checker.init(
      import.meta.env.BASE_URL,
    );
    ready = true;
    checker.setActive(activeIds(enabledEnglish));
    appUpdate.setDictVersion(mnVersion);
    spell.clear();
    await render();
    if (loaded.length) {
      lastFailed = failed;
      lastFallbackReason = fallbackReason;
      baseStatus = dictStatusMessage(
        visibleIds(loaded, enabledEnglish),
        failed,
        fallbackReason,
      );
      runOfflineReadyIndicator();
    } else {
      setStatus(
        "Нэг ч толь алга — <code>public/dict/</code> дотор .aff/.dic хийнэ үү.",
      );
    }

    checker.onDictUpdated = (id) => {
      if (id !== "mn_MN") return;
      appUpdate.setDictVersion(checker.mnVersion);
      spell.clear();
      void render();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") maybeRefreshDict();
    });
    window.addEventListener("online", () => maybeRefreshDict());
    setInterval(maybeRefreshDict, DICT_REFRESH_POLL_MS);
    checker.whenComplete().then((done) => {
      spell.clear();
      lastFailed = [...(failed || []), ...done.failed];
      baseStatus = dictStatusMessage(
        visibleIds(checker.loadedIds, enabledEnglish),
        lastFailed,
        fallbackReason,
      );
      if (els.editor.value.trim() === "" && !offlineIndicatorActive)
        setStatus(baseStatus, false);
      render();
      maybeRefreshDict();
    });
  } catch (e) {
    if (await appUpdate.recoverStale()) return;
    setStatus(
      "Ачаалахад алдаа гарлаа: " +
        escapeHtml(e instanceof Error ? e.message : String(e)),
    );
  }
}

desktopMQ.addEventListener("change", () => {
  hidePopover();
  errorPanel.render();
});

boot();

setTimeout(() => {
  document.documentElement.classList.remove("booting");
}, 2000);

initToolbar({
  els,
  isDocxActive: () => office.active() !== null,
  closeDocx: office.close,
  forgetFile: () => {
    clearedEmpty = true;
    projectLink?.cleared();
    fileIO.forgetFile();
    syncPreviewClass();
  },
  afterClear: (cleared) => {
    mdBar.reset(cleared);
    rotateEmptyTips();
  },
  hasOpenFile: () => openFileName() !== null,
  flash,
  setStatus,
  setEditorText,
  insertEditorText,
  hidePopover,
  render,
  saveText,
  isTouch,
  buildErrorList,
  getBadTokens: () => badTokens,
  copyText,
  lettersFixed: () => decode.announce(STANDARD_LETTERS_MESSAGE),
});
initKeyboardToolbar(els.editor, els.backdrop);

initSuggest({
  buildErrorList,
  getBadTokens: () => badTokens,
  isDashSuffix: (token) => isDashSuffix(els.editor.value, token),
  copyText,
  checkKnown: (list) =>
    checker.ready && !checker.dead && checker.loadedIds.includes("mn_MN")
      ? checker.checkWords(list)
      : Promise.resolve(null),
});

initIgnoreList({
  onChange: () => render(),
});
onIgnoredChange(() => render());

let guardedProject: string | null = null;
tabGuard = initTabGuard({
  slot: () => mdBar.slot(),
  project: () => project()?.uid ?? null,
  warn: (message) => holdStatus(message, 8000, false),
});
onProjectChange(() => {
  const uid = project()?.uid ?? null;
  if (uid === guardedProject) return;
  guardedProject = uid;
  tabGuard?.sync();
});

initSurvey();

initReportButton(() => {
  const active = activeIds(enabledEnglish);
  return {
    entryUrl: import.meta.url,
    activeDicts: checker.loadedIds.filter((id) => active.includes(id)),
    officeActive: office.active() !== null,
    markdownActive: mdActive(),
    fileName: openFileName(),
    layout: measureCtl?.layout() ?? null,
    text: els.editor.value,
    errorWords: badTokens.map((token) => token.word),
    personalDict: getIgnored(),
    listDicts: () => checker.listDicts?.({ peek: true }) ?? Promise.resolve([]),
  };
});

const openDictMenu = initDictMenu({
  statusEl: els.status,
  getEnabled: () => enabledEnglish,
  onApply: (next) => {
    enabledEnglish = next;
    checker.setActive(activeIds(enabledEnglish));
    spell.clear();
    baseStatus = dictStatusMessage(
      visibleIds(checker.loadedIds, enabledEnglish),
      lastFailed,
      lastFallbackReason,
    );
    render();
    if (els.editor.value.trim() === "" && !offlineIndicatorActive) {
      setStatus(baseStatus, false);
    }
  },
  onClose: () => els.editor.focus(),
});

document.fonts.ready.then(() => {
  initBackdrop(els.backdrop);
  render();
});

if (import.meta.env.DEV) {
  const assertMetrics = () => {
    const delta = els.backdrop.scrollHeight - els.editor.scrollHeight;
    if (delta !== 0) {
      console.warn("backdrop/editor өндрийн зөрүү:", delta, "px");
    }
  };
  els.editor.addEventListener("input", assertMetrics);
  document.fonts.ready.then(assertMetrics);
}
