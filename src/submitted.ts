import { KEYS, readJson, writeJson } from "./store.ts";
export function getSubmitted(): Set<string> {
  const arr = readJson(KEYS.submitted);
  return new Set(
    Array.isArray(arr)
      ? arr.filter((w): w is string => typeof w === "string")
      : [],
  );
}

export function addSubmitted(list: string[]): void {
  const set = getSubmitted();
  for (const word of list) set.add(word.toLowerCase());
  writeJson(KEYS.submitted, [...set]);
}
