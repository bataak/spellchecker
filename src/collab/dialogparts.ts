import type { Session } from "./sessiontypes.ts";
import { element } from "../ui/dom.ts";

export interface SessionSource {
  readonly session: () => Promise<Session>;
}

export const OFFLINE =
  "Сервертэй холбогдоогүй байна. Түр хүлээгээд дахин оролдоно уу.";

export function ask<T>(
  deps: SessionSource,
  run: (live: Session) => Promise<T | null>,
): Promise<T | null> {
  return deps
    .session()
    .then(run)
    .catch(() => null);
}

export function actionButton(label: string): HTMLButtonElement {
  const button = element("button", "tbtn", label);
  button.type = "button";
  return button;
}

export function say(
  note: HTMLElement,
  kind: "ok" | "err" | "",
  text: string,
): void {
  note.dataset.kind = kind;
  note.textContent = text;
}
