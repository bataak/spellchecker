export interface FrontMatter {
  readonly meta: Readonly<Record<string, string>>;
  readonly body: string;
}

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FIELD = /^([a-z]+):\s*(.*)$/;

export function splitFrontMatter(source: string): FrontMatter {
  const match = BLOCK.exec(source);
  if (!match) return { meta: {}, body: source };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const field = FIELD.exec(line.trim());
    if (field) meta[field[1]!] = field[2]!.trim();
  }
  return { meta, body: source.slice(match[0].length) };
}
