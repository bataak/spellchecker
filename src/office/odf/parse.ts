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

  const spaces = (tag: TagInfo): string => {
    const count = Number.parseInt(readAttr(xml, tag, "text:c") ?? "1", 10);
    return " ".repeat(Number.isFinite(count) && count > 0 ? count : 1);
  };

  const onSelf = (tag: TagInfo): void => {
    const tagName = tag.name;
    if (SKIPPED_ELEMENTS.has(tagName) || !collecting()) return;
    if (tagName === "text:s") pushGlyph(tag, spaces(tag));
    else if (tagName === "text:tab") pushGlyph(tag, "\t");
    else buffer += SEPARATORS[tagName] ?? "";
  };

  const openParagraph = (tag: TagInfo): void => {
    paragraphDepth = stack.length;
    paragraphStart = tag.start;
    buffer = "";
    nodes = [];
    styleId = readAttr(xml, tag, "text:style-name");
    styleStack.length = 0;
  };

  const onOpen = (tag: TagInfo): void => {
    const tagName = tag.name;
    stack.push(tagName);
    const paragraph = PARAGRAPHS.has(tagName);
    if (SKIPPED_ELEMENTS.has(tagName) || (paragraph && paragraphDepth >= 0)) {
      skipMarks.push(stack.length);
      return;
    }
    if (skipping()) return;
    if (paragraph) openParagraph(tag);
    else if (tagName === "text:span" && paragraphDepth >= 0)
      styleStack.push(spanStyle(xml, tag));
  };

  const closeParagraph = (tag: TagInfo): void => {
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
  };

  const onClose = (tag: TagInfo): void => {
    const tagName = tag.name;
    if (skipMarks[skipMarks.length - 1] === stack.length) {
      skipMarks.pop();
      stack.pop();
      return;
    }
    if (!skipping()) {
      if (tagName === "text:span" && styleStack.length > 0) styleStack.pop();
      else if (PARAGRAPHS.has(tagName) && paragraphDepth === stack.length)
        closeParagraph(tag);
    }
    stack.pop();
  };

  const onTag = (tag: TagInfo): void => {
    if (tag.kind === "self") onSelf(tag);
    else if (tag.kind === "open") onOpen(tag);
    else onClose(tag);
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
