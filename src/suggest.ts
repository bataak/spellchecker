import { escapeAttr } from "./htmlutil.ts";
import { sameRoot } from "./spell/morphology.ts";
import { getSubmitted, addSubmitted } from "./submitted.ts";
import {
  MAX_WORDS,
  postSuggestion,
  sendBlock,
  sendFailure,
} from "./suggestsend.ts";
import {
  buildErrorList,
  startsLowerAfterDash,
  type ErrorEntry,
  type Token,
} from "./spell/textcheck.ts";
import { copyText } from "./clipboard.ts";
import { attempt } from "./attempt.ts";

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
  readonly getBadTokens: () => Token[];
  readonly isDashSuffix: (token: Token) => boolean;
  readonly checkKnown: (
    words: string[],
  ) => Promise<Record<string, boolean> | null>;
}

const SITEKEY = "0x4AAAAAADvk6t3Gsh_j1vH7";
const WORD_RE = /^[\u0400-\u04FF][\u0400-\u04FF-]{1,49}$/u;
const LONG_PRESS_MS = 550;
const ISSUES_URL =
  "https://github.com/bataak/dict-mn/issues?q=is%3Aissue%20label%3Auser-submitted";

const FORM_TITLE = "Шинэ буюу алдаатай үг мэдэгдэх";
const SUBMITTED_TITLE = "Мэдэгдсэн үгс";

let scriptPromise: Promise<void> | null = null;

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

export function initSuggest(deps: SuggestDeps): void {
  let overlay: HTMLDivElement | null = null;
  let widgetId: string | null = null;
  let busy = false;
  let words: string[] = [];
  let showingSubmitted = false;
  let session = 0;
  let pendingAdd: Promise<void> = Promise.resolve();

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
              '<span class="suggest-chip">' + escapeAttr(word) + "</span>",
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

  function note(msg: string, kind?: string): void {
    const el = overlay!.querySelector<HTMLElement>(".suggest-note")!;
    el.textContent = msg;
    el.dataset.kind = kind || "";
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
          escapeAttr(word) +
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
    if (!deps.isDashSuffix(token)) return false;
    return startsLowerAfterDash(token.word);
  }

  function prefillFromErrors(): void {
    words = [];
    const list = buildErrorList(
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

  function wordNote(word: string, text: string): void {
    note("«" + word + "» — " + text, "err");
  }

  async function lookupKnown(
    list: string[],
  ): Promise<Record<string, boolean> | null> {
    if (!list.length) return null;
    try {
      return await deps.checkKnown(list);
    } catch {
      return null;
    }
  }

  async function acceptWords(
    candidates: string[],
    current: number,
  ): Promise<void> {
    const submitted = getSubmitted();
    const valid: string[] = [];
    for (const word of candidates) {
      if (!WORD_RE.test(word)) {
        wordNote(word, "кирилл үсгээр, 2–50 тэмдэгт байх ёстой");
        continue;
      }
      if (submitted.has(word.toLowerCase())) {
        wordNote(word, "энэ үгийг аль хэдийн мэдэгдсэн байна");
        continue;
      }
      if (!valid.some((item) => item.toLowerCase() === word.toLowerCase()))
        valid.push(word);
    }
    const known = await lookupKnown(valid);
    if (current !== session) return;
    let added = false;
    for (const word of valid) {
      if (known && known[word]) {
        wordNote(word, "энэ үг толь бичигт байна");
        continue;
      }
      if (words.length >= MAX_WORDS) {
        note("Хамгийн ихдээ " + MAX_WORDS + " үг", "err");
        break;
      }
      if (
        !words.some((existing) => existing.toLowerCase() === word.toLowerCase())
      ) {
        words.push(word);
        added = true;
      }
    }
    if (added) {
      renderChips();
      if (
        overlay!.querySelector<HTMLElement>(".suggest-note")!.dataset.kind !==
        "err"
      )
        note("");
    }
  }

  function addFromInput(commit: boolean): Promise<void> {
    const wordEl = overlay!.querySelector<HTMLInputElement>("#suggestWord")!;
    const parts = wordEl.value.split(/[\s,、，]+/);
    const tail = commit ? "" : (parts.pop() ?? "");
    wordEl.value = tail;
    const candidates = parts
      .map((part) => part.trim().normalize("NFC"))
      .filter(Boolean);
    if (!candidates.length) return pendingAdd;
    const current = session;
    pendingAdd = pendingAdd
      .then(() => acceptWords(candidates, current))
      .catch(() => undefined);
    return pendingAdd;
  }

  function collectCopyWords(): string[] {
    const wordEl = overlay!.querySelector<HTMLInputElement>("#suggestWord")!;
    const pending = wordEl.value
      .split(/[\s,、，]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const all = [...words];
    for (const word of pending) {
      if (
        !all.some((existing) => existing.toLowerCase() === word.toLowerCase())
      )
        all.push(word);
    }
    return all;
  }

  async function copyWordsToClipboard(): Promise<void> {
    const list = collectCopyWords();
    if (!list.length) {
      note("Хуулах үг алга");
      return;
    }
    try {
      await copyText(list.join("\n"));
      note(list.length + " үг санах ойд хуулагдлаа", "ok");
    } catch {
      note("Хуулж чадсангүй — дахин оролдоно уу", "err");
    }
  }

  function hasActiveSelection(): boolean {
    const active = document.activeElement;
    if (
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement) &&
      active.selectionStart !== active.selectionEnd
    )
      return true;
    const selection = window.getSelection();
    return selection != null && selection.toString().length > 0;
  }

  function attachHoldToCopy(el: HTMLElement): void {
    let pressStart = 0;
    let pressDuration = 0;
    let releasedAt = 0;
    let armTimer: ReturnType<typeof setTimeout> | null = null;
    let verifyTimer: ReturnType<typeof setTimeout> | null = null;
    const disarm = () => {
      if (armTimer) clearTimeout(armTimer);
      armTimer = null;
    };
    const clearVerify = () => {
      if (verifyTimer) clearTimeout(verifyTimer);
      verifyTimer = null;
    };
    el.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        pressStart = performance.now();
        pressDuration = 0;
        disarm();
        clearVerify();
        armTimer = setTimeout(() => {
          armTimer = null;
          if (showingSubmitted) return;
          const count = collectCopyWords().length;
          if (count) note(count + " үг санах ойд хуулагдлаа", "ok");
          else note("Хуулах үг алга");
        }, LONG_PRESS_MS);
      },
      { passive: true },
    );
    el.addEventListener("touchend", () => {
      disarm();
      if (pressStart) {
        pressDuration = performance.now() - pressStart;
        releasedAt = performance.now();
        if (pressDuration >= LONG_PRESS_MS) {
          clearVerify();
          verifyTimer = setTimeout(() => {
            verifyTimer = null;
            if (!showingSubmitted && collectCopyWords().length)
              note("Хуулж чадсангүй — дахин оролдоно уу", "err");
          }, 400);
        }
      }
      pressStart = 0;
    });
    el.addEventListener("touchcancel", () => {
      disarm();
      clearVerify();
      pressStart = 0;
      pressDuration = 0;
      note("");
    });
    el.addEventListener("contextmenu", (e) => {
      if (pressStart) e.preventDefault();
    });
    el.addEventListener("click", () => {
      clearVerify();
      const held =
        pressDuration >= LONG_PRESS_MS && performance.now() - releasedAt < 700;
      pressDuration = 0;
      if (held && !showingSubmitted) void copyWordsToClipboard();
    });
  }

  function closeForm(): void {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    session++;
    busy = false;
    const sendBtn = overlay.querySelector<HTMLButtonElement>(".suggest-send");
    if (sendBtn) sendBtn.disabled = false;
    resetTurnstile();
  }

  function resetTurnstile(): void {
    if (!window.turnstile || widgetId == null) return;
    const turnstile = window.turnstile;
    const id = widgetId;
    attempt(() => turnstile.reset(id), undefined);
  }

  function build(): void {
    overlay = document.createElement("div");
    overlay.className = "suggest-overlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="suggest-card" role="dialog" aria-modal="true" aria-labelledby="suggestTitle">' +
      '<h2 id="suggestTitle" class="suggest-title">Шинэ буюу алдаатай үг мэдэгдэх</h2>' +
      '<p class="suggest-hint">Шинэ үгийг үгийн санд хувиллын хамт нэмүүлэх буюу алдаа мэдээлэх</p>' +
      '<label class="suggest-label" for="suggestWord">Мэдэгдэх үг <span class="suggest-count" aria-hidden="true"></span></label>' +
      '<div class="suggest-chips"></div>' +
      '<div class="suggest-input-row">' +
      '<input id="suggestWord" class="suggest-input" type="text" maxlength="50" autocomplete="off" autocapitalize="off" spellcheck="false" />' +
      '<button type="button" class="suggest-clear-all" hidden title="Бүгдийг устгах" aria-label="Бүгдийг устгах">&times;</button>' +
      "</div>" +
      '<label class="suggest-label" for="suggestNote">Тайлбар (заавал биш)</label>' +
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
      '<button type="button" class="tbtn suggest-view-submitted" title="Миний мэдэгдсэн үгс">Мэдэгдсэн үгс</button>' +
      '<button type="button" class="tbtn suggest-cancel">Цуцлах</button>' +
      '<button type="button" class="tbtn suggest-send">Илгээх</button>' +
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
    overlay
      .querySelectorAll<HTMLElement>(
        "#suggestTitle, .suggest-card > .suggest-hint",
      )
      .forEach(attachHoldToCopy);
    const viewBtn = overlay.querySelector(".suggest-view-submitted")!;
    viewBtn.addEventListener("click", () =>
      setSubmittedView(!showingSubmitted),
    );
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
    const dropPress = (e: Event) => {
      cancelPress();
      if (e.type === "pointercancel" || (e as PointerEvent).buttons)
        longPressed = false;
    };
    viewBtn.addEventListener("pointerleave", dropPress);
    viewBtn.addEventListener("pointercancel", dropPress);
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
      .querySelector(".suggest-clear-all")!
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
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target === wordEl) return;
      if (target.tagName === "TEXTAREA") return;
      if (target.tagName === "BUTTON") return;
      if (target.tagName === "A") return;
      e.preventDefault();
      submit();
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (overlay!.hidden) return;
        if (e.key === "Escape") {
          closeForm();
          return;
        }
        const isCopyCombo =
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          (e.code === "KeyC" || e.key.toLowerCase() === "c");
        if (!isCopyCombo) return;
        e.stopPropagation();
        if (showingSubmitted) return;
        if (hasActiveSelection()) return;
        e.preventDefault();
        void copyWordsToClipboard();
      },
      true,
    );
  }

  async function openForm(): Promise<void> {
    if (!overlay) build();
    session++;
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
    } catch {
      note("Баталгаажуулалт ачаалагдсангүй — интернетээ шалгана уу", "err");
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
      resetTurnstile();
    }
  }

  async function submit(): Promise<void> {
    if (busy || showingSubmitted) return;
    const current = session;
    busy = true;
    await addFromInput(true);
    if (current !== session) return;
    busy = false;
    const noteEl = overlay!.querySelector<HTMLTextAreaElement>("#suggestNote")!;
    const sendBtn = overlay!.querySelector<HTMLButtonElement>(".suggest-send")!;
    const token =
      window.turnstile && widgetId != null
        ? window.turnstile.getResponse(widgetId)
        : "";

    const blocked = sendBlock(words.length, navigator.onLine, token);
    if (blocked) {
      note(blocked, "err");
      if (!words.length)
        overlay!.querySelector<HTMLInputElement>("#suggestWord")!.focus();
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    note("Илгээж байна…");
    const status = await postSuggestion({
      words,
      note: noteEl.value.trim(),
      turnstileToken: token,
    });
    if (status === 201) {
      addSubmitted(words);
      note("Илгээгдлээ, баярлалаа!", "ok");
      words = [];
      renderChips();
      noteEl.value = "";
      setTimeout(closeForm, 1400);
      return;
    }
    note(sendFailure(status), "err");
    resetTurnstile();
    busy = false;
    sendBtn.disabled = false;
  }

  document.querySelectorAll("a.suggestctl, a.suggest-word").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      void openForm();
    });
  });
}
