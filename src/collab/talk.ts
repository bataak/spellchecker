import type * as Y from "yjs";
import { createChat, type Chat } from "./chat.ts";
import type { ChatDoc } from "./chatdoc.ts";
import { registerAuthor } from "./changes.ts";
import { createChangeTracker, type ChangeTracker } from "./changetracker.ts";
import { authorKey, createComments, type Comments } from "./comments.ts";
import { textsOf } from "./projectdoc.ts";
import type { Profile } from "./profile.ts";

export interface TalkDeps {
  readonly room: string;
  readonly device: string;
  readonly project: boolean;
  readonly active: () => Y.Text | null;
  readonly profile: () => Profile;
}

export interface Talk {
  readonly chat: Chat;
  readonly changes: ChangeTracker;
  readonly comments: Comments;
  readonly project: boolean;
  announce(): void;
}

export function createTalk(deps: TalkDeps, doc: Y.Doc, chat: ChatDoc): Talk {
  const { project } = deps;
  const announce = (): void => registerAuthor(doc, deps.profile());
  const texts = (): ReadonlyMap<string | null, Y.Text> =>
    project ? textsOf(doc) : new Map([[null, doc.getText("t")]]);
  announce();
  return {
    chat: createChat(chat.doc, chat.mine, deps.profile),
    changes: createChangeTracker({ doc, room: deps.room, texts }),
    comments: createComments({
      doc,
      texts,
      active: deps.active,
      author: authorKey(deps.device, deps.room),
      profile: deps.profile,
    }),
    project,
    announce,
  };
}
