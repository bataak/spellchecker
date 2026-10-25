import type { MdToolbar } from "../mdbar/mdtoolbar.ts";
import type { DocumentSession } from "../doc/docsession.ts";
import type { DocMode } from "../doc/docmode.ts";
import type { DraftText } from "../editor/drafttext.ts";
import type { UndoControl } from "../editor/undohistory.ts";
import type { FileIOControl } from "../files/fileio.ts";
import type { Preview } from "../preview/preview.ts";
import { initProjectLink, type ProjectLink } from "../project/projectlink.ts";
import type { ProjectStore } from "../project/projectstore.ts";
import { PROJECT_SLOT } from "../slots/fileslots.ts";
import type { MeasureControl } from "../ui/measure.ts";
import type { StatusControl } from "../ui/status.ts";
import { saveDraftFile } from "../core/storage.ts";
import { OPEN_LABEL } from "../files/filetypes.ts";
import type { DocStatus } from "./docstatus.ts";
import type { TexMode } from "./texmode.ts";

export interface ProjectWiringView {
  readonly editor: HTMLTextAreaElement;
  readonly workspace: HTMLElement;
  readonly editorWrap: HTMLElement;
  readonly measure: MeasureControl;
  readonly preview: Preview;
  readonly status: StatusControl;
}

export interface ProjectWiringMode {
  readonly doc: DocumentSession;
  readonly docStatus: DocStatus;
  readonly docMode: DocMode;
  readonly texMode: TexMode;
  readonly isTex: () => boolean;
  readonly enterMdMode: (on: boolean) => void;
  readonly render: () => Promise<void>;
}

export interface ProjectWiringFiles {
  readonly mdBar: MdToolbar;
  readonly fileIO: FileIOControl;
  readonly draft: DraftText;
  readonly undo: () => UndoControl;
}

export interface ProjectWiringDeps {
  readonly store: ProjectStore;
  readonly view: ProjectWiringView;
  readonly mode: ProjectWiringMode;
  readonly files: ProjectWiringFiles;
}

export function createProjectWiring(deps: ProjectWiringDeps): ProjectLink {
  const { view, mode, files } = deps;
  const { mdBar, fileIO } = files;
  const { doc, texMode } = mode;
  const { preview } = view;
  return initProjectLink({
    store: deps.store,
    editor: view.editor,
    host: {
      workspace: view.workspace,
      tools: () => view.editorWrap.querySelector<HTMLElement>(".editor-tools"),
      openButton: document.querySelector<HTMLElement>("#openBtn"),
      fileButton: document.querySelector<HTMLElement>("#pickBtn"),
      fileTypes: OPEN_LABEL,
      texActive: mode.isTex,
      layout: () => view.measure.refresh(),
      show: (source) => preview.setSource(source),
    },
    slots: {
      current: () => mdBar.slot(),
      inProject: () => mdBar.template() === PROJECT_SLOT,
      enterProject: () => mdBar.enterProject(),
      close: (id) => mdBar.closeFile(id, true),
      files: () => mdBar.fileSlots(),
    },
    file: {
      name: doc.name,
      handle: () => fileIO.targetHandle(),
      bind: (name) => {
        fileIO.putFile(name ? { handle: null, name } : null);
        saveDraftFile(name ? { name, kind: "text" } : null, mdBar.slot());
        doc.setName(name);
        mode.docStatus.restore();
      },
    },
    onBound: mode.docMode.setProjectBound,
    afterSwitch: () => {
      files.undo().baseline();
      texMode.sync();
      mode.enterMdMode(doc.markdownActive());
      void mode.render();
      files.draft.save();
    },
    onProject: (name) => {
      mdBar.setProject(name);
      if (name === null) mdBar.leaveProject();
    },
    onChange: () => {
      texMode.sync();
      preview.update();
    },
    notify: (message) => view.status.hold(message, 6000, false),
  });
}
