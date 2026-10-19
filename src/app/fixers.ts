import { initClean, initDecode, type DecodeControl } from "../decode.ts";
import type { EditorPort } from "../ports.ts";
import { bindComposition } from "./editorinput.ts";

const STANDARD_LETTERS_MESSAGE = "Зарим үсгийн кодыг стандарт болгов";

export interface FixersDeps {
  readonly editor: EditorPort;
  readonly invalidate: () => void;
  readonly skipClean: () => boolean;
}

export interface Fixers {
  readonly decode: DecodeControl;
  readonly clean: DecodeControl;
  readonly announceLetters: () => void;
  readonly sync: () => void;
}

export function createFixers(deps: FixersDeps): Fixers {
  const base = { editor: deps.editor, invalidate: deps.invalidate };
  const decode = initDecode(base);
  const announceLetters = (): void => decode.announce(STANDARD_LETTERS_MESSAGE);
  bindComposition(deps.editor.el, announceLetters);
  const clean = initClean({ ...base, skip: deps.skipClean });
  return {
    decode,
    clean,
    announceLetters,
    sync() {
      decode.sync();
      clean.sync();
    },
  };
}
