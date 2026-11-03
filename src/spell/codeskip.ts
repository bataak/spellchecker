import {
  type SkipRange,
  mergeRanges,
  collect,
  fencedRanges,
  lineBounds,
  codeRanges,
} from "./skipranges.ts";
import { latexRanges } from "./texskip.ts";

const URL_CHARS = String.raw`(?:[^\s<>()[\]"'\`]|\([^\s<>()[\]"'\`]*\))`;

const BARE_URL = new RegExp(
  String.raw`\b(?:https?|ftps?|mailto|file):\/*${URL_CHARS}+`,
  "gi",
);

const WWW_URL = new RegExp(String.raw`\bwww\.${URL_CHARS}+`, "gi");

const MD_TARGET = /\]\(\s*((?:[^()]|\([^()]*\))*)\)/g;

const MD_ATTRS = /\]\((?:[^()]|\([^()]*\))*\)(\{[^{}\n]*\})/g;

const DIV_ATTRS = /^[ \t]{0,3}:{3,}[ \t]*(\{[^{}\n]*\})/gm;

const MD_DEFINITION = /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(\S+)/gm;

const AUTOLINK = /<[^\s<>]*(?::\/\/|@)[^\s<>]*>/g;

const TLD =
  "com|org|net|io|dev|mn|edu|gov|info|app|ai|co|me|ru|uk|de|fr|jp|cn|kr|tv|xyz|tech|online|site|page|blog|cloud|sh|gg|" +
  "shop|store|biz|us|ca|au|eu|nl|it|es|ch|se|kz|top|live|news|art|club|space|website|fun|life|world|link|today|studio|design|agency|digital";

const DOMAIN = new RegExp(
  String.raw`\b(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+(?:${TLD})\b(?:\/${URL_CHARS}*)?`,
  "gi",
);

const MD_LABEL = new RegExp(String.raw`\[([^\]\n]+)\](?=\(|\[|:)`, "g");

const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;

function urlLikeLabels(text: string): SkipRange[] {
  const ranges: SkipRange[] = [];
  MD_LABEL.lastIndex = 0;

  for (;;) {
    const match = MD_LABEL.exec(text);
    if (match === null) break;

    const label = match[1]!;
    DOMAIN.lastIndex = 0;
    if (!DOMAIN.test(label) && !/^(?:https?|ftp):/i.test(label)) continue;

    const start = match.index + match[0].indexOf(label);
    ranges.push({ start, end: start + label.length });
  }

  return ranges;
}

export function linkRanges(text: string): SkipRange[] {
  return mergeRanges([
    ...collect(text, MD_TARGET, 1),
    ...collect(text, MD_ATTRS, 1),
    ...collect(text, DIV_ATTRS, 1),
    ...collect(text, DOMAIN),
    ...urlLikeLabels(text),
    ...collect(text, MD_DEFINITION, 1),
    ...collect(text, AUTOLINK),
    ...collect(text, BARE_URL),
    ...collect(text, WWW_URL),
    ...collect(text, EMAIL),
  ]);
}

function braceCut(text: string, ranges: SkipRange[]): SkipRange[] {
  return ranges.map(({ start, end }) => {
    const brace = text.slice(start, end).search(/[{}]/);
    return brace < 0 ? { start, end } : { start, end: start + brace };
  });
}

export interface SkipOptions {
  code?: boolean;
  links?: boolean;
  latex?: boolean;
}

export function skipRanges(
  text: string,
  options: SkipOptions = {},
): SkipRange[] {
  const wantCode = options.code !== false;
  const wantLinks = options.links !== false;

  const ranges: SkipRange[] = [];
  if (wantCode)
    ranges.push(...(options.latex ? latexRanges(text) : codeRanges(text)));
  if (wantLinks)
    ranges.push(
      ...(options.latex ? braceCut(text, linkRanges(text)) : linkRanges(text)),
    );

  return mergeRanges(ranges);
}

export function fencedCode(text: string): SkipRange[] {
  if (text.indexOf("```") < 0 && text.indexOf("~~~") < 0) return [];
  return fencedRanges(text, lineBounds(text));
}

export function inRanges(ranges: SkipRange[], offset: number): boolean {
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid]!;

    if (offset < range.start) high = mid - 1;
    else if (offset >= range.end) low = mid + 1;
    else return true;
  }

  return false;
}
