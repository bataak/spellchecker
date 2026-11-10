const ERROR_NAMES = [
  /File `([^']+)' not found/g,
  /! I can't find file `([^']+)'/g,
  /=([^\s=]+) (?:at [\d.]+pt )?not loadable: Metric \(TFM\) file not found/g,
  /\(file ([^)\s]+)\): (?:cannot open|Font \S+ at \d+ not found)/g,
];
const BABEL_LANGUAGE = /Package babel Error: Unknown option '([^']+)'/g;
const BABEL_FILES: Readonly<Record<string, string>> = {
  russian: "russianb",
  ukrainian: "ukraineb",
};
const GUESS_EXTENSIONS = [
  ".sty",
  ".cls",
  ".tex",
  ".tfm",
  ".pfb",
  ".def",
  ".fd",
];

const PACKAGE_LOAD =
  /\\(usepackage|RequirePackage|documentclass)\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}/g;
const LOAD_EXTENSION: Readonly<Record<string, string>> = {
  documentclass: ".cls",
};

const stem = (name: string): string => name.replace(/\.[^.]*$/, "");

const LOG_WIDTH = 79;

export function unwrapLog(log: string): string {
  return log
    .split("\n")
    .map((line) => (line.length === LOG_WIDTH ? line : line + "\n"))
    .join("")
    .replace(/\n$/, "");
}

export function wantedFiles(log: string, misses: readonly string[]): string[] {
  const named = new Set<string>();
  const flat = unwrapLog(log);
  for (const pattern of ERROR_NAMES)
    for (const match of flat.matchAll(pattern))
      named.add(match[1]!.replace(/^.*\//, ""));
  for (const match of flat.matchAll(BABEL_LANGUAGE)) {
    named.add((BABEL_FILES[match[1]!] ?? match[1]!) + ".ldf");
    named.add("babel-" + match[1]! + ".tex");
  }
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

export function requestedFiles(tex: string): string[] {
  const preamble = tex
    .split(/\\begin\s*\{document\}/)[0]!
    .replace(/(^|[^\\])%.*$/gm, "$1");
  const files = new Set<string>();
  for (const match of preamble.matchAll(PACKAGE_LOAD)) {
    const extension = LOAD_EXTENSION[match[1]!] ?? ".sty";
    for (const name of match[2]!.split(","))
      if (name.trim()) files.add(name.trim() + extension);
  }
  return [...files];
}
