import "./dictmanager.css";
import type { DictInfo } from "./messages.ts";
import {
  importDictFiles,
  moveItem,
  removeUserDict,
  renameUserDict,
  saveDictOrder,
  userKeyOf,
} from "./userdicts.ts";

export interface DictManagerDeps {
  list(): Promise<DictInfo[]>;
  reload(): void;
  reorder(): void;
  changed(): void;
  status(message: string): void;
}

interface DictManagerView {
  dialog: HTMLDialogElement;
  list: HTMLOListElement;
  empty: HTMLElement;
}

let view: DictManagerView | null = null;
let deps: DictManagerDeps | null = null;
let current: DictInfo[] = [];

function button(label: string, title: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "tbtn dict-manager-btn";
  element.textContent = label;
  element.title = title;
  element.setAttribute("aria-label", title);
  return element;
}

const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS: Record<string, [string, Record<string, string>][]> = {
  up: [["polyline", { points: "18 15 12 9 6 15" }]],
  down: [["polyline", { points: "6 9 12 15 18 9" }]],
  rename: [
    ["path", { d: "M12 20h9" }],
    ["path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" }],
  ],
  remove: [
    ["polyline", { points: "3 6 5 6 21 6" }],
    ["path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }],
    ["path", { d: "M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" }],
  ],
};

function iconButton(
  icon: keyof typeof ICONS,
  title: string,
): HTMLButtonElement {
  const element = button("", title);
  element.classList.add("tbtn-icon");
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(name, value);
  for (const [tag, attributes] of ICONS[icon]!) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes))
      shape.setAttribute(name, value);
    svg.appendChild(shape);
  }
  element.appendChild(svg);
  return element;
}

function createView(): DictManagerView {
  const dialog = document.createElement("dialog");
  dialog.className = "suggest-overlay dict-overlay";
  dialog.setAttribute("aria-labelledby", "dictManagerTitle");
  const card = document.createElement("div");
  card.className = "suggest-card dict-manager";
  const title = document.createElement("h2");
  title.id = "dictManagerTitle";
  title.className = "suggest-title";
  title.textContent = "Тайлбар толь";
  const list = document.createElement("ol");
  list.className = "dict-manager-list";
  const empty = document.createElement("p");
  empty.className = "dict-manager-empty";
  empty.textContent = "Тайлбар толь алга";
  const actions = document.createElement("div");
  actions.className = "suggest-actions ignore-actions";
  const addFiles = button(
    "Файл зааж нэмэх",
    "StarDict файлууд эсвэл архив сонгох",
  );
  const adders = document.createElement("span");
  adders.className = "dict-manager-adders";
  adders.appendChild(addFiles);
  if (supportsDirectoryPicker()) {
    const addFolder = button(
      "Хавтас зааж нэмэх",
      "Задарсан толины хавтас сонгох",
    );
    addFolder.addEventListener("click", () => pickFiles(true));
    adders.appendChild(addFolder);
  }
  const close = button("Хаах", "Хаах");
  actions.append(adders, close);
  card.append(title, list, empty);
  if (!isCoarsePointer()) {
    const hint = document.createElement("p");
    hint.className = "dict-manager-hint";
    hint.textContent = "Архив, файлууд эсвэл хавтсаар нь энд чирч оруулж болно";
    card.appendChild(hint);
  }
  card.appendChild(actions);
  dialog.appendChild(card);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  addFiles.addEventListener("click", () => pickFiles(false));
  dialog.addEventListener("dragover", (event) => {
    event.preventDefault();
    card.classList.add("dict-manager-dropping");
  });
  dialog.addEventListener("dragleave", (event) => {
    if (event.target === dialog) card.classList.remove("dict-manager-dropping");
  });
  dialog.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("dict-manager-dropping");
    void dropFiles(event.dataTransfer);
  });
  document.body.appendChild(dialog);
  return { dialog, list, empty };
}

function row(dict: DictInfo, index: number): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "dict-manager-row";
  const label = document.createElement("span");
  label.className = "dict-manager-name";
  label.textContent = dict.name || dict.id;
  const meta = document.createElement("span");
  meta.className = "dict-manager-meta";
  meta.textContent =
    dict.words.toLocaleString("mn-MN") +
    " үгтэй" +
    (dict.user ? "" : " · суурилуулсан");
  label.appendChild(meta);
  const up = iconButton("up", "Дээш зөөх");
  up.disabled = index === 0;
  up.addEventListener("click", () => void move(index, -1));
  const down = iconButton("down", "Доош зөөх");
  down.disabled = index === current.length - 1;
  down.addEventListener("click", () => void move(index, 1));
  item.append(label, up, down);
  if (dict.user) {
    const rename = iconButton("rename", "Нэр солих");
    rename.addEventListener("click", () => void renameAt(index));
    const remove = iconButton("remove", "Устгах");
    remove.addEventListener("click", () => void removeAt(index));
    item.append(rename, remove);
  }
  return item;
}

function draw(): void {
  if (!view) return;
  view.list.replaceChildren(...current.map(row));
  view.empty.hidden = current.length > 0;
}

async function refresh(): Promise<void> {
  if (!deps) return;
  current = await deps.list();
  draw();
}

async function move(index: number, delta: number): Promise<void> {
  if (!deps) return;
  current = moveItem(current, index, delta);
  draw();
  await saveDictOrder(current.map((dict) => dict.id));
  deps.reorder();
  deps.changed();
}

async function renameAt(index: number): Promise<void> {
  const dict = current[index];
  const key = dict ? userKeyOf(dict.id) : null;
  if (!deps || !dict || key == null) return;
  const label = prompt("Толины нэр", dict.name);
  if (label == null) return;
  const name = label.trim() || key;
  if (name === dict.name) return;
  await renameUserDict(key, name);
  current = current.map((item, position) =>
    position === index ? { ...item, name } : item,
  );
  draw();
  deps.reload();
  deps.changed();
}

async function removeAt(index: number): Promise<void> {
  const dict = current[index];
  const key = dict ? userKeyOf(dict.id) : null;
  if (!deps || !dict || key == null) return;
  if (!confirm("«" + dict.name + "» толийг устгах уу?")) return;
  await removeUserDict(key);
  current = current.filter((_, position) => position !== index);
  draw();
  deps.reload();
  deps.changed();
  deps.status("Толь устгагдлаа: " + dict.name);
}

const DICT_ACCEPT = [
  ".ifo",
  ".idx",
  ".dict",
  ".syn",
  ".dz",
  ".gz",
  ".zip",
  ".tar",
  ".tgz",
  ".bz2",
  ".tbz2",
  ".tbz",
].join(",");

function isCoarsePointer(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

async function importFiles(files: File[]): Promise<void> {
  if (!files.length || !deps) return;
  deps.status("Толь нэмж байна…");
  const { added, updated, skipped, incomplete, failed } = await importDictFiles(
    files,
    current,
  );
  const parts: string[] = [];
  if (added.length) parts.push("Нэмэгдсэн: " + added.join(", "));
  if (updated.length) parts.push("Шинэчлэгдсэн: " + updated.join(", "));
  if (skipped.length) parts.push("Аль хэдийн байгаа: " + skipped.join(", "));
  if (incomplete.length)
    parts.push(
      "Уншиж чадсангүй, бүх файлыг сонгоно уу: *.ifo, *.idx.gz, *.dict.dz",
    );
  if (failed.length) parts.push("Уншиж чадсангүй: " + failed.join(", "));
  deps.status(parts.join(". ") || "StarDict файл олдсонгүй");
  if (!added.length && !updated.length) return;
  deps.reload();
  deps.changed();
  await refresh();
}

function supportsDirectoryPicker(): boolean {
  return "webkitdirectory" in HTMLInputElement.prototype && !isCoarsePointer();
}

function pickFiles(directory = false): void {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  if (directory && "webkitdirectory" in input) input.webkitdirectory = true;
  else if (!isCoarsePointer()) input.accept = DICT_ACCEPT;
  input.addEventListener("change", () => {
    void importFiles([...(input.files ?? [])]);
  });
  input.click();
}

function readEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = [];
    const next = (): void =>
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(out);
          return;
        }
        out.push(...batch);
        next();
      }, reject);
    next();
  });
}

async function filesOf(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile)
    return [
      await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      ),
    ];
  if (!entry.isDirectory) return [];
  const children = await readEntries(
    (entry as FileSystemDirectoryEntry).createReader(),
  );
  return (await Promise.all(children.map(filesOf))).flat();
}

async function dropFiles(data: DataTransfer | null): Promise<void> {
  if (!data) return;
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) loose.push(file);
    }
  }
  const nested = await Promise.all(entries.map(filesOf));
  await importFiles([...loose, ...nested.flat()]);
}

export async function openDictManager(next: DictManagerDeps): Promise<void> {
  deps = next;
  view ??= createView();
  await refresh();
  if (!view.dialog.open) view.dialog.showModal();
}
