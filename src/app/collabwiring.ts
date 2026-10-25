import type { MdToolbar } from "../mdbar/mdtoolbar.ts";
import type { DocumentSession } from "../doc/docsession.ts";
import type { UndoControl } from "../editor/undohistory.ts";
import type { CursorView } from "../collab/cursors.ts";
import type { ProjectLink } from "../project/projectlink.ts";
import type { ProjectStore } from "../project/projectstore.ts";
import type { ProjectHooks } from "../collab/projectsession.ts";
import {
  initCollab,
  joinName,
  type Collab,
  type CollabProject,
} from "../collab/collab.ts";
import { projectName, sharedName } from "../collab/collabkey.ts";
import { snapshotOf } from "../collab/projectdoc.ts";
import type { BlobPort } from "../collab/projectblobs.ts";
import { fileSlot, projectSlot, type RoomSlot } from "../collab/roomslot.ts";
import { confirmReplace } from "../project/linkfiles.ts";
import { saveDraftFile } from "../core/storage.ts";
import { PROJECT_SLOT } from "../slots/fileslots.ts";
import { initTalk } from "../collab/talkhost.ts";

export interface CollabWiringDeps {
  readonly editor: HTMLTextAreaElement;
  readonly view: CursorView;
  readonly mdBar: MdToolbar;
  readonly doc: DocumentSession;
  readonly store: ProjectStore;
  readonly project: ProjectLink;
  readonly isTex: () => boolean;
  readonly officeActive: () => boolean;
  readonly undo: () => UndoControl;
  readonly notify: (message: string) => void;
}

const BLOCKED =
  "Энэ төрлийн файлыг хамтран засах боломжгүй. Зөвхөн txt, md, tex файл болон LaTeX төслийг хуваалцана.";

function sharedUid(deps: Pick<CollabWiringDeps, "store">): string | null {
  const view = deps.store.project();
  return view && !view.pending ? view.uid : null;
}

function projectPort(store: ProjectStore, uid: string): ProjectHooks["port"] {
  const mine = (): boolean => store.projectFiles()?.uid === uid;
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
  return {
    local: () => {
      const files = store.projectFiles();
      return files?.uid === uid ? files : null;
    },
    setText: (path, text) => {
      if (mine()) store.setProjectText(path, text);
    },
    add: async (path, text) => {
      if (mine()) await store.addFile(path, encode(text));
    },
    addDir: async (path) => {
      if (mine()) await store.createDir(path);
    },
    move: async (from, to) => {
      if (mine()) await store.renamePath(from, to);
    },
    remove: async (path) => {
      if (mine()) await store.removePath(path);
    },
    setMain: (path) => {
      if (mine()) store.setMain(path);
    },
  };
}

function blobPort(store: ProjectStore, uid: string): BlobPort {
  const files = () => {
    const current = store.projectFiles();
    return current?.uid === uid ? current : null;
  };
  const has = (path: string): boolean => !!files() && store.projectHas(path);
  return {
    binaries: () => files()?.binaries ?? null,
    main: () => files()?.main ?? null,
    put: async (path, bytes) => {
      if (files()) await store.addFile(path, bytes);
    },
    move: async (from, to) => {
      if (has(from) && !has(to)) await store.renamePath(from, to);
    },
    remove: async (path) => {
      if (has(path)) await store.removePath(path);
    },
  };
}

async function seedOf(store: ProjectStore, uid: string) {
  const files = store.projectFiles();
  if (!files || files.uid !== uid) return null;
  return snapshotOf(files.texts, files.binaries, files.dirs, files.main);
}

export function createProjectCollab(
  deps: Pick<CollabWiringDeps, "store" | "project">,
): CollabProject {
  const { store } = deps;
  const joining = new Map<string, string>();
  return {
    uid: () => sharedUid(deps),
    prepare(name, uid) {
      if (!confirmReplace(store.project()?.unsaved)) return false;
      joining.set(uid, name);
      return true;
    },
    hooks: (uid, seed) => ({
      port: projectPort(store, uid),
      active: () =>
        sharedUid(deps) === uid
          ? (deps.project.path() ?? store.project()?.active ?? null)
          : null,
      seed: seed ? () => seedOf(store, uid) : null,
      create(snap) {
        if (sharedUid(deps) === uid) return true;
        const name = joining.get(uid);
        if (name === undefined) return false;
        const encoder = new TextEncoder();
        const files: [string, Uint8Array][] = [...snap.texts].map(
          ([path, text]) => [path, encoder.encode(text)],
        );
        const opened = deps.project.openShared(
          { name, files, dirs: new Set(snap.dirs) },
          uid,
          snap.main,
        );
        if (opened) joining.delete(uid);
        return opened;
      },
      changed: (listener) => store.onProjectChange(listener),
      blobs: blobPort(store, uid),
    }),
  };
}

function inProject(deps: CollabWiringDeps): boolean {
  return deps.mdBar.slot() === PROJECT_SLOT;
}

export function createCollabWiring(deps: CollabWiringDeps): Collab {
  const { mdBar, doc, store } = deps;
  const slot = (): RoomSlot => {
    const uid = inProject(deps) ? sharedUid(deps) : null;
    return uid ? projectSlot(uid) : fileSlot(mdBar.slot());
  };
  const hasFile = (id: string): boolean =>
    mdBar.fileSlots().some((file) => file.id === id);
  const collab = initCollab({
    editor: deps.editor,
    view: deps.view,
    button: document.querySelector<HTMLButtonElement>("#collabBtn"),
    slot,
    openSlot: (name) => {
      if (!mdBar.openFile(name)) return false;
      saveDraftFile({ name, kind: "text" }, mdBar.slot());
      doc.open(name);
      return true;
    },
    shareName: () => {
      const view = store.project();
      if (inProject(deps) && view) return projectName(view.name);
      return joinName(doc.fileName(), deps.isTex(), doc.markdownActive());
    },
    showSlot: (target) => {
      if (target.kind === "project") {
        if (sharedUid(deps) !== target.uid) return false;
        mdBar.enterProject();
        return true;
      }
      if (!hasFile(target.id)) return false;
      mdBar.showFile(target.id);
      return true;
    },
    blocked: () => {
      if (inProject(deps)) return sharedUid(deps) ? null : BLOCKED;
      const file = doc.fileName();
      if (deps.officeActive() || (file !== null && !sharedName(file)))
        return BLOCKED;
      return null;
    },
    wipe: (target) => {
      if (target.kind === "project") {
        if (sharedUid(deps) !== target.uid) return false;
        deps.project.drop();
        return true;
      }
      if (!hasFile(target.id)) return false;
      mdBar.closeFile(target.id, true);
      void deps.undo().forget(target.id);
      return true;
    },
    notify: deps.notify,
    project: createProjectCollab(deps),
  });
  let shown = sharedUid(deps);
  store.onProjectChange(() => {
    const uid = sharedUid(deps);
    if (uid === shown) return;
    shown = uid;
    collab.projectChanged();
  });
  initTalk({
    collab,
    editor: deps.editor,
    openPath: (path) => deps.project.openPath(path),
    anchor: document.querySelector("#collabBtn"),
  });
  return collab;
}
