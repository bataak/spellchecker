export interface DeltaOp {
  readonly insert?: unknown;
  readonly delete?: number;
  readonly retain?: number;
}

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

export function deltaChanges(delta: readonly DeltaOp[]): TextChange[] {
  const out: TextChange[] = [];
  let pos = 0;
  const at = (): TextChange => {
    const last = out[out.length - 1];
    if (last && last.to === pos) return last;
    const change = { from: pos, to: pos, insert: "" };
    out.push(change);
    return change;
  };
  for (const op of delta) {
    if (op.retain !== undefined) pos += op.retain;
    else if (typeof op.insert === "string") at().insert += op.insert;
    else if (op.delete) {
      at().to += op.delete;
      pos += op.delete;
    }
  }
  return out;
}

export function mapOffset(changes: readonly TextChange[], pos: number): number {
  let shift = 0;
  for (const change of changes) {
    if (change.from >= pos) break;
    if (change.to > pos) return change.from + shift + change.insert.length;
    shift += change.insert.length - (change.to - change.from);
  }
  return pos + shift;
}

export function applyChanges(
  text: string,
  changes: readonly TextChange[],
): string {
  let out = "";
  let cursor = 0;
  for (const change of changes) {
    out += text.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  return out + text.slice(cursor);
}
