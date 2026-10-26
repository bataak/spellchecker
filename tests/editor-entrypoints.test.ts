import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name: string): string =>
  readFileSync(join(ROOT, "src", name), "utf8");
const MAIN = read("main.ts");
const WIRING = read("app/editorwiring.ts");
const FIXERS = read("app/fixers.ts");
const LOOKAHEAD = 40;

const ENTRYPOINTS: readonly [string, RegExp, string][] = [
  ["office/session.ts", /swapText\(editor\b/, "deps.syncFixButtons("],
  ["editor/drafttext.ts", /swapText\(editor, draftText\b/, "deps.onLoaded("],
  ["editor/editortext.ts", /editor\.value\s*=\s*newText/, "deps.onReplaced("],
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
  assert.match(WIRING, /onLoaded: \(\) => \{?\s*fixers\.sync\(\)/);
  assert.match(WIRING, /onReplaced: \(\) => fixers\.sync\(\)/);
  assert.match(FIXERS, /decode\.sync\(\);\s*clean\.sync\(\);/);
});

test("товчийн илрүүлэгч засварлагчийн холболтод орсон байна", () => {
  const decode = read("editor/decode.ts");
  assert.match(decode, /from "\.\.\/archive\/cp1251\.ts"/);
  assert.match(decode, /hasMojibake/);
  assert.match(decode, /#decodeBtn/);
  assert.match(decode, /#cleanBtn/);
  assert.match(decode, /needsCleanup/);
  assert.match(MAIN, /from "\.\/app\/editorwiring\.ts"/);
  assert.match(WIRING, /from "\.\/fixers\.ts"/);
  assert.match(FIXERS, /from "\.\.\/editor\/decode\.ts"/);
});
