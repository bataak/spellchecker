import type { Comments } from "./commentmodel.ts";
import type { CursorView } from "./cursors.ts";
import { place, watchLayout } from "./overlay.ts";

export interface CommentMarksDeps {
  readonly comments: Pick<Comments, "spans" | "onChange">;
  readonly editor: HTMLTextAreaElement;
  readonly view: Pick<CursorView, "host" | "rangeRects">;
  readonly active: () => boolean;
  readonly refresh: (listener: () => void) => () => void;
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
  const { comments, editor, view } = deps;
  const layer = document.createElement("div");
  layer.className = "collab-comments";
  layer.hidden = true;
  view.host.prepend(layer);
  let frame = 0;

  const render = (): void => {
    frame = 0;
    const spans = deps.active() ? comments.spans() : [];
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

  const offRefresh = deps.refresh(renderSoon);
  const offComments = comments.onChange(renderSoon);
  const unwatch = watchLayout(editor, renderSoon);
  renderSoon();

  return {
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      offRefresh();
      offComments();
      unwatch();
      layer.remove();
    },
  };
}
