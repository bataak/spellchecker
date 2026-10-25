import * as Y from "yjs";
import { loadDoc } from "./docstore.ts";
import { bindText } from "./textbind.ts";
import {
  createProjectEditing,
  seedProjectDoc,
  type ProjectHooks,
} from "./projectsession.ts";
import {
  createCursors,
  type CursorView,
  type Cursors,
  type Profile,
} from "./cursors.ts";

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
  const doc = new Y.Doc();
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
  readonly editor: HTMLTextAreaElement;
  readonly view: CursorView;
  readonly profile: () => Profile;
  readonly project: ProjectHooks | null;
}

export function createEditing(
  deps: EditingDeps,
  doc: Y.Doc,
  fresh: boolean,
  send: (body: Uint8Array) => void,
): { cursors: Cursors; binding: Attacher } {
  if (deps.project)
    return createProjectEditing(deps, doc, deps.project, fresh, send);
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
  return { cursors, binding };
}
