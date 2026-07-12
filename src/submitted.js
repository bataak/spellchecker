const SUBMITTED_KEY = "mn-spell:submitted";

export function getSubmitted() {
  try {
    const raw = localStorage.getItem(SUBMITTED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

export function addSubmitted(list) {
  try {
    const set = getSubmitted();
    for (const word of list) set.add(word.toLowerCase());
    localStorage.setItem(SUBMITTED_KEY, JSON.stringify([...set]));
  } catch (_) {}
}
