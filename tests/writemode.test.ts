import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/mock-storage.ts";
import { resetStorage } from "./helpers/mock-storage.ts";
import { installDom } from "./helpers/dom.ts";
import {
  TEX_LAYOUTS,
  writeChoice,
  writeLayout,
  type Layout,
} from "../src/ui/layout.ts";
import {
  createWriteMode,
  isWriteKey,
  writeTools,
  writing,
} from "../src/ui/writemode.ts";

const dom = installDom();
test.after(() => dom.close());

const key = (init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

test("writeLayout: самбар ба урьдчилан харахыг хааж, өргөнийг хадгална", () => {
  assert.deepEqual(writeLayout({ measure: "c", panel: true, preview: true }), {
    measure: "c",
    panel: false,
    preview: false,
  });
});

test("isWriteKey: Ctrl/⌘+Shift+F-ийг таньж, Alt-тайг хүлээж авахгүй", () => {
  const base = {
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    altKey: false,
  };
  assert.ok(isWriteKey({ ...base, ctrlKey: true, key: "F", code: "KeyF" }));
  assert.ok(isWriteKey({ ...base, metaKey: true, key: "Ө", code: "KeyF" }));
  assert.ok(!isWriteKey({ ...base, key: "F", code: "KeyF" }));
  assert.ok(
    !isWriteKey({
      ...base,
      ctrlKey: true,
      altKey: true,
      key: "F",
      code: "KeyF",
    }),
  );
});

test("createWriteMode: товчлолоор асааж унтрааж, төлөвийг хадгална", () => {
  resetStorage();
  const mode = createWriteMode();
  const seen: boolean[] = [];
  mode.onChange((on) => seen.push(on));
  assert.equal(mode.on(), false);

  const press = key({ key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
  document.dispatchEvent(press);
  assert.equal(mode.on(), true);
  assert.ok(press.defaultPrevented);
  assert.equal(document.documentElement.dataset.write, "on");
  mode.destroy();

  const again = createWriteMode();
  assert.equal(again.on(), true);
  again.set(false);
  assert.equal(document.documentElement.dataset.write, undefined);
  assert.deepEqual(seen, [true]);
  again.destroy();
  assert.equal(createWriteMode().on(), false);
});

test("writeTools: Гарах товч горимоос гаргана", () => {
  resetStorage();
  const mode = createWriteMode();
  mode.set(true);
  const tools = document.createElement("div");

  const remove = writeTools(tools, mode, "Ctrl+Shift+F");
  const exit = tools.querySelector<HTMLButtonElement>(".write-tool");
  assert.match(exit!.title, /Ctrl\+Shift\+F/);
  exit!.click();
  assert.equal(mode.on(), false);

  remove();
  assert.equal(tools.querySelectorAll(".write-tool").length, 0);
  mode.destroy();
});

const bare = (measure: Layout["measure"]): Layout => ({
  measure,
  panel: false,
  preview: false,
});

test("writeChoice: PDF-ийг үлдээхэд самбаргүй урьдчилан харах байрлал сонгоно", () => {
  const fit = [...TEX_LAYOUTS];
  const desired: Layout = { measure: "b", panel: true, preview: true };
  assert.deepEqual(writeChoice(fit, desired, false, true).active, {
    measure: "b",
    panel: false,
    preview: true,
  });
  assert.deepEqual(writeChoice(fit, desired, false, false).active, bare("b"));
  assert.deepEqual(writeChoice(fit, desired, true, true).active, bare("b"));
  assert.equal(writeChoice(fit, desired, false, true).avail, fit);
});

test("writeChoice: өргөн PDF-ийг хадгалж, багтахгүй бол хамгийн өргөн бичвэрт буулгана", () => {
  const wide: Layout = {
    measure: "a",
    panel: false,
    preview: true,
    wide: true,
  };
  assert.deepEqual(
    writeChoice([...TEX_LAYOUTS], wide, false, true).active,
    wide,
  );
  const narrow = [bare("a"), bare("b"), { ...bare("a"), panel: true }];
  assert.deepEqual(
    writeChoice(
      narrow,
      { measure: "c", panel: true, preview: false },
      false,
      true,
    ).active,
    bare("b"),
  );
});

test("createWriteMode: төрлийг хадгалж, асаалттай үед өөрчлөхөд мэдэгдэнэ", () => {
  resetStorage();
  const mode = createWriteMode();
  const seen: boolean[] = [];
  mode.onChange((on) => seen.push(on));
  assert.equal(mode.kind(), "pdf");
  mode.setKind("text");
  assert.deepEqual(seen, []);
  mode.set(true);
  assert.equal(writing(), true);
  mode.setKind("pdf");
  mode.setKind("pdf");
  assert.deepEqual(seen, [true, true]);
  mode.setKind("text");
  mode.set(false);
  assert.equal(writing(), false);
  mode.destroy();
  const again = createWriteMode();
  assert.equal(again.kind(), "text");
  again.destroy();
});
