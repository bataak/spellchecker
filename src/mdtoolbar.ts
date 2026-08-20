import {
  enterInsert,
  headingDepthAt,
  insertTable,
  minimalDiff,
  toggleHeading,
  toggleList,
  toggleQuote,
  toggleWrap,
  wrapLink,
} from "./mdedit.ts";
import type { Edit } from "./mdedit.ts";
import {
  PLAIN,
  TEMPLATE_GROUPS,
  TEMPLATES,
  findTemplate,
} from "./templates.ts";

export interface MdToolbarOptions {
  readonly editor: HTMLTextAreaElement;
  readonly isMdFile: () => boolean;
  readonly mount?: HTMLElement;
  readonly onTemplate?: (id: string) => void;
}

export interface MdToolbar {
  refresh: () => void;
  template: () => string;
  reset: () => void;
  destroy: () => void;
}

type Role =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "ordered"
  | "quote"
  | "table"
  | "link";

interface ButtonSpec {
  readonly role: Role;
  readonly label: string;
  readonly title: string;
}

const ICON = {
  bullet:
    '<circle cx="3" cy="4" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none"/>' +
    '<circle cx="3" cy="12" r="1.1" fill="currentColor" stroke="none"/>' +
    '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>',
  ordered:
    '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>' +
    '<text x="0.6" y="5.7" font-size="5.5" fill="currentColor" stroke="none">1</text>' +
    '<text x="0.6" y="9.7" font-size="5.5" fill="currentColor" stroke="none">2</text>' +
    '<text x="0.6" y="13.7" font-size="5.5" fill="currentColor" stroke="none">3</text>',
  quote:
    '<path fill="currentColor" stroke="none" d="M7.1 3.9c-2.1.9-3.6 2.8-3.6 5.1 0 1.8 1.2 3 2.8 3 1.4 0 2.5-1.1 2.5-2.5 0-1.3-1-2.3-2.2-2.3-.2 0-.5 0-.7.1.3-1.1 1.1-2 2.2-2.5z"/>' +
    '<path fill="currentColor" stroke="none" d="M13.9 3.9c-2.1.9-3.6 2.8-3.6 5.1 0 1.8 1.2 3 2.8 3 1.4 0 2.5-1.1 2.5-2.5 0-1.3-1-2.3-2.2-2.3-.2 0-.5 0-.7.1.3-1.1 1.1-2 2.2-2.5z"/>',
  table:
    '<rect x="3" y="3" width="10" height="10" rx="1.2"/>' +
    '<path d="M3 8h10M8 3v10"/>',
  link:
    '<path d="M6.9 9.1a3.1 3.1 0 0 0 4.4.3l1.9-1.9a3.1 3.1 0 0 0-4.4-4.4l-1 1"/>' +
    '<path d="M9.1 6.9a3.1 3.1 0 0 0-4.4-.3l-1.9 1.9a3.1 3.1 0 0 0 4.4 4.4l1-1"/>',
} as const;

function svg(body: string): string {
  return (
    '<svg viewBox="-0.8 -0.8 17.6 17.6" width="20" height="20" aria-hidden="true" ' +
    'fill="none" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    body +
    "</svg>"
  );
}

const BUTTONS: readonly ButtonSpec[] = [
  { role: "bold", label: "B", title: "Тод" },
  { role: "italic", label: "I", title: "Налуу" },
  { role: "strike", label: "S", title: "Дарж зурах" },
  { role: "h1", label: "H1", title: "Гарчиг" },
  { role: "h2", label: "H2", title: "Дэд гарчиг" },
  { role: "h3", label: "H3", title: "Дэдийн дэд гарчиг" },
  { role: "bullet", label: svg(ICON.bullet), title: "Цэгт жагсаалт" },
  { role: "ordered", label: svg(ICON.ordered), title: "Дугаарласан жагсаалт" },
  { role: "quote", label: svg(ICON.quote), title: "Ишлэл" },
  { role: "code", label: "&lt;&gt;", title: "Код" },
  { role: "table", label: svg(ICON.table), title: "Хүснэгт" },
  { role: "link", label: svg(ICON.link), title: "Холбоос" },
];

const HEADING_DEPTH: Partial<Record<Role, 1 | 2 | 3>> = { h1: 1, h2: 2, h3: 3 };

const TEMPLATE_KEY = "mdTemplate";

function loadTemplateId(): string {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    return raw !== null && findTemplate(raw) !== undefined ? raw : PLAIN;
  } catch (_) {
    return PLAIN;
  }
}

function saveTemplateId(id: string): void {
  try {
    if (id === PLAIN) localStorage.removeItem(TEMPLATE_KEY);
    else localStorage.setItem(TEMPLATE_KEY, id);
  } catch (_) {}
}

const TITLE_HOLD_MS = 5000;

const FOCUS_SETTLE_MS = 150;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildButtons(): string {
  return BUTTONS.map(
    (spec) =>
      '<button type="button" class="tbtn md-btn" data-role="' +
      spec.role +
      '" title="' +
      escapeAttr(spec.title) +
      '" aria-label="' +
      escapeAttr(spec.title) +
      '">' +
      spec.label +
      "</button>",
  ).join("");
}

function buildPicker(): string {
  const option = (id: string): string => {
    const item = findTemplate(id);
    if (item === undefined) return "";
    return (
      '<option value="' +
      escapeAttr(item.id) +
      '">' +
      escapeAttr(item.name) +
      "</option>"
    );
  };

  const grouped = new Set<string>([PLAIN]);
  for (const group of TEMPLATE_GROUPS)
    for (const id of group.ids) grouped.add(id);

  const options =
    option(PLAIN) +
    TEMPLATE_GROUPS.map(
      (group) =>
        '<optgroup label="' +
        escapeAttr(group.name) +
        '">' +
        group.ids.map(option).join("") +
        "</optgroup>",
    ).join("") +
    TEMPLATES.filter((item) => !grouped.has(item.id))
      .map((item) => option(item.id))
      .join("");

  return (
    '<span class="md-select"><select class="tbtn tbtn-icon md-template" ' +
    'aria-label="Баримтын загвар">' +
    options +
    "</select></span>"
  );
}

export function initMdToolbar(options: MdToolbarOptions): MdToolbar {
  const { editor, isMdFile } = options;

  const bar = document.createElement("div");
  bar.className = "md-bar";
  bar.hidden = true;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Хэлбэржүүлэх");
  bar.innerHTML =
    buildPicker() + '<span class="md-group">' + buildButtons() + "</span>";

  const mount = options.mount ?? editor.parentElement;
  if (mount) mount.insertBefore(bar, mount.firstChild);

  const select = bar.querySelector<HTMLSelectElement>(".md-template")!;
  const group = bar.querySelector<HTMLElement>(".md-group")!;

  let templateId = loadTemplateId();
  select.value = templateId;

  const headingButtons: [HTMLButtonElement, number][] = [];
  for (const button of group.querySelectorAll<HTMLButtonElement>(".md-btn")) {
    const want = HEADING_DEPTH[button.dataset.role as Role];
    if (want !== undefined) headingButtons.push([button, want]);
  }

  let lastDepth = -1;
  let ready = false;
  let settle: ReturnType<typeof setTimeout> | null = null;

  function apply(edit: Edit): void {
    const patch = minimalDiff(editor.value, edit.text);

    if (patch) {
      editor.focus();
      editor.setSelectionRange(patch.from, patch.to);
      let ok = false;
      try {
        ok =
          patch.insert === ""
            ? document.execCommand("delete")
            : document.execCommand("insertText", false, patch.insert);
      } catch (_) {
        ok = false;
      }
      if (!ok) {
        editor.setRangeText(patch.insert, patch.from, patch.to, "end");
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    editor.setSelectionRange(edit.start, edit.end);
  }

  function run(role: Role): void {
    const text = editor.value;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const depth = HEADING_DEPTH[role];

    if (depth !== undefined) apply(toggleHeading(text, start, end, depth));
    else if (role === "bold") apply(toggleWrap(text, start, end, "**"));
    else if (role === "italic") apply(toggleWrap(text, start, end, "*"));
    else if (role === "strike") apply(toggleWrap(text, start, end, "~~"));
    else if (role === "code") apply(toggleWrap(text, start, end, "`"));
    else if (role === "quote") apply(toggleQuote(text, start, end));
    else if (role === "link") apply(wrapLink(text, start, end));
    else if (role === "table") apply(insertTable(text, start));
    else apply(toggleList(text, start, end, role === "ordered"));

    lastDepth = -1;
    syncActive();
  }

  function active(): boolean {
    return templateId !== PLAIN || isMdFile();
  }

  function atTop(): boolean {
    const value = editor.value;
    if (value.length === 0) return true;
    return value.lastIndexOf("\n", editor.selectionStart - 1) < 0;
  }

  function syncActive(): void {
    if (bar.hidden || group.hidden) return;
    const depth = headingDepthAt(editor.value, editor.selectionStart);
    if (depth === lastDepth) return;
    lastDepth = depth;
    for (const [button, want] of headingButtons)
      button.classList.toggle("is-on", want === depth);
  }

  function syncVisible(): void {
    if (settle) {
      clearTimeout(settle);
      settle = null;
    }
    const focus = document.activeElement;
    const focused = focus === editor || (focus !== null && bar.contains(focus));
    const on = active();
    const show = ready && focused && (on || atTop());

    if (group.hidden !== !on) {
      group.hidden = !on;
      lastDepth = -1;
    }

    if (bar.hidden !== !show) {
      bar.hidden = !show;
      mount?.classList.toggle("has-mdbar", show);
      lastDepth = -1;
    }

    syncActive();
  }

  function chooseTemplate(id: string): void {
    templateId = id;
    saveTemplateId(id);
    const template = findTemplate(id);

    if (template && template.skeleton && editor.value.trim() === "") {
      apply({
        text: template.skeleton,
        start: template.skeleton.length,
        end: template.skeleton.length,
      });
    }

    if (options.onTemplate) options.onTemplate(id);
    syncVisible();
  }

  const onFocus = (): void => {
    if (settle) clearTimeout(settle);
    settle = setTimeout(() => {
      settle = null;
      syncVisible();
    }, FOCUS_SETTLE_MS);
  };
  const onSelectionChange = (): void => {
    if (document.activeElement === editor) syncVisible();
  };

  const onPointerDown = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".md-btn")) event.preventDefault();
  };

  const onClick = (event: Event): void => {
    const button = (
      event.target as HTMLElement | null
    )?.closest<HTMLButtonElement>(".md-btn");
    const role = button?.dataset.role as Role | undefined;
    if (role) run(role);
  };

  const onSelect = (): void => {
    chooseTemplate(select.value);
    editor.focus();
  };

  const onBeforeInput = (event: InputEvent): void => {
    if (
      event.inputType !== "insertLineBreak" &&
      event.inputType !== "insertParagraph"
    )
      return;
    if (!active()) return;

    const insert = enterInsert(editor.value, editor.selectionStart);
    if (insert === "\n") return;

    event.preventDefault();
    if (!document.execCommand("insertText", false, insert)) {
      editor.setRangeText(
        insert,
        editor.selectionStart,
        editor.selectionEnd,
        "end",
      );
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const readyTimer = setTimeout(() => {
    ready = true;
    syncVisible();
  }, TITLE_HOLD_MS);

  bar.addEventListener("mousedown", onPointerDown);
  bar.addEventListener("touchstart", onPointerDown, { passive: false });
  bar.addEventListener("click", onClick);
  select.addEventListener("change", onSelect);
  editor.addEventListener("beforeinput", onBeforeInput);
  editor.addEventListener("input", syncVisible);
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onFocus);
  document.addEventListener("selectionchange", onSelectionChange);

  return {
    refresh: syncVisible,
    template: () => templateId,
    reset(): void {
      templateId = PLAIN;
      saveTemplateId(PLAIN);
      select.value = PLAIN;
      syncVisible();
    },
    destroy(): void {
      clearTimeout(readyTimer);
      if (settle) clearTimeout(settle);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onFocus);
      document.removeEventListener("selectionchange", onSelectionChange);
      editor.removeEventListener("beforeinput", onBeforeInput);
      editor.removeEventListener("input", syncVisible);
      mount?.classList.remove("has-mdbar");
      bar.remove();
    },
  };
}
