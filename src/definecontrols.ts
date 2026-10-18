import { offsetAtPoint, rangeRectAt } from "./backdrop.ts";
import type { DefDock } from "./defdock.ts";
import type { DefTip } from "./deftip.ts";
import { openDictManager } from "./dict/dictmanager.ts";
import { isTouch } from "./input.ts";
import type { Popover } from "./popover.ts";
import { isLookupKey, wordAt, type WordSpan } from "./spell/lookup.ts";
import type { SpellChecker } from "./spell/spellchecker.ts";
import type { Token } from "./spell/textcheck.ts";

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;
const LATIN_WORD = /\p{Script=Latin}/u;
const ENGLISH_REMIND_MS = 60000;
const LONG_PRESS_MS = 550;
const NO_DICT_MESSAGE =
  "Толь нэмэхийн тулд Shift товчийг Үгийн тайлбар харах товчтой хамт дарна уу";
const NO_DICT_TOUCH_MESSAGE =
  "Толь нэмэхийн тулд Үгийн тайлбар харах товчийг удаан дарна уу";

function isDictManagerKey(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    event.altKey &&
    event.code === "Space"
  );
}

function isHoverDefineKey(e: KeyboardEvent | PointerEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
}

export function selectedWord(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  latin: boolean,
): WordSpan | null {
  if (selectionStart === selectionEnd)
    return wordAt(value, selectionStart, latin);
  let start = selectionStart;
  let end = selectionEnd;
  while (start < end && !WORD_CHAR.test(value.charAt(start))) start++;
  while (end > start && !WORD_CHAR.test(value.charAt(end - 1))) end--;
  if (start >= end) return null;
  const span = wordAt(value, start, latin);
  return span && span.start <= start && span.end >= end ? span : null;
}

export interface DefineControlsDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: HTMLElement;
  readonly checker: SpellChecker;
  readonly defTip: DefTip;
  readonly defDock: DefDock;
  readonly pop: Popover;
  readonly holdStatus: (html: string, ms?: number, animate?: boolean) => void;
  readonly englishEnabled: () => ReadonlySet<string>;
  readonly errorAtCaret: () => Token | null;
  readonly showErrorPopover: (token: Token) => void;
}

export function initDefineControls(deps: DefineControlsDeps): void {
  const { editor, backdrop, checker, defTip, defDock, pop, holdStatus } = deps;

  let latinDicts: boolean | null = null;
  checker.onDictScripts = (latin) => {
    latinDicts = latin;
  };
  const latinLookup = (): boolean => latinDicts !== false;

  let englishRemindedAt = -Infinity;
  const remindEnglish = (word: string): void => {
    if (!LATIN_WORD.test(word)) return;
    const enabled = deps.englishEnabled();
    const loaded = checker.loadedIds.some(
      (id) => id.startsWith("en") && enabled.has(id),
    );
    if (loaded) return;
    const now = performance.now();
    if (now - englishRemindedAt < ENGLISH_REMIND_MS) return;
    englishRemindedAt = now;
    holdStatus(
      "Англи үгийн үндсийг танихын тулд англи толийг асаана уу (" +
        (/mac|iphone|ipad/i.test(navigator.platform) ? "⌘⇧L" : "Ctrl+Shift+L") +
        ")",
      6000,
      false,
    );
  };

  const showDefinition = (span: WordSpan, x?: number): void => {
    void defTip
      .showWordDefinition(span, x)
      .then(() => remindEnglish(span.word));
  };

  const wordForLookup = (): WordSpan | null =>
    selectedWord(
      editor.value,
      editor.selectionStart,
      editor.selectionEnd,
      latinLookup(),
    );

  const manageDicts = (): Promise<void> =>
    openDictManager({
      list: () => checker.listDicts?.() ?? Promise.resolve([]),
      reload: () => checker.reloadDicts?.(),
      reorder: () => checker.reorderDicts?.(),
      changed: () => defTip.resetDefinitions(),
      status: (message) => holdStatus(message, 5000, false),
    });

  const defineBtn = document.querySelector<HTMLButtonElement>("#defineBtn");
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressArmed = false;

  defineBtn?.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    pressArmed = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressArmed = true;
    }, LONG_PRESS_MS);
  });
  defineBtn?.addEventListener("pointerup", () => clearTimeout(pressTimer));
  for (const type of ["pointercancel", "pointerleave"])
    defineBtn?.addEventListener(type, (event) => {
      clearTimeout(pressTimer);
      if (type === "pointercancel" || (event as PointerEvent).buttons)
        pressArmed = false;
    });
  defineBtn?.addEventListener("contextmenu", (event) => event.preventDefault());

  defineBtn?.addEventListener("click", async (event) => {
    if (pressArmed || event.shiftKey || event.ctrlKey || event.metaKey) {
      pressArmed = false;
      void manageDicts();
      return;
    }
    const caretToken = deps.errorAtCaret();
    if (caretToken) {
      deps.showErrorPopover(caretToken);
      return;
    }
    if (!checker.define) return;
    const span = wordForLookup();
    if (!span) {
      holdStatus("Тайлбар харах үг дээрээ товшоод дахин дарна уу", 3000, false);
      return;
    }
    const definition = await defTip.definitionFor(
      editor.value.slice(span.start, span.end),
    );
    if (definition.dicts === 0) {
      holdStatus(
        isTouch() ? NO_DICT_TOUCH_MESSAGE : NO_DICT_MESSAGE,
        6000,
        false,
      );
      return;
    }
    if (isTouch()) void pop.openWordPanel(span);
    else showDefinition(span);
  });

  editor.addEventListener("keydown", (e) => {
    if (!e.isComposing && isDictManagerKey(e)) {
      e.preventDefault();
      void manageDicts();
      return;
    }
    if (e.isComposing || !isLookupKey(e)) return;
    const caretToken = deps.errorAtCaret();
    if (caretToken) {
      e.preventDefault();
      deps.showErrorPopover(caretToken);
      return;
    }
    if (!checker.define) return;
    const span = wordForLookup();
    if (!span) return;
    e.preventDefault();
    showDefinition(span);
  });

  const wordAtPoint = (x: number, y: number): WordSpan | null => {
    editor.style.pointerEvents = "none";
    backdrop.style.pointerEvents = "auto";
    backdrop.style.userSelect = "text";
    const offset = offsetAtPoint(x, y);
    editor.style.pointerEvents = "";
    backdrop.style.pointerEvents = "";
    backdrop.style.userSelect = "";
    if (offset === null) return null;
    const span = wordAt(editor.value, offset, latinLookup());
    const rect = span && rangeRectAt(span.start, span.end);
    if (!rect) return null;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
      return null;
    return span;
  };

  let hoverPoint: { x: number; y: number } | null = null;
  let hoverSpan: WordSpan | null = null;
  let hoverFrame = 0;

  const defineAtPoint = (x: number, y: number): void => {
    if (!checker.define) return;
    const span = wordAtPoint(x, y);
    if (!span) {
      hoverSpan = null;
      defTip.hideWordTip();
      return;
    }
    if (hoverSpan?.start === span.start && hoverSpan.end === span.end) return;
    hoverSpan = span;
    showDefinition(span, x);
  };

  editor.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const always = (defDock.body() || defTip.pinned()) && !defTip.paused();
    if (always && e.shiftKey) return;
    hoverPoint = { x: e.clientX, y: e.clientY };
    if (e.buttons !== 0 || !(isHoverDefineKey(e) || always)) {
      hoverSpan = null;
      return;
    }
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      if (hoverPoint) defineAtPoint(hoverPoint.x, hoverPoint.y);
    });
  });

  editor.addEventListener("pointerleave", () => {
    hoverPoint = null;
    hoverSpan = null;
  });

  document.addEventListener("keydown", (e) => {
    if (e.repeat || (e.key !== "Control" && e.key !== "Meta")) return;
    if (!hoverPoint || !isHoverDefineKey(e)) return;
    hoverSpan = null;
    defineAtPoint(hoverPoint.x, hoverPoint.y);
  });
}
