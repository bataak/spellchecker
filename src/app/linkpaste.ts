import { askChoice } from "../ui/ask.ts";
import { appUrlHash } from "../collab/collabkey.ts";
import { APP_HOST, pasteAsking } from "../collab/invitepaste.ts";
import { isNavHash } from "./urlnav.ts";

const OPEN_ASK = "Энэ холбоосыг нээх үү?";

export function navLinkHash(
  text: string,
  hosts: readonly string[],
): string | null {
  const hash = appUrlHash(text, hosts);
  return hash && isNavHash(hash) ? hash : null;
}

const pastedLink = (text: string): string | null =>
  navLinkHash(text, [location.host, APP_HOST]);

const askOpen = (): Promise<boolean> =>
  askChoice({ title: OPEN_ASK, yes: "Нээх", no: "Үгүй" });

export async function offerLink(text: string): Promise<boolean> {
  const hash = pastedLink(text);
  if (!hash || !(await askOpen())) return false;
  location.hash = hash;
  return true;
}

export function bindLinkPaste(editor: HTMLTextAreaElement): void {
  editor.addEventListener("paste", (event) =>
    pasteAsking(editor, event, pastedLink, askOpen),
  );
}
