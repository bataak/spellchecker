import { decoder } from "./stardictformat.ts";

export interface DefinitionPart {
  type: string;
  text: string;
}

const TEXT_TYPES = "mltgxykwh";

const MARKUP_TYPES = "gxkh";

export function parseDefinition(
  data: Uint8Array,
  sametypesequence: string,
): DefinitionPart[] {
  const parts: DefinitionPart[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;

  const readField = (type: string, last: boolean): void => {
    if (type >= "a" && type <= "z") {
      let end = last ? data.length : data.indexOf(0, pos);
      if (end < 0) end = data.length;
      if (TEXT_TYPES.includes(type))
        parts.push({ type, text: decoder.decode(data.subarray(pos, end)) });
      pos = last ? data.length : end + 1;
      return;
    }
    if (last) {
      pos = data.length;
      return;
    }
    if (pos + 4 > data.length) {
      pos = data.length;
      return;
    }
    pos += 4 + view.getUint32(pos);
  };

  if (sametypesequence) {
    for (let k = 0; k < sametypesequence.length && pos < data.length; k++)
      readField(sametypesequence.charAt(k), k === sametypesequence.length - 1);
    return parts;
  }
  while (pos < data.length) {
    const type = String.fromCharCode(data[pos]!);
    pos += 1;
    readField(type, false);
  }
  return parts;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
};

function decodeEntity(match: string, body: string): string {
  const lower = body.toLowerCase();
  if (lower.startsWith("#")) {
    const code = lower.startsWith("#x")
      ? parseInt(lower.slice(2), 16)
      : parseInt(lower.slice(1), 10);
    if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return match;
    if (code >= 0xd800 && code <= 0xdfff) return match;
    return String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[lower] ?? match;
}

const BLOCK_TAG_RE =
  /<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/?blockquote)\b[^>]*>/gi;

export function stripMarkup(markup: string): string {
  return markup
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(BLOCK_TAG_RE, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function definitionText(parts: DefinitionPart[]): string {
  return parts
    .map((part) =>
      MARKUP_TYPES.includes(part.type)
        ? stripMarkup(part.text)
        : part.text.trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}
