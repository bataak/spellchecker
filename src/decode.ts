import {
  detectVariant,
  hasMojibake,
  repairCyrillicDetailed,
} from "./cp1251.ts";
import { editKind, isSeparatorInput } from "./input.ts";

export interface DecodeDeps {
  readonly editor: HTMLTextAreaElement;
  readonly setEditorText: (text: string, caret: number | null) => void;
  readonly refresh: () => Promise<void> | void;
  readonly saveText: () => void;
}

export interface DecodeControl {
  readonly sync: () => void;
  readonly afterInput: (event: Event) => void;
}

const DECODE_CHECK_DELAY = 500;
const DECODE_LABEL = "Үсэг таниулах";
const DECODE_DONE_HOLD = 1400;
const DECODE_DONE_FADE = 900;
const DECODE_TYPING_WINDOW = 64;

export function initDecode(deps: DecodeDeps): DecodeControl {
  const { editor } = deps;
  const decodeBtn = document.querySelector<HTMLButtonElement>("#decodeBtn");
  let decodeCheckTimer: number | null = null;
  let decodeDoneTimer: number | null = null;
  let decodeSkipNextInput = false;

  function sync(): void {
    if (!decodeBtn) return;
    if (decodeBtn.classList.contains("is-done")) return;
    decodeBtn.hidden = !hasMojibake(editor.value);
  }

  function showDecodeMessage(message: string): void {
    const button = decodeBtn;
    if (!button) return;
    if (decodeDoneTimer) clearTimeout(decodeDoneTimer);
    button.hidden = false;
    button.disabled = true;
    button.textContent = message;
    button.classList.remove("is-fading");
    button.classList.add("is-done");
    decodeDoneTimer = window.setTimeout(() => {
      button.classList.add("is-fading");
      decodeDoneTimer = window.setTimeout(() => {
        decodeDoneTimer = null;
        button.classList.remove("is-done", "is-fading");
        button.disabled = false;
        button.textContent = DECODE_LABEL;
        sync();
      }, DECODE_DONE_FADE);
    }, DECODE_DONE_HOLD);
  }

  function syncSoon(): void {
    if (!decodeBtn) return;
    if (decodeCheckTimer) clearTimeout(decodeCheckTimer);
    decodeCheckTimer = window.setTimeout(() => {
      decodeCheckTimer = null;
      sync();
    }, DECODE_CHECK_DELAY);
  }

  function reveal(): void {
    if (!decodeBtn) return;
    if (decodeBtn.classList.contains("is-done")) return;
    decodeBtn.hidden = false;
  }

  function checkNearCaret(): void {
    const caret = editor.selectionStart;
    const value = editor.value;
    const from = Math.max(0, caret - DECODE_TYPING_WINDOW);
    const to = Math.min(value.length, caret + DECODE_TYPING_WINDOW);
    if (hasMojibake(value.slice(from, to))) reveal();
  }

  function checkInPasted(text: string): boolean {
    if (!text || !decodeBtn || !decodeBtn.hidden) return false;
    if (!hasMojibake(text)) return false;
    reveal();
    return true;
  }

  editor.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text") ?? "";
    if (checkInPasted(pasted)) decodeSkipNextInput = true;
  });

  function afterInput(event: Event): void {
    if (!decodeBtn) return;
    if (decodeSkipNextInput) {
      decodeSkipNextInput = false;
      return;
    }
    const kind = editKind(event);
    if (decodeBtn.hidden) {
      if (kind === "other") syncSoon();
      else if (kind === "insert" && isSeparatorInput(event as InputEvent))
        checkNearCaret();
      return;
    }
    if (kind === "insert") return;
    syncSoon();
  }

  if (decodeBtn) {
    decodeBtn.addEventListener("mousedown", (event) => event.preventDefault());
    decodeBtn.addEventListener("click", () => {
      const full = editor.value;
      if (!full) return;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const selected = end > start;
      const variant = detectVariant(full);
      const target = selected ? full.slice(start, end) : full;
      const result = repairCyrillicDetailed(target, variant);
      if (result.text === target) {
        showDecodeMessage("Хөрвүүлэх үг олдсонгүй");
        return;
      }
      const next = selected
        ? full.slice(0, start) + result.text + full.slice(end)
        : result.text;
      const caret = selected ? start + result.text.length : start;
      const scrollTop = editor.scrollTop;
      const scrollLeft = editor.scrollLeft;
      const restoreView = (): void => {
        editor.scrollTop = scrollTop;
        editor.scrollLeft = scrollLeft;
      };
      deps.setEditorText(next, caret);
      restoreView();
      void Promise.resolve(deps.refresh()).then(restoreView);
      deps.saveText();
      showDecodeMessage("Хөрвүүлэв — " + result.words + " үг");
    });
  }

  return { sync, afterInput };
}
