import {
  completionContext,
  completions,
  expand,
  unchanged,
} from "./texcompletion.ts";
import type { Completion, CompletionContext } from "./texcompletion.ts";
import { bindTabStops, type TexTabStops } from "./texpairs.ts";

export interface TexCompleteDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
  readonly rectAt: (start: number, end: number) => DOMRect | null;
  readonly onImage?: () => void;
}

const GAP = 4;
const EDGE = 8;
const LIST_ID = "texCompleteList";

const CLOSING = new Set([
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

function optionItem(
  i: number,
  command: boolean,
  item: Completion,
  selected: boolean,
): HTMLLIElement {
  const li = document.createElement("li");
  li.id = LIST_ID + "-" + i;
  li.setAttribute("role", "option");
  li.setAttribute("aria-selected", selected ? "true" : "false");
  const name = document.createElement("span");
  name.className = "tc-name";
  name.textContent = (command ? "\\" : "") + item.label;
  li.appendChild(name);
  const rest = item.snippet.slice(item.label.length).replace("#", "");
  if (rest) {
    const hint = document.createElement("span");
    hint.className = "tc-rest";
    hint.textContent = rest;
    li.appendChild(hint);
  }
  return li;
}

function listPosition(
  box: DOMRect,
  rect: DOMRect,
): { top: number; left: number } {
  const view = window.visualViewport;
  const viewTop = view ? view.offsetTop : 0;
  const viewHeight = view ? view.height : window.innerHeight;
  const viewWidth = view ? view.width : window.innerWidth;
  let top = rect.bottom + GAP;
  if (top + box.height > viewTop + viewHeight - EDGE)
    top = Math.max(viewTop + EDGE, rect.top - GAP - box.height);
  const left = Math.min(
    Math.max(EDGE, rect.left),
    Math.max(EDGE, viewWidth - box.width - EDGE),
  );
  return { top, left };
}

interface ListKeys {
  keepTyped(): boolean;
  accept(): void;
  close(): void;
  dismiss(): void;
  move(step: number): void;
  jump(e: KeyboardEvent): void;
}

function bindListKeys(
  editor: HTMLTextAreaElement,
  list: HTMLElement,
  k: ListKeys,
): void {
  const choose = (e: KeyboardEvent): void => {
    if (e.shiftKey) {
      k.close();
      return;
    }
    if (e.key === "Enter" && k.keepTyped()) return;
    e.preventDefault();
    e.stopPropagation();
    k.accept();
  };
  const move = (e: KeyboardEvent, step: number): void => {
    e.preventDefault();
    k.move(step);
  };
  const handlers = new Map<string, (e: KeyboardEvent) => void>([
    ["ArrowDown", (e) => move(e, 1)],
    ["ArrowUp", (e) => move(e, -1)],
    ["Enter", choose],
    ["Tab", choose],
    [
      "Escape",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        k.dismiss();
      },
    ],
  ]);
  editor.addEventListener(
    "keydown",
    (e) => {
      if (e.isComposing) return;
      if (list.hidden) k.jump(e);
      else if (e.altKey || e.ctrlKey || e.metaKey || CLOSING.has(e.key))
        k.close();
      else handlers.get(e.key)?.(e);
    },
    true,
  );
}

function createListView(
  editor: HTMLTextAreaElement,
  rectAt: TexCompleteDeps["rectAt"],
  pick: (index: number) => void,
) {
  const list = document.createElement("ul");
  list.className = "tex-complete";
  list.id = LIST_ID;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "LaTeX команд");
  list.hidden = true;
  document.body.appendChild(list);
  return {
    list,
    hide(): boolean {
      if (list.hidden) return false;
      list.hidden = true;
      editor.removeAttribute("aria-controls");
      editor.removeAttribute("aria-activedescendant");
      return true;
    },
    paint(items: readonly Completion[], cmd: boolean, index: number): void {
      list.textContent = "";
      items.forEach((item, i) => {
        const li = optionItem(i, cmd, item, i === index);
        li.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          pick(i);
        });
        list.appendChild(li);
      });
      list.hidden = false;
      editor.setAttribute("aria-controls", LIST_ID);
      editor.setAttribute("aria-activedescendant", LIST_ID + "-" + index);
    },
    select(index: number): void {
      list.querySelectorAll("li").forEach((li, i) => {
        li.setAttribute("aria-selected", i === index ? "true" : "false");
      });
      editor.setAttribute("aria-activedescendant", LIST_ID + "-" + index);
    },
    place(from: number, caret: number): boolean {
      const rect =
        from < caret
          ? rectAt(from, caret)
          : rectAt(Math.max(0, from - 1), from);
      if (!rect) return false;
      const { top, left } = listPosition(list.getBoundingClientRect(), rect);
      list.style.top = top + "px";
      list.style.left = left + "px";
      return true;
    },
  };
}

export function initTexComplete(deps: TexCompleteDeps): void {
  const { editor } = deps;
  const view = createListView(editor, deps.rectAt, (i) => {
    index = i;
    accept();
  });
  const { list } = view;

  let context: CompletionContext | null = null;
  let items: Completion[] = [];
  let index = 0;
  let dismissedAt = -1;
  let tabs: TexTabStops | null = null;

  editor.setAttribute("aria-autocomplete", "list");

  function close(): void {
    if (!view.hide()) return;
    context = null;
    items = [];
  }

  function update(): void {
    if (tabs?.applying()) return;
    if (!deps.active() || editor.selectionStart !== editor.selectionEnd) {
      close();
      return;
    }
    const caret = editor.selectionStart;
    const next = completionContext(editor.value, caret);
    if (next?.from !== dismissedAt) dismissedAt = -1;
    const found = next && dismissedAt < 0 ? completions(next) : [];
    if (!next || !found.length) {
      close();
      return;
    }
    context = next;
    items = found;
    index = 0;
    view.paint(items, next.kind === "cmd", index);
    place(caret);
  }

  function place(caret: number): void {
    if (context && !view.place(context.from, caret)) close();
  }

  function accept(): void {
    if (!context) return;
    const item = items[index];
    if (!item) return;
    const caret = editor.selectionStart;
    const edit = expand(editor.value, caret, context, item);
    const image = context.kind === "cmd" && item.label === "includegraphics";
    if (unchanged(context, item)) dismissedAt = context.from;
    close();
    editor.focus({ preventScroll: true });
    const native = tabs!.insert(edit);
    if (!native) editor.dispatchEvent(new Event("input", { bubbles: true }));
    if (image) {
      deps.onImage?.();
      return;
    }
    update();
  }

  tabs = bindTabStops({ editor, active: deps.active, paired: close });
  editor.addEventListener("input", update);

  const keepTyped = (): boolean => {
    if (!context || !items[index] || !unchanged(context, items[index]))
      return false;
    dismissedAt = context.from;
    close();
    return true;
  };

  bindListKeys(editor, list, {
    keepTyped,
    accept,
    close,
    dismiss: () => {
      dismissedAt = context ? context.from : -1;
      close();
    },
    move: (step) => {
      index = (index + step + items.length) % items.length;
      view.select(index);
    },
    jump: (e) => tabs!.jump(e),
  });

  editor.addEventListener("beforeinput", (e) => {
    if (list.hidden) return;
    if (e.inputType !== "insertLineBreak" && e.inputType !== "insertParagraph")
      return;
    if (keepTyped()) return;
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
