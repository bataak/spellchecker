export type RoomSlot =
  | { readonly kind: "file"; readonly id: string }
  | { readonly kind: "project"; readonly uid: string };

const PROJECT_PREFIX = "project:";
const INVITED_PREFIX = "c";

export function fileSlot(id: string): RoomSlot {
  return { kind: "file", id };
}

export function projectSlot(uid: string): RoomSlot {
  return { kind: "project", uid };
}

export function slotKey(slot: RoomSlot): string {
  return slot.kind === "project" ? PROJECT_PREFIX + slot.uid : slot.id;
}

export function parseSlot(key: string): RoomSlot {
  return key.startsWith(PROJECT_PREFIX)
    ? projectSlot(key.slice(PROJECT_PREFIX.length))
    : fileSlot(key);
}

export function invitedUid(room: string): string {
  return INVITED_PREFIX + room;
}
