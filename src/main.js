import "./style.css";
import { MultiSpellChecker, tokenize, DICTIONARIES } from "./spellchecker.js";
import { initFileIO } from "./fileio.js";
import { initToolbar } from "./toolbar.js";
import { initAppearance } from "./appearance.js";
import { escapeHtml } from "./htmlutil.js";
import {
  initDraftStorage,
  saveDraft,
  flushDraft,
  loadDraft,
} from "./storage.js";
import {
  initBackdrop,
  renderBackdrop,
  refreshBackdropMarks,
  materializeMark,
} from "./backdrop.js";

document.body.classList.add("ready");

const els = {
  status: document.querySelector("#statusText"),
  editor: document.querySelector("#editor"),
  backdrop: document.querySelector("#backdrop"),
  popover: document.querySelector("#popover"),
  emptyState: document.querySelector("#emptyState"),
};

const panelEls = {
  list: document.querySelector("#errorList"),
  copy: document.querySelector("#copyErrorsBtn"),
  title: document.querySelector("#errorPanelTitle"),
};
const desktopMQ = window.matchMedia("(min-width: 1024px)");
initBackdrop(els.backdrop);

const checker = new MultiSpellChecker();
const cache = new Map();
let ready = false;
let badTokens = [];
let baseStatus = "";
let offlineIndicatorActive = false;
let pendingFix = null;

const labelOf = (id) =>
  (DICTIONARIES.find((d) => d.id === id) || {}).label || id;
const setStatus = (html, animate = true) => {
  els.status.innerHTML = html;
  if (!animate) return;
  els.status.classList.remove("status-reveal");
  void els.status.offsetWidth;
  els.status.classList.add("status-reveal");
};
function isCorrect(word) {
  return cache.has(word) ? cache.get(word) : true;
}
function checkable(word) {
  return word.length >= 2 && !/^\p{N}+(-|$)/u.test(word);
}
async function ensureChecked(text) {
  const need = new Set();
  for (const { word } of tokenize(text)) {
    if (checkable(word) && !cache.has(word)) need.add(word);
  }
  if (!need.size) return;
  const results = await checker.checkWords([...need]);
  for (const w in results) cache.set(w, results[w]);
}
async function correctNow(word) {
  if (cache.has(word)) return cache.get(word);
  const r = await checker.checkWords([word]);
  cache.set(word, r[word]);
  return r[word];
}
function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function computeBad(text) {
  const bad = [];
  let total = 0;
  for (const { word, index } of tokenize(text)) {
    total++;
    if (!checkable(word) || isCorrect(word)) continue;
    bad.push({ word, start: index, end: index + word.length });
  }
  return { bad, total };
}

function casePattern(src) {
  if (!src) return "lower";
  let upper = 0,
    lower = 0,
    firstCased = null;
  for (const ch of src) {
    const u = ch.toUpperCase(),
      l = ch.toLowerCase();
    if (u === l) continue;
    if (firstCased === null) firstCased = ch;
    if (ch === u) upper++;
    else lower++;
  }
  if (upper === 0) return "lower";
  if (lower === 0) return "upper";
  if (upper > lower) return "upper";
  if (firstCased && firstCased === firstCased.toUpperCase()) return "capital";
  return "lower";
}
function applyCase(pattern, word) {
  const lo = word.toLowerCase();
  if (pattern === "upper") return word.toUpperCase();
  if (pattern === "capital") return lo.charAt(0).toUpperCase() + lo.slice(1);
  return lo;
}
function irregularCase(s) {
  return applyCase(casePattern(s), s.toLowerCase()) !== s;
}
function caseRank(pattern) {
  return pattern === "upper" ? 2 : pattern === "capital" ? 1 : 0;
}
function rankToPattern(rank) {
  return rank === 2 ? "upper" : rank === 1 ? "capital" : "lower";
}

function replaceAllWord(
  text,
  originalLower,
  baseRepl,
  caretOffset,
  primaryPattern,
  onlyAt,
) {
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
        const r = Math.max(caseRank(casePattern(core)), floor);
        rep = applyCase(rankToPattern(r), baseRepl);
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
const DASHES = /[-\u2013\u2014]/;
function isDashSuffix(text, t) {
  if (DASHES.test(t.word.slice(1))) return false;
  return (
    DASHES.test(t.word.charAt(0)) || DASHES.test(text.charAt(t.start - 1))
  );
}
function wordAtCaret(text, pos) {
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

  if (ready) {
    if (text.trim() === "") {
      if (baseStatus && !offlineIndicatorActive) setStatus(baseStatus);
    } else {
      if (desktopMQ.matches) {
        setStatus(
          "Үгийн тоо: " + total + ", Нийт тэмдэгт: " + text.length,
          false,
        );
      } else {
        setStatus(
          "Үгийн тоо: " +
            total +
            ", <b>Алдаатай үг</b>: <b>" +
            bad.length +
            "</b>, Нийт тэмдэгт: " +
            text.length,
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
  for (const t of badTokens) {
    if (pos >= t.start && pos <= t.end) return t;
  }
  return null;
}

let activeStart = null;
let kbAdjustTimer = null;
let popoverScrollTop = 0;

function hidePopover() {
  els.popover.hidden = true;
  activeStart = null;
  clearTimeout(kbAdjustTimer);
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

  const r = mark.getBoundingClientRect();
  if (r.top >= visTop + 8 && r.bottom <= visBottom - 8) return;

  const targetY = visTop + Math.max(60, Math.min(visH * 0.3, 150));
  const maxScroll = els.editor.scrollHeight - els.editor.clientHeight;
  const next = Math.max(
    0,
    Math.min(els.editor.scrollTop + (r.top - targetY), maxScroll),
  );
  if (Math.abs(next - els.editor.scrollTop) > 2) {
    els.editor.scrollTop = next;
    syncScroll();
  }
}

function scrollMarkIntoView(start) {
  materializeMark(start);
  const mark = els.backdrop.querySelector('mark[data-start="' + start + '"]');
  if (!mark) return;
  const er = els.editor.getBoundingClientRect();
  const r = mark.getBoundingClientRect();
  const pad = 24;
  if (r.top >= er.top + pad && r.bottom <= er.bottom - pad) return;
  const targetY = er.top + Math.max(pad, Math.min(er.height * 0.3, 160));
  const maxScroll = els.editor.scrollHeight - els.editor.clientHeight;
  const next = Math.max(
    0,
    Math.min(els.editor.scrollTop + (r.top - targetY), maxScroll),
  );
  els.editor.scrollTop = next;
  syncScroll();
}

function buildErrorList(tokens) {
  const seen = new Map();
  for (const t of tokens) {
    const key = t.word.toLowerCase();
    const e = seen.get(key);
    if (e) e.count++;
    else seen.set(key, { word: t.word, start: t.start, count: 1 });
  }
  return [...seen.values()];
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
    panelEls.title.textContent = "Нийт алдаатай үг: " + badTokens.length;
  if (panelEls.copy) panelEls.copy.disabled = false;
  panelEls.list.innerHTML = items
    .map((t) => {
      const n = t.count > 99 ? "99+" : t.count;
      const badge =
        t.count >= 2 ? '<span class="ew-count">' + n + "</span>" : "";
      return (
        '<button class="ew" type="button" data-start="' +
        t.start +
        '">' +
        escapeHtml(t.word) +
        badge +
        "</button>"
      );
    })
    .join("");
}

function scheduleKbAdjust() {
  clearTimeout(kbAdjustTimer);
  const delays = [100, 250, 450, 650];
  let i = 0;
  const run = () => {
    if (els.popover.hidden) return;
    bringWordIntoView();
    placePopover();
    i++;
    if (i < delays.length)
      kbAdjustTimer = setTimeout(run, delays[i] - delays[i - 1]);
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
  const r = mark.getBoundingClientRect();
  const margin = 6;

  const vv = window.visualViewport;
  const viewTop = vv ? vv.offsetTop : 0;
  const viewLeft = vv ? vv.offsetLeft : 0;
  const viewW = vv ? vv.width : window.innerWidth;
  const viewH = vv ? vv.height : window.innerHeight;
  const viewBottom = viewTop + viewH;

  const popH = els.popover.offsetHeight;
  const popW = els.popover.offsetWidth;

  const spaceBelow = viewBottom - r.bottom;
  const spaceAbove = r.top - viewTop;

  let top;
  if (spaceBelow >= popH + margin || spaceBelow >= spaceAbove) {
    top = r.bottom + margin;
  } else {
    top = r.top - popH - margin;
  }

  top = Math.max(viewTop + margin, Math.min(top, viewBottom - popH - margin));
  const left = Math.max(
    viewLeft + margin,
    Math.min(r.left, viewLeft + viewW - popW - margin),
  );

  els.popover.style.top = window.scrollY + top + "px";
  els.popover.style.left = window.scrollX + left + "px";
}

async function showPopoverFor(t) {
  materializeMark(t.start);
  let mark = els.backdrop.querySelector('mark[data-start="' + t.start + '"]');
  if (!mark) {
    await render();
    materializeMark(t.start);
    mark = els.backdrop.querySelector('mark[data-start="' + t.start + '"]');
  }
  if (!mark) {
    hidePopover();
    return;
  }

  els.popover.innerHTML = '<div class="muted pop-empty">…</div>';
  activeStart = t.start;
  popoverScrollTop = els.editor.scrollTop;
  els.popover.hidden = false;
  bringWordIntoView();
  placePopover();
  scheduleKbAdjust();

  const suggestions = (await checker.suggest(t.word)).slice(
    0,
    desktopMQ.matches ? 15 : 8,
  );
  if (activeStart !== t.start || els.popover.hidden) return;
  els.popover.innerHTML = suggestions.length
    ? suggestions
        .map(
          (s) =>
            '<button class="sg" type="button">' + escapeHtml(s) + "</button>",
        )
        .join("")
    : '<div class="muted pop-empty">санал алга</div>';
  placePopover();

  els.popover.querySelectorAll(".sg").forEach((btn) => {
    btn.addEventListener("click", () => applySuggestion(t, btn.textContent));
  });
}

function suggestAtCaret() {
  const t = tokenAtCaret();
  if (!t) {
    hidePopover();
    return;
  }
  if (!els.popover.hidden && activeStart === t.start) return;
  showPopoverFor(t);
}

async function maybePropagateManual() {
  if (!pendingFix) return;
  if (pendingFix.dashSuffix) {
    pendingFix = null;
    return;
  }
  const text = els.editor.value;
  const pos = els.editor.selectionStart;
  let w = null;
  if (pos > 0 && /[\s\p{P}\p{S}]/u.test(text.charAt(pos - 1))) {
    const prev = wordAtCaret(text, pos - 1);
    if (prev && prev.end === pos - 1) w = prev;
  }
  if (!w) w = wordAtCaret(text, pos);
  if (!w) return;
  if (w.start !== pendingFix.start) {
    pendingFix = null;
    return;
  }
  const lower = w.word.toLowerCase();
  if (lower === pendingFix.original) return;
  if (pendingFix.original.length - w.word.length > 2) return;
  if (!(await correctNow(w.word))) return;
  const original = pendingFix.original;
  const primaryPattern = pendingFix.originalPattern || "lower";
  pendingFix = null;
  const { text: nt, caret } = replaceAllWord(
    text,
    original,
    w.word,
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

async function applySuggestion(t, replacement) {
  pendingFix = null;
  const v = els.editor.value;
  const onlyAt = isDashSuffix(v, t) ? t.start : null;
  const { text: nt, caret } = replaceAllWord(
    v,
    t.word.toLowerCase(),
    replacement,
    t.end,
    casePattern(t.word),
    onlyAt,
  );
  if (nt === v) {
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

function isSeparatorInput(e) {
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
  const t = tokenAtCaret();
  pendingFix = t
    ? {
        original: t.word.toLowerCase(),
        originalPattern: casePattern(t.word),
        dashSuffix: isDashSuffix(els.editor.value, t),
        start: t.start,
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
    const s = els.editor.selectionStart;
    const e = els.editor.selectionEnd;
    if (s != null) localStorage.setItem(CARET_KEY, s + "," + e);
  } catch (_) {}
}
async function loadText() {
  try {
    const t = await loadDraft();
    if (t != null) els.editor.value = t;
    const c = localStorage.getItem(CARET_KEY);
    if (c != null) {
      const parts = c.split(",");
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
let saveTimer = null;
function saveTextSoon() {
  clearTimeout(saveTimer);
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
function setEditorText(newText, caret) {
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
  let p = 0;
  const minLen = Math.min(old.length, newText.length);
  while (p < minLen && old[p] === newText[p]) p++;
  let s = 0;
  while (
    s < minLen - p &&
    old[old.length - 1 - s] === newText[newText.length - 1 - s]
  )
    s++;
  const oldEnd = old.length - s;
  const slice = newText.slice(p, newText.length - s);
  try {
    els.editor.setSelectionRange(p, oldEnd);
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
function insertEditorText(text, start, end) {
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
    const v = els.editor.value;
    els.editor.value = v.slice(0, start) + text + v.slice(end);
    const pos = start + text.length;
    try {
      els.editor.setSelectionRange(pos, pos);
    } catch (_) {}
  }
}
els.editor.addEventListener("input", (e) => {
  if (programmaticEdit) return;
  if (els.emptyState) {
    const empty = els.editor.value.length === 0;
    els.emptyState.style.opacity = empty ? "" : "0";
    document.body.classList.toggle("has-text", !empty);
  }
  saveTextSoon();
  if (isSeparatorInput(e)) recheck();
  else deferredCheck();
});
let lastCaret = null;
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

function markAtPoint(x, y) {
  const marks = els.backdrop.querySelectorAll("mark[data-start]");
  for (const m of marks) {
    const rects = m.getClientRects();
    for (const r of rects) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
        return m;
    }
  }
  return null;
}
function tokenForMark(mark) {
  const start = Number(mark.getAttribute("data-start"));
  for (const t of badTokens) if (t.start === start) return t;
  return null;
}
els.editor.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const mark = markAtPoint(e.clientX, e.clientY);
  if (!mark) return;
  const t = tokenForMark(mark);
  if (!t) return;
  e.preventDefault();
  suppressNextClick = true;
  showPopoverFor(t);
});

els.editor.addEventListener("contextmenu", (e) => {
  const t = tokenAtCaret();
  if (t) {
    e.preventDefault();
    showPopoverFor(t);
  }
});
document.addEventListener("mousedown", (e) => {
  if (!e.target.closest("#popover") && e.target !== els.editor) hidePopover();
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
function flash(sel, msg) {
  const b = document.querySelector(sel);
  if (!b) return;
  const old = b.dataset.label || b.textContent;
  b.dataset.label = old;
  b.textContent = msg;
  setTimeout(() => {
    b.textContent = b.dataset.label;
  }, 1100);
}

function copyText(str) {
  if (
    navigator.clipboard &&
    navigator.clipboard.writeText &&
    window.isSecureContext
  ) {
    return navigator.clipboard.writeText(str);
  }
  return new Promise((resolve, reject) => {
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

const verEl = document.querySelector("#appVersion");
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
    verEl.textContent = expanded ? verEl.dataset.short : verEl.dataset.full;
  });
}
initFileIO({ els, flash, setStatus, setEditorText, hidePopover, render, saveText });

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
    const b = document.querySelector(sel);
    if (!b) return;
    const base = b.getAttribute("title") || "";
    b.setAttribute("title", base ? base + " · " + combo : combo);
  });

  function trigger(sel, doClick = true) {
    const b = document.querySelector(sel);
    if (!b || b.disabled) return;
    if (doClick) b.click();
    b.classList.add("kbd-active");
    clearTimeout(b._kbdTimer);
    b._kbdTimer = setTimeout(() => b.classList.remove("kbd-active"), 260);
  }

  window.addEventListener("keydown", (e) => {
    const m = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!m || e.altKey) return;
    const k = e.key;
    const kl = k.toLowerCase();

    if (e.shiftKey) {
      if (kl === "d") {
        e.preventDefault();
        trigger("#themeBtn");
        return;
      }
      if (k === "Backspace") {
        e.preventDefault();
        trigger("#clearBtn");
        return;
      }
      if (k === "+") {
        e.preventDefault();
        trigger("#fontIncBtn");
        return;
      }
      return;
    }

    if (k === "-" || k === "Subtract") {
      e.preventDefault();
      trigger("#fontDecBtn");
      return;
    }
    if (k === "+" || k === "=" || k === "Add") {
      e.preventDefault();
      trigger("#fontIncBtn");
      return;
    }
    if (k === "0" || k === "Numpad0") {
      e.preventDefault();
      trigger("#fontResetBtn");
      return;
    }

    if (kl === "s") {
      e.preventDefault();
      trigger("#saveBtn");
    } else if (kl === "o") {
      if (!window.showOpenFilePicker) {
        const openFileEl = document.querySelector("#openFile");
        if (openFileEl) openFileEl.click();
        e.preventDefault();
        trigger("#openBtn", false);
      } else {
        e.preventDefault();
        trigger("#openBtn");
      }
    } else if (kl === "e") {
      e.preventDefault();
      trigger("#copyErrorsBtn");
    } else if (kl === "v") {
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
    } else if (kl === "c") {
      const pageSel = window.getSelection
        ? window.getSelection().toString()
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
    const u = (p) => new URL(base + p, location).href;
    const opt = { ignoreSearch: true };
    // SW бүртгэгдсэн эсэхийг шалгана (controller анх ачаалалд хожуу тогтдог).
    const reg =
      navigator.serviceWorker &&
      (await navigator.serviceWorker.getRegistration());
    if (!reg || !reg.active) return false;
    const shell =
      (await caches.match(u("index.html"), opt)) ||
      (await caches.match(u(""), opt));
    if (!shell) return false;
    const manRes = await caches.match(u("dict/dict-manifest.json"), opt);
    if (!manRes) return false;
    const man = await manRes.clone().json();
    const mn = (man.dicts || []).find((d) => d.id === "mn_MN");
    if (!mn) return false;
    return !!(await caches.match(u("dict/" + mn.dic), opt));
  } catch (_) {
    return false;
  }
}

function dictStatusMessage(loaded, failed, fallbackReason) {
  const seenName = new Set();
  const simple = [];
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
      failed.map((f) => escapeHtml(String(f.id))).join(", ") +
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
  const transient = (msg, animate = true) => {
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
    await new Promise((r) => setTimeout(r, 700));
    isReady = await isOfflineReady();
  }

  if (isReady) {
    transient("Офлайн горимд ажиллахад бэлэн", false);
    await new Promise((r) => setTimeout(r, 1500));
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
    render();
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
        escapeHtml(e && e.message ? e.message : String(e)),
    );
  }
}

if (panelEls.list) {
  const ancestorOf = (a, b) => {
    for (let n = a; n; n = n.parentElement) if (n.contains(b)) return n;
    return a;
  };
  const panel = panelEls.title
    ? ancestorOf(panelEls.list, panelEls.title)
    : panelEls.list;

  panel.addEventListener("click", (e) => {
    if (e.target.closest("#copyErrorsBtn")) return;
    const btn = e.target.closest(".ew");
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
    const t = badTokens.find((x) => x.start === start);
    if (!t) return;
    pendingFix = null;
    els.editor.focus({ preventScroll: true });
    try {
      els.editor.setSelectionRange(t.start, t.end, "forward");
    } catch (_) {}
    lastCaret = { start: t.end, end: t.end };
    scrollMarkIntoView(t.start);
    showPopoverFor(t);
  });
}

if (panelEls.copy) {
  const copyIcon = panelEls.copy.innerHTML;
  const checkIcon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  let copyTimer = null;
  panelEls.copy.addEventListener("click", async () => {
    const words = buildErrorList(badTokens).map((t) => t.word);
    if (!words.length) return;
    try {
      await copyText(words.join("\n"));
      panelEls.copy.classList.add("copied");
      panelEls.copy.innerHTML = checkIcon;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        panelEls.copy.classList.remove("copied");
        panelEls.copy.innerHTML = copyIcon;
      }, 1100);
    } catch (_) {}
  });
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
