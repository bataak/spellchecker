import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  createProjectBridge,
  type ProjectBridge,
  type ProjectPort,
} from "../src/collab/projectbridge.ts";
import { projectOf, seedProject } from "../src/collab/projectdoc.ts";

interface Device {
  readonly doc: Y.Doc;
  readonly texts: Map<string, string>;
  readonly dirs: Set<string>;
  main: string | null;
  readonly bridge: ProjectBridge;
  readonly log: string[];
}

function device(texts: Record<string, string>, main: string | null): Device {
  const doc = new Y.Doc();
  const state = {
    texts: new Map(Object.entries(texts)),
    dirs: new Set<string>(),
    main,
  };
  const log: string[] = [];
  const port: ProjectPort = {
    local: () => ({ texts: state.texts, dirs: state.dirs, main: state.main }),
    setText(path, text) {
      log.push("set " + path);
      state.texts.set(path, text);
    },
    async add(path, text) {
      log.push("add " + path);
      if (state.texts.has(path)) throw new Error("taken");
      state.texts.set(path, text);
    },
    async addDir(path) {
      log.push("dir " + path);
      state.dirs.add(path);
    },
    async move(from, to) {
      log.push("move " + from + " " + to);
      for (const [path, text] of [...state.texts])
        if (path === from || path.startsWith(from + "/")) {
          state.texts.delete(path);
          state.texts.set(to + path.slice(from.length), text);
        }
    },
    async remove(path) {
      log.push("remove " + path);
      state.texts.delete(path);
      state.dirs.delete(path);
    },
    setMain(path) {
      log.push("main " + path);
      state.main = path;
    },
  };
  const out = {
    doc,
    texts: state.texts,
    dirs: state.dirs,
    bridge: createProjectBridge(doc, port),
    log,
  } as Device;
  Object.defineProperty(out, "main", {
    get: () => state.main,
    set: (value: string | null) => (state.main = value),
  });
  return out;
}

interface Wire {
  hold: boolean;
  flush(): void;
}

function link(a: Device, b: Device): Wire {
  const queue: [Y.Doc, Uint8Array][] = [];
  const wire: Wire = {
    hold: false,
    flush() {
      for (const [doc, update] of queue.splice(0))
        Y.applyUpdate(doc, update, "net");
    },
  };
  const relay = (to: Y.Doc) => (update: Uint8Array, origin: unknown) => {
    if (origin === "net") return;
    queue.push([to, update]);
    if (!wire.hold) wire.flush();
  };
  a.doc.on("update", relay(b.doc));
  b.doc.on("update", relay(a.doc));
  return wire;
}

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

async function pair(): Promise<[Device, Device, Wire]> {
  const owner = device(
    { "main.tex": "\\documentclass{article}", "ch/one.tex": "Нэг" },
    "main.tex",
  );
  owner.dirs.add("ch");
  seedProject(owner.doc, {
    texts: owner.texts,
    blobs: new Map(),
    dirs: owner.dirs,
    main: owner.main,
  });
  owner.bridge.start();
  const guest = device({}, null);
  Y.applyUpdate(guest.doc, Y.encodeStateAsUpdate(owner.doc));
  const snap = projectOf(guest.doc);
  for (const [path, text] of snap.texts) guest.texts.set(path, text);
  for (const dir of snap.dirs) guest.dirs.add(dir);
  guest.main = snap.main;
  guest.bridge.start();
  return [owner, guest, link(owner, guest)];
}

test("эзний засвар хамтрагчийн төсөлд орно", async () => {
  const [owner, guest] = await pair();
  owner.texts.set("ch/one.tex", "Нэг хоёр");
  owner.bridge.pushLocal();
  await settle();
  assert.equal(guest.texts.get("ch/one.tex"), "Нэг хоёр");
  assert.deepEqual(guest.log, ["set ch/one.tex"]);
  assert.deepEqual(owner.log, []);
});

test("хоёр тал зэрэг засварлахад хоёулангийнх нь засвар үлдэнэ", async () => {
  const [owner, guest, wire] = await pair();
  wire.hold = true;
  owner.texts.set("ch/one.tex", "Эхлэл Нэг");
  owner.bridge.pushLocal();
  guest.texts.set("ch/one.tex", "Нэг Төгсгөл");
  guest.bridge.pushLocal();
  wire.flush();
  await settle();
  assert.equal(owner.texts.get("ch/one.tex"), "Эхлэл Нэг Төгсгөл");
  assert.equal(guest.texts.get("ch/one.tex"), "Эхлэл Нэг Төгсгөл");
});

test("нэр солилт ба шинэ файл, хавтас нөгөө талд очно", async () => {
  const [owner, guest] = await pair();
  const text = owner.texts.get("ch/one.tex")!;
  owner.texts.delete("ch/one.tex");
  owner.texts.set("ch/first.tex", text);
  owner.texts.set("refs.bib", "@book{a}");
  owner.dirs.add("fig");
  owner.bridge.pushLocal();
  await settle();
  assert.deepEqual([...guest.texts.keys()].sort(), [
    "ch/first.tex",
    "main.tex",
    "refs.bib",
  ]);
  assert.ok(guest.log.includes("move ch/one.tex ch/first.tex"));
  assert.ok(guest.log.includes("add refs.bib"));
  assert.ok(guest.dirs.has("fig"));
});

test("нэр солих зуур нөгөө тал засварлавал засвар шинэ нэр дээр үлдэнэ", async () => {
  const [owner, guest, wire] = await pair();
  wire.hold = true;
  const text = owner.texts.get("ch/one.tex")!;
  owner.texts.delete("ch/one.tex");
  owner.texts.set("ch/first.tex", text);
  owner.bridge.pushLocal();
  guest.texts.set("ch/one.tex", text + " нэмэлт");
  guest.bridge.pushLocal();
  wire.flush();
  await settle();
  for (const side of [owner, guest]) {
    assert.equal(side.texts.get("ch/first.tex"), "Нэг нэмэлт");
    assert.equal(side.texts.has("ch/one.tex"), false);
  }
});

test("устгал, үндсэн файлын солилт нөгөө талд очно", async () => {
  const [owner, guest] = await pair();
  guest.texts.set("other.tex", "\\documentclass{book}");
  guest.bridge.pushLocal();
  await settle();
  guest.main = "other.tex";
  guest.texts.delete("ch/one.tex");
  guest.dirs.delete("ch");
  guest.bridge.pushLocal();
  await settle();
  assert.equal(owner.main, "other.tex");
  assert.equal(owner.texts.has("ch/one.tex"), false);
  assert.equal(owner.dirs.has("ch"), false);
  assert.ok(owner.log.includes("remove ch/one.tex"));
});

test("үүсгэсэн файлыг хуваалцахгүй", async () => {
  const [owner, guest] = await pair();
  owner.texts.set("main.log", "log");
  owner.bridge.pushLocal();
  await settle();
  assert.equal(guest.texts.has("main.log"), false);
  assert.equal(projectOf(owner.doc).texts.has("main.log"), false);
});

test("нэр давхцвал орон нутгийн файл хадгалагдана", async () => {
  const [owner, guest] = await pair();
  guest.texts.set("notes.tex", "guest");
  owner.texts.set("notes.tex", "owner");
  owner.bridge.pushLocal();
  await settle();
  assert.equal(guest.texts.get("notes.tex"), "guest");
  assert.ok(guest.log.includes("add notes.tex"));
});

test("зогсоосны дараа синк хийхгүй", async () => {
  const [owner, guest] = await pair();
  guest.bridge.stop();
  owner.texts.set("main.tex", "өөр");
  owner.bridge.pushLocal();
  await settle();
  assert.equal(guest.texts.get("main.tex"), "\\documentclass{article}");
});
