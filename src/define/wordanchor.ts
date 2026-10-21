export interface WordAnchor {
  el(): HTMLElement | null;
  at(rect: DOMRect): HTMLElement;
}

export function createWordAnchor(): WordAnchor {
  let anchor: HTMLElement | null = null;
  return {
    el: () => anchor,
    at(rect) {
      if (!anchor) {
        anchor = document.createElement("div");
        anchor.className = "word-anchor";
        document.body.appendChild(anchor);
      }
      anchor.style.left = window.scrollX + rect.left + "px";
      anchor.style.top = window.scrollY + rect.top + "px";
      anchor.style.width = rect.width + "px";
      anchor.style.height = rect.height + "px";
      return anchor;
    },
  };
}
