import { isProjectName, type InviteLink } from "./collabkey.ts";
import {
  roomById,
  roomOfSlot,
  withRoom,
  withoutRoom,
  type RoomEntry,
} from "./collabrooms.ts";
import { HOME_SCREEN_MESSAGE, JOIN_NAME, NO_SLOT } from "./collabmessages.ts";
import type { CollabDeps } from "./collabtypes.ts";
import { needsHomeScreen } from "./device.ts";
import type { Registry } from "./registry.ts";
import { invitedUid, parseSlot, projectSlot, slotKey } from "./roomslot.ts";

export function joinRoom(
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
    deps.notify(NO_SLOT);
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

export function openProjectRoom(
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
