export interface MenuItem {
  readonly label: string;
  readonly run?: () => void;
  readonly danger?: boolean;
  readonly items?: readonly MenuItem[];
}

export interface ProjectMenu {
  readonly el: HTMLElement;
  open(
    items: readonly MenuItem[],
    x: number,
    y: number,
    owner?: HTMLElement,
  ): void;
  close(): void;
  owner(): HTMLElement | null;
}

const SETTLE_MS = 400;

export function createProjectMenu(onEscape: () => void): ProjectMenu {
  const menu = document.createElement("div");
  menu.className = "project-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  document.body.append(menu);
  let owner: HTMLElement | null = null;
  let settleUntil = 0;

  const close = (): void => {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
  };

  const doubled = (event: MouseEvent): boolean =>
    event.detail > 1 && performance.now() < settleUntil;

  const toggleGroup = (head: HTMLElement, open: boolean): void => {
    if ((head.getAttribute("aria-expanded") === "true") === open) return;
    const before = menu.offsetHeight;
    head.setAttribute("aria-expanded", String(open));
    for (const child of menu.querySelectorAll<HTMLElement>(".is-child"))
      if (child.dataset.group === head.id) child.hidden = !open;
    const top = parseFloat(menu.style.top) || 0;
    menu.style.top = Math.max(8, top - menu.offsetHeight + before) + "px";
    settleUntil = performance.now() + SETTLE_MS;
  };

  const arrowGroup = (event: KeyboardEvent): boolean => {
    const target = event.target as HTMLElement;
    const head = target.classList.contains("is-group")
      ? target
      : target.dataset.group
        ? menu.querySelector<HTMLElement>("#" + target.dataset.group)
        : null;
    if (!head) return false;
    if (event.key === "ArrowRight") {
      toggleGroup(head, true);
      menu
        .querySelector<HTMLElement>('[data-group="' + head.id + '"]')
        ?.focus();
      return true;
    }
    if (event.key !== "ArrowLeft") return false;
    toggleGroup(head, false);
    head.focus();
    return true;
  };

  menu.addEventListener("keydown", (event) => {
    const items = [
      ...menu.querySelectorAll<HTMLButtonElement>("button:not([hidden])"),
    ];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      close();
      if (owner?.isConnected) owner.focus();
      else onEscape();
    } else if (
      (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
      arrowGroup(event)
    ) {
      event.preventDefault();
      return;
    } else if (event.key === "ArrowDown")
      items[(at + 1) % items.length]?.focus();
    else if (event.key === "ArrowUp")
      items[(at - 1 + items.length) % items.length]?.focus();
    else return;
    event.preventDefault();
  });

  const itemButton = (item: MenuItem): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-menu-item";
    button.setAttribute("role", "menuitem");
    button.textContent = item.label;
    if (item.danger) button.classList.add("is-danger");
    button.addEventListener("click", (event) => {
      if (doubled(event)) return;
      close();
      item.run?.();
    });
    return button;
  };

  let groups = 0;
  const groupButtons = (item: MenuItem): HTMLButtonElement[] => {
    const head = document.createElement("button");
    head.type = "button";
    head.id = "project-menu-group-" + ++groups;
    head.className = "project-menu-item is-group";
    head.setAttribute("role", "menuitem");
    head.setAttribute("aria-haspopup", "true");
    head.setAttribute("aria-expanded", "false");
    head.textContent = item.label;
    const children = (item.items ?? []).map((child) => {
      const button = itemButton(child);
      button.classList.add("is-child");
      button.dataset.group = head.id;
      button.hidden = true;
      return button;
    });
    head.addEventListener("click", (event) => {
      if (doubled(event)) return;
      const open = head.getAttribute("aria-expanded") !== "true";
      toggleGroup(head, open);
      if (open) children[0]?.focus();
    });
    return [head, ...children];
  };

  return {
    el: menu,
    open(items, x, y, by) {
      owner = by ?? null;
      settleUntil = 0;
      menu.replaceChildren(
        ...items.flatMap((item) =>
          item.items ? groupButtons(item) : [itemButton(item)],
        ),
      );
      menu.hidden = false;
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      const right = document.documentElement.clientWidth;
      const bottom = window.innerHeight;
      menu.style.left = Math.max(8, Math.min(x, right - width - 8)) + "px";
      menu.style.top = Math.max(8, Math.min(y, bottom - height - 8)) + "px";
      menu.querySelector<HTMLButtonElement>("button")?.focus();
    },
    close,
    owner: () => (menu.hidden ? null : owner),
  };
}
