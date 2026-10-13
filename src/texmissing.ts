const ERROR_NAMES = [
  /File `([^']+)' not found/g,
  /! I can't find file `([^']+)'/g,
  /=([^\s=]+) (?:at [\d.]+pt )?not loadable: Metric \(TFM\) file not found/g,
  /\(file ([^)\s]+)\): (?:cannot open|Font \S+ at \d+ not found)/g,
];
const GUESS_EXTENSIONS = [
  ".sty",
  ".cls",
  ".tex",
  ".tfm",
  ".pfb",
  ".def",
  ".fd",
];

const stem = (name: string): string => name.replace(/\.[^.]*$/, "");

export function wantedFiles(log: string, misses: readonly string[]): string[] {
  const named = new Set<string>();
  for (const pattern of ERROR_NAMES)
    for (const match of log.matchAll(pattern))
      named.add(match[1]!.replace(/^.*\//, ""));
  const wanted = new Set<string>();
  for (const miss of misses)
    if (named.has(miss) || named.has(stem(miss))) wanted.add(miss);
  for (const name of named) {
    wanted.add(name);
    if (!/\.[A-Za-z0-9]+$/.test(name))
      for (const ext of GUESS_EXTENSIONS) wanted.add(name + ext);
  }
  return [...wanted];
}
