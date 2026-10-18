import { decodeFileBytes } from "./archive/cp1251.ts";
import { bytesSum, fileSum } from "./fileslots.ts";
import type { DraftFile } from "./storage.ts";

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
  const MAX_OPEN_BYTES = 10 * 1024 * 1024;
  const BIG_NOTICE_BYTES = 2 * 1024 * 1024;
  const hasFSSave = "showSaveFilePicker" in window;
  const hasFSOpen = "showOpenFilePicker" in window;
  let currentFileHandle: FileSystemFileHandle | null = null;
  let currentFileName: string | null = null;

  function isDesktopApp() {
    if (!window.matchMedia) return false;
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches;
    return installed && window.matchMedia("(pointer: fine)").matches;
  }

  function stampName() {
    const now = new Date();
    const pad2 = (num: number): string => String(num).padStart(2, "0");
    const ts =
      now.getFullYear() +
      "-" +
      pad2(now.getMonth() + 1) +
      "-" +
      pad2(now.getDate()) +
      "-" +
      pad2(now.getHours()) +
      pad2(now.getMinutes());
    const isMobile =
      window.matchMedia && window.matchMedia("(max-width: 700px)").matches;
    return (isMobile ? "" : "бичвэр-") + ts + "." + defaultExt();
  }

  const OFFICE_EXT_RE = /\.(docx|pptx|odt|odp|pdf)$/i;
  const TEXT_EXT_RE = /\.(txt|md|markdown|mdown|text|tex|ltx)$/i;
  const MD_EXT_RE = /\.(md|markdown|mdown)$/i;
  const TEX_EXT_RE = /\.(tex|ltx)$/i;

  function ensureTextName(name: string): string {
    name = (name || "").trim();
    if (!name) return stampName();
    return TEXT_EXT_RE.test(name) ? name : name + "." + defaultExt();
  }

  function textMime(name: string): string {
    if (TEX_EXT_RE.test(name)) return "text/x-tex;charset=utf-8";
    return MD_EXT_RE.test(name)
      ? "text/markdown;charset=utf-8"
      : "text/plain;charset=utf-8";
  }

  function downloadText(text: string, name: string): void {
    const fileName = ensureTextName(name);
    const blob = new Blob([text], { type: textMime(fileName) });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function deliverText(text: string, name: string): Promise<boolean> {
    const fileName = ensureTextName(name);
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (touch && typeof navigator.canShare === "function") {
      const file = new File([text], fileName, { type: "text/plain" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return true;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError")
            return false;
        }
      }
    }
    downloadText(text, fileName);
    return true;
  }

  const TXT_TYPES = [
    { description: "Текст файл", accept: { "text/plain": [".txt"] } },
  ];

  const MD_TYPES = [
    { description: "Markdown файл", accept: { "text/markdown": [".md"] } },
  ];

  const TEX_TYPES = [
    { description: "LaTeX файл", accept: { "text/x-tex": [".tex"] } },
  ];

  function saveTypes() {
    const ext = defaultExt();
    return ext === "md" ? MD_TYPES : ext === "tex" ? TEX_TYPES : TXT_TYPES;
  }

  const PDF_MIME = "application/pdf";

  const OFFICE_MIME: Record<string, string> = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text",
    odp: "application/vnd.oasis.opendocument.presentation",
  };

  const OPEN_TYPES: {
    description: string;
    accept: Record<string, string[]>;
  }[] = [
    {
      description: "Текст файл",
      accept: { "text/plain": [".txt", ".md", ".markdown", ".text"] },
    },
    {
      description: "LaTeX файл",
      accept: { "text/x-tex": [".tex", ".ltx"] },
    },
    {
      description: "Баримт",
      accept: {
        [OFFICE_MIME.docx]: [".docx"],
        [OFFICE_MIME.pptx]: [".pptx"],
        [OFFICE_MIME.odt]: [".odt"],
        [OFFICE_MIME.odp]: [".odp"],
      },
    },
    {
      description: "PDF",
      accept: { [PDF_MIME]: [".pdf"] },
    },
    {
      description: "LaTeX төсөл (zip)",
      accept: { "application/zip": [".zip"] },
    },
  ];

  function looksDocx(file: File | null | undefined): boolean {
    if (!file) return false;
    if (file.type === PDF_MIME) return true;
    if (Object.values(OFFICE_MIME).includes(file.type)) return true;
    return /\.(docx|pptx|odt|odp|pdf)$/i.test(file.name);
  }

  async function openOne(
    file: File,
    handle: FileSystemFileHandle | null,
  ): Promise<boolean> {
    if (/\.zip$/i.test(file.name)) {
      await openProjectZip(file);
      return true;
    }
    const office = looksDocx(file);
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
        const done = await deliverText(text, fileName);
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
          suggestedName: stampName(),
          types: saveTypes(),
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
      const done = await deliverText(text, stampName());
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

  function sizeOk(file: File | null | undefined): boolean {
    if (!file) return true;
    if (file.size > MAX_OPEN_BYTES) {
      setStatus(
        "Файл хэт том байна (" +
          toMb(file.size) +
          " MB) — 10 мегабайтаас хэтэрч болохгүй",
      );
      flash("#openBtn", "Хэт том");
      return false;
    }
    if (file.size > BIG_NOTICE_BYTES) {
      setStatus(
        "Том файл (" + toMb(file.size) + " MB) уншиж буй тул шалгалт удна",
      );
    }
    return true;
  }

  function toMb(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1);
  }

  function dragHasFiles(e: DragEvent): boolean {
    const transferTypes = e.dataTransfer && e.dataTransfer.types;
    return !!transferTypes && Array.from(transferTypes).includes("Files");
  }
  function isTextFile(file: File | null | undefined): file is File {
    return (
      !!file &&
      ((file.type && file.type.indexOf("text/") === 0) ||
        TEXT_EXT_RE.test(file.name) ||
        !file.type)
    );
  }
  els.editor.addEventListener("dragover", (e) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    els.editor.classList.add("drag-over");
  });
  els.editor.addEventListener("dragleave", () =>
    els.editor.classList.remove("drag-over"),
  );
  els.editor.addEventListener("drop", async (e) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    els.editor.classList.remove("drag-over");
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = [...dt.files];
    const pending = [...dt.items]
      .filter((item) => item.kind === "file")
      .map((item) =>
        item.getAsFileSystemHandle
          ? item.getAsFileSystemHandle().catch(() => null)
          : Promise.resolve(null),
      );
    const handles = await Promise.all(pending);
    const dir = handles.find((handle) => handle?.kind === "directory");
    if (dir) {
      await openProjectDir(dir as FileSystemDirectoryHandle);
      return;
    }
    const entries = [];
    for (const [index, file] of files.entries()) {
      const handle = handles[index];
      entries.push({
        file: handle?.kind === "file" ? await (handle as FileSystemFileHandle).getFile() : file,
        handle: handle?.kind === "file" ? (handle as FileSystemFileHandle) : null,
      });
    }
    await openAll(entries);
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
      currentFileName =
        ref.kind === "office"
          ? ref.name.replace(OFFICE_EXT_RE, "") + ".txt"
          : ref.name;
    },
    targetName() {
      return currentFileName;
    },
    targetHandle() {
      return currentFileHandle;
    },
  };
}
