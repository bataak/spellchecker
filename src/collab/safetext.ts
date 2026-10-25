const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const HIDDEN = /[\u00AD\u180E\u200B\u200C\u2060-\u2064\uFEFF]/g;
const JOINER = /\u200D/g;
const CONTROL_TEXT =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\uFFF9-\uFFFC\uFFFE\uFFFF]/g;
const CONTROL_NAME = /[\u0000-\u001F\u007F-\u009F\uFFF9-\uFFFF]/g;
const LONE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const MARKS = /(\p{M}{3})\p{M}+/gu;
const BLANK_LINES = /\n{3,}/g;
const SPACES = /\s+/g;
const BROKEN = "\uFFFD";
const UNSAFE_NAME = new RegExp(
  [BIDI, HIDDEN, CONTROL_NAME, LONE].map((rule) => rule.source).join("|"),
);

function common(text: string): string {
  return text
    .replace(LONE, "")
    .normalize("NFC")
    .replace(BIDI, "")
    .replace(HIDDEN, "")
    .replace(MARKS, "$1");
}

export function cleanText(text: string): string {
  return common(text.replace(/\t/g, " "))
    .replace(CONTROL_TEXT, "")
    .replace(BLANK_LINES, "\n\n");
}

export function cleanName(name: string, max: number): string {
  return common(name)
    .replace(JOINER, "")
    .replace(CONTROL_NAME, " ")
    .replace(SPACES, " ")
    .trim()
    .slice(0, max)
    .replace(LONE, "")
    .trimEnd();
}

export function unsafeName(name: string): boolean {
  return UNSAFE_NAME.test(name);
}

export function revealText(text: string): string {
  return text
    .replace(LONE, BROKEN)
    .replace(BIDI, BROKEN)
    .replace(HIDDEN, BROKEN)
    .replace(CONTROL_TEXT, BROKEN)
    .replace(MARKS, "$1");
}
