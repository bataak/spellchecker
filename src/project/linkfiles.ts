import { escapeHtml } from "../core/htmlutil.ts";
import { baseName } from "../tex/texproject.ts";
import type { SaveResult } from "./projectstore.ts";

export const FILES_SAVED_NOTICE =
  "Засварласан файлуудыг «Татаж авсан файлууд» хавтас руу татлаа — анхны файлыг тэдгээрээр солино уу";

const SAVE_MESSAGES: Record<SaveResult, string> = {
  downloaded: "Архивлалаа",
  files: "Засварласан файлуудыг татлаа",
  saved: "Хадгаллаа",
  clean: "Өөрчлөлт алга",
};

export function conflictNotice(paths: readonly string[]): string {
  const names = paths
    .map((path) => "«" + escapeHtml(baseName(path)) + "»")
    .join(", ");
  return (
    names +
    " дискэн дээр өөрчлөгдсөн байна. Таны хадгалаагүй засвар хэвээр үлдсэн бөгөөд хадгалбал дискэн дээрх хувилбарыг дарна"
  );
}

export function saveMessage(result: SaveResult): string {
  return SAVE_MESSAGES[result];
}

export function confirmClose(unsaved: boolean | undefined): boolean {
  return (
    !unsaved ||
    window.confirm("Төсөлд хадгалагдаагүй файл байна. Төслийг хаах уу?")
  );
}

export function confirmReplace(unsaved: boolean | undefined): boolean {
  return (
    !unsaved ||
    window.confirm(
      "Нээлттэй төсөлд хадгалагдаагүй файл байна. Шинэ төсөл нээх үү?",
    )
  );
}

export function isTexName(name: string | null): name is string {
  return name !== null && /\.(tex|ltx)$/i.test(name);
}

const named = (path: string, name: string): boolean =>
  path === name || baseName(path) === name;

export function locateFile(
  files: readonly string[],
  name: string,
  text: string,
  textOf: (path: string) => string | null,
): string | null {
  const matches = files.filter((path) => named(path, name));
  return (
    matches.find((path) => textOf(path) === text) ??
    matches.sort((a, b) => a.split("/").length - b.split("/").length)[0] ??
    null
  );
}

export function findSameFile(
  files: readonly string[],
  name: string,
  matches: (path: string) => boolean,
): string | undefined {
  return files.find((path) => named(path, name) && matches(path));
}
