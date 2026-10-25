import type * as Y from "yjs";
import {
  projectOf,
  seedProject,
  textOf,
  type ProjectSnapshot,
} from "./projectdoc.ts";
import { createProjectBridge, type ProjectPort } from "./projectbridge.ts";
import { createCursors, type CursorView, type Cursors } from "./cursors.ts";
import type { Profile } from "./cursors.ts";
import type { Attacher } from "./roomdoc.ts";

export interface ProjectHooks {
  readonly port: ProjectPort;
  readonly active: () => string | null;
  readonly seed: (() => Promise<ProjectSnapshot | null>) | null;
  readonly create: (snap: ProjectSnapshot) => boolean;
  readonly changed: (listener: () => void) => () => void;
}

interface EditingDeps {
  readonly editor: HTMLTextAreaElement;
  readonly view: CursorView;
  readonly profile: () => Profile;
}

const SETTLE_MS = 6000;

export async function seedProjectDoc(
  doc: Y.Doc,
  hooks: ProjectHooks,
): Promise<boolean> {
  if (doc.getMap("files").size > 0) return false;
  const snap = await hooks.seed?.();
  if (!snap) return false;
  seedProject(doc, snap);
  return true;
}

export function createProjectAttacher(
  doc: Y.Doc,
  hooks: ProjectHooks,
  cursors: Cursors,
  fresh: boolean,
): Attacher {
  const bridge = createProjectBridge(doc, hooks.port);
  let settled = false;
  let unwatch: (() => void) | null = null;
  const timer = fresh ? setTimeout(() => settle(), SETTLE_MS) : null;
  function begin(): void {
    if (!hooks.port.local()) {
      const snap = projectOf(doc);
      if (!snap.texts.size || !hooks.create(snap)) return;
    }
    bridge.start();
    unwatch ??= hooks.changed(() => bridge.pushLocal());
  }
  function settle(): void {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    begin();
  }
  if (!fresh) settle();
  return {
    attach: () => cursors.setActive(true),
    detach: () => cursors.setActive(false),
    settle() {
      if (settled && !unwatch) begin();
      settle();
    },
    destroy() {
      if (timer) clearTimeout(timer);
      unwatch?.();
      bridge.stop();
    },
  };
}

export function createProjectEditing(
  deps: EditingDeps,
  doc: Y.Doc,
  hooks: ProjectHooks,
  fresh: boolean,
  send: (body: Uint8Array) => void,
): { cursors: Cursors; binding: Attacher } {
  const cursors = createCursors({
    doc,
    text: () => {
      const path = hooks.active();
      return path ? textOf(doc, path) : null;
    },
    editor: deps.editor,
    view: deps.view,
    profile: deps.profile,
    send,
  });
  const binding = createProjectAttacher(doc, hooks, cursors, fresh);
  return { cursors, binding };
}
