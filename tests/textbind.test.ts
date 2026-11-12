import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { installDom } from "./helpers/dom.ts";
import { bindText } from "../src/collab/textbind.ts";

const dom = installDom("<textarea id=a></textarea>");
test.after(() => dom.close());

test("бүртгэгдээгүй засварын үеэр дараалан ирсэн өөрчлөлт түүнийг давхардуулахгүй", async () => {
  const editor = document.querySelector<HTMLTextAreaElement>("#a")!;
  const doc = new Y.Doc();
  const text = doc.getText("t");
  text.insert(0, "hello world");
  const remote = new Y.Doc();
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
  const updates: Uint8Array[] = [];
  remote.on("update", (update: Uint8Array) => updates.push(update));
  const bind = bindText(editor, text);
  bind.attach();
  editor.value = "hello brave world";
  remote.getText("t").insert(0, "A ");
  remote.getText("t").insert(remote.getText("t").length, " Z");
  for (const update of updates) Y.applyUpdate(doc, update, "net");
  await Promise.resolve();
  assert.equal(editor.value, "A hello brave world Z");
  assert.equal(text.toString(), "A hello brave world Z");
  bind.destroy();
});
