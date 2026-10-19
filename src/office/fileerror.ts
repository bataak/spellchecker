export type FileErrorReason =
  | { readonly kind: "unsupported" }
  | { readonly kind: "too-large"; readonly limitMb: number }
  | { readonly kind: "unpacked-too-large" }
  | { readonly kind: "no-text" };

export class FileReadError extends Error {
  readonly reason: FileErrorReason;

  constructor(reason: FileErrorReason) {
    super(reason.kind);
    this.name = "FileReadError";
    this.reason = reason;
  }
}

export function fileErrorReason(error: unknown): FileErrorReason | null {
  return error instanceof FileReadError ? error.reason : null;
}

const READ_MESSAGES: Record<
  Exclude<FileErrorReason["kind"], "too-large">,
  string
> = {
  unsupported: "Файлыг уншиж чадсангүй",
  "unpacked-too-large":
    "Файлыг задлахад хэт том болж байна — гэмтсэн эсвэл хортой файл байж магадгүй",
  "no-text":
    "Сканердсан баримт байна — текстийн давхарга агуулаагүй тул уншиж чадсангүй",
};

export function readFailureMessage(error: unknown, fallback: string): string {
  const reason = fileErrorReason(error);
  if (reason === null) return fallback;
  if (reason.kind === "too-large")
    return (
      "Файл хэт том байна — " +
      String(reason.limitMb) +
      " мегабайтаас хэтэрч болохгүй"
    );
  return READ_MESSAGES[reason.kind];
}
