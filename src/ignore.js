const KEY = "mn-spell:ignored";

let ignored = [];
let lookup = new Map();

function caseOf(word) {
  let upper = 0,
    lower = 0,
    firstCased = null;
  for (const ch of word) {
    const u = ch.toUpperCase(),
      l = ch.toLowerCase();
    if (u === l) continue;
    if (firstCased === null) firstCased = ch;
    if (ch === u) upper++;
    else lower++;
  }
  if (upper === 0) return "lower";
  if (lower === 0) return "upper";
  if (firstCased && firstCased === firstCased.toUpperCase()) return "capital";
  return "lower";
}

function rebuild() {
  lookup = new Map();
  for (const w of ignored) {
    lookup.set(w.toLowerCase(), caseOf(w));
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    ignored = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ignored)) ignored = [];
  } catch (_) {
    ignored = [];
  }
  rebuild();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(ignored));
  } catch (_) {}
}

export function isIgnored(word) {
  const stored = lookup.get(word.toLowerCase());
  if (stored === undefined) return false;
  if (stored === "lower") return true;
  const wc = caseOf(word);
  if (stored === "capital") return wc === "capital" || wc === "upper";
  return wc === "upper";
}

export function addIgnored(word) {
  const w = word.trim();
  if (!w) return false;
  const key = w.toLowerCase();
  const existing = lookup.get(key);
  if (existing !== undefined) {
    if (existing === "lower") return false;
    const wc = caseOf(w);
    if (existing === wc) return false;
    ignored = ignored.filter((x) => x.toLowerCase() !== key);
  }
  ignored.push(w);
  rebuild();
  persist();
  return true;
}

export function removeIgnored(word) {
  const before = ignored.length;
  ignored = ignored.filter((x) => x !== word);
  if (ignored.length === before) return false;
  rebuild();
  persist();
  return true;
}

export function clearIgnored() {
  if (!ignored.length) return false;
  ignored = [];
  rebuild();
  persist();
  return true;
}

export function getIgnored() {
  return ignored.slice();
}

load();
