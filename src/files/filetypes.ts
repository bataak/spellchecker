import type { DraftFile } from "../core/storage.ts";

export const MAX_OPEN_BYTES = 10 * 1024 * 1024;
export const BIG_NOTICE_BYTES = 2 * 1024 * 1024;

const OFFICE_EXT = /\.(docx|pptx|odt|odp|pdf)$/i;
export const TEXT_EXT = /\.(txt|md|markdown|mdown|text|tex|ltx)$/i;
const MD_EXT = /\.(md|markdown|mdown)$/i;
const TEX_EXT = /\.(tex|ltx)$/i;
const PDF_MIME = "application/pdf";

const OFFICE_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
} as const;

export interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

const SAVE_TYPES: Record<string, PickerType[]> = {
  txt: [{ description: "Текст файл", accept: { "text/plain": [".txt"] } }],
  md: [{ description: "Markdown файл", accept: { "text/markdown": [".md"] } }],
  tex: [{ description: "LaTeX файл", accept: { "text/x-tex": [".tex"] } }],
};

export const OPEN_LABEL = "txt, md, tex, docx, pptx, odt, odp, pdf";

export const OPEN_TYPES: PickerType[] = [
  {
    description: "Текст файл",
    accept: { "text/plain": [".txt", ".md", ".markdown", ".text"] },
  },
  {
    description: "LaTeX файл",
    accept: { "text/x-tex": [".tex", ".ltx"] },
  },
  {
    description: "Баримт",
    accept: {
      [OFFICE_MIME.docx]: [".docx"],
      [OFFICE_MIME.pptx]: [".pptx"],
      [OFFICE_MIME.odt]: [".odt"],
      [OFFICE_MIME.odp]: [".odp"],
    },
  },
  {
    description: "PDF",
    accept: { [PDF_MIME]: [".pdf"] },
  },
  {
    description: "LaTeX төсөл (zip)",
    accept: { "application/zip": [".zip"] },
  },
];

export function saveTypes(ext: string): PickerType[] {
  return SAVE_TYPES[ext] ?? SAVE_TYPES.txt!;
}

export function textMime(name: string): string {
  if (TEX_EXT.test(name)) return "text/x-tex;charset=utf-8";
  return MD_EXT.test(name)
    ? "text/markdown;charset=utf-8"
    : "text/plain;charset=utf-8";
}

export function stampName(ext: string, mobile: boolean, now: Date): string {
  const pad2 = (num: number): string => String(num).padStart(2, "0");
  const ts =
    now.getFullYear() +
    "-" +
    pad2(now.getMonth() + 1) +
    "-" +
    pad2(now.getDate()) +
    "-" +
    pad2(now.getHours()) +
    pad2(now.getMinutes());
  return (mobile ? "" : "бичвэр-") + ts + "." + ext;
}

export function textName(
  name: string,
  ext: string,
  stamp: () => string,
): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return stamp();
  return TEXT_EXT.test(trimmed) ? trimmed : trimmed + "." + ext;
}

type FileLike = Pick<File, "name" | "type">;

export function looksOffice(file: FileLike | null | undefined): boolean {
  if (!file) return false;
  if (file.type === PDF_MIME) return true;
  if ((Object.values(OFFICE_MIME) as string[]).includes(file.type)) return true;
  return OFFICE_EXT.test(file.name);
}

export function isTextFile(file: FileLike | null | undefined): boolean {
  return (
    !!file &&
    (file.type.indexOf("text/") === 0 || TEXT_EXT.test(file.name) || !file.type)
  );
}

export function isZip(name: string): boolean {
  return /\.zip$/i.test(name);
}

export function toMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export type SizeVerdict = "ok" | "big" | "too-big";

export function sizeVerdict(size: number): SizeVerdict {
  if (size > MAX_OPEN_BYTES) return "too-big";
  if (size > BIG_NOTICE_BYTES) return "big";
  return "ok";
}

export function restoredName(ref: DraftFile): string {
  return ref.kind === "office"
    ? ref.name.replace(OFFICE_EXT, "") + ".txt"
    : ref.name;
}
