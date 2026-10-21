export interface MenuItem {
  readonly label: string;
  readonly run?: () => void;
  readonly danger?: boolean;
  readonly items?: readonly MenuItem[];
}

export interface ProjectMenu {
  readonly el: HTMLElement;
  open(items: readonly MenuItem[], x: number, y: number): void;
  close(): void;
}

export function createProjectMenu(onEscape: () => void): ProjectMenu {
  const menu = document.createElement("div");
  menu.className = "project-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  document.body.append(menu);

  const close = (): void => {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
  };

  menu.addEventListener("keydown", (event) => {
    const items = [
      ...menu.querySelectorAll<HTMLButtonElement>("button:not([hidden])"),
    ];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      close();
      onEscape();
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
    button.addEventListener("click", () => {
      close();
      item.run?.();
    });
    return button;
  };

  const groupButtons = (item: MenuItem): HTMLButtonElement[] => {
    const head = document.createElement("button");
    head.type = "button";
    head.className = "project-menu-item is-group";
    head.setAttribute("role", "menuitem");
    head.setAttribute("aria-expanded", "false");
    head.textContent = item.label;
    const children = (item.items ?? []).map((child) => {
      const button = itemButton(child);
      button.classList.add("is-child");
      button.hidden = true;
      return button;
    });
    head.addEventListener("click", () => {
      const before = menu.offsetHeight;
      const open = head.getAttribute("aria-expanded") !== "true";
      head.setAttribute("aria-expanded", String(open));
      for (const child of children) child.hidden = !open;
      const top = parseFloat(menu.style.top) || 0;
      menu.style.top = Math.max(8, top - menu.offsetHeight + before) + "px";
      if (open) children[0]?.focus();
    });
    return [head, ...children];
  };

  return {
    el: menu,
    open(items, x, y) {
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
  };
}
