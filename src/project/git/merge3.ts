export interface Conflict {
  readonly ours: readonly string[];
  readonly base: readonly string[];
  readonly theirs: readonly string[];
}

export type Chunk = readonly string[] | Conflict;

export type Pick = "ours" | "theirs" | "both";

const MAX_CELLS = 4_000_000;

function matches(a: readonly string[], b: readonly string[]): number[] {
  const out = new Array<number>(a.length).fill(-1);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    out[head] = head;
    head++;
  }
  let tailA = a.length;
  let tailB = b.length;
  while (tailA > head && tailB > head && a[tailA - 1] === b[tailB - 1]) {
    tailA--;
    tailB--;
    out[tailA] = tailB;
  }
  const n = tailA - head;
  const m = tailB - head;
  if (!n || !m || n * m > MAX_CELLS) return out;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i * width + j] =
        a[head + i] === b[head + j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[head + i] === b[head + j]) {
      out[head + i] = head + j;
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) i++;
    else j++;
  }
  return out;
}

const same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

export function merge3(base: string, ours: string, theirs: string): Chunk[] {
  const b = base.split("\n");
  const o = ours.split("\n");
  const t = theirs.split("\n");
  const toOurs = matches(b, o);
  const toTheirs = matches(b, t);
  const chunks: Chunk[] = [];
  const stable: string[] = [];
  const flush = (): void => {
    if (stable.length) chunks.push(stable.splice(0));
  };
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < b.length || j < o.length || k < t.length) {
    if (i < b.length && toOurs[i] === j && toTheirs[i] === k) {
      stable.push(b[i]!);
      i++;
      j++;
      k++;
      continue;
    }
    let next = i;
    while (next < b.length && (toOurs[next]! < 0 || toTheirs[next]! < 0))
      next++;
    const nextOurs = next < b.length ? toOurs[next]! : o.length;
    const nextTheirs = next < b.length ? toTheirs[next]! : t.length;
    const baseLines = b.slice(i, next);
    const ourLines = o.slice(j, nextOurs);
    const theirLines = t.slice(k, nextTheirs);
    if (same(ourLines, baseLines)) stable.push(...theirLines);
    else if (same(theirLines, baseLines) || same(ourLines, theirLines))
      stable.push(...ourLines);
    else {
      flush();
      chunks.push({ ours: ourLines, base: baseLines, theirs: theirLines });
    }
    i = next;
    j = nextOurs;
    k = nextTheirs;
  }
  flush();
  return chunks;
}

export const isConflict = (chunk: Chunk): chunk is Conflict =>
  !Array.isArray(chunk);

export function conflictsOf(chunks: readonly Chunk[]): Conflict[] {
  return chunks.filter(isConflict);
}

export function resolveChunks(
  chunks: readonly Chunk[],
  picks: readonly Pick[],
): string {
  const lines: string[] = [];
  let at = 0;
  for (const chunk of chunks) {
    if (!isConflict(chunk)) {
      lines.push(...chunk);
      continue;
    }
    const pick = picks[at++] ?? "ours";
    if (pick !== "theirs") lines.push(...chunk.ours);
    if (pick !== "ours") lines.push(...chunk.theirs);
  }
  return lines.join("\n");
}
