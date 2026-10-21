import "./helpers/mock-storage.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
Object.defineProperty(document, "compatMode", { value: "CSS1Compat" });
const g = globalThis as Record<string, unknown>;
const media = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
g.matchMedia = media;
(dom.window as unknown as Record<string, unknown>).matchMedia = media;
g.self ??= globalThis;

test.after(() => dom.close());

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

const SKIP = new Map([
  ["main.ts", "boots the whole app on import"],
  ["spell/worker.ts", "Web Worker entry"],
  ["tex/svgpdf.ts", "svg2pdf.js has no Node ESM build"],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

test("src дахь модуль бүр Node-д ачаалагдаж, coverage-д тоологдоно", async () => {
  const failed: string[] = [];
  for (const file of walk(SRC)) {
    const name = relative(SRC, file).split("\\").join("/");
    if (SKIP.has(name)) continue;
    try {
      await import(file);
    } catch (error) {
      failed.push(name + ": " + String(error).slice(0, 120));
    }
  }
  assert.deepEqual(failed, []);
});
