export interface ParagraphEdit {
  start: number;
  end: number;
  text: string;
}

export function isSpace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

export function narrowEdit(
  oldText: string,
  newText: string,
  start: number,
): ParagraphEdit {
  let head = 0;
  const limit = Math.min(oldText.length, newText.length);
  while (head < limit && oldText[head] === newText[head]) head += 1;

  let tail = 0;
  while (
    tail < oldText.length - head &&
    tail < newText.length - head &&
    oldText[oldText.length - 1 - tail] === newText[newText.length - 1 - tail]
  ) {
    tail += 1;
  }

  return {
    start: start + head,
    end: start + oldText.length - tail,
    text: newText.slice(head, newText.length - tail),
  };
}

const TOKEN = /[\p{L}\p{N}\p{M}\u00ad]+|\s+|[^]/gu;

type Step = 0 | 1 | 2;

const KEEP: Step = 0;

const DROP: Step = 1;

const ADD: Step = 2;

const TABLE_CELLS = 4_000_000;

const MAX_CHANGES = 4000;

function tableSteps(before: string[], after: string[]): Step[] {
  const cols = after.length + 1;
  const table = new Uint32Array((before.length + 1) * cols);

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        before[i] === after[j]
          ? table[(i + 1) * cols + j + 1]! + 1
          : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }

  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      steps.push(KEEP);
      i += 1;
      j += 1;
    } else if (
      j >= after.length ||
      (i < before.length &&
        table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!)
    ) {
      steps.push(DROP);
      i += 1;
    } else {
      steps.push(ADD);
      j += 1;
    }
  }
  return steps;
}

function myersSteps(before: string[], after: string[]): Step[] | null {
  const n = before.length;
  const m = after.length;
  const offset = n + m + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= Math.min(n + m, MAX_CHANGES); d += 1) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && before[x] === after[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m);
    }
  }
  return null;
}

function backtrack(
  trace: Int32Array[],
  depth: number,
  n: number,
  m: number,
): Step[] {
  const steps: Step[] = [];
  let x = n;
  let y = m;
  for (let d = depth; d > 0; d -= 1) {
    const row = trace[d]!;
    const at = (k: number): number => row[k + d + 1]!;
    const k = x - y;
    const prev = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prev);
    const prevY = prevX - prev;
    while (x > prevX && y > prevY) {
      steps.push(KEEP);
      x -= 1;
      y -= 1;
    }
    steps.push(x === prevX ? ADD : DROP);
    x = prevX;
    y = prevY;
  }
  while (x > 0) {
    steps.push(KEEP);
    x -= 1;
  }
  return steps.reverse();
}

export function splitEdit(
  oldText: string,
  newText: string,
  start: number,
): ParagraphEdit[] {
  const before = oldText.match(TOKEN) ?? [];
  const after = newText.match(TOKEN) ?? [];
  const steps =
    (before.length + 1) * (after.length + 1) <= TABLE_CELLS
      ? tableSteps(before, after)
      : myersSteps(before, after);
  if (steps === null) return [narrowEdit(oldText, newText, start)];

  const hunks: ParagraphEdit[] = [];
  let i = 0;
  let j = 0;
  let oldPos = 0;
  let hunkOld = -1;
  let hunkText = "";

  const flush = (): void => {
    if (hunkOld < 0) return;
    hunks.push(
      narrowEdit(oldText.slice(hunkOld, oldPos), hunkText, start + hunkOld),
    );
    hunkOld = -1;
    hunkText = "";
  };

  for (const step of steps) {
    if (step === KEEP) {
      flush();
      oldPos += before[i]!.length;
      i += 1;
      j += 1;
      continue;
    }
    if (hunkOld < 0) hunkOld = oldPos;
    if (step === DROP) {
      oldPos += before[i]!.length;
      i += 1;
    } else {
      hunkText += after[j];
      j += 1;
    }
  }
  flush();

  return hunks;
}
