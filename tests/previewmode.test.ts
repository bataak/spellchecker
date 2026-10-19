import { test } from "node:test";
import assert from "node:assert/strict";
import { createPreviewMode } from "../src/ui/previewmode.ts";

const setup = (text = "") => {
  const state = {
    text,
    pane: false,
    body: false,
    layout: null as null | [boolean, boolean, boolean],
  };
  const mode = createPreviewMode({
    hasText: () => state.text.length > 0,
    setPaneAvailable: (on) => (state.pane = on),
    setBodyMode: (on) => (state.body = on),
    setLayout: (blocked, wanted, tex) =>
      (state.layout = [blocked, wanted, tex]),
  });
  return { state, mode };
};

test("previewmode markdown болон tex горимд харагдацыг хүснэ", () => {
  const { state, mode } = setup("# a");
  mode.enter(true, false);
  assert.deepEqual(state.layout, [false, true, false]);
  assert.equal(state.pane, true);
  assert.equal(state.body, true);
  mode.enter(false, true);
  assert.deepEqual(state.layout, [false, true, true]);
  mode.enter(false, false);
  assert.deepEqual(state.layout, [true, false, false]);
  assert.equal(state.pane, false);
  assert.equal(state.body, false);
});

test("previewmode хоосон бичвэрт солих товчийг нуудаг", () => {
  const { state, mode } = setup("");
  mode.enter(true, false);
  assert.equal(state.pane, false);
  state.text = "a";
  mode.textChanged();
  assert.equal(state.pane, true);
});

test("previewmode цэвэрлэсний дараа бичих хүртэл харагдацыг нууна", () => {
  const { state, mode } = setup("a");
  mode.enter(true, false);
  state.text = "";
  mode.cleared();
  assert.equal(state.body, false);
  mode.textChanged();
  assert.equal(state.body, false);
  state.text = "b";
  mode.textChanged();
  assert.equal(state.body, true);
});

test("previewmode загвар солиход цэвэрлэсэн төлөвийг арилгана", () => {
  const { state, mode } = setup("");
  mode.enter(true, false);
  mode.cleared();
  mode.templateChanged();
  mode.enter(true, false);
  assert.equal(state.body, true);
});
