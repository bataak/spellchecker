import * as Y from "yjs";
import { loadDoc } from "./docstore.ts";
import type { BlobSwap, BlobTransport } from "./blobswap.ts";
import { bindText } from "./textbind.ts";
import {
  createProjectEditing,
  seedProjectDoc,
  type ProjectHooks,
} from "./projectsession.ts";
import { textsOf } from "./projectdoc.ts";
import { createChat, type Chat } from "./chat.ts";
import type { ChatDoc } from "./chatdoc.ts";
import { registerAuthor } from "./changes.ts";
import { createChangeTracker, type ChangeTracker } from "./changetracker.ts";
import { createCursors, type CursorView, type Cursors } from "./cursors.ts";
import type { Profile } from "./profile.ts";

export const LOADED = { load: true };
const SETTLE_MS = 6000;

interface OpenedDoc {
  readonly doc: Y.Doc;
  readonly fresh: boolean;
}

export async function openDoc(
  room: string,
  seed: (() => string) | null,
  project: ProjectHooks | null,
): Promise<OpenedDoc> {
  const doc = new Y.Doc({ gc: false });
  const stored = await loadDoc(room);
  if (stored) Y.applyUpdate(doc, stored, LOADED);
  if (project) {
    const seeded = await seedProjectDoc(doc, project);
    return { doc, fresh: !stored && !seeded };
  }
  const text = doc.getText("t");
  if (seed && text.length === 0) text.insert(0, seed());
  return { doc, fresh: !stored && !seed };
}

export interface Attacher {
  attach(): void;
  detach(): void;
  settle(): void;
  destroy(): void;
}

export function createAttacher(
  editor: HTMLTextAreaElement,
  text: Y.Text,
  fresh: boolean,
  shown: (on: boolean) => void = () => {},
): Attacher {
  const binding = bindText(editor, text);
  let settled = !fresh;
  let wanted = false;
  const timer = settled ? null : setTimeout(() => settle(), SETTLE_MS);
  const attach = (): void => {
    if (fresh && text.length === 0 && editor.value)
      text.insert(0, editor.value);
    binding.attach();
    shown(true);
  };
  function settle(): void {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (wanted) attach();
  }
  return {
    attach() {
      wanted = true;
      if (settled) attach();
    },
    detach() {
      wanted = false;
      binding.detach();
      shown(false);
    },
    settle,
    destroy() {
      if (timer) clearTimeout(timer);
      binding.destroy();
    },
  };
}

export interface EditingDeps {
  readonly link: { readonly room: string };
  readonly editor: HTMLTextAreaElement;
  readonly view: CursorView;
  readonly profile: () => Profile;
  readonly project: ProjectHooks | null;
}

export interface Editing {
  readonly cursors: Cursors;
  readonly binding: Attacher;
  readonly swap: BlobSwap | null;
  readonly talk: Talk;
  destroy(): void;
}

export interface Talk {
  readonly chat: Chat;
  readonly changes: ChangeTracker;
  readonly project: boolean;
  announce(): void;
}

function createTalk(deps: EditingDeps, doc: Y.Doc, chat: ChatDoc): Talk {
  const project = deps.project !== null;
  const announce = (): void => registerAuthor(doc, deps.profile());
  announce();
  return {
    chat: createChat(chat.doc, chat.mine, deps.profile),
    changes: createChangeTracker({
      doc,
      room: deps.link.room,
      texts: () =>
        project ? textsOf(doc) : new Map([[null, doc.getText("t")]]),
    }),
    project,
    announce,
  };
}

function withDestroy(
  parts: Omit<Editing, "destroy" | "talk">,
  talk: Talk,
): Editing {
  return {
    ...parts,
    talk,
    destroy() {
      parts.binding.destroy();
      parts.swap?.close();
      parts.cursors.destroy();
      talk.chat.destroy();
      talk.changes.destroy();
    },
  };
}

export function createEditing(
  deps: EditingDeps,
  docs: { readonly doc: Y.Doc; readonly chat: ChatDoc },
  fresh: boolean,
  transport: BlobTransport,
  send: (body: Uint8Array) => void,
): Editing {
  const { doc } = docs;
  const talk = createTalk(deps, doc, docs.chat);
  if (deps.project)
    return withDestroy(
      createProjectEditing(deps, doc, deps.project, fresh, send, transport),
      talk,
    );
  const text = doc.getText("t");
  const cursors = createCursors({
    doc,
    text: () => text,
    editor: deps.editor,
    view: deps.view,
    profile: deps.profile,
    send,
  });
  const binding = createAttacher(deps.editor, text, fresh, (on) =>
    cursors.setActive(on),
  );
  return withDestroy({ cursors, binding, swap: null }, talk);
}
