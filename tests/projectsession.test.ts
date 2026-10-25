import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  createProjectAttacher,
  seedProjectDoc,
  type ProjectHooks,
} from "../src/collab/projectsession.ts";
import { projectOf, seedProject } from "../src/collab/projectdoc.ts";
import type { ProjectSnapshot } from "../src/collab/projectdoc.ts";
import type { Cursors } from "../src/collab/cursors.ts";
import type { LocalProject } from "../src/collab/projectbridge.ts";

const MAIN = "\\documentclass{article}";

interface Fake {
  readonly hooks: ProjectHooks;
  readonly texts: Map<string, string>;
  readonly created: ProjectSnapshot[];
  local: boolean;
  fire(): void;
  listeners(): number;
}

function fake(local: boolean, accept = true): Fake {
  const texts = new Map<string, string>([["main.tex", MAIN]]);
  const created: ProjectSnapshot[] = [];
  const listeners = new Set<() => void>();
  const state = { local };
  const project = (): LocalProject => ({
    texts,
    dirs: new Set(),
    main: "main.tex",
  });
  const hooks: ProjectHooks = {
    port: {
      local: () => (state.local ? project() : null),
      setText: (path, text) => void texts.set(path, text),
      add: async (path, text) => void texts.set(path, text),
      addDir: async () => {},
      move: async () => {},
      remove: async (path) => void texts.delete(path),
      setMain: () => {},
    },
    active: () => "main.tex",
    seed: async () => ({
      texts,
      blobs: new Map(),
      dirs: new Set<string>(),
      main: "main.tex",
    }),
    create(snap) {
      created.push(snap);
      if (accept) {
        state.local = true;
        for (const [path, text] of snap.texts) texts.set(path, text);
      }
      return accept;
    },
    changed(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    hooks,
    texts,
    created,
    get local() {
      return state.local;
    },
    set local(value) {
      state.local = value;
    },
    fire: () => listeners.forEach((listener) => listener()),
    listeners: () => listeners.size,
  };
}

function cursorLog(): { cursors: Cursors; log: boolean[] } {
  const log: boolean[] = [];
  const cursors = {
    setActive: (on: boolean) => log.push(on),
  } as unknown as Cursors;
  return { cursors, log };
}

test("төслийн баримтыг зөвхөн хоосон үед эхний хувилбараар дүүргэнэ", async () => {
  const { hooks } = fake(true);
  const doc = new Y.Doc();
  assert.equal(await seedProjectDoc(doc, hooks), true);
  assert.equal(projectOf(doc).texts.get("main.tex"), MAIN);
  assert.equal(await seedProjectDoc(doc, hooks), false);
  assert.equal(
    await seedProjectDoc(new Y.Doc(), { ...hooks, seed: null }),
    false,
  );
  assert.equal(
    await seedProjectDoc(new Y.Doc(), { ...hooks, seed: async () => null }),
    false,
  );
});

test("хуучин өрөөнд орон нутгийн засвар баримтад шууд орно", () => {
  const side = fake(true);
  const doc = new Y.Doc();
  seedProject(doc, {
    texts: side.texts,
    blobs: new Map(),
    dirs: new Set(),
    main: "main.tex",
  });
  const { cursors, log } = cursorLog();
  const binding = createProjectAttacher(doc, side.hooks, cursors, false);
  side.texts.set("main.tex", MAIN + "\nшинэ");
  side.fire();
  assert.equal(projectOf(doc).texts.get("main.tex"), MAIN + "\nшинэ");
  binding.attach();
  binding.detach();
  assert.deepEqual(log, [true, false]);
  binding.destroy();
  assert.equal(side.listeners(), 0);
});

test("уригдсан хүнд баримт ирэхэд төслийг үүсгэнэ", () => {
  const owner = fake(true);
  const doc = new Y.Doc();
  const guest = fake(false);
  guest.texts.clear();
  const binding = createProjectAttacher(
    doc,
    guest.hooks,
    cursorLog().cursors,
    true,
  );
  binding.settle();
  assert.equal(guest.created.length, 0);
  seedProject(doc, {
    texts: owner.texts,
    blobs: new Map(),
    dirs: new Set(),
    main: "main.tex",
  });
  binding.settle();
  assert.equal(guest.created.length, 1);
  assert.equal(guest.texts.get("main.tex"), MAIN);
  assert.equal(guest.listeners(), 1);
  binding.destroy();
});

test("төсөл үүсгэхээс татгалзвал синк эхлэхгүй", () => {
  const owner = fake(true);
  const doc = new Y.Doc();
  seedProject(doc, {
    texts: owner.texts,
    blobs: new Map(),
    dirs: new Set(),
    main: "main.tex",
  });
  const guest = fake(false, false);
  const binding = createProjectAttacher(
    doc,
    guest.hooks,
    cursorLog().cursors,
    true,
  );
  binding.settle();
  assert.equal(guest.created.length, 1);
  assert.equal(guest.listeners(), 0);
  binding.destroy();
});
