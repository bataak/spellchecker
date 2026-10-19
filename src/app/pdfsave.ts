import { stripExt } from "../export/exportformats.ts";
import type { PdfSave } from "../files/fileio.ts";
import type { Preview } from "../preview/preview.ts";
import { createPdfSaver } from "../export/savepdf.ts";

const NOTIFY_MS = 8000;

export interface PdfSaveDeps {
  readonly preview: Preview;
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
    applies: deps.mobileTex,
    save: () => saveFile(() => deps.preview.pdf()),
  };
}
