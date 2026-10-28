import { askChoice } from "../ui/ask.ts";
import { replaceRange } from "../editor/editortext.ts";
import { inviteHash } from "./collabkey.ts";

export const APP_HOST = "aldaa.bichig.dev";
const JOIN_ASK = "Бичвэр хамтран засах урилгыг хүлээн авах уу?";

function pastedInvite(text: string): string | null {
  return inviteHash(text, [location.host, APP_HOST]);
}

function followHash(hash: string): void {
  location.hash = hash;
}

export function askJoin(): Promise<boolean> {
  return askChoice({ title: JOIN_ASK, yes: "Тэгье", no: "Үгүй" });
}

export function joinPasted(text: string): boolean {
  const hash = pastedInvite(text);
  if (hash) followHash(hash);
  return hash !== null;
}

export async function offerInvite(text: string): Promise<boolean> {
  const hash = pastedInvite(text);
  if (!hash || !(await askJoin())) return false;
  followHash(hash);
  return true;
}

export function pasteAsking(
  editor: HTMLTextAreaElement,
  event: ClipboardEvent,
  pick: (text: string) => string | null,
  ask: () => Promise<boolean>,
): boolean {
  if (editor.readOnly || event.defaultPrevented) return false;
  const text = event.clipboardData?.getData("text") ?? "";
  const hash = pick(text);
  if (!hash) return false;
  event.preventDefault();
  const { selectionStart: start, selectionEnd: end } = editor;
  void ask().then((yes) => {
    if (yes) return followHash(hash);
    editor.focus();
    if (!replaceRange(editor, start, end, text))
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertFromPaste",
          data: text,
        }),
      );
  });
  return true;
}

export function pasteInvite(
  editor: HTMLTextAreaElement,
  event: ClipboardEvent,
): boolean {
  return pasteAsking(editor, event, pastedInvite, askJoin);
}
