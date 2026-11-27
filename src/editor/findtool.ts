export function replaceShown(saved: string | null): boolean {
  return saved !== "0";
}

export interface Band {
  readonly top: number;
  readonly bottom: number;
}

export function visibleBand(box: DOMRect, cover: DOMRect | null): Band {
  const band = { top: box.top, bottom: box.bottom };
  if (!cover) return band;
  const wide =
    Math.min(cover.right, box.right) - Math.max(cover.left, box.left);
  if (wide < box.width / 2) return band;
  if (cover.top + cover.bottom < box.top + box.bottom)
    return {
      ...band,
      top: Math.min(Math.max(box.top, cover.bottom), box.bottom),
    };
  return {
    ...band,
    bottom: Math.max(Math.min(box.bottom, cover.top), box.top),
  };
}

export function bindFindButton(
  button: HTMLElement | null,
  mac: boolean,
  run: () => void,
): () => void {
  if (!button) return () => {};
  const label = "Хайх, солих (" + (mac ? "⌘F" : "Ctrl+F") + ")";
  button.title = label;
  const keep = (e: Event): void => e.preventDefault();
  button.addEventListener("mousedown", keep);
  button.addEventListener("click", run);
  return () => {
    button.removeEventListener("mousedown", keep);
    button.removeEventListener("click", run);
  };
}
