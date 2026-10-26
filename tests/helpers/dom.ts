import { Window } from "happy-dom";

const GLOBALS = [
  "document",
  "Node",
  "Element",
  "HTMLElement",
  "HTMLDivElement",
  "HTMLButtonElement",
  "HTMLImageElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "Event",
  "InputEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "CustomEvent",
  "DOMRect",
  "NodeFilter",
  "getComputedStyle",
  "navigator",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
] as const;

export interface Dom {
  readonly window: Window;
  readonly close: () => Promise<void>;
}

export function installDom(html = ""): Dom {
  const window = new Window({ url: "http://localhost/" });
  window.document.body.innerHTML = html;
  const target = globalThis as Record<string, unknown>;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const put = (name: string, value: unknown): void => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  };
  put("window", window);
  for (const name of GLOBALS) {
    const value = (window as unknown as Record<string, unknown>)[name];
    put(
      name,
      typeof value === "function" && /^[a-z]/.test(name)
        ? value.bind(window)
        : value,
    );
  }
  return {
    window,
    close: async () => {
      await window.happyDOM.close();
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete target[name];
      }
    },
  };
}
