const ENDPOINT = "https://api.bichig.dev/suggest";
const SITEKEY = "0x4AAAAAADvk6t3Gsh_j1vH7";
const WORD_RE = /^[\u0400-\u04FF][\u0400-\u04FF-]{1,49}$/u;
const MAX_WORDS = 20;
const PREFILL_MAX = 5;
const ROOT_LEN = 3;

let overlay = null;
let widgetId = null;
let scriptPromise = null;
let busy = false;
let words = [];
let deps = {};
let tokenResolve = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        s.remove();
        reject(new Error("turnstile-load"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

function note(msg, kind) {
  const el = overlay.querySelector(".suggest-note");
  el.textContent = msg;
  el.dataset.kind = kind || "";
}

function escapeChip(s) {
  return s.replace(/[&<>"]/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    return "&quot;";
  });
}

function renderChips() {
  const box = overlay.querySelector(".suggest-chips");
  box.innerHTML = words
    .map(
      (w, i) =>
        '<span class="suggest-chip">' +
        escapeChip(w) +
        '<button type="button" class="suggest-chip-x" data-i="' +
        i +
        '" aria-label="Устгах">&times;</button></span>',
    )
    .join("");
  box.querySelectorAll(".suggest-chip-x").forEach((btn) => {
    btn.addEventListener("click", () => {
      words.splice(Number(btn.dataset.i), 1);
      renderChips();
    });
  });
}

function prefillFromErrors() {
  words = [];
  if (!deps.getBadTokens || !deps.buildErrorList) return;
  const list = deps.buildErrorList(deps.getBadTokens());
  const cyr = list.filter((t) => WORD_RE.test(t.word));
  cyr.sort((a, b) => b.count - a.count);
  const roots = new Set();
  for (const t of cyr) {
    if (words.length >= PREFILL_MAX) break;
    const root = t.word.toLowerCase().slice(0, ROOT_LEN);
    if (roots.has(root)) continue;
    roots.add(root);
    words.push(t.word);
  }
}

function addFromInput(commit) {
  const wordEl = overlay.querySelector("#suggestWord");
  const parts = wordEl.value.split(/[\s,\u3001\uFF0C]+/);
  const tail = commit ? "" : parts.pop();
  let added = false;
  for (const p of parts) {
    const w = p.trim();
    if (!w) continue;
    if (!WORD_RE.test(w)) {
      note("\u00AB" + w + "\u00BB \u2014 \u043A\u0438\u0440\u0438\u043B\u043B \u04AF\u0441\u0433\u044D\u044D\u0440, 2\u201350 \u0442\u044D\u043C\u0434\u044D\u0433\u0442 \u0431\u0430\u0439\u0445 \u0451\u0441\u0442\u043E\u0439", "err");
      continue;
    }
    if (words.length >= MAX_WORDS) {
      note("\u0425\u0430\u043C\u0433\u0438\u0439\u043D \u0438\u0445\u0434\u044D\u044D " + MAX_WORDS + " \u04AF\u0433", "err");
      break;
    }
    if (!words.some((x) => x.toLowerCase() === w.toLowerCase())) {
      words.push(w);
      added = true;
    }
  }
  wordEl.value = tail;
  if (added) {
    renderChips();
    if (overlay.querySelector(".suggest-note").dataset.kind !== "err") note("");
  }
}

function closeForm() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  if (tokenResolve) {
    tokenResolve("");
    tokenResolve = null;
  }
}

function build() {
  overlay = document.createElement("div");
  overlay.className = "suggest-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="suggest-card" role="dialog" aria-modal="true" aria-labelledby="suggestTitle">' +
    '<h2 id="suggestTitle" class="suggest-title">\u0428\u0438\u043D\u044D \u04AF\u0433 \u0441\u0430\u043D\u0430\u043B \u0431\u043E\u043B\u0433\u043E\u0445</h2>' +
    '<p class="suggest-hint">\u0410\u043B\u0434\u0430\u0430 \u0448\u0430\u043B\u0433\u0430\u0445 \u0442\u043E\u043B\u0438\u043D\u0434 \u0445\u0430\u0440\u0430\u0430\u0445\u0430\u043D \u0431\u04AF\u0440\u0442\u0433\u044D\u0433\u0434\u044D\u044D\u0433\u04AF\u0439 \u0448\u0438\u043D\u044D \u04AF\u0433\u0438\u0439\u0433 \u0441\u0430\u043D\u0430\u043B \u0431\u043E\u043B\u0433\u043E\u0445</p>' +
    '<label class="suggest-label" for="suggestWord">\u0428\u0438\u043D\u044D \u04AF\u0433</label>' +
    '<div class="suggest-chips"></div>' +
    '<input id="suggestWord" class="suggest-input" type="text" maxlength="50" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
    '<label class="suggest-label" for="suggestNote">\u0422\u0430\u0439\u043B\u0431\u0430\u0440 (\u0437\u0430\u0430\u0432\u0430\u043B \u0431\u0438\u0448)</label>' +
    '<textarea id="suggestNote" class="suggest-input suggest-textarea" maxlength="500" rows="3"></textarea>' +
    '<div class="suggest-turnstile"></div>' +
    '<p class="suggest-note" aria-live="polite"></p>' +
    '<p class="suggest-legal">Cloudflare-\u0438\u0439\u043D \u0445\u0430\u043C\u0433\u0430\u0430\u043B\u0430\u043B\u0442\u0430\u0434 \u0445\u0430\u043C\u0440\u0430\u0433\u0434\u0441\u0430\u043D</p>' +
    '<div class="suggest-actions">' +
    '<button type="button" class="tbtn suggest-cancel">\u0426\u0443\u0446\u043B\u0430\u0445</button>' +
    '<button type="button" class="tbtn suggest-send">\u0418\u043B\u0433\u044D\u044D\u0445</button>' +
    "</div>" +
    "</div>";
  document.body.appendChild(overlay);

  const wordEl = overlay.querySelector("#suggestWord");

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) closeForm();
  });
  overlay.querySelector(".suggest-cancel").addEventListener("click", closeForm);
  overlay.querySelector(".suggest-send").addEventListener("click", submit);

  wordEl.addEventListener("input", () => addFromInput(false));
  wordEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addFromInput(true);
    } else if (e.key === "Backspace" && wordEl.value === "" && words.length) {
      words.pop();
      renderChips();
    }
  });
  wordEl.addEventListener("blur", () => addFromInput(true));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeForm();
  });
}

async function openForm() {
  if (!overlay) build();
  overlay.hidden = false;
  note("");
  prefillFromErrors();
  renderChips();
  overlay.querySelector("#suggestNote").value = "";
  const wordEl = overlay.querySelector("#suggestWord");
  wordEl.value = "";
  try {
    await loadTurnstile();
  } catch (_) {
    note("\u0411\u0430\u0442\u0430\u043B\u0433\u0430\u0430\u0436\u0443\u0443\u043B\u0430\u043B\u0442 \u0430\u0447\u0430\u0430\u043B\u0430\u0433\u0434\u0441\u0430\u043D\u0433\u04AF\u0439 \u2014 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442\u044D\u044D \u0448\u0430\u043B\u0433\u0430\u043D\u0430 \u0443\u0443", "err");
    return;
  }
  if (widgetId == null) {
    widgetId = window.turnstile.render(
      overlay.querySelector(".suggest-turnstile"),
      {
        sitekey: SITEKEY,
        size: "invisible",
        callback: (t) => {
          if (tokenResolve) {
            tokenResolve(t);
            tokenResolve = null;
          }
        },
        "error-callback": () => {
          if (tokenResolve) {
            tokenResolve("");
            tokenResolve = null;
          }
        },
      },
    );
  }
}

function getToken() {
  if (!window.turnstile || widgetId == null) return Promise.resolve("");
  return new Promise((resolve) => {
    tokenResolve = resolve;
    try {
      window.turnstile.reset(widgetId);
      window.turnstile.execute(widgetId);
    } catch (_) {
      tokenResolve = null;
      resolve("");
    }
    setTimeout(() => {
      if (tokenResolve) {
        tokenResolve("");
        tokenResolve = null;
      }
    }, 15000);
  });
}

async function submit() {
  if (busy) return;
  addFromInput(true);
  const noteEl = overlay.querySelector("#suggestNote");
  const sendBtn = overlay.querySelector(".suggest-send");

  if (!words.length) {
    note("\u0414\u043E\u0440 \u0445\u0430\u044F\u0436 \u043D\u044D\u0433 \u04AF\u0433 \u043E\u0440\u0443\u0443\u043B\u043D\u0430 \u0443\u0443", "err");
    overlay.querySelector("#suggestWord").focus();
    return;
  }
  if (!navigator.onLine) {
    note("\u0421\u04AF\u043B\u0436\u044D\u044D\u0433\u04AF\u0439 \u0431\u0430\u0439\u043D\u0430 \u2014 \u0445\u043E\u043B\u0431\u043E\u0433\u0434\u0441\u043E\u043D\u044B \u0434\u0430\u0440\u0430\u0430 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443", "err");
    return;
  }
  busy = true;
  sendBtn.disabled = true;
  note("\u0418\u043B\u0433\u044D\u044D\u0436 \u0431\u0430\u0439\u043D\u0430\u2026");
  const token = await getToken();
  if (!token) {
    note("\u0411\u0430\u0442\u0430\u043B\u0433\u0430\u0430\u0436\u0443\u0443\u043B\u0430\u043B\u0442 \u0430\u043C\u0436\u0438\u043B\u0442\u0433\u04AF\u0439 \u2014 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443", "err");
    busy = false;
    sendBtn.disabled = false;
    return;
  }
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        words,
        note: noteEl.value.trim(),
        turnstileToken: token,
      }),
    });
    if (r.status === 201) {
      note("\u0418\u043B\u0433\u044D\u044D\u0433\u0434\u043B\u044D\u044D, \u0431\u0430\u044F\u0440\u043B\u0430\u043B\u0430\u0430!", "ok");
      words = [];
      renderChips();
      noteEl.value = "";
      setTimeout(closeForm, 1400);
    } else if (r.status === 429) {
      note("\u0426\u0430\u0433\u0438\u0439\u043D \u0445\u044F\u0437\u0433\u0430\u0430\u0440\u0442 \u0445\u04AF\u0440\u043B\u044D\u044D \u2014 \u0434\u0430\u0440\u0430\u0430 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443", "err");
    } else {
      note("\u0418\u043B\u0433\u044D\u044D\u0445\u044D\u0434 \u0430\u043B\u0434\u0430\u0430 \u0433\u0430\u0440\u043B\u0430\u0430 \u2014 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443", "err");
    }
  } catch (_) {
    note("\u0421\u04AF\u043B\u0436\u044D\u044D\u043D\u0438\u0439 \u0430\u043B\u0434\u0430\u0430 \u2014 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443", "err");
  } finally {
    busy = false;
    sendBtn.disabled = false;
  }
}

export function initSuggest(options) {
  deps = options || {};
  document.querySelectorAll("a.suggestctl, a.suggest-word").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openForm();
    });
  });
}
