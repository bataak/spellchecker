import { KEYS, read, write } from "../core/store.ts";
import { place, watchLayout } from "../ui/overlay.ts";
import { makeFindDrag, type Corner } from "./finddrag.ts";
import {
  findAll,
  matchAfter,
  matchAt,
  matchBefore,
  matchesIn,
  MATCH_LIMIT,
  replaceEdits,
  shiftOffset,
  type Edit,
  type Match,
} from "./findmodel.ts";
import {
  bindFindButton,
  clearable,
  replaceShown,
  visibleBand,
} from "./findtool.ts";

const LEAD_SHARE = 0.3;
const PAD = 24;

export interface FindBarDeps {
  readonly editor: HTMLTextAreaElement;
  readonly host: HTMLElement;
  readonly tools: () => HTMLElement | null;
  readonly rangeRects: (start: number, end: number) => DOMRect[];
  readonly offsetAtY: (y: number) => number | null;
  readonly onRender: (listener: () => void) => () => void;
  readonly commit: (text: string, caret: number) => void;
  readonly attachKeyboard: (input: HTMLInputElement) => void;
  readonly button: HTMLElement | null;
  readonly mac: boolean;
}

export interface FindBar {
  open(): void;
  toggle(): void;
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

const TOGGLES = {
  "find-word": KEYS.findWord,
  "find-exact": KEYS.findExact,
} as const;

type ToggleName = keyof typeof TOGGLES;

function toggle(label: string, title: string, cls: ToggleName) {
  const el = button(label, title, "find-toggle " + cls);
  el.setAttribute("aria-pressed", String(read(TOGGLES[cls]) === "1"));
  return el;
}

function pressed(el: HTMLElement): boolean {
  return el.getAttribute("aria-pressed") === "true";
}

function flip(el: HTMLElement, name: ToggleName): void {
  const on = !pressed(el);
  el.setAttribute("aria-pressed", String(on));
  write(TOGGLES[name], on ? "1" : "0");
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

function buildBar(mod: string, deps: FindBarDeps) {
  const bar = document.createElement("div");
  bar.className = "find-bar";
  bar.setAttribute("role", "search");
  bar.hidden = true;
  const grip = document.createElement("span");
  grip.className = "find-grip";
  grip.title = "Чирж зөөх (давхар товшвол анхны байрлалдаа)";
  grip.setAttribute("aria-hidden", "true");
  const query = field("Хайх");
  const count = document.createElement("span");
  count.className = "find-count";
  count.setAttribute("aria-live", "polite");
  const word = toggle("Үг", "Бүтэн үгээр хайх (Alt+W)", "find-word");
  const prev = button("↑", "Өмнөх (Shift+Enter)", "find-prev");
  const next = button("↓", "Дараах (Enter)", "find-next");
  const close = button("×", "Хаах (Esc)", "find-close");
  const more = button("⌄", "Солих мөр", "find-more");
  const replacement = field("Солих");
  const swapField = clearable(replacement);
  swapField.classList.add("find-swap");
  const one = button("Солих", "Энэ олдцыг солих (Enter)", "find-one");
  const all = button("Бүгдийг", "Бүгдийг солих (" + mod + "Enter)", "find-all");
  const exact = toggle(
    "Яг",
    "Том жижиг үсгийг ялгаж хайх, бичсэнээр нь солих (Alt+C)",
    "find-exact",
  );
  const findActions = document.createElement("div");
  findActions.className = "find-actions";
  findActions.append(count, word, exact, prev, next, more, close);
  const replaceActions = document.createElement("div");
  replaceActions.className = "find-actions find-swap";
  replaceActions.append(one, all);
  bar.append(grip, clearable(query), findActions, swapField, replaceActions);

  const drag = makeFindDrag(
    bar,
    grip,
    () => homeCorner(deps),
    () => [deps.host, ...[deps.tools()].filter((el) => !!el)],
  );

  return {
    ...{ bar, drag, query, count, word, prev, next, more, close },
    ...{ replacement, exact, one, all },
  };
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

function revealMatch(
  deps: FindBarDeps,
  match: Match | undefined,
  bar: HTMLElement,
): void {
  const { editor } = deps;
  if (!match) return;
  editor.setSelectionRange(match.from, match.to, "forward");
  const rect = deps.rangeRects(match.from, match.to)[0];
  if (!rect) return;
  const cover = bar.hidden ? null : bar.getBoundingClientRect();
  const { top, bottom } = visibleBand(editor.getBoundingClientRect(), cover);
  if (rect.top >= top + PAD && rect.bottom <= bottom - PAD) return;
  editor.scrollTop += rect.top - top - (bottom - top) * LEAD_SHARE;
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
  readonly toggle: (name: ToggleName) => void;
  readonly step: (forward: boolean) => void;
  readonly replaceOne: () => void;
  readonly replaceEvery: () => void;
  readonly expand: () => void;
  readonly hide: () => void;
}

const TOGGLE_KEYS: Record<string, ToggleName> = {
  KeyW: "find-word",
  KeyC: "find-exact",
};

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
    const name = e.altKey && !e.ctrlKey && !e.metaKey && TOGGLE_KEYS[e.code];
    if (name) {
      e.preventDefault();
      return actions.toggle(name);
    }
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    actions.hide();
  });
  parts.word.addEventListener("click", () => actions.toggle("find-word"));
  parts.exact.addEventListener("click", () => actions.toggle("find-exact"));
  parts.prev.addEventListener("click", () => actions.step(false));
  parts.next.addEventListener("click", () => actions.step(true));
  parts.more.addEventListener("click", actions.expand);
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

const TOOL_GAP = 8;

function showReplace(parts: Parts, on: boolean): void {
  parts.bar.classList.toggle("is-short", !on);
  parts.more.setAttribute("aria-expanded", String(on));
  parts.more.title = on ? "Солих мөрийг нуух" : "Солих мөрийг харуулах";
  parts.more.setAttribute("aria-label", parts.more.title);
  parts.drag.fit();
}

function show({ bar, drag }: Parts): void {
  if (!bar.isConnected) document.body.append(bar);
  bar.hidden = false;
  drag.fit();
}

function homeCorner(deps: FindBarDeps): Corner {
  const tools = deps.tools();
  const box = (tools ?? deps.host).getBoundingClientRect();
  if (!tools) return { right: box.right - PAD, top: box.top + PAD };
  const style = getComputedStyle(tools);
  const lefts = [...tools.children]
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 0)
    .map((rect) => rect.left - TOOL_GAP);
  return {
    right: Math.min(box.right - parseFloat(style.paddingRight), ...lefts),
    top: box.top + parseFloat(style.paddingTop),
  };
}

interface Origin {
  readonly start: number;
  readonly end: number;
  readonly scroll: number;
}

function shiftOrigin(origin: Origin | null, edits: readonly Edit[]) {
  if (!origin) return null;
  const start = shiftOffset(origin.start, edits);
  const end = Math.max(start, shiftOffset(origin.end, edits));
  return { start, end, scroll: origin.scroll };
}

function swap(
  deps: FindBarDeps,
  parts: Parts,
  matches: readonly Match[],
  caret: (edits: readonly Edit[]) => number,
): Edit[] {
  const { query, replacement } = parts;
  const value = deps.editor.value;
  const done = replaceEdits(
    value,
    matches,
    query.value,
    replacement.value,
    pressed(parts.exact),
  );
  deps.commit(done.text, caret(done.edits));
  replacement.focus({ preventScroll: true });
  return done.edits;
}

function finish(
  editor: HTMLTextAreaElement,
  origin: Origin | null,
  match?: Match,
) {
  editor.focus({ preventScroll: true });
  if (origin) {
    editor.setSelectionRange(origin.start, origin.end);
    editor.scrollTop = origin.scroll;
  } else if (match) editor.setSelectionRange(match.from, match.to, "forward");
}

function createFindCore(deps: FindBarDeps, parts: Parts) {
  const { editor } = deps;
  const { bar, query } = parts;
  let matches: Match[] = [];
  let current = -1;
  let searched = "";
  let origin: Origin | null = null;
  let loose = false;
  const marks = createFindMarks(deps, () =>
    bar.hidden ? null : { matches, current },
  );

  const paint = (reveal: boolean): void => {
    paintCount(parts, matches, current, editor.readOnly);
    if (reveal) revealMatch(deps, matches[current], bar);
    marks.soon();
  };
  const search = (from: number, reveal = true): void => {
    searched = editor.value;
    const { word, exact } = parts;
    matches = findAll(searched, query.value, pressed(word), pressed(exact));
    current = matchAfter(matches, from);
    paint(reveal);
  };
  const anchor = (): number => matches[current]?.from ?? editor.selectionStart;
  const home = (): number => origin?.start ?? anchor();
  const fresh = (): void => {
    if (searched !== editor.value) search(home());
  };
  const realign = (forward: boolean): boolean => {
    if (!loose) return false;
    loose = false;
    const at = editor.selectionStart;
    current = forward ? matchAt(matches, at) : matchBefore(matches, at);
    return true;
  };

  return {
    marks,
    home,
    search,
    research: () => search(home()),
    follow: () => search(anchor(), false),
    step(forward: boolean): void {
      fresh();
      if (!matches.length) return;
      if (!realign(forward))
        current = forward
          ? matchAfter(matches, anchor() + 1)
          : matchBefore(matches, anchor());
      paint(true);
    },
    replaceOne(): void {
      if (editor.readOnly) return;
      if (searched !== editor.value) return search(home());
      realign(true);
      const match = matches[current];
      if (!match) return;
      const edits = swap(
        deps,
        parts,
        [match],
        (all) => match.from + all[0]!.size,
      );
      origin = shiftOrigin(origin, edits);
      search(match.from + edits[0]!.size);
    },
    replaceEvery(): void {
      if (editor.readOnly) return;
      fresh();
      if (!matches.length) return;
      const at = editor.selectionStart;
      const every = findAll(
        editor.value,
        query.value,
        pressed(parts.word),
        pressed(parts.exact),
        Infinity,
      );
      const edits = swap(deps, parts, every, (all) => shiftOffset(at, all));
      origin = shiftOrigin(origin, edits);
      search(home());
    },
    remember(): void {
      loose = false;
      const { selectionStart: start, selectionEnd: end, scrollTop } = editor;
      origin = { start, end, scroll: scrollTop };
    },
    forget(): void {
      origin = null;
      loose = true;
    },
    finish(): void {
      marks.paint();
      finish(editor, origin, matches[current]);
      origin = null;
    },
  };
}

export function createFindBar(deps: FindBarDeps): FindBar {
  const { editor } = deps;
  const parts = buildBar(deps.mac ? "⌘" : "Ctrl+", deps);
  const { bar, query, replacement } = parts;
  const attach = once(() => {
    deps.attachKeyboard(query);
    deps.attachKeyboard(replacement);
  });
  const core = createFindCore(deps, parts);
  showReplace(parts, replaceShown(read(KEYS.findReplace)));

  const open = (): void => {
    attach();
    if (bar.hidden) core.remember();
    const picked = selectedLine(editor);
    if (picked) query.value = picked;
    show(parts);
    query.focus();
    query.select();
    core.research();
  };
  const hide = (): void => {
    if (bar.hidden) return;
    bar.hidden = true;
    core.finish();
  };
  const toggle = (name: ToggleName): void => {
    flip(name === "find-word" ? parts.word : parts.exact, name);
    core.research();
  };
  const expand = (): void => {
    const on = parts.bar.classList.contains("is-short");
    write(KEYS.findReplace, on ? "1" : "0");
    if (
      !on &&
      document.activeElement &&
      parts.bar.contains(document.activeElement)
    )
      query.focus({ preventScroll: true });
    showReplace(parts, on);
    if (on) replacement.focus({ preventScroll: true });
  };

  bindParts(
    parts,
    {
      search: core.research,
      toggle,
      step: core.step,
      replaceOne: core.replaceOne,
      replaceEvery: core.replaceEvery,
      expand,
      hide,
    },
    deps.mac,
  );

  const offKey = listenFindKey(deps, bar, (inBar) => {
    if (!inBar) return open();
    query.focus();
    query.select();
  });
  const onEdit = (): void => {
    if (!bar.hidden) core.follow();
  };
  editor.addEventListener("input", onEdit);
  editor.addEventListener("pointerdown", core.forget);
  editor.addEventListener("keydown", core.forget);

  const flipBar = (): void => (bar.hidden ? open() : hide());
  const unbind = bindFindButton(deps.button, deps.mac, flipBar);

  return {
    open,
    toggle: flipBar,
    destroy() {
      unbind();
      offKey();
      editor.removeEventListener("input", onEdit);
      editor.removeEventListener("pointerdown", core.forget);
      editor.removeEventListener("keydown", core.forget);
      core.marks.destroy();
      parts.drag.destroy();
      bar.remove();
    },
  };
}
