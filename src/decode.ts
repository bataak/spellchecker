import {
  detectVariant,
  hasMojibake,
  repairCyrillicDetailed,
} from "./archive/cp1251.ts";
import { cleanText, needsCleanup } from "./cleanup.ts";
import { editKind, isSeparatorInput } from "./input.ts";
import type { EditorPort } from "./ports.ts";

export interface DecodeDeps {
  readonly editor: EditorPort;
  readonly invalidate: () => void;
  readonly skip?: () => boolean;
}

export interface DecodeControl {
  readonly sync: () => void;
  readonly afterInput: (event: Event) => void;
  readonly announce: (message: string) => void;
}

interface FixButtonSpec {
  readonly selector: string;
  readonly label: string;
  readonly detect: (text: string) => boolean;
  readonly fix: (
    target: string,
    full: string,
  ) => { text: string; message: string } | null;
  readonly emptyMessage: string;
}

const DECODE_CHECK_DELAY = 500;
const DECODE_DONE_HOLD = 1400;
const DECODE_DONE_FADE = 900;
const DECODE_TYPING_WINDOW = 64;

export function initDecode(deps: DecodeDeps): DecodeControl {
  return initFixButton(deps, {
    selector: "#decodeBtn",
    label: "Үсэг таниулах",
    detect: hasMojibake,
    fix: (target, full) => {
      const result = repairCyrillicDetailed(target, detectVariant(full));
      if (result.text === target) return null;
      return {
        text: result.text,
        message: "Хөрвүүлэв — " + result.words + " үг",
      };
    },
    emptyMessage: "Хөрвүүлэх үг олдсонгүй",
  });
}

export function initClean(deps: DecodeDeps): DecodeControl {
  return initFixButton(deps, {
    selector: "#cleanBtn",
    label: "Цэвэрлэх",
    detect: needsCleanup,
    fix: (target) => {
      const text = cleanText(target);
      return text === target ? null : { text, message: "Цэвэрлэв" };
    },
    emptyMessage: "Цэвэрлэх зүйл олдсонгүй",
  });
}

function initFixButton(deps: DecodeDeps, spec: FixButtonSpec): DecodeControl {
  const editor = deps.editor.el;
  const decodeBtn = document.querySelector<HTMLButtonElement>(spec.selector);
  let decodeCheckTimer: number | null = null;
  let decodeDoneTimer: number | null = null;
  let decodeSkipNextInput = false;

  function sync(): void {
    if (!decodeBtn) return;
    if (decodeBtn.classList.contains("is-done")) return;
    decodeBtn.hidden = !!deps.skip?.() || !spec.detect(editor.value);
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
        button.textContent = spec.label;
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
    if (deps.skip?.()) return;
    decodeBtn.hidden = false;
  }

  function checkNearCaret(inserted: number): void {
    const caret = editor.selectionStart;
    const value = editor.value;
    const from = Math.max(0, caret - inserted - DECODE_TYPING_WINDOW);
    const to = Math.min(value.length, caret + DECODE_TYPING_WINDOW);
    if (spec.detect(value.slice(from, to))) reveal();
  }

  function checkNearCaretSoon(inserted: number): void {
    if (decodeCheckTimer) clearTimeout(decodeCheckTimer);
    decodeCheckTimer = window.setTimeout(() => {
      decodeCheckTimer = null;
      checkNearCaret(inserted);
    }, DECODE_CHECK_DELAY);
  }

  function checkInPasted(text: string): boolean {
    if (!text || !decodeBtn || !decodeBtn.hidden) return false;
    if (!spec.detect(text)) return false;
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
      else if (kind === "insert") {
        const inserted = (event as InputEvent).data?.length ?? 0;
        if (isSeparatorInput(event as InputEvent)) checkNearCaret(inserted);
        else checkNearCaretSoon(inserted);
      }
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
      const target = selected ? full.slice(start, end) : full;
      const result = spec.fix(target, full);
      if (!result) {
        showDecodeMessage(spec.emptyMessage);
        return;
      }
      const next = selected
        ? full.slice(0, start) + result.text + full.slice(end)
        : result.text;
      const caret = selected
        ? start + result.text.length
        : Math.min(start, result.text.length);
      deps.invalidate();
      void deps.editor.reformat(next, caret);
      showDecodeMessage(result.message);
    });
  }

  return { sync, afterInput, announce: showDecodeMessage };
}
