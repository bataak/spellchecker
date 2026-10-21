import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

function runtimeImports(path: string): string[] {
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest);
  const found: string[] = [];
  for (const node of source.statements) {
    const spec =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : undefined;
    if (!spec || !ts.isStringLiteral(spec) || !spec.text.startsWith("."))
      continue;
    if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) continue;
    if (ts.isExportDeclaration(node) && node.isTypeOnly) continue;
    if (spec.text.endsWith(".ts"))
      found.push(resolve(dirname(path), spec.text));
  }
  return found;
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];
  const visit = (file: string): void => {
    state.set(file, "open");
    stack.push(file);
    for (const next of graph.get(file) ?? []) {
      if (state.get(next) === "open")
        cycles.push(stack.slice(stack.indexOf(next)).concat(next));
      else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(file, "done");
  };
  for (const file of graph.keys()) if (!state.has(file)) visit(file);
  return cycles;
}

test("src дотор runtime import-ийн цикл байхгүй", () => {
  const graph = new Map(
    walk(SRC, []).map((file) => [file, runtimeImports(file)]),
  );
  const cycles = findCycles(graph).map((cycle) =>
    cycle.map((file) => relative(SRC, file)).join(" → "),
  );
  assert.deepEqual(cycles, []);
});
