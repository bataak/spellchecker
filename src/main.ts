import "./style.css";
import {
  MultiSpellChecker,
  checkWordsBatched,
  tokenize,
  DICTIONARIES,
} from "./spellchecker.ts";
import type { SpellChecker } from "./spellchecker.ts";
import { initFileIO } from "./fileio.ts";
import { initToolbar } from "./toolbar.ts";
import { initSuggest } from "./suggest.ts";
import { initSurvey, surveyOnErrorCount } from "./survey.ts";
import { isIgnored, addIgnored } from "./ignore.ts";
import type { Token } from "./textcheck.ts";
import { initIgnoreList, syncIgnoreVisibility } from "./ignorelist.ts";
import { initAppearance } from "./appearance.ts";
import { escapeHtml } from "./htmlutil.ts";
import { checkable, isDashSuffix, buildErrorList } from "./textcheck.ts";
import {
  initDraftStorage,
  saveDraft,
  flushDraft,
  loadDraft,
} from "./storage.ts";
import {
  initBackdrop,
  renderBackdrop,
  refreshBackdropMarks,
  materializeMark,
} from "./backdrop.ts";
import { rotateEmptyTips, syncEmptyTips } from "./emptytips.ts";

document.body.classList.add("ready");

const els = {
  status: document.querySelector("#statusText") as HTMLElement,
  editor: document.querySelector("#editor") as HTMLTextAreaElement,
  backdrop: document.querySelector("#backdrop") as HTMLElement,
  popover: document.querySelector("#popover") as HTMLElement,
  emptyState: document.querySelector<HTMLElement>("#emptyState"),
};

const panelEls = {
  list: document.querySelector<HTMLElement>("#errorList"),
  copy: document.querySelector<HTMLButtonElement>("#copyErrorsBtn"),
  title: document.querySelector<HTMLElement>("#errorPanelTitle"),
};
const desktopMQ = window.matchMedia("(min-width: 1024px)");
initBackdrop(els.backdrop);

const checker: SpellChecker = new MultiSpellChecker();
interface PendingFix {
  original: string;
  originalPattern: CasePattern;
  dashSuffix: boolean;
  start: number;
}

type CasePattern = "lower" | "capital" | "upper";

const cache = new Map<string, boolean>();
let ready = false;
let badTokens: Token[] = [];
let baseStatus = "";
let offlineIndicatorActive = false;
let pendingFix: PendingFix | null = null;

const labelOf = (id: string): string =>
  DICTIONARIES.find((dict) => dict.id === id)?.label || id;
const nf = (num: number): string => num.toLocaleString("en-US");
const setStatus = (html: string, animate = true): void => {
  els.status.innerHTML = html;
  if (!animate) return;
  els.status.classList.remove("status-reveal");
  void els.status.offsetWidth;
  els.status.classList.add("status-reveal");
};
function isCorrect(word: string): boolean {
  return cache.has(word) ? cache.get(word)! : true;
}
const CHECK_NOTICE_MIN = 2000;
const CHECK_BATCH = 8000;
async function ensureChecked(text: string): Promise<void> {
  const need = new Set<string>();
  for (const { word } of tokenize(text)) {
    if (checkable(word) && !cache.has(word)) need.add(word);
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

function computeBad(text: string): { bad: Token[]; total: number } {
  const bad: Token[] = [];
  let total = 0;
  for (const { word, index } of tokenize(text)) {
    total++;
    if (!checkable(word) || isCorrect(word) || isIgnored(word)) continue;
    bad.push({ word, start: index, end: index + word.length });
  }
  return { bad, total };
}

function casePattern(src: string): CasePattern {
  if (!src) return "lower";
  let upper = 0,
    lower = 0,
    firstCased = null;
  for (const ch of src) {
    const upperChar = ch.toUpperCase(),
      lowerChar = ch.toLowerCase();
    if (upperChar === lowerChar) continue;
    if (firstCased === null) firstCased = ch;
    if (ch === upperChar) upper++;
    else lower++;
  }
  if (upper === 0) return "lower";
  if (lower === 0) return "upper";
  if (upper > lower) return "upper";
  if (firstCased && firstCased === firstCased.toUpperCase()) return "capital";
  return "lower";
}
function applyCase(pattern: CasePattern, word: string): string {
  const lo = word.toLowerCase();
  if (pattern === "upper") return word.toUpperCase();
  if (pattern === "capital") return lo.charAt(0).toUpperCase() + lo.slice(1);
  return lo;
}
function irregularCase(word: string): boolean {
  return applyCase(casePattern(word), word.toLowerCase()) !== word;
}
function caseRank(pattern: CasePattern): number {
  return pattern === "upper" ? 2 : pattern === "capital" ? 1 : 0;
}
function rankToPattern(rank: number): CasePattern {
  return rank === 2 ? "upper" : rank === 1 ? "capital" : "lower";
}

function replaceAllWord(
  text: string,
  originalLower: string,
  baseRepl: string,
  caretOffset: number,
  primaryPattern: CasePattern,
  onlyAt?: number | null,
): { text: string; caret: number } {
  baseRepl = baseRepl.replace(/\s+$/, "");
  const verbatim = irregularCase(baseRepl);
  const corrRank = caseRank(casePattern(baseRepl));
  const primRank = caseRank(primaryPattern || "lower");
  const floor = corrRank > primRank ? corrRank : 0;
  const targetLower = originalLower.replace(/\s+$/, "");
  let result = "";
  let cursor = 0;
  let caret = caretOffset;
  for (const { word, index } of tokenize(text)) {
    const trail = (word.match(/\s+$/) || [""])[0];
    const core = trail ? word.slice(0, word.length - trail.length) : word;
    if (
      core.toLowerCase() === targetLower &&
      (onlyAt == null || index === onlyAt)
    ) {
      result += text.slice(cursor, index);
      let rep;
      if (verbatim) {
        rep = baseRepl;
      } else {
        const resolvedRank = Math.max(caseRank(casePattern(core)), floor);
        rep = applyCase(rankToPattern(resolvedRank), baseRepl);
      }
      if (caretOffset != null && index + word.length <= caretOffset) {
        caret += rep.length - core.length;
      }
      result += rep + trail;
      cursor = index + word.length;
    }
  }
  result += text.slice(cursor);
  return { text: result, caret };
}
function wordAtCaret(text: string, pos: number): Token | null {
  for (const { word, index } of tokenize(text)) {
    if (pos >= index && pos <= index + word.length) {
      return { word, start: index, end: index + word.length };
    }
  }
  return null;
}

let renderSeq = 0;
async function render() {
  const text = els.editor.value;
  const seq = ++renderSeq;

  if (els.emptyState) {
    els.emptyState.style.opacity = text.length === 0 ? "" : "0";
    document.body.classList.toggle("has-text", text.length !== 0);
    syncEmptyTips(text.length === 0);
  }

  if (!ready) {
    badTokens = [];
    renderBackdrop(text, []);
    syncScroll();
    if (panelEls.list) panelEls.list.innerHTML = "";
    if (panelEls.copy) panelEls.copy.disabled = true;
    if (panelEls.title && text.trim() !== "" && desktopMQ.matches) {
      panelEls.title.textContent = "Тооцоолж байна…";
    }
    return;
  }

  await ensureChecked(text);
  if (seq !== renderSeq) return;
  const { bad, total } = computeBad(text);
  badTokens = bad;

  renderBackdrop(text, bad);
  syncScroll();
  renderErrorPanel();
  surveyOnErrorCount(bad.length, text.trim() !== "");

  if (ready) {
    if (text.trim() === "") {
      if (baseStatus && !offlineIndicatorActive) setStatus(baseStatus);
    } else {
      if (desktopMQ.matches) {
        setStatus(
          "Үгийн тоо: " + nf(total) + ", Нийт тэмдэгт: " + nf(text.length),
          false,
        );
      } else {
        setStatus(
          "Үгийн тоо: " +
            nf(total) +
            ", <b>Алдаатай үг</b>: <b>" +
            nf(bad.length) +
            "</b>, Нийт тэмдэгт: " +
            nf(text.length),
          false,
        );
      }
    }
  }
}

function syncScroll() {
  els.backdrop.scrollTop = els.editor.scrollTop;
  els.backdrop.scrollLeft = els.editor.scrollLeft;
}

function tokenAtCaret() {
  const pos = els.editor.selectionStart;
  for (const token of badTokens) {
    if (pos >= token.start && pos <= token.end) return token;
  }
  return null;
}

let activeStart: number | null = null;
let kbAdjustTimer: ReturnType<typeof setTimeout> | null = null;
let popoverScrollTop = 0;

function hidePopover(): void {
  els.popover.hidden = true;
  activeStart = null;
  if (kbAdjustTimer) clearTimeout(kbAdjustTimer);
}

const isTouch = () => window.matchMedia("(pointer: coarse)").matches;

function bringWordIntoView() {
  if (els.popover.hidden || activeStart == null) return;
  if (!isTouch()) return;
  const mark = els.backdrop.querySelector(
    'mark[data-start="' + activeStart + '"]',
  );
  if (!mark) return;

  const vv = window.visualViewport;
  const editorRect = els.editor.getBoundingClientRect();
  const vTop = vv ? vv.offsetTop : 0;
  const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const visTop = Math.max(editorRect.top, vTop);
  const visBottom = Math.min(editorRect.bottom, vBottom);
  const visH = visBottom - visTop;
  if (visH <= 60) return;

  const markRect = mark.getBoundingClientRect();
  if (markRect.top >= visTop + 8 && markRect.bottom <= visBottom - 8) return;

  const targetY = visTop + Math.max(60, Math.min(visH * 0.3, 150));
  const maxScroll = els.editor.scrollHeight - els.editor.clientHeight;
  const next = Math.max(
    0,
    Math.min(els.editor.scrollTop + (markRect.top - targetY), maxScroll),
  );
  if (Math.abs(next - els.editor.scrollTop) > 2) {
    els.editor.scrollTop = next;
    syncScroll();
  }
}

function scrollMarkIntoView(start: number): void {
  materializeMark(start);
  const mark = els.backdrop.querySelector('mark[data-start="' + start + '"]');
  if (!mark) return;
  const editorRect = els.editor.getBoundingClientRect();
  const markRect = mark.getBoundingClientRect();
  const pad = 24;
  if (
    markRect.top >= editorRect.top + pad &&
    markRect.bottom <= editorRect.bottom - pad
  )
    return;
  const targetY =
    editorRect.top + Math.max(pad, Math.min(editorRect.height * 0.3, 160));
  const maxScroll = els.editor.scrollHeight - els.editor.clientHeight;
  const next = Math.max(
    0,
    Math.min(els.editor.scrollTop + (markRect.top - targetY), maxScroll),
  );
  els.editor.scrollTop = next;
  syncScroll();
}

function renderErrorPanel() {
  if (!panelEls.list) return;
  if (!desktopMQ.matches) return;
  const items = buildErrorList(badTokens);
  if (!items.length) {
    if (panelEls.title) panelEls.title.textContent = "Алдаагүй";
    panelEls.list.innerHTML = "";
    if (panelEls.copy) panelEls.copy.disabled = true;
    return;
  }
  if (panelEls.title)
    panelEls.title.textContent = "Нийт алдаатай үг: " + nf(badTokens.length);
  if (panelEls.copy) panelEls.copy.disabled = false;
  panelEls.list.innerHTML = items
    .map((item) => {
      const repeatCountLabel = item.count > 99 ? "99+" : item.count;
      const badge =
        item.count >= 2
          ? '<span class="ew-count">' + repeatCountLabel + "</span>"
          : "";
      return (
        '<button class="ew" type="button" data-start="' +
        item.start +
        '">' +
        escapeHtml(item.word) +
        badge +
        "</button>"
      );
    })
    .join("");
}

function scheduleKbAdjust(): void {
  if (kbAdjustTimer) clearTimeout(kbAdjustTimer);
  const delays = [100, 250, 450, 650];
  let delayIndex = 0;
  const run = () => {
    if (els.popover.hidden) return;
    bringWordIntoView();
    placePopover();
    delayIndex++;
    if (delayIndex < delays.length)
      kbAdjustTimer = setTimeout(
        run,
        delays[delayIndex] - delays[delayIndex - 1],
      );
  };
  kbAdjustTimer = setTimeout(run, delays[0]);
}

function placePopover() {
  if (els.popover.hidden || activeStart == null) return;
  const mark = els.backdrop.querySelector(
    'mark[data-start="' + activeStart + '"]',
  );
  if (!mark) {
    hidePopover();
    return;
  }
  const markRect = mark.getBoundingClientRect();
  const margin = 6;

  const vv = window.visualViewport;
  const viewTop = vv ? vv.offsetTop : 0;
  const viewLeft = vv ? vv.offsetLeft : 0;
  const viewW = vv ? vv.width : window.innerWidth;
  const viewH = vv ? vv.height : window.innerHeight;
  const viewBottom = viewTop + viewH;

  const popH = els.popover.offsetHeight;
  const popW = els.popover.offsetWidth;

  const spaceBelow = viewBottom - markRect.bottom;
  const spaceAbove = markRect.top - viewTop;

  let top;
  if (spaceBelow >= popH + margin || spaceBelow >= spaceAbove) {
    top = markRect.bottom + margin;
  } else {
    top = markRect.top - popH - margin;
  }

  top = Math.max(viewTop + margin, Math.min(top, viewBottom - popH - margin));
  const left = Math.max(
    viewLeft + margin,
    Math.min(markRect.left, viewLeft + viewW - popW - margin),
  );

  els.popover.style.top = window.scrollY + top + "px";
  els.popover.style.left = window.scrollX + left + "px";
}

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

  els.popover.innerHTML = '<div class="muted pop-empty">…</div>';
  activeStart = token.start;
  popoverScrollTop = els.editor.scrollTop;
  els.popover.hidden = false;
  bringWordIntoView();
  placePopover();
  scheduleKbAdjust();

  const suggestions = (await checker.suggest(token.word)).slice(
    0,
    desktopMQ.matches ? 15 : 8,
  );
  if (activeStart !== token.start || els.popover.hidden) return;
  const sgHtml = suggestions.length
    ? suggestions
        .map(
          (suggestion) =>
            '<button class="sg" type="button">' +
            escapeHtml(suggestion) +
            "</button>",
        )
        .join("")
    : '<div class="muted pop-empty">санал алга</div>';
  els.popover.innerHTML =
    sgHtml +
    '<button class="sg sg-ignore" type="button">Энэ үгийг алгасах</button>';
  placePopover();

  els.popover.querySelectorAll(".sg:not(.sg-ignore)").forEach((btn) => {
    btn.addEventListener("click", () =>
      applySuggestion(token, btn.textContent),
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
  if (!els.popover.hidden && activeStart === caretToken.start) return;
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

async function applySuggestion(
  token: Token,
  replacement: string,
): Promise<void> {
  pendingFix = null;
  const editorText = els.editor.value;
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
  const top = els.editor.scrollTop;
  setEditorText(nt, caret);
  els.editor.scrollTop = top;
  hidePopover();
  await render();
  saveText();
}

function isSeparatorInput(e: InputEvent): boolean {
  const it = e.inputType || "";
  if (it === "insertText")
    return e.data != null && /[\s\p{P}\p{S}]/u.test(e.data);
  if (it === "insertLineBreak" || it === "insertParagraph") return true;
  if (
    it.indexOf("insertFromPaste") === 0 ||
    it.indexOf("insertFromDrop") === 0
  )
    return true;
  return false;
}
const deferredCheck = debounce(() => recheck(), 1500);

els.editor.addEventListener("beforeinput", () => {
  if (programmaticEdit) return;
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

const CARET_KEY = "mn-spell:caret";
let storageWarned = false;
function warnStorageFailure() {
  if (storageWarned) return;
  storageWarned = true;
  setStatus(
    "Анхаар: бичвэр автоматаар хадгалагдсангүй — " +
      "хаахаасаа өмнө файл болгож хадгална уу",
  );
}
initDraftStorage({ onError: warnStorageFailure });
function saveText() {
  saveDraft(els.editor.value);
  try {
    const selectionStart = els.editor.selectionStart;
    const selectionEnd = els.editor.selectionEnd;
    if (selectionStart != null)
      localStorage.setItem(CARET_KEY, selectionStart + "," + selectionEnd);
  } catch (_) {}
}
async function loadText() {
  try {
    const draftText = await loadDraft();
    if (draftText != null) els.editor.value = draftText;
    const savedCaretRaw = localStorage.getItem(CARET_KEY);
    if (savedCaretRaw != null) {
      const parts = savedCaretRaw.split(",");
      const len = els.editor.value.length;
      const start = Math.min(Math.max(0, parseInt(parts[0], 10) || 0), len);
      const end = Math.min(
        Math.max(start, parseInt(parts[1], 10) || start),
        len,
      );
      try {
        els.editor.setSelectionRange(start, end);
      } catch (_) {}
      lastCaret = { start, end };
    }
  } catch (_) {}
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveTextSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveText, 400);
}
window.addEventListener("pagehide", () => {
  saveText();
  flushDraft();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveText();
    flushDraft();
  }
});

let programmaticEdit = false;
function setEditorText(newText: string, caret: number | null): void {
  pendingFix = null;
  const old = els.editor.value;
  els.editor.focus({ preventScroll: true });
  if (old === newText) {
    if (caret != null) {
      try {
        els.editor.setSelectionRange(caret, caret);
      } catch (_) {}
    }
    return;
  }
  let commonPrefixLen = 0;
  const minLen = Math.min(old.length, newText.length);
  while (
    commonPrefixLen < minLen &&
    old[commonPrefixLen] === newText[commonPrefixLen]
  )
    commonPrefixLen++;
  let commonSuffixLen = 0;
  while (
    commonSuffixLen < minLen - commonPrefixLen &&
    old[old.length - 1 - commonSuffixLen] ===
      newText[newText.length - 1 - commonSuffixLen]
  )
    commonSuffixLen++;
  const oldEnd = old.length - commonSuffixLen;
  const slice = newText.slice(
    commonPrefixLen,
    newText.length - commonSuffixLen,
  );
  try {
    els.editor.setSelectionRange(commonPrefixLen, oldEnd);
  } catch (_) {}
  let ok = false;
  programmaticEdit = true;
  try {
    ok =
      slice === ""
        ? document.execCommand("delete", false)
        : document.execCommand("insertText", false, slice);
  } catch (_) {
    ok = false;
  }
  programmaticEdit = false;
  if (!ok || els.editor.value !== newText) els.editor.value = newText;
  if (caret != null) {
    try {
      els.editor.setSelectionRange(caret, caret);
    } catch (_) {}
  }
}
function insertEditorText(text: string, start: number, end: number): void {
  pendingFix = null;
  els.editor.focus({ preventScroll: true });
  try {
    els.editor.setSelectionRange(start, end);
  } catch (_) {}
  let ok = false;
  programmaticEdit = true;
  try {
    ok = document.execCommand("insertText", false, text);
  } catch (_) {
    ok = false;
  }
  programmaticEdit = false;
  if (!ok) {
    const editorText = els.editor.value;
    els.editor.value =
      editorText.slice(0, start) + text + editorText.slice(end);
    const pos = start + text.length;
    try {
      els.editor.setSelectionRange(pos, pos);
    } catch (_) {}
  }
}
els.editor.addEventListener("input", (e) => {
  if (programmaticEdit) return;
  if (!(e instanceof InputEvent)) return;
  if (els.emptyState) {
    const empty = els.editor.value.length === 0;
    els.emptyState.style.opacity = empty ? "" : "0";
    document.body.classList.toggle("has-text", !empty);
    syncEmptyTips(empty);
  }
  saveTextSoon();
  if (isSeparatorInput(e)) recheck();
  else deferredCheck();
});
const clearBtnEl = document.querySelector("#clearBtn");
if (clearBtnEl) {
  clearBtnEl.addEventListener("click", () => rotateEmptyTips());
}
let lastCaret: { start: number; end: number } | null = null;
els.editor.addEventListener("blur", () => {
  pendingFix = null;
  lastCaret = {
    start: els.editor.selectionStart,
    end: els.editor.selectionEnd,
  };
});
let marksRefreshQueued = false;
els.editor.addEventListener("scroll", () => {
  syncScroll();
  if (!marksRefreshQueued) {
    marksRefreshQueued = true;
    requestAnimationFrame(() => {
      marksRefreshQueued = false;
      refreshBackdropMarks();
    });
  }
  if (
    !els.popover.hidden &&
    Math.abs(els.editor.scrollTop - popoverScrollTop) > 20
  ) {
    hidePopover();
  } else {
    placePopover();
  }
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
    suggestAtCaret();
  }
});

let suppressNextClick = false;

function markAtPoint(x: number, y: number): HTMLElement | null {
  const marks =
    els.backdrop.querySelectorAll<HTMLElement>("mark[data-start]");
  for (const mark of marks) {
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
document.addEventListener("mousedown", (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target?.closest("#popover") && target !== els.editor) hidePopover();
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    bringWordIntoView();
    placePopover();
  });
  window.visualViewport.addEventListener("scroll", placePopover);
}
window.addEventListener("resize", placePopover);

initAppearance();
function flash(sel: string, msg: string): void {
  const flashBtn = document.querySelector<HTMLElement>(sel);
  if (!flashBtn) return;
  const old = flashBtn.dataset.label || flashBtn.textContent || "";
  flashBtn.dataset.label = old;
  flashBtn.textContent = msg;
  setTimeout(() => {
    flashBtn.textContent = flashBtn.dataset.label ?? "";
  }, 1100);
}

function copyText(str: string): Promise<void> {
  if (
    navigator.clipboard &&
    navigator.clipboard.writeText &&
    window.isSecureContext
  ) {
    return navigator.clipboard.writeText(str);
  }
  return new Promise<void>((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = str;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, str.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("exec"));
    } catch (e) {
      reject(e);
    }
  });
}

const verEl = document.querySelector<HTMLElement>("#appVersion");
if (verEl) {
  const av = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";
  const hv =
    typeof __HUNSPELL_VERSION__ !== "undefined" ? __HUNSPELL_VERSION__ : "";
  verEl.dataset.short = av ? "v" + av : "";
  verEl.dataset.full = (av ? "v" + av : "") + (hv ? " · hunspell " + hv : "");
  verEl.textContent = verEl.dataset.short;
  verEl.style.cursor = "pointer";
  verEl.addEventListener("click", () => {
    const expanded = verEl.textContent !== verEl.dataset.short;
    verEl.textContent =
      (expanded ? verEl.dataset.short : verEl.dataset.full) ?? "";
  });
}
initFileIO({
  els,
  flash,
  setStatus,
  setEditorText,
  hidePopover,
  render,
  saveText,
});

(function setupShortcuts() {
  const isDesktop =
    window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (!isDesktop) return;

  const uaData = navigator.userAgentData;
  const uaPlat = (uaData && uaData.platform) || "";
  const isMac =
    /mac/i.test(uaPlat) ||
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "") ||
    (/Mac OS X/i.test(navigator.userAgent || "") &&
      !/Windows|Android/i.test(navigator.userAgent || ""));
  const mod = isMac ? "⌘" : "Ctrl+";
  const shiftSym = isMac ? "⇧" : "Shift+";

  [
    ["#clearBtn", mod + shiftSym + "⌫"],
    ["#pasteBtn", mod + "V"],
    ["#copyBtn", mod + "C"],
    ["#copyErrorsBtn", mod + "E"],
    ["#openBtn", mod + "O"],
    ["#saveBtn", mod + "S"],
    ["#fontDecBtn", mod + "-"],
    ["#fontIncBtn", mod + "+"],
    ["#fontResetBtn", mod + "0"],
    ["#themeBtn", mod + shiftSym + "D"],
  ].forEach(([sel, combo]) => {
    const btn = document.querySelector(sel);
    if (!btn) return;
    const base = btn.getAttribute("title") || "";
    btn.setAttribute("title", base ? base + " · " + combo : combo);
  });

  function trigger(sel: string, doClick = true): void {
    const btn = document.querySelector<HTMLButtonElement>(sel);
    if (!btn || btn.disabled) return;
    if (doClick) btn.click();
    btn.classList.add("kbd-active");
    const kbdBtn = btn as HTMLButtonElement & {
      _kbdTimer?: ReturnType<typeof setTimeout>;
    };
    if (kbdBtn._kbdTimer) clearTimeout(kbdBtn._kbdTimer);
    kbdBtn._kbdTimer = setTimeout(
      () => btn.classList.remove("kbd-active"),
      260,
    );
  }

  window.addEventListener("keydown", (e) => {
    const ae = document.activeElement;
    if (
      ae &&
      ae !== els.editor &&
      (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")
    ) {
      return;
    }
    const hasPrimaryModifier = isMac
      ? e.metaKey && !e.ctrlKey
      : e.ctrlKey && !e.metaKey;
    if (!hasPrimaryModifier || e.altKey) return;
    const key = e.key;
    const lowerKey = key.toLowerCase();

    if (e.shiftKey) {
      if (lowerKey === "d") {
        e.preventDefault();
        trigger("#themeBtn");
        return;
      }
      if (key === "Backspace") {
        e.preventDefault();
        trigger("#clearBtn");
        return;
      }
      if (key === "+") {
        e.preventDefault();
        trigger("#fontIncBtn");
        return;
      }
      return;
    }

    if (key === "-" || key === "Subtract") {
      e.preventDefault();
      trigger("#fontDecBtn");
      return;
    }
    if (key === "+" || key === "=" || key === "Add") {
      e.preventDefault();
      trigger("#fontIncBtn");
      return;
    }
    if (key === "0" || key === "Numpad0") {
      e.preventDefault();
      trigger("#fontResetBtn");
      return;
    }

    if (lowerKey === "s") {
      e.preventDefault();
      trigger("#saveBtn");
    } else if (lowerKey === "o") {
      if (!window.showOpenFilePicker) {
        const openFileEl =
          document.querySelector<HTMLInputElement>("#openFile");
        if (openFileEl) openFileEl.click();
        e.preventDefault();
        trigger("#openBtn", false);
      } else {
        e.preventDefault();
        trigger("#openBtn");
      }
    } else if (lowerKey === "e") {
      e.preventDefault();
      trigger("#copyErrorsBtn");
    } else if (lowerKey === "v") {
      if (document.activeElement !== els.editor) {
        els.editor.focus({ preventScroll: true });
        if (lastCaret) {
          try {
            els.editor.setSelectionRange(
              lastCaret.start,
              lastCaret.end,
              "forward",
            );
          } catch (_) {}
        }
      }
      trigger("#pasteBtn", false);
    } else if (lowerKey === "c") {
      const pageSel = window.getSelection
        ? (window.getSelection()?.toString() ?? "")
        : "";
      const editorFocused = document.activeElement === els.editor;
      const editorHasSelection =
        editorFocused &&
        els.editor.selectionStart !== els.editor.selectionEnd;
      if (!pageSel && !editorHasSelection) {
        e.preventDefault();
        trigger("#copyBtn");
      }
    }
  });
})();

async function requestDurableStorage() {
  try {
    if (
      navigator.storage &&
      typeof navigator.storage.persist === "function"
    ) {
      const already = navigator.storage.persisted
        ? await navigator.storage.persisted()
        : false;
      if (!already) await navigator.storage.persist();
    }
  } catch (_) {
    /* persist дэмжигдээгүй — алгасна */
  }
}

function offlineCapable() {
  return "serviceWorker" in navigator && "caches" in window;
}

async function isOfflineReady() {
  try {
    const base = import.meta.env.BASE_URL;
    const resolveAppUrl = (path: string): string =>
      new URL(base + path, location.href).href;
    const opt = { ignoreSearch: true };
    // SW бүртгэгдсэн эсэхийг шалгана (controller анх ачаалалд хожуу тогтдог).
    const reg =
      navigator.serviceWorker &&
      (await navigator.serviceWorker.getRegistration());
    if (!reg || !reg.active) return false;
    const shell =
      (await caches.match(resolveAppUrl("index.html"), opt)) ||
      (await caches.match(resolveAppUrl(""), opt));
    if (!shell) return false;
    const manRes = await caches.match(
      resolveAppUrl("dict/dict-manifest.json"),
      opt,
    );
    if (!manRes) return false;
    const man = (await manRes.clone().json()) as {
      dicts?: { id: string; dic: string }[];
    };
    const mn = (man.dicts || []).find((dict) => dict.id === "mn_MN");
    if (!mn) return false;
    return !!(await caches.match(resolveAppUrl("dict/" + mn.dic), opt));
  } catch (_) {
    return false;
  }
}

function dictStatusMessage(
  loaded: string[],
  failed: { id: string; error: string }[] | null,
  fallbackReason: string | null,
): string {
  const seenName = new Set<string>();
  const simple: string[] = [];
  for (const id of loaded) {
    const name = id.startsWith("mn")
      ? "монгол"
      : id.startsWith("en")
        ? "англи"
        : labelOf(id);
    if (!seenName.has(name)) {
      seenName.add(name);
      simple.push(name);
    }
  }
  let msg = "Ашиглаж буй толь: <b>" + simple.join(", ") + "</b>";
  if (failed && failed.length) {
    msg +=
      ' <span class="muted">(олдсонгүй: ' +
      failed.map((fail) => escapeHtml(String(fail.id))).join(", ") +
      ")</span>";
  }
  if (fallbackReason) {
    msg +=
      '<br><span class="muted">hunspell-wasm амжилтгүй (nspell ашиглаж байна): ' +
      escapeHtml(fallbackReason) +
      "</span>";
  }
  return msg;
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
  checker.onFatal = (reason) => {
    setStatus(
      "Алдаа шалгагч зогслоо: " +
        escapeHtml(String(reason)) +
        " — хуудсыг дахин ачаална уу",
    );
  };
  setStatus("Hunspell ачаалж байна…");
  await loadText();
  render();
  document.documentElement.classList.remove("booting");
  els.editor.focus();
  try {
    const { loaded, failed, fallbackReason, mnVersion } = await checker.init(
      import.meta.env.BASE_URL,
    );
    ready = true;
    if (mnVersion && verEl) verEl.dataset.full += " · mn_MN " + mnVersion;
    cache.clear();
    await render();
    if (loaded.length) {
      baseStatus = dictStatusMessage(loaded, failed, fallbackReason);
      runOfflineReadyIndicator();
    } else {
      setStatus(
        "Нэг ч толь алга — <code>public/dict/</code> дотор .aff/.dic хийнэ үү.",
      );
    }

    checker.whenComplete().then((done) => {
      cache.clear();
      baseStatus = dictStatusMessage(
        checker.loadedIds,
        [...(failed || []), ...done.failed],
        fallbackReason,
      );
      if (els.editor.value.trim() === "" && !offlineIndicatorActive)
        setStatus(baseStatus, false);
      render();
    });
  } catch (e) {
    setStatus(
      "Ачаалахад алдаа гарлаа: " +
        escapeHtml(e instanceof Error ? e.message : String(e)),
    );
  }
}

if (panelEls.list) {
  const ancestorOf = (node: HTMLElement, other: HTMLElement): HTMLElement => {
    for (
      let current: HTMLElement | null = node;
      current;
      current = current.parentElement
    )
      if (current.contains(other)) return current;
    return node;
  };
  const panel = panelEls.title
    ? ancestorOf(panelEls.list, panelEls.title)
    : panelEls.list;

  panel.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest("#copyErrorsBtn")) return;
    const btn = target.closest(".ew");
    if (!btn) {
      els.editor.focus({ preventScroll: true });
      if (lastCaret) {
        try {
          els.editor.setSelectionRange(
            lastCaret.start,
            lastCaret.end,
            "forward",
          );
        } catch (_) {}
      }
      return;
    }
    const start = Number(btn.getAttribute("data-start"));
    const clickedToken = badTokens.find((token) => token.start === start);
    if (!clickedToken) return;
    pendingFix = null;
    els.editor.focus({ preventScroll: true });
    try {
      els.editor.setSelectionRange(
        clickedToken.start,
        clickedToken.end,
        "forward",
      );
    } catch (_) {}
    lastCaret = { start: clickedToken.end, end: clickedToken.end };
    scrollMarkIntoView(clickedToken.start);
    showPopoverFor(clickedToken);
  });
}

if (panelEls.copy) {
  const copyIcon = panelEls.copy.innerHTML;
  const checkIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  const copyBtn = panelEls.copy;
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const words = buildErrorList(badTokens).map((token) => token.word);
      if (!words.length) return;
      try {
        await copyText(words.join("\n"));
        copyBtn.classList.add("copied");
        copyBtn.innerHTML = checkIcon;
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          copyBtn.classList.remove("copied");
          copyBtn.innerHTML = copyIcon;
        }, 1100);
      } catch (_) {}
    });
  }
}

desktopMQ.addEventListener("change", () => {
  hidePopover();
  renderErrorPanel();
});

boot();

setTimeout(() => {
  document.documentElement.classList.remove("booting");
}, 2000);

initToolbar({
  els,
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

initSuggest({
  buildErrorList,
  getBadTokens: () => badTokens,
  isDashSuffix: (token) => isDashSuffix(els.editor.value, token),
  copyText,
});

initIgnoreList({
  onChange: () => render(),
});

initSurvey();
