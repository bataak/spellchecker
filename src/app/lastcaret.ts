import type { Caret } from "./editorinput.ts";

export interface LastCaret {
  readonly get: () => Caret | null;
  readonly set: (caret: Caret | null) => void;
}

export function createLastCaret(): LastCaret {
  let caret: Caret | null = null;
  return {
    get: () => caret,
    set: (next) => {
      caret = next;
    },
  };
}
