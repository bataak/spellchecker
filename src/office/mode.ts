import { downloadBlob } from "../ui/download.ts";
import { openDocx, saveDocx } from "./docx/index.ts";
import { openOdf, saveOdf } from "./odf/index.ts";
import { openPptx, savePptx } from "./pptx/index.ts";
import { FileReadError } from "./fileerror.ts";
import { syncEdits } from "./editsync.ts";
import { renderFlat } from "./textdoc.ts";
import type { SaveResult, TextEdit, TextIndex } from "./textdoc.ts";
import { docxUnread, odfUnread } from "./unread.ts";
import type { UnreadKind } from "./unread.ts";
import type { SkipReason } from "./docx/edit.ts";
import { unpackedSize } from "../archive/archive.ts";

export type OfficeFormat = "docx" | "pptx" | "odt" | "odp";

export type OfficeEdit = TextEdit;

export interface SkippedWord {
  word: string;
  reason: SkipReason;
}

export interface SaveOutcome {
  delivered: "share" | "download" | "cancelled";
  applied: number;
  skipped: number;
  skippedWords: SkippedWord[];
}

export interface OfficeMode {
  format: OfficeFormat;
  unread: readonly UnreadKind[];
  text: () => string;
  fileName: () => string;
  outputName: () => string;
  pendingCount: () => number;
  sync: (oldText: string, newText: string) => boolean;
  revertAll: () => string;
  save: () => Promise<SaveOutcome>;
}

interface Engine {
  text: string;
  unread: readonly UnreadKind[];
  save: (edits: OfficeEdit[]) => SaveResult;
}

const SIZE_LIMIT_MB = 30;
export const SIZE_LIMIT = SIZE_LIMIT_MB * 1024 * 1024;
const UNPACKED_LIMIT = 512 * 1024 * 1024;

export const MIME: Record<OfficeFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
};

export const PLAIN_EXTENSIONS = [".txt", ".md", ".markdown", ".mdown", ".text"];

export const OFFICE_ACCEPT = [
  ".docx",
  ".pptx",
  ".odt",
  ".odp",
  MIME.docx,
  MIME.pptx,
  MIME.odt,
  MIME.odp,
].join(",");

export const OPEN_ACCEPT = [
  ...PLAIN_EXTENSIONS,
  "text/plain",
  "text/markdown",
  OFFICE_ACCEPT,
].join(",");

export function officeFormat(file: File): OfficeFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx") || file.type === MIME.docx) return "docx";
  if (name.endsWith(".pptx") || file.type === MIME.pptx) return "pptx";
  if (name.endsWith(".odt") || file.type === MIME.odt) return "odt";
  if (name.endsWith(".odp") || file.type === MIME.odp) return "odp";
  return null;
}

export function isPlainFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (PLAIN_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  return file.type.startsWith("text/") || file.type === "";
}

export const SAVED_SUFFIX = "-zassan";

export function suggestName(original: string, format: OfficeFormat): string {
  const base = original
    .replace(new RegExp("\\." + format + "$", "i"), "")
    .replace(new RegExp("(?:" + SAVED_SUFFIX + ")+$", "i"), "");

  return base + SAVED_SUFFIX + "." + format;
}

async function readBytes(file: File): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await file.arrayBuffer());
}

function engineOf<D extends TextIndex>(
  doc: D,
  save: (doc: D, edits: OfficeEdit[]) => SaveResult,
  unread: (doc: D) => readonly UnreadKind[] = () => [],
): Engine {
  return {
    text: doc.text,
    unread: unread(doc),
    save: (edits) => save(doc, edits),
  };
}

const odfEngine = (bytes: Uint8Array): Engine =>
  engineOf(openOdf(bytes), saveOdf, (doc) => odfUnread(doc.pkg));

const ENGINES: Record<OfficeFormat, (bytes: Uint8Array) => Engine> = {
  docx: (bytes) =>
    engineOf(openDocx(bytes), saveDocx, (doc) => docxUnread(doc.parts)),
  pptx: (bytes) => engineOf(openPptx(bytes), savePptx),
  odt: odfEngine,
  odp: odfEngine,
};

export async function deliver(
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  format: OfficeFormat,
): Promise<"share" | "download" | "cancelled"> {
  const blob = new Blob([bytes], { type: MIME[format] });
  const file = new File([blob], name, { type: MIME[format] });

  if (
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return "share";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return "cancelled";
    }
  }

  downloadBlob(blob, name);
  return "download";
}

export async function openOfficeMode(file: File): Promise<OfficeMode> {
  const format = officeFormat(file);
  if (format === null) throw new FileReadError({ kind: "unsupported" });
  if (file.size > SIZE_LIMIT)
    throw new FileReadError({ kind: "too-large", limitMb: SIZE_LIMIT_MB });

  const bytes = await readBytes(file);
  if ((await unpackedSize(bytes)) > UNPACKED_LIMIT)
    throw new FileReadError({ kind: "unpacked-too-large" });
  const engine = ENGINES[format](bytes);
  const source = engine.text;
  const fileName = file.name;
  let edits: OfficeEdit[] = [];

  const sync = (oldText: string, newText: string): boolean => {
    const next = syncEdits(source, edits, oldText, newText);
    if (next === null) return false;
    edits = next;
    return true;
  };

  return {
    format,
    unread: engine.unread,
    text: () => renderFlat(source, edits),
    fileName: () => fileName,
    outputName: () => suggestName(fileName, format),
    pendingCount: () => edits.length,
    sync,
    revertAll: () => {
      edits = [];
      return source;
    },
    save: async () => {
      const result = engine.save(edits);
      const delivered = await deliver(
        result.bytes,
        suggestName(fileName, format),
        format,
      );

      return {
        delivered,
        applied: result.applied.length,
        skipped: result.skipped.length,
        skippedWords: result.skipped.map((item) => ({
          word: source.slice(item.edit.start, item.edit.end),
          reason: item.reason,
        })),
      };
    },
  };
}
