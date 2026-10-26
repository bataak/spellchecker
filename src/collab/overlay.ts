export function move(el: HTMLElement, rect: DOMRect, origin: DOMRect): void {
  el.style.transform =
    "translate(" +
    (rect.left - origin.left) +
    "px," +
    (rect.top - origin.top) +
    "px)";
}

export function place(el: HTMLElement, rect: DOMRect, origin: DOMRect): void {
  move(el, rect, origin);
  el.style.height = rect.height + "px";
}

export function watchLayout(
  editor: HTMLTextAreaElement,
  update: () => void,
): () => void {
  editor.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  const sized = new ResizeObserver(update);
  sized.observe(editor);
  return () => {
    editor.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    sized.disconnect();
  };
}
