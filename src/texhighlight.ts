export type TexKind =
  | "cmd"
  | "env"
  | "comment"
  | "math"
  | "delim"
  | "brace"
  | "verb";

export interface TexSpan {
  start: number;
  end: number;
  kind: TexKind;
}

const MATH_ENV =
  /^(?:equation|align|gather|multline|displaymath|flalign|alignat|eqnarray|math)\*?$/;
const VERB_ENV = /^(?:verbatim|lstlisting|minted|comment)\*?$/;
const BEGIN_END = /\\(begin|end)(\s*)\{([^}\n]*)\}/y;

function isLetter(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 64
  );
}

function blankLineAt(text: string, index: number): boolean {
  let cursor = index + 1;
  while (cursor < text.length) {
    const code = text.charCodeAt(cursor);
    if (code === 10) return true;
    if (code !== 32 && code !== 9 && code !== 13) return false;
    cursor++;
  }
  return false;
}

export function texSpans(text: string): TexSpan[] {
  const out: TexSpan[] = [];
  let close: string | null = null;

  const push = (start: number, end: number, kind: TexKind): void => {
    if (end <= start) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind && last.end === start) last.end = end;
    else out.push({ start, end, kind });
  };

  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);

    if (code === 37) {
      const nl = text.indexOf("\n", index);
      const end = nl === -1 ? text.length : nl;
      push(index, end, "comment");
      index = end;
      continue;
    }

    if (code === 92) {
      BEGIN_END.lastIndex = index;
      const env = BEGIN_END.exec(text);
      if (env) {
        const whole = env[0];
        const word = env[1]!;
        const gap = env[2]!;
        const name = env[3]!;
        const brace = index + 1 + word.length + gap.length;
        push(index, index + 1 + word.length, "cmd");
        push(brace, brace + 1, "brace");
        push(brace + 1, brace + 1 + name.length, "env");
        push(brace + 1 + name.length, brace + 2 + name.length, "brace");
        index += whole.length;
        if (word === "begin" && close === null && VERB_ENV.test(name)) {
          const stop = text.indexOf("\\end{" + name + "}", index);
          const end = stop === -1 ? text.length : stop;
          push(index, end, "verb");
          index = end;
        } else if (word === "begin" && close === null && MATH_ENV.test(name)) {
          close = "\\end{" + name + "}";
        } else if (word === "end" && close === "\\end{" + name + "}") {
          close = null;
        }
        continue;
      }

      const next = text[index + 1];
      if (close === null && (next === "(" || next === "[")) {
        push(index, index + 2, "delim");
        close = next === "(" ? "\\)" : "\\]";
        index += 2;
        continue;
      }
      if (
        (close === "\\)" && next === ")") ||
        (close === "\\]" && next === "]")
      ) {
        push(index, index + 2, "delim");
        close = null;
        index += 2;
        continue;
      }

      let end = index + 1;
      while (end < text.length && isLetter(text.charCodeAt(end))) end++;
      if (end === index + 1) {
        if (end < text.length && text.charCodeAt(end) !== 10) end++;
      } else if (text.charCodeAt(end) === 42) {
        end++;
      }
      push(index, end, "cmd");
      const name = text.slice(index + 1, end);
      if ((name === "verb" || name === "verb*") && end < text.length) {
        const mark = text[end]!;
        const stop = mark === "\n" ? -1 : text.indexOf(mark, end + 1);
        const nl = text.indexOf("\n", end + 1);
        if (stop !== -1 && (nl === -1 || stop < nl)) {
          push(end, end + 1, "delim");
          push(end + 1, stop, "verb");
          push(stop, stop + 1, "delim");
          index = stop + 1;
          continue;
        }
      }
      index = end;
      continue;
    }

    if (code === 36) {
      const double = text.charCodeAt(index + 1) === 36;
      if (close === null) {
        close = double ? "$$" : "$";
        const width = double ? 2 : 1;
        push(index, index + width, "delim");
        index += width;
        continue;
      }
      if (close === "$" || (close === "$$" && double)) {
        const width = close.length;
        push(index, index + width, "delim");
        close = null;
        index += width;
        continue;
      }
    }

    if (code === 123 || code === 125) {
      push(index, index + 1, "brace");
      index++;
      continue;
    }

    if (code === 38) {
      push(index, index + 1, "delim");
      index++;
      continue;
    }

    if (code === 10 && close !== null && blankLineAt(text, index)) {
      close = null;
    }

    if (close !== null) push(index, index + 1, "math");
    index++;
  }

  return out;
}

export function spansInRange(
  spans: readonly TexSpan[],
  start: number,
  end: number,
): TexSpan[] {
  let lo = 0;
  let hi = spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid]!.end <= start) lo = mid + 1;
    else hi = mid;
  }
  const out: TexSpan[] = [];
  for (let i = lo; i < spans.length && spans[i]!.start < end; i++) {
    out.push(spans[i]!);
  }
  return out;
}
