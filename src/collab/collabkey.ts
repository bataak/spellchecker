export interface CollabLink {
  readonly room: string;
  readonly key: string;
}

const LINK = /^#?collab=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;
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

export function parseLink(hash: string): CollabLink | null {
  const match = LINK.exec(hash);
  return match ? { room: match[1]!, key: match[2]! } : null;
}

export function linkHash(link: CollabLink): string {
  return "#collab=" + link.room + "." + link.key;
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
