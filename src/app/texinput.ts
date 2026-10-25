import "../tex/texcomplete.css";
import { initTexComplete } from "../tex/texcomplete.ts";
import { initTexImageInput, insertPickedImage } from "../tex/teximages.ts";
import { initTexItems } from "../tex/texitems.ts";
import { initTexQuotes } from "../tex/texquotes.ts";

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
  initTexQuotes({ editor, active });
  initTexItems({ editor, active });
}
