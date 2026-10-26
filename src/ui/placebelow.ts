export function placeBelow(menu: HTMLElement, select: HTMLElement): void {
  const rect = select.getBoundingClientRect();
  const view = window.visualViewport;
  const bottom = view ? view.offsetTop + view.height : window.innerHeight;
  const right = document.documentElement.clientWidth;
  menu.style.top = rect.bottom + 4 + "px";
  menu.style.maxHeight = Math.max(120, bottom - rect.bottom - 12) + "px";
  menu.style.minWidth = rect.width + "px";
  menu.style.left =
    Math.max(8, Math.min(rect.left, right - menu.offsetWidth - 8)) + "px";
}

export function onViewportChange(
  listener: (event: Event) => void,
  on: boolean,
): void {
  const method = on ? "addEventListener" : "removeEventListener";
  window[method]("resize", listener);
  window[method]("scroll", listener, true);
  window.visualViewport?.[method]("resize", listener);
}
