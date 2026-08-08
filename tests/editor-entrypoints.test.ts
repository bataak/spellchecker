import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = readFileSync(join(ROOT, "src", "main.ts"), "utf8");
const LINES = MAIN.split("\n");

const ASSIGNMENT = /els\.editor\.value\s*=[^=]/;
const REFRESH = "syncDecodeBtn(";
const LOOKAHEAD = 40;

function assignmentLines(): number[] {
  const found: number[] = [];
  for (let index = 0; index < LINES.length; index++) {
    if (ASSIGNMENT.test(LINES[index]!)) found.push(index);
  }
  return found;
}

test("засварлагчид текст оруулах зам бүр товчийг шинэчилнэ", () => {
  const lines = assignmentLines();
  assert.ok(
    lines.length > 0,
    "els.editor.value оноолт олдсонгүй — шалгалт хүчингүй болсон байна",
  );

  const missing: string[] = [];
  for (const line of lines) {
    const window = LINES.slice(line, line + LOOKAHEAD).join("\n");
    if (!window.includes(REFRESH)) {
      missing.push(String(line + 1) + ": " + LINES[line]!.trim());
    }
  }

  assert.deepEqual(
    missing,
    [],
    "дараах мөрийн ойролцоо syncDecodeBtn дуудагдаагүй байна:\n" +
      missing.join("\n"),
  );
});

test("товчийн илрүүлэгч main.ts-д холбогдсон байна", () => {
  assert.match(MAIN, /from "\.\/cp1251\.ts"/);
  assert.match(MAIN, /hasMojibake/);
  assert.match(MAIN, /#decodeBtn/);
});
