import test from "node:test";
import assert from "node:assert/strict";

import { createCheckLoop, type CheckLoopDeps } from "../src/app/checkloop.ts";
import type { DocStatus } from "../src/app/docstatus.ts";
import type { MarkLayer } from "../src/marklayer.ts";
import type { SpellSession } from "../src/spell/spellsession.ts";
import type { Token } from "../src/spell/textcheck.ts";

(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
  cb: () => void,
) => setTimeout(cb, 0);

interface Rig {
  readonly calls: string[];
  readonly editor: { value: string; scrollTop: number };
  readonly gates: (() => void)[];
  ready: boolean;
  gated: boolean;
  readonly deps: CheckLoopDeps;
}

function rig(): Rig {
  const calls: string[] = [];
  const editor = { value: "", scrollTop: 0 };
  const gates: (() => void)[] = [];
  const state = { ready: true, gated: false };
  const bad = (text: string): Token[] =>
    text.includes("алдаа")
      ? [{ word: "алдаа", start: text.indexOf("алдаа"), end: 0 } as Token]
      : [];
  const spell = {
    clear: () => calls.push("clear"),
    ensureChecked: (text: string) =>
      state.gated
        ? new Promise<void>((resolve) =>
            gates.push(() => {
              calls.push("checked:" + text);
              resolve();
            }),
          )
        : Promise.resolve(),
    computeBad: (text: string) => ({
      bad: bad(text),
      total: text.split(/\s+/).filter(Boolean).length,
    }),
  } as unknown as SpellSession;
  const marks = {
    show: (text: string, list: Token[]) =>
      calls.push(`show:${text}:${list.length}`),
    follow: () => calls.push("follow"),
    shift: (text: string) => calls.push("shift:" + text),
  } as unknown as MarkLayer;
  const docStatus = {
    ready: () => state.ready,
    update: (s: { words: number; bad: number; chars: number }) =>
      calls.push(`stats:${s.words}/${s.bad}/${s.chars}`),
  } as unknown as DocStatus;
  const deps: CheckLoopDeps = {
    editor: editor as unknown as HTMLTextAreaElement,
    spell,
    marks,
    docStatus,
    prepare: (text) => calls.push("prepare:" + text),
    unready: (text) => calls.push("unready:" + text),
    painted: (text, list) => calls.push(`painted:${text}:${list.length}`),
    setText: (text) => {
      calls.push("set:" + text);
      editor.value = text;
      editor.scrollTop = 0;
      return text.length > 3
        ? { start: 0, oldEnd: 0, newEnd: text.length }
        : null;
    },
    hidePopover: () => calls.push("hide"),
    save: () => calls.push("save"),
    propagate: async () => void calls.push("propagate"),
    syncScroll: () => calls.push("scroll"),
  };
  return Object.assign(state, { calls, editor, gates, deps }) as Rig;
}

test("checkLoop: бэлэн бус үед тэмдэглэгээгүй харуулна", async () => {
  const r = rig();
  r.ready = false;
  r.editor.value = "үг";
  await createCheckLoop(r.deps).render();
  assert.deepEqual(r.calls, ["prepare:үг", "show:үг:0", "unready:үг"]);
});

test("checkLoop: шалгаад алдааг будаж статистик шинэчилнэ", async () => {
  const r = rig();
  r.editor.value = "нэг алдаа";
  await createCheckLoop(r.deps).render();
  assert.deepEqual(r.calls, [
    "prepare:нэг алдаа",
    "show:нэг алдаа:1",
    "follow",
    "painted:нэг алдаа:1",
    "stats:2/1/9",
  ]);
});

test("checkLoop: хуучирсан render будахгүй", async () => {
  const r = rig();
  r.gated = true;
  const loop = createCheckLoop(r.deps);
  r.editor.value = "эхний";
  const first = loop.render();
  r.editor.value = "дараах";
  const second = loop.render();
  r.gates.forEach((open) => open());
  await Promise.all([first, second]);
  assert.deepEqual(
    r.calls.filter((c) => c.startsWith("painted")),
    ["painted:дараах:0"],
  );
});

test("checkLoop: recheckAll кэшийг цэвэрлэнэ, recheck тараагаад хадгална", async () => {
  const r = rig();
  const loop = createCheckLoop(r.deps);
  await loop.recheckAll();
  assert.equal(r.calls[0], "clear");
  r.calls.length = 0;
  await loop.recheck();
  assert.deepEqual(r.calls.slice(-2), ["propagate", "save"]);
});

test("checkLoop: commit скроллыг хадгалж тэмдэглэгээг шилжүүлнэ", async () => {
  const r = rig();
  r.editor.scrollTop = 120;
  await createCheckLoop(r.deps).commit("шинэ үг", 3);
  assert.equal(r.editor.scrollTop, 120);
  assert.deepEqual(r.calls.slice(0, 4), [
    "hide",
    "set:шинэ үг",
    "shift:шинэ үг",
    "scroll",
  ]);
  assert.equal(r.calls.at(-1), "save");
});

test("checkLoop: засвар буцаагаагүй commit тэмдэглэгээ шилжүүлэхгүй", async () => {
  const r = rig();
  await createCheckLoop(r.deps).commit("үг", 0);
  assert.equal(r.calls.filter((c) => c.startsWith("shift")).length, 0);
});

test("checkLoop: том бичвэрт тусгаарлагчийн дараах шалгалтыг хойшлуулна", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const r = rig();
  r.editor.value = "а ".repeat(30_000);
  const loop = createCheckLoop(r.deps);
  await loop.recheckAfterSeparator();
  assert.deepEqual(r.calls, ["propagate"]);
  t.mock.timers.tick(250);
  assert.ok(r.calls.includes("save"));
  assert.ok(r.calls.some((c) => c.startsWith("prepare")));
});
