import type * as Y from "yjs";
import { noteError } from "../core/errorlog.ts";
import { skippedPath } from "../tex/texproject.ts";
import {
  addDir,
  addText,
  dropDir,
  fileIds,
  movePath,
  projectOf,
  removePath,
  setMain,
  sharedPath,
  writeText,
} from "./projectdoc.ts";

export interface LocalProject {
  readonly texts: ReadonlyMap<string, string>;
  readonly dirs: ReadonlySet<string>;
  readonly main: string | null;
}

export interface ProjectPort {
  local(): LocalProject | null;
  setText(path: string, text: string): void;
  add(path: string, text: string): Promise<void>;
  addDir(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  setMain(path: string): void;
}

export interface ProjectBridge {
  start(): void;
  pushLocal(): void;
  pull(): Promise<void>;
  stop(): void;
}

interface Known {
  readonly texts: ReadonlyMap<string, string>;
  readonly dirs: ReadonlySet<string>;
  readonly main: string | null;
  readonly ids: ReadonlyMap<string, string>;
}

export const BRIDGE = { bridge: true };

function sharedOf(local: LocalProject): LocalProject {
  const texts = new Map<string, string>();
  for (const [path, text] of local.texts)
    if (sharedPath(path, local.main)) texts.set(path, text);
  const dirs = new Set([...local.dirs].filter((dir) => !skippedPath(dir)));
  return { texts, dirs, main: local.main };
}

function knownOf(doc: Y.Doc): Known {
  const snap = projectOf(doc);
  return {
    texts: snap.texts,
    dirs: snap.dirs,
    main: snap.main,
    ids: fileIds(doc),
  };
}

function writeFiles(doc: Y.Doc, known: Known, local: LocalProject): void {
  const added = [...local.texts.keys()].filter((p) => !known.texts.has(p));
  for (const [from, text] of known.texts) {
    if (local.texts.has(from)) continue;
    const at = added.findIndex((to) => local.texts.get(to) === text);
    if (at < 0) {
      removePath(doc, from);
      continue;
    }
    movePath(doc, from, added[at]!);
    added.splice(at, 1);
  }
  for (const path of added) addText(doc, path, local.texts.get(path)!);
  for (const [path, text] of local.texts)
    if (known.texts.has(path) && known.texts.get(path) !== text)
      writeText(doc, path, text);
}

function writeDirs(doc: Y.Doc, known: Known, local: LocalProject): void {
  for (const dir of known.dirs) if (!local.dirs.has(dir)) dropDir(doc, dir);
  for (const dir of local.dirs) if (!known.dirs.has(dir)) addDir(doc, dir);
  if (local.main !== known.main) setMain(doc, local.main);
}

async function attempt(run: () => Promise<void> | void): Promise<void> {
  try {
    await run();
  } catch (error) {
    noteError(error);
  }
}

async function applyRemote(
  port: ProjectPort,
  before: Known,
  after: Known,
): Promise<void> {
  const pathOfId = new Map([...before.ids].map(([path, id]) => [id, path]));
  const moved = new Set<string>();
  for (const dir of after.dirs)
    if (!before.dirs.has(dir)) await attempt(() => port.addDir(dir));
  for (const [path, id] of after.ids) {
    const from = pathOfId.get(id);
    if (from === undefined || from === path || !before.texts.has(from))
      continue;
    moved.add(from);
    moved.add(path);
    await attempt(() => port.move(from, path));
  }
  for (const path of before.texts.keys())
    if (!after.texts.has(path) && !moved.has(path))
      await attempt(() => port.remove(path));
  for (const [path, text] of after.texts) {
    if (!before.texts.has(path) && !moved.has(path))
      await attempt(() => port.add(path, text));
    else if (port.local()?.texts.get(path) !== text)
      await attempt(() => port.setText(path, text));
  }
  for (const dir of before.dirs)
    if (!after.dirs.has(dir)) await attempt(() => port.remove(dir));
  if (after.main && after.main !== before.main)
    await attempt(() => port.setMain(after.main!));
}

export function createProjectBridge(
  doc: Y.Doc,
  port: ProjectPort,
): ProjectBridge {
  let known: Known | null = null;
  let pulling: Promise<void> | null = null;
  let again = false;
  let stopped = false;

  const pushLocal = (): void => {
    if (!known || pulling || stopped) return;
    const raw = port.local();
    if (!raw) return;
    const local = sharedOf(raw);
    const base = known;
    doc.transact(() => {
      writeFiles(doc, base, local);
      writeDirs(doc, base, local);
    }, BRIDGE);
    known = knownOf(doc);
  };

  const pull = (): Promise<void> => {
    if (!known || stopped) return Promise.resolve();
    if (pulling) {
      again = true;
      return pulling;
    }
    const before = known;
    known = knownOf(doc);
    pulling = applyRemote(port, before, known).finally(() => {
      pulling = null;
      if (again) {
        again = false;
        void pull();
      } else pushLocal();
    });
    return pulling;
  };

  const onUpdate = (_update: Uint8Array, origin: unknown): void => {
    if (origin !== BRIDGE && known) void pull();
  };

  return {
    start() {
      if (known || stopped) return;
      known = knownOf(doc);
      doc.on("update", onUpdate);
      pushLocal();
    },
    pushLocal,
    pull,
    stop() {
      stopped = true;
      doc.off("update", onUpdate);
    },
  };
}
