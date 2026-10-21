import { escapeHtml } from "../core/htmlutil.ts";
import { DICTIONARIES } from "../spell/spellchecker.ts";
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

const labelOf = (id: string): string =>
  DICTIONARIES.find((dict) => dict.id === id)?.label || id;

export function dictStatusMessage(
  loaded: string[],
  failed: { id: string; error: string }[] | null,
  fallbackReason: string | null,
): string {
  const seenName = new Set<string>();
  const simple: string[] = [];
  for (const id of loaded) {
    const name = id.startsWith("mn")
      ? "монгол"
      : id.startsWith("en")
        ? "англи"
        : labelOf(id);
    if (!seenName.has(name)) {
      seenName.add(name);
      simple.push(name);
    }
  }
  const dictShortcut = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "")
    ? "⌘⇧L"
    : "Ctrl+Shift+L";
  let msg =
    '<span class="dict-toggle" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Толь сонгох"' +
    ' aria-keyshortcuts="Control+Shift+L Meta+Shift+L" title="Толь сонгох · ' +
    dictShortcut +
    '">' +
    "Ашиглаж буй толь: <b>" +
    simple.join(", ") +
    "</b></span>";
  if (failed && failed.length) {
    msg +=
      ' <span class="muted">(олдсонгүй: ' +
      failed.map((fail) => escapeHtml(String(fail.id))).join(", ") +
      ")</span>";
  }
  if (fallbackReason) {
    msg +=
      '<br><span class="muted">hunspell-wasm амжилтгүй (nspell ашиглаж байна): ' +
      escapeHtml(fallbackReason) +
      "</span>";
  }
  return msg;
}
