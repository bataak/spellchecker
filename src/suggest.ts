import { sameRoot } from "./morphology.ts";
import { getSubmitted, addSubmitted } from "./submitted.ts";
import { startsLowerAfterDash } from "./textcheck.ts";
import type { Token, ErrorEntry } from "./textcheck.ts";

interface Turnstile {
  render(
    el: Element | null,
    options: { sitekey: string; theme: string },
  ): string;
  reset(widgetId: string | null): void;
  getResponse(widgetId: string): string;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export interface SuggestDeps {
  getBadTokens?: () => Token[];
  buildErrorList?: (tokens: Token[]) => ErrorEntry[];
  isDashSuffix?: (token: Token) => boolean;
}

const ENDPOINT = "https://api.bichig.dev/suggest";
const SITEKEY = "0x4AAAAAADvk6t3Gsh_j1vH7";
const WORD_RE = /^[\u0400-\u04FF][\u0400-\u04FF-]{1,49}$/u;
const MAX_WORDS = 50;
const ISSUES_URL =
  "https://github.com/bataak/dict-mn/issues?q=is%3Aissue%20label%3Auser-submitted";

let overlay: HTMLDivElement | null = null;
let widgetId: string | null = null;
let scriptPromise: Promise<void> | null = null;
let busy = false;
let words: string[] = [];
let deps: SuggestDeps = {};
let showingSubmitted = false;

const FORM_TITLE = "Шинэ буюу алдаатай үг мэдэгдэх";
const SUBMITTED_TITLE = "Мэдэгдсэн үгс";

function renderSubmittedList(): void {
  const box = overlay!.querySelector(".suggest-submitted-chips")!;
  const list = [...getSubmitted()].sort((a, b) => a.localeCompare(b));
  overlay!.querySelector("#suggestTitle")!.innerHTML = list.length
    ? SUBMITTED_TITLE +
      ' <span class="suggest-count" aria-hidden="true">(' +
      list.length +
      ")</span>"
    : SUBMITTED_TITLE;
  box.innerHTML = list.length
    ? list
        .map(
          (word) =>
            '<span class="suggest-chip">' + escapeChip(word) + "</span>",
        )
        .join("")
    : '<span class="suggest-hint">Одоогоор мэдэгдсэн үг алга</span>';
}

function setSubmittedView(on: boolean): void {
  const card = overlay!.querySelector<HTMLElement>(".suggest-card")!;
  if (on && window.matchMedia("(min-width: 701px)").matches) {
    card.style.height = card.offsetHeight + "px";
  }
  if (!on) card.style.height = "";
  showingSubmitted = on;
  card.classList.toggle("submitted-view", on);
  overlay!
    .querySelector(".suggest-view-submitted")!
    .classList.toggle("active", on);
  overlay!.querySelector<HTMLButtonElement>(".suggest-send")!.disabled =
    on || busy;
  note("");
  if (on) renderSubmittedList();
  else overlay!.querySelector("#suggestTitle")!.textContent = FORM_TITLE;
}

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const turnstileScript = document.createElement("script");
      turnstileScript.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      turnstileScript.async = true;
      turnstileScript.onload = () => resolve();
      turnstileScript.onerror = () => {
        scriptPromise = null;
        turnstileScript.remove();
        reject(new Error("turnstile-load"));
      };
      document.head.appendChild(turnstileScript);
    });
  }
  return scriptPromise;
}

function note(msg: string, kind?: string): void {
  const el = overlay!.querySelector<HTMLElement>(".suggest-note")!;
  el.textContent = msg;
  el.dataset.kind = kind || "";
}

function escapeChip(text: string): string {
  return text.replace(/[&<>"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&quot;";
  });
}

function renderChips(): void {
  const box = overlay!.querySelector(".suggest-chips")!;
  const clr = overlay!.querySelector<HTMLElement>(".suggest-clear-all");
  if (clr) clr.hidden = words.length < 2;
  const cnt = overlay!.querySelector<HTMLElement>(".suggest-count");
  if (cnt) {
    cnt.textContent = words.length ? "(" + words.length + ")" : "";
    cnt.classList.toggle("over", words.length > MAX_WORDS);
  }
  box.innerHTML = words
    .map(
      (word, index) =>
        '<span class="suggest-chip">' +
        escapeChip(word) +
        '<button type="button" class="suggest-chip-x" data-i="' +
        index +
        '" aria-label="Устгах">&times;</button></span>',
    )
    .join("");
  box.querySelectorAll<HTMLElement>(".suggest-chip-x").forEach((btn) => {
    btn.addEventListener("click", () => {
      words.splice(Number(btn.dataset.i), 1);
      renderChips();
    });
  });
}

function isLowerDashSuffix(token: Token): boolean {
  if (!deps.isDashSuffix || !deps.isDashSuffix(token)) return false;
  return startsLowerAfterDash(token.word);
}

function prefillFromErrors(): void {
  words = [];
  if (!deps.getBadTokens || !deps.buildErrorList) return;
  const list = deps
    .buildErrorList(
      deps.getBadTokens().filter((token) => !isLowerDashSuffix(token)),
    )
    .filter((token) => WORD_RE.test(token.word))
    .sort((a, b) => a.word.length - b.word.length);
  const submitted = getSubmitted();
  const kept: { key: string; token: ErrorEntry }[] = [];
  for (const token of list) {
    const key = token.word.toLowerCase();
    if (submitted.has(key)) continue;
    if (kept.some((keptEntry) => sameRoot(keptEntry.key, key))) continue;
    kept.push({ key, token });
  }
  kept.sort((a, b) => a.token.word.localeCompare(b.token.word, "mn"));
  for (const keptEntry of kept) words.push(keptEntry.token.word);
}

function addFromInput(commit: boolean): void {
  const wordEl = overlay!.querySelector<HTMLInputElement>("#suggestWord")!;
  const parts = wordEl.value.split(/[\s,\u3001\uFF0C]+/);
  const tail = commit ? "" : (parts.pop() ?? "");
  const submitted = getSubmitted();
  let added = false;
  for (const rawPart of parts) {
    const word = rawPart.trim();
    if (!word) continue;
    if (!WORD_RE.test(word)) {
      note(
        "\u00AB" +
          word +
          "\u00BB \u2014 \u043A\u0438\u0440\u0438\u043B\u043B \u04AF\u0441\u0433\u044D\u044D\u0440, 2\u201350 \u0442\u044D\u043C\u0434\u044D\u0433\u0442 \u0431\u0430\u0439\u0445 \u0451\u0441\u0442\u043E\u0439",
        "err",
      );
      continue;
    }
    if (submitted.has(word.toLowerCase())) {
      note(
        "\u00AB" + word + "\u00BB \u2014 энэ үгийг аль хэдийн мэдэгдсэн байна",
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
    if (
      !words.some((existing) => existing.toLowerCase() === word.toLowerCase())
    ) {
      words.push(word);
      added = true;
    }
  }
  wordEl.value = tail;
  if (added) {
    renderChips();
    if (
      overlay!.querySelector<HTMLElement>(".suggest-note")!.dataset.kind !==
      "err"
    )
      note("");
  }
}

function closeForm(): void {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  if (window.turnstile && widgetId != null) {
    try {
      window.turnstile.reset(widgetId);
    } catch (_) {}
  }
}

function build(): void {
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

  const wordEl = overlay.querySelector<HTMLInputElement>("#suggestWord")!;

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) closeForm();
  });
  overlay
    .querySelector(".suggest-cancel")!
    .addEventListener("click", closeForm);
  overlay.querySelector(".suggest-send")!.addEventListener("click", submit);
  const viewBtn = overlay.querySelector(".suggest-view-submitted")!;
  viewBtn.addEventListener("click", () => setSubmittedView(!showingSubmitted));
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressed = false;
  const issuesHidden = () =>
    getComputedStyle(overlay!.querySelector(".suggest-issues")!).display ===
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
  overlay.querySelector(".suggest-clear-all")!.addEventListener("click", () => {
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
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target === wordEl) return;
    if (target.tagName === "TEXTAREA") return;
    if (target.tagName === "BUTTON") return;
    if (target.tagName === "A") return;
    e.preventDefault();
    submit();
  });

  document.addEventListener("keydown", (e) => {
    if (!overlay!.hidden && e.key === "Escape") closeForm();
  });
}

async function openForm(): Promise<void> {
  if (!overlay) build();
  overlay!.hidden = false;
  setSubmittedView(false);
  note("");
  prefillFromErrors();
  renderChips();
  overlay!.querySelector<HTMLTextAreaElement>("#suggestNote")!.value = "";
  const wordEl = overlay!.querySelector<HTMLInputElement>("#suggestWord")!;
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
    widgetId = window.turnstile!.render(
      overlay!.querySelector(".suggest-turnstile"),
      { sitekey: SITEKEY, theme },
    );
  } else {
    try {
      window.turnstile!.reset(widgetId);
    } catch (_) {}
  }
}

async function submit(): Promise<void> {
  if (busy || showingSubmitted) return;
  addFromInput(true);
  const noteEl = overlay!.querySelector<HTMLTextAreaElement>("#suggestNote")!;
  const sendBtn = overlay!.querySelector<HTMLButtonElement>(".suggest-send")!;

  if (!words.length) {
    note(
      "\u0414\u043E\u0440 \u0445\u0430\u044F\u0436 \u043D\u044D\u0433 \u04AF\u0433 \u043E\u0440\u0443\u0443\u043B\u043D\u0430 \u0443\u0443",
      "err",
    );
    overlay!.querySelector<HTMLInputElement>("#suggestWord")!.focus();
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
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        words,
        note: noteEl.value.trim(),
        turnstileToken: token,
      }),
    });
    if (response.status === 201) {
      addSubmitted(words);
      note(
        "\u0418\u043B\u0433\u044D\u044D\u0433\u0434\u043B\u044D\u044D, \u0431\u0430\u044F\u0440\u043B\u0430\u043B\u0430\u0430!",
        "ok",
      );
      words = [];
      renderChips();
      noteEl.value = "";
      setTimeout(closeForm, 1400);
    } else if (response.status === 429) {
      note(
        "\u0426\u0430\u0433\u0438\u0439\u043D \u0445\u044F\u0437\u0433\u0430\u0430\u0440\u0442 \u0445\u04AF\u0440\u043B\u044D\u044D \u2014 \u0434\u0430\u0440\u0430\u0430 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443",
        "err",
      );
      try {
        window.turnstile!.reset(widgetId);
      } catch (_) {}
    } else {
      note(
        "\u0418\u043B\u0433\u044D\u044D\u0445\u044D\u0434 \u0430\u043B\u0434\u0430\u0430 \u0433\u0430\u0440\u043B\u0430\u0430 \u2014 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443",
        "err",
      );
      try {
        window.turnstile!.reset(widgetId);
      } catch (_) {}
    }
  } catch (_) {
    note(
      "\u0421\u04AF\u043B\u0436\u044D\u044D\u043D\u0438\u0439 \u0430\u043B\u0434\u0430\u0430 \u2014 \u0434\u0430\u0445\u0438\u043D \u043E\u0440\u043E\u043B\u0434\u043E\u043D\u043E \u0443\u0443",
      "err",
    );
    try {
      window.turnstile!.reset(widgetId);
    } catch (_) {}
  } finally {
    busy = false;
    sendBtn.disabled = false;
  }
}

export function initSuggest(options?: SuggestDeps): void {
  deps = options || {};
  document.querySelectorAll("a.suggestctl, a.suggest-word").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openForm();
    });
  });
}
