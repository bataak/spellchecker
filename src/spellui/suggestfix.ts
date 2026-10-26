import type { Popover } from "../ui/popover.ts";
import {
  MANUAL_FIX_MAX,
  MANUAL_FIX_WORDS,
  cleanManualFix,
  countWords,
  filterManualFix,
} from "../spell/manualfix.ts";
import type { Token } from "../spell/textcheck.ts";

export interface ManualFixDeps {
  readonly editor: HTMLTextAreaElement;
  readonly pop: Pick<Popover, "measure" | "place" | "hide">;
  readonly apply: (token: Token, replacement: string) => Promise<void>;
  readonly attachKeyboard: (input: HTMLInputElement) => void;
}

function fixForm(original: string): {
  form: HTMLFormElement;
  input: HTMLInputElement;
  submit: HTMLButtonElement;
} {
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
  return { form, input, submit };
}

function enforceLimits(input: HTMLInputElement, accepted: string): string {
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
  return input.value;
}

export function openManualFix(
  d: ManualFixDeps,
  token: Token,
  trigger: HTMLElement,
): void {
  const { editor, pop } = d;
  const original = token.word.replace(/\s+$/, "");
  const { form, input, submit } = fixForm(original);
  trigger.replaceWith(form);
  d.attachKeyboard(input);

  let accepted = input.value;
  const refresh = () => {
    submit.disabled = cleanManualFix(input.value, original) === null;
  };
  const enforce = () => {
    accepted = enforceLimits(input, accepted);
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
    void d.apply(token, fix);
  });

  pop.measure();
  pop.place();
  input.focus({ preventScroll: true });
  input.select();
}
