import {
  alignAt,
  applyEdit,
  cycleCase,
  enterInsert,
  headingDepthAt,
  insertImage,
  insertPageBreak,
  insertSignature,
  insertTable,
  toggleAlign,
  toggleHeading,
  toggleList,
  toggleQuote,
  toggleWrap,
  wrapLink,
} from "./mdedit.ts";
import { replaceRange } from "./editortext.ts";
import { splitName } from "./office/filename.ts";
import { freeImagePath, pickImage, putImage } from "./images.ts";
import { dropSlotText, loadSlotText, saveSlotText } from "./storage.ts";
import {
  FILE_LIMIT,
  PROJECT_SLOT,
  isFileSlot,
  loadSlots,
  nextFileId,
  saveSlots,
  textSum,
  type FileSlot,
} from "./fileslots.ts";
import { TEMPLATE_INPUT } from "./undohistory.ts";
import type { AlignKind, Edit } from "./mdedit.ts";
import {
  LEGACY_TEMPLATES,
  PLAIN,
  TEMPLATE_GROUPS,
  TEMPLATES,
  findTemplate,
  isPlain,
} from "./templates.ts";

export interface MdToolbarOptions {
  readonly editor: HTMLTextAreaElement;
  readonly isMdFile: () => boolean;
  readonly isTexFile?: () => boolean;
  readonly fileName?: () => string | null;
  readonly mount?: HTMLElement;
  readonly onTemplate?: (id: string, from: string) => void;
  readonly onExample?: () => void;
  readonly onDraftError?: () => void;
  readonly onCloseFile?: (id: string) => void;
  readonly projectDirty?: () => boolean;
  readonly onCloseProject?: () => void;
}

export interface MdToolbar {
  refresh: () => void;
  template: () => string;
  slot: () => string;
  draft: (key: string) => Promise<string | null>;
  reset: () => void;
  openFile: (name: string) => boolean;
  closeFile: (id: string, force?: boolean) => void;
  fileSlots: () => { id: string; name: string; text: string | null }[];
  setProject: (name: string | null) => void;
  enterProject: () => void;
  leaveProject: () => void;
  markSaved: () => void;
  destroy: () => void;
}

type Role =
  | "bold"
  | "italic"
  | "code"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "case"
  | "left"
  | "center"
  | "right"
  | "signature"
  | "bullet"
  | "ordered"
  | "quote"
  | "table"
  | "pagebreak"
  | "image"
  | "link";

interface ButtonSpec {
  readonly role: Role;
  readonly label: string;
  readonly title: string;
}

const ICON = {
  left: '<path d="M1.5 3h13M1.5 6.3h8.5M1.5 9.7h13M1.5 13h8.5"/>',
  center: '<path d="M1.5 3h13M4 6.3h8M1.5 9.7h13M4 13h8"/>',
  right: '<path d="M1.5 3h13M6 6.3h8.5M1.5 9.7h13M6 13h8.5"/>',
  signature:
    '<path d="M1.5 14h13M2.3 9.2l2.6 2.6M4.9 9.2l-2.6 2.6"/>' +
    '<path d="M8 11.5l.6-2.3 5.1-5.1a1.2 1.2 0 0 1 1.7 1.7l-5.1 5.1z"/>',
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
  pagebreak:
    '<path d="M3.5 1.5v4h9v-4M3.5 14.5v-4h9v4"/>' +
    '<path d="M1.5 8h2M5.5 8h2M9.5 8h2M13.5 8h1"/>',
  image:
    '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/>' +
    '<circle cx="5.5" cy="6.3" r="1.3"/>' +
    '<path d="M1.5 11.5l3.8-3.6 2.7 2.5 2.2-2 4.3 4"/>',
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
  { role: "h1", label: "H1", title: "Гарчиг" },
  { role: "h2", label: "H2", title: "Дэд гарчиг" },
  { role: "h3", label: "H3", title: "Дэдийн дэд гарчиг" },
  { role: "h4", label: "H4", title: "Догол доторх гарчиг" },
  { role: "case", label: "Aa", title: "Том, жижиг үсэг ээлжлэх" },
  { role: "left", label: svg(ICON.left), title: "Зүүн тийш зэрэгцүүлэх" },
  { role: "center", label: svg(ICON.center), title: "Голлуулах" },
  { role: "right", label: svg(ICON.right), title: "Баруун тийш зэрэгцүүлэх" },
  { role: "signature", label: svg(ICON.signature), title: "Гарын үсэг" },
  { role: "bullet", label: svg(ICON.bullet), title: "Зүйлчлэх" },
  { role: "ordered", label: svg(ICON.ordered), title: "Дугаарлах" },
  { role: "quote", label: svg(ICON.quote), title: "Ишлэл" },
  { role: "code", label: "&lt;&gt;", title: "Код" },
  { role: "table", label: svg(ICON.table), title: "Хүснэгт" },
  { role: "image", label: svg(ICON.image), title: "Зураг" },
  { role: "pagebreak", label: svg(ICON.pagebreak), title: "Хуудас таслах" },
  { role: "link", label: svg(ICON.link), title: "Холбоос" },
];

const HEADING_DEPTH: Partial<Record<Role, 1 | 2 | 3 | 4>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
};

const ALIGN_ROLE: Partial<Record<Role, AlignKind>> = {
  left: "left",
  center: "center",
  right: "right",
  signature: "signature",
};

const TEMPLATE_KEY = "mdTemplate";

function loadTemplateId(): string {
  try {
    const stored = localStorage.getItem(TEMPLATE_KEY);
    const raw = stored === null ? null : (LEGACY_TEMPLATES[stored] ?? stored);
    if (raw === null) return PLAIN;
    if (findTemplate(raw) !== undefined || raw === PROJECT_SLOT) return raw;
    return loadSlots().some((slot) => slot.id === raw) ? raw : PLAIN;
  } catch (_) {
    return PLAIN;
  }
}

const EXAMPLE_KEY = "mdExample:";

function loadExampleChoice(slot: string): string | null {
  try {
    return localStorage.getItem(EXAMPLE_KEY + slot);
  } catch (_) {
    return null;
  }
}

function saveExampleChoice(slot: string, example: string): void {
  try {
    localStorage.setItem(EXAMPLE_KEY + slot, example);
  } catch (_) {}
}

function chosenExample(slot: string): string | undefined {
  const list = findTemplate(slot)?.examples ?? [];
  const saved = loadExampleChoice(slot);
  return list.find((item) => item.id === saved)?.id ?? list[0]?.id;
}

function pickerValue(slot: string): string {
  const example = chosenExample(slot);
  return example === undefined ? slot : slot + ":" + example;
}

const DRAFT_PREFIX = "mdDraft:";

const DRAFT_MAX = 200000;
const LARGE_DRAFT = "\u0000idb";

const slotOps = new Map<string, Promise<void>>();
let draftFailed: (() => void) | null = null;

function onSlot(id: string, op: () => Promise<void>): void {
  const next = (slotOps.get(id) ?? Promise.resolve())
    .then(op)
    .catch(() => draftFailed?.());
  slotOps.set(id, next);
}

function loadDraft(id: string): string | null {
  try {
    return localStorage.getItem(DRAFT_PREFIX + id);
  } catch (_) {
    return null;
  }
}

function smallDraft(id: string): string | null {
  const text = loadDraft(id);
  return text === LARGE_DRAFT ? null : text;
}

async function readDraft(id: string): Promise<string | null> {
  const text = loadDraft(id);
  if (text !== LARGE_DRAFT) return text;
  await slotOps.get(id);
  try {
    return await loadSlotText(id);
  } catch (_) {
    return null;
  }
}

function saveDraft(id: string, text: string): void {
  const large = text.trim() !== "" && text.length > DRAFT_MAX;
  const wasLarge = loadDraft(id) === LARGE_DRAFT;
  try {
    if (text.trim() === "") localStorage.removeItem(DRAFT_PREFIX + id);
    else localStorage.setItem(DRAFT_PREFIX + id, large ? LARGE_DRAFT : text);
  } catch (_) {
    draftFailed?.();
    return;
  }
  if (large) onSlot(id, () => saveSlotText(id, text));
  else if (wasLarge) onSlot(id, () => dropSlotText(id));
}

function dropDraft(id: string): void {
  const wasLarge = loadDraft(id) === LARGE_DRAFT;
  try {
    localStorage.removeItem(DRAFT_PREFIX + id);
  } catch (_) {}
  if (wasLarge) onSlot(id, () => dropSlotText(id));
}

export function migrateLegacyDrafts(active: string): string[] {
  const pending: string[] = [];
  for (const [legacy, target] of Object.entries(LEGACY_TEMPLATES)) {
    const text = smallDraft(legacy);
    if (text === null) continue;
    if (target === active) {
      pending.push(legacy);
      continue;
    }
    if (loadDraft(target) === LARGE_DRAFT) continue;
    const existing = smallDraft(target);
    saveDraft(target, existing === null ? text : existing + "\n\n" + text);
    dropDraft(legacy);
  }
  return pending;
}

function migrateSlotDrafts(): void {
  for (const template of TEMPLATES) {
    if (!template.examples?.length) continue;
    const text = smallDraft(template.id);
    if (text === null) continue;
    const key = pickerValue(template.id);
    if (loadDraft(key) === null) saveDraft(key, text);
    dropDraft(template.id);
  }
}

const CARET_PREFIX = "mdCaret:";

interface Caret {
  readonly start: number;
  readonly end: number;
  readonly scroll: number;
}

function loadCaret(key: string): Caret | null {
  try {
    const raw = localStorage.getItem(CARET_PREFIX + key);
    const [start, end, scroll] = (raw ?? "").split(",").map(Number);
    if (raw === null || [start, end, scroll].some((n) => !Number.isFinite(n)))
      return null;
    return { start: start!, end: end!, scroll: scroll! };
  } catch (_) {
    return null;
  }
}

function dropCaret(key: string): void {
  try {
    localStorage.removeItem(CARET_PREFIX + key);
  } catch (_) {}
}

function saveCaret(key: string, caret: Caret): void {
  try {
    localStorage.setItem(
      CARET_PREFIX + key,
      caret.start + "," + caret.end + "," + caret.scroll,
    );
  } catch (_) {}
}

function saveTemplateId(id: string): void {
  try {
    if (id === PLAIN) localStorage.removeItem(TEMPLATE_KEY);
    else localStorage.setItem(TEMPLATE_KEY, id);
  } catch (_) {}
}

const TITLE_HOLD_MS = 3000;

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

function pickerOptions(
  files: readonly FileSlot[],
  dirty: (slot: FileSlot) => boolean,
  project: { readonly name: string; readonly dirty: boolean } | null,
): string {
  const option = (value: string, label: string): string =>
    '<button type="button" class="md-menu-item" role="menuitemradio" ' +
    'aria-checked="false" data-value="' +
    escapeAttr(value) +
    '">' +
    escapeAttr(label) +
    "</button>";
  const fileOption = (slot: FileSlot): string =>
    '<div class="md-menu-file" role="presentation">' +
    '<button type="button" class="md-menu-item" role="menuitemradio" ' +
    'aria-checked="false" data-value="' +
    escapeAttr(slot.id) +
    '" title="' +
    escapeAttr(slot.name) +
    '"><span class="md-menu-name">' +
    escapeAttr(slot.name) +
    "</span>" +
    (dirty(slot)
      ? '<span class="md-menu-dot" title="Хадгалаагүй өөрчлөлттэй"></span>'
      : "") +
    "</button>" +
    '<button type="button" class="md-menu-close" tabindex="-1" data-close="' +
    escapeAttr(slot.id) +
    '" aria-label="' +
    escapeAttr(slot.name + " файлыг хаах") +
    '" title="Хаах">×</button></div>';
  const projectOption = project
    ? '<div class="md-menu-file" role="presentation">' +
      '<button type="button" class="md-menu-item" role="menuitemradio" ' +
      'aria-checked="false" data-value="' +
      PROJECT_SLOT +
      '" title="' +
      escapeAttr(project.name + " — LaTeX төсөл") +
      '"><span class="md-menu-name">' +
      escapeAttr(project.name) +
      '</span><span class="md-menu-kind">төсөл</span>' +
      (project.dirty
        ? '<span class="md-menu-dot" title="Хадгалаагүй өөрчлөлттэй"></span>'
        : "") +
      "</button>" +
      '<button type="button" class="md-menu-close" tabindex="-1" data-close="' +
      PROJECT_SLOT +
      '" aria-label="' +
      escapeAttr(project.name + " төслийг хаах") +
      '" title="Төслийг хаах">×</button></div>'
    : "";
  const fileGroup =
    files.length || project
      ? '<div class="md-menu-group" role="presentation">Нээлттэй файлууд</div>' +
        projectOption +
        files.map(fileOption).join("")
      : "";
  const slot = (id: string): string => {
    const item = findTemplate(id);
    if (item === undefined) return "";
    if (!item.examples?.length) return option(item.id, item.name);
    return item.examples
      .map((example) => option(item.id + ":" + example.id, example.name))
      .join("");
  };

  const grouped = new Set<string>();
  for (const group of TEMPLATE_GROUPS)
    for (const id of group.ids) grouped.add(id);

  return (
    fileGroup +
    TEMPLATE_GROUPS.map(
      (group) =>
        '<div class="md-menu-group" role="presentation">' +
        escapeAttr(group.name) +
        "</div>" +
        group.ids.map(slot).join(""),
    ).join("") +
    TEMPLATES.filter((item) => !grouped.has(item.id))
      .map((item) => slot(item.id))
      .join("")
  );
}

function buildPicker(): string {
  return (
    '<span class="md-select"><button type="button" ' +
    'class="tbtn tbtn-icon md-template" aria-haspopup="menu" ' +
    'aria-expanded="false" aria-label="Баримтын загвар"></button></span>' +
    '<span class="md-file" hidden><span class="md-file-head"></span>' +
    '<span class="md-file-tail"></span></span>'
  );
}

export function initMdToolbar(options: MdToolbarOptions): MdToolbar {
  const { editor, isMdFile, isTexFile = () => false } = options;

  const bar = document.createElement("div");
  bar.className = "md-bar";
  bar.hidden = true;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Хэлбэржүүлэх");
  let templateId = loadTemplateId();
  saveTemplateId(templateId);

  bar.innerHTML =
    buildPicker() + '<span class="md-group">' + buildButtons() + "</span>";

  const mount = options.mount ?? editor.parentElement;
  if (mount) mount.insertBefore(bar, mount.firstChild);

  const select = bar.querySelector<HTMLButtonElement>(".md-template")!;
  const menu = document.createElement("div");
  menu.className = "md-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Баримтын загвар");
  menu.hidden = true;
  let files = loadSlots();
  let lastTemplate =
    isFileSlot(templateId) || templateId === PROJECT_SLOT ? PLAIN : templateId;
  let projectName: string | null = null;
  let items: HTMLButtonElement[] = [];
  document.body.append(menu);

  function slotText(slot: FileSlot): string | null {
    if (slot.id === templateId) return editor.value;
    const text = loadDraft(slot.id);
    return text === LARGE_DRAFT ? null : (text ?? "");
  }

  function isDirty(slot: FileSlot): boolean {
    if (slot.sum === null) return false;
    const text = slotText(slot);
    return text !== null && textSum(text) !== slot.sum;
  }

  function rebuildMenu(): void {
    menu.innerHTML = pickerOptions(
      files,
      isDirty,
      projectName === null
        ? null
        : { name: projectName, dirty: options.projectDirty?.() ?? false },
    );
    items = [...menu.querySelectorAll<HTMLButtonElement>(".md-menu-item")];
    setPicked(pickerValue(templateId));
  }
  const group = bar.querySelector<HTMLElement>(".md-group")!;
  const picker = bar.querySelector<HTMLElement>(".md-select")!;
  const fileBox = bar.querySelector<HTMLElement>(".md-file")!;
  const fileHead = fileBox.querySelector<HTMLElement>(".md-file-head")!;
  const fileTail = fileBox.querySelector<HTMLElement>(".md-file-tail")!;
  const wideQuery = window.matchMedia("(min-width: 701px)");

  draftFailed = options.onDraftError ?? null;
  let legacyPending = migrateLegacyDrafts(templateId);
  migrateSlotDrafts();

  function dropLegacyPending(): void {
    for (const legacy of legacyPending) dropDraft(legacy);
    legacyPending = [];
  }
  let pickedLabel = "";
  let shownFile: string | null | undefined;

  function setPicked(key: string): void {
    for (const item of items) {
      const on = item.dataset.value === key;
      item.setAttribute("aria-checked", String(on));
      if (on) pickedLabel = item.textContent ?? "";
    }
    shownFile = undefined;
    syncLabel();
  }

  function syncLabel(): void {
    const name = options.fileName?.() ?? null;
    if (name === shownFile) return;
    shownFile = name;
    const slot = files.find((item) => item.id === templateId);
    if (slot && name && slot.name !== name) {
      files = files.map((item) =>
        item.id === slot.id ? { ...item, name } : item,
      );
      saveSlots(files);
      rebuildMenu();
    }
    select.textContent = name ? "Файл" : pickedLabel;
    fileBox.hidden = !name;
    if (!name) return;
    const parts = splitName(name);
    fileHead.textContent = parts.head;
    fileTail.textContent = parts.tail;
    fileBox.title = name;
  }

  function placeMenu(): void {
    const rect = select.getBoundingClientRect();
    const view = window.visualViewport;
    const bottom = view ? view.offsetTop + view.height : window.innerHeight;
    const right = document.documentElement.clientWidth;
    menu.style.top = rect.bottom + 4 + "px";
    menu.style.maxHeight = Math.max(120, bottom - rect.bottom - 12) + "px";
    menu.style.minWidth = rect.width + "px";
    menu.style.left =
      Math.max(8, Math.min(rect.left, right - menu.offsetWidth - 8)) + "px";
  }

  function closeMenu(refocus: boolean): void {
    if (menu.hidden) return;
    menu.hidden = true;
    select.setAttribute("aria-expanded", "false");
    if (refocus) select.focus();
  }

  function openMenu(): void {
    rebuildMenu();
    menu.hidden = false;
    select.setAttribute("aria-expanded", "true");
    placeMenu();
    const checked =
      items.find((item) => item.getAttribute("aria-checked") === "true") ??
      items[0];
    checked?.focus({ preventScroll: true });
    checked?.scrollIntoView({ block: "nearest" });
  }

  rebuildMenu();

  const headingButtons: [HTMLButtonElement, number][] = [];
  for (const button of group.querySelectorAll<HTMLButtonElement>(".md-btn")) {
    const want = HEADING_DEPTH[button.dataset.role as Role];
    if (want !== undefined) headingButtons.push([button, want]);
  }

  const alignButtons: [HTMLButtonElement, AlignKind][] = [];
  for (const button of group.querySelectorAll<HTMLButtonElement>(".md-btn")) {
    const kind = ALIGN_ROLE[button.dataset.role as Role];
    if (kind !== undefined) alignButtons.push([button, kind]);
  }

  let lastState = "";
  let ready = false;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;

  function apply(edit: Edit): void {
    applyEdit(editor, edit);
  }

  function run(role: Role): void {
    const text = editor.value;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const depth = HEADING_DEPTH[role];
    const kind = ALIGN_ROLE[role];

    if (depth !== undefined) apply(toggleHeading(text, start, end, depth));
    else if (kind !== undefined)
      apply(
        (kind === "signature" && start === end
          ? insertSignature(text, start, new Date())
          : null) ?? toggleAlign(text, start, end, kind),
      );
    else if (role === "bold") apply(toggleWrap(text, start, end, "**"));
    else if (role === "italic") apply(toggleWrap(text, start, end, "*"));
    else if (role === "code") apply(toggleWrap(text, start, end, "`"));
    else if (role === "case") apply(cycleCase(text, start, end));
    else if (role === "quote") apply(toggleQuote(text, start, end));
    else if (role === "link") apply(wrapLink(text, start, end));
    else if (role === "table") apply(insertTable(text, start));
    else if (role === "pagebreak") apply(insertPageBreak(text, start));
    else if (role === "image")
      void pickImage().then((file) => {
        if (!file) return;
        const src = freeImagePath(file.name, file);
        putImage(src, file);
        apply(
          insertImage(editor.value, Math.min(start, editor.value.length), src),
        );
        syncActive();
      });
    else apply(toggleList(text, start, end, role === "ordered"));

    lastState = "";
    syncActive();
  }

  function active(): boolean {
    if (isTexFile()) return false;
    return options.fileName?.() ? isMdFile() : !isPlain(templateId);
  }

  function syncActive(): void {
    if (bar.hidden || group.hidden) return;
    const depth = headingDepthAt(editor.value, editor.selectionStart);
    const align = alignAt(editor.value, editor.selectionStart);
    const state = String(depth) + ":" + String(align);
    if (state === lastState) return;
    lastState = state;
    for (const [button, want] of headingButtons)
      button.classList.toggle("is-on", want === depth);
    for (const [button, kind] of alignButtons)
      button.classList.toggle("is-on", kind === align);
  }

  function syncVisible(): void {
    if (settle) {
      clearTimeout(settle);
      settle = null;
    }
    const focus = document.activeElement;
    const focused =
      focus === editor ||
      (focus !== null && (bar.contains(focus) || menu.contains(focus)));
    const on = active();
    const show = ready && focused;
    syncLabel();

    picker.classList.toggle("is-plain", !on);
    editor.parentElement?.classList.toggle("is-markdown", on);

    if (group.hidden !== !on) {
      group.hidden = !on;
      lastState = "";
    }

    if (bar.hidden !== !show) {
      bar.hidden = !show;
      mount?.classList.toggle("has-mdbar", show);
      lastState = "";
    }

    syncWide();
    syncActive();
  }

  function toolbarStart(): number | null {
    if (document.documentElement.dataset.toolbar !== "wide") return null;
    const toolbar = document.querySelector<HTMLElement>(".toolbar");
    if (!toolbar) return null;
    for (const el of toolbar.children) {
      const item = el as HTMLElement;
      if (item.hidden || item.offsetParent === null) continue;
      return item.getBoundingClientRect().left;
    }
    return null;
  }

  function syncWide(): void {
    const root = document.documentElement;
    const host = mount?.parentElement;
    const subtitle = mount?.querySelector<HTMLElement>(".subtitle") ?? null;
    if (!mount || !host || bar.hidden || !wideQuery.matches) {
      delete root.dataset.topbar;
      return;
    }
    const cs = getComputedStyle(host);
    const contentLeft =
      host.getBoundingClientRect().left +
      (Number.parseFloat(cs.paddingLeft) || 0);
    const pulled = group.hidden ? null : toolbarStart();
    const room =
      host.clientWidth -
      (Number.parseFloat(cs.paddingLeft) || 0) -
      (Number.parseFloat(cs.paddingRight) || 0) +
      (pulled === null ? 0 : contentLeft - pulled);
    let text = 0;
    if (subtitle) {
      const wrap = subtitle.style.whiteSpace;
      subtitle.style.whiteSpace = "nowrap";
      const range = document.createRange();
      range.selectNodeContents(subtitle);
      text = Math.ceil(range.getBoundingClientRect().width);
      subtitle.style.whiteSpace = wrap;
    }
    const gap = Number.parseFloat(getComputedStyle(mount).columnGap) || 0;
    if (bar.scrollWidth + text + gap > room + 0.5) {
      const start = pulled ?? contentLeft;
      root.style.setProperty("--topbar-start", String(start) + "px");
      root.dataset.topbar = "wide";
    } else if (pulled !== null) {
      root.style.setProperty(
        "--topbar-pull",
        String(pulled - contentLeft) + "px",
      );
      root.dataset.topbar = "pull";
    } else delete root.dataset.topbar;
  }

  let wideFrame = 0;
  const queueWide = (): void => {
    if (wideFrame) return;
    wideFrame = requestAnimationFrame(() => {
      wideFrame = 0;
      syncWide();
    });
  };
  const subtitleWatch = new MutationObserver(queueWide);
  const watched = mount?.querySelector(".subtitle");
  if (watched)
    subtitleWatch.observe(watched, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  window.addEventListener("resize", queueWide);
  const toolbarWatch = new MutationObserver(queueWide);
  toolbarWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-toolbar"],
  });

  function holdTitle(): void {
    if (readyTimer) clearTimeout(readyTimer);
    ready = false;
    syncVisible();
    readyTimer = setTimeout(() => {
      readyTimer = null;
      ready = true;
      syncVisible();
    }, TITLE_HOLD_MS);
  }

  let switchSeq = 0;
  let loadingKey: string | null = null;

  function resetText(text: string, start: number, end: number): void {
    editor.value = "";
    editor.value = text;
    editor.setSelectionRange(start, end);
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: TEMPLATE_INPUT,
      }),
    );
  }

  function showDraft(id: string, key: string, stored: string | null): void {
    const text = stored ?? findTemplate(id)?.skeleton ?? "";
    const caret = stored === null ? null : loadCaret(key);
    const start = Math.min(caret?.start ?? text.length, text.length);
    const end = Math.min(caret?.end ?? text.length, text.length);

    resetText(text, start, end);
    if (caret !== null) {
      editor.scrollTop = caret.scroll;
      requestAnimationFrame(() => {
        if (pickerValue(templateId) === key) editor.scrollTop = caret.scroll;
      });
    }
    const first = chosenExample(id);
    if (stored === null && first) void loadDefault(key, first);
  }

  function chooseTemplate(id: string, example?: string): void {
    const from = pickerValue(templateId);
    if (
      id === templateId &&
      (example === undefined || example === chosenExample(id))
    )
      return;

    const parts = [editor.value, ...legacyPending.map(smallDraft)].filter(
      (part): part is string => part !== null && part.trim() !== "",
    );
    if (from !== loadingKey) saveDraft(from, parts.join("\n\n"));
    saveCaret(from, {
      start: editor.selectionStart,
      end: editor.selectionEnd,
      scroll: editor.scrollTop,
    });
    dropLegacyPending();
    templateId = id;
    if (!isFileSlot(id) && id !== PROJECT_SLOT) lastTemplate = id;
    saveTemplateId(id);
    if (example !== undefined) saveExampleChoice(id, example);

    const key = pickerValue(id);
    const seq = ++switchSeq;
    if (loadDraft(key) === LARGE_DRAFT) {
      loadingKey = key;
      void readDraft(key).then((stored) => {
        if (seq !== switchSeq) return;
        if (stored === null) draftFailed?.();
        else loadingKey = null;
        showDraft(id, key, stored);
      });
    } else {
      loadingKey = null;
      showDraft(id, key, loadDraft(key));
    }

    if (options.onTemplate) options.onTemplate(id, from);
    setPicked(key);
    syncVisible();
  }

  function openFile(name: string): boolean {
    if (files.length >= FILE_LIMIT) return false;
    const id = nextFileId(files);
    files = [...files, { id, name, sum: null }];
    saveSlots(files);
    rebuildMenu();
    chooseTemplate(id);
    return true;
  }

  function closeFile(id: string, force = false): void {
    const slot = files.find((item) => item.id === id);
    if (!slot) return;
    if (
      !force &&
      isDirty(slot) &&
      !window.confirm(
        "«" + slot.name + "» хадгалаагүй өөрчлөлттэй. Файлыг хаах уу?",
      )
    )
      return;
    if (templateId === id) {
      const others = files.filter((item) => item.id !== id);
      chooseTemplate(others.at(-1)?.id ?? lastTemplate);
    }
    files = files.filter((item) => item.id !== id);
    saveSlots(files);
    dropDraft(id);
    dropCaret(id);
    options.onCloseFile?.(id);
    rebuildMenu();
  }

  function setProject(name: string | null): void {
    if (name === projectName) return;
    projectName = name;
    rebuildMenu();
  }

  function enterProject(): void {
    if (templateId !== PROJECT_SLOT) chooseTemplate(PROJECT_SLOT);
  }

  function leaveProject(): void {
    if (templateId === PROJECT_SLOT) {
      const target = files.at(-1)?.id ?? lastTemplate;
      chooseTemplate(target);
    }
    dropDraft(PROJECT_SLOT);
    dropCaret(PROJECT_SLOT);
    options.onCloseFile?.(PROJECT_SLOT);
  }

  function markSaved(): void {
    if (!isFileSlot(templateId)) return;
    const sum = textSum(editor.value);
    files = files.map((item) =>
      item.id === templateId ? { ...item, sum } : item,
    );
    saveSlots(files);
  }

  async function loadDefault(key: string, example: string): Promise<void> {
    const { exampleText } = await import("./examples.ts");
    const text = exampleText(example);
    if (
      text === undefined ||
      pickerValue(templateId) !== key ||
      editor.value.trim()
    )
      return;
    resetText(text, 0, 0);
    editor.scrollTop = 0;
    options.onExample?.();
  }

  const onFocus = (): void => {
    if (settle) clearTimeout(settle);
    settle = setTimeout(() => {
      settle = null;
      syncVisible();
    }, FOCUS_SETTLE_MS);
  };
  const onSelectionChange = (): void => {
    if (!bar.hidden && document.activeElement === editor) syncActive();
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

  const onSelect = (value: string): void => {
    closeMenu(false);
    const [slot = "", example] = value.split(":");
    if (example !== undefined) {
      chooseTemplate(slot, example);
      editor.focus();
      return;
    }
    chooseTemplate(value);
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
    if (
      !replaceRange(editor, editor.selectionStart, editor.selectionEnd, insert)
    )
      editor.dispatchEvent(new Event("input", { bubbles: true }));
  };

  holdTitle();

  bar.addEventListener("mousedown", onPointerDown);
  bar.addEventListener("click", onClick);
  select.addEventListener("click", () => {
    if (menu.hidden) openMenu();
    else closeMenu(true);
  });
  menu.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const close = target?.closest<HTMLElement>(".md-menu-close");
    if (close?.dataset.close === PROJECT_SLOT) {
      closeMenu(false);
      options.onCloseProject?.();
      return;
    }
    if (close?.dataset.close) {
      closeFile(close.dataset.close);
      if (!menu.hidden) placeMenu();
      return;
    }
    const item = target?.closest<HTMLElement>(".md-menu-item");
    if (item?.dataset.value !== undefined) onSelect(item.dataset.value);
  });
  menu.addEventListener("keydown", (event) => {
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (at + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (at - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Delete") {
      const id = items[at]?.dataset.value;
      if (id && isFileSlot(id)) {
        event.preventDefault();
        closeFile(id);
        items[Math.min(at, items.length - 1)]?.focus();
      }
      return;
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  });
  const onMenuPointer = (event: Event): void => {
    const target = event.target as Node;
    if (!menu.contains(target) && !select.contains(target)) closeMenu(false);
  };
  const onMenuViewport = (event: Event): void => {
    if (menu.hidden) return;
    if (event.target instanceof Node && menu.contains(event.target)) return;
    placeMenu();
  };
  document.addEventListener("pointerdown", onMenuPointer);
  window.addEventListener("resize", onMenuViewport);
  window.addEventListener("scroll", onMenuViewport, true);
  window.visualViewport?.addEventListener("resize", onMenuViewport);
  editor.addEventListener("beforeinput", onBeforeInput);
  editor.addEventListener("input", syncActive);
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onFocus);
  document.addEventListener("selectionchange", onSelectionChange);

  return {
    refresh: syncVisible,
    template: () => templateId,
    slot: () => pickerValue(templateId),
    draft: readDraft,
    reset(): void {
      dropDraft(pickerValue(templateId));
      dropLegacyPending();
      holdTitle();
    },
    openFile,
    closeFile,
    fileSlots: () =>
      files.map((slot) => ({
        id: slot.id,
        name: slot.name,
        text: slotText(slot),
      })),
    setProject,
    enterProject,
    leaveProject,
    markSaved,
    destroy(): void {
      if (readyTimer) clearTimeout(readyTimer);
      if (settle) clearTimeout(settle);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onFocus);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onMenuPointer);
      window.removeEventListener("resize", onMenuViewport);
      window.removeEventListener("scroll", onMenuViewport, true);
      window.visualViewport?.removeEventListener("resize", onMenuViewport);
      menu.remove();
      window.removeEventListener("resize", queueWide);
      subtitleWatch.disconnect();
      toolbarWatch.disconnect();
      if (wideFrame) cancelAnimationFrame(wideFrame);
      delete document.documentElement.dataset.topbar;
      editor.removeEventListener("beforeinput", onBeforeInput);
      editor.removeEventListener("input", syncActive);
      mount?.classList.remove("has-mdbar");
      editor.parentElement?.classList.remove("is-markdown");
      bar.remove();
    },
  };
}
