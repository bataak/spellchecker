import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["src", "tests", "scripts", "tools", "worker", "types"];
const SKIP = new Set(["node_modules", ".cache", "dist"]);
const CONFIGS = ["vite.config.ts", "vite-stardict.ts", "eslint.config.js"];

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|js|mjs|cjs|css)$/.test(name)) out.push(path);
  }
  return out;
}

function scriptComments(path: string, text: string): number[] {
  const kind = path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const found = new Set<number>();
  const add = (ranges: ts.CommentRange[] | undefined): void =>
    ranges?.forEach((range) => found.add(range.pos));
  const visit = (node: ts.Node): void => {
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.getEnd()));
    node.getChildren(source).forEach(visit);
  };
  visit(source);
  return [...found];
}

function styleComments(text: string): number[] {
  return [...text.matchAll(/\/\*/g)].map((match) => match.index);
}

function lineOf(text: string, pos: number): number {
  return text.slice(0, pos).split("\n").length;
}

test("эх кодонд comment байхгүй", () => {
  const files = [
    ...DIRS.flatMap((dir) => walk(join(ROOT, dir), [])),
    ...CONFIGS.map((name) => join(ROOT, name)),
  ];
  const found = files.flatMap((path) => {
    const text = readFileSync(path, "utf8");
    const positions = path.endsWith(".css")
      ? styleComments(text)
      : scriptComments(path, text);
    return positions.map(
      (pos) => relative(ROOT, path) + ":" + String(lineOf(text, pos)),
    );
  });
  assert.ok(files.length > 300);
  assert.deepEqual(found, []);
});
