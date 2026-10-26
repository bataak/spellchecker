import type { Backdrop } from "../editor/backdrop.ts";
import { pickDefinitionMarks } from "../define/defmarks.ts";
import type { DefTip } from "../define/deftip.ts";
import { escapeHtml } from "../core/htmlutil.ts";
import { syncIgnoreVisibility } from "./ignorelist.ts";
import type { Popover } from "../ui/popover.ts";
import { openManualFix } from "./suggestfix.ts";
import { addIgnored, canIgnore } from "../spell/ignore.ts";
import type { WordChecker } from "../spell/spellchecker.ts";
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
  readonly checker: WordChecker;
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

async function collectSuggestions(
  token: Token,
  checker: WordChecker,
  limit: number,
): Promise<string[]> {
  const checkWords = (words: string[]) => checker.checkWords(words);
  const [dashes, splits, numbers, offered] = await Promise.all([
    dashFixes(token, checkWords),
    periodSplits(token.word, checkWords),
    numberSplits(token.word, checkWords),
    checker.suggest(token.joined ?? token.word),
  ]);
  const scoped = scopeToSuffix(token, offered);
  const ahead = [
    ...dashes,
    ...splits.filter((item) => !dashes.includes(item)),
    ...numbers.filter(
      (item) => !splits.includes(item) && !dashes.includes(item),
    ),
  ];
  return [...ahead, ...scoped.filter((item) => !ahead.includes(item))].slice(
    0,
    limit,
  );
}

function suggestionButton(suggestion: string, marked: boolean): string {
  const button =
    '<button class="sg" type="button">' + escapeHtml(suggestion) + "</button>";
  if (!marked) return button;
  return (
    '<div class="sg-row">' +
    button +
    '<button class="sg-dot" type="button"' +
    ' aria-expanded="false" aria-controls="defTip" aria-label="' +
    escapeHtml(suggestion) +
    ' — тайлбар"></button></div>'
  );
}

function popoverHtml(
  suggestions: readonly string[],
  marks: ReadonlySet<string>,
  readOnly: boolean,
  ignorable: boolean,
): string {
  const sgHtml = suggestions.length
    ? suggestions.map((s) => suggestionButton(s, marks.has(s))).join("")
    : readOnly
      ? '<button class="sg sg-manual pop-fix-open" type="button">' +
        'санал алга — <span class="pop-fix-cue">засах</span></button>'
      : '<div class="muted pop-empty">санал алга</div>';
  return (
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
    (ignorable
      ? '<button class="sg sg-ignore" type="button">Энэ үгийг алгасах</button>'
      : "")
  );
}

export function initSuggestPopover(deps: SuggestPopoverDeps): SuggestPopover {
  const { editor, backdrop, popover, pop, defTip } = deps;

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

    const suggestions = await collectSuggestions(
      token,
      deps.checker,
      deps.desktopMQ.matches ? 15 : 8,
    );
    const found = suggestions.length
      ? await deps.checker.lookup(suggestions)
      : null;
    if (!pop.isOpenAt(token.start)) return;
    const marks = pickDefinitionMarks(suggestions, found);
    popover.innerHTML = popoverHtml(
      suggestions,
      marks,
      editor.readOnly,
      canIgnore(token.word),
    );
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
          openManualFix(deps, token, event.currentTarget);
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
