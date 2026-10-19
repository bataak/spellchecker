export interface DroppedFile {
  readonly file: File;
  readonly handle: FileSystemFileHandle | null;
}

export interface FileDropDeps {
  readonly openFiles: (entries: DroppedFile[]) => Promise<void>;
  readonly openDir: (handle: FileSystemDirectoryHandle) => Promise<void>;
}

function hasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return !!types && Array.from(types).includes("Files");
}

export function initFileDrop(target: HTMLElement, deps: FileDropDeps): void {
  target.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    target.classList.add("drag-over");
  });
  target.addEventListener("dragleave", () =>
    target.classList.remove("drag-over"),
  );
  target.addEventListener("drop", async (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    target.classList.remove("drag-over");
    const dt = event.dataTransfer;
    if (!dt) return;
    const files = [...dt.files];
    const handles = await Promise.all(
      [...dt.items]
        .filter((item) => item.kind === "file")
        .map((item) =>
          item.getAsFileSystemHandle
            ? item.getAsFileSystemHandle().catch(() => null)
            : Promise.resolve(null),
        ),
    );
    const dir = handles.find((handle) => handle?.kind === "directory");
    if (dir) {
      await deps.openDir(dir as FileSystemDirectoryHandle);
      return;
    }
    const entries: DroppedFile[] = [];
    for (const [index, file] of files.entries()) {
      const handle = handles[index];
      const own =
        handle?.kind === "file" ? (handle as FileSystemFileHandle) : null;
      entries.push({ file: own ? await own.getFile() : file, handle: own });
    }
    await deps.openFiles(entries);
  });
}
