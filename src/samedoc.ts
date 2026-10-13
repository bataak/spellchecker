export function isEditOf(next: string, prev: string): boolean {
  if (next === prev) return true;
  const longest = Math.max(next.length, prev.length);
  const shortest = Math.min(next.length, prev.length);
  let head = 0;
  while (head < shortest && next.charCodeAt(head) === prev.charCodeAt(head))
    head++;
  let tail = 0;
  while (
    tail < shortest - head &&
    next.charCodeAt(next.length - 1 - tail) ===
      prev.charCodeAt(prev.length - 1 - tail)
  )
    tail++;
  return (head + tail) * 2 >= longest;
}
