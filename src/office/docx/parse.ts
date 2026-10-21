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
  "w:sdtPr",
  "w:tabs",
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
  skipped: new Set(["a:fld", "p:pic", "a:blip", "mc:Fallback", "a:tabLst"]),
  separators: { "a:br": "\n", "a:tab": "\t" },
  glyphs: {},
  stale: new Set<string>(),
  style: null,
  fieldChar: null,
};

interface PartState {
  readonly name: string;
  readonly xml: string;
  readonly vocab: Vocab;
  readonly paragraphs: Paragraph[];
  readonly stack: string[];
  readonly skipMarks: number[];
  instrDepth: number;
  paragraphDepth: number;
  buffer: string;
  nodes: TextNode[];
  stale: StaleRange[];
  styleId: string | null;
  paragraphStart: number;
  runProps: string;
  runPropsStart: number;
  runPropsDepth: number;
  pending: TextNode | null;
}

const skipping = (p: PartState): boolean => p.skipMarks.length > 0;

const collecting = (p: PartState): boolean =>
  p.paragraphDepth >= 0 && !skipping(p) && p.instrDepth === 0;

function openParagraph(p: PartState, tag: TagInfo): void {
  p.paragraphDepth = p.stack.length;
  p.paragraphStart = tag.start;
  p.buffer = "";
  p.nodes = [];
  p.stale = [];
  p.styleId = null;
}

function closeParagraph(p: PartState, tag: TagInfo): void {
  p.paragraphs.push({
    part: p.name,
    index: p.paragraphs.length,
    rawStart: p.paragraphStart,
    rawEnd: tag.end,
    text: p.buffer,
    nodes: p.nodes,
    styleId: p.styleId,
    stale: p.stale,
  });
  p.paragraphDepth = -1;
  p.pending = null;
}

function openTextNode(p: PartState, tag: TagInfo): void {
  const preserve = readAttr(p.xml, tag, "xml:space") === "preserve";
  const attrEnd = tag.end - (tag.kind === "self" ? 2 : 1);
  const node: TextNode = {
    tagStart: tag.start,
    tagEnd: tag.end,
    contentStart: tag.end,
    contentEnd: tag.end,
    selfClosing: tag.kind === "self",
    glyph: false,
    wrap: p.vocab.text,
    attrs: p.xml.slice(tag.attrStart, attrEnd),
    preserve,
    runProps: p.runProps,
    text: "",
    textStart: p.buffer.length,
  };
  if (tag.kind === "self") p.nodes.push(node);
  else p.pending = node;
}

function closeTextNode(p: PartState, tag: TagInfo): void {
  const pending = p.pending;
  if (pending === null) return;
  pending.contentEnd = tag.start;
  pending.textStart = p.buffer.length;
  p.buffer += pending.text;
  p.nodes.push(pending);
  p.pending = null;
}

function pushGlyph(p: PartState, tag: TagInfo, char: string): void {
  p.nodes.push({
    tagStart: tag.start,
    tagEnd: tag.end,
    contentStart: tag.end,
    contentEnd: tag.end,
    selfClosing: true,
    glyph: true,
    wrap: p.vocab.text,
    attrs: "",
    preserve: false,
    runProps: p.runProps,
    text: char,
    textStart: p.buffer.length,
  });
  p.buffer += char;
}

function trackField(p: PartState, tag: TagInfo): void {
  const type = readAttr(p.xml, tag, "w:fldCharType");
  if (type === "begin") p.instrDepth += 1;
  else if (p.instrDepth > 0 && (type === "separate" || type === "end"))
    p.instrDepth -= 1;
}

const isStyle = (p: PartState, tagName: string): boolean =>
  p.vocab.style !== null && tagName === p.vocab.style && p.paragraphDepth >= 0;

function onSelfMeta(p: PartState, tag: TagInfo): boolean {
  const { vocab } = p;
  const tagName = tag.name;
  if (tagName === vocab.fieldChar) trackField(p, tag);
  else if (isStyle(p, tagName) && !skipping(p))
    p.styleId = readAttr(p.xml, tag, "w:val");
  else if (
    tagName === vocab.runProps &&
    p.stack[p.stack.length - 1] === vocab.run
  )
    p.runProps = p.xml.slice(tag.start, tag.end);
  else if (vocab.stale.has(tagName) && p.paragraphDepth >= 0 && !skipping(p))
    p.stale.push({ start: tag.start, end: tag.end });
  else return false;
  return true;
}

function onSelf(p: PartState, tag: TagInfo): void {
  if (onSelfMeta(p, tag) || !collecting(p)) return;
  const tagName = tag.name;
  if (tagName === p.vocab.text) {
    openTextNode(p, tag);
    return;
  }
  const glyph = p.vocab.glyphs[tagName];
  if (glyph !== undefined) {
    pushGlyph(p, tag, glyph);
    return;
  }
  const separator = p.vocab.separators[tagName];
  if (separator !== undefined) p.buffer += separator;
}

function onOpen(p: PartState, tag: TagInfo): void {
  const { vocab, stack } = p;
  const tagName = tag.name;
  stack.push(tagName);
  if (vocab.skipped.has(tagName)) {
    p.skipMarks.push(stack.length);
    return;
  }
  if (skipping(p)) return;
  if (tagName === vocab.paragraph && p.paragraphDepth < 0)
    openParagraph(p, tag);
  else if (tagName === vocab.fieldChar) trackField(p, tag);
  else if (isStyle(p, tagName)) p.styleId = readAttr(p.xml, tag, "w:val");
  else if (tagName === vocab.run) p.runProps = "";
  else if (vocab.separators[tagName] !== undefined && collecting(p))
    p.buffer += vocab.separators[tagName];
  else if (
    tagName === vocab.runProps &&
    stack[stack.length - 2] === vocab.run
  ) {
    p.runPropsStart = tag.start;
    p.runPropsDepth = stack.length;
  } else if (tagName === vocab.text && collecting(p)) openTextNode(p, tag);
}

function closeTag(p: PartState, tag: TagInfo): void {
  const { vocab } = p;
  const tagName = tag.name;
  if (tagName === vocab.text) closeTextNode(p, tag);
  else if (tagName === vocab.runProps && p.runPropsDepth === p.stack.length) {
    p.runProps = p.xml.slice(p.runPropsStart, tag.end);
    p.runPropsDepth = -1;
  } else if (tagName === vocab.run) p.runProps = "";
  else if (tagName === vocab.paragraph && p.paragraphDepth === p.stack.length)
    closeParagraph(p, tag);
}

function onClose(p: PartState, tag: TagInfo): void {
  if (p.skipMarks[p.skipMarks.length - 1] === p.stack.length) {
    p.skipMarks.pop();
    p.stack.pop();
    return;
  }
  if (!skipping(p)) closeTag(p, tag);
  p.stack.pop();
}

export function parsePart(
  name: string,
  xml: string,
  vocab: Vocab = WORD_VOCAB,
): DocxPart {
  const p: PartState = {
    name,
    xml,
    vocab,
    paragraphs: [],
    stack: [],
    skipMarks: [],
    instrDepth: 0,
    paragraphDepth: -1,
    buffer: "",
    nodes: [],
    stale: [],
    styleId: null,
    paragraphStart: -1,
    runProps: "",
    runPropsStart: -1,
    runPropsDepth: -1,
    pending: null,
  };
  scanXml(
    xml,
    (tag) => {
      if (tag.kind === "self") onSelf(p, tag);
      else if (tag.kind === "open") onOpen(p, tag);
      else onClose(p, tag);
    },
    (start, end) => {
      if (p.pending !== null)
        p.pending.text += decodeXmlText(xml.slice(start, end));
    },
  );
  return { name, xml, paragraphs: p.paragraphs };
}
