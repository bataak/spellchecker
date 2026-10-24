import type { CollabLink } from "./collabkey.ts";

export interface RoomEntry extends CollabLink {
  readonly slot: string;
}

const ID = /^[A-Za-z0-9_-]+$/;

export function parseRooms(value: unknown): RoomEntry[] {
  if (!Array.isArray(value)) return [];
  const out: RoomEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { slot, room, key } = item as Record<string, unknown>;
    if (typeof slot !== "string" || slot === "") continue;
    if (typeof room !== "string" || !ID.test(room)) continue;
    if (typeof key !== "string" || !ID.test(key)) continue;
    if (out.some((entry) => entry.slot === slot || entry.room === room))
      continue;
    out.push({ slot, room, key });
  }
  return out;
}

export function roomOfSlot(
  rooms: readonly RoomEntry[],
  slot: string,
): RoomEntry | null {
  return rooms.find((entry) => entry.slot === slot) ?? null;
}

export function roomById(
  rooms: readonly RoomEntry[],
  room: string,
): RoomEntry | null {
  return rooms.find((entry) => entry.room === room) ?? null;
}

export function withRoom(
  rooms: readonly RoomEntry[],
  entry: RoomEntry,
): RoomEntry[] {
  return [
    ...rooms.filter(
      (item) => item.slot !== entry.slot && item.room !== entry.room,
    ),
    entry,
  ];
}

export function withoutRoom(
  rooms: readonly RoomEntry[],
  room: string,
): RoomEntry[] {
  return rooms.filter((entry) => entry.room !== room);
}

export function keepRooms(
  rooms: readonly RoomEntry[],
  slots: ReadonlySet<string>,
): RoomEntry[] {
  return rooms.filter((entry) => slots.has(entry.slot));
}
