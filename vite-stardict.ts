import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import type { Plugin, ViteDevServer } from "vite";
import {
  applyOrder,
  collectDicts,
  parseOrder,
  type DictListEntry,
} from "./src/dictindex.ts";

const DIR = "public/dict/stardict";
const VIRTUAL_ID = "virtual:stardict-index";
const RESOLVED_ID = "\0" + VIRTUAL_ID;
const ORDER_FILE = "order.txt";
const PARTS = [".ifo", ".idx", ".idx.gz", ".dict.dz", ".dict", ".syn", ".syn.gz"];

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function fingerprint(base: string): string {
  const hash = createHash("sha256");
  for (const part of PARTS) {
    const path = DIR + "/" + base + part;
    try {
      const stat = statSync(path);
      hash.update(part + ":" + String(stat.size) + ";");
      if (part === ".ifo") hash.update(readFileSync(path));
    } catch {}
  }
  return hash.digest("hex").slice(0, 16);
}

const MAX_DEPTH = 3;

function walk(dir: string, prefix = "", depth = 0): string[] {
  let entries: { name: string; dir: boolean }[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((item) => ({
      name: item.name,
      dir: item.isDirectory(),
    }));
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix + entry.name;
    if (!entry.dir) {
      out.push(rel);
      continue;
    }
    if (depth >= MAX_DEPTH) continue;
    out.push(...walk(dir + "/" + entry.name, rel + "/", depth + 1));
  }
  return out;
}

export function scanStarDicts(): DictListEntry[] {
  const names = walk(DIR);
  if (!names.length) return [];
  const dicts = collectDicts(
    names,
    (base) => readText(DIR + "/" + base + ".ifo"),
    fingerprint,
  );
  const order = readText(DIR + "/" + ORDER_FILE);
  return order ? applyOrder(dicts, parseOrder(order)) : dicts;
}

export function stardictIndex(): Plugin {
  let server: ViteDevServer | null = null;
  const invalidate = (path: string): void => {
    if (!server || !path.includes("dict/stardict/")) return;
    const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
    if (mod) server.moduleGraph.invalidateModule(mod);
    server.ws.send({ type: "full-reload" });
  };
  return {
    name: "stardict-index",
    resolveId(id: string) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id: string) {
      if (id !== RESOLVED_ID) return null;
      return "export default " + JSON.stringify(scanStarDicts()) + ";";
    },
    configureServer(dev: ViteDevServer) {
      server = dev;
      dev.watcher.add(DIR);
      dev.watcher.on("add", invalidate);
      dev.watcher.on("unlink", invalidate);
      dev.watcher.on("change", invalidate);
    },
  };
}
