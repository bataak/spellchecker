import type { DictStatus } from "../dict/dictstatus.ts";
import type { StatusPort } from "../ports.ts";
import {
  caretLine,
  NO_STATS,
  statsBody,
  statsMessage,
  type DocStats,
  type LinePosition,
} from "../statusline.ts";

export interface DocStatusDeps {
  readonly status: StatusPort;
  readonly statusEl: HTMLElement;
  readonly editor: HTMLTextAreaElement;
  readonly dicts: DictStatus;
  readonly fileName: () => string | null;
  readonly lineCount: () => number;
  readonly desktop: MediaQueryList;
  readonly narrow: MediaQueryList;
}

export interface DocStatus {
  readonly ready: () => boolean;
  readonly markReady: () => void;
  readonly update: (stats: DocStats) => void;
  readonly restore: () => void;
  readonly showDictsIfIdle: () => void;
  readonly refreshLine: (knownLine?: number) => void;
}

export function createDocStatus(deps: DocStatusDeps): DocStatus {
  const { status, editor, dicts, narrow } = deps;
  let ready = false;
  let stats: DocStats = NO_STATS;

  const blank = (): boolean => editor.value.trim() === "";

  const linePosition = (knownLine?: number): LinePosition | null => {
    const value = editor.value;
    if (!narrow.matches || value === "") return null;
    const line = (knownLine ?? caretLine(value, editor.selectionStart ?? 0)) + 1;
    return {
      line,
      total: deps.lineCount() + (value.endsWith("\n") ? 1 : 0),
    };
  };

  const current = (knownLine?: number): string =>
    statsMessage(
      deps.fileName(),
      statsBody(stats, deps.desktop.matches, linePosition(knownLine)),
    );

  const restore = (): void => {
    if (!ready) return;
    if (blank() && !deps.fileName()) {
      if (dicts.base() && !dicts.indicating()) status.set(dicts.base());
      return;
    }
    status.set(current(), false);
  };

  return {
    ready: () => ready,
    markReady() {
      ready = true;
    },
    update(next) {
      stats = next;
      restore();
    },
    restore,
    showDictsIfIdle() {
      if (blank() && !dicts.indicating()) status.set(dicts.base(), false);
    },
    refreshLine(knownLine) {
      if (!ready || !narrow.matches) return;
      if (!deps.statusEl.innerHTML.includes("Үгийн тоо:")) return;
      status.set(current(knownLine), false);
    },
  };
}
