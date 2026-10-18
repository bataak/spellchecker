import { prepareImages } from "./images.ts";
import { parse } from "./markdown.ts";
import { docImages } from "./office/docir.ts";
import { findTemplate, type Frame } from "./templates.ts";

const PRINT_FRAMES: ReadonlySet<Frame> = new Set([
  "letter",
  "structured",
  "slides",
]);

export interface PrintDeps {
  readonly editor: HTMLTextAreaElement;
  readonly blocked?: () => boolean;
  readonly isTex?: () => boolean;
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
        import("./tex/texpdf.ts"),
        import("./office/print.ts"),
      ]);
      await printPdf(await compileTex(deps.editor.value));
    } finally {
      deps.onBusy?.(false);
    }
  }

  async function print(): Promise<void> {
    if (deps.isTex?.()) return printTex();
    const template = findTemplate(deps.template())!;
    if (template.frame === "slides") {
      const [{ splitSlides }, { deckDoc, deckImages }, { printDeck }] =
        await Promise.all([
          import("./slides.ts"),
          import("./office/deck.ts"),
          import("./office/deckprint.ts"),
        ]);
      const deck = deckDoc(splitSlides(parse(deps.editor.value)));
      await printDeck(deck, await prepareImages(deckImages(deck)));
      return;
    }
    const [{ applyTemplate }, { printDoc }] = await Promise.all([
      import("./office/apply.ts"),
      import("./office/print.ts"),
    ]);
    const doc = applyTemplate(parse(deps.editor.value), template);
    await printDoc(doc, await prepareImages(docImages(doc)));
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
