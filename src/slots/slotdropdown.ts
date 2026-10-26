import { PROJECT_SLOT } from "./fileslots.ts";
import { onViewportChange, placeBelow } from "../ui/placebelow.ts";

export interface SlotDropdownDeps {
  readonly select: HTMLButtonElement;
  readonly beforeOpen: () => void;
  readonly afterClose: () => void;
  readonly onSelect: (value: string) => void;
  readonly canClose: (id: string) => boolean;
  readonly onCloseSlot: (id: string) => void;
  readonly onCloseProject: () => void;
}

export interface SlotDropdown {
  render(html: string): void;
  pick(value: string): string | null;
  isOpen(): boolean;
  contains(node: Node): boolean;
  close(refocus: boolean): void;
  destroy(): void;
}

function slotMenu(): HTMLDivElement {
  const menu = document.createElement("div");
  menu.className = "md-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Баримтын загвар");
  menu.hidden = true;
  document.body.append(menu);
  return menu;
}

function navIndex(key: string, at: number, count: number): number {
  if (key === "ArrowDown") return (at + 1) % count;
  if (key === "ArrowUp") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

function checkItems(
  items: readonly HTMLButtonElement[],
  value: string,
): string | null {
  let label: string | null = null;
  for (const item of items) {
    const on = item.dataset.value === value;
    item.setAttribute("aria-checked", String(on));
    if (on) label = item.textContent ?? "";
  }
  return label;
}

export function createSlotDropdown(deps: SlotDropdownDeps): SlotDropdown {
  const { select } = deps;
  const menu = slotMenu();
  let items: HTMLButtonElement[] = [];

  const place = (): void => placeBelow(menu, select);

  function close(refocus: boolean): void {
    if (menu.hidden) return;
    menu.hidden = true;
    select.setAttribute("aria-expanded", "false");
    if (refocus) select.focus();
    deps.afterClose();
  }

  function open(): void {
    deps.beforeOpen();
    menu.hidden = false;
    select.setAttribute("aria-expanded", "true");
    place();
    const checked =
      items.find((item) => item.getAttribute("aria-checked") === "true") ??
      items[0];
    checked?.focus({ preventScroll: true });
    checked?.scrollIntoView({ block: "nearest" });
  }

  const onToggle = (): void => {
    if (menu.hidden) open();
    else close(true);
  };

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const closer = target?.closest<HTMLElement>(".md-menu-close");
    if (closer?.dataset.close === PROJECT_SLOT) {
      close(false);
      deps.onCloseProject();
      return;
    }
    if (closer?.dataset.close) {
      deps.onCloseSlot(closer.dataset.close);
      if (!menu.hidden) {
        place();
        items[0]?.focus({ preventScroll: true });
      }
      return;
    }
    const item = target?.closest<HTMLElement>(".md-menu-item");
    if (item?.dataset.value === undefined) return;
    close(false);
    deps.onSelect(item.dataset.value);
  };

  const onKey = (event: KeyboardEvent): void => {
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = navIndex(event.key, at, items.length);
    if (event.key === "Delete") {
      const id = items[at]?.dataset.value;
      if (id && deps.canClose(id)) {
        event.preventDefault();
        deps.onCloseSlot(id);
        items[Math.min(at, items.length - 1)]?.focus();
      }
      return;
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close(true);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  };

  const onPointer = (event: Event): void => {
    const target = event.target as Node;
    if (!menu.contains(target) && !select.contains(target)) close(false);
  };

  const onViewport = (event: Event): void => {
    if (menu.hidden) return;
    if (event.target instanceof Node && menu.contains(event.target)) return;
    place();
  };

  select.addEventListener("click", onToggle);
  menu.addEventListener("click", onClick);
  menu.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onPointer);
  onViewportChange(onViewport, true);

  return {
    render(html) {
      menu.innerHTML = html;
      items = [...menu.querySelectorAll<HTMLButtonElement>(".md-menu-item")];
    },
    pick: (value) => checkItems(items, value),
    isOpen: () => !menu.hidden,
    contains: (node) => menu.contains(node),
    close,
    destroy() {
      select.removeEventListener("click", onToggle);
      document.removeEventListener("pointerdown", onPointer);
      onViewportChange(onViewport, false);
      menu.remove();
    },
  };
}
