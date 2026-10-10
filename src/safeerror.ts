export interface SafeError {
  name: string | null;
  code: string | null;
  frames: string[];
}

export const MAX_FRAMES = 8;

const NAME_RE = /^[A-Za-z]{1,40}$/;
const CODE_RE = /^[A-Z][A-Z0-9_]{1,40}$/;
const FILE_RE = /^[A-Za-z0-9_.-]{1,80}\.(?:m?js|ts)$/;
const CHROME_FRAME_RE = /^\s*at (?:.*?\()?(\S+?):(\d{1,7}):(\d{1,7})\)?\s*$/;
const GECKO_FRAME_RE = /^[^@\s]*@(\S+?):(\d{1,7}):(\d{1,7})\s*$/;

function readProp(obj: object, prop: string, own: boolean): unknown {
  try {
    if (own && !Object.prototype.hasOwnProperty.call(obj, prop))
      return undefined;
    return (obj as Record<string, unknown>)[prop];
  } catch {
    return undefined;
  }
}

function pick(value: unknown, re: RegExp): string | null {
  return typeof value === "string" && re.test(value) ? value : null;
}

export function safeFrame(
  file: unknown,
  line: unknown,
  col: unknown,
): string | null {
  if (typeof file !== "string") return null;
  const ln = Number(line);
  const cn = Number(col);
  if (!Number.isInteger(ln) || !Number.isInteger(cn)) return null;
  if (ln < 0 || cn < 0 || ln > 9999999 || cn > 9999999) return null;
  const path = file.split(/[?#]/)[0] ?? "";
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (!FILE_RE.test(base)) return null;
  return base + ":" + ln + ":" + cn;
}

export function stackFrames(stack: unknown): string[] {
  if (typeof stack !== "string") return [];
  const frames: string[] = [];
  for (const line of stack.slice(0, 20000).split("\n")) {
    const m = CHROME_FRAME_RE.exec(line) ?? GECKO_FRAME_RE.exec(line);
    if (!m) continue;
    const frame = safeFrame(m[1], m[2], m[3]);
    if (frame) frames.push(frame);
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames;
}

export function toSafeError(e: unknown): SafeError {
  if (e === null || (typeof e !== "object" && typeof e !== "function"))
    return { name: null, code: null, frames: [] };
  return {
    name: pick(readProp(e, "name", false), NAME_RE),
    code: pick(readProp(e, "code", true), CODE_RE),
    frames: stackFrames(readProp(e, "stack", false)),
  };
}
