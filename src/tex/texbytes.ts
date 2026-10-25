const CARET_BYTE = /^\^\^([0-9a-f]{2})/;
const encoder = new TextEncoder();

export function decodeTexBytes(text: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < text.length;) {
    const hex = CARET_BYTE.exec(text.slice(i, i + 4));
    if (hex) {
      bytes.push(Number.parseInt(hex[1]!, 16));
      i += 4;
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(i)!);
    bytes.push(...encoder.encode(char));
    i += char.length;
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/\uFFFD/g, "");
}
