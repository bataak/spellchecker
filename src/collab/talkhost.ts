import type { Collab, TalkKind } from "./collab.ts";
import type { Talk } from "./talk.ts";
import {
  buildViews,
  type RevealDeps,
  type Side,
  type Views,
} from "./talkparts.ts";
import { projectSide } from "./talkproject.ts";
import { fileWindow, type WindowDeps } from "./talkwindow.ts";

export interface TalkHostDeps extends RevealDeps, WindowDeps {
  readonly collab: Pick<Collab, "talk" | "onTalk">;
}

export function initTalk(deps: TalkHostDeps): void {
  const sides: Record<TalkKind, Side | null> = {
    project: projectSide(deps.editor),
    file: fileWindow(deps),
  };
  const built = new Map<Talk, Views>();
  const sync = (): void => {
    const live = new Set<Talk>();
    for (const kind of ["project", "file"] as const) {
      const talk = deps.collab.talk(kind);
      let views: Views | null = null;
      if (talk) {
        live.add(talk);
        views = built.get(talk) ?? buildViews(talk, deps);
        built.set(talk, views);
      }
      sides[kind]?.sync(views);
    }
    for (const [talk, views] of built)
      if (!live.has(talk)) {
        views.destroy();
        built.delete(talk);
      }
  };
  deps.collab.onTalk(sync);
  sync();
}
