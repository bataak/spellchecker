import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { createSync } from "../src/collab/sync.ts";
import {
  MAX_MESSAGE,
  SYNC_PACKED,
  SYNC_REQUEST,
  SYNC_UPDATE,
  chunk,
  createAssembler,
  encodeFrame,
} from "../src/collab/wire.ts";

function link(from: Y.Doc, to: Y.Doc) {
  const sent: number[] = [];
  const assembler = createAssembler(MAX_MESSAGE);
  const target = createSync({
    doc: to,
    open: () => ["a"],
    send: () => {},
    onCursor: () => {},
  });
  const source = createSync({
    doc: from,
    open: () => ["b"],
    send: (_peer, data) => {
      sent.push(data[0]!);
      for (const piece of chunk(data)) {
        const whole = assembler.push(piece);
        if (whole) target.receive("a", whole);
      }
    },
    onCursor: () => {},
  });
  return { sent, source };
}

const request = (doc: Y.Doc): Uint8Array =>
  encodeFrame(SYNC_REQUEST, Y.encodeStateVector(doc));

test("sync: жижиг төлөв хуучин хэлбэрээрээ дамжина", () => {
  const from = new Y.Doc();
  const to = new Y.Doc();
  from.getText("t").insert(0, "Сайн байна уу");
  const { sent, source } = link(from, to);
  source.receive("b", request(to));
  assert.deepEqual(sent, [SYNC_UPDATE]);
  assert.equal(to.getText("t").toString(), "Сайн байна уу");
});

test("sync: 8 MB-аас том төлөв шахагдаж хүлээн авагчид бүтэн хүрнэ", () => {
  const from = new Y.Doc();
  const to = new Y.Doc();
  const text = "монгол ".repeat(1_000_000);
  from.getText("t").insert(0, text);
  assert.ok(Y.encodeStateAsUpdate(from).byteLength > MAX_MESSAGE);
  const { sent, source } = link(from, to);
  source.receive("b", request(to));
  assert.deepEqual(sent, [SYNC_PACKED]);
  assert.equal(to.getText("t").toString(), text);
});

test("sync: шахсан ч багтахгүй төлөвийг илгээхгүй", () => {
  const from = new Y.Doc();
  const codes = new Uint16Array(6_000_000);
  for (let at = 0; at < codes.length; at += 32768)
    crypto.getRandomValues(codes.subarray(at, at + 32768));
  const text = Array.from(codes, (code) =>
    String.fromCharCode(0x4e00 + (code % 0x5000)),
  ).join("");
  from.getText("t").insert(0, text);
  const to = new Y.Doc();
  const { sent, source } = link(from, to);
  source.receive("b", request(to));
  assert.deepEqual(sent, []);
});

test("sync: эвдэрсэн шахалт баримтыг өөрчлөхгүй", () => {
  const doc = new Y.Doc();
  const sync = createSync({
    doc,
    open: () => [],
    send: () => {},
    onCursor: () => {},
  });
  assert.throws(() =>
    sync.receive(
      "a",
      encodeFrame(SYNC_PACKED, new Uint8Array([1, 2, 3, 4, 5])),
    ),
  );
  assert.equal(doc.getText("t").length, 0);
});
