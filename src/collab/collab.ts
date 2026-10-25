import { KEYS, readJson, writeJson } from "../core/store.ts";
import { createEmitter, type Emitter } from "../core/emitter.ts";
import { onSwap, swapOrigin, type SwapOrigin } from "../editor/editortext.ts";
import { parseLink } from "./collabkey.ts";
import {
  parseRooms,
  roomById,
  roomOfSlot,
  withAccess,
  withRoom,
  withoutRoom,
  type RoomEntry,
} from "./collabrooms.ts";
import { IDLE_LABEL, JOIN_NAME } from "./collabmessages.ts";
import type { Collab, CollabDeps, TalkKind } from "./collabtypes.ts";
import { createRegistry, ENDPOINT, type Registry } from "./registry.ts";
import { arrived, joinRoom, openProjectRoom, resumeJoins } from "./roomjoin.ts";
import { parseSlot, projectSlot, slotKey } from "./roomslot.ts";
import type { SessionStatus } from "./sessiontypes.ts";
import { openShare } from "./sharedialog.ts";
import type { SignalState } from "./signal.ts";
import type { Talk } from "./talk.ts";

export type {
  Collab,
  CollabDeps,
  CollabProject,
  TalkKind,
} from "./collabtypes.ts";
export { arrived, resumeJoins } from "./roomjoin.ts";
export { shareUrl } from "./sharedialog.ts";

const WIPES: ReadonlySet<SignalState> = new Set(["wiped", "purged"]);

export function joinName(
  file: string | null,
  tex: boolean,
  markdown: boolean,
): string {
  if (file) return file;
  return JOIN_NAME + (tex ? ".tex" : markdown ? ".md" : ".txt");
}

export function buttonLabel(
  shared: boolean,
  status: SessionStatus | null,
): string {
  if (!shared) return IDLE_LABEL;
  if (status?.signal === "full") return "Хамтрагч · дүүрсэн";
  if (status?.peers) return "Хамтрагч " + (status.peers + 1);
  return IDLE_LABEL;
}

function paintButton(
  button: HTMLButtonElement,
  entry: RoomEntry | null,
  registry: Registry,
  talks: Emitter,
): void {
  talks.emit();
  button.textContent = buttonLabel(
    entry !== null,
    entry ? registry.status(entry.room) : null,
  );
  button.setAttribute("aria-pressed", entry ? "true" : "false");
}

const DISABLED: Collab = {
  start: () => {},
  forget: () => false,
  projectChanged: () => {},
  talk: () => null,
  onTalk: () => {},
};

function talkOf(
  kind: TalkKind,
  rooms: readonly RoomEntry[],
  deps: CollabDeps,
  registry: Pick<Registry, "live">,
): Talk | null {
  const entry =
    kind === "project"
      ? projectRoom(rooms, deps)
      : roomOfSlot(rooms, deps.slot());
  if (!entry || parseSlot(entry.slot).kind !== kind) return null;
  return registry.live(entry.room)?.talk ?? null;
}

interface Triggers {
  swapped(origin: SwapOrigin): void;
  edited(): void;
  share(): void;
  hash(): void;
}

function bindTriggers(
  button: HTMLButtonElement,
  editor: HTMLTextAreaElement,
  on: Triggers,
): void {
  onSwap(on.swapped);
  editor.addEventListener("input", (event) => {
    if (swapOrigin(event) !== null) on.edited();
  });
  button.addEventListener("click", on.share);
  window.addEventListener("hashchange", on.hash);
}

function inProjectRoom(
  rooms: readonly RoomEntry[],
  active: string | null,
): boolean {
  const slot = active ? roomById(rooms, active)?.slot : undefined;
  return !!slot && parseSlot(slot).kind === "project";
}

function projectRoom(
  rooms: readonly RoomEntry[],
  deps: CollabDeps,
): RoomEntry | null {
  const uid = deps.project?.uid();
  return uid ? roomOfSlot(rooms, projectSlot(uid)) : null;
}

export function initCollab(deps: CollabDeps): Collab {
  const { button, editor } = deps;
  if (!ENDPOINT || !button || typeof RTCPeerConnection === "undefined")
    return DISABLED;

  let rooms = parseRooms(readJson(KEYS.collabRooms));
  let active: string | null = null;
  let started = false;

  const save = (next: RoomEntry[]): void => {
    rooms = next;
    writeJson(KEYS.collabRooms, rooms);
  };

  const talks = createEmitter();
  const paint = (): void =>
    paintButton(button, roomOfSlot(rooms, deps.slot()), registry, talks);

  const registry = createRegistry(editor, deps.view, {
    project: deps.project,
    changed: () => paint(),
    notify: deps.notify,
    access: (room) => roomById(rooms, room)?.access ?? null,
    granted(room, token) {
      save(withAccess(rooms, room, { kind: "m", token }));
    },
    ended: (room, state) => {
      const entry = roomById(rooms, room);
      if (entry && !(WIPES.has(state) && deps.wipe(parseSlot(entry.slot))))
        stop(entry);
    },
  });

  const detach = (): void => {
    if (active) registry.live(active)?.detach();
    active = null;
  };

  const sync = (seed = false): void => {
    const entry = roomOfSlot(rooms, deps.slot());
    if (!entry) detach();
    else if (active !== entry.room || !registry.live(entry.room)) {
      detach();
      active = entry.room;
      void registry.open(entry, seed).then((live) => {
        if (active === entry.room && slotKey(deps.slot()) === entry.slot)
          live.attach();
      });
    }
    openProjectRoom(registry, projectRoom(rooms, deps));
    const next = arrived(rooms, deps.project?.uid() ?? null);
    if (next) save(next);
    paint();
  };

  const stop = (entry: RoomEntry): void => {
    if (active === entry.room) detach();
    save(withoutRoom(rooms, entry.room));
    registry.close(entry.room);
    paint();
  };

  const takeHash = (): void => {
    const link = parseLink(location.hash);
    if (!link) return;
    history.replaceState(null, "", location.pathname + location.search);
    const next = joinRoom(rooms, link, deps);
    if (!next) return;
    save(next);
    sync();
    openProjectRoom(registry, roomById(rooms, link.room));
  };

  const share = (): void =>
    openShare(rooms, deps, registry, stop, (draft) => {
      save(withRoom(rooms, draft));
      sync(true);
    });

  const whenStarted = (run: () => void) => (): void => {
    if (started) run();
  };
  bindTriggers(button, editor, {
    swapped(origin) {
      if (origin !== "project" || !inProjectRoom(rooms, active)) detach();
    },
    edited: whenStarted(() => sync()),
    share,
    hash: whenStarted(takeHash),
  });
  button.hidden = false;
  paint();

  return {
    start() {
      if (started) return;
      started = true;
      sync();
      resumeJoins(rooms, deps, registry, stop);
      takeHash();
    },
    forget(slot) {
      const entry = roomOfSlot(rooms, slot);
      if (entry) stop(entry);
      return entry !== null;
    },
    projectChanged: whenStarted(() => sync()),
    talk: (kind) => talkOf(kind, rooms, deps, registry),
    onTalk: (listener) => void talks.on(listener),
  };
}
