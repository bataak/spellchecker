export const DASHES = /[-\u2013\u2014]/;

export function checkable(word) {
  const w = word.trim();
  return (
    w.length >= 2 &&
    /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/.test(w) &&
    !/^\p{N}+(-|$)/u.test(w)
  );
}

export function isDashSuffix(text, t) {
  if (DASHES.test(t.word.slice(1))) return false;
  return DASHES.test(t.word.charAt(0)) || DASHES.test(text.charAt(t.start - 1));
}

export function startsLowerAfterDash(word) {
  const ch = word.replace(/^[-\u2013\u2014]+/, "").charAt(0);
  return ch !== "" && ch === ch.toLowerCase() && ch !== ch.toUpperCase();
}

export function buildErrorList(tokens) {
  const seen = new Map();
  for (const t of tokens) {
    const key = t.word.toLowerCase();
    const e = seen.get(key);
    if (e) e.count++;
    else seen.set(key, { word: t.word, start: t.start, count: 1 });
  }
  return [...seen.values()];
}
