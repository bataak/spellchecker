export interface FileIODeps {
  els: { editor: HTMLTextAreaElement };
  openDocxFile: (file: File) => Promise<boolean>;
  closeDocx: () => void;
  isDocxActive: () => boolean;
  docxSave: () => Promise<void>;
  flash: (sel: string, msg: string) => void;
  setStatus: (html: string, animate?: boolean) => void;
  setEditorText: (text: string, caret: number | null) => void;
  hidePopover: () => void;
  render: () => Promise<void> | void;
  saveText: () => void;
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
}: FileIODeps): void {
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
    return (isMobile ? "" : "бичвэр-") + ts + ".txt";
  }

  const TEXT_EXT_RE = /\.(txt|md|markdown|mdown|text)$/i;
  const MD_EXT_RE = /\.(md|markdown|mdown)$/i;

  function ensureTextName(name: string): string {
    name = (name || "").trim();
    if (!name) return stampName();
    return TEXT_EXT_RE.test(name) ? name : name + ".txt";
  }

  function textMime(name: string): string {
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

  const TXT_TYPES = [
    { description: "Текст файл", accept: { "text/plain": [".txt"] } },
  ];

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
  ];

  function looksDocx(file: File | null | undefined): boolean {
    if (!file) return false;
    if (file.type === PDF_MIME) return true;
    if (Object.values(OFFICE_MIME).includes(file.type)) return true;
    return /\.(docx|pptx|odt|odp|pdf)$/i.test(file.name);
  }

  async function tryDocx(file: File): Promise<boolean> {
    if (!looksDocx(file)) return false;
    currentFileHandle = null;
    currentFileName = null;
    await openDocxFile(file);
    flash("#openBtn", "Нээлээ");
    return true;
  }

  document.querySelector("#saveBtn")!.addEventListener("click", async () => {
    if (isDocxActive()) {
      try {
        await docxSave();
        flash("#saveBtn", "Хадгаллаа");
      } catch (_) {
        flash("#saveBtn", "Боломжгүй");
      }
      return;
    }

    const text = els.editor.value || "";
    if (!text.trim()) {
      flash("#saveBtn", "Хоосон байна");
      return;
    }

    if (currentFileHandle) {
      try {
        const writableStream = await currentFileHandle.createWritable();
        await writableStream.write(text);
        await writableStream.close();
        flash("#saveBtn", "Хадгаллаа");
        return;
      } catch (_) {}
    }

    if (currentFileName) {
      try {
        downloadText(text, currentFileName);
        flash("#saveBtn", "Хадгалав");
      } catch (_) {
        flash("#saveBtn", "Боломжгүй");
      }
      return;
    }

    if (isDesktopApp() && hasFSSave) {
      try {
        const handle = await window.showSaveFilePicker!({
          suggestedName: stampName(),
          types: TXT_TYPES,
        });
        const writableStream = await handle.createWritable();
        await writableStream.write(text);
        await writableStream.close();
        currentFileHandle = handle;
        flash("#saveBtn", "Хадгаллаа");
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }

    try {
      downloadText(text, stampName());
      flash("#saveBtn", "Хадгаллаа");
    } catch (_) {
      flash("#saveBtn", "Боломжгүй");
    }
  });

  function readAsText(file: File): Promise<string> {
    return file.text
      ? file.text()
      : new Promise((resolve, reject) => {
          const fileReader = new FileReader();
          fileReader.onload = () => resolve(String(fileReader.result));
          fileReader.onerror = reject;
          fileReader.readAsText(file);
        });
  }

  async function loadFileContent(
    content: string,
    name: string | null,
    handle: FileSystemFileHandle | null,
  ): Promise<void> {
    closeDocx();
    currentFileHandle = handle || null;
    currentFileName = name || (handle && handle.name) || null;
    setEditorText(content, content.length);
    hidePopover();
    render();
    saveText();
    flash("#openBtn", "Нээлээ");
  }

  const openFileEl = document.querySelector<HTMLInputElement>("#openFile");
  const openBtn = document.querySelector<HTMLElement>("#openBtn");
  if (openBtn && openFileEl) {
    openBtn.addEventListener("click", async () => {
      if (hasFSOpen) {
        try {
          const [handle] = await window.showOpenFilePicker!({
            types: OPEN_TYPES,
            multiple: false,
          });
          if (!handle) return;
          const file = await handle.getFile();
          if (await tryDocx(file)) return;
          if (!sizeOk(file)) return;
          await loadFileContent(await file.text(), file.name, handle);
        } catch (e) {
          if (!(e instanceof DOMException) || e.name !== "AbortError")
            flash("#openBtn", "Боломжгүй");
        }
      } else {
        openFileEl.click();
      }
    });
    openFileEl.addEventListener("change", async () => {
      const selectedFile = openFileEl.files && openFileEl.files[0];
      if (!selectedFile) return;
      if (await tryDocx(selectedFile)) {
        openFileEl.value = "";
        return;
      }
      if (!sizeOk(selectedFile)) {
        openFileEl.value = "";
        return;
      }
      try {
        await loadFileContent(
          await readAsText(selectedFile),
          selectedFile.name,
          null,
        );
      } catch (_) {
        flash("#openBtn", "Боломжгүй");
      }
      openFileEl.value = "";
    });
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
        /\.(txt|md|markdown|mdown|text)$/i.test(file.name) ||
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
    let handle: FileSystemFileHandle | null = null;
    const item = dt && dt.items && dt.items[0];
    if (item && item.kind === "file" && item.getAsFileSystemHandle) {
      try {
        const fsHandle = await item.getAsFileSystemHandle();
        if (fsHandle && fsHandle.kind === "file")
          handle = fsHandle as FileSystemFileHandle;
      } catch (_) {}
    }
    try {
      const droppedFile = handle
        ? await handle.getFile()
        : dt && dt.files && dt.files[0];
      if (droppedFile && (await tryDocx(droppedFile))) return;
      if (!isTextFile(droppedFile)) return;
      if (!sizeOk(droppedFile)) return;
      await loadFileContent(
        await readAsText(droppedFile),
        droppedFile.name,
        handle,
      );
    } catch (_) {}
  });
}
