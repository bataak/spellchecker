import { initClean, initDecode, type DecodeControl } from "../editor/decode.ts";
import type { EditorPort } from "../core/ports.ts";
import { bindComposition } from "./editorinput.ts";

const STANDARD_LETTERS_MESSAGE = "Зарим үсгийн кодыг стандарт болгов";

export interface FixButtons {
  readonly decode: HTMLButtonElement | null;
  readonly clean: HTMLButtonElement | null;
}

export interface FixersDeps {
  readonly editor: EditorPort;
  readonly invalidate: () => void;
  readonly skipClean: () => boolean;
  readonly buttons: FixButtons;
}

export interface Fixers {
  readonly decode: DecodeControl;
  readonly clean: DecodeControl;
  readonly announceLetters: () => void;
  readonly sync: () => void;
}

export function createFixers(deps: FixersDeps): Fixers {
  const base = { editor: deps.editor, invalidate: deps.invalidate };
  const decode = initDecode({ ...base, button: deps.buttons.decode });
  const announceLetters = (): void => decode.announce(STANDARD_LETTERS_MESSAGE);
  bindComposition(deps.editor.el, announceLetters);
  const clean = initClean({
    ...base,
    button: deps.buttons.clean,
    skip: deps.skipClean,
  });
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
