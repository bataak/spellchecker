import type { SpellChecker } from "../spell/spellchecker.ts";
import type { DictStatus } from "../spellui/dictstatus.ts";
import type { Backdrop } from "../editor/backdrop.ts";
import type { MarkLayer } from "../editor/marklayer.ts";
import type { DraftText } from "../editor/drafttext.ts";
import { pruneUndo, type UndoControl } from "../editor/undohistory.ts";
import type { MdToolbar } from "../mdbar/mdtoolbar.ts";
import type { OfficeSession } from "../office/session.ts";
import type { FileIOControl } from "../files/fileio.ts";
import type { DocumentSession } from "../doc/docsession.ts";
import type { ProjectLink } from "../project/projectlink.ts";
import type { ProjectStore } from "../project/projectstore.ts";
import type { Collab } from "../collab/collab.ts";
import type { MeasureControl } from "../ui/measure.ts";
import type { StatusControl } from "../ui/status.ts";
import type { AppUpdate } from "./appupdate.ts";
import type { CheckLoop } from "./checkloop.ts";
import type { DocStatus } from "./docstatus.ts";
import { initAppReport } from "./appreport.ts";
import { initDictionaries, type Dictionaries } from "./dictionaries.ts";
import { boot } from "./boot.ts";
import { restoreDraftFile } from "./draftfile.ts";
import { startUrlNav } from "./urlnav.ts";

export interface StartupDeps {
  readonly entryUrl: string;
  readonly editor: HTMLTextAreaElement;
  readonly backdropEl: HTMLElement;
  readonly statusEl: HTMLElement;
  readonly backdrop: Backdrop;
  readonly checker: SpellChecker;
  readonly dicts: DictStatus;
  readonly docStatus: DocStatus;
  readonly status: StatusControl;
  readonly appUpdate: AppUpdate;
  readonly loop: CheckLoop;
  readonly marks: MarkLayer;
  readonly draft: DraftText;
  readonly undo: () => UndoControl;
  readonly mdBar: MdToolbar;
  readonly office: OfficeSession;
  readonly fileIO: FileIOControl;
  readonly doc: DocumentSession;
  readonly project: ProjectLink;
  readonly store: ProjectStore;
  readonly collab: Collab;
  readonly measure: MeasureControl;
  readonly nudge: () => void;
}

function startNav(deps: StartupDeps): void {
  const { mdBar, store, project } = deps;
  startUrlNav({
    editor: deps.editor,
    copyButton: document.querySelector<HTMLElement>("#copyBtn"),
    template: mdBar.template,
    fileSlots: mdBar.fileSlots,
    choose: mdBar.choose,
    showFile: mdBar.showFile,
    hasProject: () => store.project() !== null,
    projectText: (path) => store.projectText(path),
    projectPath: project.path,
    enterProject: mdBar.enterProject,
    openPath: project.openPath,
    openText: deps.fileIO.openText,
    notify: (message) => deps.status.hold(message, 8000, false),
  });
}

export function startApp(deps: StartupDeps): Dictionaries {
  const { editor, loop, marks, mdBar, doc, fileIO, store } = deps;
  const badTokens = () => marks.tokens();
  initAppReport({
    entryUrl: deps.entryUrl,
    editor,
    checker: deps.checker,
    dicts: deps.dicts,
    officeActive: () => deps.office.active() !== null,
    markdownActive: doc.markdownActive,
    fileName: doc.fileName,
    layout: () => deps.measure.layout(),
    errorWords: () => badTokens().map((token) => token.word),
  });
  const dictionaries = initDictionaries({
    checker: deps.checker,
    dicts: deps.dicts,
    docStatus: deps.docStatus,
    status: deps.status,
    appUpdate: deps.appUpdate,
    recheckAll: loop.recheckAll,
    editor,
    statusEl: deps.statusEl,
    badTokens,
    render: loop.render,
  });
  void boot({
    editor,
    backdrop: deps.backdropEl,
    draft: deps.draft,
    baseline: () => deps.undo().baseline(),
    restoreFile: () =>
      restoreDraftFile({
        slot: () => mdBar.slot(),
        restoreOffice: deps.office.restore,
        restoreText: fileIO.restoreFile,
        targetName: fileIO.targetName,
        opened: doc.open,
      }),
    restoreProject: () => deps.project.restore(),
    restored: () => {
      deps.collab.start();
      startNav(deps);
    },
    pruneUndo: () => void pruneUndo(mdBar.fileSlots(), store.project()),
    fontsLoaded: () => {
      deps.backdrop.reset();
      void loop.render();
    },
    render: loop.render,
    nudge: deps.nudge,
    appUpdate: deps.appUpdate,
    dictLife: dictionaries.life,
    status: (message) => deps.status.set(message),
  });
  return dictionaries;
}
