import test from "node:test";
import assert from "node:assert/strict";

import "./helpers/mock-storage.ts";
import { installDom } from "./helpers/dom.ts";

const dom = installDom('<textarea id="ed"></textarea>');
const { createTexBar } = await import("../src/tex/texbar.ts");
const { gridStep, loadRecent, matchSymbol, rememberRecent } =
  await import("../src/tex/texpalette.ts");

test.after(() => dom.close());

const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
const bar = createTexBar({
  editor,
  active: () => true,
  insert(edit) {
    editor.value =
      editor.value.slice(0, edit.from) +
      edit.text +
      editor.value.slice(edit.to);
    editor.setSelectionRange(edit.caret, edit.caret);
  },
});
document.body.append(bar.group);
bar.group.hidden = false;
const pop = document.querySelector<HTMLElement>(".tex-pop")!;

function set(text: string, start: number, end = start): void {
  editor.value = text;
  editor.setSelectionRange(start, end);
}

function button(tool: string): HTMLElement {
  return bar.group.querySelector<HTMLElement>(`.tex-btn[data-tool="${tool}"]`)!;
}

const marked = (): string =>
  editor.value.slice(0, editor.selectionStart) +
  "|" +
  editor.value.slice(editor.selectionStart);

test("texBar: шууд товч сонголтыг ороож оруулна", () => {
  set("сайн үг", 5, 7);
  button("bold").click();
  assert.equal(marked(), "сайн \\textbf{үг|}");
  set("x", 0, 1);
  button("inline").click();
  assert.equal(marked(), "$x|$");
  set("", 0);
  button("display").click();
  assert.equal(marked(), "\\[\n|\n\\]");
  assert.equal(bar.isOpen(), false);
});

test("texBar: жагсаалт, зураг загвар биетэйгээ орно", () => {
  set("", 0);
  button("itemize").click();
  assert.equal(marked(), "\\begin{itemize}\n  \\item |\n\\end{itemize}");
  set("", 0);
  button("figure").click();
  assert.equal(
    marked(),
    "\\begin{figure}[ht]\n  \\centering\n" +
      "  \\includegraphics[width=\\linewidth]{|}\n" +
      "  \\caption{}\n  \\label{fig:}\n\\end{figure}",
  );
  assert.ok(button("itemize").querySelector("svg"));
  assert.equal(button("itemize").hasAttribute("data-gap"), true);
});

test("texBar: цэсийг нээж, сонголтоор засвар хийгээд хаана", () => {
  set("", 0);
  const more = button("math");
  more.click();
  assert.equal(bar.isOpen(), true);
  assert.equal(more.getAttribute("aria-expanded"), "true");
  assert.ok(pop.classList.contains("is-list"));
  const equation = [...pop.querySelectorAll<HTMLElement>(".tex-item")].find(
    (item) => item.textContent!.startsWith("Дугаартай"),
  )!;
  assert.equal(equation.querySelector(".tex-code")!.textContent, "equation");
  equation.click();
  assert.equal(marked(), "\\begin{equation}\n  |\n\\end{equation}");
  assert.equal(bar.isOpen(), false);
  assert.equal(more.getAttribute("aria-expanded"), "false");
});

test("texBar: дахин дарах, Escape, гадна дарахад цэс хаагдана", () => {
  const text = button("structure");
  text.click();
  assert.equal(bar.isOpen(), true);
  text.click();
  assert.equal(bar.isOpen(), false);
  text.click();
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(bar.isOpen(), false);
  text.click();
  document.body.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true }),
  );
  assert.equal(bar.isOpen(), false);
});

test("texBar: гараар нээсэн цэсэнд сумаар шилжинэ", () => {
  button("env").dispatchEvent(
    new MouseEvent("click", { bubbles: true, detail: 0 }),
  );
  const items = [...pop.querySelectorAll<HTMLElement>(".tex-item")];
  assert.equal(document.activeElement, items[0]);
  const press = (key: string): void => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  };
  press("ArrowDown");
  assert.equal(document.activeElement, items[1]);
  press("ArrowUp");
  press("ArrowUp");
  assert.equal(document.activeElement, items.at(-1));
  press("Tab");
  assert.equal(bar.isOpen(), false);
});

test("texBar: палитраас хайж тэмдэг оруулаад сүүлд ашигласанд нэмнэ", () => {
  set("$$", 1);
  button("symbols").click();
  assert.ok(pop.classList.contains("is-palette"));
  const search = pop.querySelector<HTMLInputElement>(".tex-search")!;
  search.value = "\\leq";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  const cells = pop.querySelectorAll<HTMLElement>(".tex-grid .tex-cell");
  assert.deepEqual(
    [...cells].map((cell) => cell.textContent),
    ["≤"],
  );
  assert.equal(pop.querySelector<HTMLElement>(".tex-tabs")!.hidden, true);
  search.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  assert.equal(marked(), "$\\leq|$");
  assert.deepEqual(loadRecent()[0], "leq");

  button("symbols").click();
  assert.equal(search.value, "");
  const recent = pop.querySelectorAll<HTMLElement>(".tex-recent .tex-cell");
  assert.equal(recent[0]!.textContent, "≤");
  const tab = pop.querySelectorAll<HTMLElement>(".tex-tab")[3]!;
  tab.click();
  assert.equal(tab.getAttribute("aria-selected"), "true");
  assert.equal(
    pop.querySelector<HTMLElement>(".tex-grid .tex-cell")!.textContent,
    "→",
  );
  search.value = "zzz";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(pop.querySelector<HTMLElement>(".tex-empty")!.hidden, false);
  bar.close();
});

test("палитрын туслах функцүүд", () => {
  const leq = { glyph: "≤", command: "leq" };
  assert.ok(matchSymbol(leq, "LE"));
  assert.ok(matchSymbol(leq, "≤"));
  assert.ok(!matchSymbol(leq, " "));
  assert.equal(gridStep("ArrowDown", 1, 20, 8), 9);
  assert.equal(gridStep("ArrowUp", 1, 20, 8), 0);
  assert.equal(gridStep("ArrowRight", 19, 20, 8), 19);
  assert.equal(gridStep("Enter", 1, 20, 8), -1);
  for (let at = 0; at < 10; at += 1) rememberRecent("c" + at);
  rememberRecent("c5");
  assert.deepEqual(loadRecent().slice(0, 2), ["c5", "c9"]);
  assert.equal(loadRecent().length, 8);
});
