import { decodeXmlText, readAttr, scanXml } from "./xml.ts";
import type { TagInfo } from "./xml.ts";

export interface TextNode {
  tagStart: number;
  tagEnd: number;
  contentStart: number;
  contentEnd: number;
  selfClosing: boolean;
  glyph: boolean;
  wrap: string | null;
  attrs: string;
  preserve: boolean;
  runProps: string;
  text: string;
  textStart: number;
}

export interface StaleRange {
  start: number;
  end: number;
}

export interface Paragraph {
  part: string;
  index: number;
  rawStart: number;
  rawEnd: number;
  text: string;
  nodes: TextNode[];
  styleId: string | null;
  stale: StaleRange[];
}

export interface DocxPart {
  name: string;
  xml: string;
  paragraphs: Paragraph[];
}

export interface Vocab {
  prefix: string;
  paragraph: string;
  run: string;
  runProps: string;
  text: string;
  skipped: Set<string>;
  separators: Record<string, string>;
  glyphs: Record<string, string>;
  stale: Set<string>;
  style: string | null;
  fieldChar: string | null;
}

const SKIPPED_ELEMENTS = new Set([
  "w:drawing",
  "w:pict",
  "w:object",
  "w:instrText",
  "w:delInstrText",
  "w:delText",
  "w:fldSimple",
  "w:sdtPr",
]);

const SEPARATORS: Record<string, string> = {
  "w:br": "\n",
  "w:cr": "\n",
  "w:tab": "\t",
  "w:ptab": "\t",
};

const GLYPHS: Record<string, string> = {
  "w:softHyphen": "\u00ad",
  "w:noBreakHyphen": "\u2011",
};

const STALE_ELEMENTS = new Set(["w:proofErr", "w:lastRenderedPageBreak"]);

export const WORD_VOCAB: Vocab = {
  prefix: "w:",
  paragraph: "w:p",
  run: "w:r",
  runProps: "w:rPr",
  text: "w:t",
  skipped: SKIPPED_ELEMENTS,
  separators: SEPARATORS,
  glyphs: GLYPHS,
  stale: STALE_ELEMENTS,
  style: "w:pStyle",
  fieldChar: "w:fldChar",
};

export const SLIDE_VOCAB: Vocab = {
  prefix: "a:",
  paragraph: "a:p",
  run: "a:r",
  runProps: "a:rPr",
  text: "a:t",
  skipped: new Set(["a:fld", "p:pic", "a:blip", "mc:Fallback"]),
  separators: { "a:br": "\n", "a:tab": "\t" },
  glyphs: {},
  stale: new Set<string>(),
  style: null,
  fieldChar: null,
};

export function parsePart(
  name: string,
  xml: string,
  vocab: Vocab = WORD_VOCAB,
): DocxPart {
  const paragraphs: Paragraph[] = [];
  const stack: string[] = [];
  const skipMarks: number[] = [];

  let fieldDepth = 0;
  let paragraphDepth = -1;
  let buffer = "";
  let nodes: TextNode[] = [];
  let stale: StaleRange[] = [];
  let styleId: string | null = null;
  let paragraphStart = -1;

  let runProps = "";
  let runPropsStart = -1;
  let runPropsDepth = -1;

  let pending: TextNode | null = null;

  const skipping = (): boolean => skipMarks.length > 0;
  const collecting = (): boolean =>
    paragraphDepth >= 0 && !skipping() && fieldDepth === 0;

  const openParagraph = (tag: TagInfo): void => {
    paragraphDepth = stack.length;
    paragraphStart = tag.start;
    buffer = "";
    nodes = [];
    stale = [];
    styleId = null;
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
      stale,
    });
    paragraphDepth = -1;
    pending = null;
  };

  const openTextNode = (tag: TagInfo): void => {
    const preserve = readAttr(xml, tag, "xml:space") === "preserve";
    const attrEnd = tag.end - (tag.kind === "self" ? 2 : 1);
    const node: TextNode = {
      tagStart: tag.start,
      tagEnd: tag.end,
      contentStart: tag.end,
      contentEnd: tag.end,
      selfClosing: tag.kind === "self",
      glyph: false,
      wrap: vocab.text,
      attrs: xml.slice(tag.attrStart, attrEnd),
      preserve,
      runProps,
      text: "",
      textStart: buffer.length,
    };

    if (tag.kind === "self") {
      nodes.push(node);
      return;
    }

    pending = node;
  };

  const closeTextNode = (tag: TagInfo): void => {
    if (pending === null) return;
    pending.contentEnd = tag.start;
    pending.textStart = buffer.length;
    buffer += pending.text;
    nodes.push(pending);
    pending = null;
  };

  const pushGlyph = (tag: TagInfo, char: string): void => {
    nodes.push({
      tagStart: tag.start,
      tagEnd: tag.end,
      contentStart: tag.end,
      contentEnd: tag.end,
      selfClosing: true,
      glyph: true,
      wrap: vocab.text,
      attrs: "",
      preserve: false,
      runProps,
      text: char,
      textStart: buffer.length,
    });
    buffer += char;
  };

  const onTag = (tag: TagInfo): void => {
    const { name: tagName, kind } = tag;

    if (kind === "self") {
      if (tagName === vocab.fieldChar) {
        const type = readAttr(xml, tag, "w:fldCharType");
        if (type === "begin") fieldDepth += 1;
        else if (type === "end" && fieldDepth > 0) fieldDepth -= 1;
        return;
      }

      if (
        vocab.style !== null &&
        tagName === vocab.style &&
        paragraphDepth >= 0 &&
        !skipping()
      ) {
        styleId = readAttr(xml, tag, "w:val");
        return;
      }

      if (tagName === vocab.runProps && stack[stack.length - 1] === vocab.run) {
        runProps = xml.slice(tag.start, tag.end);
        return;
      }

      if (vocab.stale.has(tagName) && paragraphDepth >= 0 && !skipping()) {
        stale.push({ start: tag.start, end: tag.end });
        return;
      }

      if (tagName === vocab.text && collecting()) {
        openTextNode(tag);
        return;
      }

      const glyph = vocab.glyphs[tagName];
      if (glyph !== undefined && collecting()) {
        pushGlyph(tag, glyph);
        return;
      }

      const separator = vocab.separators[tagName];
      if (separator !== undefined && collecting()) buffer += separator;
      return;
    }

    if (kind === "open") {
      stack.push(tagName);

      if (vocab.skipped.has(tagName)) {
        skipMarks.push(stack.length);
        return;
      }

      if (skipping()) return;

      if (tagName === vocab.paragraph && paragraphDepth < 0) {
        openParagraph(tag);
        return;
      }

      if (tagName === vocab.fieldChar) {
        const type = readAttr(xml, tag, "w:fldCharType");
        if (type === "begin") fieldDepth += 1;
        else if (type === "end" && fieldDepth > 0) fieldDepth -= 1;
        return;
      }

      if (
        vocab.style !== null &&
        tagName === vocab.style &&
        paragraphDepth >= 0
      ) {
        styleId = readAttr(xml, tag, "w:val");
        return;
      }

      if (tagName === vocab.run) {
        runProps = "";
        return;
      }

      const separator = vocab.separators[tagName];
      if (separator !== undefined && collecting()) {
        buffer += separator;
        return;
      }

      if (tagName === vocab.runProps && stack[stack.length - 2] === vocab.run) {
        runPropsStart = tag.start;
        runPropsDepth = stack.length;
        return;
      }

      if (tagName === vocab.text && collecting()) openTextNode(tag);
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
      if (tagName === vocab.text) closeTextNode(tag);
      else if (tagName === vocab.runProps && runPropsDepth === stack.length) {
        runProps = xml.slice(runPropsStart, tag.end);
        runPropsDepth = -1;
      } else if (tagName === vocab.run) runProps = "";
      else if (tagName === vocab.paragraph && paragraphDepth === stack.length)
        closeParagraph(tag);
    }

    stack.pop();
  };

  const onText = (start: number, end: number): void => {
    if (pending === null) return;
    pending.text += decodeXmlText(xml.slice(start, end));
  };

  scanXml(xml, onTag, onText);

  return { name, xml, paragraphs };
}
