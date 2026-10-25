import type * as Y from "yjs";
import {
  projectOf,
  seedProject,
  textOf,
  type ProjectSnapshot,
} from "./projectdoc.ts";
import { createProjectBridge, type ProjectPort } from "./projectbridge.ts";
import { createCursors, type CursorView, type Cursors } from "./cursors.ts";
import type { Profile } from "./profile.ts";
import type { Attacher } from "./roomdoc.ts";
import { createBlobBridge, type BlobPort } from "./projectblobs.ts";
import {
  createBlobSwap,
  type BlobSwap,
  type BlobTransport,
} from "./blobswap.ts";

export interface ProjectHooks {
  readonly port: ProjectPort;
  readonly active: () => string | null;
  readonly seed: (() => Promise<ProjectSnapshot | null>) | null;
  readonly create: (snap: ProjectSnapshot) => boolean;
  readonly changed: (listener: () => void) => () => void;
  readonly blobs?: BlobPort;
}

export interface ProjectAttacher extends Attacher {
  have(hash: string): Promise<Uint8Array | null>;
}

type Want = (hash: string, size: number) => Promise<Uint8Array>;

const noBlobs: Want = () => Promise.reject(new Error("blob"));

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
  want: Want = noBlobs,
): ProjectAttacher {
  const bridge = createProjectBridge(doc, hooks.port);
  const blobs = hooks.blobs ? createBlobBridge(doc, hooks.blobs, want) : null;
  let settled = false;
  let unwatch: (() => void) | null = null;
  const timer = fresh ? setTimeout(() => settle(), SETTLE_MS) : null;
  function begin(): void {
    if (!hooks.port.local()) {
      const snap = projectOf(doc);
      if (!snap.texts.size || !hooks.create(snap)) return;
    }
    bridge.start();
    void blobs?.start();
    unwatch ??= hooks.changed(() => {
      bridge.pushLocal();
      void blobs?.pushLocal();
    });
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
      blobs?.stop();
    },
    have: (hash) => blobs?.have(hash) ?? Promise.resolve(null),
  };
}

export function createProjectEditing(
  deps: EditingDeps,
  doc: Y.Doc,
  hooks: ProjectHooks,
  fresh: boolean,
  send: (body: Uint8Array) => void,
  transport: BlobTransport,
): { cursors: Cursors; binding: Attacher; swap: BlobSwap } {
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
  const swap: BlobSwap = createBlobSwap({
    transport,
    have: (hash) => binding.have(hash),
  });
  const binding = createProjectAttacher(doc, hooks, cursors, fresh, (h, s) =>
    swap.want(h, s),
  );
  return { cursors, binding, swap };
}
