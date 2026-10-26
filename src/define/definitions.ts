import { clipText, displayHeadword } from "./defmarks.ts";
import type { DictEntry } from "../dict/stardict.ts";

const DEF_TEXT_LIMIT = 3000;

export type Definition = {
  dicts: number;
  source: string;
  entries: DictEntry[];
};

export interface DefinitionCache {
  get(word: string): Promise<Definition>;
  reset(): void;
}

export function createDefinitionCache(
  define: (word: string) => Promise<Definition>,
): DefinitionCache {
  let cache = new Map<string, Promise<Definition>>();
  return {
    get(word) {
      let pending = cache.get(word);
      if (!pending) {
        pending = define(word);
        const owner = cache;
        const request = pending;
        owner.set(word, request);
        void request.then((def) => {
          if (!def.entries.length && owner.get(word) === request)
            owner.delete(word);
        });
      }
      return pending;
    },
    reset() {
      cache = new Map();
    },
  };
}

export function fillDefinition(
  tip: HTMLElement,
  word: string,
  def: Definition,
): void {
  tip.replaceChildren();
  const labels = def.entries.map((entry) =>
    displayHeadword(entry.headword, word),
  );
  const seen = new Map<string, number>();
  def.entries.forEach((entry, position) => {
    const label = labels[position]!;
    const repeats = labels.filter((item) => item === label).length;
    const nth = (seen.get(label) ?? 0) + 1;
    seen.set(label, nth);
    const block = document.createElement("div");
    block.className = "def-tip-entry";
    const head = document.createElement("div");
    head.className = "def-tip-hw";
    head.textContent = label;
    if (repeats > 1) {
      const num = document.createElement("span");
      num.className = "def-tip-num";
      num.textContent = " " + String(nth);
      head.appendChild(num);
    }
    block.appendChild(head);
    const text = document.createElement("div");
    text.className = "def-tip-text";
    text.textContent = clipText(entry.text, DEF_TEXT_LIMIT);
    block.appendChild(text);
    tip.appendChild(block);
    const next = def.entries[position + 1];
    if (entry.source && (!next || next.source !== entry.source)) {
      const from = document.createElement("div");
      from.className = "def-tip-source";
      from.textContent = entry.source;
      tip.appendChild(from);
    }
  });
  if (def.source && !def.entries.some((entry) => entry.source)) {
    const credit = document.createElement("div");
    credit.className = "def-tip-source";
    credit.textContent = def.source;
    tip.appendChild(credit);
  }
}
