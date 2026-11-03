import {
  ENDED_CODE,
  PURGED_CODE,
  REMOVED_CODE,
  TOKEN,
  WIPED_CODE,
} from "../../shared/protocol.ts";
import { MAX_INVITES } from "./limits.ts";
import type { Links } from "./links.ts";
import { clearContent } from "./roomstore.ts";
import { forget } from "./snapshots.ts";
import type { Peer } from "./types.ts";
import { digest, readMeta } from "./util.ts";

export interface RoomHost {
  readonly sql: SqlStorage;
  peers(): Peer[];
  send(ws: WebSocket, message: ArrayBuffer | object): void;
  evict(ws: WebSocket, code: number): void;
  links(): DurableObjectStub<Links> | null;
  dropLinks(): void;
  touch(): Promise<void>;
}

export async function invite(
  room: RoomHost,
  ws: WebSocket,
  token: unknown,
  name: unknown,
): Promise<void> {
  if (typeof token !== "string" || !TOKEN.test(token)) return;
  const hash = await digest(token);
  room.sql.exec(
    "INSERT OR IGNORE INTO invites (h, at, dev) VALUES (?, ?, NULL)",
    hash,
    Date.now(),
  );
  room.sql.exec(
    "DELETE FROM invites WHERE dev IS NULL AND h NOT IN (SELECT h FROM invites WHERE dev IS NULL ORDER BY at DESC LIMIT ?)",
    MAX_INVITES,
  );
  const links = room.links();
  const id = readMeta(room.sql, "room");
  const code =
    links && id
      ? await links.put(id, token, typeof name === "string" ? name : "")
      : null;
  room.send(
    ws,
    code ? { t: "invited", i: token, c: code } : { t: "invited", i: token },
  );
}

export function roster(room: RoomHost): object {
  const online = new Set(room.peers().map((peer) => peer.dev));
  const owner = readMeta(room.sql, "dev");
  const list: object[] = [];
  for (const row of room.sql.exec<{
    dev: string;
    label: string;
    at: number;
  }>("SELECT dev, label, at FROM members WHERE gone = 0 ORDER BY at"))
    list.push({
      dev: row.dev,
      l: row.label,
      at: row.at,
      on: online.has(row.dev),
      o: row.dev === owner,
    });
  return { t: "members", list };
}

export function removeMember(
  room: RoomHost,
  ws: WebSocket,
  dev: unknown,
  wipe: boolean,
): void {
  if (typeof dev !== "string" || dev === readMeta(room.sql, "dev")) return;
  room.sql.exec(
    "UPDATE members SET gone = ?, h = '', label = '' WHERE dev = ?",
    wipe ? 2 : 1,
    dev,
  );
  forget(room.sql, dev);
  const peers = room.peers();
  for (const peer of peers) {
    if (peer.dev !== dev) continue;
    room.evict(peer.ws, wipe ? PURGED_CODE : REMOVED_CODE);
    for (const other of peers)
      if (other.dev !== dev) room.send(other.ws, { t: "kick", id: peer.id });
  }
  room.send(ws, roster(room));
}

export function endRoom(
  room: RoomHost,
  ws: WebSocket,
  wipe: boolean,
): Promise<void> {
  clearContent(room.sql);
  room.sql.exec(
    "INSERT OR REPLACE INTO meta (k, v) VALUES ('closed', ?)",
    String(wipe ? WIPED_CODE : ENDED_CODE),
  );
  room.dropLinks();
  room.send(ws, { t: "ended" });
  for (const peer of room.peers()) {
    if (peer.ws !== ws) room.evict(peer.ws, wipe ? WIPED_CODE : ENDED_CODE);
    else {
      peer.ws.serializeAttachment(null);
      peer.ws.close(1000, "ended");
    }
  }
  return room.touch();
}
