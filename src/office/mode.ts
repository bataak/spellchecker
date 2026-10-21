import { downloadBlob } from "../files/download.ts";
import { lineDiff } from "./linediff.ts";
import { openDocx, saveDocx } from "./docx/index.ts";
import { openOdf, saveOdf } from "./odf/index.ts";
import { openPptx, savePptx } from "./pptx/index.ts";
import { FileReadError } from "./fileerror.ts";
import { renderFlat } from "./textdoc.ts";
import type { SaveResult, TextEdit, TextIndex } from "./textdoc.ts";
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
): Engine {
  return { text: doc.text, save: (edits) => save(doc, edits) };
}

const ENGINES: Record<OfficeFormat, (bytes: Uint8Array) => Engine> = {
  docx: (bytes) => engineOf(openDocx(bytes), saveDocx),
  pptx: (bytes) => engineOf(openPptx(bytes), savePptx),
  odt: (bytes) => engineOf(openOdf(bytes), saveOdf),
  odp: (bytes) => engineOf(openOdf(bytes), saveOdf),
};

export function mergeEdit(
  source: string,
  edits: OfficeEdit[],
  start: number,
  end: number,
  text: string,
): OfficeEdit[] {
  const kept = edits.filter((edit) => edit.end <= start || edit.start >= end);
  const next = [...kept, { start, end, text }].sort(
    (l, r) => l.start - r.start,
  );
  return next.filter(
    (edit) => source.slice(edit.start, edit.end) !== edit.text,
  );
}

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
    const spans = lineDiff(oldText, newText);
    if (spans === null) return false;

    const before = renderFlat(source, edits);
    if (before !== oldText) return false;

    let next = edits;
    for (const span of [...spans].sort((l, r) => r.start - l.start)) {
      const mapped = mapToSource(source, next, span.start, span.end, span.text);
      if (mapped === null) return false;
      next = mergeEdit(source, next, mapped.start, mapped.end, mapped.text);
    }

    edits = next;
    return renderFlat(source, edits) === newText;
  };

  return {
    format,
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

export function mapToSource(
  source: string,
  edits: OfficeEdit[],
  start: number,
  end: number,
  text: string,
): OfficeEdit | null {
  const ordered = [...edits].sort((l, r) => l.start - r.start);
  const rendered = renderFlat(source, ordered);

  let sourceCursor = 0;
  let renderCursor = 0;

  let sourceStart = -1;
  let renderStart = -1;
  let sourceEnd = -1;
  let renderEnd = -1;

  const consider = (rs: number, re: number, ss: number, se: number): void => {
    if (sourceStart < 0 && start >= rs && start <= re) {
      sourceStart = se === ss ? ss : ss + Math.min(start - rs, se - ss);
      renderStart = start;
      if (se - ss !== re - rs) {
        sourceStart = ss;
        renderStart = rs;
      }
    }
    if (end >= rs && end <= re) {
      sourceEnd = se === ss ? ss : ss + Math.min(end - rs, se - ss);
      renderEnd = end;
      if (se - ss !== re - rs) {
        sourceEnd = se;
        renderEnd = re;
      }
    }
  };

  for (const edit of ordered) {
    if (edit.start > sourceCursor) {
      const length = edit.start - sourceCursor;
      consider(renderCursor, renderCursor + length, sourceCursor, edit.start);
      renderCursor += length;
    }
    consider(
      renderCursor,
      renderCursor + edit.text.length,
      edit.start,
      edit.end,
    );
    renderCursor += edit.text.length;
    sourceCursor = edit.end;
  }

  if (sourceCursor <= source.length) {
    const length = source.length - sourceCursor;
    consider(renderCursor, renderCursor + length, sourceCursor, source.length);
  }

  if (sourceStart < 0 || sourceEnd < 0) return null;

  const prefix = rendered.slice(renderStart, start);
  const suffix = rendered.slice(end, renderEnd);

  return { start: sourceStart, end: sourceEnd, text: prefix + text + suffix };
}
