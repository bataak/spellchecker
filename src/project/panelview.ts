import type { ProjectView } from "./projectstore.ts";

export interface OpenedFile {
  readonly name: string;
  readonly handle: FileSystemFileHandle | null;
  readonly master: string | null;
}

export function ago(time: number, now: number): string {
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return "дөнгөж сая";
  if (minutes < 60) return minutes + " минутын өмнө";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " цагийн өмнө";
  return Math.floor(hours / 24) + " өдрийн өмнө";
}

export function exportTitle(exportedAt: number | null, now: number): string {
  return (
    "Төслийг бүхэлд нь zip архив болгож татах" +
    (exportedAt === null ? "" : " · сүүлд татсан: " + ago(exportedAt, now))
  );
}

export function projectTitle(view: ProjectView | null): string {
  if (!view) return "";
  return view.kind === "dir"
    ? view.label + " — дискэн дээрх хавтас"
    : view.label + " — энэ хөтөч дотор хадгалагдана";
}

export function folderLabel(file: OpenedFile | null, canPick: boolean): string {
  if (file?.master) return "Төслийн хавтсыг нээх";
  if (file?.handle && canPick) return "«" + file.name + "»-ийн хавтсыг нээх";
  return "Хавтас нээх";
}

export function emptyMessage(
  pendingLabel: string | null,
  file: OpenedFile | null,
): string {
  if (pendingLabel !== null)
    return (
      "«" +
      pendingLabel +
      "» хавтсыг дахин нээхийн тулд хандах зөвшөөрөл өгнө үү."
    );
  if (file?.master)
    return (
      "«" +
      file.name +
      "» нь «" +
      file.master +
      "» үндсэн файлын хэсэг. " +
      (file.master.startsWith("../")
        ? "Үндсэн файл байгаа дээд хавтсыг сонгоно уу."
        : "Тэр файл байгаа хавтсыг сонгоно уу.")
    );
  return "LaTeX төслийг хавтас эсвэл zip файлаар нээх боломжтой.";
}

export function treeStamp(
  view: ProjectView,
  collapsed: ReadonlySet<string>,
  selected: string | null,
): string {
  return [
    view.version,
    view.active,
    view.main,
    [...view.dirty].join("|"),
    [...collapsed].join("|"),
    selected,
  ]
    .map(String)
    .join(":");
}

export function removeQuestion(
  name: string,
  dir: boolean,
  onDisk: boolean,
): string {
  return (
    "«" +
    name +
    "» " +
    (dir ? "хавтсыг доторх бүх файлтай нь" : "файлыг") +
    (onDisk ? " дискнээс" : "") +
    " устгах уу?"
  );
}

export function replaceQuestion(
  name: string,
  dirty: boolean,
  onDisk: boolean,
): string {
  return (
    "«" +
    name +
    "» файл төсөлд байна." +
    (dirty ? " Хадгалаагүй өөрчлөлт нь алга болно." : "") +
    (onDisk
      ? " Дискэн дээрх файлыг шинэ файлаар солих уу?"
      : " Шинэ файлаар солих уу?")
  );
}
