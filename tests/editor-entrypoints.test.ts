import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name: string): string =>
  readFileSync(join(ROOT, "src", name), "utf8");
const MAIN = read("main.ts");
const LOOKAHEAD = 40;

const ENTRYPOINTS: readonly [string, RegExp, string][] = [
  ["main.ts", /els\.editor\.value\s*=[^=]/, "decode.sync("],
  ["drafttext.ts", /editor\.value\s*=\s*draftText/, "deps.onLoaded("],
  ["editortext.ts", /editor\.value\s*=\s*newText/, "deps.onReplaced("],
];

function missingRefresh(
  name: string,
  assignment: RegExp,
  refresh: string,
): string[] {
  const lines = read(name).split("\n");
  const found: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (assignment.test(lines[index]!)) found.push(index);
  }
  assert.ok(
    found.length > 0,
    name + ": editor.value оноолт олдсонгүй — шалгалт хүчингүй болсон байна",
  );
  return found
    .filter(
      (line) =>
        !lines
          .slice(line, line + LOOKAHEAD)
          .join("\n")
          .includes(refresh),
    )
    .map((line) => name + ":" + String(line + 1) + ": " + lines[line]!.trim());
}

test("засварлагчид текст оруулах зам бүр товчийг шинэчилнэ", () => {
  const missing = ENTRYPOINTS.flatMap(([name, assignment, refresh]) =>
    missingRefresh(name, assignment, refresh),
  );
  assert.deepEqual(
    missing,
    [],
    "дараах мөрийн ойролцоо товч шинэчлэгдээгүй байна:\n" + missing.join("\n"),
  );
  assert.match(MAIN, /onLoaded: \(\) => decode\.sync\(\)/);
  assert.match(MAIN, /onReplaced: \(\) => decode\.sync\(\)/);
});

test("товчийн илрүүлэгч main.ts-д холбогдсон байна", () => {
  const decode = read("decode.ts");
  assert.match(decode, /from "\.\/cp1251\.ts"/);
  assert.match(decode, /hasMojibake/);
  assert.match(decode, /#decodeBtn/);
  assert.match(MAIN, /from "\.\/decode\.ts"/);
});
