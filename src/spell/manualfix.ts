export const MANUAL_FIX_MAX = 200;
export const MANUAL_FIX_WORDS = 5;

const SCRIPT = /[\p{sc=Cyrillic}\p{sc=Latin}]/u;
const LETTER = /\p{L}/u;
const SPACE = /\s/u;
const PUNCTUATION = new Set([".", ",", ";", "-"]);

function allowed(char: string): boolean {
  return PUNCTUATION.has(char) || (LETTER.test(char) && SCRIPT.test(char));
}

export function filterManualFix(raw: string): string {
  let result = "";
  for (const char of raw.normalize("NFC")) {
    if (SPACE.test(char)) {
      if (result && !result.endsWith(" ")) result += " ";
    } else if (allowed(char)) result += char;
  }
  return result;
}

export function countWords(text: string): number {
  return text.split(" ").filter(Boolean).length;
}

export function cleanManualFix(raw: string, original: string): string | null {
  const text = filterManualFix(raw).trim();
  if (!text || text === original) return null;
  if (text.length > MANUAL_FIX_MAX) return null;
  if (countWords(text) > MANUAL_FIX_WORDS) return null;
  return text;
}
