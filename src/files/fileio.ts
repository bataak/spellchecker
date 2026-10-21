import { initDownloadHint } from "./download.ts";
import type { SaveChain } from "../ui/savechain.ts";
import { restoredName } from "./filetypes.ts";
import type { DraftFile } from "../core/storage.ts";
import { deliverText } from "./textfile.ts";
import type { EditorPort, StatusPort } from "../core/ports.ts";
import type {
  CurrentFile,
  OfficeFiles,
  PdfSave,
  ProjectFiles,
} from "./fileports.ts";
import { createFileSave } from "./filesave.ts";
import { initFileOpen } from "./fileopen.ts";

export type { OfficeFiles, PdfSave, ProjectFiles } from "./fileports.ts";

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
  readonly saveChain: SaveChain;
  readonly deliverText?: (text: string, fileName: string) => Promise<boolean>;
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

export function initFileIO(deps: FileIODeps): FileIOControl {
  const { editor, status, office, project, onFileOpened } = deps;
  initDownloadHint(status.hold);
  const current: CurrentFile = { handle: null, name: null };
  const save = createFileSave({
    text: () => editor.el.value || "",
    current,
    office,
    project,
    pdf: deps.pdf,
    defaultExt: deps.defaultExt,
    onSaved: deps.onSaved,
    deliverText: deps.deliverText ?? deliverText,
  });
  deps.saveChain.handle(() => {
    void save();
    return true;
  });
  initFileOpen({
    editor,
    status,
    current,
    office,
    project,
    onFileOpened,
    prepareOpen: deps.prepareOpen,
    onLoaded: deps.onLoaded,
  });

  return {
    saveSource: (name, inProject) => save({ name, inProject }),
    forgetFile() {
      current.handle = null;
      current.name = null;
      onFileOpened(null);
    },
    takeFile() {
      const file = current.name
        ? { handle: current.handle, name: current.name }
        : null;
      current.handle = null;
      current.name = null;
      return file;
    },
    putFile(file: OpenFile | null) {
      current.handle = file ? file.handle : null;
      current.name = file ? file.name : null;
    },
    restoreFile(ref: DraftFile) {
      current.handle = null;
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
