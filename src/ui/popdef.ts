import type { DefTip } from "../define/deftip.ts";

type Definition = Awaited<ReturnType<DefTip["definitionFor"]>>;

export function buildDefPanel(
  word: string,
  def: Definition,
  defTip: DefTip,
  onBack: () => void,
): { panel: HTMLElement; back: HTMLButtonElement } {
  const panel = document.createElement("div");
  panel.className = "pop-def";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "pop-back";
  back.textContent = "← " + word;
  back.addEventListener("click", onBack);
  panel.appendChild(back);
  const body = document.createElement("div");
  body.className = "pop-def-body";
  if (def.entries.length) defTip.fill(body, word, def);
  else {
    const empty = document.createElement("div");
    empty.className = "muted pop-empty";
    empty.textContent = "Тайлбар олдсонгүй";
    body.appendChild(empty);
  }
  panel.appendChild(body);
  return { panel, back };
}

export function scrollHints(popover: HTMLElement, list: HTMLElement): void {
  const down = popover.querySelector<HTMLElement>(".pop-more");
  const up = popover.querySelector<HTMLElement>(".pop-less");
  const rest = list.scrollHeight - list.scrollTop - list.clientHeight;
  if (down) down.hidden = rest <= 2;
  if (up) up.hidden = list.scrollTop <= 2;
}

export function hintOverlap(popover: HTMLElement, btn: Element): number {
  const rect = btn.getBoundingClientRect();
  const up = popover.querySelector<HTMLElement>(".pop-less");
  if (up && !up.hidden) {
    const limit = up.getBoundingClientRect().bottom + 4;
    if (rect.top < limit) return rect.top - limit;
  }
  const down = popover.querySelector<HTMLElement>(".pop-more");
  if (down && !down.hidden) {
    const limit = down.getBoundingClientRect().top - 4;
    if (rect.bottom > limit) return rect.bottom - limit;
  }
  return 0;
}
