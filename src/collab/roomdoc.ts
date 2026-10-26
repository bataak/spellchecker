import * as Y from "yjs";
import { loadDoc } from "./docstore.ts";
import type { BlobSwap, BlobTransport } from "./blobswap.ts";
import { createAttacher, type Attacher } from "./attacher.ts";
import {
  createProjectEditing,
  seedProjectDoc,
  type ProjectHooks,
} from "./projectsession.ts";
import type { ChatDoc } from "./chatdoc.ts";
import { createTalk, type Talk } from "./talk.ts";
import { createCursors, type CursorView, type Cursors } from "./cursors.ts";
import { createCommentMarks } from "./commentmarks.ts";
import { textOf } from "./projectdoc.ts";
import type { Profile } from "./profile.ts";

export const LOADED = { load: true };

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

export interface EditingDeps {
  readonly link: { readonly room: string };
  readonly device: string;
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

export interface RoomDocs {
  readonly doc: Y.Doc;
  readonly chat: ChatDoc;
}

function withDestroy(
  parts: Omit<Editing, "destroy" | "talk">,
  talk: Talk,
  deps: Pick<EditingDeps, "editor" | "view">,
  doc: Y.Doc,
): Editing {
  const marks = createCommentMarks({
    doc,
    comments: talk.comments,
    editor: deps.editor,
    view: deps.view,
    cursors: parts.cursors,
  });
  return {
    ...parts,
    talk,
    destroy() {
      parts.binding.destroy();
      parts.swap?.close();
      marks.destroy();
      parts.cursors.destroy();
      talk.chat.destroy();
      talk.changes.destroy();
      talk.comments.destroy();
    },
  };
}

function activeText(
  doc: Y.Doc,
  project: ProjectHooks | null,
): () => Y.Text | null {
  if (!project) return () => doc.getText("t");
  return () => {
    const path = project.active();
    return path ? textOf(doc, path) : null;
  };
}

export function createEditing(
  deps: EditingDeps,
  docs: RoomDocs,
  fresh: boolean,
  transport: BlobTransport,
  send: (body: Uint8Array) => void,
): Editing {
  const { doc } = docs;
  const talk = createTalk(
    {
      room: deps.link.room,
      device: deps.device,
      project: deps.project !== null,
      active: activeText(doc, deps.project),
      profile: deps.profile,
    },
    doc,
    docs.chat,
  );
  if (deps.project)
    return withDestroy(
      createProjectEditing(deps, doc, deps.project, fresh, send, transport),
      talk,
      deps,
      doc,
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
  return withDestroy({ cursors, binding, swap: null }, talk, deps, doc);
}
