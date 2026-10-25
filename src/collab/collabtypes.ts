import type { CursorView } from "./cursors.ts";
import type { ProjectHooks } from "./projectsession.ts";
import type { RoomSlot } from "./roomslot.ts";
import type { Talk } from "./talk.ts";

export interface CollabDeps {
  readonly editor: HTMLTextAreaElement;
  readonly view: CursorView;
  readonly button: HTMLButtonElement | null;
  readonly slot: () => RoomSlot;
  readonly openSlot: (name: string) => boolean;
  readonly shareName: () => string | null;
  readonly showSlot: (slot: RoomSlot) => boolean;
  readonly blocked: () => string | null;
  readonly wipe: (slot: RoomSlot) => boolean;
  readonly notify: (message: string) => void;
  readonly project: CollabProject | null;
}

export interface CollabProject {
  readonly uid: () => string | null;
  readonly hooks: (uid: string, seed: boolean) => ProjectHooks;
  readonly prepare: (name: string, uid: string) => boolean;
}

export type TalkKind = "file" | "project";

export interface Collab {
  start(): void;
  forget(slot: RoomSlot): boolean;
  projectChanged(): void;
  talk(kind: TalkKind): Talk | null;
  onTalk(listener: () => void): void;
}
