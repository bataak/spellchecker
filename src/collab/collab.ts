import { KEYS, read, readJson, write, writeJson } from "../core/store.ts";
import { noteError } from "../core/errorlog.ts";
import { createEmitter, type Emitter } from "../core/emitter.ts";
import { onSwap, swapOrigin, type SwapOrigin } from "../editor/editortext.ts";
import {
  linkHash,
  newLink,
  newToken,
  isProjectName,
  parseLink,
  randomId,
  type InviteLink,
} from "./collabkey.ts";
import {
  isOwner,
  parseRooms,
  roomById,
  roomOfSlot,
  withAccess,
  withRoom,
  withoutRoom,
  type Access,
  type RoomEntry,
} from "./collabrooms.ts";
import type { Session, SessionNotice, SessionStatus } from "./session.ts";
import type { ProjectHooks } from "./projectsession.ts";
import type { Talk } from "./roomdoc.ts";
import type { SignalState } from "./signal.ts";
import type { CursorView } from "./cursors.ts";
import { loadProfile, saveName } from "./profile.ts";
import { openDialog } from "./collabdialog.ts";
import { watchIdle } from "./idle.ts";
import {
  invitedUid,
  parseSlot,
  projectSlot,
  slotKey,
  type RoomSlot,
} from "./roomslot.ts";

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

const ENDPOINT = (import.meta.env.VITE_COLLAB_URL ?? "").replace(/\/+$/, "");
const JOIN_NAME = "Хамтын бичвэр";
const DEVICE = /^[A-Za-z0-9_-]{16}$/;
const IDLE_LABEL = "Хамтрах";
const FULL_MESSAGE =
  "Энэ бичвэрийг 8 хүн зэрэг засаж байгаа тул нэгдэх боломжгүй. Хэн нэгэн гарсны дараа дахин нээнэ үү.";
const ENDED: Partial<Record<SignalState, string>> = {
  denied:
    "Урилга хүчингүй эсвэл өөр хүн ашигласан байна. Үүсгэгчээс өөрт тань зориулсан шинэ урилга авна уу.",
  removed:
    "Үүсгэгч таныг хамтын засвараас хассан. Бичвэр энэ төхөөрөмж дээр хадгалагдаж үлдэнэ.",
  ended:
    "Үүсгэгч хуваалцахаа зогсоолоо. Бичвэрийн хуулбар энэ төхөөрөмж дээр үлдлээ.",
  wiped: "Үүсгэгч хуваалцахаа зогсоож, бичвэрийг устгалаа.",
  purged: "Үүсгэгч таныг хамтын засвараас хасаж, бичвэрийг устгалаа.",
};
const IDLE_MS = 30 * 60_000;
const HOME_SCREEN_MESSAGE =
  "iPhone, iPad дээр хамтын бичвэрийг удаан хадгалахын тулд Safari-гийн «Хуваалцах» цэснээс «Нүүр дэлгэцэнд нэмэх»-ийг сонгож аппыг суулгана уу. Эс бөгөөс 7 хоног нээгээгүй үед Safari бичвэрийг устгаж болно.";
const WIPES: ReadonlySet<SignalState> = new Set(["wiped", "purged"]);
const NOTICES: Record<SessionNotice, string> = {
  "too-large":
    "Бичвэр хэт том тул серверт хадгалагдсангүй. Шууд холбогдсон хүмүүстэй засвар үргэлжилнэ, харин дараа нэгдэх хүн сүүлийн хувилбарыг авахгүй.",
  "near-limit":
    "Хуваалцсан бичвэрийн засварын түүх серверийн 8 MB хязгаарт ойртож байна. Хязгаарт хүрвэл дараа нэгдэх хүн сүүлийн хувилбарыг авахгүй. Хуваалцахыг зогсоож дахин хуваалцвал түүх шинээр эхэлнэ.",
};

export function joinName(
  file: string | null,
  tex: boolean,
  markdown: boolean,
): string {
  if (file) return file;
  return JOIN_NAME + (tex ? ".tex" : markdown ? ".md" : ".txt");
}

export function shareUrl(link: InviteLink, base: string): string {
  return base.replace(/#.*$/, "") + linkHash(link);
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

function needsHomeScreen(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios =
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return (
    ios &&
    nav.standalone !== true &&
    !window.matchMedia?.("(display-mode: standalone)").matches
  );
}

function deviceId(): string {
  const stored = read(KEYS.collabDevice);
  if (stored && DEVICE.test(stored)) return stored;
  const id = randomId(12);
  write(KEYS.collabDevice, id);
  return id;
}

interface Registry {
  open(entry: RoomEntry, seed: boolean): Promise<Session>;
  live(room: string): Session | null;
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

function createRegistry(
  editor: HTMLTextAreaElement,
  view: CursorView,
  hooks: RegistryHooks,
): Registry {
  const { changed, notify } = hooks;
  const pending = new Map<string, Promise<Session>>();
  const ready = new Map<string, Session>();
  const statuses = new Map<string, SessionStatus>();
  const full = new Set<string>();
  const each = (run: (session: Session) => void): void => {
    for (const live of ready.values()) run(live);
  };
  watchIdle(
    IDLE_MS,
    () => each((live) => live.sleep()),
    () => each((live) => live.resume()),
  );
  return {
    open(entry, seed) {
      const known = pending.get(entry.room);
      if (known) return known;
      const target = parseSlot(entry.slot);
      const project =
        target.kind === "project"
          ? hooks.project?.hooks(target.uid, seed)
          : null;
      const created = import("./session.ts").then(({ startSession }) =>
        startSession({
          link: entry,
          endpoint: ENDPOINT,
          device: deviceId(),
          editor,
          view,
          profile: () => loadProfile(deviceId()),
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
      pending.set(entry.room, created);
      created.then(
        (live) => {
          ready.set(entry.room, live);
          changed();
        },
        (error: unknown) => {
          pending.delete(entry.room);
          noteError(error);
          notify("Хамтын засварыг эхлүүлж чадсангүй");
        },
      );
      return created;
    },
    live: (room) => ready.get(room) ?? null,
    each,
    status: (room) => statuses.get(room) ?? null,
    close(room) {
      const live = pending.get(room);
      pending.delete(room);
      ready.delete(room);
      statuses.delete(room);
      void live?.then((session) => session.stop(true)).catch(noteError);
    },
  };
}

function joinRoom(
  rooms: readonly RoomEntry[],
  link: InviteLink,
  deps: CollabDeps,
): RoomEntry[] | null {
  const known = roomById(rooms, link.room);
  if (known && deps.showSlot(parseSlot(known.slot))) return [...rooms];
  const rest = known ? withoutRoom(rooms, known.room) : rooms;
  if (link.name && isProjectName(link.name)) {
    const uid = invitedUid(link.room);
    const joining = link.name.slice(0, -1);
    if (!deps.project?.prepare(joining, uid)) return null;
    return withRoom(rest, {
      slot: slotKey(projectSlot(uid)),
      room: link.room,
      key: link.key,
      access: { kind: "i", token: link.invite },
      joining,
    });
  }
  if (!deps.openSlot(link.name ?? JOIN_NAME)) {
    deps.notify(
      "Шинэ файлын талбар нээх боломжгүй. Нэг файлаа хаагаад дахин оролдоно уу.",
    );
    return null;
  }
  if (needsHomeScreen()) deps.notify(HOME_SCREEN_MESSAGE);
  return withRoom(rest, {
    slot: slotKey(deps.slot()),
    room: link.room,
    key: link.key,
    access: { kind: "i", token: link.invite },
  });
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

function ownedRoom(slot: string): RoomEntry {
  return { slot, ...newLink(), access: { kind: "o", token: newToken() } };
}

function showDialog(
  entry: RoomEntry,
  registry: Registry,
  stop: () => void,
  begin: (() => void) | null,
  name: string | null,
): void {
  openDialog({
    owner: isOwner(entry),
    started: begin === null,
    session() {
      begin?.();
      begin = null;
      return registry.open(entry, false);
    },
    inviteUrl: (invite) =>
      shareUrl(
        { room: entry.room, key: entry.key, invite, ...(name && { name }) },
        location.href,
      ),
    name: loadProfile(deviceId()).name,
    tip: needsHomeScreen() ? HOME_SCREEN_MESSAGE : null,
    rename(name) {
      saveName(name);
      registry.each((live) => live.announce());
    },
    stop,
    async end(wipe) {
      const live = await registry.open(entry, false).catch(() => null);
      if (!live || !(await live.end(wipe))) return false;
      stop();
      return true;
    },
  });
}

function openShare(
  rooms: readonly RoomEntry[],
  deps: CollabDeps,
  registry: Registry,
  stop: (entry: RoomEntry) => void,
  adopt: (draft: RoomEntry) => void,
): void {
  const entry = roomOfSlot(rooms, deps.slot());
  const name = deps.shareName();
  if (entry) return showDialog(entry, registry, () => stop(entry), null, name);
  const reason = deps.blocked();
  if (reason) return deps.notify(reason);
  const draft = ownedRoom(slotKey(deps.slot()));
  showDialog(
    draft,
    registry,
    () => stop(draft),
    () => adopt(draft),
    name,
  );
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

function openProjectRoom(
  registry: Pick<Registry, "open">,
  entry: RoomEntry | null,
): void {
  if (entry && parseSlot(entry.slot).kind === "project")
    void registry.open(entry, false);
}

export function arrived(
  rooms: readonly RoomEntry[],
  uid: string | null,
): RoomEntry[] | null {
  const entry = uid ? roomOfSlot(rooms, projectSlot(uid)) : null;
  if (!entry?.joining) return null;
  const { joining: _done, ...rest } = entry;
  return withRoom(rooms, rest);
}

export function resumeJoins(
  rooms: readonly RoomEntry[],
  deps: CollabDeps,
  registry: Pick<Registry, "open">,
  drop: (entry: RoomEntry) => void,
): void {
  for (const entry of rooms) {
    const slot = parseSlot(entry.slot);
    if (!entry.joining || slot.kind !== "project") continue;
    if (deps.project?.uid() === slot.uid) continue;
    if (deps.project?.prepare(entry.joining, slot.uid))
      openProjectRoom(registry, entry);
    else drop(entry);
  }
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
