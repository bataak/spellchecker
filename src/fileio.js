export function initFileIO({
  els,
  flash,
  setStatus,
  setEditorText,
  hidePopover,
  render,
  saveText,
}) {
  const MAX_OPEN_BYTES = 10 * 1024 * 1024;
  const BIG_NOTICE_BYTES = 2 * 1024 * 1024;
  const hasFSSave = "showSaveFilePicker" in window;
  const hasFSOpen = "showOpenFilePicker" in window;
  let currentFileHandle = null;
  let currentFileName = null;

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
    const pad2 = (num) => String(num).padStart(2, "0");
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

  function ensureTxt(name) {
    name = (name || "").trim();
    if (!name) return stampName();
    return /\.txt$/i.test(name) ? name : name + ".txt";
  }

  function downloadText(text, name) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = ensureTxt(name);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const TXT_TYPES = [
    { description: "Текст файл", accept: { "text/plain": [".txt"] } },
  ];

  document.querySelector("#saveBtn").addEventListener("click", async () => {
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
        const handle = await window.showSaveFilePicker({
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
        if (e && e.name === "AbortError") return;
      }
    }

    try {
      downloadText(text, stampName());
      flash("#saveBtn", "Хадгаллаа");
    } catch (_) {
      flash("#saveBtn", "Боломжгүй");
    }
  });

  function readAsText(file) {
    return file.text
      ? file.text()
      : new Promise((resolve, reject) => {
          const fileReader = new FileReader();
          fileReader.onload = () => resolve(String(fileReader.result));
          fileReader.onerror = reject;
          fileReader.readAsText(file);
        });
  }

  async function loadFileContent(content, name, handle) {
    currentFileHandle = handle || null;
    currentFileName = name || (handle && handle.name) || null;
    setEditorText(content, content.length);
    hidePopover();
    render();
    saveText();
    flash("#openBtn", "Нээлээ");
  }

  const openFileEl = document.querySelector("#openFile");
  const openBtn = document.querySelector("#openBtn");
  if (openBtn && openFileEl) {
    openBtn.addEventListener("click", async () => {
      if (hasFSOpen) {
        try {
          const [handle] = await window.showOpenFilePicker({
            types: TXT_TYPES,
            multiple: false,
          });
          const file = await handle.getFile();
          if (!sizeOk(file)) return;
          await loadFileContent(await file.text(), file.name, handle);
        } catch (e) {
          if (e && e.name !== "AbortError") flash("#openBtn", "Боломжгүй");
        }
      } else {
        openFileEl.click();
      }
    });
    openFileEl.addEventListener("change", async () => {
      const selectedFile = openFileEl.files && openFileEl.files[0];
      if (!selectedFile) return;
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

  function sizeOk(file) {
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

  function toMb(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1);
  }

  function dragHasFiles(e) {
    const transferTypes = e.dataTransfer && e.dataTransfer.types;
    return !!transferTypes && Array.from(transferTypes).includes("Files");
  }
  function isTextFile(file) {
    return (
      !!file &&
      ((file.type && file.type.indexOf("text/") === 0) ||
        /\.txt$/i.test(file.name) ||
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
    let handle = null;
    const item = dt && dt.items && dt.items[0];
    if (item && item.kind === "file" && item.getAsFileSystemHandle) {
      try {
        const fsHandle = await item.getAsFileSystemHandle();
        if (fsHandle && fsHandle.kind === "file") handle = fsHandle;
      } catch (_) {}
    }
    try {
      const droppedFile = handle
        ? await handle.getFile()
        : dt && dt.files && dt.files[0];
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
