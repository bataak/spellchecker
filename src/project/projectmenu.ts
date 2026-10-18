export interface MenuItem {
  readonly label: string;
  readonly run: () => void;
  readonly danger?: boolean;
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
    const items = [...menu.querySelectorAll<HTMLButtonElement>("button")];
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

  return {
    el: menu,
    open(items, x, y) {
      menu.replaceChildren(
        ...items.map((item) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "project-menu-item";
          button.setAttribute("role", "menuitem");
          button.textContent = item.label;
          if (item.danger) button.classList.add("is-danger");
          button.addEventListener("click", () => {
            close();
            item.run();
          });
          return button;
        }),
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
