export interface BarTools {
  readonly group: HTMLElement;
  active(): boolean;
  contains(node: Node): boolean;
  isOpen(): boolean;
  close(): void;
  destroy(): void;
}

export interface MenuFocus {
  contains(node: Node): boolean;
  isOpen(): boolean;
}

export interface ToolHost {
  add(tools: BarTools): void;
  sync(): void;
  anyShown(): boolean;
  menu(base: MenuFocus): MenuFocus;
  destroy(): void;
}

export function createToolHost(
  after: HTMLElement,
  changed: () => void,
): ToolHost {
  const extras: BarTools[] = [];
  return {
    add(tools) {
      (extras.at(-1)?.group ?? after).after(tools.group);
      extras.push(tools);
      changed();
    },
    sync() {
      for (const tools of extras) {
        const off = !tools.active();
        if (tools.group.hidden === off) continue;
        tools.group.hidden = off;
        if (off) tools.close();
      }
    },
    anyShown: () =>
      !after.hidden || extras.some((tools) => !tools.group.hidden),
    menu: (base) => ({
      contains: (node) =>
        base.contains(node) || extras.some((tools) => tools.contains(node)),
      isOpen: () => base.isOpen() || extras.some((tools) => tools.isOpen()),
    }),
    destroy() {
      for (const tools of extras.splice(0)) tools.destroy();
    },
  };
}
