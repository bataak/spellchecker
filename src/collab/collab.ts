import { KEYS, read, readJson, write, writeJson } from "../core/store.ts";
import { noteError } from "../core/errorlog.ts";
import { onSwap, swapOrigin } from "../editor/editortext.ts";
import { copyText } from "../ui/clipboard.ts";
import {
  linkHash,
  newLink,
  parseLink,
  randomId,
  type CollabLink,
} from "./collabkey.ts";
import {
  parseRooms,
  roomById,
  roomOfSlot,
  withRoom,
  withoutRoom,
  type RoomEntry,
} from "./collabrooms.ts";
import type { Session, SessionStatus } from "./session.ts";

export interface CollabDeps {
  readonly editor: HTMLTextAreaElement;
  readonly button: HTMLButtonElement | null;
  readonly slot: () => string;
  readonly openSlot: (name: string) => boolean;
  readonly showSlot: (slot: string) => boolean;
  readonly blocked: () => string | null;
  readonly notify: (message: string) => void;
}

export interface Collab {
  start(): void;
  forget(slot: string): boolean;
}

const ENDPOINT = (import.meta.env.VITE_COLLAB_URL ?? "").replace(/\/+$/, "");
const JOIN_NAME = "Хамтын бичвэр";
const DEVICE = /^[A-Za-z0-9_-]{16}$/;
const IDLE_LABEL = "Хамтран засах";
const FULL_MESSAGE =
  "Энэ бичвэрийг 8 хүн зэрэг засаж байгаа тул нэгдэх боломжгүй. Хэн нэгэн гарсны дараа дахин нээнэ үү.";
const TOO_LARGE_MESSAGE =
  "Бичвэр хэт том тул серверт хадгалагдсангүй. Шууд холбогдсон хүмүүстэй засвар үргэлжилнэ, харин дараа нэгдэх хүн сүүлийн хувилбарыг авахгүй.";

export function shareUrl(link: CollabLink, base: string): string {
  return base.replace(/#.*$/, "") + linkHash(link);
}

export function buttonLabel(
  shared: boolean,
  status: SessionStatus | null,
): string {
  if (!shared) return IDLE_LABEL;
  if (status?.signal === "full") return "Хамтран · дүүрсэн";
  if (status?.peers) return "Хамтран · " + (status.peers + 1);
  return status?.signal === "open" ? "Хамтран · 1" : "Хамтран · …";
}

function deviceId(): string {
  const stored = read(KEYS.collabDevice);
  if (stored && DEVICE.test(stored)) return stored;
  const id = randomId(12);
  write(KEYS.collabDevice, id);
  return id;
}

function actionButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tbtn";
  button.textContent = label;
  return button;
}

function openDialog(url: string, stop: () => void): void {
  const dialog = document.createElement("dialog");
  dialog.className = "suggest-overlay collab-overlay";
  dialog.setAttribute("aria-labelledby", "collabTitle");
  const card = document.createElement("div");
  card.className = "suggest-card";
  const title = document.createElement("h2");
  title.id = "collabTitle";
  title.className = "suggest-title";
  title.textContent = "Хамтран засах";
  const hint = document.createElement("p");
  hint.className = "suggest-hint";
  hint.textContent =
    "Энэ холбоосыг нээсэн хүн уг бичвэрийг тантай зэрэг засна. Холбоос нууц түлхүүр агуулдаг тул зөвхөн итгэлтэй хүнтэйгээ хуваалцана уу. Сервер бичвэрийг уншиж чадахгүй.";
  const field = document.createElement("input");
  field.className = "collab-link";
  field.readOnly = true;
  field.value = url;
  const note = document.createElement("p");
  note.className = "suggest-note";
  note.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "suggest-actions";
  const leave = actionButton("Зогсоох");
  leave.classList.add("collab-stop");
  const copy = actionButton("Хуулах");
  copy.classList.add("suggest-send");
  const close = actionButton("Хаах");
  actions.append(leave, close, copy);
  if (typeof navigator.share === "function") {
    const share = actionButton("Илгээх");
    share.addEventListener("click", () => {
      navigator.share({ title: "Хамтын бичвэр", url }).catch(() => {});
    });
    actions.insertBefore(share, copy);
  }
  card.append(title, hint, field, note, actions);
  dialog.appendChild(card);
  copy.addEventListener("click", () => {
    copyText(url).then(
      () => {
        note.dataset.kind = "ok";
        note.textContent = "Холбоосыг хууллаа";
      },
      () => {
        field.select();
        note.dataset.kind = "err";
        note.textContent = "Хуулж чадсангүй, холбоосыг гараар хуулна уу";
      },
    );
  });
  leave.addEventListener("click", () => {
    if (
      !window.confirm(
        "Хамтын засварыг зогсоох уу? Бичвэр энэ төхөөрөмж дээр хадгалагдаж үлдэнэ.",
      )
    )
      return;
    stop();
    dialog.close();
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
  field.focus();
  field.select();
}

interface Registry {
  open(entry: RoomEntry, seed: boolean): Promise<Session>;
  live(room: string): Session | null;
  status(room: string): SessionStatus | null;
  close(room: string): void;
}

function createRegistry(
  editor: HTMLTextAreaElement,
  changed: () => void,
  notify: (message: string) => void,
): Registry {
  const pending = new Map<string, Promise<Session>>();
  const ready = new Map<string, Session>();
  const statuses = new Map<string, SessionStatus>();
  const full = new Set<string>();
  return {
    open(entry, seed) {
      const known = pending.get(entry.room);
      if (known) return known;
      const created = import("./session.ts").then(({ startSession }) =>
        startSession({
          link: entry,
          endpoint: ENDPOINT,
          device: deviceId(),
          editor,
          seed: seed ? () => editor.value : null,
          onStatus: (status) => {
            if (status.signal === "full" && !full.has(entry.room)) {
              full.add(entry.room);
              notify(FULL_MESSAGE);
            }
            statuses.set(entry.room, status);
            changed();
          },
          onNotice: () => notify(TOO_LARGE_MESSAGE),
        }),
      );
      pending.set(entry.room, created);
      created.then(
        (live) => ready.set(entry.room, live),
        (error: unknown) => {
          pending.delete(entry.room);
          noteError(error);
          notify("Хамтын засварыг эхлүүлж чадсангүй");
        },
      );
      return created;
    },
    live: (room) => ready.get(room) ?? null,
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
  link: CollabLink,
  deps: CollabDeps,
): RoomEntry[] | null {
  const known = roomById(rooms, link.room);
  if (known && deps.showSlot(known.slot)) return [...rooms];
  const rest = known ? withoutRoom(rooms, known.room) : rooms;
  if (!deps.openSlot(JOIN_NAME)) {
    deps.notify(
      "Шинэ файлын талбар нээх боломжгүй. Нэг файлаа хаагаад дахин оролдоно уу.",
    );
    return null;
  }
  return withRoom(rest, { slot: deps.slot(), ...link });
}

export function initCollab(deps: CollabDeps): Collab {
  const { button, editor } = deps;
  if (!ENDPOINT || !button || typeof RTCPeerConnection === "undefined")
    return { start: () => {}, forget: () => false };

  let rooms = parseRooms(readJson(KEYS.collabRooms));
  let active: string | null = null;
  let started = false;

  const store = (): boolean => writeJson(KEYS.collabRooms, rooms);

  const paint = (): void => {
    const entry = roomOfSlot(rooms, deps.slot());
    button.textContent = buttonLabel(
      entry !== null,
      entry ? registry.status(entry.room) : null,
    );
    button.setAttribute("aria-pressed", entry ? "true" : "false");
  };

  const registry = createRegistry(editor, () => paint(), deps.notify);

  const detach = (): void => {
    if (active) registry.live(active)?.detach();
    active = null;
  };

  const sync = (seed = false): void => {
    const entry = roomOfSlot(rooms, deps.slot());
    if (!entry) {
      detach();
      paint();
      return;
    }
    if (active === entry.room && registry.live(entry.room)) {
      paint();
      return;
    }
    detach();
    active = entry.room;
    void registry.open(entry, seed).then((live) => {
      if (active === entry.room && deps.slot() === entry.slot) live.attach();
    });
    paint();
  };

  const stop = (entry: RoomEntry): void => {
    if (active === entry.room) detach();
    rooms = withoutRoom(rooms, entry.room);
    store();
    registry.close(entry.room);
    paint();
  };

  const join = (link: CollabLink): void => {
    const next = joinRoom(rooms, link, deps);
    if (!next) return;
    rooms = next;
    store();
    sync();
  };

  const takeHash = (): void => {
    const link = parseLink(location.hash);
    if (!link) return;
    history.replaceState(null, "", location.pathname + location.search);
    join(link);
  };

  const share = (): void => {
    const current = roomOfSlot(rooms, deps.slot());
    if (current) {
      openDialog(shareUrl(current, location.href), () => stop(current));
      return;
    }
    const reason = deps.blocked();
    if (reason) {
      deps.notify(reason);
      return;
    }
    const entry = { slot: deps.slot(), ...newLink() };
    rooms = withRoom(rooms, entry);
    store();
    sync(true);
    openDialog(shareUrl(entry, location.href), () => stop(entry));
  };

  onSwap(detach);
  editor.addEventListener("input", (event) => {
    if (started && swapOrigin(event) !== null) sync();
  });
  button.addEventListener("click", share);
  window.addEventListener("hashchange", () => {
    if (started) takeHash();
  });
  button.hidden = false;
  paint();

  return {
    start() {
      if (started) return;
      started = true;
      sync();
      takeHash();
    },
    forget(slot) {
      const entry = roomOfSlot(rooms, slot);
      if (entry) stop(entry);
      return entry !== null;
    },
  };
}
