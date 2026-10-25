import "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";
import { FakeDir } from "./helpers/fake-fs.ts";

const PAGE =
  '<main class="workspace"><div class="editor-wrap"><textarea id="editor"></textarea>' +
  '<div class="editor-tools"></div></div></main>';
const dom = installDom(PAGE);
(globalThis as { confirm?: unknown }).confirm = () => true;
(dom.window as unknown as { confirm: () => boolean }).confirm = () => true;

const { createProjectStore } = await import("../src/project/projectstore.ts");
const { initProjectLink } = await import("../src/project/projectlink.ts");

test.after(() => dom.close());

const MAIN =
  "\\documentclass{article}\n\\begin{document}\nСайн\n\\end{document}\n";

async function setup() {
  document.body.innerHTML = PAGE;
  const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
  const store = createProjectStore();
  const events: string[] = [];
  let slot = "file-1";
  let fileName: string | null = null;
  const link = initProjectLink({
    store,
    editor,
    host: {
      workspace: document.querySelector<HTMLElement>(".workspace")!,
      tools: () => document.querySelector<HTMLElement>(".editor-tools"),
      openButton: null,
      fileButton: null,
      fileTypes: "",
      texActive: () => true,
      layout: () => {},
      show: () => {},
    },
    slots: {
      current: () => slot,
      inProject: () => slot === "project",
      enterProject: () => {
        slot = "project";
        events.push("enter");
      },
      close: (id) => events.push("close:" + id),
      files: () => [],
    },
    file: {
      name: () => fileName,
      handle: () => null,
      bind: (name) => {
        fileName = name;
        events.push("file:" + name);
      },
    },
    onBound: (on) => events.push("bound:" + on),
    afterSwitch: () => {},
    onChange: () => {},
    onProject: (name) => events.push("project:" + name),
    notify: (message) => events.push("notify:" + message),
  });
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("ch/a.tex", "Бүлэг А");
  await link.openDir(root.asHandle());
  return { editor, store, link, events, root };
}

test("projectLink: хавтас нээхэд үндсэн файлыг засварлагчид холбоно", async () => {
  const { editor, link, events } = await setup();
  assert.equal(editor.value, MAIN);
  assert.equal(link.bound(), true);
  assert.equal(link.path(), "main.tex");
  assert.ok(events.includes("enter"));
  assert.ok(events.includes("project:төсөл"));
  assert.ok(events.includes("file:main.tex"));
});

test("projectLink: засвар төсөлд хадгалагдаж, мод дээр дарахад файл солигдоно", async () => {
  const { editor, store, link } = await setup();
  editor.value = MAIN + "% засвар\n";
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.equal(store.projectText("main.tex"), MAIN + "% засвар\n");
  assert.ok(store.project()?.dirty.has("main.tex"));

  const row = document.querySelector<HTMLElement>(
    '.project-row[data-path="ch/a.tex"]',
  );
  assert.ok(row, "мод зурагдсан байх ёстой");
  row.click();
  assert.equal(link.path(), "ch/a.tex");
  assert.equal(editor.value, "Бүлэг А");
  assert.equal(store.projectText("main.tex"), MAIN + "% засвар\n");
});

test("projectLink: хаахад холбоос салж, төсөлгүй болно", async () => {
  const { link, events, store } = await setup();
  link.close();
  assert.equal(store.project(), null);
  assert.equal(link.bound(), false);
  assert.ok(events.includes("project:null"));
});

test("projectLink: дискэн дээрх зөрчлийг мэдэгдэнэ", async () => {
  const { editor, store, events, root } = await setup();
  editor.value = "миний засвар";
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
  root.put("main.tex", MAIN + "% гаднаас нэмсэн мөр\n");
  await store.refreshProject();
  const notice = events.find((event) => event.startsWith("notify:«main.tex»"));
  assert.ok(notice, events.join(" | "));
  assert.equal(editor.value, "миний засвар");
});

test("projectLink: хуваалцсан төслийг нээж, буцааж хаана", async () => {
  const { link, store } = await setup();
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
  const ok = link.openShared(
    { name: "Хамтын", files: [["main.tex", encode(MAIN)]], dirs: new Set() },
    "croom",
    "main.tex",
  );
  assert.equal(ok, true);
  assert.equal(store.project()?.uid, "croom");
  assert.equal(
    link.openShared({ name: "Буруу", files: [], dirs: new Set() }, "x", null),
    false,
  );
  link.drop();
  assert.equal(store.project(), null);
});
