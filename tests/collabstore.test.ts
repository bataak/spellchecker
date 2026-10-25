import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { inflateSync } from "fflate";
import { dropDoc, loadDoc, saveDoc } from "../src/collab/docstore.ts";
import { openDoc } from "../src/collab/roomdoc.ts";
import { createSaver, createUploader } from "../src/collab/persistence.ts";
import { importKey, newLink, unseal } from "../src/collab/collabkey.ts";
import { projectOf } from "../src/collab/projectdoc.ts";
import type { ProjectHooks } from "../src/collab/projectsession.ts";

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function stateOf(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText("t").insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

test("өрөөний баримтыг хадгалж, ачаалж, устгана", async () => {
  assert.equal(await loadDoc("store-a"), null);
  await saveDoc("store-a", stateOf("сайн"));
  const loaded = await loadDoc("store-a");
  const doc = new Y.Doc();
  Y.applyUpdate(doc, loaded!);
  assert.equal(doc.getText("t").toString(), "сайн");
  await dropDoc("store-a");
  assert.equal(await loadDoc("store-a"), null);
});

test("шинэ өрөөг эхний бичвэрээр, хадгалсан өрөөг санах ойгоос нээнэ", async () => {
  const seeded = await openDoc("open-a", () => "эх", null);
  assert.equal(seeded.doc.getText("t").toString(), "эх");
  assert.equal(seeded.fresh, false);
  const empty = await openDoc("open-b", null, null);
  assert.equal(empty.fresh, true);
  await saveDoc("open-c", stateOf("хадгалсан"));
  const stored = await openDoc("open-c", () => "үл хэрэглэгдэнэ", null);
  assert.equal(stored.doc.getText("t").toString(), "хадгалсан");
  assert.equal(stored.fresh, false);
});

test("төслийн өрөөг төслийн эхний хувилбараар нээнэ", async () => {
  const hooks = {
    seed: async () => ({
      texts: new Map([["main.tex", "\\documentclass{article}"]]),
      blobs: new Map(),
      dirs: new Set<string>(),
      main: "main.tex",
    }),
  } as unknown as ProjectHooks;
  const opened = await openDoc("open-project", null, hooks);
  assert.equal(opened.fresh, false);
  assert.equal(projectOf(opened.doc).main, "main.tex");
  const guest = await openDoc("open-guest", null, {
    ...hooks,
    seed: null,
  });
  assert.equal(guest.fresh, true);
});

test("saver засварыг хойшлуулж эсвэл шууд хадгална", async () => {
  const doc = new Y.Doc();
  const saver = createSaver(doc, "saver-a");
  doc.getText("t").insert(0, "нэг");
  saver.soon();
  saver.now();
  await wait(20);
  assert.ok(await loadDoc("saver-a"));
  saver.soon();
  saver.cancel();
  saver.now();
});

test("uploader шифрлэсэн snapshot илгээж, том бол нэг удаа сануулна", async () => {
  const link = newLink();
  const key = await importKey(link.key);
  const doc = new Y.Doc();
  doc.getText("t").insert(0, "хуваалцах");
  const sent: Uint8Array[] = [];
  let allowed = false;
  let warned = 0;
  const uploader = createUploader(
    {
      doc,
      key,
      allowed: () => allowed,
      send: (data) => (sent.push(data), true),
      tooLarge: () => warned++,
    },
    false,
  );
  assert.equal(uploader.dirty(), false);
  uploader.mark();
  assert.equal(uploader.dirty(), true);
  await uploader.run();
  assert.equal(sent.length, 0);
  allowed = true;
  await uploader.run();
  assert.equal(sent.length, 1);
  assert.equal(uploader.dirty(), false);
  const plain = await unseal(key, sent[0]!);
  const copy = new Y.Doc();
  Y.applyUpdate(copy, inflateSync(plain!));
  assert.equal(copy.getText("t").toString(), "хуваалцах");
  uploader.schedule();
  uploader.cancel();
  const noise = crypto.getRandomValues(new Uint8Array(65536));
  let big = "";
  for (let i = 0; i < 160; i++)
    big += Array.from(noise, (b) => b.toString(36)).join("");
  doc.getText("t").insert(0, big);
  uploader.force();
  await wait(50);
  await uploader.run();
  assert.equal(warned, 1);
  assert.equal(sent.length, 1);
  uploader.cancel();
});
