const MN_LOWER = /[\u0430-\u044F\u0451\u04AF\u04E9]/;

const LINE_BREAK_HYPHENS = ["-", "\u2010", "\u00AD"] as const;

function trailingHyphen(line: string): string | null {
  for (const hyphen of LINE_BREAK_HYPHENS) {
    if (line.endsWith(hyphen)) return hyphen;
  }
  return null;
}

export function isSoftHyphenBreak(head: string, tail: string): boolean {
  const left = head.at(-1);
  const right = tail.replace(/^\s+/u, "").at(0);
  if (left === undefined || right === undefined) return false;
  return MN_LOWER.test(left) && MN_LOWER.test(right);
}

export function dehyphenateLines(lines: readonly string[]): string[] {
  const out = lines.slice();

  for (let i = 0; i < out.length; i++) {
    for (;;) {
      const hyphen = trailingHyphen(out[i]);
      if (hyphen === null) break;

      const head = out[i].slice(0, -hyphen.length);
      if (head === "") break;

      let j = i + 1;
      while (j < out.length && out[j].trim() === "") j++;
      if (j >= out.length) break;

      if (!isSoftHyphenBreak(head, out[j])) break;

      const tail = out[j].replace(/^\s+/u, "");
      const word = /^\S+/u.exec(tail);
      if (word === null) break;

      out[i] = head + word[0];
      out[j] = tail.slice(word[0].length).replace(/^\s+/u, "");
    }
  }

  return out;
}
