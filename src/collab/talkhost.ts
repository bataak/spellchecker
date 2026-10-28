import { createEmitter } from "../core/emitter.ts";
import { onSwap } from "../editor/editortext.ts";
import type { Collab, TalkKind } from "./collab.ts";
import { clearedComments, keptComments } from "./commentbus.ts";
import { initCommentButton, type CommentTarget } from "./commentbutton.ts";
import { createCommentMarks } from "./commentmarks.ts";
import type { CursorView } from "./cursors.ts";
import {
  createLocalComments,
  type DocRef,
  type LocalComments,
  type NoteStore,
} from "./localcomments.ts";
import type { Profile } from "./profile.ts";
import type { Talk } from "./talk.ts";
import {
  buildViews,
  localViews,
  type RevealDeps,
  type Side,
  type Views,
} from "./talkparts.ts";
import { projectSide } from "./talkproject.ts";
import { fileWindow, type WindowDeps } from "./talkwindow.ts";

export interface TalkHostDeps extends RevealDeps, WindowDeps {
  readonly collab: Pick<Collab, "talk" | "onTalk">;
  readonly view: Pick<CursorView, "host" | "rangeRects">;
  readonly doc: () => DocRef | null;
  readonly profile: () => Profile;
  readonly notes: NoteStore;
  readonly picking: () => boolean;
}

export interface TalkHost {
  refresh(): void;
  discard(key: string): void;
}

const KINDS = ["file", "project"] as const;

function migrate(local: LocalComments, talk: Talk): void {
  if (talk.slot === null) return;
  void local.take(talk.slot, (threads) => talk.comments.adopt(threads));
}

export function initTalk(deps: TalkHostDeps): TalkHost {
  const sides: Record<TalkKind, Side | null> = {
    project: projectSide(deps.editor),
    file: fileWindow(deps),
  };
  const local = createLocalComments({
    editor: deps.editor,
    doc: deps.doc,
    profile: deps.profile,
    store: deps.notes,
  });
  const offline = localViews(local, deps);
  const built = new Map<Talk, Views>();
  const synced = createEmitter();
  const ownDoc = (kind: TalkKind): boolean => local.current()?.kind === kind;
  const localOn = (): boolean => {
    const ref = local.current();
    return ref !== null && !deps.collab.talk(ref.kind);
  };
  const sync = (): void => {
    local.sync();
    const live = new Set<Talk>();
    for (const kind of KINDS) {
      const talk = deps.collab.talk(kind);
      let views: Views | null = null;
      if (talk) {
        live.add(talk);
        views = built.get(talk) ?? null;
        if (!views) {
          views = buildViews(talk, deps);
          built.set(talk, views);
          migrate(local, talk);
        }
      } else if (ownDoc(kind)) views = offline;
      sides[kind]?.sync(views);
    }
    for (const [talk, views] of built)
      if (!live.has(talk)) {
        views.destroy();
        built.delete(talk);
      }
    synced.emit();
  };
  deps.collab.onTalk(sync);
  onSwap(() => queueMicrotask(sync));
  local.onChange(() => {
    for (const kind of KINDS)
      if (!deps.collab.talk(kind))
        sides[kind]?.sync(ownDoc(kind) ? offline : null);
  });
  keptComments.on(({ slot, threads }) => {
    if (slot !== null) void local.keep(slot, threads);
  });
  clearedComments.on(({ slot, leaving }) => local.clear(slot, leaving));
  sync();
  createCommentMarks({
    comments: local,
    editor: deps.editor,
    view: deps.view,
    active: localOn,
    refresh(listener) {
      deps.editor.addEventListener("input", listener);
      const off = local.onChange(listener);
      const offSync = synced.on(listener);
      return () => {
        off();
        offSync();
        deps.editor.removeEventListener("input", listener);
      };
    },
  });
  const recheck = initCommentButton({
    editor: deps.editor,
    view: deps.view,
    picking: deps.picking,
    target(): CommentTarget | null {
      const kind = local.current()?.kind;
      const side = kind ? sides[kind] : null;
      if (!kind || !side) return null;
      const talk = deps.collab.talk(kind);
      const views = talk ? built.get(talk) : offline;
      return views ? { views, open: () => side.open("comments") } : null;
    },
  });
  synced.on(recheck);
  local.onChange(recheck);

  return { refresh: sync, discard: local.discard };
}
