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
import type { DocStatus } from "./docstatus.ts";
import type { TexMode } from "./texmode.ts";

export interface ProjectWiringDeps {
  readonly store: ProjectStore;
  readonly editor: HTMLTextAreaElement;
  readonly workspace: HTMLElement;
  readonly editorWrap: HTMLElement;
  readonly mdBar: MdToolbar;
  readonly fileIO: FileIOControl;
  readonly doc: DocumentSession;
  readonly docStatus: DocStatus;
  readonly docMode: DocMode;
  readonly texMode: TexMode;
  readonly isTex: () => boolean;
  readonly undo: () => UndoControl;
  readonly draft: DraftText;
  readonly preview: Preview;
  readonly measure: MeasureControl;
  readonly status: StatusControl;
  readonly enterMdMode: (on: boolean) => void;
  readonly render: () => Promise<void>;
}

export function createProjectWiring(deps: ProjectWiringDeps): ProjectLink {
  const { mdBar, doc, texMode, preview } = deps;
  return initProjectLink({
    store: deps.store,
    editor: deps.editor,
    workspace: deps.workspace,
    tools: () => deps.editorWrap.querySelector<HTMLElement>(".editor-tools"),
    slots: {
      current: () => mdBar.slot(),
      inProject: () => mdBar.template() === PROJECT_SLOT,
      enterProject: () => mdBar.enterProject(),
      close: (id) => mdBar.closeFile(id, true),
      files: () => mdBar.fileSlots(),
    },
    file: {
      name: doc.name,
      handle: () => deps.fileIO.targetHandle(),
      bind: (name) => {
        deps.fileIO.putFile(name ? { handle: null, name } : null);
        saveDraftFile(name ? { name, kind: "text" } : null, mdBar.slot());
        doc.setName(name);
        deps.docStatus.restore();
      },
    },
    texActive: deps.isTex,
    onBound: deps.docMode.setProjectBound,
    afterSwitch: () => {
      deps.undo().baseline();
      texMode.sync();
      deps.enterMdMode(doc.markdownActive());
      void deps.render();
      deps.draft.save();
    },
    onProject: (name) => {
      mdBar.setProject(name);
      if (name === null) mdBar.leaveProject();
    },
    onChange: () => {
      texMode.sync();
      preview.update();
    },
    layout: () => deps.measure.refresh(),
    notify: (message) => deps.status.hold(message, 6000, false),
    show: (source) => preview.setSource(source),
  });
}
