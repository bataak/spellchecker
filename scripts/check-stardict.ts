import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "fflate";
import {
  defineWord,
  headwordAt,
  isVerbPos,
  openStarDict,
  parseIfo,
  stardictCompare,
} from "../src/stardict.ts";

const HELP = `Хэрэглээ:
  node --experimental-strip-types scripts/check-stardict.ts [base] [үг ...]
  base: public/dict/stardict/mn (анхдагч)

Толь public/dict/stardict/mn.{ifo,idx,dict.dz,syn} байрлалд байвал
санал болголтын цонхонд тайлбар харагдана.

Өөрийн толинд тавигдах шаардлага:
  .ifo:
    StarDict's dict ifo file
    version=3.0.0
    bookname=Толийн нэр
    wordcount=…
    synwordcount=…
    sametypesequence=x
    x-pos-tags=1
  - x-pos-tags=1 байвал үйл үгийн -х хэлбэрийг таахгүй, tag болон .syn-ийг
    ашиглана. Байхгүй бол таах аргаар ажиллана.
  - Оруулга XDXF. Үйл үгийг <gr>үйл</gr> гэж тэмдэглэнэ
    (src/stardict.ts-ийн VERB_POS).
  - .syn нь mn_MN.dic-ийн язгуур бүрийг (ор, тэгшил) толгой үгтэй
    (ОРОХ, ТЭГШЛЭХ) холбоно. Build үед .dic-ээс үүсгэнэ. Нэр, үйл үг ижил
    язгууртай бол хоёуланг нь холбож, <gr>-ээр ялгана.
  - .idx, .syn нь StarDict-ийн дүрмээр эрэмбэлэгдсэн байна.
  - Толийг нийтлэхдээ .gitignore-оос public/dict/stardict/ мөрийг хасна.`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const base = process.argv[2] ?? "public/dict/stardict/mn";
const samples = process.argv.slice(3);
const errors: string[] = [];
const warnings: string[] = [];

function readFirst(paths: string[]): Uint8Array | null {
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const bytes = new Uint8Array(readFileSync(path));
    return bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  }
  return null;
}

if (!existsSync(base + ".ifo")) {
  console.error("Алга: " + base + ".ifo");
  process.exit(1);
}
const ifoText = readFileSync(base + ".ifo", "utf8");
const info = parseIfo(ifoText);
if (!info) {
  console.error("ifo файл StarDict биш эсвэл wordcount буруу");
  process.exit(1);
}
if (!info.bookname) warnings.push("bookname хоосон (tooltip-д эх сурвалж гарахгүй)");

const idx = readFirst([base + ".idx", base + ".idx.gz"]);
const dictBytes = readFirst([base + ".dict.dz", base + ".dict"]);
const syn = info.synwordcount
  ? readFirst([base + ".syn", base + ".syn.gz"])
  : null;
if (!idx) errors.push("idx файл алга");
if (!dictBytes) errors.push("dict файл алга");
if (info.synwordcount && !syn) errors.push("synwordcount байгаа ч syn файл алга");
if (!info.synwordcount && existsSync(base + ".syn"))
  warnings.push("syn файл байгаа ч ifo-д synwordcount алга (уншигдахгүй)");

if (idx && dictBytes && !errors.length) {
  try {
    const dict = openStarDict(ifoText, idx, dictBytes, syn);
    const count = dict.index.starts.length;
    let unsorted = 0;
    let invisible = 0;
    let tagged = 0;
    let verbs = 0;
    const untaggedInfinitives: string[] = [];
    let previous = "";
    for (let entry = 0; entry < count; entry++) {
      const headword = headwordAt(dict.index, entry);
      if (entry && stardictCompare(previous, headword) > 0) unsorted++;
      if (/[\u200B-\u200F\u00A0\u00AD]/.test(headword)) invisible++;
      previous = headword;
      if (!info.posTagged) continue;
      const found = defineWord(dict, headword, "proper").find(
        (item) => item.headword === headword,
      );
      if (!found) continue;
      if (found.pos.length) tagged++;
      const isVerb = found.pos.some(isVerbPos);
      if (isVerb) verbs++;
      if (!isVerb && /х$/i.test(headword) && untaggedInfinitives.length < 10)
        untaggedInfinitives.push(headword);
    }
    if (unsorted) errors.push("idx эрэмбэ зөрсөн: " + String(unsorted));
    if (invisible)
      warnings.push("харагдахгүй тэмдэгттэй толгой үг: " + String(invisible));
    if (info.posTagged) {
      if (!info.sametypesequence.includes("x"))
        errors.push("x-pos-tags=1 боловч sametypesequence-д x алга");
      if (!info.synwordcount)
        warnings.push("x-pos-tags=1 боловч syn алга (язгуураар хайлт ажиллахгүй)");
      if (!tagged) errors.push("x-pos-tags=1 боловч <gr> tag нэг ч алга");
      if (untaggedInfinitives.length)
        warnings.push(
          "-х-ээр төгссөн, үйл tag-гүй толгой үг: " +
            untaggedInfinitives.join(", "),
        );
    }
    console.log("Толь:", info.bookname);
    console.log("Толгой үг:", count, " syn:", dict.syn?.starts.length ?? 0);
    console.log(
      "Горим:",
      info.posTagged
        ? "tag-тай (tag-тай оруулга " + String(tagged) + ", үйл " + String(verbs) + ")"
        : "tag-гүй (нэр үйлийг таах арга)",
    );
    for (const word of samples) {
      const entries = defineWord(dict, word);
      console.log(
        "  " + word + " →",
        entries.length
          ? entries.map((item) => item.headword + " [" + item.pos.join(",") + "]").join("; ")
          : "олдсонгүй",
      );
    }
  } catch (err) {
    errors.push(String(err));
  }
}

const ignored = spawnSync("git", ["check-ignore", "-q", base + ".ifo"]);
if (ignored.status === 0)
  warnings.push(
    "толь .gitignore-д орсон тул commit, deploy хийгдэхгүй. " +
      "Нийтлэх толь бол .gitignore-оос public/dict/stardict/ мөрийг хасна уу",
  );

for (const warning of warnings) console.warn("АНХААР:", warning);
for (const error of errors) console.error("АЛДАА:", error);
process.exit(errors.length ? 1 : 0);
