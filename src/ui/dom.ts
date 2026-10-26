export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function listStep(key: string, at: number, count: number): number {
  if (key === "ArrowDown") return (at + 1) % count;
  if (key === "ArrowUp") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

export function eventElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

export function eventNode(event: Event): Node | null {
  return event.target instanceof Node ? event.target : null;
}

export function closestTarget<T extends Element = HTMLElement>(
  event: Event,
  selector: string,
): T | null {
  return eventElement(event)?.closest<T>(selector) ?? null;
}
