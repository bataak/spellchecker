import { fixSlotsInWords } from "./archive/cp1251.ts";

const TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g;
const MIN_TAGS = 2;

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const PARAGRAPH_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);

const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "area",
  "audio",
  "b",
  "bdi",
  "bdo",
  "big",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "del",
  "details",
  "dfn",
  "em",
  "embed",
  "font",
  "head",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "link",
  "map",
  "mark",
  "menu",
  "meta",
  "nobr",
  "noscript",
  "object",
  "option",
  "path",
  "picture",
  "q",
  "s",
  "samp",
  "script",
  "select",
  "small",
  "source",
  "span",
  "strike",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "svg",
  "template",
  "textarea",
  "time",
  "title",
  "track",
  "tt",
  "u",
  "var",
  "video",
  "wbr",
]);

function isHtmlTag(tag: string): boolean {
  const name = /^<\/?([a-zA-Z0-9-]+)/.exec(tag)![1]!;
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return false;
  const lower = name.toLowerCase();
  return (
    BLOCK_TAGS.has(lower) ||
    PARAGRAPH_TAGS.has(lower) ||
    INLINE_TAGS.has(lower) ||
    lower.includes("-")
  );
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  laquo: "\u00AB",
  raquo: "\u00BB",
  ldquo: "\u201C",
  rdquo: "\u201D",
  bdquo: "\u201E",
  lsquo: "\u2018",
  rsquo: "\u2019",
  sbquo: "\u201A",
  bull: "\u2022",
  middot: "\u00B7",
  copy: "\u00A9",
  reg: "\u00AE",
  trade: "\u2122",
  deg: "\u00B0",
  times: "\u00D7",
  divide: "\u00F7",
  minus: "\u2212",
  plusmn: "\u00B1",
  sect: "\u00A7",
  para: "\u00B6",
  numero: "\u2116",
  euro: "\u20AC",
};

const ENTITY_RE = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g;

const PARAGRAPH_MARK = "\u0000";

export function hasMarkup(text: string): boolean {
  let count = 0;
  for (const [tag] of text.matchAll(TAG_RE)) {
    if (!isHtmlTag(tag)) continue;
    count++;
    if (count >= MIN_TAGS) return true;
  }
  return false;
}

function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (whole, dec, hex, name) => {
    if (name !== undefined) return NAMED_ENTITIES[name] ?? whole;
    const code = dec !== undefined ? Number(dec) : parseInt(hex, 16);
    if (code === 0 || code > 0x10ffff) return whole;
    return code === 0xa0 ? " " : String.fromCodePoint(code);
  });
}

export function stripMarkup(text: string): string {
  const flat = text
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|head|title)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .replace(TAG_RE, (tag) => {
      if (!isHtmlTag(tag)) return tag;
      const name = /^<\/?([a-zA-Z0-9-]+)/.exec(tag)![1]!.toLowerCase();
      if (name === "br") return "\n";
      if (PARAGRAPH_TAGS.has(name)) return "\n" + PARAGRAPH_MARK + "\n";
      if (BLOCK_TAGS.has(name)) return "\n";
      return "";
    });
  const lines: string[] = [];
  for (const raw of decodeEntities(flat).split("\n")) {
    const line = raw.replace(/[ \t\u00A0]+/g, " ").trim();
    if (!line) continue;
    if (line === PARAGRAPH_MARK) {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    lines.push(line.split(PARAGRAPH_MARK).join(""));
  }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

const LETTER_RUN_RE = /[\p{L}\u00AA\u00AF\u00BA\u00BF]+/gu;
const SLOT_RE = /[\u00AA\u00AF\u00BA\u00BF\u0404\u0407\u0454\u0457]/u;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_TO_MN: Record<string, string> = {
  v: "\u04AF",
  V: "\u04AE",
  a: "\u0430",
  A: "\u0410",
  B: "\u0412",
  c: "\u0441",
  C: "\u0421",
  e: "\u0435",
  E: "\u0415",
  H: "\u041D",
  M: "\u041C",
  o: "\u043E",
  O: "\u041E",
  p: "\u0440",
  P: "\u0420",
  T: "\u0422",
  x: "\u0445",
  X: "\u0425",
};
const MAPPED_LATIN_RE = /[vVaABcCeEHMoOpPTxX]/;
const MAPPED_LATIN_GLOBAL_RE = /[vVaABcCeEHMoOpPTxX]/g;
const OTHER_LATIN_RE = /[DFGIJKLNQ-SUWYZbdf-nq-uwyz]/;

function fixLatinLetters(word: string): string {
  if (!MAPPED_LATIN_RE.test(word)) return word;
  if (!CYRILLIC_RE.test(word) || OTHER_LATIN_RE.test(word)) return word;
  return word.replace(MAPPED_LATIN_GLOBAL_RE, (ch) => LATIN_TO_MN[ch]!);
}

function hasSlotInCyrillicWord(word: string): boolean {
  if (!SLOT_RE.test(word)) return false;
  return fixSlotsInWords(word) !== word;
}

export function hasMisletters(text: string): boolean {
  for (const [word] of text.matchAll(LETTER_RUN_RE)) {
    if (fixLatinLetters(word) !== word || hasSlotInCyrillicWord(word))
      return true;
  }
  return false;
}

export function fixMisletters(text: string): string {
  return fixSlotsInWords(text.replace(LETTER_RUN_RE, fixLatinLetters));
}

export function needsCleanup(text: string): boolean {
  return hasMarkup(text) || hasMisletters(text);
}

export function cleanText(text: string): string {
  return fixMisletters(hasMarkup(text) ? stripMarkup(text) : text);
}
