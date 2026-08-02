import { decodeXmlText, readAttr, scanXml } from "../docx/xml.ts";
import type { TagInfo } from "../docx/xml.ts";
import type { DocxPart, Paragraph, TextNode } from "../docx/parse.ts";

const PARAGRAPHS = new Set(["text:p", "text:h"]);

const SKIPPED_ELEMENTS = new Set([
  "office:annotation",
  "office:binary-data",
  "draw:image",
  "draw:object",
  "draw:object-ole",
  "text:tracked-changes",
  "text:deletion",
  "text:note-citation",
  "text:index-body",
  "text:table-of-content",
]);

const SEPARATORS: Record<string, string> = {
  "text:line-break": "\n",
};

function spanStyle(xml: string, tag: TagInfo): string {
  return readAttr(xml, tag, "text:style-name") ?? "";
}

export function parseOdfPart(name: string, xml: string): DocxPart {
  const paragraphs: Paragraph[] = [];
  const stack: string[] = [];
  const skipMarks: number[] = [];
  const styleStack: string[] = [];

  let paragraphDepth = -1;
  let paragraphStart = -1;
  let buffer = "";
  let nodes: TextNode[] = [];
  let styleId: string | null = null;

  const skipping = (): boolean => skipMarks.length > 0;
  const collecting = (): boolean => paragraphDepth >= 0 && !skipping();
  const currentStyle = (): string =>
    styleStack.length > 0 ? styleStack[styleStack.length - 1] : "";

  const pushGlyph = (tag: TagInfo, char: string): void => {
    nodes.push({
      tagStart: tag.start,
      tagEnd: tag.end,
      contentStart: tag.end,
      contentEnd: tag.end,
      selfClosing: true,
      glyph: true,
      wrap: null,
      attrs: "",
      preserve: true,
      runProps: currentStyle(),
      text: char,
      textStart: buffer.length,
    });
    buffer += char;
  };

  const onTag = (tag: TagInfo): void => {
    const { name: tagName, kind } = tag;

    if (kind === "self") {
      if (SKIPPED_ELEMENTS.has(tagName)) return;

      if (tagName === "text:s" && collecting()) {
        const count = Number.parseInt(readAttr(xml, tag, "text:c") ?? "1", 10);
        pushGlyph(
          tag,
          " ".repeat(Number.isFinite(count) && count > 0 ? count : 1),
        );
        return;
      }

      if (tagName === "text:tab" && collecting()) {
        pushGlyph(tag, "\t");
        return;
      }

      const separator = SEPARATORS[tagName];
      if (separator !== undefined && collecting()) buffer += separator;
      return;
    }

    if (kind === "open") {
      stack.push(tagName);

      if (SKIPPED_ELEMENTS.has(tagName)) {
        skipMarks.push(stack.length);
        return;
      }

      if (PARAGRAPHS.has(tagName) && paragraphDepth >= 0) {
        skipMarks.push(stack.length);
        return;
      }

      if (skipping()) return;

      if (PARAGRAPHS.has(tagName)) {
        paragraphDepth = stack.length;
        paragraphStart = tag.start;
        buffer = "";
        nodes = [];
        styleId = readAttr(xml, tag, "text:style-name");
        styleStack.length = 0;
        return;
      }

      if (tagName === "text:span" && paragraphDepth >= 0) {
        styleStack.push(spanStyle(xml, tag));
      }
      return;
    }

    if (
      skipMarks.length > 0 &&
      skipMarks[skipMarks.length - 1] === stack.length
    ) {
      skipMarks.pop();
      stack.pop();
      return;
    }

    if (!skipping()) {
      if (tagName === "text:span" && styleStack.length > 0) styleStack.pop();
      else if (PARAGRAPHS.has(tagName) && paragraphDepth === stack.length) {
        paragraphs.push({
          part: name,
          index: paragraphs.length,
          rawStart: paragraphStart,
          rawEnd: tag.end,
          text: buffer,
          nodes,
          styleId,
          stale: [],
        });
        paragraphDepth = -1;
        styleStack.length = 0;
      }
    }

    stack.pop();
  };

  const onText = (start: number, end: number): void => {
    if (!collecting()) return;

    const text = decodeXmlText(xml.slice(start, end));
    if (text === "") return;

    nodes.push({
      tagStart: start,
      tagEnd: start,
      contentStart: start,
      contentEnd: end,
      selfClosing: false,
      glyph: false,
      wrap: null,
      attrs: "",
      preserve: true,
      runProps: currentStyle(),
      text,
      textStart: buffer.length,
    });

    buffer += text;
  };

  scanXml(xml, onTag, onText);

  return { name, xml, paragraphs };
}
