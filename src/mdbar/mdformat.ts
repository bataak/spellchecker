import { applyEdit, enterInsert } from "./mdedit.ts";
import { insertImage } from "./mdinsert.ts";
import { replaceRange } from "../editor/editortext.ts";
import { freeImagePath, pickImage, putImage } from "../files/images.ts";
import { formatEdit, type Role } from "./mdbuttons.ts";
import type { ButtonState } from "./mdbuttonstate.ts";

export interface FormatDeps {
  readonly bar: HTMLElement;
  readonly editor: HTMLTextAreaElement;
  readonly buttons: ButtonState;
  readonly active: () => boolean;
}

export function bindFormatting(d: FormatDeps): () => void {
  const { bar, editor, buttons } = d;

  function run(role: Role): void {
    const start = editor.selectionStart;
    if (role === "image")
      void pickImage().then((file) => {
        if (!file) return;
        const src = freeImagePath(file.name, file);
        putImage(src, file);
        applyEdit(
          editor,
          insertImage(editor.value, Math.min(start, editor.value.length), src),
        );
        buttons.sync();
      });
    else
      applyEdit(
        editor,
        formatEdit(role, editor.value, start, editor.selectionEnd, new Date()),
      );
    buttons.reset();
    buttons.sync();
  }

  const onPointerDown = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".md-btn")) event.preventDefault();
  };

  const onClick = (event: Event): void => {
    const button = (
      event.target as HTMLElement | null
    )?.closest<HTMLButtonElement>(".md-btn");
    const role = button?.dataset.role as Role | undefined;
    if (role) run(role);
  };

  const onBeforeInput = (event: InputEvent): void => {
    if (
      event.inputType !== "insertLineBreak" &&
      event.inputType !== "insertParagraph"
    )
      return;
    if (!d.active()) return;
    const insert = enterInsert(editor.value, editor.selectionStart);
    if (insert === "\n") return;
    event.preventDefault();
    if (
      !replaceRange(editor, editor.selectionStart, editor.selectionEnd, insert)
    )
      editor.dispatchEvent(new Event("input", { bubbles: true }));
  };

  bar.addEventListener("mousedown", onPointerDown);
  bar.addEventListener("click", onClick);
  editor.addEventListener("beforeinput", onBeforeInput);
  return () => editor.removeEventListener("beforeinput", onBeforeInput);
}
