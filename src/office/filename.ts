const TAIL_RATIO = 0.35;
const TAIL_MIN = 6;
const TAIL_MAX = 20;

export function splitName(
  name: string,
  ratio = TAIL_RATIO,
): { head: string; tail: string } {
  const dot = name.lastIndexOf(".");
  const hasExt = dot > 0 && name.length - dot <= 6;
  const ext = hasExt ? name.slice(dot) : "";
  const base = hasExt ? name.slice(0, dot) : name;
  const keep = Math.min(
    Math.max(Math.round(base.length * ratio), TAIL_MIN),
    TAIL_MAX,
  );
  if (base.length <= keep) return { head: "", tail: name };
  return {
    head: base.slice(0, base.length - keep),
    tail: base.slice(base.length - keep) + ext,
  };
}
