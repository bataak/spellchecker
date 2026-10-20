import { format, type Block } from "../markdown.ts";
import { tidyCaret, tidyTex } from "../tex/textidy.ts";

const TIDY_LIMIT = 400_000;
const TIDY_IDLE_MS = 5000;
const MD_TIDY_TITLE = "Markdown бичвэрийг жигдрүүлэх";

export interface TidyDeps {
  readonly wrap: HTMLElement;
  readonly head: HTMLElement;
  readonly area: HTMLTextAreaElement;
  readonly onFormat: (next: string, caret?: number) => void;
  readonly texActive: () => boolean;
  readonly hasSource: () => boolean;
  readonly isLatex: (text: string) => boolean;
}

export interface Tidy {
  markdown(text: string, blocks: readonly Block[], looksMd: boolean): void;
  latex(): void;
  hide(): void;
  destroy(): void;
}

export function createTidy(deps: TidyDeps): Tidy {
  const { area } = deps;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tidy-btn";
  button.textContent = "Хэлбэржүүлэх";
  button.title = MD_TIDY_TITLE;
  button.hidden = true;
  const tools = deps.wrap.querySelector<HTMLElement>(".editor-tools");
  const anchor = tools?.querySelector<HTMLElement>(".measure-ctl") ?? null;
  if (tools) tools.insertBefore(button, anchor);
  else deps.head.append(button);

  let tidied: string | null = null;
  let typingTimer = 0;
  let latexStale = false;

  const show = (): void => {
    button.hidden = tidied === null || typingTimer !== 0 || deps.hasSource();
  };

  const latex = (): void => {
    button.title = "LaTeX бичвэрийн догол мөр, хоосон мөрийг жигдрүүлэх";
    latexStale = typingTimer !== 0;
    if (latexStale) {
      tidied = null;
      show();
      return;
    }
    const text = area.value;
    const next = text.length <= TIDY_LIMIT ? tidyTex(text) : text;
    tidied = next === text ? null : next;
    show();
  };

  const onTyping = (event: Event): void => {
    if (!event.isTrusted) return;
    if (typingTimer) clearTimeout(typingTimer);
    button.hidden = true;
    typingTimer = window.setTimeout(() => {
      typingTimer = 0;
      if (latexStale && deps.texActive()) latex();
      show();
    }, TIDY_IDLE_MS);
  };

  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    if (tidied === null) return;
    if (deps.texActive())
      deps.onFormat(tidied, tidyCaret(area.value, tidied, area.selectionStart));
    else deps.onFormat(tidied);
  });
  area.addEventListener("input", onTyping);

  return {
    markdown(text, blocks, looksMd) {
      tidied = null;
      button.title = MD_TIDY_TITLE;
      if (looksMd && text.length <= TIDY_LIMIT && !deps.isLatex(text)) {
        const next = format(text, blocks);
        if (next !== text) tidied = next;
      }
      show();
    },
    latex,
    hide() {
      button.hidden = true;
    },
    destroy() {
      if (typingTimer) clearTimeout(typingTimer);
      area.removeEventListener("input", onTyping);
      button.remove();
    },
  };
}
