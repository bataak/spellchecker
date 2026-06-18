import './style.css';
import { MultiSpellChecker, tokenize, DICTIONARIES } from './spellchecker.js';

document.body.classList.add('ready');

const els = {
  status: document.querySelector('#statusText'),
  editor: document.querySelector('#editor'),
  backdrop: document.querySelector('#backdrop'),
  popover: document.querySelector('#popover'),
};

const checker = new MultiSpellChecker();
const cache = new Map();
let ready = false;
let badTokens = [];
let baseStatus = '';
let pendingFix = null;

const labelOf = (id) => (DICTIONARIES.find((d) => d.id === id) || {}).label || id;
const setStatus = (html) => {
  if (els.status) els.status.innerHTML = html;
};
const escapeHtml = (s) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function isCorrect(word) {
  if (!ready) return true;
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
  for (const { word, index } of tokenize(text)) {
    if (word.length < 2 || /^\p{N}+(-|$)/u.test(word)) continue;
    if (!isCorrect(word)) {
      bad.push({ word, index });
    }
  }
  return bad;
}

function renderBackdrop() {
  const text = els.editor.value;
  badTokens = computeBad(text);
  let html = '';
  let last = 0;
  for (const { word, index } of badTokens) {
    html += escapeHtml(text.slice(last, index));
    html += `<mark class="proof" data-index="${index}">${escapeHtml(word)}</mark>`;
    last = index + word.length;
  }
  html += escapeHtml(text.slice(last));
  html += '\n';
  els.backdrop.innerHTML = html;
}

const update = debounce(renderBackdrop, 150);

function syncScroll() {
  els.backdrop.scrollTop = els.editor.scrollTop;
  els.backdrop.scrollLeft = els.editor.scrollLeft;
}

function hidePopover() {
  els.popover.hidden = true;
  pendingFix = null;
}

function showPopover(x, y, word, suggestions) {
  let html = `<div class="pop-word"><b>${escapeHtml(word)}</b></div>`;
  if (!suggestions.length) {
    html += `<div class="pop-item no-sug">Санал болгох үг олдсонгүй</div>`;
  } else {
    for (const s of suggestions.slice(0, 5)) {
      html += `<button class="pop-item sug-btn" type="button" data-val="${escapeHtml(s)}">${escapeHtml(s)}</button>`;
    }
  }
  els.popover.innerHTML = html;
  els.popover.style.left = `${x}px`;
  els.popover.style.top = `${y}px`;
  els.popover.hidden = false;
}

els.editor.addEventListener('input', () => {
  hidePopover();
  update();
});
els.editor.addEventListener('scroll', syncScroll);

els.backdrop.addEventListener('click', (e) => {
  if (!ready) return;
  const mark = e.target.closest('mark.proof');
  if (!mark) {
    hidePopover();
    return;
  }
  const idx = parseInt(mark.getAttribute('data-index'), 10);
  const found = badTokens.find((t) => t.index === idx);
  if (!found) return;
  pendingFix = found;
  const sugs = checker.suggest(found.word);
  const rect = mark.getBoundingClientRect();
  const wrapper = els.editor.parentElement.getBoundingClientRect();
  const x = rect.left - wrapper.left + els.editor.scrollLeft;
  const y = rect.bottom - wrapper.top + els.editor.scrollTop + 4;
  showPopover(x, y, found.word, sugs);
});

els.popover.addEventListener('click', (e) => {
  const btn = e.target.closest('.sug-btn');
  if (!btn || !pendingFix) return;
  const rep = btn.getAttribute('data-val');
  const orig = els.editor.value;
  const next = orig.slice(0, pendingFix.index) + rep + orig.slice(pendingFix.index + pendingFix.word.length);
  els.editor.value = next;
  els.editor.focus();
  els.editor.setSelectionRange(pendingFix.index + rep.length, pendingFix.index + rep.length);
  hidePopover();
  renderBackdrop();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.editor-wrapper') && !e.target.closest('#popover')) {
    hidePopover();
  }
});

(function initFontAndTheme() {
  const tbtn = document.querySelector('#themeBtn');
  const sizeKey = 'editor_fontsize';
  let size = parseFloat(localStorage.getItem(sizeKey)) || 1.15;
  const applySize = () => document.documentElement.style.setProperty('--editor-scale', size);
  applySize();

  document.querySelector('#fontIncBtn').addEventListener('click', () => {
    size = Math.min(2.5, size + 0.1);
    localStorage.setItem(sizeKey, size);
    applySize();
  });
  document.querySelector('#fontDecBtn').addEventListener('click', () => {
    size = Math.max(0.7, size - 0.1);
    localStorage.setItem(sizeKey, size);
    applySize();
  });
  document.querySelector('#fontResetBtn').addEventListener('click', () => {
    size = 1.15;
    localStorage.removeItem(sizeKey);
    applySize();
  });

  const getTheme = () => document.documentElement.getAttribute('data-theme') || 'light';
  const setTheme = (t) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    tbtn.textContent = t === 'dark' ? '☀️' : '🌙';
  };
  tbtn.textContent = getTheme() === 'dark' ? '☀️' : '🌙';
  tbtn.addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'));

  document.querySelector('#clearBtn').addEventListener('click', () => {
    els.editor.value = '';
    hidePopover();
    renderBackdrop();
    els.editor.focus();
  });

  document.querySelector('#copyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.editor.value);
    } catch (_) {}
  });

  document.querySelector('#pasteBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        els.editor.value = text;
        hidePopover();
        renderBackdrop();
      }
    } catch (_) {}
  });

  const openBtn = document.querySelector('#openBtn');
  const openFile = document.querySelector('#openFile');
  openBtn.addEventListener('click', () => openFile.click());
  openFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = (evt) => {
      els.editor.value = evt.target.result;
      hidePopover();
      renderBackdrop();
    };
    r.readAsText(file);
    openFile.value = '';
  });

  document.querySelector('#saveBtn').addEventListener('click', () => {
    const blob = new Blob([els.editor.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bichig-' + Math.floor(Date.now() / 1000) + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  const trigger = (sel) => {
    const b = document.querySelector(sel);
    if (b) b.click();
  };
  window.addEventListener('keydown', (e) => {
    if (!ready) return;
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmd = isMac ? e.metaKey : e.ctrlKey;
    if (!cmd) return;
    const kl = e.key.toLowerCase();
    if (kl === 'o') {
      e.preventDefault();
      trigger('#openBtn');
    } else if (kl === 'd') {
      e.preventDefault();
      trigger('#clearBtn');
    } else if (kl === 'c') {
      if (els.editor.selectionStart === els.editor.selectionEnd) {
        e.preventDefault();
        trigger('#copyBtn');
      }
    }
  });
})();

async function bootstrapApp() {
  setStatus('Үгийн санг татаж байна...');
  try {
    const base = process.env.VITE_BASE || '/hunspell-mn/';
    const dictUrl = `${base}dict/dictionaries.zip`;
    const res = await fetch(dictUrl);
    if (!res.ok) throw new Error(`${res.status}`);

    setStatus('Hunspell ачаалж байна…');

    const { loaded, failed, fallbackReason } = await checker.init();
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
        msg += '<br><span class="muted">hunspell-wasm амжилтгүй (nspell ашиглаж байна): ' + escapeHtml(fallbackReason) + '</span>';
      }
      baseStatus = msg;
      setStatus(msg);
    } else {
      setStatus('<span class="error">Толь ачаалж чадсангүй.</span>');
    }
    renderBackdrop();
  } catch (e) {
    setStatus('<span class="error">Алдаа: Интернет холболтоо шалгаад хуудсыг дахин ачаална уу. (' + escapeHtml(String(e)) + ')</span>');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
