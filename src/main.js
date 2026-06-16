import './style.css';
import { MultiSpellChecker, tokenize, DICTIONARIES, isHyphenAttachedSuffix } from './spellchecker.js';

document.body.classList.add('ready');

const els = {
  status: document.querySelector('#statusText'),
  editor: document.querySelector('#editor'),
  backdrop: document.querySelector('#backdrop'),
  popover: document.querySelector('#popover'),
  emptyState: document.querySelector('#emptyState'),
};

const checker = new MultiSpellChecker();
const cache = new Map();
let ready = false;
let badTokens = [];
let baseStatus = '';
let pendingFix = null;

const labelOf = (id) => (DICTIONARIES.find((d) => d.id === id) || {}).label || id;
const setStatus = (html) => (els.status.innerHTML = html);
const escapeHtml = (s) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function isCorrect(word) {
  if (cache.has(word)) return cache.get(word);
  const ok = checker.isCorrect(word);
  cache.set(word, ok);
  return ok;
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
    if (
      word.length < 2 ||
      /^\d+$/.test(word) ||
      isHyphenAttachedSuffix(word) ||
      isCorrect(word)
    )
      continue;
    bad.push({ word, start: index, end: index + word.length });
  }
  return { bad, total };
}

function casePattern(src) {
  if (!src) return 'lower';
  const up = src.toUpperCase();
  const lo = src.toLowerCase();
  if (src === up && src !== lo) return 'upper';
  if (src[0] === up[0] && src[0] !== lo[0]) {
    const rest = src.slice(1);
    if (rest === rest.toLowerCase()) return 'capital';
  }
  return 'lower';
}
function applyCase(pattern, word) {
  const lo = word.toLowerCase();
  if (pattern === 'upper') return word.toUpperCase();
  if (pattern === 'capital') return lo.charAt(0).toUpperCase() + lo.slice(1);
  return lo;
}

function replaceAllWord(text, originalLower, baseRepl, caretOffset) {
  let result = '';
  let cursor = 0;
  let caret = caretOffset;
  for (const { word, index } of tokenize(text)) {
    if (word.toLowerCase() === originalLower) {
      result += text.slice(cursor, index);
      const rep = applyCase(casePattern(word), baseRepl);
      if (caretOffset != null && index + word.length <= caretOffset) {
        caret += rep.length - word.length;
      }
      result += rep;
      cursor = index + word.length;
    }
  }
  result += text.slice(cursor);
  return { text: result, caret };
}
function wordAtCaret(text, pos) {
  for (const { word, index } of tokenize(text)) {
    if (pos >= index && pos <= index + word.length) {
      return { word, start: index, end: index + word.length };
    }
  }
  return null;
}

function updateEmptyState() {
  if (els.emptyState) els.emptyState.style.display = els.editor.value.length ? 'none' : '';
}

function render() {
  const text = els.editor.value;
  updateEmptyState();
  const { bad, total } = computeBad(text);
  badTokens = bad;

  let html = '';
  let cursor = 0;
  for (const t of bad) {
    html += escapeHtml(text.slice(cursor, t.start));
    html += '<mark data-start="' + t.start + '">' + escapeHtml(text.slice(t.start, t.end)) + '</mark>';
    cursor = t.end;
  }
  html += escapeHtml(text.slice(cursor)) + '\n';
  els.backdrop.innerHTML = html;
  syncScroll();

  if (ready) {
    if (text.trim() === '') {
      setStatus(baseStatus);
    } else {
      setStatus('Нийт үгийн тоо: <b>' + total + '</b>, алдаатай үгийн тоо: <b>' + bad.length + '</b>');
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

function hidePopover() {
  els.popover.hidden = true;
  activeStart = null;
  clearTimeout(kbAdjustTimer);
}

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

// Хүрэлцэхүйц төхөөрөмж дээр алдаатай үг доод хэсэгт (гарны ард) үлдэхээс
// сэргийлж, бичвэрийг дээш гүйлгэн үгийг харагдах хэсгийн дээд хэсэгт авчирна.
// scroll-ыг үнэмлэхүй (absolute) тооцдог тул дахин дуудахад тогтворждог.
function bringWordIntoView() {
  if (els.popover.hidden || activeStart == null) return;
  if (!isTouch()) return; // зөвхөн гар утас/таблет дээр
  const mark = els.backdrop.querySelector('mark[data-start="' + activeStart + '"]');
  if (!mark) return;

  const vv = window.visualViewport;
  const editorRect = els.editor.getBoundingClientRect();
  const vTop = vv ? vv.offsetTop : 0;
  const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const visTop = Math.max(editorRect.top, vTop);
  const visBottom = Math.min(editorRect.bottom, vBottom);
  const visH = visBottom - visTop;
  if (visH <= 60) return;

  // зорилтот дэлгэцийн Y: харагдах хэсгийн дээрээс (дунднаас дээгүүр)
  const targetY = visTop + Math.max(60, Math.min(visH * 0.3, 150));
  const r = mark.getBoundingClientRect();
  const maxScroll = els.editor.scrollHeight - els.editor.clientHeight;
  const next = Math.max(0, Math.min(els.editor.scrollTop + (r.top - targetY), maxScroll));
  if (Math.abs(next - els.editor.scrollTop) > 2) {
    els.editor.scrollTop = next;
    syncScroll();
  }
}

// Гар нээгдэх анимаци + iOS-ийн өөрийн auto-scroll дуустал хэд хэдэн удаа дахин тааруулна
function scheduleKbAdjust() {
  clearTimeout(kbAdjustTimer);
  const delays = [100, 250, 450, 650]; // tap-аас хойших мс
  let i = 0;
  const run = () => {
    if (els.popover.hidden) return;
    bringWordIntoView();
    placePopover();
    i++;
    if (i < delays.length) kbAdjustTimer = setTimeout(run, delays[i] - delays[i - 1]);
  };
  kbAdjustTimer = setTimeout(run, delays[0]);
}

// Popover-ийг алдаатай үгийн дэргэд байрлуулна. Доош зай хүрэлцэхгүй
// (ялангуяа гар утасны гар гарч ирэхэд) бол үгийн ДЭЭР талд гаргаж,
// харагдах хэсэгт багтаахаар хязгаарлана.
function placePopover() {
  if (els.popover.hidden || activeStart == null) return;
  const mark = els.backdrop.querySelector('mark[data-start="' + activeStart + '"]');
  if (!mark) {
    hidePopover();
    return;
  }
  const r = mark.getBoundingClientRect();
  const margin = 6;

  // visualViewport нь гар гарч ирэхэд бодит харагдах талбайг өгнө
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

  // Доош багтвал доош, эс бол илүү зайтай тал руу (ихэвчлэн дээш)
  let top;
  if (spaceBelow >= popH + margin || spaceBelow >= spaceAbove) {
    top = r.bottom + margin;
  } else {
    top = r.top - popH - margin;
  }

  // Харагдах хэсэгт багтаахаар босоо/хэвтээ хязгаарлалт
  top = Math.max(viewTop + margin, Math.min(top, viewBottom - popH - margin));
  const left = Math.max(viewLeft + margin, Math.min(r.left, viewLeft + viewW - popW - margin));

  els.popover.style.top = window.scrollY + top + 'px';
  els.popover.style.left = window.scrollX + left + 'px';
}

function showPopoverFor(t) {
  let mark = els.backdrop.querySelector('mark[data-start="' + t.start + '"]');
  if (!mark) {
    render();
    mark = els.backdrop.querySelector('mark[data-start="' + t.start + '"]');
  }
  if (!mark) {
    hidePopover();
    return;
  }

  const suggestions = checker.suggest(t.word).slice(0, 8);
  els.popover.innerHTML = suggestions.length
    ? suggestions.map((s) => '<button class="sg" type="button">' + escapeHtml(s) + '</button>').join('')
    : '<div class="muted pop-empty">санал алга</div>';

  activeStart = t.start;
  els.popover.hidden = false; // эхлээд харуулж өндрийг нь хэмжинэ
  bringWordIntoView(); // үгийг гарнаас дээш гаргана
  placePopover();
  scheduleKbAdjust(); // гар нээгдэх анимаци дуустал дахин тааруулна

  els.popover.querySelectorAll('.sg').forEach((btn) => {
    btn.addEventListener('click', () => applySuggestion(t, btn.textContent));
  });
}

function suggestAtCaret() {
  const t = tokenAtCaret();
  if (t) showPopoverFor(t);
  else hidePopover();
}

function maybePropagateManual() {
  if (!pendingFix) return;
  const text = els.editor.value;
  const pos = els.editor.selectionStart;
  const w = wordAtCaret(text, pos);
  if (!w) return;
  const lower = w.word.toLowerCase();
  if (lower === pendingFix.original) return;
  if (!isCorrect(w.word)) return;
  const original = pendingFix.original;
  pendingFix = null;
  const { text: nt, caret } = replaceAllWord(text, original, lower, pos);
  if (nt === text) return;
  const pageY = window.scrollY;
  const top = els.editor.scrollTop;
  els.editor.value = nt;
  els.editor.focus({ preventScroll: true });
  els.editor.setSelectionRange(caret, caret);
  els.editor.scrollTop = top;
  render();
  window.scrollTo(0, pageY);
}

function recheck() {
  render();
  maybePropagateManual();
}

function applySuggestion(t, replacement) {
  pendingFix = null;
  const v = els.editor.value;
  const pageY = window.scrollY;
  const top = els.editor.scrollTop;

  const { text: nt, caret } = replaceAllWord(v, t.word.toLowerCase(), replacement.toLowerCase(), t.end);
  els.editor.value = nt;
  els.editor.focus({ preventScroll: true });
  els.editor.setSelectionRange(caret, caret);
  els.editor.scrollTop = top;
  hidePopover();
  render();
  window.scrollTo(0, pageY);
}

function isSeparatorInput(e) {
  const it = e.inputType || '';
  if (it === 'insertText') return e.data != null && /[\s\p{P}\p{S}]/u.test(e.data);
  if (it === 'insertLineBreak' || it === 'insertParagraph') return true;
  if (it.indexOf('insertFromPaste') === 0 || it.indexOf('insertFromDrop') === 0) return true;
  return false;
}
const deferredCheck = debounce(() => recheck(), 1500);

els.editor.addEventListener('beforeinput', () => {
  const t = tokenAtCaret();
  pendingFix = t ? { original: t.word.toLowerCase() } : null;
});

els.editor.addEventListener('input', (e) => {
  updateEmptyState();
  if (isSeparatorInput(e)) recheck();
  else deferredCheck();
});
els.editor.addEventListener('scroll', () => {
  syncScroll();
  placePopover();
});
els.editor.addEventListener('click', suggestAtCaret);
els.editor.addEventListener('keyup', (e) => {
  const nav = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (nav.indexOf(e.key) !== -1) suggestAtCaret();
});

els.editor.addEventListener('contextmenu', (e) => {
  const t = tokenAtCaret();
  if (t) {
    e.preventDefault();
    showPopoverFor(t);
  }
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#popover') && e.target !== els.editor) hidePopover();
});

// Гар гарч ирэх/хаагдах, дэлгэц эргэх үед нээлттэй popover-ийг дахин байрлуулна
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    bringWordIntoView(); // гар нээгдмэгц үгийг дээш гаргана
    placePopover();
  });
  window.visualViewport.addEventListener('scroll', placePopover);
}
window.addEventListener('resize', placePopover);

const rootEl = document.documentElement;
function applyTheme(theme) {
  rootEl.setAttribute('data-theme', theme);
  const btn = document.querySelector('#themeBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
(function initTheme() {
  let theme = null;
  try { theme = localStorage.getItem('theme'); } catch (_) {}
  if (!theme) {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(theme);
})();
function flash(sel, msg) {
  const b = document.querySelector(sel);
  if (!b) return;
  const old = b.dataset.label || b.textContent;
  b.dataset.label = old;
  b.textContent = msg;
  setTimeout(() => { b.textContent = b.dataset.label; }, 1100);
}
document.querySelector('#themeBtn').addEventListener('click', () => {
  const next = rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('theme', next); } catch (_) {}
});
document.querySelector('#clearBtn').addEventListener('click', () => {
  els.editor.value = '';
  hidePopover();
  els.editor.focus();
  render();
});
function insertAtCaret(text) {
  const v = els.editor.value;
  let start = els.editor.selectionStart;
  let end = els.editor.selectionEnd;
  if (start == null) { start = v.length; end = v.length; }
  els.editor.value = v.slice(0, start) + text + v.slice(end);
  const pos = start + text.length;
  els.editor.focus({ preventScroll: true });
  els.editor.setSelectionRange(pos, pos);
  render();
}

document.querySelector('#pasteBtn').addEventListener('click', async () => {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text) insertAtCaret(text);
      else els.editor.focus();
      return;
    }
    throw new Error('no-api');
  } catch (_) {

    els.editor.focus();
    flash('#pasteBtn', 'Ctrl+V');
  }
});
document.querySelector('#copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.editor.value || '');
    flash('#copyBtn', 'Хууллаа');
  } catch (_) {
    flash('#copyBtn', 'Боломжгүй');
  }
});

async function boot() {
  setStatus('Hunspell ачаалж байна…');
  try {
    const { loaded, failed, source, fallbackReason } = await checker.init();
    ready = true;
    if (loaded.length) {
      const seenName = new Set();
      const simple = [];
      for (const id of loaded) {
        const name = id.startsWith('mn') ? 'монгол' : id.startsWith('en') ? 'англи' : labelOf(id);
        if (!seenName.has(name)) {
          seenName.add(name);
          simple.push(name);
        }
      }
      let msg = 'Ашиглаж буй толь: <b>' + simple.join(', ') + '</b>';
      if (failed.length) {
        msg += ' <span class="muted">(олдсонгүй: ' + failed.map((f) => f.id).join(', ') + ')</span>';
      }
      if (fallbackReason) {
        msg += '<br><span class="muted">hunspell-wasm амжилтгүй (nspell ашиглаж байна): ' +
          escapeHtml(fallbackReason) + '</span>';
      }
      baseStatus = msg;
      setStatus(msg);
    } else {
      setStatus('Нэг ч толь алга — <code>public/dict/</code> дотор .aff/.dic эсвэл dictionaries.zip хийнэ үү.');
    }
    render();
    els.editor.focus();
  } catch (e) {
    setStatus('Ачаалахад алдаа гарлаа: ' + (e && e.message ? e.message : String(e)));
  }
}

boot();
