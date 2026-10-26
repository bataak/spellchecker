import { element } from "./dom.ts";

export interface SnackAction {
  readonly label: string;
  readonly run: () => void;
}

export const SNACK_MS = 8000;

let current: {
  node: HTMLElement;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

function dismiss(): void {
  if (!current) return;
  clearTimeout(current.timer);
  current.node.remove();
  current = null;
}

export function showSnackbar(
  text: string,
  action: SnackAction | null,
  ms = SNACK_MS,
): void {
  dismiss();
  const node = element("div", "snackbar");
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  node.append(element("span", "snackbar-text", text));
  if (action) {
    const button = element("button", "snackbar-action", action.label);
    button.type = "button";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      dismiss();
      action.run();
    });
    node.append(button);
  }
  document.body.append(node);
  current = { node, timer: setTimeout(dismiss, ms) };
}

export function hideSnackbar(): void {
  dismiss();
}
