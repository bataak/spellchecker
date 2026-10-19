import {
  defineHint,
  exportHint,
  initHints,
  keyboardHint,
  layoutHint,
  modeHint,
  openHint,
  spellDictHint,
} from "../ui/hint.ts";
import { caretPoint } from "../editor/kblayout.ts";

export interface AppHintsDeps {
  readonly editor: HTMLTextAreaElement;
  readonly markdownActive: () => boolean;
}

const find = (sel: string) => (): HTMLElement | null =>
  document.querySelector<HTMLElement>(sel);

export function initAppHints({
  editor,
  markdownActive,
}: AppHintsDeps): () => void {
  const caretRect = (): DOMRect | null => {
    const caret = caretPoint(editor);
    const box = editor.getBoundingClientRect();
    if (caret.y < box.top || caret.y + caret.height > box.bottom) return null;
    return new DOMRect(caret.x, caret.y, 0, caret.height);
  };
  const keyboardTarget = (): HTMLElement | null =>
    document.activeElement !== editor ||
    document.querySelector(".layout-chip:not([hidden])")
      ? null
      : editor;

  return initHints(() => {
    if (document.documentElement.classList.contains("booting")) return [];
    const common = [
      keyboardHint(keyboardTarget, caretRect),
      modeHint(find(".md-select")),
      layoutHint(find(".measure-btn.is-shown")),
    ];
    if (markdownActive()) return [...common, exportHint(find("#saveBtn"))];
    if (editor.value.trim()) return [...common, defineHint(find("#defineBtn"))];
    return [
      ...common,
      openHint(find("#openBtn")),
      spellDictHint(find(".dict-toggle")),
    ];
  });
}
