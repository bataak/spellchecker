import { codeRanges, inRanges } from "./codeskip.ts";

/**
 * Markdown засварлагчийн цэвэр функцууд.
 *
 * DOM-гүй: бүх функц бичвэр + тэмдэглэлийн байрлалыг авч, шинэ бичвэр +
 * шинэ байрлалыг буцаана. Node дээр браузергүйгээр тестлэгдэнэ.
 *
 * Дуудагч тал `document.execCommand("insertText")`-ээр өөрчлөлтийг хийж,
 * дараа нь `setSelectionRange`-ээр тэмдэглэлийг сэргээнэ — эс бөгөөс
 * хөтчийн уугуул undo стек устана.
 */

export interface Edit {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const HEADING = /^(#{1,6})[ \t]+/;
const BULLET = /^([-*+])[ \t]+/;
const ORDERED = /^(\d+)[.)][ \t]+/;

const ANY_BULLET = /^\s*[-*+]\s+/;
const ANY_ORDERED = /^\s*\d+[.)]\s+/;
const ANY_QUOTE = /^\s*>/;
const DIVIDER = /^[\s|:-]*-[\s|:-]*$/;

function lineStartAt(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

function lineEndAt(text: string, pos: number): number {
  const i = text.indexOf("\n", pos);
  return i < 0 ? text.length : i;
}

interface Bounds {
  readonly from: number;
  readonly to: number;
  readonly lines: string[];
}

/**
 * Тэмдэглэл хамарч буй бүтэн мөрүүд. Тэмдэглэл мөрийн эхэнд төгссөн бол
 * (`\n`-ийн яг ард) тэр мөрийг оруулахгүй.
 */
function blockLines(text: string, start: number, end: number): Bounds {
  const e = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const from = lineStartAt(text, start);
  const to = lineEndAt(text, e);
  return { from, to, lines: text.slice(from, to).split("\n") };
}

interface PrefixSpec {
  /** Мөрийн эхнээс хасах тэмдэгтийн тоо. */
  readonly drop: number;
  /** Оронд нь тавих угтвар. */
  readonly add: string;
}

/**
 * Мөр бүрийн угтварыг солино. Угтвар л өөрчлөгддөг тул тэмдэглэлийн
 * байрлалыг нарийн тооцоолж болно: угтварын дотор байсан байрлал шинэ
 * угтварын араас, түүнээс хойших байрлал зөрүүгээр шилжинэ.
 *
 * Мөрийн эхэнд тогтсон тэмдэглэлийн эхлэл тэндээ үлдэнэ — эс бөгөөс олон
 * мөрийг хамарсан тэмдэглэл эхний угтварыг алдана. Хоосон заагч эсрэгээрээ
 * угтварын ард шилжинэ.
 */
function mapPrefix(
  text: string,
  start: number,
  end: number,
  fn: (line: string, index: number) => PrefixSpec | null,
): Edit {
  const { from, to, lines } = blockLines(text, start, end);
  const out: string[] = [];

  let pos = from;
  let acc = 0;
  let newStart = start;
  let newEnd = end;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const spec = fn(line, i);
    const drop = spec?.drop ?? 0;
    const add = spec?.add ?? "";
    out.push(spec ? add + line.slice(drop) : line);
    const delta = spec ? add.length - drop : 0;

    const ls = pos;
    const le = pos + line.length;
    const fix = (p: number, anchor: boolean): number => {
      const off = p - ls;
      if (off === 0 && anchor) return ls + acc;
      return ls + acc + (off < drop ? add.length : off + delta);
    };
    if (start >= ls && start <= le) newStart = fix(start, start !== end);
    if (end >= ls && end <= le) newEnd = fix(end, false);

    acc += delta;
    pos = le + 1;
  }

  if (end > to) newEnd = end + acc;

  return {
    text: text.slice(0, from) + out.join("\n") + text.slice(to),
    start: newStart,
    end: Math.max(newStart, newEnd),
  };
}

/**
 * Тэмдэглэсэн хэсгийг маркераар хүрээлэх, эсвэл аль хэдийн хүрээлэгдсэн
 * бол тайлах. `marker` нь `"**"` (тод) эсвэл `"*"` (налуу).
 *
 * Тэмдэглэлийн хоёр захын зайг гадуур үлдээнэ — давхар товшилтоор үг
 * сонгоход ард нь зай орох нь түгээмэл. Хажуугийн тэмдэгт мөн маркерын
 * үсэг байвал тайлахгүй: `*`-аар налуу хийхэд `**`-ийн хагасыг хазахаас
 * сэргийлнэ.
 */
function runBefore(text: string, pos: number, ch: string): number {
  let n = 0;
  while (pos - n - 1 >= 0 && text[pos - n - 1] === ch) n += 1;
  return n;
}

function runAfter(text: string, pos: number, ch: string): number {
  let n = 0;
  while (pos + n < text.length && text[pos + n] === ch) n += 1;
  return n;
}

function wrapped(run: number, marker: string): boolean {
  if (marker[0] !== "*") return run >= marker.length;
  return marker.length === 2 ? run >= 2 : run % 2 === 1;
}

export function toggleWrap(
  text: string,
  start: number,
  end: number,
  marker: string,
): Edit {
  const m = marker.length;
  const ch = marker[0]!;

  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s += 1;
  while (e > s && /\s/.test(text[e - 1]!)) e -= 1;

  if (s === e) {
    const run = Math.min(
      runBefore(text, start, ch),
      runAfter(text, start, ch),
    );
    if (wrapped(run, marker)) {
      const at = start - m;
      return {
        text: text.slice(0, at) + text.slice(start + m),
        start: at,
        end: at,
      };
    }
    const at = start + m;
    return {
      text: text.slice(0, start) + marker + marker + text.slice(start),
      start: at,
      end: at,
    };
  }

  const outer = Math.min(runBefore(text, s, ch), runAfter(text, e, ch));
  if (wrapped(outer, marker)) {
    return {
      text: text.slice(0, s - m) + text.slice(s, e) + text.slice(e + m),
      start: s - m,
      end: e - m,
    };
  }

  const inner = Math.min(runAfter(text, s, ch), runBefore(text, e, ch));
  if (e - s >= 2 * m && inner > 0 && wrapped(inner, marker)) {
    return {
      text: text.slice(0, s) + text.slice(s + m, e - m) + text.slice(e),
      start: s,
      end: e - 2 * m,
    };
  }

  return {
    text: text.slice(0, s) + marker + text.slice(s, e) + marker + text.slice(e),
    start: s + m,
    end: e + m,
  };
}

export function headingDepthAt(text: string, pos: number): number {
  const from = lineStartAt(text, pos);
  const line = text.slice(from, lineEndAt(text, pos));
  return HEADING.exec(line)?.[1]?.length ?? 0;
}

/**
 * Гарчиг тавих. Хамрагдсан бүх утга агуулсан мөр аль хэдийн тэр түвшинд
 * байвал гарчгийг авна.
 */
export function toggleHeading(
  text: string,
  start: number,
  end: number,
  depth: 1 | 2 | 3 | 4 | 5 | 6,
): Edit {
  const { lines } = blockLines(text, start, end);
  const filled = lines.filter((l) => l.trim());
  const already =
    filled.length > 0 &&
    filled.every((l) => (HEADING.exec(l)?.[1]?.length ?? 0) === depth);
  const target = already ? 0 : depth;

  return mapPrefix(text, start, end, (line) => {
    if (!line.trim()) return null;
    const head = HEADING.exec(line);
    const list = head ? null : (BULLET.exec(line) ?? ORDERED.exec(line));
    const drop = (head ?? list)?.[0].length ?? 0;
    const add = target ? "#".repeat(target) + " " : "";
    if (drop === 0 && add === "") return null;
    return { drop, add };
  });
}

/**
 * Жагсаалт болгох. Хамрагдсан бүх утга агуулсан мөр аль хэдийн тэр
 * төрлийн жагсаалт байвал тэмдэглэгээг авна.
 */
export function toggleList(
  text: string,
  start: number,
  end: number,
  ordered: boolean,
): Edit {
  const { lines } = blockLines(text, start, end);
  const kind = ordered ? ORDERED : BULLET;
  const filled = lines.filter((l) => l.trim());
  const off = filled.length > 0 && filled.every((l) => kind.test(l));

  let n = 0;
  return mapPrefix(text, start, end, (line) => {
    if (!line.trim()) return null;
    const head = HEADING.exec(line);
    const rest = line.slice(head?.[0].length ?? 0);
    const marker = BULLET.exec(rest) ?? ORDERED.exec(rest);
    const drop = (head?.[0].length ?? 0) + (marker?.[0].length ?? 0);
    if (off) {
      if (drop === 0) return null;
      return { drop, add: "" };
    }
    n += 1;
    return { drop, add: ordered ? `${String(n)}. ` : "- " };
  });
}

function lineAt(text: string, index: number): string {
  if (index < 0 || index > text.length) return "";
  return text.slice(lineStartAt(text, index), lineEndAt(text, index));
}

function inTable(text: string, from: number, to: number, line: string): boolean {
  if (!line.includes("|")) return false;
  if (/^\s*\|/.test(line)) return true;
  const prev = from > 0 ? lineAt(text, from - 1) : "";
  const next = to < text.length ? lineAt(text, to + 1) : "";
  return (
    (prev.includes("|") && DIVIDER.test(prev)) ||
    (next.includes("|") && DIVIDER.test(next))
  );
}

function inFence(text: string, caret: number): boolean {
  if (!text.includes("```") && !text.includes("~~~")) return false;
  return inRanges(codeRanges(text), caret);
}

/**
 * Enter дарахад юу оруулах вэ.
 *
 * Хэрэглэгчийн сэтгэхүйд Enter нь шинэ догол үүсгэдэг, гэтэл markdown-д
 * ганц `\n` нь ердөө мөрийн ороолт. Тиймээс ердийн доголд `\n\n`
 * оруулж, дискэн дээрх файлыг стандарт markdown хэвээр үлдээнэ.
 *
 * Хоосон мөр блокийг таслах дараах тохиолдолд ганц `\n` буцаана: мөр
 * хоосон (давхар Enter дөрвөн мөр болохоос сэргийлнэ), жагсаалт (хоосон
 * мөр жагсаалтыг тусдаа блокуудад задална), хүснэгтийн эгнээ (хоосон мөр
 * хүснэгтийг бүрмөсөн устгана), ишлэл, кодын хашлагын дотор.
 */
export function enterInsert(text: string, caret: number): "\n" | "\n\n" {
  const from = lineStartAt(text, caret);
  const to = lineEndAt(text, caret);
  const line = text.slice(from, to);

  if (!line.trim()) return "\n";
  if (ANY_BULLET.test(line) || ANY_ORDERED.test(line)) return "\n";
  if (ANY_QUOTE.test(line)) return "\n";
  if (inTable(text, from, to, line)) return "\n";
  if (inFence(text, caret)) return "\n";

  return "\n\n";
}

export interface Patch {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

/**
 * Хоёр бичвэрийн ялгааг хамгийн богино орлуулга болгож олно.
 *
 * `textarea.value`-г бүхэлд нь солих нь хөтчийн undo стекийг устгадаг.
 * Оронд нь өөрчлөгдсөн хэсгийг л тэмдэглээд `execCommand`-аар орлуулбал
 * undo бүрэн хадгалагдана. Ижил бол `null`.
 */
export function minimalDiff(before: string, after: string): Patch | null {
  if (before === after) return null;

  const max = Math.min(before.length, after.length);
  let a = 0;
  while (a < max && before.charCodeAt(a) === after.charCodeAt(a)) a += 1;

  let b = 0;
  while (
    b < max - a &&
    before.charCodeAt(before.length - 1 - b) ===
      after.charCodeAt(after.length - 1 - b)
  )
    b += 1;

  return {
    from: a,
    to: before.length - b,
    insert: after.slice(a, after.length - b),
  };
}


/**
 * Ишлэл болгох. Хамрагдсан бүх утга агуулсан мөр аль хэдийн ишлэл байвал
 * тэмдэглэгээг авна.
 */
export function toggleQuote(text: string, start: number, end: number): Edit {
  const { lines } = blockLines(text, start, end);
  const filled = lines.filter((l) => l.trim());
  const off = filled.length > 0 && filled.every((l) => ANY_QUOTE.test(l));

  return mapPrefix(text, start, end, (line) => {
    if (!line.trim()) return null;
    const marker = /^\s*>[ \t]?/.exec(line);
    if (off) return marker ? { drop: marker[0].length, add: "" } : null;
    return marker ? null : { drop: 0, add: "> " };
  });
}

const URLISH = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)\S*$/i;

/**
 * Холбоос оруулах. Тэмдэглэсэн хэсэг хаяг бол хаягийн байранд, эс бөгөөс
 * нэрийн байранд тавина. Заагч дараа нь бөглөх ёстой талбарт очно.
 */
export function wrapLink(text: string, start: number, end: number): Edit {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s += 1;
  while (e > s && /\s/.test(text[e - 1]!)) e -= 1;

  const picked = text.slice(s, e);

  if (!picked) {
    const inserted = "[]()";
    return {
      text: text.slice(0, start) + inserted + text.slice(start),
      start: start + 1,
      end: start + 1,
    };
  }

  if (URLISH.test(picked)) {
    const inserted = "[](" + picked + ")";
    return {
      text: text.slice(0, s) + inserted + text.slice(e),
      start: s + 1,
      end: s + 1,
    };
  }

  const inserted = "[" + picked + "]()";
  const at = s + picked.length + 3;
  return {
    text: text.slice(0, s) + inserted + text.slice(e),
    start: at,
    end: at,
  };
}

/**
 * Хүснэгт оруулах. Одоогийн мөрийн ард шинэ блок болгон тавьж, эхний
 * баганын нэрийг тэмдэглэнэ — хэрэглэгч шууд дарж бичнэ.
 */
export function insertTable(
  text: string,
  caret: number,
  cols = 2,
  rows = 1,
): Edit {
  const to = lineEndAt(text, caret);
  const line = text.slice(lineStartAt(text, caret), to);

  const names = Array.from(
    { length: cols },
    (_, i) => "Багана " + String(i + 1),
  );
  const head = "| " + names.join(" | ") + " |";
  const divider = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
  const blank =
    "| " + Array.from({ length: cols }, () => "   ").join(" | ") + " |";
  const body = Array.from({ length: rows }, () => blank).join("\n");

  const before = line.trim() ? "\n\n" : "";
  const after = to < text.length ? "\n" : "";
  const block = head + "\n" + divider + "\n" + body;

  const at = to + before.length + 2;
  return {
    text: text.slice(0, to) + before + block + after + text.slice(to),
    start: at,
    end: at + names[0]!.length,
  };
}

export interface Field {
  readonly start: number;
  readonly end: number;
}

function blockBounds(text: string, caret: number): Field {
  let start = lineStartAt(text, caret);
  while (start > 0) {
    const prevEnd = start - 1;
    const prevStart = lineStartAt(text, prevEnd);
    if (!text.slice(prevStart, prevEnd).trim()) break;
    start = prevStart;
  }

  let end = lineEndAt(text, caret);
  while (end < text.length) {
    const nextStart = end + 1;
    const nextEnd = lineEndAt(text, nextStart);
    if (!text.slice(nextStart, nextEnd).trim()) break;
    end = nextEnd;
  }

  return { start, end };
}

export function exampleAt(
  text: string,
  caret: number,
  examples: readonly string[],
): Field | null {
  if (examples.length === 0) return null;
  if (!text.slice(lineStartAt(text, caret), lineEndAt(text, caret)).trim())
    return null;

  const { start, end } = blockBounds(text, caret);
  const block = text.slice(start, end);
  if (!block.trim()) return null;

  const lead = block.length - block.trimStart().length;
  const tail = block.length - block.trimEnd().length;
  const body = block.slice(lead, block.length - tail);
  const marker = HEADING.exec(body)?.[0].length ?? 0;

  if (!examples.includes(body.slice(marker))) return null;
  return { start: start + lead + marker, end: end - tail };
}
