import { isHeic, jpegIfHeic } from "../files/heic.ts";
import { replaceRange } from "../editor/editortext.ts";
import { pickImage } from "../files/images.ts";
import { local, notify } from "./teximages.ts";

function uniqueName(name: string): string {
  const clean = name.replace(/[\s{}%#\\$&^~]+/g, "-") || "image.png";
  if (!local.has(clean)) return clean;
  const dot = clean.lastIndexOf(".");
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  let n = 2;
  while (local.has(stem + "-" + n + ext)) n++;
  return stem + "-" + n + ext;
}

function addImage(file: File): string {
  const name = uniqueName(file.name);
  local.set(name, file);
  return name;
}

function imageFilesOf(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter(
    (file) => file.type.startsWith("image/") || isHeic(file),
  );
}

export interface TexImageInputDeps {
  readonly editor: HTMLTextAreaElement;
  readonly active: () => boolean;
}

export function initTexImageInput(deps: TexImageInputDeps): void {
  const { editor } = deps;

  const place = (files: File[]): void => {
    const lines = files.map(
      (file) => "\\includegraphics[width=\\linewidth]{" + addImage(file) + "}",
    );
    const start = editor.selectionStart;
    const text = lines.join("\n");
    editor.focus({ preventScroll: true });
    if (!replaceRange(editor, start, editor.selectionEnd, text))
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    notify();
  };
  const insert = (files: File[]): void => {
    if (!files.some(isHeic)) return place(files);
    void Promise.all(files.map(jpegIfHeic)).then(place);
  };

  editor.addEventListener(
    "drop",
    (event) => {
      if (!deps.active()) return;
      const files = imageFilesOf(event.dataTransfer);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      editor.classList.remove("drag-over");
      insert(files);
    },
    true,
  );

  editor.addEventListener("paste", (event) => {
    if (!deps.active()) return;
    const files = imageFilesOf(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    insert(files);
  });
}

export async function insertPickedImage(
  editor: HTMLTextAreaElement,
): Promise<void> {
  const text = editor.value;
  let start = editor.selectionStart;
  let end = editor.selectionEnd;
  const file = await pickImage();
  if (!file) return;
  if (editor.value !== text) {
    start = editor.selectionStart;
    end = editor.selectionEnd;
  }
  const name = addImage(file);
  editor.focus({ preventScroll: true });
  if (!replaceRange(editor, start, end, name))
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  notify();
}
