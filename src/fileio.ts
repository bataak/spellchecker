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

export interface FileIODeps {
  els: { editor: HTMLTextAreaElement };
  openDocxFile: (file: File) => Promise<boolean>;
  closeDocx: () => void;
  isDocxActive: () => boolean;
  docxSave: () => Promise<boolean>;
  flash: (sel: string, msg: string) => void;
  setStatus: (html: string, animate?: boolean) => void;
  setEditorText: (text: string, caret: number | null) => void;
  hidePopover: () => void;
  render: () => Promise<void> | void;
  saveText: () => void;
  defaultExt: () => string;
  onFileOpened: (file: DraftFile | null) => void;
  saveProject: () => Promise<string | null>;
  savesPdf: () => boolean;
  savePdf: () => Promise<void>;
  openProjectZip: (file: File) => Promise<void>;
  openProjectDir: (handle: FileSystemDirectoryHandle) => Promise<void>;
  prepareOpen: (
    name: string,
    hash: string,
    text: string | null,
  ) => "new" | "open" | "reload" | false;
  openInProject: (name: string, text: string) => boolean;
  onLoaded: () => void;
  onSaved: (written: boolean) => void;
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
  els,
  openDocxFile,
  closeDocx,
  isDocxActive,
  docxSave,
  flash,
  setStatus,
  setEditorText,
  hidePopover,
  render,
  saveText,
  defaultExt,
  onFileOpened,
  saveProject,
  savesPdf,
  savePdf,
  openProjectZip,
  openProjectDir,
  prepareOpen,
  openInProject,
  onLoaded,
  onSaved,
}: FileIODeps): FileIOControl {
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
      await openProjectZip(file);
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
    if (!office && openInProject(file.name, text)) {
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
      await openDocxFile(file);
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
      } catch (_) {
        flash("#openBtn", "Боломжгүй");
      }
    }
  }

  async function save(source?: {
    readonly name: string;
    readonly inProject: boolean;
  }): Promise<void> {
    if (isDocxActive()) {
      try {
        flash("#saveBtn", (await docxSave()) ? "Хадгаллаа" : "Цуцаллаа");
      } catch (_) {
        flash("#saveBtn", "Боломжгүй");
      }
      return;
    }

    if (!source && savesPdf()) {
      await savePdf();
      return;
    }

    if (!source) {
      try {
        const label = await saveProject();
        if (label !== null) {
          flash("#saveBtn", label);
          return;
        }
      } catch (_) {
        flash("#saveBtn", "Боломжгүй");
        return;
      }
    }

    const text = els.editor.value || "";
    const saved = (written: boolean): void => {
      if (!source?.inProject) onSaved(written);
    };

    if (
      currentFileHandle &&
      (!source || (!source.inProject && source.name === currentFileName))
    ) {
      try {
        const writableStream = await currentFileHandle.createWritable();
        await writableStream.write(text);
        await writableStream.close();
        flash("#saveBtn", "Хадгаллаа");
        saved(true);
        return;
      } catch (_) {}
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
      } catch (_) {
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
    } catch (_) {
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
    closeDocx();
    currentFileHandle = handle || null;
    currentFileName = name || (handle && handle.name) || null;
    onFileOpened(
      currentFileName ? { name: currentFileName, kind: "text" } : null,
    );
    setEditorText(content, content.length);
    onLoaded();
    hidePopover();
    render();
    saveText();
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

  initFileDrop(els.editor, {
    openFiles: openAll,
    openDir: openProjectDir,
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
