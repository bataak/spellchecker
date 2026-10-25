import type { Layout } from "../ui/layout.ts";
import type { MeasureControl } from "../ui/measure.ts";
import { initPaneToggle, type PaneToggle } from "../ui/panetoggle.ts";
import { initPreview, type Preview } from "../preview/preview.ts";
import type { PreviewDeps } from "../preview/preview.ts";
import { createPdfSave, type PdfSaveControl } from "./pdfsave.ts";
import type { PdfSaveDeps } from "./pdfsave.ts";
import type { Emitter } from "../core/emitter.ts";

export interface PreviewPaneDeps
  extends Omit<PreviewDeps, "pdfName">, Omit<PdfSaveDeps, "preview"> {
  readonly workspace: HTMLElement;
  readonly sideBySide: () => boolean;
  readonly visibleOffset: () => number;
  readonly layoutChanged: Emitter<Layout>;
  readonly measure: MeasureControl;
}

export interface PreviewPane {
  readonly preview: Preview;
  readonly pane: PaneToggle;
  readonly pdfSave: PdfSaveControl;
}

export function createPreviewPane(deps: PreviewPaneDeps): PreviewPane {
  const preview = initPreview({ ...deps, pdfName: () => pdfSave.name() });
  const pane = initPaneToggle(
    deps.workspace,
    deps.area,
    () => deps.sideBySide() && deps.measure.layout().preview,
    (on) => {
      if (!on) return;
      preview.update();
      preview.revealAt(deps.visibleOffset());
    },
  );
  deps.layoutChanged.on(() => pane.sync());
  deps.layoutChanged.on((l) => {
    if (l.preview) preview.update();
  });
  const pdfSave = createPdfSave({ ...deps, preview });
  return { preview, pane, pdfSave };
}
