import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<textarea id="ed"></textarea>');

const { createOfficeSession } = await import("../src/office/session.ts");
const { parse } = await import("../src/markdown.ts");
const { findTemplate } = await import("../src/doc/templates.ts");
const { applyTemplate } = await import("../src/office/apply.ts");
const { buildDocx } = await import("../src/office/docx/create.ts");

test.after(() => dom.close());

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function docx(): File {
  const doc = applyTemplate(parse("Монгол улс"), findTemplate("report")!);
  return new File([buildDocx(doc, { toc: false })], "a.docx", {
    type: DOCX_TYPE,
  });
}

function setup() {
  const area = document.querySelector<HTMLTextAreaElement>("#ed")!;
  area.value = "";
  area.readOnly = false;
  document.body.classList.remove("docx-mode");
  const calls: string[] = [];
  const session = createOfficeSession({
    editor: {
      el: area,
      replace: async (text: string) => {
        calls.push("replace");
        area.value = text;
      },
      settle: async () => {
        calls.push("settle");
      },
    } as never,
    status: {
      set: (html: string) => calls.push("set:" + html),
      hold: (html: string) => calls.push("hold:" + html),
      release: () => calls.push("release"),
    } as never,
    showSource: (source) =>
      calls.push(
        "source:" + source.kind + ":" + ("name" in source ? source.name : ""),
      ),
    baseline: () => calls.push("baseline"),
    syncFixButtons: () => calls.push("fix"),
    onModeChange: () => calls.push("mode"),
  });
  return { area, calls, session };
}

test("officeSession: docx-ийг уншаад засвар хийх боломжгүй горимд харуулна", async () => {
  const { area, calls, session } = setup();
  const file = docx();
  assert.equal(await session.open(file), true);
  assert.equal(session.active()?.format, "docx");
  assert.equal(session.file(), file);
  assert.equal(area.readOnly, true);
  assert.match(area.value, /Монгол улс/);
  assert.ok(document.body.classList.contains("docx-mode"));
  for (const step of ["baseline", "source:office:a.docx", "mode", "fix"])
    assert.ok(calls.includes(step), step);
  session.close();
  await session.settled();
  assert.equal(session.active(), null);
  assert.equal(area.readOnly, false);
  assert.equal(document.body.classList.contains("docx-mode"), false);
});

test("officeSession: хадгалсан засвартай нээж, сэргээж чадахгүй бол мэдэгдэнэ", async () => {
  const restored = setup();
  await restored.session.open(docx(), "Монгол Улс\n\n1");
  assert.match(restored.area.value, /Монгол Улс/);
  const lost = setup();
  await lost.session.open(docx(), "огт\nөөр\nбичвэр\nмөрүүд");
  assert.ok(lost.calls.includes("hold:Өмнөх засваруудыг сэргээж чадсангүй"));
  lost.session.park("slot-1");
  await lost.session.settled();
  assert.equal(lost.session.active(), null);
  lost.session.park("slot-2");
});

test("officeSession: танихгүй, эвдэрсэн, цуцлагдсан файлыг зохицуулна", async () => {
  const { calls, session } = setup();
  assert.equal(await session.open(new File(["x"], "a.txt")), false);
  assert.equal(
    await session.open(new File(["not a zip"], "b.docx", { type: DOCX_TYPE })),
    true,
  );
  assert.ok(calls.some((call) => call.startsWith("hold:")));
  assert.equal(await session.open(docx(), undefined, () => true), true);
  assert.equal(session.active(), null);
  assert.equal(await session.save(), false);
  assert.equal(await session.restore("a.docx"), false);
});

test("officeSession: queue алдаатай ажлыг алгасаад дараагийнхыг гүйцэтгэнэ", async () => {
  const { session } = setup();
  const order: string[] = [];
  session.queue(async () => {
    order.push("a");
    throw new Error("x");
  });
  session.queue(async () => {
    order.push("b");
  });
  await session.settled();
  assert.deepEqual(order, ["a", "b"]);
});
