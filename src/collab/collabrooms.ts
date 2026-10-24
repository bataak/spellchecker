import { TOKEN, type CollabLink } from "./collabkey.ts";

export type AccessKind = "o" | "m" | "i";

export interface Access {
  readonly kind: AccessKind;
  readonly token: string;
}

export interface RoomEntry extends CollabLink {
  readonly slot: string;
  readonly access: Access;
}

const ID = /^[A-Za-z0-9_-]+$/;

function parseAccess(value: unknown): Access | null {
  if (!value || typeof value !== "object") return null;
  const { kind, token } = value as Record<string, unknown>;
  if (kind !== "o" && kind !== "m" && kind !== "i") return null;
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  return { kind, token };
}

export function parseRooms(value: unknown): RoomEntry[] {
  if (!Array.isArray(value)) return [];
  const out: RoomEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { slot, room, key, access } = item as Record<string, unknown>;
    if (typeof slot !== "string" || slot === "") continue;
    if (typeof room !== "string" || !ID.test(room)) continue;
    if (typeof key !== "string" || !ID.test(key)) continue;
    const parsed = parseAccess(access);
    if (!parsed) continue;
    if (out.some((entry) => entry.slot === slot || entry.room === room))
      continue;
    out.push({ slot, room, key, access: parsed });
  }
  return out;
}

export function isOwner(entry: RoomEntry): boolean {
  return entry.access.kind === "o";
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

export function withAccess(
  rooms: readonly RoomEntry[],
  room: string,
  access: Access,
): RoomEntry[] {
  return rooms.map((entry) =>
    entry.room === room ? { ...entry, access } : entry,
  );
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
