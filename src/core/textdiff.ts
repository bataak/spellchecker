export interface Patch {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export function minimalDiff(before: string, after: string): Patch | null {
  if (before === after) return null;

  const max = Math.min(before.length, after.length);
  let a = 0;
  while (a < max && before.charCodeAt(a) === after.charCodeAt(a)) a += 1;

  let b = 0;
  while (
    b < max - a &&
    before.charCodeAt(before.length - 1 - b) ===
      after.charCodeAt(after.length - 1 - b)
  )
    b += 1;

  return {
    from: a,
    to: before.length - b,
    insert: after.slice(a, after.length - b),
  };
}
