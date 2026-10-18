const LOOKALIKES: Record<string, string> = {
  "\u00EB": "\u0451",
  "\u00CB": "\u0401",
  "\u0473": "\u04E9",
  "\u0472": "\u04E8",
  "\u0275": "\u04E9",
  "\u019F": "\u04E8",
  "\u028F": "\u04AF",
  Y: "\u04AE",
};

const WORD_RE = /[\p{L}\p{M}]+/gu;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const MARK_RE = /\p{M}/u;

function standardWord(word: string): string {
  let hasCyrillic = false;
  let hasLookalike = false;
  for (const ch of word) {
    if (LOOKALIKES[ch] !== undefined) hasLookalike = true;
    else if (CYRILLIC_RE.test(ch)) hasCyrillic = true;
    else if (!MARK_RE.test(ch)) return word;
  }
  if (!hasCyrillic || !hasLookalike) return word;
  let out = "";
  for (const ch of word) out += LOOKALIKES[ch] ?? ch;
  return out;
}

export function standardLetters(text: string): string {
  return text.normalize("NFC").replace(WORD_RE, standardWord);
}
