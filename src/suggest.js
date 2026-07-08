const ENDPOINT = "https://api.bichig.dev/suggest";
const SITEKEY = "0x4AAAAAADvk6t3Gsh_j1vH7";
const WORD_RE = /^[\u0400-\u04FF][\u0400-\u04FF-]{1,49}$/u;
const MAX_WORDS = 50;
const SUBMITTED_KEY = "mn-spell:submitted";
const ISSUES_URL =
  "https://github.com/bataak/dict-mn/issues?q=is%3Aissue%20label%3Auser-submitted";

function getSubmitted() {
  try {
    const raw = localStorage.getItem(SUBMITTED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

function addSubmitted(list) {
  try {
    const set = getSubmitted();
    for (const w of list) set.add(w.toLowerCase());
    localStorage.setItem(SUBMITTED_KEY, JSON.stringify([...set]));
  } catch (_) {}
}

let overlay = null;
let widgetId = null;
let scriptPromise = null;
let busy = false;
let words = [];
let deps = {};
let showingSubmitted = false;

const FORM_TITLE = "Шинэ буюу алдаатай үг мэдэгдэх";
const SUBMITTED_TITLE = "Мэдэгдсэн үгс";

function renderSubmittedList() {
  const box = overlay.querySelector(".suggest-submitted-chips");
  const list = [...getSubmitted()].sort((a, b) => a.localeCompare(b));
  overlay.querySelector("#suggestTitle").innerHTML = list.length
    ? SUBMITTED_TITLE +
      ' <span class="suggest-count" aria-hidden="true">(' +
      list.length +
      ")</span>"
    : SUBMITTED_TITLE;
  box.innerHTML = list.length
    ? list
        .map((w) => '<span class="suggest-chip">' + escapeChip(w) + "</span>")
        .join("")
    : '<span class="suggest-hint">Одоогоор мэдэгдсэн үг алга</span>';
}

function setSubmittedView(on) {
  const card = overlay.querySelector(".suggest-card");
  if (on && window.matchMedia("(min-width: 701px)").matches) {
    card.style.height = card.offsetHeight + "px";
  }
  if (!on) card.style.height = "";
  showingSubmitted = on;
  card.classList.toggle("submitted-view", on);
  overlay
    .querySelector(".suggest-view-submitted")
    .classList.toggle("active", on);
  overlay.querySelector(".suggest-send").disabled = on || busy;
  note("");
  if (on) renderSubmittedList();
  else overlay.querySelector("#suggestTitle").textContent = FORM_TITLE;
}

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
  const clr = overlay.querySelector(".suggest-clear-all");
  if (clr) clr.hidden = words.length < 2;
  const cnt = overlay.querySelector(".suggest-count");
  if (cnt) {
    cnt.textContent = words.length ? "(" + words.length + ")" : "";
    cnt.classList.toggle("over", words.length > MAX_WORDS);
  }
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

function isLowerDashSuffix(t) {
  if (!deps.isDashSuffix || !deps.isDashSuffix(t)) return false;
  const ch = t.word.replace(/^[-\u2013\u2014]+/, "").charAt(0);
  return ch !== "" && ch === ch.toLowerCase() && ch !== ch.toUpperCase();
}

function H(tpl) {
  const map = { A: ["а", "э", "о", "ө"], Y: ["ы", "ий"] };
  let out = [""];
  for (const ch of tpl) {
    const opts = map[ch] || [ch];
    const next = [];
    for (const p of out) for (const o of opts) next.push(p + o);
    out = next;
  }
  return out;
}

const NOUN_MS = [
  ...H("гүй"),
  ...H("Yн"),
  ...H("нY"),
  "гийн",
  ...H("Y"),
  "н",
  "йн",
  ...H("Yг"),
  "г",
  "йг",
  "д",
  "т",
  "нд",
  ...H("Aд"),
  "ид",
  "уд",
  "үд",
  "ыд",
  ...H("AAс"),
  ...H("AAр"),
  ...H("AA"),
  "тай",
  "тэй",
  "той",
  ...H("гAA"),
  ...H("хAA"),
  "еэ",
  "ёо",
  "яа",
  "ье",
  "х",
  "хан",
  "хэн",
  "хон",
  "хн",
  "ууд",
  "үүд",
];

const VERB_MS = [
  "в",
  "вч",
  ...H("Aв"),
  ...H("лAA"),
  "жээ",
  "чээ",
  "ж",
  "ч",
  ...H("сAн"),
  "сн",
  ...H("сAAр"),
  ...H("сAд"),
  "сд",
  ...H("нA"),
  "нам",
  "нэм",
  "муй",
  "мүй",
  "муу",
  "мүү",
  ...H("AAд"),
  ...H("AAч"),
  "ай",
  "эй",
  "ой",
  "өй",
  ...H("дAг"),
  "дг",
  ...H("Aг"),
  ...H("Aх"),
  ...H("Aл"),
  ...H("Aм"),
  ...H("Aн"),
  ...H("вAл"),
  ...H("вAAс"),
  ...H("бAл"),
  ...H("бAAс"),
  ...H("мAгц"),
  ...H("тAл"),
  ...H("тлAA"),
  "хул",
  "хүл",
  "ул",
  "үл",
  ...H("мAAр"),
  ...H("мAр"),
  ...H("лAAр"),
  "уй",
  "үй",
  "уйц",
  "үйц",
  "дүй",
  "дуй",
  "жухуй",
  "чухуй",
  "шгүй",
  ...H("Aшгүй"),
  ...H("Aс"),
  ...H("Aж"),
  "су",
  "сү",
  "сугай",
  "сүгэй",
  "тугай",
  "түгэй",
  "тун",
  "түн",
  "туй",
  "түй",
  "уужин",
  "үүжин",
  "уузай",
  "үүзэй",
  "жин",
  "зай",
  "сай",
  "ъя",
  "ъё",
  "ъе",
  "ъюу",
  "ъю",
  "юу",
  "юү",
  "ьюу",
  "ьюү",
  "ья",
  "ье",
  "ьё",
  "руун",
  "рүүн",
  "архуу",
  "эрхүү",
  "орхуу",
  "өрхүү",
  "рхуу",
  "рхүү",
  "гай",
  "гэй",
  "гой",
  "гөй",
  "хай",
  "хэй",
  "хой",
  "хөй",
  "гий",
  "хий",
  "гуй",
  "гуут",
  "гүүт",
  "уут",
  "үүт",
  "ууш",
  "үүш",
  "уур",
  "үүр",
  ...H("члAн"),
  "чаа",
  "чаан",
  "мз",
  "з",
  "р",
  "л",
  "м",
  "ш",
  "с",
  "ц",
  "а",
  "э",
  "и",
  "о",
  "у",
  "ө",
  "ү",
  "ы",
  "е",
  "ё",
  "ю",
  "я",
];

function mkChain(morphs) {
  const MS = [...new Set(morphs)].sort((a, b) => b.length - a.length);
  return function (tail, prevCh) {
    let rest = tail;
    let prev = prevCh;
    if (rest[0] === "-") {
      rest = rest.slice(1);
      prev = "-";
    }
    if (rest === "") return true;
    const memo = new Map();
    function go(i, pc) {
      if (i === rest.length) return true;
      if (memo.has(i)) return memo.get(i);
      let ok = false;
      for (const m of MS) {
        if (!rest.startsWith(m, i)) continue;
        if (m === "т" && pc === "т") continue;
        if (go(i + m.length, m[m.length - 1])) {
          ok = true;
          break;
        }
      }
      memo.set(i, ok);
      return ok;
    }
    return go(0, prev);
  };
}

const nounChain = mkChain(NOUN_MS);
const unionChain = mkChain([...NOUN_MS, ...VERB_MS]);

function sameRoot(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i < 3) return false;
  const pc = a[i - 1];
  for (let da = 0; da <= 1; da++) {
    for (let db = 0; db <= 1; db++) {
      if (
        a
          .slice(i, i + da)
          .split("")
          .some((c) => c === pc)
      )
        continue;
      if (
        b
          .slice(i, i + db)
          .split("")
          .some((c) => c === pc)
      )
        continue;
      const ta = a.slice(i + da);
      const tb = b.slice(i + db);
      if (nounChain(ta, pc) && nounChain(tb, pc)) return true;
      if (unionChain(ta, pc) && unionChain(tb, pc)) return true;
    }
  }
  return false;
}

function prefillFromErrors() {
  words = [];
  if (!deps.getBadTokens || !deps.buildErrorList) return;
  const list = deps
    .buildErrorList(deps.getBadTokens().filter((t) => !isLowerDashSuffix(t)))
    .filter((t) => WORD_RE.test(t.word))
    .sort((a, b) => a.word.length - b.word.length);
  const submitted = getSubmitted();
  const kept = [];
  for (const t of list) {
    const key = t.word.toLowerCase();
    if (submitted.has(key)) continue;
    if (kept.some((k) => sameRoot(k.key, key))) continue;
    kept.push({ key, t });
  }
  kept.sort((a, b) => a.t.word.localeCompare(b.t.word, "mn"));
  for (const k of kept) words.push(k.t.word);
}

function addFromInput(commit) {
  const wordEl = overlay.querySelector("#suggestWord");
  const parts = wordEl.value.split(/[\s,\u3001\uFF0C]+/);
  const tail = commit ? "" : parts.pop();
  const submitted = getSubmitted();
  let added = false;
  for (const p of parts) {
    const w = p.trim();
    if (!w) continue;
    if (!WORD_RE.test(w)) {
      note(
        "\u00AB" +
          w +
          "\u00BB \u2014 \u043A\u0438\u0440\u0438\u043B\u043B \u04AF\u0441\u0433\u044D\u044D\u0440, 2\u201350 \u0442\u044D\u043C\u0434\u044D\u0433\u0442 \u0431\u0430\u0439\u0445 \u0451\u0441\u0442\u043E\u0439",
        "err",
      );
      continue;
    }
    if (submitted.has(w.toLowerCase())) {
      note(
        "\u00AB" + w + "\u00BB \u2014 энэ үгийг аль хэдийн мэдэгдсэн байна",
        "err",
      );
      continue;
    }
    if (words.length >= MAX_WORDS) {
      note(
        "\u0425\u0430\u043C\u0433\u0438\u0439\u043D \u0438\u0445\u0434\u044D\u044D " +
          MAX_WORDS +
          " \u04AF\u0433",
        "err",
      );
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
    if (overlay.querySelector(".suggest-note").dataset.kind !== "err")
      note("");
  }
}

function closeForm() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  if (window.turnstile && widgetId != null) {
    try {
      window.turnstile.reset(widgetId);
    } catch (_) {}
  }
}

function build() {
  overlay = document.createElement("div");
  overlay.className = "suggest-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="suggest-card" role="dialog" aria-modal="true" aria-labelledby="suggestTitle">' +
    '<h2 id="suggestTitle" class="suggest-title">\u0428\u0438\u043D\u044D \u0431\u0443\u044E\u0443 \u0430\u043B\u0434\u0430\u0430\u0442\u0430\u0439 \u04AF\u0433 \u043C\u044D\u0434\u044D\u0433\u0434\u044D\u0445</h2>' +
    '<p class="suggest-hint">\u0428\u0438\u043D\u044D \u04AF\u0433\u0438\u0439\u0433 \u04AF\u0433\u0438\u0439\u043D \u0441\u0430\u043D\u0434 \u0445\u0443\u0432\u0438\u043B\u043B\u044B\u043D \u0445\u0430\u043C\u0442 \u043D\u044D\u043C\u04AF\u04AF\u043B\u044D\u0445 \u0431\u0443\u044E\u0443 \u0430\u043B\u0434\u0430\u0430 \u043C\u044D\u0434\u044D\u044D\u043B\u044D\u0445</p>' +
    '<label class="suggest-label" for="suggestWord">\u041C\u044D\u0434\u044D\u0433\u0434\u044D\u0445 \u04AF\u0433 <span class="suggest-count" aria-hidden="true"></span></label>' +
    '<div class="suggest-chips"></div>' +
    '<div class="suggest-input-row">' +
    '<input id="suggestWord" class="suggest-input" type="text" maxlength="50" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
    '<button type="button" class="suggest-clear-all" hidden title="\u0411\u04AF\u0433\u0434\u0438\u0439\u0433 \u0443\u0441\u0442\u0433\u0430\u0445" aria-label="\u0411\u04AF\u0433\u0434\u0438\u0439\u0433 \u0443\u0441\u0442\u0433\u0430\u0445">&times;</button>' +
    "</div>" +
    '<label class="suggest-label" for="suggestNote">\u0422\u0430\u0439\u043B\u0431\u0430\u0440 (\u0437\u0430\u0430\u0432\u0430\u043B \u0431\u0438\u0448)</label>' +
    '<textarea id="suggestNote" class="suggest-input suggest-textarea" maxlength="500" rows="3"></textarea>' +
    '<div class="suggest-turnstile"></div>' +
    '<div class="suggest-submitted">' +
    '<div class="suggest-chips suggest-submitted-chips"></div>' +
    "</div>" +
    '<p class="suggest-note" aria-live="polite"></p>' +
    '<div class="suggest-actions">' +
    '<a class="tbtn suggest-issues" href="' +
    ISSUES_URL +
    '" target="_blank" rel="noopener noreferrer" title="Нийт хэрэглэгчдийн мэдэгдсэн үгс">GitHub</a>' +
    '<button type="button" class="tbtn suggest-view-submitted" title="Миний мэдэгдсэн үгс" style="margin-right:auto">Мэдэгдсэн үгс</button>' +
    '<button type="button" class="tbtn suggest-cancel">\u0426\u0443\u0446\u043B\u0430\u0445</button>' +
    '<button type="button" class="tbtn suggest-send">\u0418\u043B\u0433\u044D\u044D\u0445</button>' +
    "</div>" +
    "</div>";
  document.body.appendChild(overlay);

  const wordEl = overlay.querySelector("#suggestWord");

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) closeForm();
  });
  overlay
    .querySelector(".suggest-cancel")
    .addEventListener("click", closeForm);
  overlay.querySelector(".suggest-send").addEventListener("click", submit);
  const viewBtn = overlay.querySelector(".suggest-view-submitted");
  viewBtn.addEventListener("click", () =>
    setSubmittedView(!showingSubmitted),
  );
  let pressTimer = null;
  let longPressed = false;
  const issuesHidden = () =>
    getComputedStyle(overlay.querySelector(".suggest-issues")).display ===
    "none";
  const startPress = () => {
    if (!issuesHidden()) return;
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      window.open(ISSUES_URL, "_blank", "noopener,noreferrer");
    }, 550);
  };
  const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };
  viewBtn.addEventListener("pointerdown", startPress);
  viewBtn.addEventListener("pointerup", cancelPress);
  viewBtn.addEventListener("pointerleave", cancelPress);
  viewBtn.addEventListener("pointercancel", cancelPress);
  viewBtn.addEventListener("contextmenu", (e) => {
    if (issuesHidden()) e.preventDefault();
  });
  viewBtn.addEventListener(
    "click",
    (e) => {
      if (longPressed) {
        e.preventDefault();
        e.stopImmediatePropagation();
        longPressed = false;
      }
    },
    true,
  );
  overlay
    .querySelector(".suggest-clear-all")
    .addEventListener("click", () => {
      words = [];
      renderChips();
      note("");
      wordEl.focus();
    });

  wordEl.addEventListener("input", () => addFromInput(false));
  wordEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (wordEl.value.trim()) addFromInput(true);
      else submit();
    } else if (e.key === "Backspace" && wordEl.value === "" && words.length) {
      words.pop();
      renderChips();
    }
  });
  wordEl.addEventListener("blur", () => addFromInput(true));

  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const t = e.target;
    if (t === wordEl) return;
    if (t.tagName === "TEXTAREA") return;
    if (t.tagName === "BUTTON") return;
    if (t.tagName === "A") return;
    e.preventDefault();
    submit();
  });

  document.addEventListener("keydown", (e) => {
    if (!overlay.hidden && e.key === "Escape") closeForm();
  });
}

async function openForm() {
  if (!overlay) build();
  overlay.hidden = false;
  setSubmittedView(false);
  note("");
  prefillFromErrors();
  renderChips();
  overlay.querySelector("#suggestNote").value = "";
  const wordEl = overlay.querySelector("#suggestWord");
  wordEl.value = "";
  try {
    await loadTurnstile();
  } catch (_) {
    note(
      "\u0411\u0430\u0442\u0430\u043B\u0433\u0430\u0430\u0436\u0443\u0443\u043B\u0430\u043B\u0442 \u0430\u0447\u0430\u0430\u043B\u0430\u0433\u0434\u0441\u0430\u043D\u0433\u04AF\u0439 \u2014 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442\u044D\u044D \u0448\u0430\u043B\u0433\u0430\u043D\u0430 \u0443\u0443",
      "err",
    );
    return;
  }
  if (widgetId == null) {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    widgetId = window.turnstile.render(
      overlay.querySelector(".suggest-turnstile"),
      { sitekey: SITEKEY, theme },
    );
  } else {
    try {
      window.turnstile.reset(widgetId);
    } catch (_) {}
  }
}

async function submit() {
  if (busy || showingSubmitted) return;
  addFromInput(true);
  const noteEl = overlay.querySelector("#suggestNote");
  const sendBtn = overlay.querySelector(".suggest-send");

  if (!words.length) {
    note(
      "\u0414\u043E\u0440 \u0445\u0430\u044F\u0436 \u043D\u044D\u0433 \u04AF\u0433 \u043E\u0440\u0443\u0443\u043B\u043D\u0430 \u0443\u0443",
      "err",
    );
    overlay.querySelector("#suggestWord").focus();
    return;
  }
  if (words.length > MAX_WORDS) {
    note(
      "\u0418\u043B\u0433\u044D\u044D\u0445 \u04AF\u0433\u0438\u0439\u043D \u0442\u043E\u043E \u0445\u0430\u043C\u0433\u0438\u0439\u043D \u0438\u0445\u0434\u044D\u044D " +
        MAX_WORDS +
        " \u0431\u0430\u0439\u0445 \u0451\u0441\u0442\u043E\u0439.",
      "err",
    );
    return;
  }
  if (!navigator.onLine) {
    note(
      "\u0421\u04AF\u043B\u0436\u044D\u044D\u0433\u04AF\u0439 \u0431\u0430\u0439\u043D\u0430 \u2014 \u0445\u043E\u043B\u0431\u043E\u0433\u0434\u0441\u043E\u043D\u044B \u0434\u0430\u0440\u0430\u0430 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443",
      "err",
    );
    return;
  }
  const token =
    window.turnstile && widgetId != null
      ? window.turnstile.getResponse(widgetId)
      : "";
  if (!token) {
    note(
      "\u0411\u0430\u0442\u0430\u043B\u0433\u0430\u0430\u0436\u0443\u0443\u043B\u0430\u043B\u0442 \u0434\u0443\u0443\u0441\u0430\u0430\u0433\u04AF\u0439 \u2014 \u0445\u044D\u0441\u044D\u0433 \u0445\u04AF\u043B\u044D\u044D\u0433\u044D\u044D\u0434 \u0434\u0430\u0445\u0438\u043D \u0434\u0430\u0440\u043D\u0430 \u0443\u0443",
      "err",
    );
    return;
  }
  busy = true;
  sendBtn.disabled = true;
  note(
    "\u0418\u043B\u0433\u044D\u044D\u0436 \u0431\u0430\u0439\u043D\u0430\u2026",
  );
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
      addSubmitted(words);
      note(
        "\u0418\u043B\u0433\u044D\u044D\u0433\u0434\u043B\u044D\u044D, \u0431\u0430\u044F\u0440\u043B\u0430\u043B\u0430\u0430!",
        "ok",
      );
      words = [];
      renderChips();
      noteEl.value = "";
      setTimeout(closeForm, 1400);
    } else if (r.status === 429) {
      note(
        "\u0426\u0430\u0433\u0438\u0439\u043D \u0445\u044F\u0437\u0433\u0430\u0430\u0440\u0442 \u0445\u04AF\u0440\u043B\u044D\u044D \u2014 \u0434\u0430\u0440\u0430\u0430 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443",
        "err",
      );
      try {
        window.turnstile.reset(widgetId);
      } catch (_) {}
    } else {
      note(
        "\u0418\u043B\u0433\u044D\u044D\u0445\u044D\u0434 \u0430\u043B\u0434\u0430\u0430 \u0433\u0430\u0440\u043B\u0430\u0430 \u2014 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443",
        "err",
      );
      try {
        window.turnstile.reset(widgetId);
      } catch (_) {}
    }
  } catch (_) {
    note(
      "\u0421\u04AF\u043B\u0436\u044D\u044D\u043D\u0438\u0439 \u0430\u043B\u0434\u0430\u0430 \u2014 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443",
      "err",
    );
    try {
      window.turnstile.reset(widgetId);
    } catch (_) {}
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
