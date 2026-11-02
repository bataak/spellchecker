import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { test } from "node:test";

const SRC = "src";
const IMPORT = /(?:^import\s[^;]*?from\s+|\bimport\()"(\.[^"]+)"/gm;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function topFolder(path: string): string | null {
  const parts = normalize(path).split(sep);
  return parts[0] === SRC && parts.length > 2 ? parts[1]! : null;
}

function folderGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const file of sourceFiles(SRC)) {
    const from = topFolder(file);
    if (from === null) continue;
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const to = topFolder(join(dirname(file), match[1]!));
      if (to === null || to === from) continue;
      if (!graph.has(from)) graph.set(from, new Set());
      graph.get(from)!.add(to);
    }
  }
  return graph;
}

function findCycle(graph: Map<string, Set<string>>): string[] | null {
  const done = new Set<string>();
  const walk = (node: string, trail: string[]): string[] | null => {
    if (trail.includes(node)) return [...trail, node];
    if (done.has(node)) return null;
    for (const next of graph.get(node) ?? []) {
      const cycle = walk(next, [...trail, node]);
      if (cycle) return cycle;
    }
    done.add(node);
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = walk(node, []);
    if (cycle) return cycle;
  }
  return null;
}

test("src доторх хавтсууд хоорондоо цикл үүсгэхгүй", () => {
  const cycle = findCycle(folderGraph());
  assert.equal(cycle, null, cycle?.join(" → "));
});
