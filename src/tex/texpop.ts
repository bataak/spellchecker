import { onViewportChange, placeBelow } from "../ui/placebelow.ts";
import { POP_ID } from "./texbarview.ts";

export interface PopContent {
  readonly kind: "list" | "palette";
  readonly label: string;
  readonly nodes: readonly HTMLElement[];
  readonly focus: () => void;
}

export interface Popover {
  readonly element: HTMLElement;
  current(): string | null;
  open(
    id: string,
    button: HTMLElement,
    content: PopContent,
    keys: boolean,
  ): void;
  close(refocus: boolean): void;
  isOpen(): boolean;
  contains(node: Node): boolean;
  destroy(): void;
}

export function listStep(key: string, at: number, count: number): number {
  if (key === "ArrowDown") return (at + 1) % count;
  if (key === "ArrowUp") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

function moveInList(pop: HTMLElement, event: KeyboardEvent): void {
  const items = [...pop.querySelectorAll<HTMLElement>(".tex-item")];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = listStep(event.key, at, items.length);
  if (next < 0) return;
  event.preventDefault();
  items[next]?.focus();
}

export function createPopover(
  editor: HTMLTextAreaElement,
  owner: HTMLElement,
): Popover {
  const pop = document.createElement("div");
  pop.className = "md-menu tex-pop";
  pop.id = POP_ID;
  pop.hidden = true;
  document.body.append(pop);
  let openId: string | null = null;
  let anchor: HTMLElement | null = null;

  const place = (): void => {
    if (anchor && !pop.hidden) placeBelow(pop, anchor);
  };

  function close(refocus: boolean): void {
    if (pop.hidden) return;
    pop.hidden = true;
    openId = null;
    anchor = null;
    owner
      .querySelectorAll('[aria-expanded="true"]')
      .forEach((button) => button.setAttribute("aria-expanded", "false"));
    if (refocus) editor.focus({ preventScroll: true });
  }

  function open(
    id: string,
    button: HTMLElement,
    content: PopContent,
    keys: boolean,
  ): void {
    close(false);
    pop.className = "md-menu tex-pop is-" + content.kind;
    pop.setAttribute("role", content.kind === "list" ? "menu" : "dialog");
    pop.setAttribute("aria-label", content.label);
    pop.replaceChildren(...content.nodes);
    openId = id;
    anchor = button.closest<HTMLElement>(".tex-split") ?? button;
    button.setAttribute("aria-expanded", "true");
    pop.hidden = false;
    place();
    if (keys) content.focus();
  }

  pop.addEventListener("pointerdown", (event) => {
    if (!(event.target as HTMLElement).closest("input")) event.preventDefault();
  });
  pop.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      close(true);
    } else if (pop.classList.contains("is-list")) moveInList(pop, event);
  });

  const onOutside = (event: Event): void => {
    const target = event.target as Node;
    if (!pop.contains(target) && !owner.contains(target)) close(false);
  };
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || pop.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };
  const onViewport = (event: Event): void => {
    if (event.target instanceof Node && pop.contains(event.target)) return;
    place();
  };
  document.addEventListener("pointerdown", onOutside);
  document.addEventListener("keydown", onEscape, true);
  onViewportChange(onViewport, true);

  return {
    element: pop,
    current: () => openId,
    open,
    close,
    isOpen: () => !pop.hidden,
    contains: (node) => pop.contains(node),
    destroy() {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape, true);
      onViewportChange(onViewport, false);
      pop.remove();
    },
  };
}
