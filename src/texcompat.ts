const XETEX_PACKAGES = new Set([
  "fontspec",
  "polyglossia",
  "xltxtra",
  "xunicode",
  "unicode-math",
  "mathspec",
  "xecyr",
]);
const FONT_COMMANDS = [
  "setmainfont",
  "setromanfont",
  "setsansfont",
  "setmonofont",
  "setmathfont",
  "setmathrm",
  "setmathsf",
  "setmathtt",
  "setboldmathrm",
  "defaultfontfeatures",
  "addfontfeatures",
  "addfontfeature",
];
const FONT_FAMILY_COMMANDS = [
  "newfontfamily",
  "renewfontfamily",
  "newfontface",
  "renewfontface",
  "setfontfamily",
  "setfontface",
];
const SANS_FONT =
  /arial|helvetica|liberation sans|dejavu sans|noto sans|calibri|verdana|tahoma|segoe|roboto|open sans|source sans|pt sans|fira sans|ubuntu|montserrat|lato|inter\b/i;
const CYRILLIC = /[Ѐ-ӿ]/;
const T2A_FONTENC = /\\usepackage\s*\[[^\]]*\bT2A\b[^\]]*\]\s*\{fontenc\}/;
const BABEL_NAMES: Readonly<Record<string, string>> = {
  american: "american",
  british: "british",
  english: "english",
  mongolian: "mongolian",
  russian: "russian",
  ukrainian: "ukrainian",
  german: "ngerman",
  french: "french",
  kazakh: "kazakh",
  bulgarian: "bulgarian",
};

function skipSpace(text: string, at: number): number {
  while (at < text.length) {
    if (/\s/.test(text[at]!)) at++;
    else if (text[at] === "%") {
      const end = text.indexOf("\n", at);
      at = end < 0 ? text.length : end + 1;
    } else break;
  }
  return at;
}

function readGroup(
  text: string,
  at: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

interface Call {
  start: number;
  end: number;
  args: string[];
  options: string[];
  control: string | null;
}

function readCall(
  text: string,
  start: number,
  name: string,
  mandatory: number,
  control: boolean,
): Call | null {
  let at = start + name.length + 1;
  const args: string[] = [];
  const options: string[] = [];
  let cs: string | null = null;
  if (control) {
    at = skipSpace(text, at);
    const braced = text[at] === "{";
    const match = /^\\[A-Za-z@]+/.exec(text.slice(braced ? at + 1 : at));
    if (!match) return null;
    cs = match[0];
    at += match[0].length + (braced ? 1 : 0);
    if (braced) {
      at = skipSpace(text, at);
      if (text[at] !== "}") return null;
      at++;
    }
  }
  let end = at;
  for (;;) {
    const next = skipSpace(text, end);
    if (text[next] === "[") {
      const close = readGroup(text, next, "[", "]");
      if (close < 0) return null;
      options.push(text.slice(next + 1, close - 1));
      end = close;
    } else if (text[next] === "{" && args.length < mandatory) {
      const close = readGroup(text, next, "{", "}");
      if (close < 0) return null;
      args.push(text.slice(next + 1, close - 1));
      end = close;
    } else break;
  }
  if (args.length < mandatory) return null;
  return { start, end, args, options, control: cs };
}

function findCalls(
  text: string,
  name: string,
  mandatory: number,
  control = false,
): Call[] {
  const calls: Call[] = [];
  const pattern = new RegExp("\\\\" + name + "(?![A-Za-z@])", "g");
  for (const match of text.matchAll(pattern)) {
    const call = readCall(text, match.index!, name, mandatory, control);
    if (call) calls.push(call);
  }
  return calls;
}

function cutCalls(
  text: string,
  calls: readonly { start: number; end: number; text?: string }[],
): string {
  let result = "";
  let at = 0;
  for (const call of [...calls].sort((a, b) => a.start - b.start)) {
    if (call.start < at) continue;
    result += text.slice(at, call.start) + (call.text ?? "");
    at = call.end;
    if (
      call.text === undefined &&
      text[at] === "\n" &&
      /(^|\n)[ \t]*$/.test(result)
    )
      at++;
  }
  return result + text.slice(at);
}

function removePackages(
  preamble: string,
  drop: ReadonlySet<string>,
): { text: string; removed: Set<string> } {
  const removed = new Set<string>();
  const calls = findCalls(preamble, "usepackage", 1).flatMap((call) => {
    const names = call.args[0]!.split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const kept = names.filter((name) => !drop.has(name));
    if (kept.length === names.length) return [];
    for (const name of names) if (drop.has(name)) removed.add(name);
    if (kept.length === 0) return [{ start: call.start, end: call.end }];
    const options = call.options.length ? "[" + call.options[0] + "]" : "";
    return [
      {
        start: call.start,
        end: call.end,
        text: "\\usepackage" + options + "{" + kept.join(",") + "}",
      },
    ];
  });
  return { text: cutCalls(preamble, calls), removed };
}

function babelName(language: string): string {
  const name = language.trim().toLowerCase();
  return BABEL_NAMES[name] ?? name;
}

function languages(preamble: string): {
  main: string | null;
  others: string[];
} {
  let main: string | null = null;
  const others: string[] = [];
  for (const name of ["setdefaultlanguage", "setmainlanguage"])
    for (const call of findCalls(preamble, name, 1))
      main = call.args[0]!.trim();
  for (const name of ["setotherlanguage", "setotherlanguages"])
    for (const call of findCalls(preamble, name, 1))
      others.push(
        ...call.args[0]!.split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
  return { main, others };
}

function convertXetex(preamble: string): string {
  const { text: stripped, removed } = removePackages(preamble, XETEX_PACKAGES);
  let text = stripped;
  const fontCalls = FONT_COMMANDS.flatMap((name) => findCalls(text, name, 1));
  const familyCalls = FONT_FAMILY_COMMANDS.flatMap((name) =>
    findCalls(text, name, 1, true),
  );
  const mainFont = findCalls(text, "setmainfont", 1)[0]?.args[0] ?? "";
  const hadFonts = fontCalls.length > 0 || familyCalls.length > 0;
  const polyglossia = removed.has("polyglossia");
  const { main, others } = polyglossia
    ? languages(text)
    : { main: null, others: [] };
  const languageCalls = polyglossia
    ? [
        "setdefaultlanguage",
        "setmainlanguage",
        "setotherlanguage",
        "setotherlanguages",
      ].flatMap((name) => findCalls(text, name, 1))
    : [];
  text = cutCalls(text, [
    ...fontCalls,
    ...familyCalls.map((call) => ({
      start: call.start,
      end: call.end,
      text: "\\providecommand" + call.control + "{}",
    })),
    ...languageCalls,
  ]);
  if (!removed.size && !hadFonts) return preamble;

  const extra: string[] = [];
  if (hadFonts || removed.has("fontspec")) {
    extra.push("\\usepackage{paratype}");
    if (SANS_FONT.test(mainFont))
      extra.push("\\renewcommand{\\familydefault}{\\sfdefault}");
  }
  if (polyglossia) {
    const mainName = babelName(main ?? "english");
    const otherNames = [...new Set(others.map(babelName))].filter(
      (name) => name !== mainName,
    );
    extra.push(
      "\\usepackage[" + [...otherNames, mainName].join(",") + "]{babel}",
    );
    for (const language of new Set([main ?? "english", ...others])) {
      const name = language.trim();
      if (!/^[a-z]+$/i.test(name)) continue;
      extra.push(
        "\\providecommand{\\text" +
          name +
          "}[1]{\\foreignlanguage{" +
          babelName(name) +
          "}{#1}}",
        "\\ifcsname " +
          name +
          "\\endcsname\\else\\newenvironment{" +
          name +
          "}{\\otherlanguage{" +
          babelName(name) +
          "}}{\\endotherlanguage}\\fi",
      );
    }
  }
  extra.push(
    "\\providecommand{\\XeTeX}{XeTeX}",
    "\\providecommand{\\XeLaTeX}{XeLaTeX}",
  );
  return text.replace(/\s*$/, "\n") + extra.join("\n") + "\n";
}

function addCyrillicEncoding(preamble: string): string {
  const documentclass = findCalls(preamble, "documentclass", 1)[0];
  const line = "\\usepackage[T2A]{fontenc}";
  if (!documentclass) return line + "\n" + preamble;
  return (
    preamble.slice(0, documentclass.end) +
    "\n" +
    line +
    preamble.slice(documentclass.end)
  );
}

export function toPdfLatex(tex: string): string {
  const begin = tex.search(/\\begin\s*\{document\}/);
  if (begin < 0) return tex;
  let preamble = convertXetex(tex.slice(0, begin));
  const body = tex.slice(begin);
  if (CYRILLIC.test(tex) && !T2A_FONTENC.test(preamble))
    preamble = addCyrillicEncoding(preamble);
  return preamble + body;
}
