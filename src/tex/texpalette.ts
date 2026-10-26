import { KEYS, readJson, writeJson } from "../core/store.ts";
import { glyphSvg, symbolTex } from "./texglyphs.ts";
import type { MathSymbol, SymbolTab } from "./texmenudata.ts";
import { element } from "../ui/dom.ts";

export interface Palette {
  readonly element: HTMLElement;
  show(): void;
  focus(): void;
}

const RECENT_LIMIT = 8;

export function loadRecent(): string[] {
  const raw = readJson(KEYS.texRecent);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((command): command is string => typeof command === "string")
    .slice(0, RECENT_LIMIT);
}

export function rememberRecent(command: string): void {
  const rest = loadRecent().filter((known) => known !== command);
  writeJson(KEYS.texRecent, [command, ...rest].slice(0, RECENT_LIMIT));
}

export function matchSymbol(symbol: MathSymbol, query: string): boolean {
  const needle = query.trim().replace(/^\\/, "").toLowerCase();
  return (
    needle !== "" &&
    (symbol.glyph === needle || symbol.command.toLowerCase().includes(needle))
  );
}

export function gridStep(
  key: string,
  at: number,
  count: number,
  columns: number,
): number {
  const step: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -columns,
    ArrowDown: columns,
  };
  const delta = step[key];
  if (delta === undefined) return -1;
  return Math.min(count - 1, Math.max(0, at + delta));
}

function columnsOf(cells: readonly HTMLElement[]): number {
  const top = cells[0]?.offsetTop;
  return Math.max(1, cells.filter((cell) => cell.offsetTop === top).length);
}

function symbolCell(symbol: MathSymbol): HTMLButtonElement {
  const cell = element("button", "tex-cell");
  cell.type = "button";
  cell.append(glyphSvg(symbolTex(symbol.command)));
  cell.title = "\\" + symbol.command.replace("#", "");
  cell.setAttribute("aria-label", cell.title);
  cell.dataset.command = symbol.command;
  return cell;
}

interface PaletteView {
  readonly root: HTMLElement;
  readonly search: HTMLInputElement;
  readonly recentRow: HTMLElement;
  readonly recent: HTMLElement;
  readonly tabList: HTMLElement;
  readonly tabButtons: readonly HTMLButtonElement[];
  readonly grid: HTMLElement;
  readonly empty: HTMLElement;
}

function tabButton(tab: SymbolTab, at: number): HTMLButtonElement {
  const button = element("button", "tex-tab");
  button.type = "button";
  button.textContent = tab.title;
  button.setAttribute("role", "tab");
  button.dataset.tab = String(at);
  return button;
}

function paletteView(tabs: readonly SymbolTab[]): PaletteView {
  const root = element("div", "tex-palette");
  const search = element("input", "tex-search");
  search.type = "search";
  search.placeholder = "Хайх: leq, arrow, ≤";
  search.setAttribute("aria-label", "Тэмдэг хайх");
  search.enterKeyHint = "done";
  const recentRow = element("div", "tex-recent-row");
  const recentTitle = element("span", "tex-label");
  recentTitle.textContent = "Сүүлд";
  const recent = element("div", "tex-recent");
  recentRow.append(recentTitle, recent);
  const tabList = element("div", "tex-tabs");
  tabList.setAttribute("role", "tablist");
  const tabButtons = tabs.map(tabButton);
  tabList.append(...tabButtons);
  const grid = element("div", "tex-grid");
  grid.setAttribute("role", "group");
  const empty = element("p", "tex-empty");
  empty.textContent = "Тэмдэг олдсонгүй";
  root.append(search, recentRow, tabList, grid, empty);
  return { root, search, recentRow, recent, tabList, tabButtons, grid, empty };
}

function moveInGrid(event: KeyboardEvent, target: HTMLElement): void {
  const box = target.closest<HTMLElement>(".tex-grid, .tex-recent");
  if (!box) return;
  const cells = [...box.querySelectorAll<HTMLElement>(".tex-cell")];
  const at = cells.indexOf(target);
  const next = gridStep(event.key, at, cells.length, columnsOf(cells));
  if (next < 0) return;
  event.preventDefault();
  cells[next]?.focus();
}

function bindPaletteKeys(
  view: PaletteView,
  moveTab: (delta: number) => void,
): void {
  view.root.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    if (target === view.search) {
      const first = view.grid.querySelector<HTMLElement>(".tex-cell");
      if (event.key === "ArrowDown") first?.focus();
      else if (event.key === "Enter") first?.click();
      else return;
      event.preventDefault();
    } else if (target.classList.contains("tex-tab")) {
      const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (delta === undefined) return;
      event.preventDefault();
      moveTab(delta);
    } else moveInGrid(event, target);
  });
}

export function createPalette(
  tabs: readonly SymbolTab[],
  pick: (symbol: MathSymbol) => void,
): Palette {
  const all = tabs.flatMap((tab) => tab.symbols);
  const byCommand = new Map(all.map((symbol) => [symbol.command, symbol]));
  const view = paletteView(tabs);
  const { search, recent, recentRow, grid, tabButtons } = view;
  let current = 0;

  function renderRecent(): void {
    const list = loadRecent()
      .map((command) => byCommand.get(command))
      .filter((symbol): symbol is MathSymbol => symbol !== undefined);
    recent.replaceChildren(...list.map(symbolCell));
  }

  function renderGrid(): void {
    const query = search.value;
    const searching = query.trim() !== "";
    const list = searching
      ? all.filter((symbol) => matchSymbol(symbol, query))
      : tabs[current]!.symbols;
    view.tabList.hidden = searching;
    recentRow.hidden = searching || recent.childElementCount === 0;
    tabButtons.forEach((button, at) =>
      button.setAttribute("aria-selected", String(at === current)),
    );
    grid.replaceChildren(...list.map(symbolCell));
    view.empty.hidden = list.length > 0;
  }

  function chooseTab(at: number, focus: boolean): void {
    current = (at + tabs.length) % tabs.length;
    renderGrid();
    if (focus) tabButtons[current]!.focus();
  }

  view.root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLElement>(".tex-tab");
    if (tab) return chooseTab(Number(tab.dataset.tab), false);
    const command = target.closest<HTMLElement>(".tex-cell")?.dataset.command;
    const symbol = byCommand.get(command ?? "");
    if (!symbol) return;
    rememberRecent(symbol.command);
    pick(symbol);
  });
  bindPaletteKeys(view, (delta) => chooseTab(current + delta, true));
  search.addEventListener("input", renderGrid);

  return {
    element: view.root,
    show() {
      search.value = "";
      renderRecent();
      renderGrid();
    },
    focus: () => search.focus({ preventScroll: true }),
  };
}
