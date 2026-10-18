import { dictStatusMessage } from "../offline.ts";
import { activeIds, loadEnabledEnglish, visibleIds } from "./dictmenu.ts";

type Failed = { id: string; error: string }[] | null;

export interface DictStatus {
  base(): string;
  indicating(): boolean;
  setIndicating(on: boolean): void;
  english(): Set<string>;
  active(): string[];
  loaded(ids: string[], failed: Failed, reason: string | null): void;
  completed(ids: string[], failed: Failed, reason: string | null): void;
  setEnglish(next: Set<string>, ids: string[]): void;
}

export function createDictStatus(): DictStatus {
  let base = "";
  let indicating = false;
  let english = loadEnabledEnglish();
  let failed: Failed = null;
  let fallback: string | null = null;

  const compose = (ids: string[], reason: string | null): void => {
    base = dictStatusMessage(visibleIds(ids, english), failed, reason);
  };

  return {
    base: () => base,
    indicating: () => indicating,
    setIndicating(on) {
      indicating = on;
    },
    english: () => english,
    active: () => activeIds(english),
    loaded(ids, next, reason) {
      failed = next;
      fallback = reason;
      compose(ids, reason);
    },
    completed(ids, next, reason) {
      failed = next;
      compose(ids, reason);
    },
    setEnglish(next, ids) {
      english = next;
      compose(ids, fallback);
    },
  };
}

export function createRefreshGate(gapMs: number): (now: number) => boolean {
  let last = 0;
  return (now) => {
    if (last && now - last < gapMs) return false;
    last = now;
    return true;
  };
}
