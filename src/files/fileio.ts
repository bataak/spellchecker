import { escapeHtml } from "../core/htmlutil.ts";
import { initDownloadHint } from "./download.ts";
import type { SaveChain } from "../ui/savechain.ts";
import { restoredName } from "./filetypes.ts";
import type { DraftFile } from "../core/storage.ts";
import { deliverText } from "./textfile.ts";
import type { EditorPort, StatusPort } from "../core/ports.ts";
import type {
  CurrentFile,
  FileButtons,
  OfficeFiles,
  PdfSave,
  ProjectFiles,
} from "./fileports.ts";
import { createFileSave } from "./filesave.ts";
import { initFileOpen } from "./fileopen.ts";
import { watchFile } from "./filewatch.ts";

export type { OfficeFiles, PdfSave, ProjectFiles } from "./fileports.ts";

export interface FileIODeps {
  readonly editor: EditorPort;
  readonly buttons: FileButtons;
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
  ) => Promise<"new" | "open" | "reload" | false>;
  readonly onLoaded: () => void;
  readonly onSaved: (written: boolean) => void;
  readonly saveChain: SaveChain;
  readonly deliverText?: (text: string, fileName: string) => Promise<boolean>;
  readonly fileDirty?: () => boolean;
  readonly onReturn?: (listener: () => void) => void;
}

export interface OpenFile {
  readonly handle: FileSystemFileHandle | null;
  readonly name: string;
  readonly stamp?: number | null;
}

export interface FileIOControl {
  forgetFile: () => void;
  takeFile: () => OpenFile | null;
  putFile: (file: OpenFile | null) => void;
  restoreFile: (ref: DraftFile) => void;
  targetName: () => string | null;
  targetHandle: () => FileSystemFileHandle | null;
  saveSource: (name: string, inProject: boolean) => Promise<void>;
  openText: (name: string, text: string) => Promise<void>;
}

export function initFileIO(deps: FileIODeps): FileIOControl {
  const { editor, status, office, project, onFileOpened } = deps;
  initDownloadHint(status.hold);
  const current: CurrentFile = { handle: null, name: null, stamp: null };
  const restamp = (): void => {
    const handle = current.handle;
    if (!handle) return;
    void Promise.resolve()
      .then(() => handle.getFile())
      .then((file) => {
        if (current.handle === handle) current.stamp = file.lastModified;
      })
      .catch(() => undefined);
  };

  const save = createFileSave({
    text: () => editor.el.value || "",
    current,
    office,
    project,
    pdf: deps.pdf,
    defaultExt: deps.defaultExt,
    onSaved: (written) => {
      if (written) restamp();
      deps.onSaved(written);
    },
    deliverText: deps.deliverText ?? deliverText,
    button: deps.buttons.save,
  });
  deps.saveChain.handle(() => {
    void save();
    return true;
  });
  const openAll = initFileOpen({
    editor,
    buttons: deps.buttons,
    status,
    current,
    office,
    project,
    onFileOpened,
    prepareOpen: deps.prepareOpen,
    onLoaded: deps.onLoaded,
  });
  if (deps.onReturn)
    watchFile({
      current,
      dirty: deps.fileDirty ?? (() => false),
      reopen: (file, handle) => openAll([{ file, handle }]),
      notify: (message) => status.hold(escapeHtml(message), 6000, false),
      onReturn: deps.onReturn,
    });

  return {
    saveSource: (name, inProject) => save({ name, inProject }),
    openText: (name, text) =>
      openAll([
        { file: new File([text], name, { type: "text/plain" }), handle: null },
      ]),
    forgetFile() {
      current.handle = null;
      current.name = null;
      current.stamp = null;
      onFileOpened(null);
    },
    takeFile() {
      const file = current.name
        ? { handle: current.handle, name: current.name, stamp: current.stamp }
        : null;
      current.handle = null;
      current.name = null;
      current.stamp = null;
      return file;
    },
    putFile(file: OpenFile | null) {
      current.handle = file ? file.handle : null;
      current.name = file ? file.name : null;
      current.stamp = file?.stamp ?? null;
    },
    restoreFile(ref: DraftFile) {
      current.handle = null;
      current.stamp = null;
      current.name = restoredName(ref);
    },
    targetName() {
      return current.name;
    },
    targetHandle() {
      return current.handle;
    },
  };
}
