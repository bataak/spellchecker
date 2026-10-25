export interface CollabLink {
  readonly room: string;
  readonly key: string;
}

export interface InviteLink extends CollabLink {
  readonly invite: string;
  readonly name?: string;
}

export const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const LINK =
  /^#?collab=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{22})(?:\.([A-Za-z0-9_-]{1,400}))?$/;
const SHARED_NAME = /\.(txt|text|md|markdown|mdown|tex|ltx)$/i;
const MAX_NAME = 120;
const IV_BYTES = 12;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function randomId(bytes: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function newLink(): CollabLink {
  return { room: randomId(16), key: randomId(32) };
}

export function newToken(): string {
  return randomId(16);
}

const BAD_NAME = /[/\\:*?"<>|\u0000-\u001f]/;

export function sharedName(name: string): boolean {
  return (
    name.length <= MAX_NAME && SHARED_NAME.test(name) && !BAD_NAME.test(name)
  );
}

export function projectName(name: string): string {
  const base = name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, " ").trim();
  return (base.slice(0, MAX_NAME - 1).trim() || "LaTeX") + "/";
}

export function isProjectName(name: string): boolean {
  const base = name.slice(0, -1);
  return (
    name.endsWith("/") &&
    base.trim() !== "" &&
    name.length <= MAX_NAME &&
    !BAD_NAME.test(base)
  );
}

function validName(name: string): boolean {
  return sharedName(name) || isProjectName(name);
}

function readName(encoded: string | undefined): string | null {
  if (!encoded) return null;
  try {
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      fromBase64Url(encoded),
    );
    return validName(name) ? name : null;
  } catch {
    return null;
  }
}

export function parseLink(hash: string): InviteLink | null {
  const match = LINK.exec(hash);
  if (!match) return null;
  const link = { room: match[1]!, key: match[2]!, invite: match[3]! };
  const name = readName(match[4]);
  return name ? { ...link, name } : link;
}

export function linkHash(link: InviteLink): string {
  const name =
    link.name && validName(link.name)
      ? "." + toBase64Url(new TextEncoder().encode(link.name))
      : "";
  return "#collab=" + link.room + "." + link.key + "." + link.invite + name;
}

export function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromBase64Url(key) as BufferSource,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(
  key: CryptoKey,
  data: Uint8Array,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data as BufferSource,
  );
  const out = new Uint8Array(IV_BYTES + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), IV_BYTES);
  return out;
}

export async function unseal(
  key: CryptoKey,
  data: Uint8Array,
): Promise<Uint8Array | null> {
  if (data.byteLength <= IV_BYTES) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: data.subarray(0, IV_BYTES) as BufferSource },
      key,
      data.subarray(IV_BYTES) as BufferSource,
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}
