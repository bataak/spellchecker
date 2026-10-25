import type * as Y from "yjs";
import { bindText } from "./textbind.ts";

const SETTLE_MS = 6000;

export interface Attacher {
  attach(): void;
  detach(): void;
  settle(): void;
  destroy(): void;
}

export function createAttacher(
  editor: HTMLTextAreaElement,
  text: Y.Text,
  fresh: boolean,
  shown: (on: boolean) => void = () => {},
): Attacher {
  const binding = bindText(editor, text);
  let settled = !fresh;
  let wanted = false;
  const timer = settled ? null : setTimeout(() => settle(), SETTLE_MS);
  const attach = (): void => {
    if (fresh && text.length === 0 && editor.value)
      text.insert(0, editor.value);
    binding.attach();
    shown(true);
  };
  function settle(): void {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (wanted) attach();
  }
  return {
    attach() {
      wanted = true;
      if (settled) attach();
    },
    detach() {
      wanted = false;
      binding.detach();
      shown(false);
    },
    settle,
    destroy() {
      if (timer) clearTimeout(timer);
      binding.destroy();
    },
  };
}
