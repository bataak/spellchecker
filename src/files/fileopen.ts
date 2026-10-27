import { noteError } from "../core/errorlog.ts";
import { decodeFileBytes } from "../archive/cp1251.ts";
import { bytesSum, fileSum } from "../slots/fileslots.ts";
import { initFileDrop } from "./filedrop.ts";
import {
  OPEN_TYPES,
  isTextFile,
  isZip,
  looksOffice,
  sizeVerdict,
  toMb,
} from "./filetypes.ts";
import type { DraftFile } from "../core/storage.ts";
import { flash } from "../ui/clipboard.ts";
import type { EditorPort, StatusPort } from "../core/ports.ts";
import type {
  CurrentFile,
  FileButtons,
  OfficeFiles,
  ProjectFiles,
} from "./fileports.ts";

export interface FileOpenDeps {
  readonly editor: EditorPort;
  readonly buttons: FileButtons;
  readonly status: StatusPort;
  readonly current: CurrentFile;
  readonly office: OfficeFiles;
  readonly project: ProjectFiles;
  readonly onFileOpened: (file: DraftFile | null) => void;
  readonly prepareOpen: (
    name: string,
    hash: string,
    text: string | null,
  ) => Promise<"new" | "open" | "reload" | false>;
  readonly onLoaded: () => void;
}

type Entry = { file: File; handle: FileSystemFileHandle | null };

function sizeOk(
  file: File,
  setStatus: StatusPort["set"],
  opened: (label: string) => void,
): boolean {
  const verdict = sizeVerdict(file.size);
  if (verdict === "too-big") {
    setStatus(
      "Файл хэт том байна (" +
        toMb(file.size) +
        " MB) — 10 мегабайтаас хэтэрч болохгүй",
    );
    opened("Хэт том");
    return false;
  }
  if (verdict === "big")
    setStatus(
      "Том файл (" + toMb(file.size) + " MB) уншиж буй тул шалгалт удна",
    );
  return true;
}

export type OpenEntries = (entries: readonly Entry[]) => Promise<void>;

export function initFileOpen(d: FileOpenDeps): OpenEntries {
  const { current, editor, buttons } = d;
  const opened = (label: string): void => flash(buttons.open, label);

  async function loadFileContent(
    content: string,
    name: string | null,
    handle: FileSystemFileHandle | null,
  ): Promise<void> {
    d.office.close();
    current.handle = handle || null;
    current.name = name || (handle && handle.name) || null;
    d.onFileOpened(current.name ? { name: current.name, kind: "text" } : null);
    editor.set(content, content.length);
    d.onLoaded();
    void editor.settle();
    opened("Нээлээ");
  }

  async function openOffice(file: File): Promise<void> {
    current.handle = null;
    current.name = null;
    d.onFileOpened({ name: file.name, kind: "office" });
    await d.office.open(file);
    opened("Нээлээ");
  }

  async function openOne(
    file: File,
    handle: FileSystemFileHandle | null,
  ): Promise<boolean> {
    if (isZip(file.name)) {
      await d.project.openZip(file);
      return true;
    }
    const office = looksOffice(file);
    if (!office && !isTextFile(file)) {
      d.status.set("Файлыг нээх боломжгүй", true);
      opened("Нээх боломжгүй");
      return true;
    }
    if (!office && !sizeOk(file, d.status.set, opened)) return true;
    const bytes = office ? null : new Uint8Array(await file.arrayBuffer());
    const text = bytes ? decodeFileBytes(bytes) : "";
    if (!office && d.project.openExisting(file.name, text)) {
      opened("Нээлээ");
      return true;
    }
    const prepared = await d.prepareOpen(
      file.name,
      bytes ? bytesSum(bytes) : await fileSum(file),
      office ? null : text,
    );
    if (prepared === "reload") {
      await loadFileContent(text, file.name, handle);
      return true;
    }
    if (prepared === "open") {
      if (handle) {
        current.handle = handle;
        current.name = file.name;
      }
      opened("Нээлттэй байна");
      return true;
    }
    if (!prepared) return false;
    if (office) await openOffice(file);
    else await loadFileContent(text, file.name, handle);
    return true;
  }

  async function openAll(entries: readonly Entry[]): Promise<void> {
    for (const { file, handle } of entries) {
      try {
        if (!(await openOne(file, handle))) return;
      } catch (error) {
        noteError(error);
        opened("Боломжгүй");
      }
    }
  }

  bindPicker(buttons, openAll, opened);
  initFileDrop(editor.el, {
    openFiles: openAll,
    openDir: d.project.openDir,
  });
  return openAll;
}

function bindPicker(
  { pick: pickBtn, input: openFileEl }: FileButtons,
  openAll: OpenEntries,
  opened: (label: string) => void,
) {
  if (!pickBtn || !openFileEl) return;
  pickBtn.addEventListener("click", async () => {
    if (!("showOpenFilePicker" in window)) {
      openFileEl.click();
      return;
    }
    let handles: FileSystemFileHandle[];
    try {
      handles = await window.showOpenFilePicker!({
        types: OPEN_TYPES,
        multiple: true,
      });
    } catch (e) {
      if (!(e instanceof DOMException) || e.name !== "AbortError")
        opened("Боломжгүй");
      return;
    }
    const entries = [];
    for (const handle of handles)
      entries.push({ file: await handle.getFile(), handle });
    await openAll(entries);
  });
  openFileEl.addEventListener("change", async () => {
    const files = [...(openFileEl.files ?? [])];
    openFileEl.value = "";
    await openAll(files.map((file) => ({ file, handle: null })));
  });
}
