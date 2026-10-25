import type * as Y from "yjs";
import { createChat, type Chat } from "./chat.ts";
import type { ChatDoc } from "./chatdoc.ts";
import { registerAuthor } from "./changes.ts";
import { createChangeTracker, type ChangeTracker } from "./changetracker.ts";
import { textsOf } from "./projectdoc.ts";
import type { Profile } from "./profile.ts";

export interface TalkDeps {
  readonly room: string;
  readonly project: boolean;
  readonly profile: () => Profile;
}

export interface Talk {
  readonly chat: Chat;
  readonly changes: ChangeTracker;
  readonly project: boolean;
  announce(): void;
}

export function createTalk(deps: TalkDeps, doc: Y.Doc, chat: ChatDoc): Talk {
  const { project } = deps;
  const announce = (): void => registerAuthor(doc, deps.profile());
  announce();
  return {
    chat: createChat(chat.doc, chat.mine, deps.profile),
    changes: createChangeTracker({
      doc,
      room: deps.room,
      texts: () =>
        project ? textsOf(doc) : new Map([[null, doc.getText("t")]]),
    }),
    project,
    announce,
  };
}
