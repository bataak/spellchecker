import { getSubmitted } from "./submitted.ts";
import { MAX_WORDS } from "./suggestsend.ts";
import {
  buildErrorList,
  startsLowerAfterDash,
  type Token,
} from "../spell/textcheck.ts";
import { copyText } from "../ui/clipboard.ts";
import {
  copyList,
  mergeWords,
  prefillWords,
  screenWords,
  splitParts,
  type WordNote,
} from "./suggestwords.ts";
import { COPY_FAILED, copiedNote, wordChips } from "./suggestmarkup.ts";

export interface WordListDeps {
  readonly overlay: HTMLElement;
  readonly session: () => number;
  readonly note: (msg: string, kind?: string) => void;
  readonly getBadTokens: () => Token[];
  readonly isDashSuffix: (token: Token) => boolean;
  readonly checkKnown: (
    words: string[],
  ) => Promise<Record<string, boolean> | null>;
}

export interface WordList {
  words(): readonly string[];
  set(next: string[]): void;
  pop(): void;
  prefill(): void;
  addFromInput(commit: boolean): Promise<void>;
  copyWords(): string[];
  copyToClipboard(): Promise<void>;
}

export function createWordList(d: WordListDeps): WordList {
  const { overlay, note } = d;
  const wordEl = overlay.querySelector<HTMLInputElement>("#suggestWord")!;
  const noteEl = overlay.querySelector<HTMLElement>(".suggest-note")!;
  let words: string[] = [];
  let pendingAdd: Promise<void> = Promise.resolve();

  function render(): void {
    const box = overlay.querySelector(".suggest-chips")!;
    const clr = overlay.querySelector<HTMLElement>(".suggest-clear-all");
    if (clr) clr.hidden = words.length < 2;
    const cnt = overlay.querySelector<HTMLElement>(".suggest-count");
    if (cnt) {
      cnt.textContent = words.length ? "(" + words.length + ")" : "";
      cnt.classList.toggle("over", words.length > MAX_WORDS);
    }
    box.innerHTML = wordChips(words);
    box.querySelectorAll<HTMLElement>(".suggest-chip-x").forEach((btn) => {
      btn.addEventListener("click", () => {
        words.splice(Number(btn.dataset.i), 1);
        render();
      });
    });
  }

  const showNote = ({ word, text }: WordNote): void =>
    note(word === null ? text : "«" + word + "» — " + text, "err");

  async function lookupKnown(
    list: string[],
  ): Promise<Record<string, boolean> | null> {
    if (!list.length) return null;
    try {
      return await d.checkKnown(list);
    } catch {
      return null;
    }
  }

  async function acceptWords(
    candidates: string[],
    current: number,
  ): Promise<void> {
    const screened = screenWords(candidates, getSubmitted());
    screened.notes.forEach(showNote);
    const known = await lookupKnown(screened.valid);
    if (current !== d.session()) return;
    const merged = mergeWords(words, screened.valid, known, MAX_WORDS);
    merged.notes.forEach(showNote);
    words = merged.words;
    if (!merged.added) return;
    render();
    if (noteEl.dataset.kind !== "err") note("");
  }

  const copyWords = (): string[] => copyList(words, wordEl.value);

  return {
    words: () => words,
    set(next) {
      words = next;
      render();
    },
    pop() {
      words.pop();
      render();
    },
    prefill() {
      const lowerDash = (token: Token): boolean =>
        d.isDashSuffix(token) && startsLowerAfterDash(token.word);
      words = prefillWords(
        buildErrorList(d.getBadTokens().filter((token) => !lowerDash(token))),
        getSubmitted(),
      );
      render();
    },
    addFromInput(commit) {
      const parts = splitParts(wordEl.value);
      wordEl.value = commit ? "" : (parts.pop() ?? "");
      const candidates = parts
        .map((part) => part.trim().normalize("NFC"))
        .filter(Boolean);
      if (!candidates.length) return pendingAdd;
      const current = d.session();
      pendingAdd = pendingAdd
        .then(() => acceptWords(candidates, current))
        .catch(() => undefined);
      return pendingAdd;
    },
    copyWords,
    async copyToClipboard() {
      const list = copyWords();
      if (!list.length) {
        note("Хуулах үг алга");
        return;
      }
      try {
        await copyText(list.join("\n"));
        note(copiedNote(list.length), "ok");
      } catch {
        note(COPY_FAILED, "err");
      }
    },
  };
}
