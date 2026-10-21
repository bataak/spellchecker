import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<textarea id="ed"></textarea><button id="compile"></button><button id="download"></button>',
);

const { createTexPreview } = await import("../src/preview/texpreview.ts");

test.after(() => dom.close());

function setup() {
  resetStorage();
  const calls: string[] = [];
  const area = document.querySelector<HTMLTextAreaElement>("#ed")!;
  area.value = "\\documentclass{article}\\begin{document}А\\end{document}";
  const compileBtn = document.querySelector<HTMLButtonElement>("#compile")!;
  const preview = createTexPreview({
    area,
    pane: {
      view: () => null,
      shown: () => null,
      drop: () => calls.push("drop"),
    } as never,
    compileBtn,
    downloadBtn: document.querySelector<HTMLButtonElement>("#download")!,
    projectKey: () => null,
    inProject: () => false,
    texProject: () => null,
    visible: () => true,
    showNotice: (text) => calls.push("notice:" + text),
    setError: (message) => calls.push("error:" + message),
    setMissing: (paths) => calls.push("missing:" + paths.length),
    onShown: () => calls.push("shown"),
    onImagesChanged: () => calls.push("images"),
    onModeChange: (auto, note) => calls.push("mode:" + auto + ":" + note),
  });
  return { preview, calls, compileBtn };
}

test("texPreview: auto горимыг сольж хадгална, ижил утгад дуудахгүй", () => {
  const { preview, calls } = setup();
  assert.equal(preview.auto(), true);
  preview.setAuto(false, "удаан");
  preview.setAuto(false);
  assert.equal(preview.auto(), false);
  assert.deepEqual(calls, ["mode:false:удаан"]);
  assert.equal(localStorage.getItem("tex-auto"), "0");
  preview.destroy();
});

test("texPreview: идэвхжүүлэхэд төлөвийг цэвэрлэж, давтан дуудлагад false буцаана", () => {
  const { preview, calls, compileBtn } = setup();
  compileBtn.disabled = true;
  assert.equal(preview.active(), false);
  assert.equal(preview.setActive(true), true);
  assert.equal(preview.setActive(true), false);
  assert.equal(preview.active(), true);
  assert.equal(compileBtn.disabled, false);
  assert.ok(calls.includes("error:null"));
  assert.ok(calls.includes("missing:0"));
  assert.equal(preview.pending(), true);
  preview.setActive(false);
  assert.equal(preview.pending(), false);
  preview.destroy();
});

test("texPreview: идэвхгүй үед compileNow зөвхөн гар горимд шилжүүлнэ", () => {
  const { preview, calls } = setup();
  preview.compileNow();
  assert.equal(preview.auto(), false);
  assert.deepEqual(calls, ["mode:false:null"]);
  preview.destroy();
});
