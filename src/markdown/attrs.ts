export interface Attrs {
  readonly classes: string[];
  readonly keys: Record<string, string>;
}

export function parseAttrs(text: string): Attrs {
  const inner = text.startsWith("{") ? text.slice(1, -1) : "." + text;
  const classes: string[] = [];
  const keys: Record<string, string> = {};
  const token =
    /\.([\w-]+)|#([\w-]+)|([\w-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))|(^|\s)-(?=\s|$)/g;
  for (const m of inner.matchAll(token)) {
    if (m[1]) classes.push(m[1]);
    else if (m[2]) keys["id"] = m[2];
    else if (m[3]) keys[m[3]] = m[4] ?? m[5] ?? m[6] ?? "";
    else classes.push("unnumbered");
  }
  return { classes, keys };
}
