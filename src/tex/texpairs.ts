import { onSwap, replaceRange } from "../editor/editortext.ts";
import type { Expansion } from "./texcompletion.ts";
import {
  caretPatch,
  breakDisplay,
  deleteBracket,
  deleteDollar,
  shiftStops,
  snippetStops,
  tabStop,
  typeBracket,
  typeDollar,
} from "./texstops.ts";
import type { PairEdit, TabStops } from "./texstops.ts";

export interface TabStopDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
  readonly paired: () => void;
}

export interface TexTabStops {
  applying(): boolean;
  insert(edit: Expansion): boolean;
  jump(e: KeyboardEvent): void;
}

function planPair(
  e: InputEvent,
  stops: readonly TabStops[],
  text: string,
  from: number,
  to: number,
): PairEdit | null {
  switch (e.inputType) {
    case "insertText":
      if (e.data === "$") return typeDollar(stops, text, from, to);
      if (e.data === "[") return typeBracket(stops, text, from, to);
      return null;
    case "deleteContentBackward":
      if (from !== to) return null;
      return (
        deleteDollar(stops, text, from) ?? deleteBracket(stops, text, from)
      );
    case "insertLineBreak":
    case "insertParagraph":
      return breakDisplay(stops, text, from, to);
  }
  return null;
}

export function bindTabStops(d: TabStopDeps): TexTabStops {
  const { editor } = d;
  let applying = false;
  let stops: TabStops[] = [];
  let seen = editor.value;

  const replace = (from: number, to: number, text: string): boolean => {
    applying = true;
    try {
      return replaceRange(editor, from, to, text);
    } finally {
      applying = false;
    }
  };

  function track(): void {
    if (applying) return;
    const text = editor.value;
    if (stops.length) {
      const patch = caretPatch(seen, text, editor.selectionEnd);
      if (patch) stops = shiftStops(stops, patch);
    }
    seen = text;
  }

  function pair(e: InputEvent): void {
    if (e.defaultPrevented || !d.active() || e.isComposing) return;
    if (editor.value !== seen) stops = [];
    const plan = planPair(
      e,
      stops,
      editor.value,
      editor.selectionStart,
      editor.selectionEnd,
    );
    if (!plan) return;
    e.preventDefault();
    d.paired();
    const { patch } = plan;
    const native = patch ? replace(patch.from, patch.to, patch.insert) : true;
    stops = plan.stack;
    editor.setSelectionRange(plan.caret, plan.caret);
    seen = editor.value;
    if (!native) editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  editor.addEventListener("beforeinput", pair);
  onSwap(() => {
    stops = [];
  });
  editor.addEventListener("input", track);

  return {
    applying: () => applying,
    insert(edit) {
      const native = replace(edit.from, edit.to, edit.text);
      editor.setSelectionRange(edit.caret, edit.caret);
      stops = shiftStops(stops, {
        from: edit.from,
        to: edit.to,
        insert: edit.text,
      });
      const added = snippetStops(edit);
      if (added) stops = [...stops, added];
      seen = editor.value;
      return native;
    },
    jump(e) {
      if (!stops.length) return;
      if (e.key === "Escape") {
        stops = [];
        return;
      }
      if (e.key !== "Tab" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)
        return;
      if (
        !d.active() ||
        editor.value !== seen ||
        editor.selectionStart !== editor.selectionEnd
      ) {
        stops = [];
        return;
      }
      const next = tabStop(stops, editor.value, editor.selectionStart);
      stops = next.stack;
      if (next.caret === null) return;
      e.preventDefault();
      e.stopPropagation();
      editor.setSelectionRange(next.caret, next.caret);
    },
  };
}
