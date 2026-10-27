import { inviteHash } from "./collabkey.ts";

const APP_HOST = "aldaa.bichig.dev";
const JOIN_ASK =
  "Энэ бол хамтран засах урилгын холбоос байна. Урилгаар нэгдэх үү?\n\n«Cancel» дарвал холбоосыг бичвэрт буулгана.";

function pastedInvite(text: string): string | null {
  return inviteHash(text, [location.host, APP_HOST]);
}

function followInvite(hash: string): void {
  location.hash = hash;
}

export function joinPasted(text: string): boolean {
  const hash = pastedInvite(text);
  if (hash) followInvite(hash);
  return hash !== null;
}

export function offerInvite(text: string): boolean {
  const hash = pastedInvite(text);
  if (!hash || !window.confirm(JOIN_ASK)) return false;
  followInvite(hash);
  return true;
}
