import "./helpers/mock-storage.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectStore } from "../src/project/projectstore.ts";
import type { ProjectLink } from "../src/project/projectlink.ts";
import type { LoadedFiles } from "../src/project/projectsources.ts";

(globalThis as { window?: unknown }).window ??= globalThis;
(globalThis as { confirm?: unknown }).confirm = () => true;

const { createProjectCollab } = await import("../src/app/collabwiring.ts");

const MAIN =
  "\\documentclass{article}\n\\begin{document}\nА\n\\end{document}\n";
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function setup(fails = 0) {
  const store = createProjectStore();
  const opened: LoadedFiles[] = [];
  let left = fails;
  const project = {
    path: () => null,
    openShared(loaded: LoadedFiles, uid: string, main: string | null) {
      if (left-- > 0) return false;
      opened.push(loaded);
      store.openShared(loaded, uid, main);
      return true;
    },
  } as unknown as ProjectLink;
  return { store, opened, collab: createProjectCollab({ store, project }) };
}

test("төслийн hooks зөвхөн өөрийн uid-тай төсөлд бичнэ", async () => {
  const { store, collab } = setup();
  store.openShared(
    { name: "Т", files: [["main.tex", encode(MAIN)]], dirs: new Set() },
    "own",
    "main.tex",
  );
  assert.equal(collab.uid(), "own");
  const mine = collab.hooks("own", true);
  const other = collab.hooks("other", false);
  assert.equal(other.port.local(), null);
  assert.equal(other.active(), null);
  assert.equal(other.seed, null);
  other.port.setText("main.tex", "өөр");
  await other.port.add("x.tex", "x");
  assert.equal(store.projectText("main.tex"), MAIN);
  assert.equal(store.projectText("x.tex"), null);
  assert.equal(mine.active(), "main.tex");
  mine.port.setText("main.tex", MAIN + "%");
  await mine.port.add("ch.tex", "бүлэг");
  await mine.port.addDir("fig");
  await mine.port.move("ch.tex", "fig/ch.tex");
  mine.port.setMain("main.tex");
  assert.equal(store.projectText("fig/ch.tex"), "бүлэг");
  await mine.port.remove("fig/ch.tex");
  assert.equal(store.projectText("fig/ch.tex"), null);
  const snap = await mine.seed?.();
  assert.equal(snap?.texts.get("main.tex"), MAIN + "%");
  assert.ok(snap?.dirs.has("fig"));
  let heard = 0;
  const off = mine.changed(() => heard++);
  mine.port.setText("main.tex", MAIN);
  off();
  assert.ok(heard > 0);
  assert.equal(mine.create(snap!), true);
});

test("урилгаар бэлдсэн uid-д л шинэ төсөл үүсгэнэ", () => {
  const { store, opened, collab } = setup();
  const snap = {
    texts: new Map([["main.tex", MAIN]]),
    blobs: new Map(),
    dirs: new Set<string>(),
    main: "main.tex",
  };
  assert.equal(collab.hooks("cother", false).create(snap), false);
  assert.equal(collab.prepare("Хамтын", "croom"), true);
  assert.equal(collab.hooks("croom", false).create(snap), true);
  assert.equal(opened[0]?.name, "Хамтын");
  assert.equal(store.projectFiles()?.uid, "croom");
});

test("төсөл нээж чадаагүй бол дараагийн оролдлогоор дахин нээнэ, хоёр урилгыг тусад нь санана", () => {
  const { store, opened, collab } = setup(1);
  const snap = {
    texts: new Map([["main.tex", MAIN]]),
    blobs: new Map(),
    dirs: new Set<string>(),
    main: "main.tex",
  };
  assert.equal(collab.prepare("Нэг", "cone"), true);
  assert.equal(collab.prepare("Хоёр", "ctwo"), true);
  assert.equal(collab.hooks("cone", false).create(snap), false);
  assert.equal(collab.hooks("cone", false).create(snap), true);
  assert.equal(opened[0]?.name, "Нэг");
  assert.equal(collab.hooks("ctwo", false).create(snap), true);
  assert.equal(opened[1]?.name, "Хоёр");
  assert.equal(store.projectFiles()?.uid, "ctwo");
});
