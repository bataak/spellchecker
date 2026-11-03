import { minimalDiff } from "../core/textdiff.ts";
import { type TextChange, mapOffset } from "./textdelta.ts";

export interface Step {
  from: number;
  removed: string;
  inserted: string;
  before: [number, number];
  after: [number, number];
  at: number;
}

export interface History {
  undo: Step[];
  redo: Step[];
}

export const MAX_STEPS = 10000;

export const MAX_CHARS = 1_000_000;

const GROUP_MS = 1000;

export function emptyHistory(): History {
  return { undo: [], redo: [] };
}

function size(step: Step): number {
  return step.removed.length + step.inserted.length;
}

function trim(steps: Step[]): void {
  if (steps.length > MAX_STEPS) steps.splice(0, steps.length - MAX_STEPS);
  let total = 0;
  for (const step of steps) total += size(step);
  while (total > MAX_CHARS && steps.length > 1) total -= size(steps.shift()!);
}

function mergeable(last: Step, step: Step): boolean {
  if (step.at - last.at > GROUP_MS) return false;
  if (/\n/.test(step.inserted) || /\n/.test(step.removed)) return false;
  if (!last.removed && !step.removed)
    return last.from + last.inserted.length === step.from;
  if (!last.inserted && !step.inserted)
    return step.from + step.removed.length === last.from;
  return false;
}

export function record(
  history: History,
  before: string,
  after: string,
  selBefore: [number, number],
  selAfter: [number, number],
  now: number,
): History {
  const patch = minimalDiff(before, after);
  if (!patch) return history;
  const step: Step = {
    from: patch.from,
    removed: before.slice(patch.from, patch.to),
    inserted: patch.insert,
    before: selBefore,
    after: selAfter,
    at: now,
  };
  const undo = history.undo.slice();
  const last = undo[undo.length - 1];
  if (last && mergeable(last, step)) {
    undo[undo.length - 1] = last.removed
      ? {
          ...last,
          from: step.from,
          removed: step.removed + last.removed,
          after: step.after,
          at: step.at,
        }
      : {
          ...last,
          inserted: last.inserted + step.inserted,
          after: step.after,
          at: step.at,
        };
  } else {
    undo.push(step);
  }
  trim(undo);
  return { undo, redo: [] };
}

export interface Applied {
  text: string;
  selection: [number, number];
  history: History;
}

export function undo(text: string, history: History): Applied | null {
  const step = history.undo[history.undo.length - 1];
  if (!step) return null;
  const end = step.from + step.inserted.length;
  if (text.slice(step.from, end) !== step.inserted) return null;
  return {
    text: text.slice(0, step.from) + step.removed + text.slice(end),
    selection: step.before,
    history: {
      undo: history.undo.slice(0, -1),
      redo: [...history.redo, step],
    },
  };
}

export function redo(text: string, history: History): Applied | null {
  const step = history.redo[history.redo.length - 1];
  if (!step) return null;
  const end = step.from + step.removed.length;
  if (text.slice(step.from, end) !== step.removed) return null;
  return {
    text: text.slice(0, step.from) + step.inserted + text.slice(end),
    selection: step.after,
    history: {
      undo: [...history.undo, step],
      redo: history.redo.slice(0, -1),
    },
  };
}

function crossStep(
  changes: readonly TextChange[],
  from: number,
  oldLength: number,
  newLength: number,
): TextChange[] | null {
  const shift = newLength - oldLength;
  const crossed: TextChange[] = [];
  for (const change of changes) {
    if (change.to > from && change.from < from + oldLength) return null;
    crossed.push(
      change.to <= from
        ? change
        : { ...change, from: change.from + shift, to: change.to + shift },
    );
  }
  return crossed;
}

function shiftStart(changes: readonly TextChange[], from: number): number {
  let shifted = from;
  for (const change of changes)
    if (change.to <= from)
      shifted += change.insert.length - (change.to - change.from);
  return shifted;
}

function shiftSelection(
  changes: readonly TextChange[],
  selection: [number, number],
): [number, number] {
  return [mapOffset(changes, selection[0]), mapOffset(changes, selection[1])];
}

interface StackWalk {
  readonly lengths: (step: Step) => [number, number];
  readonly near: "before" | "after";
  readonly far: "before" | "after";
}

const UNDO_WALK: StackWalk = {
  lengths: (step) => [step.inserted.length, step.removed.length],
  near: "after",
  far: "before",
};

const REDO_WALK: StackWalk = {
  lengths: (step) => [step.removed.length, step.inserted.length],
  near: "before",
  far: "after",
};

function rebaseStack(
  steps: readonly Step[],
  changes: readonly TextChange[],
  walk: StackWalk,
): Step[] {
  const rebased: Step[] = [];
  let current = changes;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    const [oldLength, newLength] = walk.lengths(step);
    const crossed = crossStep(current, step.from, oldLength, newLength);
    if (!crossed) break;
    rebased.push({
      ...step,
      from: shiftStart(current, step.from),
      [walk.near]: shiftSelection(current, step[walk.near]),
      [walk.far]: shiftSelection(crossed, step[walk.far]),
    });
    current = crossed;
  }
  return rebased.reverse();
}

export function rebaseHistory(
  history: History,
  changes: readonly TextChange[],
): History {
  return {
    undo: rebaseStack(history.undo, changes, UNDO_WALK),
    redo: rebaseStack(history.redo, changes, REDO_WALK),
  };
}
