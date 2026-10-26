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
