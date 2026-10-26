import type * as Y from "yjs";
import type { Comments } from "./comments.ts";
import { place, type Cursors, type CursorView } from "./cursors.ts";

export interface CommentMarksDeps {
  readonly doc: Y.Doc;
  readonly comments: Comments;
  readonly editor: HTMLTextAreaElement;
  readonly view: CursorView;
  readonly cursors: Pick<Cursors, "active" | "onActive">;
}

export interface CommentMarks {
  destroy(): void;
}

function markOf(rect: DOMRect, origin: DOMRect, id: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "collab-comment-mark";
  el.dataset.comment = id;
  place(el, rect, origin);
  el.style.width = rect.width + "px";
  return el;
}

export function createCommentMarks(deps: CommentMarksDeps): CommentMarks {
  const { comments, editor, view, cursors } = deps;
  const layer = document.createElement("div");
  layer.className = "collab-comments";
  layer.hidden = true;
  view.host.prepend(layer);
  let frame = 0;

  const render = (): void => {
    frame = 0;
    const spans = cursors.active() ? comments.spans() : [];
    layer.hidden = spans.length === 0;
    if (layer.hidden) return void layer.replaceChildren();
    const origin = layer.getBoundingClientRect();
    layer.replaceChildren(
      ...spans.flatMap((span) =>
        view
          .rangeRects(span.from, span.to)
          .map((rect) => markOf(rect, origin, span.id)),
      ),
    );
  };
  const renderSoon = (): void => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  const offActive = cursors.onActive(renderSoon);
  const offComments = comments.onChange(renderSoon);
  editor.addEventListener("scroll", renderSoon, { passive: true });
  window.addEventListener("resize", renderSoon);
  deps.doc.on("afterTransaction", renderSoon);
  renderSoon();

  return {
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      offActive();
      offComments();
      editor.removeEventListener("scroll", renderSoon);
      window.removeEventListener("resize", renderSoon);
      deps.doc.off("afterTransaction", renderSoon);
      layer.remove();
    },
  };
}
