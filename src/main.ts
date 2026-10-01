import "./style.css";
import "./gutter.css";
import "./md-toolbar.css";
import "./export.css";
import "./deftip.css";
import {
  MultiSpellChecker,
  checkWordsBatched,
  tokenize,
} from "./spellchecker.ts";
import type { SpellChecker } from "./spellchecker.ts";
import { initFileIO } from "./fileio.ts";
import { clearImages } from "./images.ts";
import { initToolbar } from "./toolbar.ts";
import { initKeyboardToolbar } from "./kbtoolbar.ts";
import { initSuggest } from "./suggest.ts";
import { initSurvey, surveyOnErrorCount } from "./survey.ts";
import { isIgnored, addIgnored } from "./ignore.ts";
import type { Token } from "./textcheck.ts";
import { initIgnoreList, syncIgnoreVisibility } from "./ignorelist.ts";
import { initAppearance } from "./appearance.ts";
import { mountMeasureControl, type MeasureControl } from "./measure.ts";
import { initPreview, type Preview } from "./preview.ts";

let previewCtl: Preview | null = null;
import { escapeHtml } from "./htmlutil.ts";
import { pickDefinitionMarks } from "./defmarks.ts";
import { inRanges, skipRanges } from "./codeskip.ts";
import {
  checkable,
  isDashSuffix,
  buildErrorList,
  dashSpan,
  dashNormalizeApply,
} from "./textcheck.ts";
import { saveDraftFile, loadDraftFile } from "./storage.ts";
import { initMdToolbar } from "./mdtoolbar.ts";
import {
  defineHint,
  exportHint,
  initHints,
  layoutHint,
  openHint,
  spellDictHint,
  templateHint,
} from "./hint.ts";
import { isPlain } from "./templates.ts";
import { initExport, type ExportControl } from "./export.ts";
import {
  initBackdrop,
  renderBackdrop,
  refreshBackdropMarks,
  materializeMark,
  setActiveLine,
  setLineBlocks,
  backdropLineCount,
  marksAtY,
} from "./backdrop.ts";
import { shiftTokens } from "./tokenshift.ts";
import { isLookupKey, wordAt, type WordSpan } from "./lookup.ts";
import { openDictManager } from "./dictmanager.ts";
import { rotateEmptyTips, syncEmptyTips } from "./emptytips.ts";
import {
  initDictMenu,
  loadEnabledEnglish,
  activeIds,
  visibleIds,
} from "./dictmenu.ts";
import { splitName } from "./office/filename.ts";
import { casePattern } from "./caseform.ts";
import type { CasePattern } from "./caseform.ts";
import type { OfficeMode } from "./office/mode.ts";
import { initStatus, nf } from "./status.ts";
import { isBulkDelete, isSeparatorInput, isTouch } from "./input.ts";
import { copyText, flash } from "./clipboard.ts";
import {
  dashFixes,
  numberSplits,
  periodSplitDot,
  periodSplits,
  replaceAllWord,
  scopeToSuffix,
  splitEveryOccurrence,
  wordAtCaret,
} from "./wordfix.ts";
import { initEditorText } from "./editortext.ts";
import { initDraftText } from "./drafttext.ts";
import { initDecode } from "./decode.ts";
import { initAppUpdate } from "./appupdate.ts";
import {
  dictStatusMessage,
  isOfflineReady,
  offlineCapable,
  requestDurableStorage,
} from "./offline.ts";
import { initShortcuts } from "./shortcuts.ts";
import { initDefTip } from "./deftip.ts";
import { initPopover } from "./popover.ts";
import { initErrorPanel } from "./errorpanel.ts";

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
interface PendingFix {
  original: string;
  originalPattern: CasePattern;
  dashSuffix: boolean;
  start: number;
}

const cache = new Map<string, boolean>();
let ready = false;
let badTokens: Token[] = [];
let baseStatus = "";
let offlineIndicatorActive = false;
let lastDictRefresh = 0;
let pendingFix: PendingFix | null = null;
let enabledEnglish = loadEnabledEnglish();
let lastFailed: { id: string; error: string }[] | null = null;
let lastFallbackReason: string | null = null;
let docx: OfficeMode | null = null;
let plainName: string | null = null;
let skipCode = true;
let skipLinks = true;
let lastCaret: { start: number; end: number } | null = null;

const status = initStatus(els.status, () => restoreStatus());
const setStatus = status.set;
const holdStatus = status.hold;
const releaseStatusHold = status.release;

const PREPARE_HOLD_MS = 3000;

function restoreStatus(): void {
  if (!ready) return;
  if (els.editor.value.trim() === "") {
    if (baseStatus && !offlineIndicatorActive) setStatus(baseStatus);
    return;
  }
  setStatus(statsMessage(), false);
}
function isCorrect(word: string): boolean {
  return cache.has(word) ? cache.get(word)! : true;
}
const CHECK_NOTICE_MIN = 2000;
const CHECK_BATCH = 8000;
type Tokenized =
  ReturnType<typeof tokenize> extends Iterable<infer T> ? T : never;
function tokenizeAll(text: string): Tokenized[] {
  return Array.from(tokenize(text), (item) => ({ ...item }));
}
async function ensureChecked(
  text: string,
  tokens: Iterable<Tokenized> = tokenize(text),
): Promise<void> {
  const need = new Set<string>();
  for (const { word, joined } of tokens) {
    const probe = joined ?? word;
    if (checkable(word) && !cache.has(probe)) need.add(probe);
  }
  if (!need.size) return;
  const words = [...need];
  const notify = words.length > CHECK_NOTICE_MIN;
  if (notify) {
    setStatus("Алдааг шалгаж байна… 0%", true);
    await nextFrame();
  }
  const results = await checkWordsBatched(
    checker,
    words,
    CHECK_BATCH,
    async (done, total) => {
      if (!notify) return;
      const pct = Math.floor((done / total) * 100);
      setStatus("Алдааг шалгаж байна… " + pct + "%", false);
      await nextFrame();
    },
  );
  for (const [word, correct] of results) cache.set(word, correct);
}
function afterPaint(): Promise<void> {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0)),
  );
}
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve()),
  );
}
async function correctNow(word: string): Promise<boolean> {
  if (cache.has(word)) return cache.get(word)!;
  const checkResults = await checker.checkWords([word]);
  const correct = checkResults[word] === true;
  cache.set(word, correct);
  return correct;
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

function computeBad(
  text: string,
  tokens: Iterable<Tokenized> = tokenize(text),
): { bad: Token[]; total: number } {
  const bad: Token[] = [];
  const skip = skipRanges(text, { code: skipCode, links: skipLinks });
  let total = 0;
  for (const { word, index, joined } of tokens) {
    total++;
    if (skip.length && inRanges(skip, index)) continue;
    if (!checkable(word) || isCorrect(joined ?? word) || isIgnored(word))
      continue;
    const span = dashSpan(text, { word, start: index });
    const last = bad[bad.length - 1];
    if (span && !isIgnored(span.word) && (!last || last.end <= span.start)) {
      bad.push(span);
      continue;
    }
    bad.push({ word, start: index, end: index + word.length, joined });
  }
  return { bad, total };
}

function syncEmptyState(text: string): void {
  const empty = text.length === 0;
  if (empty) clearImages();
  if (!els.emptyState) return;
  els.emptyState.style.opacity = empty ? "" : "0";
  els.emptyState.setAttribute("aria-hidden", empty ? "false" : "true");
  document.body.classList.toggle("has-text", !empty);
  syncEmptyTips(empty);
}

let renderSeq = 0;
async function render() {
  const text = els.editor.value;
  const seq = ++renderSeq;

  syncEmptyState(text);
  previewCtl?.update();

  if (!ready) {
    badTokens = [];
    renderBackdrop(text, []);
    syncScroll();
    errorPanel.clear(text.trim() !== "");
    return;
  }

  const tokens = tokenizeAll(text);
  await ensureChecked(text, tokens);
  if (seq !== renderSeq) return;
  const { bad, total } = computeBad(text, tokens);
  badTokens = bad;

  renderBackdrop(text, bad);
  syncScroll();
  errorPanel.render();
  surveyOnErrorCount(bad.length, text.trim() !== "");

  if (ready) {
    if (text.trim() === "") {
      if (baseStatus && !offlineIndicatorActive) setStatus(baseStatus);
    } else {
      statWords = total;
      statBad = bad.length;
      statChars = text.length;
      setStatus(statsMessage(), false);
    }
  }
}

let statWords = 0;
let statBad = 0;
let statChars = 0;

function caretLineIndex(value: string): number {
  const caret = Math.min(els.editor.selectionStart ?? 0, value.length);
  let line = 0;
  for (let i = 0; i < caret; i++) {
    if (value.charCodeAt(i) === 10) line++;
  }
  return line;
}

function lineInfo(knownLine?: number): string {
  if (!narrowMQ.matches) return "";

  const value = els.editor.value;
  if (value === "") return "";

  const line = (knownLine ?? caretLineIndex(value)) + 1;
  const total = backdropLineCount() + (value.endsWith("\n") ? 1 : 0);

  return ", Мөр: " + nf(line) + " / " + nf(Math.max(total, line));
}

let saveTitleBase: string | null = null;

function statsBody(knownLine?: number): string {
  if (desktopMQ.matches) {
    return "Үгийн тоо: " + nf(statWords) + ", Нийт тэмдэгт: " + nf(statChars);
  }

  return (
    "Үгийн тоо: " +
    nf(statWords) +
    ", <b>Алдаатай үг</b>: <b>" +
    nf(statBad) +
    "</b>, Нийт тэмдэгт: " +
    nf(statChars) +
    lineInfo(knownLine)
  );
}

function syncSaveHint(): void {
  const btn = document.querySelector<HTMLElement>("#saveBtn");
  if (!btn) return;

  if (saveTitleBase === null) saveTitleBase = btn.title;

  const combo = saveTitleBase.includes(" · ")
    ? saveTitleBase.slice(saveTitleBase.lastIndexOf(" · "))
    : "";

  const target = fileIO.targetName();

  btn.title = docx
    ? docx.outputName() + " болгож хадгална" + combo
    : target
      ? target + " болгож хадгална" + combo
      : saveTitleBase;
}

function statsMessage(knownLine?: number): string {
  const full = docx ? docx.fileName() : plainName;
  if (!full) return statsBody(knownLine);

  const parts = splitName(full);

  return (
    '<b class="doc-head" title="' +
    escapeHtml(full) +
    '">' +
    escapeHtml(parts.head) +
    "</b>" +
    '<b class="doc-keep">' +
    escapeHtml(parts.tail) +
    "</b>" +
    '<span class="doc-rest">' +
    ", " +
    statsBody(knownLine) +
    "</span>"
  );
}

function refreshLineInfo(knownLine?: number): void {
  if (!ready || !narrowMQ.matches) return;
  if (!els.status.innerHTML.includes("Үгийн тоо:")) return;
  setStatus(statsMessage(knownLine), false);
}

function syncScroll() {
  els.backdrop.scrollTop = els.editor.scrollTop;
  els.backdrop.scrollLeft = els.editor.scrollLeft;
}

function syncActiveLine() {
  const line = caretLineIndex(els.editor.value);
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

const defTip = initDefTip({
  editor: els.editor,
  popover: els.popover,
  define: checker.define ? (word) => checker.define!(word) : undefined,
  showPanel: (word) => void pop.showDefPanel(word),
  hidePopover: () => pop.hide(),
  holdStatus,
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

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

function wordForLookup(): WordSpan | null {
  const { value, selectionStart, selectionEnd } = els.editor;
  if (selectionStart === selectionEnd) return wordAt(value, selectionStart);
  let start = selectionStart;
  let end = selectionEnd;
  while (start < end && !WORD_CHAR.test(value.charAt(start))) start++;
  while (end > start && !WORD_CHAR.test(value.charAt(end - 1))) end--;
  if (start >= end) return null;
  const span = wordAt(value, start);
  return span && span.start <= start && span.end >= end ? span : null;
}

const LONG_PRESS_MS = 550;
const NO_DICT_MESSAGE =
  "Толь нэмэхийн тулд Shift товчийг Үгийн тайлбар харах товчтой хамт дарна уу";
const NO_DICT_TOUCH_MESSAGE =
  "Толь нэмэхийн тулд Үгийн тайлбар харах товчийг удаан дарна уу";

function isDictManagerKey(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.altKey &&
    event.code === "Space"
  );
}

function manageDicts(): Promise<void> {
  return openDictManager({
    list: () => checker.listDicts?.() ?? Promise.resolve([]),
    reload: () => checker.reloadDicts?.(),
    reorder: () => checker.reorderDicts?.(),
    changed: () => defTip.resetDefinitions(),
    status: (message) => holdStatus(message, 5000, false),
  });
}

const defineBtn = document.querySelector<HTMLButtonElement>("#defineBtn");
let definePressTimer: ReturnType<typeof setTimeout> | undefined;
let definePressArmed = false;

defineBtn?.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") return;
  definePressArmed = false;
  clearTimeout(definePressTimer);
  definePressTimer = setTimeout(() => {
    definePressArmed = true;
  }, LONG_PRESS_MS);
});
for (const type of ["pointerup", "pointercancel", "pointerleave"])
  defineBtn?.addEventListener(type, () => clearTimeout(definePressTimer));
defineBtn?.addEventListener("contextmenu", (event) => event.preventDefault());

defineBtn?.addEventListener("click", async (event) => {
  if (definePressArmed || event.shiftKey || event.ctrlKey || event.metaKey) {
    definePressArmed = false;
    void manageDicts();
    return;
  }
  const caretToken = tokenAtCaret();
  if (caretToken) {
    void showPopoverFor(caretToken);
    return;
  }
  if (!checker.define) return;
  const span = wordForLookup();
  if (!span) {
    holdStatus("Тайлбар харах үг дээрээ товшоод дахин дарна уу", 3000, false);
    return;
  }
  const definition = await defTip.definitionFor(
    els.editor.value.slice(span.start, span.end),
  );
  if (definition.dicts === 0) {
    holdStatus(
      isTouch() ? NO_DICT_TOUCH_MESSAGE : NO_DICT_MESSAGE,
      6000,
      false,
    );
    return;
  }
  if (isTouch()) void pop.openWordPanel(span);
  else void defTip.showWordDefinition(span);
});

els.editor.addEventListener("keydown", (e) => {
  if (!e.isComposing && isDictManagerKey(e)) {
    e.preventDefault();
    void manageDicts();
    return;
  }
  if (e.isComposing || !isLookupKey(e)) return;
  const caretToken = tokenAtCaret();
  if (caretToken) {
    e.preventDefault();
    void showPopoverFor(caretToken);
    return;
  }
  if (!checker.define) return;
  const span = wordForLookup();
  if (!span) return;
  e.preventDefault();
  void defTip.showWordDefinition(span);
});

const checkWords = (words: string[]) => checker.checkWords(words);

const reducedMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

async function showPopoverFor(token: Token): Promise<void> {
  materializeMark(token.start);
  let mark = els.backdrop.querySelector(
    'mark[data-start="' + token.start + '"]',
  );
  if (!mark) {
    await render();
    materializeMark(token.start);
    mark = els.backdrop.querySelector(
      'mark[data-start="' + token.start + '"]',
    );
  }
  if (!mark) {
    hidePopover();
    return;
  }

  pop.open(token.start);

  const [dashes, splits, numbers, offered] = await Promise.all([
    dashFixes(token, checkWords),
    periodSplits(token.word, checkWords),
    numberSplits(token.word, checkWords),
    checker.suggest(token.joined ?? token.word),
  ]);
  const scoped = scopeToSuffix(token, offered);
  const ahead = [
    ...dashes,
    ...splits.filter((item) => !dashes.includes(item)),
    ...numbers.filter(
      (item) => !splits.includes(item) && !dashes.includes(item),
    ),
  ];
  const suggestions = [
    ...ahead,
    ...scoped.filter((item) => !ahead.includes(item)),
  ].slice(0, desktopMQ.matches ? 15 : 8);
  const found =
    checker.lookup && suggestions.length
      ? await checker.lookup(suggestions)
      : null;
  if (!pop.isOpenAt(token.start)) return;
  const marks = pickDefinitionMarks(suggestions, found);
  const sgHtml = suggestions.length
    ? suggestions
        .map((suggestion) => {
          const button =
            '<button class="sg" type="button">' +
            escapeHtml(suggestion) +
            "</button>";
          if (!marks.has(suggestion)) return button;
          return (
            '<div class="sg-row">' +
            button +
            '<button class="sg-dot" type="button"' +
            ' aria-expanded="false" aria-controls="defTip" aria-label="' +
            escapeHtml(suggestion) +
            ' — тайлбар"></button></div>'
          );
        })
        .join("")
    : '<div class="muted pop-empty">санал алга</div>';
  els.popover.innerHTML =
    '<div class="pop-scroll">' +
    '<div class="pop-list">' +
    sgHtml +
    "</div>" +
    '<div class="pop-less" hidden>' +
    '<button class="pop-less-btn" type="button" aria-label="Дээш гүйлгэх">' +
    "</button></div>" +
    '<div class="pop-more" hidden>' +
    '<button class="pop-more-btn" type="button" aria-label="Доош гүйлгэх">' +
    "</button></div>" +
    "</div>" +
    '<button class="sg sg-ignore" type="button">Энэ үгийг алгасах</button>';
  const list = pop.list();
  if (list) {
    list.scrollTop = 0;
    list.addEventListener("scroll", pop.updateScrollHint, { passive: true });
    list.addEventListener("scroll", defTip.hide, { passive: true });
  }
  pop.measure();
  pop.place();

  els.popover.querySelectorAll(".sg:not(.sg-ignore)").forEach((btn) => {
    btn.addEventListener("click", () => {
      const covered = pop.obscuredBy(btn);
      if (covered > 0 && list) {
        list.scrollBy({
          top: covered,
          behavior: reducedMotionMQ.matches ? "auto" : "smooth",
        });
        return;
      }
      applySuggestion(token, btn.textContent);
    });
  });
  els.popover
    .querySelectorAll<HTMLElement>(".sg-dot")
    .forEach(defTip.bindDot);
  const pageBy = (sign: number) => {
    if (!list) return;
    list.scrollBy({
      top: sign * Math.max(60, list.clientHeight - 48),
      behavior: reducedMotionMQ.matches ? "auto" : "smooth",
    });
  };
  els.popover
    .querySelectorAll(".pop-more-btn, .pop-less-btn")
    .forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () =>
        pageBy(btn.classList.contains("pop-less-btn") ? -1 : 1),
      );
    });
  const ignoreBtn = els.popover.querySelector(".sg-ignore");
  if (ignoreBtn) {
    ignoreBtn.addEventListener("click", () => {
      addIgnored(token.word);
      syncIgnoreVisibility();
      hidePopover();
      render();
    });
  }
}

function suggestAtCaret() {
  const caretToken = tokenAtCaret();
  if (!caretToken) {
    hidePopover();
    return;
  }
  if (pop.isOpenAt(caretToken.start)) return;
  showPopoverFor(caretToken);
}

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
  const lower = manualFixToken.word.toLowerCase();
  if (lower === pendingFix.original) return;
  if (pendingFix.original.length - manualFixToken.word.length > 2) return;
  if (!(await correctNow(manualFixToken.word))) return;
  const original = pendingFix.original;
  const primaryPattern = pendingFix.originalPattern || "lower";
  pendingFix = null;
  const { text: nt, caret } = replaceAllWord(
    text,
    original,
    manualFixToken.word,
    pos,
    primaryPattern,
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
    badTokens = shiftTokens(badTokens, edit);
    renderBackdrop(text, badTokens);
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

  const dashFix = dashNormalizeApply(editorText, token, replacement);
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
    );
    if (split) {
      await commitReplacement(split.text, split.caret);
      return;
    }
  }

  const onlyAt = isDashSuffix(editorText, token) ? token.start : null;
  const { text: nt, caret } = replaceAllWord(
    editorText,
    token.word.toLowerCase(),
    replacement,
    token.end,
    casePattern(token.word),
    onlyAt,
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
    if (docx && !docx.sync(old, next)) {
      holdStatus("Энэ өөрчлөлтийг docx файлд буулгах боломжгүй");
      return false;
    }
    return true;
  },
  onReplaced: () => decode.sync(),
});
const setEditorText = editorText.set;
const insertEditorText = editorText.insert;

const decode = initDecode({
  editor: els.editor,
  setEditorText,
  refresh: () => {
    cache.clear();
    return render();
  },
  saveText: () => saveText(),
});

const draft = initDraftText({
  editor: els.editor,
  setStatus,
  onLoaded: () => decode.sync(),
  onCaret: (caret) => {
    lastCaret = caret;
  },
});
const saveText = draft.save;

els.editor.addEventListener("input", (e) => {
  if (editorText.programmatic()) return;
  if (!(e instanceof InputEvent)) return;
  hidePopover();
  syncEmptyState(els.editor.value);
  draft.saveSoon();
  if (isSeparatorInput(e)) void recheckAfterSeparator();
  else {
    if (hadSelection || els.editor.value.length === 0 || isBulkDelete(e))
      render();
    deferredCheck();
  }
  decode.afterInput(e);
});

const clearBtnEl = document.querySelector("#clearBtn");
if (clearBtnEl) {
  clearBtnEl.addEventListener("click", () => {
    mdBar.reset();
    rotateEmptyTips();
  });
}
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
  pop.followScroll();
  refreshMarksSoon();
});
els.editor.addEventListener("click", () => {
  pendingFix = null;
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  suggestAtCaret();
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
    if (l.preview) previewCtl?.update();
  });
  previewCtl = initPreview(editorWrap, els.editor, (next) => {
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
  });
}

const appUpdate = initAppUpdate(setStatus, import.meta.url);

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

async function openPdfFile(file: File): Promise<boolean> {
  releaseStatusHold();
  setStatus("PDF файлыг уншиж байна…");
  let text: string;
  let stallTimer: number | null = null;
  const armStall = (): void => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = window.setTimeout(() => {
      stallTimer = null;
      setStatus("Бичвэрийг бэлдэж байна…", false);
    }, 5000);
  };
  try {
    const mod = await import("./pdftext.ts");
    armStall();
    text = await mod.extractPdfText(file, (page, total) => {
      armStall();
      if (total > 1)
        setStatus("PDF уншиж байна — " + page + " / " + total, false);
    });
  } catch (e) {
    if (stallTimer) clearTimeout(stallTimer);
    const reason = e instanceof Error ? e.message : "";
    const tooLarge = reason.startsWith("too-large");
    holdStatus(
      tooLarge
        ? "Файл хэт том байна — " +
            (reason.split(":")[1] || "20") +
            " мегабайтаас хэтэрч болохгүй"
        : reason === "no-text"
          ? "Сканердсан баримт байна — текстийн давхарга агуулаагүй тул уншиж чадсангүй"
          : "PDF файлыг уншиж чадсангүй",
    );
    return true;
  }
  if (stallTimer) clearTimeout(stallTimer);
  holdStatus("Бичвэрийг бэлдэж байна…", PREPARE_HOLD_MS, false);
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
  );
  closeDocx();
  setEditorText(text, text.length);
  hidePopover();
  await render();
  saveText();
  previewCtl?.setSource({ kind: "pdf", file });
  return true;
}

async function openDocxFile(file: File): Promise<boolean> {
  if (isPdfFile(file)) return openPdfFile(file);
  let mod: typeof import("./office/mode.ts");
  try {
    mod = await import("./office/mode.ts");
  } catch (_) {
    holdStatus("Баримт уншигчийг ачаалж чадсангүй");
    return true;
  }

  if (mod.officeFormat(file) === null) return false;

  try {
    docx = await mod.openOfficeMode(file);
  } catch (e) {
    docx = null;
    const reason = e instanceof Error ? e.message : "";
    holdStatus(
      reason.startsWith("too-large")
        ? "Файл хэт том байна — " +
            (reason.split(":")[1] || "12") +
            " мегабайтаас хэтэрч болохгүй"
        : "Файлыг уншиж чадсангүй",
    );
    return true;
  }

  els.editor.readOnly = true;
  els.editor.value = docx.text();
  previewCtl?.setSource({ kind: "office", name: file.name });
  document.body.classList.add("docx-mode");
  syncSaveHint();
  exportCtl?.syncPrint();
  hidePopover();
  decode.sync();
  await render();
  return true;
}

function closeDocx(): void {
  if (!docx) return;
  docx = null;
  els.editor.readOnly = false;
  document.body.classList.remove("docx-mode");
  syncSaveHint();
  exportCtl?.syncPrint();
}

async function docxSave(): Promise<void> {
  if (!docx) return;
  const out = await docx.save();

  if (out.skipped > 0) {
    console.warn("docx: алгасагдсан засвар", out.skippedWords);
    const names = out.skippedWords
      .map((item) => '"' + item.word + '" (' + item.reason + ")")
      .join(", ");
    holdStatus(
      "Засагдсангүй: " +
        names +
        " — үлдсэн " +
        out.applied +
        " засвар хадгалагдлаа",
      12000,
    );
  }
}

const fileIO = initFileIO({
  els,
  openDocxFile,
  closeDocx,
  isDocxActive: () => docx !== null,
  docxSave,
  flash,
  setStatus,
  setEditorText,
  hidePopover,
  render,
  saveText,
  defaultExt: () => (isPlain(mdBar.template()) ? "txt" : "md"),
  onFileOpened: (ref) => {
    clearImages();
    plainName = ref ? ref.name : null;
    saveDraftFile(ref);
    syncSaveHint();
    mdBar.refresh();
    nudgeHints();
  },
});

const MD_NAME_RE = /\.(md|markdown|mdown)$/i;

const mdBar = initMdToolbar({
  editor: els.editor,
  mount: document.querySelector<HTMLElement>("header.topbar") ?? undefined,
  isMdFile: () => {
    if (docx) return false;
    const name = fileIO.targetName() ?? plainName;
    return !!name && MD_NAME_RE.test(name);
  },
  onTemplate: (id) => enterMdMode(!isPlain(id)),
  onExample: () => enterMdMode(true),
});
const find = (sel: string) => (): HTMLElement | null =>
  document.querySelector<HTMLElement>(sel);
const nudgeHints = initHints(() => {
  const layout = layoutHint(find(".measure-btn.is-shown"));
  if (!isPlain(mdBar.template()))
    return [layout, exportHint(find("#saveBtn"))];
  const template = templateHint(find(".md-select"));
  if (els.editor.value.trim())
    return [layout, defineHint(find("#defineBtn")), template];
  return [
    layout,
    openHint(find("#openBtn")),
    spellDictHint(find(".dict-toggle")),
    template,
  ];
});
let exportCtl: ExportControl | null = null;

enterMdMode(!isPlain(mdBar.template()));
els.editor.addEventListener("input", nudgeHints);

function enterMdMode(on: boolean): void {
  measureCtl?.setPreviewMode(on);
  exportCtl?.syncPrint();
  nudgeHints();
}

exportCtl = initExport({
  editor: els.editor,
  saveButton: document.querySelector<HTMLElement>("#saveBtn"),
  printButton: document.querySelector<HTMLElement>("#printBtn"),
  template: () => mdBar.template(),
  baseName: () => fileIO.targetName() ?? plainName,
  blocked: () => docx !== null,
  onDone: () => flash("#saveBtn", "Хадгаллаа"),
  onBlocked: () => flash("#saveBtn", "Экспорт хийх боломжгүй"),
  onBusy: (busy) => {
    const button = document.querySelector<HTMLElement>("#saveBtn");
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent ?? "";
      button.textContent = "PDF бэлтгэж байна…";
    } else {
      button.textContent = button.dataset.label ?? "";
    }
    button.toggleAttribute("aria-busy", busy);
  },
});

function restoreDraftFile(): void {
  const ref = loadDraftFile();
  if (!ref) return;
  if (els.editor.value === "") {
    saveDraftFile(null);
    return;
  }
  fileIO.restoreFile(ref);
  plainName = fileIO.targetName();
  syncSaveHint();
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
  restoreDraftFile();
  render();
  document.documentElement.classList.remove("booting");
  els.editor.focus();
  draft.restoreBootScroll();
  void document.fonts?.ready.then(() => {
    draft.restoreBootScroll();
    draft.dropBootScroll();
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
    cache.clear();
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
      cache.clear();
      void render();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") maybeRefreshDict();
    });
    window.addEventListener("online", () => maybeRefreshDict());
    setInterval(maybeRefreshDict, DICT_REFRESH_POLL_MS);
    checker.whenComplete().then((done) => {
      cache.clear();
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
  isDocxActive: () => docx !== null,
  closeDocx,
  forgetFile: fileIO.forgetFile,
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

initSurvey();

const openDictMenu = initDictMenu({
  statusEl: els.status,
  getEnabled: () => enabledEnglish,
  onApply: (next) => {
    enabledEnglish = next;
    checker.setActive(activeIds(enabledEnglish));
    cache.clear();
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
