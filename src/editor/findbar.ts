import { place, watchLayout } from "../ui/overlay.ts";
import {
  findAll,
  matchAfter,
  matchBefore,
  matchesIn,
  MATCH_LIMIT,
  replaceAll,
  type Match,
} from "./findmodel.ts";

const LEAD_SHARE = 0.3;
const PAD = 24;

export interface FindBarDeps {
  readonly editor: HTMLTextAreaElement;
  readonly host: HTMLElement;
  readonly tools: () => HTMLElement | null;
  readonly rangeRects: (start: number, end: number) => DOMRect[];
  readonly offsetAtY: (y: number) => number | null;
  readonly onRender: (listener: () => void) => () => void;
  readonly insert: (text: string, start: number, end: number) => void;
  readonly set: (text: string, caret: number | null) => void;
  readonly attachKeyboard: (input: HTMLInputElement) => void;
  readonly mac: boolean;
}

export interface FindBar {
  open(): void;
  destroy(): void;
}

export function isFindKey(e: KeyboardEvent, mac: boolean): boolean {
  const primary = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  return (
    primary &&
    !e.shiftKey &&
    !e.altKey &&
    (e.code === "KeyF" || e.key.toLowerCase() === "f")
  );
}

function button(label: string, title: string, cls: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "find-btn " + cls;
  el.textContent = label;
  el.title = title;
  el.setAttribute("aria-label", title);
  el.addEventListener("mousedown", (e) => e.preventDefault());
  return el;
}

function field(label: string): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "text";
  el.className = "find-input";
  el.placeholder = label;
  el.setAttribute("aria-label", label);
  el.spellcheck = false;
  el.autocomplete = "off";
  return el;
}

function buildBar(mod: string) {
  const bar = document.createElement("div");
  bar.className = "find-bar";
  bar.setAttribute("role", "search");
  bar.hidden = true;
  const query = field("Хайх");
  const count = document.createElement("span");
  count.className = "find-count";
  count.setAttribute("aria-live", "polite");
  const prev = button("↑", "Өмнөх (Shift+Enter)", "find-prev");
  const next = button("↓", "Дараах (Enter)", "find-next");
  const close = button("×", "Хаах (Esc)", "find-close");
  const replacement = field("Солих");
  const one = button("Солих", "Энэ олдцыг солих (Enter)", "find-one");
  const all = button("Бүгдийг", "Бүгдийг солих (" + mod + "Enter)", "find-all");
  const findRow = document.createElement("div");
  findRow.className = "find-row";
  findRow.append(query, count, prev, next, close);
  const replaceRow = document.createElement("div");
  replaceRow.className = "find-row";
  replaceRow.append(replacement, one, all);
  bar.append(findRow, replaceRow);

  return { bar, query, count, prev, next, close, replacement, one, all };
}

type Parts = ReturnType<typeof buildBar>;

interface MarkState {
  readonly matches: readonly Match[];
  readonly current: number;
}

function createFindMarks(deps: FindBarDeps, state: () => MarkState | null) {
  const { editor } = deps;
  const layer = document.createElement("div");
  layer.className = "find-marks";
  layer.hidden = true;
  deps.host.prepend(layer);
  let frame = 0;

  const paint = (): void => {
    frame = 0;
    const seen = state();
    layer.hidden = !seen?.matches.length;
    if (!seen || layer.hidden) return void layer.replaceChildren();
    const box = editor.getBoundingClientRect();
    const top = deps.offsetAtY(box.top) ?? 0;
    const bottom = deps.offsetAtY(box.bottom) ?? editor.value.length;
    const origin = layer.getBoundingClientRect();
    const active = seen.matches[seen.current];
    layer.replaceChildren(
      ...matchesIn(seen.matches, top, bottom).flatMap((match) =>
        deps.rangeRects(match.from, match.to).map((rect) => {
          const el = document.createElement("div");
          el.className =
            match === active ? "find-mark is-current" : "find-mark";
          place(el, rect, origin);
          el.style.width = rect.width + "px";
          return el;
        }),
      ),
    );
  };
  const soon = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };
  const offRender = deps.onRender(soon);
  const unwatch = watchLayout(editor, soon);

  return {
    paint,
    soon,
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      offRender();
      unwatch();
      layer.remove();
    },
  };
}

function revealMatch(deps: FindBarDeps, match: Match | undefined): void {
  const { editor } = deps;
  if (!match) return;
  editor.setSelectionRange(match.from, match.to, "forward");
  const rect = deps.rangeRects(match.from, match.to)[0];
  if (!rect) return;
  const box = editor.getBoundingClientRect();
  if (rect.top >= box.top + PAD && rect.bottom <= box.bottom - PAD) return;
  editor.scrollTop += rect.top - box.top - box.height * LEAD_SHARE;
}

function paintCount(
  parts: Parts,
  matches: readonly Match[],
  current: number,
  readOnly: boolean,
): void {
  const { query, count } = parts;
  const total =
    matches.length >= MATCH_LIMIT ? MATCH_LIMIT + "+" : matches.length;
  count.textContent = query.value
    ? (current >= 0 ? current + 1 : 0) + "/" + total
    : "";
  count.classList.toggle("is-empty", !!query.value && !matches.length);
  const none = !matches.length;
  parts.prev.disabled = none;
  parts.next.disabled = none;
  parts.one.disabled = none || readOnly;
  parts.all.disabled = none || readOnly;
}

interface Actions {
  readonly search: () => void;
  readonly step: (forward: boolean) => void;
  readonly replaceOne: () => void;
  readonly replaceEvery: () => void;
  readonly hide: () => void;
}

function bindParts(parts: Parts, actions: Actions, mac: boolean): void {
  const { query, replacement, bar } = parts;
  query.addEventListener("input", actions.search);
  query.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    actions.step(!e.shiftKey);
  });
  replacement.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    if (mac ? e.metaKey : e.ctrlKey) actions.replaceEvery();
    else actions.replaceOne();
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    actions.hide();
  });
  parts.prev.addEventListener("click", () => actions.step(false));
  parts.next.addEventListener("click", () => actions.step(true));
  parts.close.addEventListener("click", actions.hide);
  parts.one.addEventListener("click", actions.replaceOne);
  parts.all.addEventListener("click", actions.replaceEvery);
}

function listenFindKey(
  deps: FindBarDeps,
  bar: HTMLElement,
  run: (inBar: boolean) => void,
): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.isComposing || !isFindKey(e, deps.mac)) return;
    const focus = document.activeElement;
    const inBar = !!focus && bar.contains(focus);
    if (
      !inBar &&
      focus !== deps.editor &&
      (focus?.tagName === "INPUT" || focus?.tagName === "TEXTAREA")
    )
      return;
    e.preventDefault();
    run(inBar);
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

function once(run: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    run();
  };
}

function selectedLine(editor: HTMLTextAreaElement): string {
  const text = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  return text.includes("\n") ? "" : text;
}

function mount(deps: FindBarDeps, bar: HTMLElement): void {
  const tools = deps.tools();
  if (tools && bar.parentElement !== tools) tools.prepend(bar);
  else if (!bar.parentElement) deps.host.append(bar);
}

export function createFindBar(deps: FindBarDeps): FindBar {
  const { editor } = deps;
  const parts = buildBar(deps.mac ? "⌘" : "Ctrl+");
  const { bar, query, replacement } = parts;
  const attach = once(() => {
    deps.attachKeyboard(query);
    deps.attachKeyboard(replacement);
  });
  let matches: Match[] = [];
  let current = -1;
  let searched = "";
  const marks = createFindMarks(deps, () =>
    bar.hidden ? null : { matches, current },
  );

  const paint = (reveal: boolean): void => {
    paintCount(parts, matches, current, editor.readOnly);
    if (reveal) revealMatch(deps, matches[current]);
    marks.soon();
  };
  const search = (from: number, reveal = true): void => {
    searched = editor.value;
    matches = findAll(searched, query.value);
    current = matchAfter(matches, from);
    paint(reveal);
  };
  const anchor = (): number => matches[current]?.from ?? editor.selectionStart;
  const fresh = (): void => {
    if (searched !== editor.value) search(editor.selectionStart);
  };

  const step = (forward: boolean): void => {
    fresh();
    if (!matches.length) return;
    current = forward
      ? matchAfter(matches, anchor() + 1)
      : matchBefore(matches, anchor());
    paint(true);
  };

  const replaceOne = (): void => {
    if (editor.readOnly) return;
    if (searched !== editor.value) return search(editor.selectionStart);
    const match = matches[current];
    if (!match) return;
    const text = replacement.value;
    deps.insert(text, match.from, match.to);
    replacement.focus({ preventScroll: true });
    search(match.from + text.length);
  };

  const replaceEvery = (): void => {
    if (editor.readOnly) return;
    fresh();
    if (!matches.length) return;
    const top = editor.scrollTop;
    deps.set(replaceAll(editor.value, matches, replacement.value), null);
    editor.scrollTop = top;
    replacement.focus({ preventScroll: true });
    search(editor.selectionStart);
  };

  const open = (): void => {
    attach();
    const picked = selectedLine(editor);
    if (picked) query.value = picked;
    mount(deps, bar);
    bar.hidden = false;
    query.focus();
    query.select();
    search(editor.selectionStart);
  };

  const hide = (): void => {
    if (bar.hidden) return;
    bar.hidden = true;
    marks.paint();
    const match = matches[current];
    editor.focus({ preventScroll: true });
    if (match) editor.setSelectionRange(match.from, match.to, "forward");
  };

  bindParts(
    parts,
    { search: () => search(anchor()), step, replaceOne, replaceEvery, hide },
    deps.mac,
  );

  const offKey = listenFindKey(deps, bar, (inBar) => {
    if (!inBar) return open();
    query.focus();
    query.select();
  });
  const onEdit = (): void => {
    if (!bar.hidden) search(anchor(), false);
  };
  editor.addEventListener("input", onEdit);

  return {
    open,
    destroy() {
      offKey();
      editor.removeEventListener("input", onEdit);
      marks.destroy();
      bar.remove();
    },
  };
}
