import "./texcomplete.css";
import { replaceRange } from "./editortext.ts";
import { completionContext, completions, expand } from "./texcompletion.ts";
import type { Completion, CompletionContext } from "./texcompletion.ts";

export interface TexCompleteDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
  readonly rectAt: (start: number, end: number) => DOMRect | null;
  readonly onImage?: () => void;
}

const GAP = 4;
const EDGE = 8;
const LIST_ID = "texCompleteList";

export function initTexComplete(deps: TexCompleteDeps): void {
  const { editor } = deps;
  const list = document.createElement("ul");
  list.className = "tex-complete";
  list.id = LIST_ID;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "LaTeX команд");
  list.hidden = true;
  document.body.appendChild(list);

  let context: CompletionContext | null = null;
  let items: Completion[] = [];
  let index = 0;
  let dismissedAt = -1;
  let applying = false;

  editor.setAttribute("aria-autocomplete", "list");

  function close(): void {
    if (list.hidden) return;
    list.hidden = true;
    context = null;
    items = [];
    editor.removeAttribute("aria-controls");
    editor.removeAttribute("aria-activedescendant");
  }

  function update(): void {
    if (applying) return;
    if (!deps.active() || editor.selectionStart !== editor.selectionEnd) {
      close();
      return;
    }
    const caret = editor.selectionStart;
    const next = completionContext(editor.value, caret);
    if (!next) {
      dismissedAt = -1;
      close();
      return;
    }
    if (next.from === dismissedAt) {
      close();
      return;
    }
    dismissedAt = -1;
    const found = completions(next);
    if (!found.length) {
      close();
      return;
    }
    context = next;
    items = found;
    index = 0;
    paint();
    place(caret);
  }

  function paint(): void {
    list.textContent = "";
    items.forEach((item, i) => {
      const li = document.createElement("li");
      li.id = LIST_ID + "-" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === index ? "true" : "false");
      const name = document.createElement("span");
      name.className = "tc-name";
      name.textContent = (context!.kind === "cmd" ? "\\" : "") + item.label;
      li.appendChild(name);
      const rest = item.snippet.slice(item.label.length).replace("#", "");
      if (rest) {
        const hint = document.createElement("span");
        hint.className = "tc-rest";
        hint.textContent = rest;
        li.appendChild(hint);
      }
      li.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        index = i;
        accept();
      });
      list.appendChild(li);
    });
    list.hidden = false;
    editor.setAttribute("aria-controls", LIST_ID);
    editor.setAttribute("aria-activedescendant", LIST_ID + "-" + index);
  }

  function select(next: number): void {
    const count = items.length;
    index = (next + count) % count;
    list.querySelectorAll("li").forEach((li, i) => {
      li.setAttribute("aria-selected", i === index ? "true" : "false");
    });
    editor.setAttribute("aria-activedescendant", LIST_ID + "-" + index);
  }

  function place(caret: number): void {
    if (!context) return;
    const rect =
      context.from < caret
        ? deps.rectAt(context.from, caret)
        : deps.rectAt(Math.max(0, context.from - 1), context.from);
    if (!rect) {
      close();
      return;
    }
    const view = window.visualViewport;
    const viewTop = view ? view.offsetTop : 0;
    const viewHeight = view ? view.height : window.innerHeight;
    const viewWidth = view ? view.width : window.innerWidth;
    const box = list.getBoundingClientRect();
    let top = rect.bottom + GAP;
    if (top + box.height > viewTop + viewHeight - EDGE) {
      top = Math.max(viewTop + EDGE, rect.top - GAP - box.height);
    }
    const left = Math.min(
      Math.max(EDGE, rect.left),
      Math.max(EDGE, viewWidth - box.width - EDGE),
    );
    list.style.top = top + "px";
    list.style.left = left + "px";
  }

  function accept(): void {
    if (!context) return;
    const item = items[index];
    if (!item) return;
    const caret = editor.selectionStart;
    const edit = expand(editor.value, caret, context, item);
    const image = context.kind === "cmd" && item.label === "includegraphics";
    close();
    editor.focus({ preventScroll: true });
    applying = true;
    let native = true;
    try {
      native = replaceRange(editor, edit.from, edit.to, edit.text);
    } finally {
      applying = false;
    }
    editor.setSelectionRange(edit.caret, edit.caret);
    if (!native) editor.dispatchEvent(new Event("input", { bubbles: true }));
    if (image) {
      deps.onImage?.();
      return;
    }
    update();
  }

  editor.addEventListener("input", update);

  editor.addEventListener(
    "keydown",
    (e) => {
      if (list.hidden || e.isComposing) return;
      if (e.altKey || e.ctrlKey || e.metaKey) {
        close();
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          select(index + 1);
          return;
        case "ArrowUp":
          e.preventDefault();
          select(index - 1);
          return;
        case "Enter":
        case "Tab":
          if (e.shiftKey) {
            close();
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          accept();
          return;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          dismissedAt = context ? context.from : -1;
          close();
          return;
        case "ArrowLeft":
        case "ArrowRight":
        case "Home":
        case "End":
        case "PageUp":
        case "PageDown":
          close();
          return;
      }
    },
    true,
  );

  editor.addEventListener("beforeinput", (e) => {
    if (list.hidden) return;
    if (e.inputType !== "insertLineBreak" && e.inputType !== "insertParagraph")
      return;
    e.preventDefault();
    accept();
  });

  editor.addEventListener("blur", close);
  editor.addEventListener("pointerdown", close);
  editor.addEventListener("scroll", () => {
    if (!list.hidden) place(editor.selectionStart);
  });
  window.addEventListener("resize", close);
}
