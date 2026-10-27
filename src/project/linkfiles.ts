import { askChoice } from "../ui/ask.ts";
import { escapeHtml } from "../core/htmlutil.ts";
import { baseName } from "../tex/texproject.ts";
import type { SaveResult } from "./projectstore.ts";

export const FILES_SAVED_NOTICE =
  "Засварласан файлуудыг «Татаж авсан файлууд» хавтас уруу татлаа — анхны файлыг тэдгээрээр солино уу";

const SAVE_MESSAGES: Record<SaveResult, string> = {
  downloaded: "Архивлалаа",
  files: "Засварласан файлуудыг татлаа",
  saved: "Хадгаллаа",
  committed: "Commit хийлээ",
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

export function commitSuggestion(dirty: Iterable<string>): string {
  const names = [...new Set([...dirty].map(baseName))];
  if (!names.length) return "Төслийн өөрчлөлт";
  const shown = names.slice(0, 3).join(", ");
  return "Засвар: " + shown + (names.length > 3 ? " болон бусад" : "");
}

export function saveMessage(result: SaveResult): string {
  return SAVE_MESSAGES[result];
}

export type Answer = boolean | Promise<boolean>;

export function whenSure(answer: Answer, go: () => void): void {
  if (answer === true) return go();
  if (answer === false) return;
  void answer.then((sure) => {
    if (sure) go();
  });
}

export function confirmClose(unsaved: boolean | undefined): Answer {
  if (!unsaved) return true;
  return askChoice({
    title: "Төсөлд хадгалагдаагүй файл байна. Төслийг хаах уу?",
    yes: "Хаах",
    no: "Болих",
    danger: true,
  });
}

export function confirmReplace(unsaved: boolean | undefined): Answer {
  if (!unsaved) return true;
  return askChoice({
    title: "Нээлттэй төсөлд хадгалагдаагүй файл байна. Шинэ төсөл нээх үү?",
    yes: "Нээх",
    no: "Болих",
  });
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
