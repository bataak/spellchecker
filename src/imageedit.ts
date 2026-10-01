import { applyEdit, imageSizeAt, setImageSize } from "./mdedit.ts";
import type { ImageSize } from "./markdown.ts";

const CORNERS = ["nw", "ne", "sw", "se"] as const;
const MIN_PERCENT = 5;

export interface ImageEdit {
  refresh(): void;
  destroy(): void;
}

export function initImageEdit(
  body: HTMLElement,
  area: HTMLTextAreaElement,
): ImageEdit {
  let selected = -1;
  let dragging = false;

  const frame = document.createElement("div");
  frame.className = "image-frame";
  frame.hidden = true;

  for (const corner of CORNERS) {
    const handle = document.createElement("span");
    handle.className = "image-handle";
    handle.dataset.corner = corner;
    frame.append(handle);
  }

  const rotate = document.createElement("button");
  rotate.type = "button";
  rotate.className = "image-rotate";
  rotate.title = "Эргүүлэх";
  rotate.setAttribute("aria-label", rotate.title);
  rotate.textContent = "↻";
  frame.append(rotate);

  const images = (): HTMLElement[] => [
    ...body.querySelectorAll<HTMLElement>(".md-image, .md-image-missing"),
  ];

  const current = (): HTMLImageElement | null => {
    const el = selected < 0 ? null : images()[selected];
    return el instanceof HTMLImageElement ? el : null;
  };

  const place = (): void => {
    const img = current();
    if (!img || !img.isConnected) {
      frame.hidden = true;
      return;
    }
    const r = img.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    frame.style.left = `${r.left - b.left + body.scrollLeft}px`;
    frame.style.top = `${r.top - b.top + body.scrollTop}px`;
    frame.style.width = `${r.width}px`;
    frame.style.height = `${r.height}px`;
    frame.hidden = false;
  };

  const select = (index: number): void => {
    selected = index;
    refresh();
  };

  const commit = (change: ImageSize): void => {
    const edit = setImageSize(
      area.value,
      selected,
      change,
      area.selectionStart,
    );
    if (edit) applyEdit(area, edit, { preventScroll: true });
  };

  function refresh(): void {
    if (frame.parentElement !== body) body.append(frame);
    const img = current();
    if (img && (!img.getAttribute("src") || !img.complete))
      img.addEventListener("load", place, { once: true });
    place();
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element;
    if (frame.contains(target)) return;
    const img = target.closest<HTMLElement>(".md-image");
    select(img ? images().indexOf(img) : -1);
  };

  const onRotate = (): void => {
    const turn = imageSizeAt(area.value, selected)?.rotate ?? 0;
    commit({ rotate: (turn + 90) % 360 });
  };

  const onHandleDown = (event: PointerEvent): void => {
    const handle = (event.target as Element).closest<HTMLElement>(
      ".image-handle",
    );
    const img = current();
    const box = img?.parentElement;
    if (!handle || !img || !box) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    dragging = true;

    const startX = event.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const room = box.clientWidth;
    const sign = handle.dataset.corner?.endsWith("w") ? -1 : 1;
    const factor = getComputedStyle(box).textAlign === "center" ? 2 : 1;
    let percent = (startWidth / room) * 100;

    const move = (moved: PointerEvent): void => {
      const width = startWidth + sign * factor * (moved.clientX - startX);
      percent = Math.min(100, Math.max(MIN_PERCENT, (width / room) * 100));
      img.style.width = `${percent}%`;
      place();
    };
    const up = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      dragging = false;
      commit({ width: Math.round(percent) });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && selected >= 0) select(-1);
  };

  const onResize = (): void => {
    if (!dragging) place();
  };

  body.addEventListener("click", onClick);
  frame.addEventListener("pointerdown", onHandleDown);
  rotate.addEventListener("click", onRotate);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);

  return {
    refresh,
    destroy() {
      body.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      frame.remove();
    },
  };
}
