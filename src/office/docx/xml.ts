import { dropControls } from "../sanitize.ts";

export interface TagInfo {
  name: string;
  kind: "open" | "close" | "self";
  start: number;
  end: number;
  attrStart: number;
}

export type TagHandler = (tag: TagInfo) => void;
export type TextHandler = (start: number, end: number) => void;

function isNameEnd(code: number): boolean {
  return (
    code === 32 ||
    code === 9 ||
    code === 10 ||
    code === 13 ||
    code === 47 ||
    code === 62
  );
}

const SKIPPED: readonly [string, string][] = [
  ["<!--", "-->"],
  ["<?", "?>"],
  ["<!", ">"],
];

function skipSpecial(xml: string, lt: number, onText: TextHandler): number {
  if (xml.startsWith("<![CDATA[", lt)) {
    const close = xml.indexOf("]]>", lt + 9);
    if (close < 0) return xml.length;
    onText(lt + 9, close);
    return close + 3;
  }
  for (const [open, closing] of SKIPPED) {
    if (!xml.startsWith(open, lt)) continue;
    const close = xml.indexOf(closing, lt + open.length);
    return close < 0 ? xml.length : close + closing.length;
  }
  return -1;
}

function tagEnd(xml: string, from: number): number {
  let quote = 0;
  for (let scan = from; scan < xml.length; scan += 1) {
    const code = xml.charCodeAt(scan);
    if (quote !== 0) {
      if (code === quote) quote = 0;
    } else if (code === 34 || code === 39) quote = code;
    else if (code === 62) return scan + 1;
  }
  return xml.length;
}

function readTag(xml: string, lt: number): TagInfo {
  let pointer = lt + 1;
  const closing = xml.charCodeAt(pointer) === 47;
  if (closing) pointer += 1;
  const nameStart = pointer;
  while (pointer < xml.length && !isNameEnd(xml.charCodeAt(pointer)))
    pointer += 1;
  const end = tagEnd(xml, pointer);
  const kind = closing
    ? "close"
    : xml.charCodeAt(end - 2) === 47
      ? "self"
      : "open";
  return {
    name: xml.slice(nameStart, pointer),
    kind,
    start: lt,
    end,
    attrStart: pointer,
  };
}

export function scanXml(
  xml: string,
  onTag: TagHandler,
  onText: TextHandler,
): void {
  const length = xml.length;
  let cursor = 0;
  while (cursor < length) {
    const lt = xml.indexOf("<", cursor);
    if (lt < 0) {
      onText(cursor, length);
      return;
    }
    if (lt > cursor) onText(cursor, lt);
    const skipped = skipSpecial(xml, lt, onText);
    if (skipped >= 0) {
      cursor = skipped;
      continue;
    }
    const tag = readTag(xml, lt);
    onTag(tag);
    cursor = tag.end;
  }
}

export function readAttr(
  xml: string,
  tag: TagInfo,
  name: string,
): string | null {
  const region = xml.slice(tag.attrStart, tag.end);
  let from = 0;

  for (;;) {
    const found = region.indexOf(name, from);
    if (found < 0) return null;

    const before = found === 0 ? 32 : region.charCodeAt(found - 1);
    const after = region.charCodeAt(found + name.length);
    const boundary =
      before === 32 || before === 9 || before === 10 || before === 13;

    if (boundary && after === 61) {
      const quote = region.charCodeAt(found + name.length + 1);
      if (quote === 34 || quote === 39) {
        const valueStart = found + name.length + 2;
        const valueEnd = region.indexOf(String.fromCharCode(quote), valueStart);
        if (valueEnd < 0) return null;
        return decodeXmlText(region.slice(valueStart, valueEnd));
      }
    }

    from = found + name.length;
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

export function decodeXmlText(value: string): string {
  if (value.indexOf("&") < 0) return value;

  return value.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, body: string) => {
      if (body.charCodeAt(0) === 35) {
        const hex = body.charCodeAt(1) === 120 || body.charCodeAt(1) === 88;
        const code = Number.parseInt(
          hex ? body.slice(2) : body.slice(1),
          hex ? 16 : 10,
        );
        if (Number.isNaN(code) || code < 0 || code > 0x10ffff) return match;
        return String.fromCodePoint(code);
      }
      const named = NAMED_ENTITIES[body];
      return named === undefined ? match : named;
    },
  );
}

export function encodeXmlText(value: string): string {
  const clean = dropControls(value);
  let result = "";

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (char === "&") result += "&amp;";
    else if (char === "<") result += "&lt;";
    else if (char === ">") result += "&gt;";
    else result += char;
  }

  return result;
}
