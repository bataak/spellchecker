import { getSubmitted, addSubmitted } from "./submitted.ts";
import { postSuggestion, sendBlock, sendFailure } from "./suggestsend.ts";
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

export interface SuggestDeps {
  readonly getBadTokens: () => Token[];
  readonly isDashSuffix: (token: Token) => boolean;
  readonly checkKnown: (
    words: string[],
  ) => Promise<Record<string, boolean> | null>;
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
    overlay.querySelector<T>(selector)!;
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
  overlay.querySelector(".suggest-submitted-chips")!.innerHTML =
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

export function initSuggest(deps: SuggestDeps): void {
  const turnstile = createTurnstileWidget();
  let form: FormParts | null = null;
  let list: WordList | null = null;
  let busy = false;
  let showingSubmitted = false;
  let session = 0;

  function note(msg: string, kind?: string): void {
    form!.noteEl.textContent = msg;
    form!.noteEl.dataset.kind = kind || "";
  }

  function setSubmittedView(on: boolean): void {
    const { card, title } = form!;
    if (on && window.matchMedia("(min-width: 701px)").matches)
      card.style.height = card.offsetHeight + "px";
    if (!on) card.style.height = "";
    showingSubmitted = on;
    card.classList.toggle("submitted-view", on);
    form!.viewBtn.classList.toggle("active", on);
    form!.sendBtn.disabled = on || busy;
    note("");
    if (on) renderSubmitted(form!);
    else title.textContent = FORM_TITLE;
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
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) closeForm();
    });
    overlay
      .querySelector(".suggest-cancel")!
      .addEventListener("click", closeForm);
    f.sendBtn.addEventListener("click", submit);
    overlay
      .querySelectorAll<HTMLElement>(
        "#suggestTitle, .suggest-card > .suggest-hint",
      )
      .forEach((el) =>
        attachHoldToCopy(el, {
          enabled: () => !showingSubmitted,
          count: () => words.copyWords().length,
          copy: words.copyToClipboard,
          note,
        }),
      );
    f.viewBtn.addEventListener("click", () =>
      setSubmittedView(!showingSubmitted),
    );
    attachIssuesPress(
      f.viewBtn,
      () =>
        getComputedStyle(overlay.querySelector(".suggest-issues")!).display ===
        "none",
    );
    overlay
      .querySelector(".suggest-clear-all")!
      .addEventListener("click", () => {
        words.set([]);
        note("");
        f.wordEl.focus();
      });
    bindWordInput(f.wordEl, words, submit);
    bindFormKeys(f, words, {
      close: closeForm,
      submit,
      copying: () => !showingSubmitted,
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
    try {
      await loadTurnstile();
    } catch {
      note("Баталгаажуулалт ачаалагдсангүй — интернетээ шалгана уу", "err");
      return;
    }
    turnstile.show(form.overlay.querySelector(".suggest-turnstile"));
  }

  async function submit(): Promise<void> {
    if (busy || showingSubmitted) return;
    const current = session;
    busy = true;
    await list!.addFromInput(true);
    if (current !== session) return;
    busy = false;
    const { noteInput, sendBtn } = form!;
    const token = turnstile.token();
    const words = list!.words();
    const blocked = sendBlock(words.length, navigator.onLine, token);
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
      note("Илгээгдлээ, баярлалаа!", "ok");
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

  document.querySelectorAll("a.suggestctl, a.suggest-word").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      void openForm();
    });
  });
}
