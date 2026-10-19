import { imageFiles } from "../files/images.ts";
import { blockImages, parse } from "../markdown.ts";
import { docImages, imageKey } from "../office/docir.ts";
import { findTemplate, type Frame } from "../doc/templates.ts";

export interface ExportFormat {
  readonly id: string;
  readonly frames: readonly Frame[];
  readonly preferred?: boolean;
  readonly name: string;
  readonly ext: string;
  readonly mime: string;
  readonly slow?: boolean;
  readonly delivered?: () => void;
  readonly save?: (name: string) => Promise<void>;
  readonly build: (
    text: string,
    templateId: string,
    options: BuildOptions,
  ) => BlobPart | Promise<BlobPart>;
}

export interface BuildOptions {
  readonly toc: boolean;
  readonly name?: string;
}

const TOC_FRAMES: ReadonlySet<Frame> = new Set(["letter", "structured"]);

export const TOC_FORMATS: ReadonlySet<string> = new Set([
  "odt",
  "docx",
  "tex",
  "pdf",
]);

export function hasSections(text: string, templateId: string): boolean {
  const frame = findTemplate(templateId)?.frame;
  if (frame === undefined || !TOC_FRAMES.has(frame)) return false;
  const headings = parse(text).filter((block) => block.type === "heading");
  return headings.length > 1;
}

function tocFor(
  options: BuildOptions,
  templateId: string,
  text: string,
): boolean {
  return options.toc && hasSections(text, templateId);
}

async function latexFor(
  text: string,
  templateId: string,
  options: BuildOptions,
): Promise<string> {
  const [{ toBeamer, toLatex }, { dropControls }] = await Promise.all([
    import("../tex/latex.ts"),
    import("../office/sanitize.ts"),
  ]);
  const frame = findTemplate(templateId)?.frame;
  const blocks = parse(dropControls(text));
  return frame === "slides"
    ? toBeamer(blocks)
    : toLatex(blocks, undefined, {
        toc: tocFor(options, templateId, text),
        pageNumbers: frame !== "letter" || hasSections(text, templateId),
        letter: frame === "letter",
      });
}

async function pdfImages(
  text: string,
  source: string,
  texImagePath: (src: string) => string,
): Promise<{ tex: string; files: Record<string, Uint8Array> }> {
  const sources = [...new Set(blockImages(parse(text)).map((n) => n.src))];
  const ready = await imageFiles(sources.map((src) => ({ src })));
  const names = new Map<string, string>();
  const files: Record<string, Uint8Array> = {};
  for (const src of sources) {
    const file = ready.get(imageKey({ src }));
    if (!file) continue;
    const name =
      "image" +
      String(names.size + 1) +
      (file.ext === "jpeg" ? ".jpg" : ".png");
    names.set(texImagePath(src), name);
    files[name] = file.bytes;
  }
  const tex = source.replace(
    /\\includegraphics\[([^\]]*)\]\{([^}]*)\}/g,
    (_, opts: string, path: string) => {
      const name = names.get(path);
      return name ? "\\includegraphics[" + opts + "]{" + name + "}" : "";
    },
  );
  return { tex, files };
}

export const FORMATS: readonly ExportFormat[] = [
  {
    id: "odt",
    frames: ["letter", "structured"],
    name: "OpenDocument",
    ext: "odt",
    mime: "application/vnd.oasis.opendocument.text",
    build: async (text, templateId, options) => {
      const [{ parse }, { applyTemplate }, { buildOdt }] = await Promise.all([
        import("../markdown.ts"),
        import("../office/apply.ts"),
        import("../office/odt/create.ts"),
      ]);
      const template = findTemplate(templateId) ?? findTemplate("plain")!;
      const doc = applyTemplate(parse(text), template);
      return buildOdt(doc, {
        toc: tocFor(options, templateId, text),
        images: await imageFiles(docImages(doc)),
      });
    },
  },
  {
    id: "docx",
    frames: ["letter", "structured"],
    preferred: true,
    name: "Word",
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    build: async (text, templateId, options) => {
      const [{ parse }, { applyTemplate }, { buildDocx }] = await Promise.all([
        import("../markdown.ts"),
        import("../office/apply.ts"),
        import("../office/docx/create.ts"),
      ]);
      const template = findTemplate(templateId) ?? findTemplate("plain")!;
      const doc = applyTemplate(parse(text), template);
      return buildDocx(doc, {
        toc: tocFor(options, templateId, text),
        images: await imageFiles(docImages(doc)),
      });
    },
  },
  {
    id: "pdf",
    frames: ["letter", "structured", "slides"],
    name: "PDF",
    ext: "pdf",
    mime: "application/pdf",
    slow: true,
    build: async (text, templateId, options) => {
      const [source, { compilePdf }, { texImagePath }] = await Promise.all([
        latexFor(text, templateId, options),
        import("../tex/texpdf.ts"),
        import("../tex/latex.ts"),
      ]);
      const { tex, files } = await pdfImages(text, source, texImagePath);
      return compilePdf(tex, tocFor(options, templateId, text) ? 2 : 1, files);
    },
  },
  {
    id: "odp",
    frames: ["slides"],
    name: "OpenDocument",
    ext: "odp",
    mime: "application/vnd.oasis.opendocument.presentation",
    build: async (text) => {
      const [
        { parse },
        { splitSlides },
        { deckDoc, deckImages },
        { buildOdp },
      ] = await Promise.all([
        import("../markdown.ts"),
        import("../doc/slides.ts"),
        import("../office/deck.ts"),
        import("../office/odp/create.ts"),
      ]);
      const deck = deckDoc(splitSlides(parse(text)));
      return buildOdp(deck, { images: await imageFiles(deckImages(deck)) });
    },
  },
  {
    id: "pptx",
    frames: ["slides"],
    preferred: true,
    name: "PowerPoint",
    ext: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    build: async (text) => {
      const [
        { parse },
        { splitSlides },
        { deckDoc, deckImages },
        { buildPptx },
      ] = await Promise.all([
        import("../markdown.ts"),
        import("../doc/slides.ts"),
        import("../office/deck.ts"),
        import("../office/pptx/create.ts"),
      ]);
      const deck = deckDoc(splitSlides(parse(text)));
      return buildPptx(deck, { images: await imageFiles(deckImages(deck)) });
    },
  },
  {
    id: "tex",
    frames: ["letter", "structured", "slides"],
    name: "LaTeX",
    ext: "tex",
    mime: "application/x-tex;charset=utf-8",
    build: latexFor,
  },
  {
    id: "md",
    frames: ["letter", "structured", "slides"],
    name: "Markdown",
    ext: "md",
    mime: "text/markdown;charset=utf-8",
    build: (text) => text,
  },
  {
    id: "md-plain",
    frames: ["letter", "structured", "slides"],
    name: "Markdown (цэвэр)",
    ext: "md",
    mime: "text/markdown;charset=utf-8",
    build: async (text) => (await import("../markdown.ts")).withoutDivs(text),
  },
  {
    id: "txt",
    frames: ["plain"],
    name: "Энгийн бичвэр",
    ext: "txt",
    mime: "text/plain;charset=utf-8",
    build: (text) => text,
  },
];

const KNOWN_EXT = new RegExp(
  "\\.(?:" +
    [
      ...new Set([
        ...FORMATS.map((format) => format.ext),
        "txt",
        "text",
        "md",
        "markdown",
        "tex",
        "ltx",
        "docx",
        "pptx",
        "odt",
        "odp",
        "pdf",
        "zip",
      ]),
    ].join("|") +
    ")$",
  "i",
);

export function stripExt(name: string): string {
  return name.replace(KNOWN_EXT, "");
}

export function withExt(name: string, ext: string): string {
  return KNOWN_EXT.test(name) ? name : name + "." + ext;
}
