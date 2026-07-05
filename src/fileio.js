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
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const ts =
      d.getFullYear() +
      "-" +
      p(d.getMonth() + 1) +
      "-" +
      p(d.getDate()) +
      "-" +
      p(d.getHours()) +
      p(d.getMinutes());
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
    const a = document.createElement("a");
    a.href = url;
    a.download = ensureTxt(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
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
        const w = await currentFileHandle.createWritable();
        await w.write(text);
        await w.close();
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
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
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
      : new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsText(file);
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
      const f = openFileEl.files && openFileEl.files[0];
      if (!f) return;
      if (!sizeOk(f)) {
        openFileEl.value = "";
        return;
      }
      try {
        await loadFileContent(await readAsText(f), f.name, null);
      } catch (_) {
        flash("#openBtn", "Боломжгүй");
      }
      openFileEl.value = "";
    });
  }

  function sizeOk(f) {
    if (!f) return true;
    if (f.size > MAX_OPEN_BYTES) {
      setStatus(
        "Файл хэт том байна (" +
          toMb(f.size) +
          " MB) — 10 мегабайтаас хэтэрч болохгүй",
      );
      flash("#openBtn", "Хэт том");
      return false;
    }
    if (f.size > BIG_NOTICE_BYTES) {
      setStatus(
        "Том файл (" + toMb(f.size) + " MB) уншиж буй тул шалгалт удна",
      );
    }
    return true;
  }

  function toMb(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1);
  }

  function dragHasFiles(e) {
    const t = e.dataTransfer && e.dataTransfer.types;
    return !!t && Array.from(t).includes("Files");
  }
  function isTextFile(f) {
    return (
      !!f &&
      ((f.type && f.type.indexOf("text/") === 0) ||
        /\.txt$/i.test(f.name) ||
        !f.type)
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
        const h = await item.getAsFileSystemHandle();
        if (h && h.kind === "file") handle = h;
      } catch (_) {}
    }
    try {
      const f = handle ? await handle.getFile() : dt && dt.files && dt.files[0];
      if (!isTextFile(f)) return;
      if (!sizeOk(f)) return;
      await loadFileContent(await readAsText(f), f.name, handle);
    } catch (_) {}
  });
}
