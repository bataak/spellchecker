import { stripExt } from "../exportformats.ts";
import type { PdfSave } from "../fileio.ts";
import type { Preview } from "../preview/preview.ts";
import { createPdfSaver } from "../savepdf.ts";

const NOTIFY_MS = 8000;

export interface PdfSaveDeps {
  readonly preview: () => Preview | null;
  readonly mainFile: () => string | null;
  readonly baseName: () => string | null;
  readonly mobileTex: () => boolean;
  readonly saveProject: () => Promise<unknown> | undefined;
  readonly notify: (html: string, ms: number, animate: boolean) => void;
}

export interface PdfSaveControl extends PdfSave {
  readonly name: () => string;
}

export function createPdfSave(deps: PdfSaveDeps): PdfSaveControl {
  const name = (): string => {
    const base = deps.mainFile()?.split("/").pop() ?? deps.baseName();
    return stripExt(base || "бичвэр") + ".pdf";
  };
  const saveFile = createPdfSaver({
    name,
    saveProject: deps.saveProject,
    notify: (html) => deps.notify(html, NOTIFY_MS, false),
  });
  return {
    name,
    applies: () => deps.mobileTex() && deps.preview() !== null,
    async save() {
      const preview = deps.preview();
      if (preview) await saveFile(() => preview.pdf());
    },
  };
}
