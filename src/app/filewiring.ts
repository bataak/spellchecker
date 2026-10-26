import type { MdToolbar } from "../mdbar/mdtoolbar.ts";
import type { DocumentSession } from "../doc/docsession.ts";
import type { UndoControl } from "../editor/undohistory.ts";
import type { OfficeSession } from "../office/session.ts";
import type { ProjectLink } from "../project/projectlink.ts";
import {
  initFileIO,
  type FileIOControl,
  type PdfSave,
} from "../files/fileio.ts";
import { initSlotSwitch, type SlotSwitch } from "../slots/slotswitch.ts";
import { createSaveChain, type SaveChain } from "../ui/savechain.ts";
import type { StatusControl } from "../ui/status.ts";
import { saveDraftFile } from "../core/storage.ts";
import { createOpenPolicy } from "./openpolicy.ts";
import type { EditorPort } from "../core/ports.ts";

export interface FileWiringDeps {
  readonly editor: EditorPort;
  readonly status: StatusControl;
  readonly office: OfficeSession;
  readonly doc: DocumentSession;
  readonly pdf: PdfSave;
  readonly isTex: () => boolean;
  readonly project: () => ProjectLink;
  readonly mdBar: () => MdToolbar;
  readonly undo: () => UndoControl;
  readonly refreshPreview: () => void;
}

export interface FileWiring {
  readonly saveChain: SaveChain;
  readonly fileIO: FileIOControl;
  readonly slots: SlotSwitch;
}

export function createFileWiring(deps: FileWiringDeps): FileWiring {
  const { editor, status, office, doc } = deps;
  const officeActive = (): boolean => office.active() !== null;
  const buttons = {
    open: document.querySelector<HTMLElement>("#openBtn"),
    pick: document.querySelector<HTMLElement>("#pickBtn"),
    input: document.querySelector<HTMLInputElement>("#openFile"),
    save: document.querySelector<HTMLElement>("#saveBtn"),
  };
  const saveChain = createSaveChain(buttons.save);
  const fileIO = initFileIO({
    saveChain,
    buttons,
    editor,
    status,
    office: {
      active: officeActive,
      open: office.open,
      close: office.close,
      save: office.save,
    },
    project: {
      save: () => deps.project().save(),
      openZip: (file) => deps.project().openZip(file),
      openDir: (handle) => deps.project().openDir(handle),
      openExisting: (name, text) => deps.project().openExisting(name, text),
    },
    pdf: deps.pdf,
    defaultExt: () =>
      deps.isTex() ? "tex" : doc.markdownActive() ? "md" : "txt",
    onFileOpened: (ref) => {
      deps.project().unbind(true);
      saveDraftFile(ref, deps.mdBar().slot());
      doc.open(ref ? ref.name : null);
      if (ref?.kind === "text")
        queueMicrotask(() => deps.project().fileOpened(ref.name));
    },
    prepareOpen: createOpenPolicy(deps.mdBar, status.hold, buttons.open),
    onLoaded: () => {
      deps.undo().reset();
      deps.mdBar().markSaved();
    },
    onSaved: (written) => deps.mdBar().markSaved(written),
  });

  const slots = initSlotSwitch({
    editor: editor.el,
    files: {
      take: () => fileIO.takeFile(),
      put: (file) => fileIO.putFile(file),
      restore: (ref) => fileIO.restoreFile(ref),
      name: () => fileIO.targetName(),
    },
    office: {
      file: office.file,
      park: office.park,
      open: async (file, text, cancelled) => {
        await office.open(file, text, cancelled);
        return officeActive();
      },
      queue: office.queue,
      settled: office.settled,
    },
    project: deps.project,
    draft: (slot) => deps.mdBar().draft(slot),
    setName: doc.setName,
    refreshPreview: deps.refreshPreview,
    entered: doc.entered,
  });

  return { saveChain, fileIO, slots };
}
