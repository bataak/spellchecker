import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");

const { showForm } = await import("../src/project/git/form.ts");
const { askCommitMessage, askFolder } =
  await import("../src/project/git/gitdialog.ts");
const { ProjectError } = await import("../src/project/projecterror.ts");
const { askMerge } = await import("../src/project/git/mergedialog.ts");

test.after(() => dom.close());

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
const panel = () => document.querySelector<HTMLFormElement>(".git-panel")!;
const submit = () =>
  panel().dispatchEvent(new Event("submit", { cancelable: true }));
const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );

test("showForm: утгуудыг уншиж буцаагаад цонхыг хаана", async () => {
  const changes: string[] = [];
  const result = showForm(
    {
      title: "Гарчиг",
      confirm: "OK",
      more: "Нэмэлт",
      fields: [
        { name: "a", label: "A", value: "1" },
        { name: "b", label: "B", more: true, value: "x" },
        { name: "c", label: "C", more: true },
      ],
      onChange: (values) => changes.push(values.a ?? ""),
    },
    (values) => values.a + values.b + (values.c ?? ""),
  );
  assert.equal(panel().getAttribute("aria-label"), "Гарчиг");
  assert.equal(panel().querySelector("details")!.open, true);
  assert.deepEqual(changes, ["1"]);
  const a = panel().querySelector<HTMLInputElement>('[name="a"]')!;
  a.value = "2";
  a.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(changes, ["1", "2"]);
  submit();
  assert.equal(await result, "2x");
  assert.equal(document.querySelector(".git-panel"), null);
});

test("showForm: Escape, Болих болон гадна дарахад null буцаана", async () => {
  const form = { title: "T", confirm: "OK", fields: [] };
  const first = showForm(form, () => 1);
  key(panel(), { key: "Escape" });
  assert.equal(await first, null);
  const second = showForm(form, () => 1);
  panel().querySelector<HTMLElement>(".export-cancel")!.click();
  assert.equal(await second, null);
  const third = showForm(form, () => 1);
  const overlay = document.querySelector<HTMLElement>(".export-backdrop")!;
  overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  assert.equal(await third, null);
});

test("showForm: удаан ажлын үед түгжиж, алдаа гарвал буцааж нээнэ", async () => {
  let attempt = 0;
  const result = showForm(
    {
      title: "T",
      confirm: "Нээх",
      pending: "Нээж байна…",
      fields: [{ name: "repo", label: "Repo" }],
    },
    async (values, busy) => {
      attempt++;
      await wait();
      busy.say("Татаж байна… 1 / 2");
      await wait();
      if (attempt === 1) throw new ProjectError("Олдсонгүй");
      return values.repo;
    },
  );
  const confirm = panel().querySelector<HTMLButtonElement>(".export-confirm")!;
  const input = panel().querySelector<HTMLInputElement>('[name="repo"]')!;
  input.value = "o/r";
  submit();
  assert.equal(input.disabled, true);
  assert.equal(confirm.textContent, "Нээж байна…");
  await wait();
  assert.equal(confirm.textContent, "Татаж байна… 1 / 2");
  await wait();
  assert.equal(input.disabled, false);
  assert.equal(confirm.textContent, "Нээх");
  const error = panel().querySelector<HTMLElement>(".export-error")!;
  assert.equal(error.hidden, false);
  assert.equal(error.textContent, "Олдсонгүй");
  submit();
  assert.equal(error.hidden, true);
  assert.equal(await result, "o/r");
});

test("askCommitMessage: хоосон тайлбарыг татгалзаж, Ctrl+Enter-ээр илгээнэ", async () => {
  const result = askCommitMessage("  ", "gitlab");
  assert.equal(panel().getAttribute("aria-label"), "GitLab-д commit хийх");
  submit();
  const error = panel().querySelector<HTMLElement>(".export-error")!;
  assert.equal(error.textContent, "Тайлбар бичнэ үү");
  const area = panel().querySelector<HTMLTextAreaElement>("textarea")!;
  area.value = " Засвар ";
  key(area, { key: "Enter", ctrlKey: true });
  assert.equal(await result, "Засвар");
});

test("askFolder: сонгосон хавтсыг буцаана", async () => {
  const result = askFolder(["a", "b/c"]);
  const select = panel().querySelector<HTMLSelectElement>("select")!;
  assert.equal(select.value, "a");
  select.value = "b/c";
  submit();
  assert.equal(await result, "b/c");
});

test("askMerge: зөрчил бүрд сонголт гаргаж, хариултыг файл тус бүрээр буцаана", async () => {
  const result = askMerge(
    [
      {
        path: "main.tex",
        kind: "text",
        conflicts: [
          { ours: ["а"], base: [], theirs: ["б"] },
          { ours: [], base: [], theirs: ["в"] },
        ],
      },
      { path: "fig.png", kind: "file", ours: "deleted", theirs: "changed" },
    ],
    "github",
  );
  const selects = [...panel().querySelectorAll<HTMLSelectElement>("select")];
  assert.deepEqual(
    selects.map((s) => s.name),
    ["main.tex#0", "main.tex#1", "fig.png"],
  );
  assert.match(panel().textContent!, /main\.tex — 2-р зөрчил/);
  assert.match(panel().textContent!, /\(хоосон\)/);
  assert.match(
    panel().textContent!,
    /Минийх: устгасан · GitHub-ийн: өөрчилсөн/,
  );
  selects[0]!.value = "both";
  selects[1]!.value = "theirs";
  selects[2]!.value = "theirs";
  submit();
  const answer = await result;
  assert.deepEqual(answer?.get("main.tex"), ["both", "theirs"]);
  assert.equal(answer?.get("fig.png"), "theirs");
});
