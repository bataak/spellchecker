import type { Backdrop } from "../editor/backdrop.ts";
import { pickDefinitionMarks } from "../define/defmarks.ts";
import type { DefTip } from "../define/deftip.ts";
import { escapeHtml } from "../core/htmlutil.ts";
import { syncIgnoreVisibility } from "../dict/ignorelist.ts";
import type { Popover } from "./popover.ts";
import { addIgnored, canIgnore } from "../spell/ignore.ts";
import {
  MANUAL_FIX_MAX,
  MANUAL_FIX_WORDS,
  cleanManualFix,
  countWords,
  filterManualFix,
} from "../spell/manualfix.ts";
import type { SpellChecker } from "../spell/spellchecker.ts";
import type { Token } from "../spell/textcheck.ts";
import {
  dashFixes,
  numberSplits,
  periodSplits,
  scopeToSuffix,
} from "../spell/wordfix.ts";

export interface SuggestPopoverDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: Backdrop;
  readonly popover: HTMLElement;
  readonly pop: Popover;
  readonly defTip: DefTip;
  readonly checker: SpellChecker;
  readonly desktopMQ: MediaQueryList;
  readonly render: () => Promise<void>;
  readonly apply: (token: Token, replacement: string) => Promise<void>;
  readonly attachKeyboard: (input: HTMLInputElement) => void;
  readonly errorAtCaret: () => Token | null;
}

export interface SuggestPopover {
  showFor(token: Token): Promise<void>;
  atCaret(): void;
}

export function initSuggestPopover(deps: SuggestPopoverDeps): SuggestPopover {
  const { editor, backdrop, popover, pop, defTip } = deps;
  const checkWords = (words: string[]) => deps.checker.checkWords(words);

  const reducedMotionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  async function showPopoverFor(token: Token): Promise<void> {
    let mark = backdrop.markAt(token.start);
    if (!mark) {
      await deps.render();
      mark = backdrop.markAt(token.start);
    }
    if (!mark) {
      pop.hide();
      return;
    }

    pop.open(token.start);

    const [dashes, splits, numbers, offered] = await Promise.all([
      dashFixes(token, checkWords),
      periodSplits(token.word, checkWords),
      numberSplits(token.word, checkWords),
      deps.checker.suggest(token.joined ?? token.word),
    ]);
    const scoped = scopeToSuffix(token, offered);
    const ahead = [
      ...dashes,
      ...splits.filter((item) => !dashes.includes(item)),
      ...numbers.filter(
        (item) => !splits.includes(item) && !dashes.includes(item),
      ),
    ];
    const suggestions = [
      ...ahead,
      ...scoped.filter((item) => !ahead.includes(item)),
    ].slice(0, deps.desktopMQ.matches ? 15 : 8);
    const found =
      deps.checker.lookup && suggestions.length
        ? await deps.checker.lookup(suggestions)
        : null;
    if (!pop.isOpenAt(token.start)) return;
    const marks = pickDefinitionMarks(suggestions, found);
    const sgHtml = suggestions.length
      ? suggestions
          .map((suggestion) => {
            const button =
              '<button class="sg" type="button">' +
              escapeHtml(suggestion) +
              "</button>";
            if (!marks.has(suggestion)) return button;
            return (
              '<div class="sg-row">' +
              button +
              '<button class="sg-dot" type="button"' +
              ' aria-expanded="false" aria-controls="defTip" aria-label="' +
              escapeHtml(suggestion) +
              ' — тайлбар"></button></div>'
            );
          })
          .join("")
      : editor.readOnly
        ? '<button class="sg sg-manual pop-fix-open" type="button">' +
          'санал алга — <span class="pop-fix-cue">засах</span></button>'
        : '<div class="muted pop-empty">санал алга</div>';
    popover.innerHTML =
      '<div class="pop-scroll">' +
      '<div class="pop-list">' +
      sgHtml +
      "</div>" +
      '<div class="pop-less" hidden>' +
      '<button class="pop-less-btn" type="button" aria-label="Дээш гүйлгэх">' +
      "</button></div>" +
      '<div class="pop-more" hidden>' +
      '<button class="pop-more-btn" type="button" aria-label="Доош гүйлгэх">' +
      "</button></div>" +
      "</div>" +
      (canIgnore(token.word)
        ? '<button class="sg sg-ignore" type="button">Энэ үгийг алгасах</button>'
        : "");
    const list = pop.list();
    if (list) {
      list.scrollTop = 0;
      list.addEventListener("scroll", pop.updateScrollHint, { passive: true });
      list.addEventListener("scroll", defTip.hide, { passive: true });
    }
    pop.measure();
    pop.place();

    popover
      .querySelector<HTMLElement>(".pop-fix-open")
      ?.addEventListener("click", (event) => {
        if (event.currentTarget instanceof HTMLElement)
          openManualFix(token, event.currentTarget);
      });
    popover
      .querySelectorAll(".sg:not(.sg-ignore, .sg-manual)")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const covered = pop.obscuredBy(btn);
          if (covered > 0 && list) {
            list.scrollBy({
              top: covered,
              behavior: reducedMotionMQ.matches ? "auto" : "smooth",
            });
            return;
          }
          void deps.apply(token, btn.textContent);
        });
      });
    popover.querySelectorAll<HTMLElement>(".sg-dot").forEach(defTip.bindDot);
    const pageBy = (sign: number) => {
      if (!list) return;
      list.scrollBy({
        top: sign * Math.max(60, list.clientHeight - 48),
        behavior: reducedMotionMQ.matches ? "auto" : "smooth",
      });
    };
    popover.querySelectorAll(".pop-more-btn, .pop-less-btn").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () =>
        pageBy(btn.classList.contains("pop-less-btn") ? -1 : 1),
      );
    });
    const ignoreBtn = popover.querySelector(".sg-ignore");
    if (ignoreBtn) {
      ignoreBtn.addEventListener("click", () => {
        addIgnored(token.word);
        syncIgnoreVisibility();
        pop.hide();
        void deps.render();
      });
    }
  }

  function openManualFix(token: Token, trigger: HTMLElement): void {
    const original = token.word.replace(/\s+$/, "");
    const form = document.createElement("form");
    form.className = "pop-fix";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "pop-fix-input";
    input.value = filterManualFix(original);
    input.maxLength = MANUAL_FIX_MAX;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("enterkeyhint", "done");
    input.setAttribute("aria-label", "Зөв бичлэгийг өөрөө бичих");
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "pop-fix-ok";
    submit.textContent = "Засах";
    form.append(input, submit);
    trigger.replaceWith(form);
    deps.attachKeyboard(input);

    let accepted = input.value;
    const refresh = () => {
      submit.disabled = cleanManualFix(input.value, original) === null;
    };
    const enforce = () => {
      const raw = input.value;
      const caret = input.selectionStart ?? raw.length;
      const next = filterManualFix(raw);
      const over = countWords(next) > MANUAL_FIX_WORDS;
      const value = over ? accepted : next;
      if (value !== raw) {
        const at = over
          ? Math.max(0, caret - (raw.length - accepted.length))
          : filterManualFix(raw.slice(0, caret)).length;
        input.value = value;
        input.setSelectionRange(at, at);
      }
      accepted = input.value;
      refresh();
    };
    input.addEventListener("input", (event) => {
      if (event instanceof InputEvent && event.isComposing) return;
      enforce();
    });
    input.addEventListener("compositionend", enforce);
    refresh();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const fix = cleanManualFix(input.value, original);
      if (fix === null) return;
      if (editor.value.slice(token.start, token.end) !== token.word) {
        pop.hide();
        return;
      }
      void deps.apply(token, fix);
    });

    pop.measure();
    pop.place();
    input.focus({ preventScroll: true });
    input.select();
  }

  function suggestAtCaret() {
    const caretToken = deps.errorAtCaret();
    if (!caretToken) {
      pop.hide();
      return;
    }
    if (pop.isOpenAt(caretToken.start)) return;
    void showPopoverFor(caretToken);
  }

  return { showFor: showPopoverFor, atCaret: suggestAtCaret };
}
