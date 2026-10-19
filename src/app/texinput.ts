import { initTexComplete } from "../tex/texcomplete.ts";
import { initTexImageInput, insertPickedImage } from "../tex/teximages.ts";

export interface TexInputDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
  readonly rectAt: (start: number, end: number) => DOMRect | null;
}

export function initTexInput(deps: TexInputDeps): void {
  const { editor, active } = deps;
  initTexComplete({
    editor,
    active,
    rectAt: deps.rectAt,
    onImage: () => void insertPickedImage(editor),
  });
  initTexImageInput({ editor, active });
}
