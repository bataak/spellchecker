const BULK_DELETE = new Set([
  "deleteWordBackward",
  "deleteWordForward",
  "deleteSoftLineBackward",
  "deleteSoftLineForward",
  "deleteHardLineBackward",
  "deleteHardLineForward",
  "deleteByCut",
  "deleteByDrag",
  "deleteContent",
]);

export function isBulkDelete(e: InputEvent): boolean {
  return BULK_DELETE.has(e.inputType || "");
}

export function isSeparatorInput(e: InputEvent): boolean {
  const it = e.inputType || "";
  if (it === "insertText")
    return e.data != null && /[\s\p{P}\p{S}]/u.test(e.data);
  if (it === "insertLineBreak" || it === "insertParagraph") return true;
  if (it.indexOf("insertFromPaste") === 0 || it.indexOf("insertFromDrop") === 0)
    return true;
  return false;
}

export type EditKind = "insert" | "delete" | "other";

export function editKind(event: Event): EditKind {
  const type = (event as InputEvent).inputType || "";
  if (type === "insertText" || type === "insertCompositionText")
    return "insert";
  if (type === "insertLineBreak" || type === "insertParagraph") return "insert";
  if (type === "insertFromPaste") return "insert";
  if (type.startsWith("delete")) return "delete";
  return "other";
}

export const isTouch = (): boolean =>
  window.matchMedia("(pointer: coarse)").matches;
