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

    if (xml.startsWith("<!--", lt)) {
      const close = xml.indexOf("-->", lt + 4);
      cursor = close < 0 ? length : close + 3;
      continue;
    }

    if (xml.startsWith("<![CDATA[", lt)) {
      const close = xml.indexOf("]]>", lt + 9);
      if (close < 0) {
        cursor = length;
      } else {
        onText(lt + 9, close);
        cursor = close + 3;
      }
      continue;
    }

    if (xml.startsWith("<?", lt)) {
      const close = xml.indexOf("?>", lt + 2);
      cursor = close < 0 ? length : close + 2;
      continue;
    }

    if (xml.startsWith("<!", lt)) {
      const close = xml.indexOf(">", lt + 2);
      cursor = close < 0 ? length : close + 1;
      continue;
    }

    let pointer = lt + 1;
    let kind: "open" | "close" | "self" = "open";

    if (xml.charCodeAt(pointer) === 47) {
      kind = "close";
      pointer += 1;
    }

    const nameStart = pointer;
    while (pointer < length && !isNameEnd(xml.charCodeAt(pointer)))
      pointer += 1;
    const name = xml.slice(nameStart, pointer);
    const attrStart = pointer;

    let quote = 0;
    let scan = pointer;
    for (; scan < length; scan += 1) {
      const code = xml.charCodeAt(scan);
      if (quote !== 0) {
        if (code === quote) quote = 0;
        continue;
      }
      if (code === 34 || code === 39) {
        quote = code;
        continue;
      }
      if (code === 62) break;
    }

    const end = scan < length ? scan + 1 : length;
    if (kind === "open" && xml.charCodeAt(end - 2) === 47) kind = "self";

    onTag({ name, kind, start: lt, end, attrStart });
    cursor = end;
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
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "&") result += "&amp;";
    else if (char === "<") result += "&lt;";
    else if (char === ">") result += "&gt;";
    else result += char;
  }

  return result;
}
