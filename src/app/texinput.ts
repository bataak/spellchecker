import "../tex/texcomplete.css";
import { initTexComplete } from "../tex/texcomplete.ts";
import { initTexImageInput, insertPickedImage } from "../tex/teximages.ts";
import { initTexItems } from "../tex/texitems.ts";
import { initTexQuotes } from "../tex/texquotes.ts";
import { createSymbolIndex, type TexSource } from "../tex/texsymbols.ts";
import type { ProjectFiles } from "../project/projectstore.ts";

export interface TexInputDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
  readonly rectAt: (start: number, end: number) => DOMRect | null;
  readonly project: () => ProjectFiles | null;
  readonly path: () => string | null;
}

function* editorSources(
  text: string,
  files: ProjectFiles | null,
  path: string | null,
): Generator<TexSource> {
  if (files)
    for (const [name, body] of files.texts)
      if (name !== path) yield [name, body];
  yield [path ?? "", text];
}

export function initTexInput(deps: TexInputDeps): void {
  const { editor, active } = deps;
  const index = createSymbolIndex();
  initTexComplete({
    editor,
    active,
    rectAt: deps.rectAt,
    onImage: () => void insertPickedImage(editor),
    symbols: () =>
      index.collect(editorSources(editor.value, deps.project(), deps.path())),
  });
  initTexImageInput({ editor, active });
  initTexQuotes({ editor, active });
  initTexItems({ editor, active });
}
