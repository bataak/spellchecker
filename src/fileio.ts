import { decodeFileBytes } from "./archive/cp1251.ts";
import { bytesSum, fileSum } from "./fileslots.ts";
import { initFileDrop } from "./filedrop.ts";
import {
  OPEN_TYPES,
  isTextFile,
  isZip,
  looksOffice,
  restoredName,
  saveTypes,
  sizeVerdict,
  stampName,
  textName,
  toMb,
} from "./filetypes.ts";
import type { DraftFile } from "./storage.ts";
import { deliverText, isDesktopApp } from "./textfile.ts";
import { flash } from "./clipboard.ts";
import type { EditorPort, StatusPort } from "./ports.ts";
import { attemptAsync } from "./attempt.ts";

export interface OfficeFiles {
  readonly active: () => boolean;
  readonly open: (file: File) => Promise<boolean>;
  readonly close: () => void;
  readonly save: () => Promise<boolean>;
}

export interface ProjectFiles {
  readonly save: () => Promise<string | null>;
  readonly openZip: (file: File) => Promise<void>;
  readonly openDir: (handle: FileSystemDirectoryHandle) => Promise<void>;
  readonly openExisting: (name: string, text: string) => boolean;
}

export interface PdfSave {
  readonly applies: () => boolean;
  readonly save: () => Promise<void>;
}

export interface FileIODeps {
  readonly editor: EditorPort;
  readonly status: StatusPort;
  readonly office: OfficeFiles;
  readonly project: ProjectFiles;
  readonly pdf: PdfSave;
  readonly defaultExt: () => string;
  readonly onFileOpened: (file: DraftFile | null) => void;
  readonly prepareOpen: (
    name: string,
    hash: string,
    text: string | null,
  ) => "new" | "open" | "reload" | false;
  readonly onLoaded: () => void;
  readonly onSaved: (written: boolean) => void;
}

export interface OpenFile {
  readonly handle: FileSystemFileHandle | null;
  readonly name: string;
}

export interface FileIOControl {
  forgetFile: () => void;
  takeFile: () => OpenFile | null;
  putFile: (file: OpenFile | null) => void;
  restoreFile: (ref: DraftFile) => void;
  targetName: () => string | null;
  targetHandle: () => FileSystemFileHandle | null;
  saveSource: (name: string, inProject: boolean) => Promise<void>;
}

export function initFileIO({
  editor,
  status,
  office: docs,
  project,
  pdf,
  defaultExt,
  onFileOpened,
  prepareOpen,
  onLoaded,
  onSaved,
}: FileIODeps): FileIOControl {
  const setStatus = status.set;
  const hasFSSave = "showSaveFilePicker" in window;
  const hasFSOpen = "showOpenFilePicker" in window;
  let currentFileHandle: FileSystemFileHandle | null = null;
  let currentFileName: string | null = null;

  const stamp = (): string =>
    stampName(
      defaultExt(),
      window.matchMedia?.("(max-width: 700px)").matches ?? false,
      new Date(),
    );

  const deliver = (text: string, name: string): Promise<boolean> =>
    deliverText(text, textName(name, defaultExt(), stamp));

  async function openOne(
    file: File,
    handle: FileSystemFileHandle | null,
  ): Promise<boolean> {
    if (isZip(file.name)) {
      await project.openZip(file);
      return true;
    }
    const office = looksOffice(file);
    if (!office && !isTextFile(file)) {
      refuse();
      return true;
    }
    if (!office && !sizeOk(file)) return true;
    const bytes = office ? null : new Uint8Array(await file.arrayBuffer());
    const text = bytes ? decodeFileBytes(bytes) : "";
    if (!office && project.openExisting(file.name, text)) {
      flash("#openBtn", "Нээлээ");
      return true;
    }
    const prepared = prepareOpen(
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
        currentFileHandle = handle;
        currentFileName = file.name;
      }
      flash("#openBtn", "Нээлттэй байна");
      return true;
    }
    if (!prepared) return false;
    if (office) {
      currentFileHandle = null;
      currentFileName = null;
      onFileOpened({ name: file.name, kind: "office" });
      await docs.open(file);
      flash("#openBtn", "Нээлээ");
      return true;
    }
    await loadFileContent(text, file.name, handle);
    return true;
  }

  async function openAll(
    entries: readonly { file: File; handle: FileSystemFileHandle | null }[],
  ): Promise<void> {
    for (const { file, handle } of entries) {
      try {
        if (!(await openOne(file, handle))) return;
      } catch {
        flash("#openBtn", "Боломжгүй");
      }
    }
  }

  async function save(source?: {
    readonly name: string;
    readonly inProject: boolean;
  }): Promise<void> {
    if (docs.active()) {
      try {
        flash("#saveBtn", (await docs.save()) ? "Хадгаллаа" : "Цуцаллаа");
      } catch {
        flash("#saveBtn", "Боломжгүй");
      }
      return;
    }

    if (!source && pdf.applies()) {
      await pdf.save();
      return;
    }

    if (!source) {
      try {
        const label = await project.save();
        if (label !== null) {
          flash("#saveBtn", label);
          return;
        }
      } catch {
        flash("#saveBtn", "Боломжгүй");
        return;
      }
    }

    const text = editor.el.value || "";
    const saved = (written: boolean): void => {
      if (!source?.inProject) onSaved(written);
    };

    if (
      currentFileHandle &&
      (!source || (!source.inProject && source.name === currentFileName))
    ) {
      const handle = currentFileHandle;
      const written = await attemptAsync(async () => {
        const writableStream = await handle.createWritable();
        await writableStream.write(text);
        await writableStream.close();
        return true;
      }, false);
      if (written) {
        flash("#saveBtn", "Хадгаллаа");
        saved(true);
        return;
      }
    }

    const fileName = source?.name ?? currentFileName;
    if (!text.trim() && !fileName) {
      flash("#saveBtn", "Хоосон байна");
      return;
    }

    if (fileName) {
      try {
        const done = await deliver(text, fileName);
        flash("#saveBtn", done ? "Хадгалав" : "Цуцаллаа");
        if (done) saved(false);
      } catch {
        flash("#saveBtn", "Боломжгүй");
      }
      return;
    }

    if (isDesktopApp() && hasFSSave) {
      try {
        const handle = await window.showSaveFilePicker!({
          suggestedName: stamp(),
          types: saveTypes(defaultExt()),
        });
        const writableStream = await handle.createWritable();
        await writableStream.write(text);
        await writableStream.close();
        currentFileHandle = handle;
        flash("#saveBtn", "Хадгаллаа");
        onSaved(true);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }

    try {
      const done = await deliver(text, stamp());
      flash("#saveBtn", done ? "Хадгаллаа" : "Цуцаллаа");
    } catch {
      flash("#saveBtn", "Боломжгүй");
    }
  }

  document
    .querySelector("#saveBtn")!
    .addEventListener("click", () => void save());

  async function loadFileContent(
    content: string,
    name: string | null,
    handle: FileSystemFileHandle | null,
  ): Promise<void> {
    docs.close();
    currentFileHandle = handle || null;
    currentFileName = name || (handle && handle.name) || null;
    onFileOpened(
      currentFileName ? { name: currentFileName, kind: "text" } : null,
    );
    editor.set(content, content.length);
    onLoaded();
    void editor.settle();
    flash("#openBtn", "Нээлээ");
  }

  const openFileEl = document.querySelector<HTMLInputElement>("#openFile");
  const openBtn = document.querySelector<HTMLElement>("#openBtn");
  if (openBtn && openFileEl) {
    openBtn.addEventListener("click", async () => {
      if (!hasFSOpen) {
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
          flash("#openBtn", "Боломжгүй");
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

  function refuse(): void {
    setStatus("Файлыг нээх боломжгүй", true);
    flash("#openBtn", "Нээх боломжгүй");
  }

  function sizeOk(file: File): boolean {
    const verdict = sizeVerdict(file.size);
    if (verdict === "too-big") {
      setStatus(
        "Файл хэт том байна (" +
          toMb(file.size) +
          " MB) — 10 мегабайтаас хэтэрч болохгүй",
      );
      flash("#openBtn", "Хэт том");
      return false;
    }
    if (verdict === "big")
      setStatus(
        "Том файл (" + toMb(file.size) + " MB) уншиж буй тул шалгалт удна",
      );
    return true;
  }

  initFileDrop(editor.el, {
    openFiles: openAll,
    openDir: project.openDir,
  });

  return {
    saveSource: (name, inProject) => save({ name, inProject }),
    forgetFile() {
      currentFileHandle = null;
      currentFileName = null;
      onFileOpened(null);
    },
    takeFile() {
      const file = currentFileName
        ? { handle: currentFileHandle, name: currentFileName }
        : null;
      currentFileHandle = null;
      currentFileName = null;
      return file;
    },
    putFile(file: OpenFile | null) {
      currentFileHandle = file ? file.handle : null;
      currentFileName = file ? file.name : null;
    },
    restoreFile(ref: DraftFile) {
      currentFileHandle = null;
      currentFileName = restoredName(ref);
    },
    targetName() {
      return currentFileName;
    },
    targetHandle() {
      return currentFileHandle;
    },
  };
}
