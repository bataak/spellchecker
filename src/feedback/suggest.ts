import { requireEl } from "../ui/dom.ts";
import { getSubmitted, addSubmitted } from "./submitted.ts";
import { postSuggestion, SENT, sendBlock, sendFailure } from "./suggestsend.ts";
import type { Token } from "../spell/textcheck.ts";
import { createTurnstileWidget, loadTurnstile } from "./turnstile.ts";
import {
  FORM_TITLE,
  SUGGEST_HTML,
  submittedChips,
  submittedTitle,
} from "./suggestmarkup.ts";
import { attachHoldToCopy, attachIssuesPress } from "./suggestpress.ts";
import { createWordList, type WordList } from "./suggestlist.ts";
import { findTypos, typoNote } from "./suggestwords.ts";

export interface SuggestDeps {
  readonly getBadTokens: () => Token[];
  readonly isDashSuffix: (token: Token) => boolean;
  readonly checkKnown: (
    words: string[],
  ) => Promise<Record<string, boolean> | null>;
  readonly suggest: (word: string) => Promise<string[]>;
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

function isCopyCombo(e: KeyboardEvent): boolean {
  return (
    (e.ctrlKey || e.metaKey) &&
    !e.altKey &&
    (e.code === "KeyC" || e.key.toLowerCase() === "c")
  );
}

function submitsOnEnter(target: EventTarget | null, wordEl: Element): boolean {
  if (!(target instanceof Element) || target === wordEl) return false;
  return !["TEXTAREA", "BUTTON", "A"].includes(target.tagName);
}

interface FormParts {
  readonly overlay: HTMLDivElement;
  readonly card: HTMLElement;
  readonly title: HTMLElement;
  readonly wordEl: HTMLInputElement;
  readonly noteInput: HTMLTextAreaElement;
  readonly noteEl: HTMLElement;
  readonly sendBtn: HTMLButtonElement;
  readonly viewBtn: HTMLElement;
}

function buildForm(): FormParts {
  const overlay = document.createElement("div");
  overlay.className = "suggest-overlay";
  overlay.hidden = true;
  overlay.innerHTML = SUGGEST_HTML;
  document.body.appendChild(overlay);
  const find = <T extends HTMLElement>(selector: string): T =>
    requireEl<T>(selector, overlay);
  return {
    overlay,
    card: find(".suggest-card"),
    title: find("#suggestTitle"),
    wordEl: find<HTMLInputElement>("#suggestWord"),
    noteInput: find<HTMLTextAreaElement>("#suggestNote"),
    noteEl: find(".suggest-note"),
    sendBtn: find<HTMLButtonElement>(".suggest-send"),
    viewBtn: find(".suggest-view-submitted"),
  };
}

function bindWordInput(
  wordEl: HTMLInputElement,
  list: WordList,
  submit: () => Promise<void>,
): void {
  wordEl.addEventListener("input", () => list.addFromInput(false));
  wordEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (wordEl.value.trim()) void list.addFromInput(true);
      else void submit();
    } else if (
      e.key === "Backspace" &&
      wordEl.value === "" &&
      list.words().length
    )
      list.pop();
  });
  wordEl.addEventListener("blur", () => list.addFromInput(true));
}

function renderSubmitted({ overlay, title }: FormParts): void {
  const submitted = [...getSubmitted()].sort((a, b) => a.localeCompare(b));
  title.innerHTML = submittedTitle(submitted.length);
  requireEl(".suggest-submitted-chips", overlay).innerHTML =
    submittedChips(submitted);
}

function bindFormKeys(
  f: FormParts,
  words: WordList,
  on: { close(): void; submit(): Promise<void>; copying(): boolean },
): void {
  f.overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !submitsOnEnter(e.target, f.wordEl)) return;
    e.preventDefault();
    void on.submit();
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (f.overlay.hidden) return;
      if (e.key === "Escape") {
        on.close();
        return;
      }
      if (!isCopyCombo(e)) return;
      e.stopPropagation();
      if (!on.copying() || hasActiveSelection()) return;
      e.preventDefault();
      void words.copyToClipboard();
    },
    true,
  );
}

function paintView(f: FormParts, on: boolean, busy: boolean): void {
  const { card, title } = f;
  if (on && window.matchMedia("(min-width: 701px)").matches)
    card.style.height = card.offsetHeight + "px";
  if (!on) card.style.height = "";
  card.classList.toggle("submitted-view", on);
  f.viewBtn.classList.toggle("active", on);
  f.sendBtn.disabled = on || busy;
  if (on) renderSubmitted(f);
  else title.textContent = FORM_TITLE;
}

async function showTurnstile(
  turnstile: ReturnType<typeof createTurnstileWidget>,
  overlay: HTMLElement,
  note: (msg: string, kind?: string) => void,
): Promise<void> {
  try {
    await loadTurnstile();
  } catch {
    note("Баталгаажуулалт ачаалагдсангүй — интернетээ шалгана уу", "err");
    return;
  }
  turnstile.show(overlay.querySelector(".suggest-turnstile"));
}

interface FormHandlers {
  close(): void;
  submit(): Promise<void>;
  note(msg: string, kind?: string): void;
  copying(): boolean;
  toggleView(): void;
}

function bindForm(f: FormParts, words: WordList, on: FormHandlers): void {
  const { overlay } = f;
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) on.close();
  });
  requireEl(".suggest-cancel", overlay).addEventListener("click", on.close);
  f.sendBtn.addEventListener("click", on.submit);
  overlay
    .querySelectorAll<HTMLElement>(
      "#suggestTitle, .suggest-card > .suggest-hint",
    )
    .forEach((el) =>
      attachHoldToCopy(el, {
        enabled: on.copying,
        count: () => words.copyWords().length,
        copy: words.copyToClipboard,
        note: on.note,
      }),
    );
  f.viewBtn.addEventListener("click", on.toggleView);
  attachIssuesPress(
    f.viewBtn,
    () =>
      getComputedStyle(requireEl(".suggest-issues", overlay)).display ===
      "none",
  );
  requireEl(".suggest-clear-all", overlay).addEventListener("click", () => {
    words.set([]);
    on.note("");
    f.wordEl.focus();
  });
  bindWordInput(f.wordEl, words, on.submit);
  bindFormKeys(f, words, on);
}

function bindOpenLinks(open: () => Promise<void>): void {
  document.querySelectorAll("a.suggestctl, a.suggest-word").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      void open();
    });
  });
}

function createTypoGate(
  suggest: SuggestDeps["suggest"],
): (words: readonly string[]) => Promise<string | null> {
  let confirmed = "";
  return async (words) => {
    const typos = await findTypos(words, suggest);
    const key = words.join("\n");
    if (!typos.length || confirmed === key) return null;
    confirmed = key;
    return typoNote(typos);
  };
}

export function initSuggest(deps: SuggestDeps): void {
  const turnstile = createTurnstileWidget();
  let form: FormParts | null = null;
  let list: WordList | null = null;
  let busy = false;
  let showingSubmitted = false;
  let session = 0;
  const typoWarning = createTypoGate(deps.suggest);

  function note(msg: string, kind?: string): void {
    form!.noteEl.textContent = msg;
    form!.noteEl.dataset.kind = kind || "";
  }

  function setSubmittedView(on: boolean): void {
    paintView(form!, on, busy);
    showingSubmitted = on;
    note("");
  }

  function closeForm(): void {
    if (!form || form.overlay.hidden) return;
    form.overlay.hidden = true;
    session++;
    busy = false;
    form.sendBtn.disabled = false;
    turnstile.reset();
  }

  function build(): [FormParts, WordList] {
    const f = buildForm();
    const { overlay } = f;
    const words = createWordList({
      overlay,
      session: () => session,
      note,
      getBadTokens: deps.getBadTokens,
      isDashSuffix: deps.isDashSuffix,
      checkKnown: deps.checkKnown,
    });
    bindForm(f, words, {
      close: closeForm,
      submit,
      note,
      copying: () => !showingSubmitted,
      toggleView: () => setSubmittedView(!showingSubmitted),
    });
    return [f, words];
  }

  async function openForm(): Promise<void> {
    if (!form) [form, list] = build();
    session++;
    form.overlay.hidden = false;
    setSubmittedView(false);
    note("");
    list!.prefill();
    form.noteInput.value = "";
    form.wordEl.value = "";
    await showTurnstile(turnstile, form.overlay, note);
  }

  async function submit(): Promise<void> {
    if (busy || showingSubmitted) return;
    const current = session;
    busy = true;
    await list!.addFromInput(true);
    if (current !== session) return;
    const { noteInput, sendBtn } = form!;
    const token = turnstile.token();
    const words = list!.words();
    const blocked =
      sendBlock(words.length, navigator.onLine, token) ??
      (await typoWarning(words));
    if (current !== session) return;
    busy = false;
    if (blocked) {
      note(blocked, "err");
      if (!words.length) form!.wordEl.focus();
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    note("Илгээж байна…");
    const status = await postSuggestion({
      words: [...words],
      note: noteInput.value.trim(),
      turnstileToken: token,
    });
    if (status === 201) {
      addSubmitted([...words]);
      note(SENT, "ok");
      list!.set([]);
      noteInput.value = "";
      setTimeout(closeForm, 1400);
      return;
    }
    note(sendFailure(status), "err");
    turnstile.reset();
    busy = false;
    sendBtn.disabled = false;
  }

  bindOpenLinks(openForm);
}
