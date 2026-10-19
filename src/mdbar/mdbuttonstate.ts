import { ALIGN_ROLE, HEADING_DEPTH, type Role } from "./mdbuttons.ts";
import { alignAt, headingDepthAt, type AlignKind } from "./mdedit.ts";

export interface ButtonState {
  sync(): void;
  reset(): void;
}

export function createButtonState(
  group: HTMLElement,
  editor: HTMLTextAreaElement,
  visible: () => boolean,
): ButtonState {
  const headingButtons: [HTMLButtonElement, number][] = [];
  const alignButtons: [HTMLButtonElement, AlignKind][] = [];
  for (const button of group.querySelectorAll<HTMLButtonElement>(".md-btn")) {
    const role = button.dataset.role as Role;
    const want = HEADING_DEPTH[role];
    if (want !== undefined) headingButtons.push([button, want]);
    const kind = ALIGN_ROLE[role];
    if (kind !== undefined) alignButtons.push([button, kind]);
  }
  let lastState = "";

  return {
    sync() {
      if (!visible()) return;
      const depth = headingDepthAt(editor.value, editor.selectionStart);
      const align = alignAt(editor.value, editor.selectionStart);
      const state = String(depth) + ":" + String(align);
      if (state === lastState) return;
      lastState = state;
      for (const [button, want] of headingButtons)
        button.classList.toggle("is-on", want === depth);
      for (const [button, kind] of alignButtons)
        button.classList.toggle("is-on", kind === align);
    },
    reset() {
      lastState = "";
    },
  };
}
