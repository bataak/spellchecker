import { prepareImages } from "../files/images.ts";
import { parse } from "../markdown.ts";
import { splitSlides } from "../doc/slides.ts";
import { docImages } from "../office/docir.ts";
import { findTemplate, type Frame } from "../doc/templates.ts";
import type { TexProject } from "../project/projectbuild.ts";

const PRINT_FRAMES: ReadonlySet<Frame> = new Set([
  "letter",
  "structured",
  "slides",
]);

export interface PrintDeps {
  readonly editor: HTMLTextAreaElement;
  readonly blocked?: () => boolean;
  readonly isTex?: () => boolean;
  readonly texProject?: () => TexProject | null;
  readonly template: () => string;
  readonly onBlocked?: () => void;
  readonly onPrintError?: (error: unknown) => void;
  readonly onBusy?: (busy: boolean) => void;
}

export interface Printer {
  printable(): boolean;
  start(): void;
}

export function createPrinter(deps: PrintDeps): Printer {
  async function printTex(): Promise<void> {
    deps.onBusy?.(true);
    try {
      const [{ compileTex }, { printPdf }] = await Promise.all([
        import("../tex/texpdf.ts"),
        import("./printframe.ts"),
      ]);
      await printPdf(
        await compileTex(deps.editor.value, deps.texProject?.() ?? null),
      );
    } finally {
      deps.onBusy?.(false);
    }
  }

  async function print(): Promise<void> {
    if (deps.isTex?.()) return printTex();
    const template = findTemplate(deps.template())!;
    if (template.frame === "slides") {
      const [{ deckDoc, deckImages }, { deckPrintHtml }, office, frame] =
        await Promise.all([
          import("../office/deck.ts"),
          import("../office/deckprint.ts"),
          import("../office/print.ts"),
          import("./printframe.ts"),
        ]);
      const deck = deckDoc(splitSlides(parse(deps.editor.value)));
      const images = await prepareImages(deckImages(deck));
      await frame.printPage(
        deckPrintHtml(deck, images, office.printFontBase()),
      );
      return;
    }
    const [{ applyTemplate }, office, frame] = await Promise.all([
      import("../office/apply.ts"),
      import("../office/print.ts"),
      import("./printframe.ts"),
    ]);
    const doc = applyTemplate(parse(deps.editor.value), template);
    const images = await prepareImages(docImages(doc));
    await frame.printPage(
      office.printHtml(doc, office.printFontBase(), images),
    );
  }

  function printable(): boolean {
    if (deps.blocked?.()) return false;
    if (deps.isTex?.()) return true;
    const frame = findTemplate(deps.template())?.frame;
    return frame !== undefined && PRINT_FRAMES.has(frame);
  }

  function start(): void {
    print().catch((error: unknown) => {
      console.error("print:", error);
      if (deps.onPrintError) deps.onPrintError(error);
      else deps.onBlocked?.();
    });
  }

  return { printable, start };
}
