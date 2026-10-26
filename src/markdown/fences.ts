export const FENCE_RE = /^\s*(`{3,}|~{3,})\s*(\S*)\s*$/;
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/;

export function closesFence(line: string, marker: string): boolean {
  const close = FENCE_CLOSE_RE.exec(line);
  return (
    !!close && close[1]![0] === marker[0] && close[1]!.length >= marker.length
  );
}
