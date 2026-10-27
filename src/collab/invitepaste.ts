import { replaceRange } from "../editor/editortext.ts";
import { element } from "../ui/dom.ts";
import { inviteHash } from "./collabkey.ts";
import { actionButton } from "./dialogparts.ts";

const APP_HOST = "aldaa.bichig.dev";
const JOIN_ASK = "Бичвэр хамтран засах урилгыг хүлээн авах уу?";

function pastedInvite(text: string): string | null {
  return inviteHash(text, [location.host, APP_HOST]);
}

function followInvite(hash: string): void {
  location.hash = hash;
}

export function askJoin(): Promise<boolean> {
  const dialog = element("dialog", "suggest-overlay collab-overlay");
  dialog.setAttribute("aria-labelledby", "joinAskTitle");
  const card = element("div", "suggest-card");
  const title = element("h2", "suggest-title", JOIN_ASK);
  title.id = "joinAskTitle";
  const row = element("div", "suggest-actions");
  const no = actionButton("Үгүй");
  const yes = actionButton("Тэгье");
  yes.classList.add("suggest-send");
  row.append(no, yes);
  card.append(title, row);
  dialog.append(card);
  document.body.append(dialog);
  return new Promise((resolve) => {
    let join = false;
    no.addEventListener("click", () => dialog.close());
    yes.addEventListener("click", () => {
      join = true;
      dialog.close();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(join);
    });
    dialog.showModal();
    yes.focus();
  });
}

export function joinPasted(text: string): boolean {
  const hash = pastedInvite(text);
  if (hash) followInvite(hash);
  return hash !== null;
}

export async function offerInvite(text: string): Promise<boolean> {
  const hash = pastedInvite(text);
  if (!hash || !(await askJoin())) return false;
  followInvite(hash);
  return true;
}

export function pasteInvite(
  editor: HTMLTextAreaElement,
  event: ClipboardEvent,
): boolean {
  if (editor.readOnly || event.defaultPrevented) return false;
  const text = event.clipboardData?.getData("text") ?? "";
  const hash = pastedInvite(text);
  if (!hash) return false;
  event.preventDefault();
  const { selectionStart: start, selectionEnd: end } = editor;
  void askJoin().then((join) => {
    if (join) return followInvite(hash);
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
