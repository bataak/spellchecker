import { test } from "node:test";
import assert from "node:assert/strict";
import { itemEdit } from "../src/tex/texitems.ts";

const apply = (text: string): string | null => {
  const at = text.indexOf("|");
  const plain = text.replace("|", "");
  const edit = itemEdit(plain, at, at);
  if (!edit) return null;
  const out = plain.slice(0, edit.from) + edit.insert + plain.slice(edit.to);
  return out.slice(0, edit.caret) + "|" + out.slice(edit.caret);
};

test("itemEdit: жагсаалт дотор шинэ \\item-ийг ижил зайтай нэмнэ", () => {
  assert.equal(
    apply("\\begin{itemize}\n    \\item xxx|\n\\end{itemize}"),
    "\\begin{itemize}\n    \\item xxx\n    \\item |\n\\end{itemize}",
  );
  assert.equal(
    apply("\\begin{enumerate}\n\\item a|"),
    "\\begin{enumerate}\n\\item a\n\\item |",
  );
});

test("itemEdit: \\item байхгүй бол орчны доголоос нэг шат дотогш оруулна", () => {
  assert.equal(
    apply("  \\begin{description}|"),
    "  \\begin{description}\n    \\item |",
  );
});

test("itemEdit: дотоод жагсаалтын догол болон хаагдсан жагсаалтыг ялгана", () => {
  assert.equal(
    apply(
      "\\begin{itemize}\n  \\item a\n  \\begin{enumerate}\n    \\item b\n  \\end{enumerate}|",
    ),
    "\\begin{itemize}\n  \\item a\n  \\begin{enumerate}\n    \\item b\n  \\end{enumerate}\n  \\item |",
  );
  assert.equal(apply("\\begin{itemize}\n\\item a\n\\end{itemize}\n|"), null);
  assert.equal(apply("Энгийн мөр|"), null);
});

test("itemEdit: сонгосон хэсгийг шинэ \\item-ээр солино", () => {
  const text = "\\begin{itemize}\n\\item abc";
  const edit = itemEdit(text, text.length - 2, text.length);
  assert.deepEqual(edit, {
    from: text.length - 2,
    to: text.length,
    insert: "\n\\item ",
    caret: text.length - 2 + 7,
  });
});
