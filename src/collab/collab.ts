import { KEYS, readJson, writeJson } from "../core/store.ts";
import { createEmitter, type Emitter } from "../core/emitter.ts";
import { onSwap, swapOrigin, type SwapOrigin } from "../editor/editortext.ts";
import { parseLink, parseShort, type InviteLink } from "./collabkey.ts";
import { offerInvite, pasteInvite } from "./invitepaste.ts";
import { resolveShort } from "./shortlink.ts";
import {
  isOwner,
  parseRooms,
  roomById,
  roomOfSlot,
  withAccess,
  withRoom,
  withoutRoom,
  type RoomEntry,
} from "./collabrooms.ts";
import {
  BUSY_MESSAGE,
  IDLE_LABEL,
  JOIN_NAME,
  SHORT_GONE,
} from "./collabmessages.ts";
import type { Collab, CollabDeps, TalkKind } from "./collabtypes.ts";
import { cleanName } from "./safetext.ts";
import { askClearShared } from "./clearask.ts";
import { OFFLINE } from "./dialogparts.ts";
import { createRegistry, ENDPOINT, type Registry } from "./registry.ts";
import { arrived, joinRoom, openProjectRoom, resumeJoins } from "./roomjoin.ts";
import { parseSlot, projectSlot, slotKey, type RoomSlot } from "./roomslot.ts";
import type { SessionStatus } from "./sessiontypes.ts";
import { openShare } from "./sharedialog.ts";
import type { SignalState } from "./signalwire.ts";
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
  if (file) return cleanName(file, file.length);
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
  freeze: (wait: boolean) => void,
): void {
  freeze(!!entry && registry.busy(entry.room));
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
  clearShared: () => true,
  projectChanged: () => {},
  talk: () => null,
  onTalk: () => {},
  locked: () => false,
  invite: async () => false,
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
  editor.addEventListener("paste", (event) => pasteInvite(editor, event));
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

function stopIf(
  entry: RoomEntry | null,
  stop: (entry: RoomEntry) => void,
): boolean {
  if (entry) stop(entry);
  return entry !== null;
}

function clearOwned(
  entry: RoomEntry | null,
  registry: Pick<Registry, "open">,
  notify: (message: string) => void,
  stop: (entry: RoomEntry) => void,
): boolean | Promise<boolean> {
  if (!entry || !isOwner(entry)) return true;
  return endShared(entry, registry, notify, stop);
}

function endedSet(stop: (entry: RoomEntry) => void): {
  stop(entry: RoomEntry): void;
  take(slot: RoomSlot): boolean;
} {
  const slots = new Set<string>();
  return {
    stop(entry) {
      slots.add(entry.slot);
      stop(entry);
    },
    take: (slot) => slots.delete(slotKey(slot)),
  };
}

async function endShared(
  entry: RoomEntry,
  registry: Pick<Registry, "open">,
  notify: (message: string) => void,
  stop: (entry: RoomEntry) => void,
): Promise<boolean> {
  const live = await registry.open(entry, false).catch(() => null);
  const members = live ? await live.members().catch(() => null) : null;
  if (members && !members.some((member) => !member.owner)) return true;
  const choice = await askClearShared();
  if (choice === null) return false;
  if (!live || !(await live.end(choice === "wipe"))) {
    notify(OFFLINE);
    return false;
  }
  stop(entry);
  return true;
}

function collabAvailable(
  button: HTMLButtonElement | null,
): button is HTMLButtonElement {
  const available =
    ENDPOINT !== "" &&
    button !== null &&
    typeof RTCPeerConnection !== "undefined";
  if (button && !available) button.hidden = true;
  return available;
}

function readHash(
  notify: (message: string) => void,
  join: (link: InviteLink) => void,
): void {
  const short = parseShort(location.hash);
  const link = short ? null : parseLink(location.hash);
  if (!short && !link) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (link) return join(link);
  void resolveShort(ENDPOINT, short!).then((found) =>
    found ? join(found) : notify(SHORT_GONE),
  );
}

interface Freezer {
  (wait: boolean): void;
  readonly frozen: () => boolean;
}

function freezer(deps: CollabDeps): Freezer {
  let frozen = false;
  const freeze = (wait: boolean): void => {
    if (wait === frozen) return;
    frozen = wait;
    deps.editor.readOnly = wait;
    deps.pin?.(wait ? BUSY_MESSAGE : null);
  };
  return Object.assign(freeze, { frozen: () => frozen });
}

function painter(deps: CollabDeps, button: HTMLButtonElement, talks: Emitter) {
  const freeze = freezer(deps);
  const paint = (entry: RoomEntry | null, registry: Registry): void =>
    paintButton(button, entry, registry, talks, freeze);
  return Object.assign(paint, { frozen: freeze.frozen });
}

export function initCollab(deps: CollabDeps): Collab {
  const { button, editor } = deps;
  if (!collabAvailable(button)) return DISABLED;

  let rooms = parseRooms(readJson(KEYS.collabRooms));
  let active: string | null = null;
  let started = false;

  const save = (next: RoomEntry[]): void => {
    rooms = next;
    writeJson(KEYS.collabRooms, rooms);
  };

  const talks = createEmitter();
  const paintRoom = painter(deps, button, talks);
  const paint = (): void => paintRoom(roomOfSlot(rooms, deps.slot()), registry);

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

  const ended = endedSet(stop);
  const joinLink = (link: InviteLink): void => {
    const next = joinRoom(rooms, link, deps);
    if (!next) return;
    save(next);
    sync();
    openProjectRoom(registry, roomById(rooms, link.room));
  };
  const takeHash = (): void => readHash(deps.notify, joinLink);

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
    forget: (slot) => stopIf(roomOfSlot(rooms, slot), stop) || ended.take(slot),
    clearShared: (slot) =>
      clearOwned(roomOfSlot(rooms, slot), registry, deps.notify, ended.stop),
    projectChanged: whenStarted(() => sync()),
    talk: (kind) => talkOf(kind, rooms, deps, registry),
    onTalk: (listener) => void talks.on(listener),
    locked: paintRoom.frozen,
    invite: offerInvite,
  };
}
