import { icon } from "../project/panelicons.ts";
import type { CommentDraft } from "./comments.ts";
import type { CursorView } from "./cursors.ts";
import { ICONS, type Views } from "./talkparts.ts";

export interface CommentTarget {
  readonly views: Views;
  open(): void;
}

export interface CommentButtonDeps {
  readonly editor: HTMLTextAreaElement;
  readonly view: Pick<CursorView, "host" | "rangeRects">;
  readonly target: () => CommentTarget | null;
}

const GAP = 4;
const EDGE = 8;

function selectionDraft(
  editor: HTMLTextAreaElement,
  target: CommentTarget,
): CommentDraft | null {
  const { selectionStart: start, selectionEnd: end } = editor;
  if (start >= end) return null;
  return target.views.comments.draft(
    start,
    end,
    editor.value.slice(start, end),
  );
}

function commentButton(host: HTMLElement): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "collab-comment-btn";
  node.hidden = true;
  node.title = "Сонгосон хэсэгт шүүмж бичих";
  node.innerHTML = icon(ICONS.comments, 14);
  node.append(document.createTextNode(" Шүүмж"));
  node.addEventListener("mousedown", (event) => event.preventDefault());
  host.append(node);
  return node;
}

export function initCommentButton(deps: CommentButtonDeps): void {
  const { editor, view } = deps;
  const node = commentButton(view.host);
  let frame = 0;
  let dragging = false;

  const hide = (): void => {
    node.hidden = true;
  };
  const placeAt = (start: number, end: number): void => {
    const last = view.rangeRects(start, end).at(-1);
    if (!last) return hide();
    node.hidden = false;
    const origin = view.host.getBoundingClientRect();
    const room = origin.width - node.offsetWidth - EDGE;
    const left = Math.max(EDGE, Math.min(last.right - origin.left, room));
    let top = last.bottom - origin.top + GAP;
    if (top + node.offsetHeight > origin.height)
      top = last.top - origin.top - node.offsetHeight - GAP;
    node.style.transform = "translate(" + left + "px," + top + "px)";
  };
  const update = (): void => {
    frame = 0;
    const target = deps.target();
    if (dragging || document.activeElement !== editor || !target) return hide();
    if (!selectionDraft(editor, target)) return hide();
    placeAt(editor.selectionStart, editor.selectionEnd);
  };
  const soon = (): void => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  node.addEventListener("click", () => {
    const target = deps.target();
    const draft = target && selectionDraft(editor, target);
    hide();
    if (!target || !draft) return;
    target.views.views.comments.compose(draft);
    target.open();
  });
  editor.addEventListener("click", () => {
    const target = deps.target();
    if (!target || editor.selectionStart !== editor.selectionEnd) return;
    const hit = target.views.comments.at(editor.selectionStart);
    if (!hit) return;
    target.open();
    target.views.views.comments.focus(hit.id, hit.inside);
  });
  const release = (): void => {
    if (!dragging) return;
    dragging = false;
    soon();
  };
  editor.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragging = true;
    hide();
  });
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  document.addEventListener("pointermove", (event) => {
    if (dragging && event.buttons === 0) release();
  });
  document.addEventListener("selectionchange", soon);
  editor.addEventListener("blur", hide);
  editor.addEventListener("input", hide);
  editor.addEventListener("scroll", hide, { passive: true });
}
