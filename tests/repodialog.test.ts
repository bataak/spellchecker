import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
const g = globalThis as Record<string, unknown>;

const { askRepo } = await import("../src/project/git/repodialog.ts");
const { ProjectError } = await import("../src/project/projecterror.ts");

test.after(() => dom.close());

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
const panel = () => document.querySelector<HTMLFormElement>(".git-panel")!;
const field = <T extends HTMLElement>(name: string) =>
  panel().querySelector<T>(`[name="${name}"]`)!;
const confirm = () =>
  panel().querySelector<HTMLButtonElement>(".export-confirm")!;
const error = () => panel().querySelector<HTMLElement>(".export-error")!;
const submit = () =>
  panel().dispatchEvent(new Event("submit", { cancelable: true }));
const blank = { provider: "github", repo: "", branch: "", dir: "" } as const;

test("askRepo: нэвтрэх тохиргоогүй бол token шаардаж, оруулсан token-оор нээнэ", async () => {
  g.__VITE_ENV__ = { BASE_URL: "/" };
  const opened: unknown[] = [];
  const result = askRepo(
    blank,
    () => null,
    async (choice) => {
      opened.push(choice);
    },
  );
  assert.equal(field("token").closest("label")!.hidden, false);
  assert.equal(confirm().textContent, "Нээх");
  field<HTMLInputElement>("repo").value = "o/r";
  submit();
  assert.equal(error().textContent, "Token оруулна уу");
  field<HTMLInputElement>("token").value = " tok ";
  submit();
  const choice = await result;
  assert.equal(choice?.token, "tok");
  assert.equal(choice?.spec.project, "o/r");
  assert.equal(choice?.spec.host, "https://github.com");
  assert.equal(opened.length, 1);
});

test("askRepo: үйлчилгээтэй таарахгүй серверийн хаягийг татгалзана", async () => {
  g.__VITE_ENV__ = { BASE_URL: "/" };
  const result = askRepo(
    blank,
    () => null,
    async () => {},
  );
  const service = field<HTMLSelectElement>("service");
  service.value = "gitlab";
  service.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(field<HTMLInputElement>("token").placeholder, "glpat-…");
  field<HTMLInputElement>("repo").value = "https://git.example.org/a/b";
  field<HTMLInputElement>("token").value = "t";
  submit();
  assert.match(error().textContent!, /Зөвхөн github\.com болон gitlab\.com/);
  key("Escape");
  assert.equal(await result, null);
});

function key(name: string): void {
  panel().dispatchEvent(
    new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      cancelable: true,
    }),
  );
}

test("askRepo: нэвтрэх боломжтой бол token нууж, хадгалсан token-оор шууд нээнэ", async () => {
  g.__VITE_ENV__ = { BASE_URL: "/", VITE_GITLAB_CLIENT_ID: "client" };
  const saved = new Map([["gitlab https://gitlab.com", "stored"]]);
  const result = askRepo(
    { provider: "gitlab", repo: "group/thesis", branch: "", dir: "" },
    (provider, host) => saved.get(provider + " " + host) ?? null,
    async () => {},
  );
  assert.equal(field("token").closest("label")!.hidden, true);
  assert.equal(confirm().textContent, "Нээх");
  saved.clear();
  field("repo").dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(confirm().textContent, "Нэвтрэх");
  saved.set("gitlab https://gitlab.com", "stored");
  field("repo").dispatchEvent(new Event("input", { bubbles: true }));
  submit();
  const choice = await result;
  assert.equal(choice?.token, "stored");
  assert.equal(choice?.spec.provider, "gitlab");
});

test("askRepo: repo нээж чадахгүй бол цонхыг хаахгүй алдааг харуулна", async () => {
  g.__VITE_ENV__ = { BASE_URL: "/" };
  let attempts = 0;
  const result = askRepo(
    { provider: "github", repo: "o/r", branch: "", dir: "" },
    () => "saved",
    async () => {
      attempts += 1;
      if (attempts === 1) throw new ProjectError("Repo олдсонгүй");
    },
  );
  submit();
  await wait();
  await wait();
  assert.equal(error().textContent, "Repo олдсонгүй");
  assert.equal(confirm().disabled, false);
  submit();
  assert.equal((await result)?.token, "saved");
  assert.equal(attempts, 2);
});
