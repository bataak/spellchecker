const HIDDEN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function cleanText(text: string): string {
  return text.replace(HIDDEN, "");
}

export function decodeStrict(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return cleanText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
