const CP1252_HIGH =
  "\u20AC\uFFFF\u201A\u0192\u201E\u2026\u2020\u2021" +
  "\u02C6\u2030\u0160\u2039\u0152\uFFFF\u017D\uFFFF" +
  "\uFFFF\u2018\u2019\u201C\u201D\u2022\u2013\u2014" +
  "\u02DC\u2122\u0161\u203A\u0153\uFFFF\u017E\u0178";

const CP1251_BASE =
  "\u0402\u0403\u201A\u0453\u201E\u2026\u2020\u2021" +
  "\u20AC\u2030\u0409\u2039\u040A\u040C\u040B\u040F" +
  "\u0452\u2018\u2019\u201C\u201D\u2022\u2013\u2014" +
  "\uFFFD\u2122\u0459\u203A\u045A\u045C\u045B\u045F" +
  "\u00A0\u040E\u045E\u0408\u00A4\u0490\u00A6\u00A7" +
  "\u0401\u00A9\u0404\u00AB\u00AC\u00AD\u00AE\u0407" +
  "\u00B0\u00B1\u0406\u0456\u0491\u00B5\u00B6\u00B7" +
  "\u0451\u2116\u0454\u00BB\u0458\u0405\u0455\u0457" +
  "\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417" +
  "\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F" +
  "\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427" +
  "\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F" +
  "\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437" +
  "\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F" +
  "\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447" +
  "\u0448\u0449\u044A\u044B\u044C\u044D\u044E\u044F";

export type CyrVariant = "cp1251" | "t2a";

const VARIANT_SLOTS: Record<CyrVariant, Record<number, string>> = {
  cp1251: {
    0xaa: "\u04E8",
    0xaf: "\u04AE",
    0xba: "\u04E9",
    0xbf: "\u04AF",
  },
  t2a: {
    0x90: "\u04E8",
    0x93: "\u04AE",
    0x9c: "\u0401",
    0xb0: "\u04E9",
    0xb3: "\u04AF",
    0xbc: "\u0451",
  },
};

function buildTable(variant: CyrVariant): string[] {
  const table: string[] = [];
  for (let i = 0; i < 128; i++) table.push(CP1251_BASE[i]!);
  for (const byte of Object.keys(VARIANT_SLOTS[variant])) {
    table[Number(byte) - 0x80] = VARIANT_SLOTS[variant][Number(byte)]!;
  }
  return table;
}

const TABLES: Record<CyrVariant, string[]> = {
  cp1251: buildTable("cp1251"),
  t2a: buildTable("t2a"),
};

function isCyrillic(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  return code >= 0x0400 && code <= 0x04ff;
}

export function charToByte(ch: string): number | null {
  const code = ch.codePointAt(0)!;
  if (code <= 0xff) return code;
  const index = CP1252_HIGH.indexOf(ch);
  return index >= 0 ? 0x80 + index : null;
}

export function decodeWith(text: string, variant: CyrVariant): string {
  const table = TABLES[variant];
  let out = "";
  for (const ch of text) {
    const byte = charToByte(ch);
    out += byte !== null && byte >= 0x80 ? table[byte - 0x80]! : ch;
  }
  return out;
}

export function detectVariant(text: string): CyrVariant {
  let cp1251Hits = 0;
  let t2aHits = 0;
  for (const ch of text) {
    const byte = charToByte(ch);
    if (byte === null) continue;
    if (VARIANT_SLOTS.cp1251[byte] !== undefined) cp1251Hits++;
    if (VARIANT_SLOTS.t2a[byte] !== undefined) t2aHits++;
  }
  return t2aHits > cp1251Hits ? "t2a" : "cp1251";
}

const MIN_WORD_LETTERS = 3;

function isMojibakeLetter(ch: string, table: string[]): boolean {
  const byte = charToByte(ch);
  if (byte === null || byte < 0x80) return false;
  return isCyrillic(table[byte - 0x80]!);
}

export function countMojibakeLetters(
  text: string,
  variant: CyrVariant,
): number {
  const table = TABLES[variant];
  let count = 0;
  for (const ch of text) if (isMojibakeLetter(ch, table)) count++;
  return count;
}

export function countMojibakeWords(
  text: string,
  variant: CyrVariant,
): number {
  const table = TABLES[variant];
  let words = 0;
  let run = 0;
  for (const ch of text) {
    if (isMojibakeLetter(ch, table)) {
      run++;
      if (run === MIN_WORD_LETTERS) words++;
    } else {
      run = 0;
    }
  }
  return words;
}

const SLOT_TO_MN: Record<string, string> = {
  "\u00AA": "\u04E8",
  "\u00AF": "\u04AE",
  "\u00BA": "\u04E9",
  "\u00BF": "\u04AF",
  "\u0404": "\u04E8",
  "\u0407": "\u04AE",
  "\u0454": "\u04E9",
  "\u0457": "\u04AF",
};

const WORD_RE = /[\p{Script=Cyrillic}\u00AA\u00AF\u00BA\u00BF]+/gu;

export function fixSlotsInWords(text: string): string {
  return text.replace(WORD_RE, (word) => {
    let hasCyrillic = false;
    let hasSlot = false;
    for (const ch of word) {
      if (SLOT_TO_MN[ch] !== undefined) hasSlot = true;
      else if (isCyrillic(ch)) hasCyrillic = true;
    }
    if (!hasCyrillic || !hasSlot) return word;
    let out = "";
    for (const ch of word) out += SLOT_TO_MN[ch] ?? ch;
    return out;
  });
}

export interface RepairResult {
  text: string;
  applied: "none" | "slots" | CyrVariant;
  words: number;
}

const RUN_RE =
  /[\p{L}\u0090\u00AA\u00AF\u00B0\u00B3\u00BA\u00BC\u00BF\u0152\u0153\u201C]+/gu;

function repairWord(
  word: string,
  variant: CyrVariant,
): { text: string; changed: boolean } {
  const table = TABLES[variant];
  let mojibake = 0;
  let cyrillic = 0;
  let latin = 0;
  for (const ch of word) {
    if (isMojibakeLetter(ch, table)) mojibake++;
    else if (isCyrillic(ch)) cyrillic++;
    else {
      const code = ch.codePointAt(0)!;
      if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a))
        latin++;
    }
  }
  if (!mojibake) return { text: word, changed: false };
  if (cyrillic === 0 && latin >= mojibake)
    return { text: word, changed: false };
  if (cyrillic === 0 && mojibake < 2) return { text: word, changed: false };
  let out = "";
  for (const ch of word) {
    const byte = charToByte(ch);
    if (byte !== null && byte >= 0x80 && isMojibakeLetter(ch, table)) {
      out += table[byte - 0x80]!;
    } else {
      out += ch;
    }
  }
  return { text: out, changed: true };
}

export function repairCyrillicDetailed(text: string): RepairResult {
  if (!text) return { text, applied: "none", words: 0 };
  const variant = detectVariant(text);
  let changedWords = 0;
  let sawCyrillic = false;
  const repaired = text.replace(RUN_RE, (word) => {
    const result = repairWord(word, variant);
    if (result.changed) changedWords++;
    else {
      for (const ch of word) {
        if (isCyrillic(ch)) {
          sawCyrillic = true;
          break;
        }
      }
    }
    return result.text;
  });
  if (changedWords > 0) {
    let final = repaired;
    if (changedWords >= 3) {
      const table = TABLES[variant];
      final = final.replace(RUN_RE, (word) => {
        let mojibake = 0;
        let other = 0;
        for (const ch of word) {
          if (isMojibakeLetter(ch, table)) {
            const byte = charToByte(ch)!;
            if (byte >= 0xc0 || VARIANT_SLOTS[variant][byte] !== undefined)
              mojibake++;
            else other++;
          } else other++;
        }
        if (!mojibake || other) return word;
        let out = "";
        for (const ch of word) {
          const byte = charToByte(ch)!;
          out += table[byte - 0x80]!;
        }
        return out;
      });
    }
    const slotFixed = fixSlotsInWords(final);
    return { text: slotFixed, applied: variant, words: changedWords };
  }
  if (sawCyrillic) {
    const fixed = fixSlotsInWords(text);
    return {
      text: fixed,
      applied: fixed === text ? "none" : "slots",
      words: 0,
    };
  }
  return { text, applied: "none", words: 0 };
}

export function repairCyrillic(text: string): string {
  return repairCyrillicDetailed(text).text;
}
