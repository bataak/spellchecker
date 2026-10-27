import { noteError } from "../core/errorlog.ts";
import type { Access, RoomEntry } from "./collabrooms.ts";
import {
  ENDED,
  FULL_MESSAGE,
  NOTICES,
  START_FAILED,
} from "./collabmessages.ts";
import type { CollabProject } from "./collabtypes.ts";
import type { CursorView } from "./cursors.ts";
import { deviceId, myProfile } from "./device.ts";
import { dropRoom } from "./docstore.ts";
import { lockRoom, tryLockRoom, type RoomLock } from "./roomlock.ts";
import { watchIdle } from "./idle.ts";
import { parseSlot } from "./roomslot.ts";
import type { Session, SessionStatus } from "./sessiontypes.ts";
import type { SignalState } from "./signalwire.ts";

export const ENDPOINT = (import.meta.env.VITE_COLLAB_URL ?? "").replace(
  /\/+$/,
  "",
);
const IDLE_MS = 30 * 60_000;

export interface Registry {
  open(entry: RoomEntry, seed: boolean): Promise<Session>;
  live(room: string): Session | null;
  busy(room: string): boolean;
  each(run: (session: Session) => void): void;
  status(room: string): SessionStatus | null;
  close(room: string): void;
}

interface RegistryHooks {
  readonly project: CollabProject | null;
  readonly changed: () => void;
  readonly notify: (message: string) => void;
  readonly access: (room: string) => Access | null;
  readonly granted: (room: string, token: string) => void;
  readonly ended: (room: string, state: SignalState) => void;
}

const CLOSED = new Error("room closed");

async function dropIdle(room: string): Promise<void> {
  const lock = await tryLockRoom(room);
  if (!lock) return;
  try {
    await dropRoom(room);
  } finally {
    lock.release();
  }
}

function startRoom(
  entry: RoomEntry,
  seed: boolean,
  editor: HTMLTextAreaElement,
  view: CursorView,
  hooks: RegistryHooks,
  full: Set<string>,
  statuses: Map<string, SessionStatus>,
): Promise<Session> {
  const { changed, notify } = hooks;
  const target = parseSlot(entry.slot);
  const project =
    target.kind === "project" ? hooks.project?.hooks(target.uid, seed) : null;
  return import("./session.ts").then(({ startSession }) =>
    startSession({
      link: entry,
      endpoint: ENDPOINT,
      device: deviceId(),
      editor,
      view,
      profile: myProfile,
      seed: seed && target.kind === "file" ? () => editor.value : null,
      project: project ?? null,
      access: () => hooks.access(entry.room) ?? entry.access,
      onAccess: (token) => hooks.granted(entry.room, token),
      onStatus: (status) => {
        if (status.signal === "full" && !full.has(entry.room)) {
          full.add(entry.room);
          notify(FULL_MESSAGE);
        }
        const ended = ENDED[status.signal];
        if (ended) {
          notify(ended);
          queueMicrotask(() => hooks.ended(entry.room, status.signal));
          return;
        }
        statuses.set(entry.room, status);
        changed();
      },
      onNotice: (notice) => notify(NOTICES[notice]),
    }),
  );
}

export function createRegistry(
  editor: HTMLTextAreaElement,
  view: CursorView,
  hooks: RegistryHooks,
): Registry {
  const { changed, notify } = hooks;
  const pending = new Map<string, Promise<Session>>();
  const ready = new Map<string, Session>();
  const statuses = new Map<string, SessionStatus>();
  const locks = new Map<string, RoomLock>();
  const waiting = new Set<string>();
  const full = new Set<string>();
  const each = (run: (session: Session) => void): void => {
    for (const live of ready.values()) run(live);
  };
  const release = (room: string): void => {
    locks.get(room)?.release();
    locks.delete(room);
  };
  watchIdle(
    IDLE_MS,
    () => each((live) => live.sleep()),
    () => each((live) => live.resume()),
  );
  const busy = (room: string): void => {
    waiting.add(room);
    changed();
  };
  return {
    open(entry, seed) {
      const known = pending.get(entry.room);
      if (known) return known;
      const created: Promise<Session> = lockRoom(entry.room, () =>
        busy(entry.room),
      ).then((lock) => {
        waiting.delete(entry.room);
        if (pending.get(entry.room) !== created) {
          lock.release();
          throw CLOSED;
        }
        locks.set(entry.room, lock);
        return startRoom(entry, seed, editor, view, hooks, full, statuses);
      });
      pending.set(entry.room, created);
      created.then(
        (live) => {
          ready.set(entry.room, live);
          changed();
        },
        (error: unknown) => {
          if (error === CLOSED) return;
          pending.delete(entry.room);
          release(entry.room);
          noteError(error);
          notify(START_FAILED);
        },
      );
      return created;
    },
    live: (room) => ready.get(room) ?? null,
    busy: (room) => waiting.has(room),
    each,
    status: (room) => statuses.get(room) ?? null,
    close(room) {
      const live = pending.get(room);
      const idle = !live || waiting.has(room);
      pending.delete(room);
      ready.delete(room);
      statuses.delete(room);
      waiting.delete(room);
      if (idle) {
        void dropIdle(room);
        return;
      }
      void live
        .then((session) => session.stop(true))
        .catch(noteError)
        .finally(() => release(room));
    },
  };
}
