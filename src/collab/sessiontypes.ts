import type { Member } from "./admin.ts";
import type { CollabLink } from "./collabkey.ts";
import type { Access } from "./collabrooms.ts";
import type { CursorView } from "./cursors.ts";
import type { UploadNotice } from "./persistence.ts";
import type { Profile } from "./profile.ts";
import type { ProjectHooks } from "./projectsession.ts";
import type { SignalState } from "./signalwire.ts";
import type { Talk } from "./talk.ts";

export interface SessionStatus {
  readonly signal: SignalState;
  readonly peers: number;
}

export type SessionNotice = UploadNotice;

export interface SessionLink {
  readonly link: CollabLink & { readonly slot?: string };
  readonly endpoint: string;
  readonly device: string;
  readonly access: () => Access;
  readonly onAccess: (token: string) => void;
}

export interface SessionContent {
  readonly editor: HTMLTextAreaElement;
  readonly view: CursorView;
  readonly seed: (() => string) | null;
  readonly project: ProjectHooks | null;
  readonly profile: () => Profile;
}

export interface SessionEvents {
  readonly onStatus: (status: SessionStatus) => void;
  readonly onNotice: (notice: SessionNotice) => void;
}

export interface SessionDeps
  extends SessionLink, SessionContent, SessionEvents {}

export interface Session {
  readonly talk: Talk;
  profile(): Profile;
  attach(): void;
  detach(): void;
  announce(): void;
  sleep(): void;
  resume(): void;
  watch(listener: () => void): () => void;
  invite(): Promise<string | null>;
  members(): Promise<Member[] | null>;
  remove(dev: string, wipe: boolean): Promise<Member[] | null>;
  end(wipe: boolean): Promise<boolean>;
  stop(forget: boolean): Promise<void>;
}
