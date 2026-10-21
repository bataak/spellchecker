import {
  nextFixStep,
  pendingFixFor,
  planSuggestion,
  propagateFix,
  type PendingFix,
} from "./applyfix.ts";
import { mergeRanges } from "./codeskip.ts";
import type { SpellSession } from "./spellsession.ts";
import type { Token } from "./textcheck.ts";

export interface FixField {
  readonly value: string;
  readonly selectionStart: number;
  scrollTop: number;
}

export interface FixFlowDeps {
  readonly editor: FixField;
  readonly spell: Pick<SpellSession, "correctNow" | "skipFor" | "plainFences">;
  readonly setText: (text: string, caret: number) => void;
  readonly render: () => void;
  readonly commit: (text: string, caret: number) => Promise<void>;
  readonly cancel: () => void;
}

export interface FixFlow {
  drop(): void;
  arm(token: Token | null): void;
  propagate(): Promise<void>;
  apply(token: Token, replacement: string): Promise<void>;
}

export function createFixFlow(deps: FixFlowDeps): FixFlow {
  const { editor, spell } = deps;
  let pending: PendingFix | null = null;

  return {
    drop() {
      pending = null;
    },
    arm(token) {
      pending = token ? pendingFixFor(editor.value, token) : null;
    },
    async propagate() {
      const fix = pending;
      if (!fix) return;
      const text = editor.value;
      const pos = editor.selectionStart;
      const step = nextFixStep(fix, text, pos);
      if (step.kind === "drop") pending = null;
      if (step.kind !== "check") return;
      if (!(await spell.correctNow(step.word))) return;
      if (pending !== fix || editor.value !== text) return;
      pending = null;
      const next = propagateFix(
        text,
        pos,
        fix,
        step.word,
        mergeRanges([
          ...spell.skipFor(text),
          ...spell.plainFences(text, fix.original),
        ]),
      );
      if (!next) return;
      const top = editor.scrollTop;
      deps.setText(next.text, next.caret);
      editor.scrollTop = top;
      deps.render();
    },
    async apply(token, replacement) {
      pending = null;
      const text = editor.value;
      const next = planSuggestion(
        text,
        token,
        replacement,
        spell.skipFor(text),
        spell.plainFences(text, token.word),
      );
      if (!next) {
        deps.cancel();
        return;
      }
      await deps.commit(next.text, next.caret);
    },
  };
}
